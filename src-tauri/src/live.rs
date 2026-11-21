//! Live inputs FlowShow can show on its screens: NDI sources on the network and this computer's screens.
//!
//! Each input is read here (an NDI receiver, or Desktop Duplication of a screen), turned into JPEG pictures
//! (Windows Imaging Component) and streamed as MJPEG from a small server on this computer
//! (127.0.0.1 only, with a secret key in every address). FlowShow's windows show it in an <img>, so every screen,
//! the Design and Mix canvases and the Media tab can show the same input; it is read and encoded once,
//! however many windows show it. An input stops a few seconds after the last window stops showing it.
//! (Cameras and capture cards don't come through here: the windows open them themselves.)

use std::collections::hash_map::RandomState;
use std::collections::HashMap;
use std::hash::{BuildHasher, Hasher};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use windows::core::Interface;
use windows::Win32::Foundation::{E_FAIL, HMODULE};
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_UNKNOWN;
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D, D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT,
    D3D11_MAPPED_SUBRESOURCE, D3D11_MAP_READ, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
};
use windows::Win32::Graphics::Dxgi::{
    CreateDXGIFactory1, IDXGIAdapter, IDXGIAdapter1, IDXGIFactory1, IDXGIOutput, IDXGIOutput1, IDXGIResource, DXGI_ERROR_WAIT_TIMEOUT,
    DXGI_OUTDUPL_FRAME_INFO,
};
use windows::Win32::Graphics::Imaging::{
    CLSID_WICImagingFactory, GUID_ContainerFormatJpeg, GUID_WICPixelFormat24bppBGR, GUID_WICPixelFormat32bppBGRA, IWICBitmapSource,
    IWICImagingFactory, IWICPalette, WICBitmapDitherTypeNone, WICBitmapEncoderNoCache, WICBitmapInterpolationModeLinear,
    WICBitmapPaletteTypeCustom,
};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, STREAM_SEEK_CUR};

use crate::ndi;

// ─── The server: one address (port) per input ───

/// A key nobody else can guess (std's hasher keys come from the operating system's random numbers)
fn secret() -> String {
    let a = RandomState::new().build_hasher().finish();
    let b = RandomState::new().build_hasher().finish();
    format!("{a:016x}{b:016x}")
}
static KEY: OnceLock<String> = OnceLock::new();
fn key() -> &'static str {
    KEY.get_or_init(secret)
}

/// The port each input is served on (made when first asked for, kept while FlowShow runs)
static PORTS: OnceLock<Mutex<HashMap<String, u16>>> = OnceLock::new();

/// The address a window shows an input from (kind "ndi" or "screen"; `low` = the Media tab's small preview).
/// Each input has its own port: browsers open at most six connections to one address, and FlowShow's windows
/// share that limit, so one shared address would make screens wait behind previews.
pub fn url(kind: &str, id: &str, low: bool) -> Result<String, String> {
    if kind != "ndi" && kind != "screen" {
        return Err(format!("there is no live input of kind {kind}"));
    }
    if id.is_empty() {
        return Err("which input?".into());
    }
    let feed_key = format!("{kind}|{id}|{}", if low { "low" } else { "high" });
    let mut ports = PORTS.get_or_init(Default::default).lock().unwrap();
    let port = match ports.get(&feed_key) {
        Some(p) => *p,
        None => {
            let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| format!("couldn't start the input: {e}"))?;
            let port = listener.local_addr().map_err(|e| e.to_string())?.port();
            let (kind, id, fk) = (kind.to_string(), id.to_string(), feed_key.clone());
            thread::Builder::new()
                .name(format!("live {feed_key}"))
                .spawn(move || {
                    for conn in listener.incoming().flatten() {
                        let (kind, id, fk) = (kind.clone(), id.clone(), fk.clone());
                        let _ = thread::Builder::new().name("live-viewer".into()).spawn(move || {
                            let _ = serve(conn, &fk, &kind, &id, low);
                        });
                    }
                })
                .map_err(|e| e.to_string())?;
            ports.insert(feed_key, port);
            port
        }
    };
    Ok(format!("http://127.0.0.1:{port}/live?k={}", key()))
}

fn reply(conn: &mut TcpStream, status: &str) -> std::io::Result<()> {
    conn.write_all(format!("HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").as_bytes())
}

