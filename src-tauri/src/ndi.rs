//! Real NDI output.
//!
//! Each NDI output has its own FlowShow window (on a screen, or placed out of sight). Windows Graphics Capture
//! copies that window's picture every time it changes, and a sender thread hands the newest picture to the
//! NDI runtime at the output's frame rate, so receivers (OBS, vMix, NDI Studio Monitor…) always get a steady stream.
//!
//! The NDI runtime is loaded from the computer when first needed (NDI Tools or the NDI Runtime installs it),
//! so FlowShow starts normally on computers without NDI.

use std::collections::HashMap;
use std::ffi::{c_void, CString};
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use serde::Serialize;
use windows::core::{Interface, Ref, HSTRING, PCSTR};
use windows::Foundation::TypedEventHandler;
use windows::Graphics::Capture::{Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession};
use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
use windows::Graphics::DirectX::DirectXPixelFormat;
use windows::Graphics::SizeInt32;
use windows::Win32::Foundation::{HMODULE, HWND};
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_HARDWARE;
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D, D3D11_CPU_ACCESS_READ,
    D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE, D3D11_MAP_READ, D3D11_SDK_VERSION,
    D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
};
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
use windows::Win32::System::WinRT::Direct3D11::{CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess};
use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;

// ─── The NDI runtime (Processing.NDI.Lib.x64.dll), loaded by hand ───

#[repr(C)]
struct NdiSendCreate {
    p_ndi_name: *const i8,
    p_groups: *const i8,
    clock_video: bool,
    clock_audio: bool,
}

#[repr(C)]
struct NdiVideoFrameV2 {
    xres: i32,
    yres: i32,
    four_cc: u32,
    frame_rate_n: i32,
    frame_rate_d: i32,
    picture_aspect_ratio: f32,
    frame_format_type: i32,
    timecode: i64,
    p_data: *const u8,
    line_stride_in_bytes: i32,
    p_metadata: *const i8,
    timestamp: i64,
}

const fn four_cc(a: u8, b: u8, c: u8, d: u8) -> u32 {
    (a as u32) | ((b as u32) << 8) | ((c as u32) << 16) | ((d as u32) << 24)
}
const FOURCC_BGRA: u32 = four_cc(b'B', b'G', b'R', b'A');
const FOURCC_BGRX: u32 = four_cc(b'B', b'G', b'R', b'X');
const FRAME_FORMAT_PROGRESSIVE: i32 = 1;
/// Let NDI make the timecode
const TIMECODE_SYNTHESIZE: i64 = i64::MAX;

#[repr(C)]
struct NdiFindCreate {
    show_local_sources: bool,
    p_groups: *const i8,
    p_extra_ips: *const i8,
}

#[repr(C)]
struct NdiSource {
    p_ndi_name: *const i8,
    p_url_address: *const i8,
}

type FnFindCreate = unsafe extern "C" fn(*const NdiFindCreate) -> *mut c_void;
type FnFindWait = unsafe extern "C" fn(*mut c_void, u32) -> bool;
type FnFindGet = unsafe extern "C" fn(*mut c_void, *mut u32) -> *const NdiSource;
type FnFindDestroy = unsafe extern "C" fn(*mut c_void);

/// Receiving: connect to a source by name, BGRA pictures, full or preview size
#[repr(C)]
struct NdiRecvCreateV3 {
    source_to_connect_to: NdiSource,
    color_format: i32,
    bandwidth: i32,
    allow_video_fields: bool,
    p_ndi_recv_name: *const i8,
}
/// NDIlib_recv_color_format_BGRX_BGRA
const RECV_COLOR_BGRX_BGRA: i32 = 0;
/// NDIlib_recv_bandwidth_lowest (NDI's small preview stream) and _highest
const RECV_BANDWIDTH_LOWEST: i32 = 0;
const RECV_BANDWIDTH_HIGHEST: i32 = 100;
/// NDIlib_frame_type_video
const FRAME_TYPE_VIDEO: i32 = 1;

