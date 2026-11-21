//! PowerPoint (and OpenDocument) presentations → PDF, so their slides can be shown as pictures.
//! Made by PowerPoint (if installed) or else LibreOffice (free) on this computer; neither → "NO_CONVERTER".

use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::time::{Duration, Instant};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// A slow conversion (a big deck) is given this long before it is stopped
const LIMIT: Duration = Duration::from_secs(180);

fn quiet(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

/// Wait for a converter, but not forever (a dialog it shows by itself would otherwise hang the import)
fn wait(mut child: Child) -> Result<i32, String> {
    let start = Instant::now();
    loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            return Ok(status.code().unwrap_or(-1));
        }
        if start.elapsed() > LIMIT {
            let _ = child.kill();
            return Err("the conversion took too long".into());
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

/// LibreOffice's program, where it is normally installed (or on the PATH)
fn soffice() -> Option<PathBuf> {
    let mut places: Vec<PathBuf> = Vec::new();
    for var in ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"] {
        if let Ok(base) = std::env::var(var) {
            places.push(Path::new(&base).join("LibreOffice").join("program").join("soffice.exe"));
        }
    }
    places.push(PathBuf::from("/Applications/LibreOffice.app/Contents/MacOS/soffice"));
    places.push(PathBuf::from("/usr/bin/soffice"));
    places.into_iter().find(|p| p.exists())
}

/// Which converter this computer has: "PowerPoint", "LibreOffice", or None (then a PowerPoint can't be imported)
pub fn available() -> Option<&'static str> {
    #[cfg(windows)]
    {
        let installed = quiet(Command::new("reg").args(["query", r"HKCR\PowerPoint.Application\CLSID"]))
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .is_ok_and(|s| s.success());
        if installed {
            return Some("PowerPoint");
        }
    }
    soffice().map(|_| "LibreOffice")
}

/// Ask PowerPoint to save it as PDF. Ok(false): PowerPoint isn't installed.
#[cfg(windows)]
fn with_powerpoint(input: &Path, output: &Path) -> Result<bool, String> {
    // Paths go in through the environment, so no quoting problems; exit 3 = no PowerPoint
    let script = "$ErrorActionPreference='Stop'; \
        try { $app = New-Object -ComObject PowerPoint.Application } catch { exit 3 }; \
        try { $p = $app.Presentations.Open($env:FS_IN, -1, 0, 0); $p.SaveAs($env:FS_OUT, 32); $p.Close() } \
        catch { exit 4 } \
        finally { if ($app.Presentations.Count -eq 0) { $app.Quit() } }";
    let child = quiet(Command::new("powershell").args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]))
        .env("FS_IN", input)
        .env("FS_OUT", output)
        .spawn()
        .map_err(|e| e.to_string())?;
    match wait(child)? {
        3 => Ok(false),
        0 if output.exists() => Ok(true),
        code => Err(format!("PowerPoint couldn't save it as PDF (code {code})")),
    }
}

#[cfg(not(windows))]
fn with_powerpoint(_input: &Path, _output: &Path) -> Result<bool, String> {
    Ok(false)
}

/// Ask LibreOffice to save it as PDF. Ok(false): LibreOffice isn't installed.
fn with_libreoffice(input: &Path, dir: &Path) -> Result<Option<PathBuf>, String> {
    let Some(program) = soffice() else { return Ok(None) };
    let child = quiet(Command::new(program).arg("--headless").arg("--convert-to").arg("pdf").arg("--outdir").arg(dir).arg(input))
        .spawn()
        .map_err(|e| e.to_string())?;
    wait(child)?;
    let made = dir.join(format!("{}.pdf", input.file_stem().and_then(|s| s.to_str()).unwrap_or("slides")));
    if made.exists() { Ok(Some(made)) } else { Err("LibreOffice couldn't save it as PDF".into()) }
}

/// The presentation (its bytes and file name) as PDF bytes
pub fn to_pdf(name: &str, bytes: &[u8]) -> Result<Vec<u8>, String> {
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let dir = std::env::temp_dir().join(format!("flowshow-convert-{stamp}"));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // Only a safe name (letters, numbers…), keeping the extension that tells the converter what it is
    let ext = Path::new(name).extension().and_then(|e| e.to_str()).unwrap_or("pptx").to_ascii_lowercase();
    let input = dir.join(format!("slides.{}", ext.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>()));
    let result = (|| {
        std::fs::write(&input, bytes).map_err(|e| e.to_string())?;
        let output = dir.join("from-powerpoint.pdf");
        if with_powerpoint(&input, &output)? {
            return std::fs::read(&output).map_err(|e| e.to_string());
        }
        if let Some(made) = with_libreoffice(&input, &dir)? {
            return std::fs::read(&made).map_err(|e| e.to_string());
        }
        Err("NO_CONVERTER".to_string())
    })();
    let _ = std::fs::remove_dir_all(&dir);
    result
}

/// Open a web page in the user's browser (https only)
pub fn open_web_page(url: &str) -> Result<(), String> {
    if !url.starts_with("https://") || url.chars().any(|c| c.is_whitespace() || c == '"') {
        return Err("only https web addresses".into());
    }
    #[cfg(windows)]
    let mut cmd = Command::new("explorer");
    #[cfg(target_os = "macos")]
    let mut cmd = Command::new("open");
    #[cfg(all(not(windows), not(target_os = "macos")))]
    let mut cmd = Command::new("xdg-open");
    cmd.arg(url).spawn().map(|_| ()).map_err(|e| e.to_string())
}