/// One window showing an input (the address must carry the key)
fn serve(mut conn: TcpStream, feed_key: &str, kind: &str, id: &str, low: bool) -> std::io::Result<()> {
    conn.set_read_timeout(Some(Duration::from_secs(5)))?;
    let _ = conn.set_nodelay(true);
    let mut head = Vec::with_capacity(1024);
    let mut chunk = [0u8; 1024];
    while !head.windows(4).any(|w| w == b"\r\n\r\n") {
        let n = conn.read(&mut chunk)?;
        if n == 0 || head.len() > 16 * 1024 {
            return Ok(());
        }
        head.extend_from_slice(&chunk[..n]);
    }
    let text = String::from_utf8_lossy(&head);
    let target = text.lines().next().and_then(|l| l.split_whitespace().nth(1)).unwrap_or("/").to_string();
    let query = target.split_once('?').map(|(_, q)| q).unwrap_or("");
    let given = query.split('&').filter_map(|p| p.split_once('=')).find(|(k, _)| *k == "k").map(|(_, v)| v);
    if given != Some(key()) {
        return reply(&mut conn, "403 Forbidden");
    }
    let id = id.to_string();
    let feed = if kind == "ndi" {
        acquire(feed_key, move |f| run_ndi(f, id, low))
    } else {
        acquire(feed_key, move |f| run_screen(f, id, low))
    };
    let result = stream_to(&mut conn, &feed);
    release(&feed);
    result
}

/// Send each new picture as it comes (MJPEG). The boundary follows each picture, so it shows at once.
/// A picture that hasn't changed is sent again every two seconds, so a closed window is noticed.
fn stream_to(conn: &mut TcpStream, feed: &Arc<Feed>) -> std::io::Result<()> {
    conn.set_write_timeout(Some(Duration::from_secs(5)))?;
    conn.write_all(
        b"HTTP/1.1 200 OK\r\nContent-Type: multipart/x-mixed-replace; boundary=flowshowframe\r\nCache-Control: no-cache, no-store\r\nPragma: no-cache\r\nConnection: close\r\n\r\n--flowshowframe\r\n",
    )?;
    let mut seen = 0u64;
    let send = |conn: &mut TcpStream, jpeg: &[u8]| -> std::io::Result<()> {
        conn.write_all(format!("Content-Type: image/jpeg\r\nContent-Length: {}\r\n\r\n", jpeg.len()).as_bytes())?;
        conn.write_all(jpeg)?;
        conn.write_all(b"\r\n--flowshowframe\r\n")?;
        conn.flush()
    };
    loop {
        match feed.wait_newer(seen, Duration::from_secs(2)) {
            Some((jpeg, seq)) => {
                seen = seq;
                send(conn, &jpeg)?;
            }
            None => {
                if !feed.running() {
                    return Ok(());
                }
                if let Some(jpeg) = feed.latest() {
                    send(conn, &jpeg)?;
                }
            }
        }
    }
}

// ─── One input, shared by every window showing it ───

struct FeedState {
    jpeg: Option<Arc<Vec<u8>>>,
    seq: u64,
    error: Option<String>,
}

struct Feed {
    key: String,
    state: Mutex<FeedState>,
    cv: Condvar,
    viewers: AtomicUsize,
    stop: AtomicBool,
}

impl Feed {
    fn running(&self) -> bool {
        !self.stop.load(Ordering::SeqCst)
    }
    fn publish(&self, jpeg: Vec<u8>) {
        let mut s = self.state.lock().unwrap();
        s.jpeg = Some(Arc::new(jpeg));
        s.seq += 1;
        s.error = None;
        drop(s);
        self.cv.notify_all();
    }
    fn problem(&self, e: String) {
        self.state.lock().unwrap().error = Some(e);
    }
    fn latest(&self) -> Option<Arc<Vec<u8>>> {
        self.state.lock().unwrap().jpeg.clone()
    }
    /// The next picture after `after`, waiting up to `timeout`
    fn wait_newer(&self, after: u64, timeout: Duration) -> Option<(Arc<Vec<u8>>, u64)> {
        let s = self.state.lock().unwrap();
        let (s, _) = self.cv.wait_timeout_while(s, timeout, |s| s.seq <= after && self.running()).unwrap();
        if s.seq > after {
            s.jpeg.clone().map(|j| (j, s.seq))
        } else {
            None
        }
    }
    /// Wait (while the input is still wanted)
    fn pause(&self, time: Duration) {
        let end = Instant::now() + time;
        while self.running() && Instant::now() < end {
            thread::sleep(Duration::from_millis(100));
        }
    }
}

