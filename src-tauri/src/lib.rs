mod convert;
mod remote;
mod files;
#[cfg(windows)]
mod live;
#[cfg(windows)]
mod ndi;

use std::collections::HashMap;
use tauri::Manager as _;

/// WebView settings shared by every FlowShow window (WebView2 needs them identical; tauri.conf.json sets the same
/// for the main window): output windows keep drawing and animating even when covered or out of sight.
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-component-update --disk-cache-size=33554432";

/// FlowShow's own pages may use cameras (camera inputs), read files the user chose, list the computer's fonts,
/// see the layout of all the displays (to find the screens), read pasted words and play video,
/// without WebView2 asking "Allow this site…?". Only FlowShow's own addresses are allowed.
#[cfg(windows)]
fn allow_flowshow_permissions(window: &tauri::WebviewWindow) {
  let _ = window.with_webview(|webview| unsafe {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
      COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_AUTOPLAY, COREWEBVIEW2_PERMISSION_KIND_CAMERA,
      COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ, COREWEBVIEW2_PERMISSION_KIND_FILE_READ_WRITE,
      COREWEBVIEW2_PERMISSION_KIND_LOCAL_FONTS, COREWEBVIEW2_PERMISSION_KIND_WINDOW_MANAGEMENT, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
    };
    let Ok(core) = webview.controller().CoreWebView2() else { return };
    let mut token = 0i64;
    let _ = core.add_PermissionRequested(
      &webview2_com::PermissionRequestedEventHandler::create(Box::new(|_, args| {
        let Some(args) = args else { return Ok(()) };
        let mut uri = windows::core::PWSTR::null();
        args.Uri(&mut uri)?;
        let uri = webview2_com::take_pwstr(uri);
        let own = ["http://tauri.localhost", "https://tauri.localhost", "tauri://localhost", "http://localhost:", "http://127.0.0.1:"]
          .iter()
          .any(|p| uri.starts_with(p));
        let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
        args.PermissionKind(&mut kind)?;
        if own
          && (kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA
            || kind == COREWEBVIEW2_PERMISSION_KIND_FILE_READ_WRITE
            || kind == COREWEBVIEW2_PERMISSION_KIND_LOCAL_FONTS
            || kind == COREWEBVIEW2_PERMISSION_KIND_WINDOW_MANAGEMENT
            || kind == COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ
            || kind == COREWEBVIEW2_PERMISSION_KIND_AUTOPLAY)
        {
          args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
          // Remembered, so camera names can be listed later without switching a camera on first
          if let Ok(remember) = windows::core::Interface::cast::<webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2PermissionRequestedEventArgs3>(&args) {
            let _ = remember.SetSavesInProfile(true);
          }
        }
        Ok(())
      })),
      &mut token,
    );
  });
}

/// Whether each output window was made see-through
static TRANSPARENT_WINDOWS: std::sync::LazyLock<std::sync::Mutex<HashMap<String, bool>>> = std::sync::LazyLock::new(Default::default);

