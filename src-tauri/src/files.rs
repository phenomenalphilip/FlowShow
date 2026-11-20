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

fn percent_decode(s: &str) -> String {
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

/// A request for http://media.localhost/<URL-encoded path>: the file, or the asked-for piece of it
pub fn serve_media(request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let raw = request.uri().path().trim_start_matches('/');
    let path = PathBuf::from(percent_decode(raw));
    // Only pictures, videos and sound: never any other file on the computer
    let Some(mime) = mime_for(&path) else { return respond(StatusCode::FORBIDDEN, b"not a media file".to_vec()) };
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
