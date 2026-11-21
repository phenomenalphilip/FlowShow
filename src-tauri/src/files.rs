//! Files on this computer.
//!
//! - Exports (songs, templates, profiles, backups) are saved in Documents\FlowShow\<kind>, and can be shown in Explorer.
//! - Media stays where it is on the computer: FlowShow keeps only its path, picked with the Windows file dialog,
//!   and the screens load it through the `media` address (http://media.localhost/<path> on Windows),
//!   which reads the file from disk (in pieces for videos, so they can play and seek).

use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use tauri::http::{header, Request, Response, StatusCode};

// ─── Where exports go ───

/// The user's Documents folder (wherever Windows keeps it, e.g. in OneDrive)
#[cfg(windows)]
fn documents_dir() -> PathBuf {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{FOLDERID_Documents, SHGetKnownFolderPath, KF_FLAG_DEFAULT};
    unsafe {
        if let Ok(p) = SHGetKnownFolderPath(&FOLDERID_Documents, KF_FLAG_DEFAULT, None) {
            let s = p.to_string().unwrap_or_default();
            CoTaskMemFree(Some(p.0 as _));
            if !s.is_empty() {
                return PathBuf::from(s);
            }
        }
    }
    PathBuf::from(std::env::var("USERPROFILE").unwrap_or_else(|_| ".".into())).join("Documents")
}
#[cfg(not(windows))]
fn documents_dir() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| ".".into())).join("Documents")
}

pub(crate) fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Save an export: body = the file's bytes; headers x-folder (Backups, Songs…) and x-name (the file name, URL-encoded).
/// Returns the full path it was saved to (a new name is used if one is already there).
pub fn save_export(request: &tauri::ipc::Request<'_>) -> Result<String, String> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(b) => b.clone(),
        _ => return Err("nothing to save".into()),
    };
    let header_text = |k: &str| request.headers().get(k).and_then(|v| v.to_str().ok()).map(percent_decode).unwrap_or_default();
    let folder = match header_text("x-folder").as_str() {
        f @ ("Backups" | "Songs" | "Templates" | "Profiles") => f.to_string(),
        _ => "Exports".to_string(),
    };
    let name: String = header_text("x-name").chars().filter(|c| !r#"\/:*?"<>|"#.contains(*c) && !c.is_control()).collect();
    let name = if name.trim().is_empty() { "FlowShow export".to_string() } else { name.trim().to_string() };
    let dir = documents_dir().join("FlowShow").join(&folder);
    fs::create_dir_all(&dir).map_err(|e| format!("couldn't make {}: {e}", dir.display()))?;
    // Don't overwrite: "name (2).ext", "name (3).ext"…
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (name[..i].to_string(), name[i..].to_string()),
        _ => (name.clone(), String::new()),
    };
    let mut path = dir.join(&name);
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{stem} ({n}){ext}"));
        n += 1;
    }
    fs::write(&path, bytes).map_err(|e| format!("couldn't save {}: {e}", path.display()))?;
    Ok(path.to_string_lossy().into_owned())
}

/// Open File Explorer with this file selected
pub fn reveal(path: &str) -> Result<(), String> {
    if !Path::new(path).exists() {
        return Err("that file isn't there any more".into());
    }
    #[cfg(windows)]
    {
        std::process::Command::new("explorer").arg(format!("/select,{path}")).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ─── Choosing media without copying it ───

/// The Windows "Open" dialog for a picture or video. Returns its path, or None if cancelled.
#[cfg(windows)]
pub fn pick_media(owner: Option<isize>, kind: &str) -> Result<Option<String>, String> {
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
    use windows::Win32::UI::Shell::{FileOpenDialog, IFileOpenDialog, SIGDN_FILESYSPATH};
    const IMAGES: &str = "*.png;*.jpg;*.jpeg;*.gif;*.webp;*.bmp;*.svg";
    const VIDEOS: &str = "*.mp4;*.webm;*.mov;*.m4v;*.mkv;*.avi";
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).map_err(|e| e.to_string())?;
        let all = format!("{IMAGES};{VIDEOS}");
        let (label, spec) = match kind {
            "image" => ("Pictures", IMAGES.to_string()),
            "video" => ("Videos", VIDEOS.to_string()),
            _ => ("Pictures and videos", all),
        };
        let label_w = HSTRING::from(label);
        let spec_w = HSTRING::from(spec.as_str());
        let filters = [COMDLG_FILTERSPEC { pszName: PCWSTR(label_w.as_ptr()), pszSpec: PCWSTR(spec_w.as_ptr()) }];
        dialog.SetFileTypes(&filters).map_err(|e| e.to_string())?;
        let _ = dialog.SetTitle(&HSTRING::from("Choose a picture or video (it stays where it is on your computer)"));
        let owner = owner.map(|h| HWND(h as *mut core::ffi::c_void));
        if let Err(e) = dialog.Show(owner) {
            // Cancelled
            if e.code().0 as u32 == 0x800704C7 {
                return Ok(None);
            }
            return Err(e.to_string());
        }
        let item = dialog.GetResult().map_err(|e| e.to_string())?;
        let name = item.GetDisplayName(SIGDN_FILESYSPATH).map_err(|e| e.to_string())?;
        let path = name.to_string().unwrap_or_default();
        CoTaskMemFree(Some(name.0 as _));
        Ok(if path.is_empty() { None } else { Some(path) })
    }
}