/// Open (or move) an output window: full screen on a monitor (HDMI…), or out of sight for NDI.
/// Position and size are in real screen pixels (as the monitor list reports them).
#[tauri::command]
async fn open_output_window(
  app: tauri::AppHandle,
  label: String,
  url: String,
  title: String,
  x: i32,
  y: i32,
  width: u32,
  height: u32,
  fullscreen: bool,
  transparent: bool,
  on_top: bool,
  skip_taskbar: Option<bool>,
  focus: Option<bool>,
) -> Result<(), String> {
  let skip_taskbar = skip_taskbar.unwrap_or(false);
  log::info!("open_output_window {label} {url} at {x},{y} {width}x{height} exists={}", { use tauri::Manager; app.get_webview_window(&label).is_some() });
  use tauri::{Manager, PhysicalPosition, PhysicalSize};
  // See-through or not is fixed when a window is made: a change needs a new window
  let remake = {
    let mut made = TRANSPARENT_WINDOWS.lock().unwrap();
    let remake = made.get(&label).is_some_and(|t| *t != transparent) && app.get_webview_window(&label).is_some();
    made.insert(label.clone(), transparent);
    remake
  };
  if remake {
    #[cfg(windows)]
    ndi::stop(&label);
    if let Some(w) = app.get_webview_window(&label) {
      // Wait until Windows has really closed it, then a little more for the WebView to let go
      let (tx, rx) = std::sync::mpsc::channel();
      w.on_window_event(move |e| {
        if let tauri::WindowEvent::Destroyed = e {
          let _ = tx.send(());
        }
      });
      let _ = w.destroy();
      let _ = rx.recv_timeout(std::time::Duration::from_secs(3));
      std::thread::sleep(std::time::Duration::from_millis(300));
    }
  }
  let window = match app.get_webview_window(&label) {
    Some(w) => {
      // Ready already (prepared, or opened before): only its address may need changing (e.g. ?operator=1)
      let same = OUTPUT_URLS.lock().unwrap().get(&label).is_some_and(|u| *u == url);
      if !same {
        log::info!("open_output_window {label}: changing address");
        if let Ok(mut current) = w.url() {
          let (path, query) = url.split_once('?').map(|(p, q)| (p, Some(q))).unwrap_or((url.as_str(), None));
          current.set_path(path);
          current.set_query(query);
          let r = w.navigate(current);
          log::info!("open_output_window {label}: address changed {:?}", r.err());
        }
        OUTPUT_URLS.lock().unwrap().insert(label.clone(), url.clone());
      }
      w
    }
    None => {
      OUTPUT_URLS.lock().unwrap().insert(label.clone(), url.clone());
      make_output_window(&app, &label, &url, &title, transparent, skip_taskbar)?
    }
  };
  // A new window gets its system handle a moment after it is made: wait for it (so NDI can capture it straight away)
  #[cfg(windows)]
  for _ in 0..60 {
    if window.hwnd().is_ok() {
      break;
    }
    std::thread::sleep(std::time::Duration::from_millis(50));
  }
  let _ = window.set_fullscreen(false);
  window.set_position(PhysicalPosition::new(x, y)).map_err(|e| e.to_string())?;
  window.set_size(PhysicalSize::new(width, height)).map_err(|e| e.to_string())?;
  window.set_always_on_top(on_top).map_err(|e| e.to_string())?;
  let _ = window.set_skip_taskbar(skip_taskbar);
  log::info!("open_output_window {label}: placed, showing");
  window.show().map_err(|e| e.to_string())?;
  log::info!("open_output_window {label}: shown");
  // On the operator's own screen it takes the keyboard, so Esc closes it
  if focus.unwrap_or(false) {
    let _ = window.set_focus();
  }
  // Full screen on the monitor it now sits on
  if fullscreen {
    window.set_fullscreen(true).map_err(|e| e.to_string())?;
  }
  // Keeping an output off the taskbar can take FlowShow's own button with it (they share it): put that back
  if skip_taskbar {
    if let Some(main) = app.get_webview_window("main") {
      let _ = main.set_skip_taskbar(false);
    }
  }
  // The page draws again (it draws nothing while hidden)
  let _ = window.eval("window.__flowshowShown = true; window.dispatchEvent(new Event('flowshow-output-shown'));");
  // Windows hands the keyboard to a window that has just appeared: give it back to FlowShow's main window,
  // so shortcuts (Ctrl+O, Space, Ctrl+1…) keep working without clicking the app first
  if !focus.unwrap_or(false) {
    if let Some(main) = app.get_webview_window("main") {
      let _ = main.set_focus();
    }
  }
  Ok(())
}

/// The address each output window has loaded (so a ready window is only sent somewhere else when it must)
static OUTPUT_URLS: std::sync::LazyLock<std::sync::Mutex<HashMap<String, String>>> = std::sync::LazyLock::new(Default::default);