type FnRecvCreateV3 = unsafe extern "C" fn(*const NdiRecvCreateV3) -> *mut c_void;
type FnRecvDestroy = unsafe extern "C" fn(*mut c_void);
type FnRecvCaptureV2 = unsafe extern "C" fn(*mut c_void, *mut NdiVideoFrameV2, *mut c_void, *mut c_void, u32) -> i32;
type FnRecvFreeVideoV2 = unsafe extern "C" fn(*mut c_void, *const NdiVideoFrameV2);

type FnInitialize = unsafe extern "C" fn() -> bool;
type FnSendCreate = unsafe extern "C" fn(*const NdiSendCreate) -> *mut c_void;
type FnSendDestroy = unsafe extern "C" fn(*mut c_void);
type FnSendVideoV2 = unsafe extern "C" fn(*mut c_void, *const NdiVideoFrameV2);
type FnSendGetNoConnections = unsafe extern "C" fn(*mut c_void, u32) -> i32;

struct NdiLib {
    send_create: FnSendCreate,
    send_destroy: FnSendDestroy,
    send_video_v2: FnSendVideoV2,
    send_get_no_connections: FnSendGetNoConnections,
    find_create: FnFindCreate,
    find_wait: FnFindWait,
    find_get: FnFindGet,
    find_destroy: FnFindDestroy,
    recv_create_v3: FnRecvCreateV3,
    recv_destroy: FnRecvDestroy,
    recv_capture_v2: FnRecvCaptureV2,
    recv_free_video_v2: FnRecvFreeVideoV2,
    path: String,
}

static NDI: OnceLock<Result<NdiLib, String>> = OnceLock::new();

fn ndi() -> Result<&'static NdiLib, String> {
    NDI.get_or_init(load_ndi).as_ref().map_err(|e| e.clone())
}

fn load_ndi() -> Result<NdiLib, String> {
    // NDI Tools / the NDI Runtime set these; the newest one wins
    let dirs: Vec<String> = ["NDI_RUNTIME_DIR_V6", "NDI_RUNTIME_DIR_V5", "NDI_RUNTIME_DIR_V4", "NDI_RUNTIME_DIR_V3"]
        .iter()
        .filter_map(|v| std::env::var(v).ok())
        .chain([
            r"C:\Program Files\NDI\NDI 6 Runtime\v6".to_string(),
            r"C:\Program Files\NDI\NDI 6 Tools\Runtime".to_string(),
            r"C:\Program Files\NDI\NDI 5 Runtime\v5".to_string(),
        ])
        .collect();
    for dir in dirs {
        let path = format!(r"{}\Processing.NDI.Lib.x64.dll", dir.trim_end_matches('\\'));
        if !std::path::Path::new(&path).exists() {
            continue;
        }
        unsafe {
            let module = match LoadLibraryW(&HSTRING::from(path.as_str())) {
                Ok(m) => m,
                Err(_) => continue,
            };
            let sym = |name: &str| {
                let c = CString::new(name).unwrap();
                GetProcAddress(module, PCSTR(c.as_ptr() as *const u8)).ok_or_else(|| format!("the NDI runtime has no {name}"))
            };
            let initialize: FnInitialize = std::mem::transmute(sym("NDIlib_initialize")?);
            let lib = NdiLib {
                send_create: std::mem::transmute(sym("NDIlib_send_create")?),
                send_destroy: std::mem::transmute(sym("NDIlib_send_destroy")?),
                send_video_v2: std::mem::transmute(sym("NDIlib_send_send_video_v2")?),
                send_get_no_connections: std::mem::transmute(sym("NDIlib_send_get_no_connections")?),
                find_create: std::mem::transmute(sym("NDIlib_find_create_v2")?),
                find_wait: std::mem::transmute(sym("NDIlib_find_wait_for_sources")?),
                find_get: std::mem::transmute(sym("NDIlib_find_get_current_sources")?),
                find_destroy: std::mem::transmute(sym("NDIlib_find_destroy")?),
                recv_create_v3: std::mem::transmute(sym("NDIlib_recv_create_v3")?),
                recv_destroy: std::mem::transmute(sym("NDIlib_recv_destroy")?),
                recv_capture_v2: std::mem::transmute(sym("NDIlib_recv_capture_v2")?),
                recv_free_video_v2: std::mem::transmute(sym("NDIlib_recv_free_video_v2")?),
                path: path.clone(),
            };
            if !initialize() {
                return Err("NDI could not start on this computer (its processor may not be supported)".into());
            }
            return Ok(lib);
        }
    }
    Err("The NDI runtime isn't installed. Install NDI Tools (or the NDI Runtime) from ndi.video, then restart FlowShow.".into())
}