/// The Windows folder dialog, for a folder of pictures and videos (the Media tab). Returns its path, or None if cancelled.
/// FlowShow reads the folder itself, so the WebView never has to ask for permission to see files.
#[cfg(windows)]
pub fn pick_folder(owner: Option<isize>) -> Result<Option<String>, String> {
    use windows::core::HSTRING;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{FileOpenDialog, IFileOpenDialog, FOS_FORCEFILESYSTEM, FOS_PICKFOLDERS, SIGDN_FILESYSPATH};
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).map_err(|e| e.to_string())?;
        let options = dialog.GetOptions().map_err(|e| e.to_string())?;
        dialog.SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM).map_err(|e| e.to_string())?;
        let _ = dialog.SetTitle(&HSTRING::from("Choose a folder of pictures and videos (they stay where they are)"));
        let owner = owner.map(|h| HWND(h as *mut core::ffi::c_void));
        if let Err(e) = dialog.Show(owner) {
            if e.code().0 as u32 == 0x800704C7 {
                return Ok(None);
            }
            return Err(e.to_string());
        }
        let item = dialog.GetResult().map_err(|e| e.to_string())?;
        let name = item.GetDisplayName(SIGDN_FILESYSPATH).map_err(|e| e.to_string())?;
        let path = name.to_string().unwrap_or_default();
        CoTaskMemFree(Some(name.0 as _));
        Ok(if path.is_empty() { None } else { Some(path) })
    }
}

/// What is in a media folder: its folders, and its pictures and videos (name, size, last changed), folders first
pub fn list_media_folder(path: &str) -> Result<Vec<serde_json::Value>, String> {
    let dir = Path::new(path);
    let entries = fs::read_dir(dir).map_err(|e| format!("couldn't open {}: {e}", dir.display()))?;
    let mut list: Vec<(bool, String, serde_json::Value)> = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || name.starts_with('$') {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let full = entry.path().to_string_lossy().into_owned();
        if meta.is_dir() {
            list.push((true, name.to_lowercase(), serde_json::json!({ "name": name, "path": full, "dir": true })));
        } else if let Some(mime) = mime_for(&entry.path()).filter(|m| m.starts_with("image/") || m.starts_with("video/")) {
            let modified = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
            list.push((false, name.to_lowercase(), serde_json::json!({
                "name": name, "path": full, "dir": false,
                "type": if mime.starts_with("video/") { "video" } else { "image" },
                "size": meta.len(), "modified": modified,
            })));
        }
    }
    list.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    Ok(list.into_iter().map(|(_, _, v)| v).collect())
}

// ─── Serving media from disk to the screens ───

fn mime_for(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    Some(match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "m4a" => "audio/mp4",
        _ => return None,
    })
}

fn respond(status: StatusCode, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder().status(status).header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*").body(body).unwrap()
}

/// Largest piece of a file sent at once (videos are read in pieces as they play)
const CHUNK: u64 = 4 * 1024 * 1024;

// ─── Thumbnails for the Media tab ───