/// Make an output window (hidden): black (or see-through for an NDI key), no frame, FlowShow's WebView settings
fn make_output_window(app: &tauri::AppHandle, label: &str, url: &str, title: &str, transparent: bool, skip_taskbar: bool) -> Result<tauri::WebviewWindow, String> {
  use tauri::{WebviewUrl, WebviewWindowBuilder};
  WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.trim_start_matches('/').into()))
    .title(title)
    .visible(false)
    .decorations(false)
    .resizable(false)
    .skip_taskbar(skip_taskbar)
    .focused(false)
    .shadow(false)
    .transparent(transparent)
    // Black behind the slides (see-through for a transparent NDI key), never the WebView's default white
    .background_color(tauri::window::Color(0, 0, 0, if transparent { 0 } else { 255 }))
    .additional_browser_args(BROWSER_ARGS)
    .build()
    .map_err(|e| e.to_string())
    .inspect(|w| {
      // Outputs can show cameras without asking
      #[cfg(windows)]
      allow_flowshow_permissions(w);
      // FlowShow's logo (it shares the taskbar button with the main window: never let it be blank)
      if let Some(icon) = app.default_window_icon().cloned() {
        let _ = w.set_icon(icon);
      }
    })
}

/// Get a screen output's window ready in the background (hidden), so launching it later is instant:
/// making a window and starting FlowShow in it takes a few seconds, showing a ready one doesn't
// async: a window must never be made on the main thread (a plain command runs there, and making a window from it
// deadlocks Windows' WebView: the whole app then waits forever, screens can't be listed and outputs don't open)
#[tauri::command]
async fn prepare_output_window(app: tauri::AppHandle, label: String, url: String, title: String) -> Result<(), String> {
  use tauri::Manager;
  if !label.starts_with("projector-") || app.get_webview_window(&label).is_some() {
    return Ok(());
  }
  TRANSPARENT_WINDOWS.lock().unwrap().insert(label.clone(), false);
  OUTPUT_URLS.lock().unwrap().insert(label.clone(), url.clone());
  // Not "kept off the taskbar" here: a hidden window isn't on it anyway, and asking Windows to remove one window's
  // taskbar button can take away FlowShow's own button (they share it). Showing it sets that as needed.
  make_output_window(&app, &label, &url, &format!("FlowShow - {title}"), false, false).map(|_| ())
}

/// Close an output window. keep: only hide it, ready for next time (screen outputs); otherwise it is destroyed
/// (an NDI output that was switched off, or one being made again)
#[tauri::command]
fn close_output_window(app: tauri::AppHandle, label: String, keep: Option<bool>) {
  use tauri::Manager;
  // Only FlowShow's output windows, never the main window
  if label.starts_with("projector-") {
    if let Some(w) = app.get_webview_window(&label) {
      if keep.unwrap_or(false) {
        let _ = w.set_fullscreen(false);
        let _ = w.hide();
        // While hidden the page draws nothing (no videos playing out of sight)
        let _ = w.eval("window.__flowshowShown = false; window.dispatchEvent(new Event('flowshow-output-hidden'));");
      } else {
        OUTPUT_URLS.lock().unwrap().remove(&label);
        let _ = w.destroy();
      }
    }
  }
}

/// Is NDI available on this computer (and where its runtime is)
#[tauri::command]
fn ndi_info() -> serde_json::Value {
  #[cfg(windows)]
  return serde_json::to_value(ndi::info()).unwrap_or_default();
  #[cfg(not(windows))]
  return serde_json::json!({ "available": false, "error": "NDI output is available on Windows for now." });
}

/// Start sending a FlowShow output window over NDI
#[tauri::command]
fn ndi_start(app: tauri::AppHandle, label: String, name: String, groups: Option<String>, fps: Option<u32>, alpha: Option<bool>) -> Result<(), String> {
  #[cfg(windows)]
  {
    use tauri::Manager;
    let window = app.get_webview_window(&label).ok_or_else(|| format!("the output window \"{label}\" isn't open"))?;
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    return ndi::start(&label, hwnd, &name, groups.as_deref().unwrap_or(""), fps.unwrap_or(30), alpha.unwrap_or(false));
  }
  #[cfg(not(windows))]
  {
    let _ = (app, label, name, groups, fps, alpha);
    Err("NDI output is available on Windows for now.".into())
  }
}

/// A quick look at what an NDI output is sending (size, brightness, how much is see-through)
#[tauri::command]
fn ndi_peek(label: String) -> Option<serde_json::Value> {
  #[cfg(windows)]
  return ndi::peek(&label);
  #[cfg(not(windows))]
  {
    let _ = label;
    None
  }
}