static FEEDS: OnceLock<Mutex<HashMap<String, Arc<Feed>>>> = OnceLock::new();
fn feeds() -> &'static Mutex<HashMap<String, Arc<Feed>>> {
    FEEDS.get_or_init(Default::default)
}

/// The running input for `key`, or a new one started with `start`
fn acquire(key: &str, start: impl FnOnce(Arc<Feed>) + Send + 'static) -> Arc<Feed> {
    let mut map = feeds().lock().unwrap();
    if let Some(f) = map.get(key) {
        if f.running() {
            f.viewers.fetch_add(1, Ordering::SeqCst);
            return f.clone();
        }
    }
    let feed = Arc::new(Feed {
        key: key.to_string(),
        state: Mutex::new(FeedState { jpeg: None, seq: 0, error: None }),
        cv: Condvar::new(),
        viewers: AtomicUsize::new(1),
        stop: AtomicBool::new(false),
    });
    map.insert(key.to_string(), feed.clone());
    drop(map);
    let f = feed.clone();
    let _ = thread::Builder::new().name(format!("live {key}")).spawn(move || start(f));
    feed
}

/// A window stopped showing an input: when nobody has shown it for a few seconds, it stops
fn release(feed: &Arc<Feed>) {
    if feed.viewers.fetch_sub(1, Ordering::SeqCst) != 1 {
        return;
    }
    let feed = feed.clone();
    let _ = thread::Builder::new().name("live-release".into()).spawn(move || {
        thread::sleep(Duration::from_secs(4));
        let mut map = feeds().lock().unwrap();
        if feed.viewers.load(Ordering::SeqCst) == 0 {
            feed.stop.store(true, Ordering::SeqCst);
            feed.cv.notify_all();
            if map.get(&feed.key).is_some_and(|f| Arc::ptr_eq(f, &feed)) {
                map.remove(&feed.key);
            }
        }
    });
}

/// Stop every input (FlowShow is closing)
pub fn stop_all() {
    for f in feeds().lock().unwrap().drain().map(|(_, f)| f) {
        f.stop.store(true, Ordering::SeqCst);
        f.cv.notify_all();
    }
}

/// What each running input is doing: pictures made so far, and any problem
pub fn status() -> Vec<serde_json::Value> {
    feeds()
        .lock()
        .unwrap()
        .values()
        .map(|f| {
            let s = f.state.lock().unwrap();
            serde_json::json!({ "key": f.key, "viewers": f.viewers.load(Ordering::SeqCst), "pictures": s.seq, "error": s.error })
        })
        .collect()
}

/// Smaller and fewer pictures for the Media tab's previews (about 10 a second); full size for the screens.
/// The full-size limit (about 45 a second) is well above 30 fps sources' frame interval, so normal timing
/// jitter never makes it skip every other frame.
fn limits(low: bool) -> (u32, u32, Duration) {
    if low {
        (640, 360, Duration::from_millis(90))
    } else {
        (1920, 1080, Duration::from_millis(22))
    }
}

// ─── Making JPEGs (Windows Imaging Component) ───

struct Jpeg {
    factory: IWICImagingFactory,
}