// ─── One NDI output: a captured window and a sender thread ───

/// The newest picture of the window: BGRA rows packed tightly (width × 4 bytes each)
struct Frame {
    width: u32,
    height: u32,
    pixels: Vec<u8>,
}

#[derive(Default)]
struct Shared {
    frame: Mutex<Option<Arc<Frame>>>,
    stop: AtomicBool,
    captured: AtomicU64,
    sent: AtomicU64,
    connections: AtomicI32,
    error: Mutex<Option<String>>,
}

struct Output {
    shared: Arc<Shared>,
    session: GraphicsCaptureSession,
    pool: Direct3D11CaptureFramePool,
    thread: Option<JoinHandle<()>>,
    name: String,
    started: Instant,
}

// The capture objects are agile WinRT objects: safe to keep and close from any thread
unsafe impl Send for Output {}

static OUTPUTS: OnceLock<Mutex<HashMap<String, Output>>> = OnceLock::new();
fn outputs() -> &'static Mutex<HashMap<String, Output>> {
    OUTPUTS.get_or_init(|| Mutex::new(HashMap::new()))
}

impl Output {
    fn stop(mut self) {
        self.shared.stop.store(true, Ordering::SeqCst);
        let _ = self.session.Close();
        let _ = self.pool.Close();
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

/// Start sending the window `hwnd` as the NDI source `name` (replacing an earlier sender for the same output)
pub fn start(key: &str, hwnd: HWND, name: &str, groups: &str, fps: u32, alpha: bool) -> Result<(), String> {
    let lib = ndi()?;
    stop(key);
    let fps = fps.clamp(1, 120);
    let shared = Arc::new(Shared::default());
    let (session, pool) = start_capture(hwnd, shared.clone()).map_err(|e| format!("couldn't capture the output window: {e}"))?;

    let c_name = CString::new(name).map_err(|_| "the NDI name can't contain a zero character".to_string())?;
    let c_groups = if groups.trim().is_empty() { None } else { CString::new(groups.trim()).ok() };
    let thread_shared = shared.clone();
    let thread = thread::Builder::new()
        .name(format!("ndi-{key}"))
        .spawn(move || {
            let create = NdiSendCreate {
                p_ndi_name: c_name.as_ptr(),
                p_groups: c_groups.as_ref().map_or(std::ptr::null(), |g| g.as_ptr()),
                // NDI paces the frames at the frame rate below
                clock_video: true,
                clock_audio: false,
            };
            let sender = unsafe { (lib.send_create)(&create) };
            if sender.is_null() {
                *thread_shared.error.lock().unwrap() = Some("NDI couldn't create the source (is the name already used?)".into());
                return;
            }
            let mut last_check = Instant::now() - Duration::from_secs(2);
            while !thread_shared.stop.load(Ordering::SeqCst) {
                let frame = thread_shared.frame.lock().unwrap().clone();
                match frame {
                    Some(f) => {
                        let video = NdiVideoFrameV2 {
                            xres: f.width as i32,
                            yres: f.height as i32,
                            four_cc: if alpha { FOURCC_BGRA } else { FOURCC_BGRX },
                            frame_rate_n: fps as i32 * 1000,
                            frame_rate_d: 1000,
                            picture_aspect_ratio: 0.0,
                            frame_format_type: FRAME_FORMAT_PROGRESSIVE,
                            timecode: TIMECODE_SYNTHESIZE,
                            p_data: f.pixels.as_ptr(),
                            line_stride_in_bytes: (f.width * 4) as i32,
                            p_metadata: std::ptr::null(),
                            timestamp: 0,
                        };
                        // Copies the picture and waits for the next frame time
                        unsafe { (lib.send_video_v2)(sender, &video) };
                        thread_shared.sent.fetch_add(1, Ordering::Relaxed);
                    }
                    None => thread::sleep(Duration::from_millis(1000 / fps as u64)),
                }
                if last_check.elapsed() >= Duration::from_secs(1) {
                    last_check = Instant::now();
                    let n = unsafe { (lib.send_get_no_connections)(sender, 0) };
                    thread_shared.connections.store(n, Ordering::Relaxed);
                }
            }
            unsafe { (lib.send_destroy)(sender) };
        })
        .map_err(|e| e.to_string())?;

    outputs().lock().unwrap().insert(
        key.to_string(),
        Output { shared, session, pool, thread: Some(thread), name: name.to_string(), started: Instant::now() },
    );
    Ok(())
}

pub fn stop(key: &str) {
    let old = outputs().lock().unwrap().remove(key);
    if let Some(o) = old {
        o.stop();
    }
}

pub fn stop_all() {
    let all: Vec<Output> = outputs().lock().unwrap().drain().map(|(_, o)| o).collect();
    for o in all {
        o.stop();
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputStatus {
    name: String,
    connections: i32,
    frames_captured: u64,
    frames_sent: u64,
    width: u32,
    height: u32,
    seconds: f64,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NdiInfo {
    available: bool,
    runtime: Option<String>,
    error: Option<String>,
    /// How receivers name this computer's sources: "COMPUTER (source name)"
    computer: String,
}

pub fn info() -> NdiInfo {
    match ndi() {
        Ok(lib) => NdiInfo { available: true, runtime: Some(lib.path.clone()), error: None, computer: computer_name() },
        Err(e) => NdiInfo { available: false, runtime: None, error: Some(e), computer: computer_name() },
    }
}

pub fn status() -> HashMap<String, OutputStatus> {
    outputs()
        .lock()
        .unwrap()
        .iter()
        .map(|(k, o)| {
            let frame = o.shared.frame.lock().unwrap().clone();
            (
                k.clone(),
                OutputStatus {
                    name: o.name.clone(),
                    connections: o.shared.connections.load(Ordering::Relaxed),
                    frames_captured: o.shared.captured.load(Ordering::Relaxed),
                    frames_sent: o.shared.sent.load(Ordering::Relaxed),
                    width: frame.as_ref().map_or(0, |f| f.width),
                    height: frame.as_ref().map_or(0, |f| f.height),
                    seconds: o.started.elapsed().as_secs_f64(),
                    error: o.shared.error.lock().unwrap().clone(),
                },
            )
        })
        .collect()
}

/// The NDI sources on the network (cameras, OBS, other computers, and FlowShow's own outputs), found within `wait_ms`
pub fn sources(wait_ms: u32) -> Result<Vec<serde_json::Value>, String> {
    let lib = ndi()?;
    let create = NdiFindCreate { show_local_sources: true, p_groups: std::ptr::null(), p_extra_ips: std::ptr::null() };
    let finder = unsafe { (lib.find_create)(&create) };
    if finder.is_null() {
        return Err("NDI couldn't start looking for sources".into());
    }
    // Wait until the list stops growing (or the time is up)
    let deadline = Instant::now() + Duration::from_millis(wait_ms as u64);
    while Instant::now() < deadline {
        let left = deadline.saturating_duration_since(Instant::now()).as_millis() as u32;
        if !unsafe { (lib.find_wait)(finder, left.min(1000)) } && Instant::now() + Duration::from_millis(50) >= deadline {
            break;
        }
    }
    let mut count = 0u32;
    let list = unsafe { (lib.find_get)(finder, &mut count) };
    let text = |p: *const i8| if p.is_null() { String::new() } else { unsafe { std::ffi::CStr::from_ptr(p) }.to_string_lossy().into_owned() };
    let found = (0..count as usize)
        .map(|i| {
            let s = unsafe { &*list.add(i) };
            serde_json::json!({ "name": text(s.p_ndi_name), "address": text(s.p_url_address) })
        })
        .collect();
    unsafe { (lib.find_destroy)(finder) };
    Ok(found)
}

// ─── Receiving an NDI source (live inputs) ───

/// One NDI source being received (for a background or a mix layer)
pub struct Receiver {
    inst: *mut c_void,
    lib: &'static NdiLib,
}
// The NDI receiver can be used from any thread (one at a time)
unsafe impl Send for Receiver {}

impl Receiver {
    /// Connect to a source by its full name ("COMPUTER (Source)"). `low`: NDI's small preview stream, for thumbnails.
    /// NDI keeps trying in the background, so a source that appears later still connects.
    pub fn connect(name: &str, low: bool) -> Result<Self, String> {
        let lib = ndi()?;
        let c_name = CString::new(name).map_err(|_| "the NDI source name can't contain a zero character".to_string())?;
        let c_receiver = CString::new("FlowShow").unwrap();
        let create = NdiRecvCreateV3 {
            source_to_connect_to: NdiSource { p_ndi_name: c_name.as_ptr(), p_url_address: std::ptr::null() },
            color_format: RECV_COLOR_BGRX_BGRA,
            bandwidth: if low { RECV_BANDWIDTH_LOWEST } else { RECV_BANDWIDTH_HIGHEST },
            allow_video_fields: false,
            p_ndi_recv_name: c_receiver.as_ptr(),
        };
        let inst = unsafe { (lib.recv_create_v3)(&create) };
        if inst.is_null() {
            return Err(format!("NDI couldn't start receiving \"{name}\""));
        }
        Ok(Self { inst, lib })
    }

    /// The next picture within `timeout_ms` (None if none came): `f` gets width, height, row length and the BGRA/BGRX pixels
    pub fn next_video<R>(&self, timeout_ms: u32, f: impl FnOnce(u32, u32, u32, &[u8]) -> R) -> Option<R> {
        let mut frame: NdiVideoFrameV2 = unsafe { std::mem::zeroed() };
        let kind = unsafe { (self.lib.recv_capture_v2)(self.inst, &mut frame, std::ptr::null_mut(), std::ptr::null_mut(), timeout_ms) };
        if kind != FRAME_TYPE_VIDEO {
            return None;
        }
        let usable = !frame.p_data.is_null() && frame.xres > 0 && frame.yres > 0 && (frame.four_cc == FOURCC_BGRA || frame.four_cc == FOURCC_BGRX);
        let result = usable.then(|| {
            let stride = if frame.line_stride_in_bytes > 0 { frame.line_stride_in_bytes as u32 } else { frame.xres as u32 * 4 };
            let pixels = unsafe { std::slice::from_raw_parts(frame.p_data, stride as usize * frame.yres as usize) };
            f(frame.xres as u32, frame.yres as u32, stride, pixels)
        });
        unsafe { (self.lib.recv_free_video_v2)(self.inst, &frame) };
        result
    }
}

impl Drop for Receiver {
    fn drop(&mut self) {
        unsafe { (self.lib.recv_destroy)(self.inst) };
    }
}

/// Save an output's newest picture as a .bmp file (for checking what is being sent)
pub fn snapshot(key: &str, path: &str) -> Result<(), String> {
    let frame = outputs()
        .lock()
        .unwrap()
        .get(key)
        .and_then(|o| o.shared.frame.lock().unwrap().clone())
        .ok_or("no picture yet")?;
    let (w, h) = (frame.width, frame.height);
    let data_len = w * h * 4;
    let mut out = Vec::with_capacity(54 + data_len as usize);
    out.extend_from_slice(b"BM");
    out.extend_from_slice(&(54 + data_len).to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&54u32.to_le_bytes());
    out.extend_from_slice(&40u32.to_le_bytes());
    out.extend_from_slice(&(w as i32).to_le_bytes());
    out.extend_from_slice(&(-(h as i32)).to_le_bytes()); // top-down rows
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&32u16.to_le_bytes());
    out.extend_from_slice(&[0u8; 24]);
    out.extend_from_slice(&frame.pixels);
    std::fs::write(path, out).map_err(|e| e.to_string())
}

/// A quick look at an output's newest picture: its size, how bright it is, and how much of it is see-through
pub fn peek(key: &str) -> Option<serde_json::Value> {
    let frame = outputs().lock().unwrap().get(key)?.shared.frame.lock().unwrap().clone()?;
    let (mut sum, mut clear, mut n) = (0u64, 0u64, 0u64);
    // Every 7th pixel is plenty for an average
    for px in frame.pixels.chunks_exact(4).step_by(7) {
        sum += (px[0] as u64 + px[1] as u64 + px[2] as u64) / 3;
        if px[3] == 0 {
            clear += 1;
        }
        n += 1;
    }
    Some(serde_json::json!({
        "width": frame.width,
        "height": frame.height,
        "brightness": if n > 0 { sum as f64 / n as f64 } else { 0.0 },
        "transparentShare": if n > 0 { clear as f64 / n as f64 } else { 0.0 },
    }))
}

// ─── Windows Graphics Capture of one window ───

struct CopyState {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    staging: Option<ID3D11Texture2D>,
    size: SizeInt32,
}

/// The Direct3D objects for one capture, used only inside its lock (the device itself is free-threaded)
struct Locked(Mutex<CopyState>);
unsafe impl Send for Locked {}
unsafe impl Sync for Locked {}

fn start_capture(hwnd: HWND, shared: Arc<Shared>) -> windows::core::Result<(GraphicsCaptureSession, Direct3D11CaptureFramePool)> {
    let mut device: Option<ID3D11Device> = None;
    let mut context: Option<ID3D11DeviceContext> = None;
    unsafe {
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            HMODULE::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )?;
    }
    let device = device.unwrap();
    let context = context.unwrap();
    let dxgi: IDXGIDevice = device.cast()?;
    let d3d: IDirect3DDevice = unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi)? }.cast()?;

    let interop = windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()?;
    let item: GraphicsCaptureItem = unsafe { interop.CreateForWindow(hwnd) }.map_err(|e| {
        windows::core::Error::new(e.code(), format!("CreateForWindow failed ({}) for {}", e.message(), describe_window(hwnd)))
    })?;
    let mut size = item.Size()?;
    // Out of sight, Windows reports no size: use the window's own size instead
    if size.Width <= 0 || size.Height <= 0 {
        use windows::Win32::Foundation::RECT;
        use windows::Win32::UI::WindowsAndMessaging::GetClientRect;
        let mut r = RECT::default();
        unsafe { GetClientRect(hwnd, &mut r)? };
        size = SizeInt32 { Width: (r.right - r.left).max(1), Height: (r.bottom - r.top).max(1) };
    }
    let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(&d3d, DirectXPixelFormat::B8G8R8A8UIntNormalized, 2, size)
        .map_err(|e| windows::core::Error::new(e.code(), format!("frame pool {}x{}: {}", size.Width, size.Height, e.message())))?;
    let session = pool.CreateCaptureSession(&item)?;
    // No mouse pointer and (Windows 11) no yellow capture border on the output
    let _ = session.SetIsCursorCaptureEnabled(false);
    let _ = session.SetIsBorderRequired(false);

    let state = Locked(Mutex::new(CopyState { device, context, staging: None, size }));
    let error_slot = shared.clone();
    pool.FrameArrived(&TypedEventHandler::new(move |pool: Ref<Direct3D11CaptureFramePool>, _| {
        let result = on_frame(&pool, &state, &shared);
        if let Err(e) = &result {
            *error_slot.error.lock().unwrap() = Some(format!("capture: {e}"));
        }
        Ok(())
    }))?;
    session.StartCapture()?;
    Ok((session, pool))
}

/// One new picture of the window: copy it where the sender thread can take it
fn on_frame(pool: &Ref<Direct3D11CaptureFramePool>, state: &Locked, shared: &Arc<Shared>) -> windows::core::Result<()> {
        let pool = pool.ok()?;
        let frame = pool.TryGetNextFrame()?;
        let content = frame.ContentSize()?;
        let access: IDirect3DDxgiInterfaceAccess = frame.Surface()?.cast()?;
        let texture: ID3D11Texture2D = unsafe { access.GetInterface()? };
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        unsafe { texture.GetDesc(&mut desc) };

        let mut st = state.0.lock().unwrap();
        // A CPU-readable copy of the picture, made again when the size changes
        let fits = st.staging.as_ref().is_some_and(|s| {
            let mut d = D3D11_TEXTURE2D_DESC::default();
            unsafe { s.GetDesc(&mut d) };
            d.Width == desc.Width && d.Height == desc.Height
        });
        if !fits {
            let mut sd = desc;
            sd.Usage = D3D11_USAGE_STAGING;
            sd.BindFlags = 0;
            sd.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
            sd.MiscFlags = 0;
            let mut staging: Option<ID3D11Texture2D> = None;
            unsafe { st.device.CreateTexture2D(&sd, None, Some(&mut staging))? };
            st.staging = staging;
        }
        let staging = st.staging.clone().unwrap();
        unsafe { st.context.CopyResource(&staging, &texture) };
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        unsafe { st.context.Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))? };
        let width = (content.Width.max(1) as u32).min(desc.Width);
        let height = (content.Height.max(1) as u32).min(desc.Height);
        let row = (width * 4) as usize;
        let mut pixels = vec![0u8; row * height as usize];
        for y in 0..height as usize {
            unsafe {
                std::ptr::copy_nonoverlapping(
                    (mapped.pData as *const u8).add(y * mapped.RowPitch as usize),
                    pixels.as_mut_ptr().add(y * row),
                    row,
                );
            }
        }
        unsafe { st.context.Unmap(&staging, 0) };
        *shared.frame.lock().unwrap() = Some(Arc::new(Frame { width, height, pixels }));
        shared.captured.fetch_add(1, Ordering::Relaxed);

        Ok(())
}

/// For error messages: the window's style flags, visibility and size
fn describe_window(hwnd: HWND) -> String {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowLongPtrW, GetWindowRect, IsWindow, IsWindowVisible, GWL_EXSTYLE, GWL_STYLE};
    unsafe {
        let mut r = RECT::default();
        let _ = GetWindowRect(hwnd, &mut r);
        format!(
            "window {:?}: exists={} visible={} style={:#x} exstyle={:#x} rect=({},{})-({},{})",
            hwnd.0,
            IsWindow(Some(hwnd)).as_bool(),
            IsWindowVisible(hwnd).as_bool(),
            GetWindowLongPtrW(hwnd, GWL_STYLE),
            GetWindowLongPtrW(hwnd, GWL_EXSTYLE),
            r.left, r.top, r.right, r.bottom
        )
    }
}

fn computer_name() -> String {
    std::env::var("COMPUTERNAME").unwrap_or_default().to_uppercase()
}