/// The NDI sources on the network (for NDI video backgrounds, and to check FlowShow's own outputs are seen)
#[tauri::command]
async fn ndi_sources(wait_ms: Option<u32>) -> Result<Vec<serde_json::Value>, String> {
  #[cfg(windows)]
  return ndi::sources(wait_ms.unwrap_or(3000).min(15000));
  #[cfg(not(windows))]
  {
    let _ = wait_ms;
    Ok(vec![])
  }
}

/// Save what an NDI output is sending as a picture in the temp folder; returns where it went
#[tauri::command]
fn ndi_snapshot(label: String) -> Result<String, String> {
  #[cfg(windows)]
  {
    let safe: String = label.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').collect();
    let path = std::env::temp_dir().join(format!("flowshow-ndi-{safe}.bmp"));
    ndi::snapshot(&label, &path.to_string_lossy())?;
    return Ok(path.to_string_lossy().into_owned());
  }
  #[cfg(not(windows))]
  {
    let _ = label;
    Err("NDI output is available on Windows for now.".into())
  }
}

/// Save an export (songs, templates, profile, backup) in Documents\FlowShow; returns where it went
#[tauri::command]
fn save_export(request: tauri::ipc::Request<'_>) -> Result<String, String> {
  files::save_export(&request)
}

/// A PowerPoint (or OpenDocument) presentation → PDF, made by PowerPoint or LibreOffice on this computer.
/// The file comes as raw bytes (its name in the "file-name" header); the PDF goes back as raw bytes.
/// async + a blocking thread: converting can take a while and must not hold up FlowShow.
#[tauri::command]
async fn convert_to_pdf(request: tauri::ipc::Request<'_>) -> Result<tauri::ipc::Response, String> {
  let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err("no file was sent".into()) };
  let name = request.headers().get("file-name").and_then(|v| v.to_str().ok()).map(files::percent_decode).unwrap_or_else(|| "slides.pptx".into());
  let bytes = bytes.clone();
  let pdf = tauri::async_runtime::spawn_blocking(move || convert::to_pdf(&name, &bytes)).await.map_err(|e| e.to_string())??;
  Ok(tauri::ipc::Response::new(pdf))
}

/// The phone remote: start it (address and PIN), stop it, see how it is, and tell it what FlowShow shows
#[tauri::command]
fn remote_start(app: tauri::AppHandle) -> Result<remote::Info, String> {
  remote::start(app)
}
#[tauri::command]
fn remote_stop() {
  remote::stop();
}
#[tauri::command]
fn remote_info() -> remote::Info {
  remote::info()
}
#[tauri::command]
fn remote_publish(kind: String, json: String) {
  remote::publish(&kind, &json);
}

/// Can PowerPoint files be imported here? "PowerPoint", "LibreOffice" or null (neither installed)
#[tauri::command]
async fn pdf_converter() -> Option<String> {
  tauri::async_runtime::spawn_blocking(|| convert::available().map(String::from)).await.ok().flatten()
}

/// Open a web page (https) in the user's browser, e.g. where to get LibreOffice
#[tauri::command]
fn open_web_page(url: String) -> Result<(), String> {
  convert::open_web_page(&url)
}

/// Show a saved file in File Explorer
#[tauri::command]
fn reveal_file(path: String) -> Result<(), String> {
  files::reveal(&path)
}

/// Choose a picture or video with the Windows dialog; FlowShow keeps only where it is (no copy)
#[tauri::command]
async fn pick_media_file(app: tauri::AppHandle, kind: Option<String>) -> Result<Option<String>, String> {
  #[cfg(windows)]
  {
    let owner = app.get_webview_window("main").and_then(|w| w.hwnd().ok()).map(|h| h.0 as isize);
    let kind = kind.unwrap_or_else(|| "media".into());
    return std::thread::spawn(move || files::pick_media(owner, &kind)).join().map_err(|_| "the file dialog stopped".to_string())?;
  }
  #[cfg(not(windows))]
  {
    let _ = (app, kind);
    Err("choosing media this way is on Windows for now".into())
  }
}

