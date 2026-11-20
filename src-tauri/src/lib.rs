mod files;
#[cfg(windows)]
mod ndi;

use std::collections::HashMap;
use tauri::Manager as _;

/// WebView settings shared by every FlowShow window (WebView2 needs them identical; tauri.conf.json sets the same
/// for the main window): output windows keep drawing and animating even when covered or out of sight.
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-component-update --disk-cache-size=33554432";

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
  use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};
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
    Some(w) => w,
    None => WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.trim_start_matches('/').into()))
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
      .map_err(|e| e.to_string())?,
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
  window.show().map_err(|e| e.to_string())?;
  // On the operator's own screen it takes the keyboard, so Esc closes it
  if focus.unwrap_or(false) {
    let _ = window.set_focus();
  }
  // Full screen on the monitor it now sits on
  if fullscreen {
    window.set_fullscreen(true).map_err(|e| e.to_string())?;
  }
  // Windows hands the keyboard to a window that has just appeared: give it back to FlowShow's main window,
  // so shortcuts (Ctrl+O, Space, Ctrl+1…) keep working without clicking the app first
  if !focus.unwrap_or(false) {
    if let Some(main) = app.get_webview_window("main") {
      let _ = main.set_focus();
    }
  }
  Ok(())
}

/// Close an output window (an NDI output that was switched off, or one being made again)
#[tauri::command]
fn close_output_window(app: tauri::AppHandle, label: String) {
  use tauri::Manager;
  // Only FlowShow's output windows, never the main window
  if label.starts_with("projector-") {
    if let Some(w) = app.get_webview_window(&label) {
      let _ = w.destroy();
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
      Ok(())
    })
    // Closing the main window quits FlowShow: every output (screens and NDI) closes with it
    .on_window_event(|window, event| {
      if window.label() == "main" {
        if let tauri::WindowEvent::CloseRequested { .. } = event {
          #[cfg(windows)]
          ndi::stop_all();
          window.app_handle().exit(0);
        }
      }
    })
    // Media stays on the computer: the screens load it from disk at http://media.localhost/<path>
    .register_asynchronous_uri_scheme_protocol("media", |_ctx, request, responder| {
      std::thread::spawn(move || responder.respond(files::serve_media(request)));
    })
    .invoke_handler(tauri::generate_handler![save_export, reveal_file, pick_media_file, open_output_window, close_output_window, ndi_info, ndi_peek, ndi_sources, ndi_snapshot, ndi_start, ndi_stop, ndi_status])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|_app, event| {
      // Close the NDI sources cleanly when FlowShow quits
      if let tauri::RunEvent::Exit = event {
        #[cfg(windows)]
        ndi::stop_all();
      }
    });
}