/// Thumbnails already made (path + last change + size → JPEG; empty = Windows has none), so a folder opens at once the next time
static THUMBS: std::sync::LazyLock<std::sync::Mutex<std::collections::HashMap<String, std::sync::Arc<Vec<u8>>>>> =
    std::sync::LazyLock::new(Default::default);
const THUMB_SIZE: u32 = 320;
const THUMBS_KEPT: usize = 1500;

/// A small JPEG of a picture or video: Windows' own thumbnail (the one File Explorer shows, usually ready at once)
#[cfg(windows)]
fn make_thumbnail(path: &Path, size: u32) -> Result<Vec<u8>, String> {
    use windows::core::HSTRING;
    use windows::Win32::Foundation::SIZE;
    use windows::Win32::Graphics::Gdi::{DeleteObject, HPALETTE};
    use windows::Win32::Graphics::Imaging::{
        CLSID_WICImagingFactory, GUID_ContainerFormatJpeg, GUID_WICPixelFormat24bppBGR, IWICImagingFactory, IWICPalette,
        WICBitmapDitherTypeNone, WICBitmapEncoderNoCache, WICBitmapIgnoreAlpha, WICBitmapPaletteTypeCustom,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, IBindCtx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, STREAM_SEEK_CUR};
    use windows::Win32::UI::Shell::{IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_RESIZETOFIT, SIIGBF_THUMBNAILONLY};
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let item: IShellItemImageFactory =
            SHCreateItemFromParsingName(&HSTRING::from(path.to_string_lossy().replace('/', "\\").as_str()), None::<&IBindCtx>).map_err(|e| e.to_string())?;
        // Only a real thumbnail (never a generic file icon)
        let bitmap_handle = item
            .GetImage(SIZE { cx: size as i32, cy: size as i32 }, SIIGBF_RESIZETOFIT | SIIGBF_THUMBNAILONLY)
            .map_err(|e| e.to_string())?;
        let made = (|| -> windows::core::Result<Vec<u8>> {
            let wic: IWICImagingFactory = CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)?;
            let bitmap = wic.CreateBitmapFromHBITMAP(bitmap_handle, HPALETTE::default(), WICBitmapIgnoreAlpha)?;
            let (mut w, mut h) = (0u32, 0u32);
            bitmap.GetSize(&mut w, &mut h)?;
            let converter = wic.CreateFormatConverter()?;
            converter.Initialize(&bitmap, &GUID_WICPixelFormat24bppBGR, WICBitmapDitherTypeNone, None::<&IWICPalette>, 0.0, WICBitmapPaletteTypeCustom)?;
            let mut buf = vec![0u8; (w as usize * h as usize * 3) + 64 * 1024];
            let stream = wic.CreateStream()?;
            stream.InitializeFromMemory(&buf)?;
            let encoder = wic.CreateEncoder(&GUID_ContainerFormatJpeg, std::ptr::null())?;
            encoder.Initialize(&stream, WICBitmapEncoderNoCache)?;
            let mut frame = None;
            let mut options = None;
            encoder.CreateNewFrame(&mut frame, &mut options)?;
            let frame = frame.ok_or_else(|| windows::core::Error::from_win32())?;
            frame.Initialize(options.as_ref())?;
            frame.SetSize(w, h)?;
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
        })();
        let _ = DeleteObject(bitmap_handle.into());
        made.map_err(|e| e.to_string())
    }
}
#[cfg(not(windows))]
fn make_thumbnail(_path: &Path, _size: u32) -> Result<Vec<u8>, String> {
    Err("thumbnails are on Windows for now".into())
}