impl Jpeg {
    fn new() -> windows::core::Result<Self> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            Ok(Self { factory: CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)? })
        }
    }

    /// BGRA (or BGRX) pixels → a JPEG, shrunk to fit within max_w × max_h
    fn encode(&self, w: u32, h: u32, stride: u32, pixels: &[u8], max_w: u32, max_h: u32) -> windows::core::Result<Vec<u8>> {
        unsafe {
            let bitmap = self.factory.CreateBitmapFromMemory(w, h, &GUID_WICPixelFormat32bppBGRA, stride, pixels)?;
            let (mut ow, mut oh) = (w, h);
            if w > max_w || h > max_h {
                let s = (max_w as f64 / w as f64).min(max_h as f64 / h as f64);
                ow = ((w as f64 * s).round() as u32).max(2);
                oh = ((h as f64 * s).round() as u32).max(2);
            }
            let source: IWICBitmapSource = if (ow, oh) != (w, h) {
                let scaler = self.factory.CreateBitmapScaler()?;
                scaler.Initialize(&bitmap, ow, oh, WICBitmapInterpolationModeLinear)?;
                scaler.cast()?
            } else {
                bitmap.cast()?
            };
            let converter = self.factory.CreateFormatConverter()?;
            converter.Initialize(&source, &GUID_WICPixelFormat24bppBGR, WICBitmapDitherTypeNone, None::<&IWICPalette>, 0.0, WICBitmapPaletteTypeCustom)?;
            // The JPEG is written straight into this buffer (a JPEG is always smaller than the raw picture)
            let mut buf = vec![0u8; (ow as usize * oh as usize * 3) + 64 * 1024];
            let stream = self.factory.CreateStream()?;
            stream.InitializeFromMemory(&buf)?;
            let encoder = self.factory.CreateEncoder(&GUID_ContainerFormatJpeg, std::ptr::null())?;
            encoder.Initialize(&stream, WICBitmapEncoderNoCache)?;
            let mut frame = None;
            let mut options = None;
            encoder.CreateNewFrame(&mut frame, &mut options)?;
            let frame = frame.ok_or_else(|| windows::core::Error::new(E_FAIL, "no JPEG frame"))?;
            frame.Initialize(options.as_ref())?;
            frame.SetSize(ow, oh)?;
            let mut format = GUID_WICPixelFormat24bppBGR;
            frame.SetPixelFormat(&mut format)?;
            frame.WriteSource(&converter, std::ptr::null())?;
            frame.Commit()?;
            encoder.Commit()?;
            let mut written = 0u64;
            stream.Seek(0, STREAM_SEEK_CUR, Some(&mut written))?;
            drop(stream);
            buf.truncate(written as usize);
            Ok(buf)
        }
    }
}

// ─── NDI sources ───

fn run_ndi(feed: Arc<Feed>, name: String, low: bool) {
    let jpeg = match Jpeg::new() {
        Ok(j) => j,
        Err(e) => return feed.problem(format!("pictures: {e}")),
    };
    let (max_w, max_h, gap) = limits(low);
    while feed.running() {
        let receiver = match ndi::Receiver::connect(&name, low) {
            Ok(r) => r,
            Err(e) => {
                feed.problem(e);
                feed.pause(Duration::from_secs(2));
                continue;
            }
        };
        let mut last = Instant::now() - gap;
        while feed.running() {
            // Frames come at the source's rate; only as many as needed are made into pictures
            let made = receiver.next_video(250, |w, h, stride, px| {
                if last.elapsed() < gap {
                    return None;
                }
                Some(jpeg.encode(w, h, stride, px, max_w, max_h))
            });
            match made {
                Some(Some(Ok(bytes))) => {
                    last = Instant::now();
                    feed.publish(bytes);
                }
                Some(Some(Err(e))) => feed.problem(format!("pictures: {e}")),
                _ => {}
            }
        }
    }
}

// ─── This computer's screens (Desktop Duplication: no capture border, no mouse pointer) ───

fn device_name(raw: &[u16; 32]) -> String {
    let n = raw.iter().position(|&c| c == 0).unwrap_or(raw.len());
    String::from_utf16_lossy(&raw[..n])
}

/// Every graphics card's outputs that show part of the desktop
fn outputs() -> Vec<(IDXGIAdapter1, IDXGIOutput)> {
    let mut found = Vec::new();
    unsafe {
        let Ok(factory) = CreateDXGIFactory1::<IDXGIFactory1>() else { return found };
        let mut a = 0;
        while let Ok(adapter) = factory.EnumAdapters1(a) {
            let mut o = 0;
            while let Ok(output) = adapter.EnumOutputs(o) {
                if output.GetDesc().is_ok_and(|d| d.AttachedToDesktop.as_bool()) {
                    found.push((adapter.clone(), output));
                }
                o += 1;
            }
            a += 1;
        }
    }
    found
}

/// The screens, for the Media tab: id (\\.\DISPLAY1…), position and size; the main screen is at 0,0
pub fn screens() -> Vec<serde_json::Value> {
    let mut list: Vec<serde_json::Value> = outputs()
        .into_iter()
        .filter_map(|(_, output)| unsafe { output.GetDesc().ok() })
        .map(|d| {
            let r = d.DesktopCoordinates;
            serde_json::json!({
                "id": device_name(&d.DeviceName),
                "x": r.left, "y": r.top, "width": r.right - r.left, "height": r.bottom - r.top,
                "primary": r.left == 0 && r.top == 0,
            })
        })
        .collect();
    list.sort_by_key(|s| (s["x"].as_i64().unwrap_or(0), s["y"].as_i64().unwrap_or(0)));
    list
}