/// Choose a folder of pictures and videos for the Media tab (FlowShow reads it itself, so nothing asks for permission)
#[tauri::command]
async fn pick_media_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
  #[cfg(windows)]
  {
    let owner = app.get_webview_window("main").and_then(|w| w.hwnd().ok()).map(|h| h.0 as isize);
    return std::thread::spawn(move || files::pick_folder(owner)).join().map_err(|_| "the folder dialog stopped".to_string())?;
  }
  #[cfg(not(windows))]
  {
    let _ = app;
    Err("choosing folders this way is on Windows for now".into())
  }
}

/// The folders, pictures and videos in a media folder
#[tauri::command]
async fn list_media_folder(path: String) -> Result<Vec<serde_json::Value>, String> {
  files::list_media_folder(&path)
}

/// The address a window shows a live input from (kind "ndi" or "screen"; quality "low" for previews, else full)
#[tauri::command]
fn live_url(kind: String, id: String, quality: Option<String>) -> Result<String, String> {
  #[cfg(windows)]
  return live::url(&kind, &id, quality.as_deref() == Some("low"));
  #[cfg(not(windows))]
  {
    let _ = (kind, id, quality);
    Err("live inputs are on Windows for now".into())
  }
}

/// This computer's screens, for screen inputs
#[tauri::command]
fn live_screens() -> Vec<serde_json::Value> {
  #[cfg(windows)]
  return live::screens();
  #[cfg(not(windows))]
  return vec![];
}

/// Each live input being read: viewers, pictures made, problems
#[tauri::command]
fn live_status() -> Vec<serde_json::Value> {
  #[cfg(windows)]
  return live::status();
  #[cfg(not(windows))]
  return vec![];
}

/// Stop sending an output over NDI
#[tauri::command]
fn ndi_stop(label: String) {
  #[cfg(windows)]
  ndi::stop(&label);
  #[cfg(not(windows))]
  let _ = label;
}

/// Each NDI output: receivers connected, frames sent, picture size, problems
#[tauri::command]
fn ndi_status() -> HashMap<String, serde_json::Value> {
  #[cfg(windows)]
  return ndi::status().into_iter().map(|(k, v)| (k, serde_json::to_value(v).unwrap_or_default())).collect();
  #[cfg(not(windows))]
  return HashMap::new();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // No "Allow this site…?" boxes in FlowShow's own window (cameras, chosen files, fonts)
      #[cfg(windows)]
      if let Some(main) = app.get_webview_window("main") {
        allow_flowshow_permissions(&main);
      }
      // FlowShow's logo on its window (and so on the taskbar): set it ourselves, the window doesn't always get it
      if let (Some(main), Some(icon)) = (app.get_webview_window("main"), app.default_window_icon().cloned()) {
        let _ = main.set_icon(icon);
      } else {
        log::warn!("no window icon to set");
      }
      Ok(())
    })
    // Closing the main window quits FlowShow: every output (screens and NDI) closes with it
    .on_window_event(|window, event| {
      if window.label() == "main" {
        if let tauri::WindowEvent::CloseRequested { .. } = event {
          #[cfg(windows)]
          {
            ndi::stop_all();
            live::stop_all();
          }
          window.app_handle().exit(0);
        }
      }
    })
    // Media stays on the computer: the screens load it from disk at http://media.localhost/<path>
    .register_asynchronous_uri_scheme_protocol("media", |_ctx, request, responder| {
      std::thread::spawn(move || responder.respond(files::serve_media(request)));
    })
    .invoke_handler(tauri::generate_handler![
      save_export, reveal_file, pick_media_file, pick_media_folder, list_media_folder, open_output_window, close_output_window, prepare_output_window,
      ndi_info, ndi_peek, ndi_sources, ndi_snapshot, ndi_start, ndi_stop, ndi_status, live_url, live_screens, live_status,
      convert_to_pdf, open_web_page, pdf_converter, remote_start, remote_stop, remote_info, remote_publish
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|_app, event| {
      // Close the NDI sources cleanly when FlowShow quits
      if let tauri::RunEvent::Exit = event {
        #[cfg(windows)]
        {
          ndi::stop_all();
          live::stop_all();
        }
      }
    });
}