/// http://media.localhost/<path>?thumb: the file's thumbnail (404 if Windows has none: the Media tab shows the file instead)
fn serve_thumbnail(path: &Path) -> Response<Vec<u8>> {
    let Ok(meta) = fs::metadata(path) else { return respond(StatusCode::NOT_FOUND, b"file not found".to_vec()) };
    let changed = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
    let key = format!("{}|{changed}|{THUMB_SIZE}", path.to_string_lossy().to_lowercase());
    let cached = THUMBS.lock().unwrap().get(&key).cloned();
    let jpeg = match cached {
        // Windows had no thumbnail for it last time: say so at once (some video kinds take seconds to fail)
        Some(j) if j.is_empty() => return respond(StatusCode::NOT_FOUND, b"no thumbnail".to_vec()),
        Some(j) => j,
        None => match make_thumbnail(path, THUMB_SIZE) {
            Ok(bytes) => {
                let bytes = std::sync::Arc::new(bytes);
                let mut kept = THUMBS.lock().unwrap();
                if kept.len() >= THUMBS_KEPT {
                    kept.clear();
                }
                kept.insert(key, bytes.clone());
                bytes
            }
            Err(e) => {
                THUMBS.lock().unwrap().insert(key, std::sync::Arc::new(Vec::new()));
                return respond(StatusCode::NOT_FOUND, e.into_bytes());
            }
        },
    };
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "image/jpeg")
        .header(header::CACHE_CONTROL, "max-age=86400")
        .header(header::CONTENT_LENGTH, jpeg.len().to_string())
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(jpeg.as_ref().clone())
        .unwrap()
}

/// A request for http://media.localhost/<URL-encoded path>: the file, or the asked-for piece of it (or ?thumb: its thumbnail)
pub fn serve_media(request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let raw = request.uri().path().trim_start_matches('/');
    let path = PathBuf::from(percent_decode(raw));
    // Only pictures, videos and sound: never any other file on the computer
    let Some(mime) = mime_for(&path) else { return respond(StatusCode::FORBIDDEN, b"not a media file".to_vec()) };
    if request.uri().query().is_some_and(|q| q.split('&').any(|p| p == "thumb" || p.starts_with("thumb="))) {
        return serve_thumbnail(&path);
    }
    let Ok(meta) = fs::metadata(&path) else { return respond(StatusCode::NOT_FOUND, b"file not found".to_vec()) };
    let len = meta.len();
    let Ok(mut file) = File::open(&path) else { return respond(StatusCode::NOT_FOUND, b"can't open".to_vec()) };

    // A piece of the file ("Range: bytes=start-end"), as video players ask for
    let range = request.headers().get(header::RANGE).and_then(|v| v.to_str().ok()).and_then(|v| {
        let spec = v.strip_prefix("bytes=")?;
        let (a, b) = spec.split_once('-')?;
        let start: u64 = a.trim().parse().ok()?;
        let end: u64 = if b.trim().is_empty() { len.saturating_sub(1) } else { b.trim().parse().ok()? };
        Some((start, end))
    });
    if let Some((start, end)) = range {
        if start >= len {
            return Response::builder()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(header::CONTENT_RANGE, format!("bytes */{len}"))
                .body(Vec::new())
                .unwrap();
        }
        let end = end.min(len - 1).min(start + CHUNK - 1);
        let mut buf = vec![0u8; (end - start + 1) as usize];
        if file.seek(SeekFrom::Start(start)).and_then(|_| file.read_exact(&mut buf)).is_err() {
            return respond(StatusCode::INTERNAL_SERVER_ERROR, b"read failed".to_vec());
        }
        return Response::builder()
            .status(StatusCode::PARTIAL_CONTENT)
            .header(header::CONTENT_TYPE, mime)
            .header(header::ACCEPT_RANGES, "bytes")
            .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{len}"))
            .header(header::CONTENT_LENGTH, buf.len().to_string())
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(buf)
            .unwrap();
    }
    // Big videos without a range: start with the first piece, and say pieces can be asked for
    if mime.starts_with("video/") && len > CHUNK {
        let mut buf = vec![0u8; CHUNK as usize];
        if file.read_exact(&mut buf).is_err() {
            return respond(StatusCode::INTERNAL_SERVER_ERROR, b"read failed".to_vec());
        }
        return Response::builder()
            .status(StatusCode::PARTIAL_CONTENT)
            .header(header::CONTENT_TYPE, mime)
            .header(header::ACCEPT_RANGES, "bytes")
            .header(header::CONTENT_RANGE, format!("bytes 0-{}/{len}", CHUNK - 1))
            .header(header::CONTENT_LENGTH, CHUNK.to_string())
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(buf)
            .unwrap();
    }
    let mut buf = Vec::with_capacity(len as usize);
    if file.read_to_end(&mut buf).is_err() {
        return respond(StatusCode::INTERNAL_SERVER_ERROR, b"read failed".to_vec());
    }
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, buf.len().to_string())
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(buf)
        .unwrap()
}