fn run_screen(feed: Arc<Feed>, id: String, low: bool) {
    let jpeg = match Jpeg::new() {
        Ok(j) => j,
        Err(e) => return feed.problem(format!("pictures: {e}")),
    };
    while feed.running() {
        if let Err(e) = duplicate(&feed, &id, &jpeg, low) {
            feed.problem(e.message().to_string());
            feed.pause(Duration::from_secs(1));
        }
    }
}

/// Copy the screen while the input is wanted (returns to start again when Windows takes the copy away,
/// e.g. when the screen's resolution changes or a full-screen game starts)
fn duplicate(feed: &Arc<Feed>, id: &str, jpeg: &Jpeg, low: bool) -> windows::core::Result<()> {
    let (max_w, max_h, gap) = limits(low);
    let Some((adapter, output)) = outputs().into_iter().find(|(_, o)| unsafe { o.GetDesc() }.is_ok_and(|d| device_name(&d.DeviceName) == id)) else {
        return Err(windows::core::Error::new(E_FAIL, format!("the screen {id} isn't connected")));
    };
    let mut device: Option<ID3D11Device> = None;
    let mut context: Option<ID3D11DeviceContext> = None;
    let adapter: IDXGIAdapter = adapter.cast()?;
    unsafe {
        D3D11CreateDevice(
            &adapter,
            D3D_DRIVER_TYPE_UNKNOWN,
            HMODULE::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )?;
    }
    let (device, context) = (device.unwrap(), context.unwrap());
    let output1: IDXGIOutput1 = output.cast()?;
    let duplication = unsafe { output1.DuplicateOutput(&device)? };
    let mut staging: Option<ID3D11Texture2D> = None;
    let mut size = (0u32, 0u32);
    // A new picture has been copied but not yet made into a JPEG
    let mut waiting = false;
    let mut last = Instant::now() - gap;
    while feed.running() {
        let mut info = DXGI_OUTDUPL_FRAME_INFO::default();
        let mut resource: Option<IDXGIResource> = None;
        match unsafe { duplication.AcquireNextFrame(gap.as_millis() as u32, &mut info, &mut resource) } {
            Ok(()) => {
                // LastPresentTime 0: only the mouse moved
                let copied = (|| -> windows::core::Result<()> {
                    if info.LastPresentTime == 0 {
                        return Ok(());
                    }
                    let texture: ID3D11Texture2D = resource.as_ref().ok_or_else(|| windows::core::Error::new(E_FAIL, "no picture"))?.cast()?;
                    let mut desc = D3D11_TEXTURE2D_DESC::default();
                    unsafe { texture.GetDesc(&mut desc) };
                    if staging.is_none() || size != (desc.Width, desc.Height) {
                        let mut sd = desc;
                        sd.Usage = D3D11_USAGE_STAGING;
                        sd.BindFlags = 0;
                        sd.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
                        sd.MiscFlags = 0;
                        let mut made: Option<ID3D11Texture2D> = None;
                        unsafe { device.CreateTexture2D(&sd, None, Some(&mut made))? };
                        staging = made;
                        size = (desc.Width, desc.Height);
                    }
                    if let Some(st) = &staging {
                        unsafe { context.CopyResource(st, &texture) };
                        waiting = true;
                    }
                    Ok(())
                })();
                unsafe {
                    let _ = duplication.ReleaseFrame();
                }
                copied?;
            }
            Err(e) if e.code() == DXGI_ERROR_WAIT_TIMEOUT => {}
            Err(e) => return Err(e),
        }
        // Make the newest copy into a JPEG (at most as often as the limit allows)
        if waiting && last.elapsed() >= gap {
            if let Some(st) = &staging {
                let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
                unsafe { context.Map(st, 0, D3D11_MAP_READ, 0, Some(&mut mapped))? };
                let len = mapped.RowPitch as usize * size.1 as usize;
                let px = unsafe { std::slice::from_raw_parts(mapped.pData as *const u8, len) };
                let made = jpeg.encode(size.0, size.1, mapped.RowPitch, px, max_w, max_h);
                unsafe { context.Unmap(st, 0) };
                feed.publish(made?);
                last = Instant::now();
                waiting = false;
            }
        }
    }
    Ok(())
}
