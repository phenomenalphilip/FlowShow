//! The phone remote: a small web server on the church network. A phone or tablet opens its address in any browser,
//! types the PIN shown in FlowShow, and can then move through the slides, tap a slide or setlist item, and clear.
//!
//! - GET  /                → the remote page (remote.html)
//! - POST /login           → body: the PIN; answers a session key
//! - GET  /events?k=KEY    → Server-Sent Events: what FlowShow shows (the open show, the setlist, what is live)
//! - POST /command?k=KEY   → body: a command (JSON), passed to FlowShow's window as the event "remote-command"
//!
//! FlowShow's window publishes its state with `publish` (kept, and sent to every phone); commands go the other way.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use tauri::Emitter;

pub const PORT: u16 = 5510;
const PAGE: &str = include_str!("remote.html");

struct Remote {
    app: tauri::AppHandle,
    pin: String,
    /// Session keys handed out after a right PIN
    sessions: Vec<String>,
    /// The latest state of each kind ("show", "live", "setlist"), sent to phones as they connect
    state: HashMap<String, String>,
    /// Phones listening for changes
    listeners: Vec<TcpStream>,
    /// Wrong PINs lately (a guesser is slowed down)
    wrong: Vec<Instant>,
    running: Arc<AtomicBool>,
}

static REMOTE: OnceLock<Mutex<Option<Remote>>> = OnceLock::new();
fn remote() -> &'static Mutex<Option<Remote>> {
    REMOTE.get_or_init(|| Mutex::new(None))
}

fn random_digits(n: usize) -> String {
    use std::hash::{BuildHasher, Hasher};
    let mut out = String::new();
    while out.len() < n {
        let v = std::collections::hash_map::RandomState::new().build_hasher().finish();
        out.push_str(&format!("{:010}", v % 10_000_000_000));
    }
    out[..n].to_string()
}
fn random_key() -> String {
    use std::hash::{BuildHasher, Hasher};
    let a = std::collections::hash_map::RandomState::new().build_hasher().finish();
    let b = std::collections::hash_map::RandomState::new().build_hasher().finish();
    format!("{a:016x}{b:016x}")
}

/// This computer's address on the local network (no data is sent: it only asks which network card would be used)
pub fn local_ip() -> Option<String> {
    let s = UdpSocket::bind("0.0.0.0:0").ok()?;
    s.connect("8.8.8.8:80").ok()?;
    Some(s.local_addr().ok()?.ip().to_string())
}

#[derive(serde::Serialize)]
pub struct Info {
    pub running: bool,
    pub url: Option<String>,
    pub pin: Option<String>,
    pub phones: usize,
}

pub fn info() -> Info {
    let guard = remote().lock().unwrap();
    match guard.as_ref() {
        Some(r) => Info {
            running: true,
            url: local_ip().map(|ip| format!("http://{ip}:{PORT}")),
            pin: Some(r.pin.clone()),
            phones: r.listeners.len(),
        },
        None => Info { running: false, url: None, pin: None, phones: 0 },
    }
}

/// Start the remote (a new PIN each time); already running = no change
pub fn start(app: tauri::AppHandle) -> Result<Info, String> {
    {
        let mut guard = remote().lock().unwrap();
        if guard.is_none() {
            let listener = TcpListener::bind(("0.0.0.0", PORT)).map_err(|e| format!("the remote couldn't start on port {PORT}: {e}"))?;
            let running = Arc::new(AtomicBool::new(true));
            *guard = Some(Remote { app, pin: random_digits(4), sessions: Vec::new(), state: HashMap::new(), listeners: Vec::new(), wrong: Vec::new(), running: running.clone() });
            thread::Builder::new()
                .name("phone remote".into())
                .spawn(move || {
                    for conn in listener.incoming() {
                        if !running.load(Ordering::SeqCst) {
                            break;
                        }
                        if let Ok(conn) = conn {
                            let _ = thread::Builder::new().name("remote request".into()).spawn(move || {
                                let _ = handle(conn);
                            });
                        }
                    }
                })
                .map_err(|e| e.to_string())?;
            // Keep phones' connections alive (and notice ones that went away)
            let alive = guard.as_ref().unwrap().running.clone();
            let _ = thread::Builder::new().name("remote keep-alive".into()).spawn(move || {
                while alive.load(Ordering::SeqCst) {
                    thread::sleep(Duration::from_secs(15));
                    broadcast(": still here\n\n");
                }
            });
        }
    }
    Ok(info())
}

/// Stop the remote: phones are disconnected and must type the (new) PIN next time
pub fn stop() {
    if let Some(r) = remote().lock().unwrap().take() {
        r.running.store(false, Ordering::SeqCst);
        for mut l in r.listeners {
            let _ = l.shutdown(std::net::Shutdown::Both);
            let _ = &mut l;
        }
        // Wake the listening thread so it notices
        let _ = TcpStream::connect(("127.0.0.1", PORT));
    }
}

/// FlowShow's window: what it shows now (kind: "show", "live" or "setlist"; json: its data)
pub fn publish(kind: &str, json: &str) {
    let changed = {
        let mut guard = remote().lock().unwrap();
        let Some(r) = guard.as_mut() else { return };
        if r.state.get(kind).is_some_and(|v| v == json) {
            false
        } else {
            r.state.insert(kind.to_string(), json.to_string());
            true
        }
    };
    if changed {
        broadcast(&sse(kind, json));
    }
}

fn sse(kind: &str, json: &str) -> String {
    format!("event: {kind}\ndata: {json}\n\n")
}

fn broadcast(message: &str) {
    let mut guard = remote().lock().unwrap();
    let Some(r) = guard.as_mut() else { return };
    r.listeners.retain_mut(|l| l.write_all(message.as_bytes()).and_then(|_| l.flush()).is_ok());
}

fn reply(conn: &mut TcpStream, status: &str, kind: &str, body: &[u8]) -> std::io::Result<()> {
    conn.write_all(
        format!(
            "HTTP/1.1 {status}\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
            body.len()
        )
        .as_bytes(),
    )?;
    conn.write_all(body)
}

fn query_key(target: &str) -> Option<String> {
    target.split_once('?')?.1.split('&').filter_map(|p| p.split_once('=')).find(|(k, _)| *k == "k").map(|(_, v)| v.to_string())
}

fn signed_in(key: Option<&str>) -> bool {
    let guard = remote().lock().unwrap();
    match (guard.as_ref(), key) {
        (Some(r), Some(k)) => r.sessions.iter().any(|s| s == k),
        _ => false,
    }
}

fn handle(mut conn: TcpStream) -> std::io::Result<()> {
    conn.set_read_timeout(Some(Duration::from_secs(10)))?;
    let _ = conn.set_nodelay(true);
    // Read the request: head, then the body (Content-Length)
    let mut data = Vec::with_capacity(2048);
    let mut chunk = [0u8; 2048];
    let head_end = loop {
        let n = conn.read(&mut chunk)?;
        if n == 0 {
            return Ok(());
        }
        data.extend_from_slice(&chunk[..n]);
        if let Some(p) = data.windows(4).position(|w| w == b"\r\n\r\n") {
            break p + 4;
        }
        if data.len() > 64 * 1024 {
            return reply(&mut conn, "413 Too Large", "text/plain", b"too large");
        }
    };
    let head = String::from_utf8_lossy(&data[..head_end]).to_string();
    let mut lines = head.lines();
    let first = lines.next().unwrap_or("");
    let mut parts = first.split_whitespace();
    let method = parts.next().unwrap_or("");
    let target = parts.next().unwrap_or("/").to_string();
    let length: usize = lines
        .filter_map(|l| l.split_once(':'))
        .find(|(k, _)| k.trim().eq_ignore_ascii_case("content-length"))
        .and_then(|(_, v)| v.trim().parse().ok())
        .unwrap_or(0)
        .min(64 * 1024);
    let mut body = data[head_end..].to_vec();
    while body.len() < length {
        let n = conn.read(&mut chunk)?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&chunk[..n]);
    }
    let path = target.split('?').next().unwrap_or("/");
    let key = query_key(&target);

    match (method, path) {
        ("GET", "/") | ("GET", "/index.html") => reply(&mut conn, "200 OK", "text/html; charset=utf-8", PAGE.as_bytes()),
        ("POST", "/login") => {
            let typed = String::from_utf8_lossy(&body).trim().to_string();
            let answer = {
                let mut guard = remote().lock().unwrap();
                let Some(r) = guard.as_mut() else { return reply(&mut conn, "503 Off", "text/plain", b"off") };
                r.wrong.retain(|t| t.elapsed() < Duration::from_secs(60));
                if r.wrong.len() >= 10 {
                    Err("too many tries: wait a minute")
                } else if typed == r.pin {
                    let k = random_key();
                    r.sessions.push(k.clone());
                    Ok(k)
                } else {
                    r.wrong.push(Instant::now());
                    Err("wrong PIN")
                }
            };
            match answer {
                Ok(k) => reply(&mut conn, "200 OK", "text/plain", k.as_bytes()),
                Err(e) => reply(&mut conn, "403 Forbidden", "text/plain", e.as_bytes()),
            }
        }
        ("GET", "/check") => {
            if signed_in(key.as_deref()) { reply(&mut conn, "200 OK", "text/plain", b"ok") } else { reply(&mut conn, "403 Forbidden", "text/plain", b"sign in") }
        }
        ("GET", "/events") => {
            if !signed_in(key.as_deref()) {
                return reply(&mut conn, "403 Forbidden", "text/plain", b"sign in");
            }
            conn.set_read_timeout(None)?;
            conn.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\nConnection: keep-alive\r\n\r\n")?;
            // Everything known so far, then changes as they come
            let mut guard = remote().lock().unwrap();
            let Some(r) = guard.as_mut() else { return Ok(()) };
            for kind in ["setlist", "show", "live"] {
                if let Some(json) = r.state.get(kind) {
                    conn.write_all(sse(kind, json).as_bytes())?;
                }
            }
            conn.flush()?;
            r.listeners.push(conn);
            Ok(())
        }
        ("POST", "/command") => {
            if !signed_in(key.as_deref()) {
                return reply(&mut conn, "403 Forbidden", "text/plain", b"sign in");
            }
            let command: serde_json::Value = serde_json::from_slice(&body).unwrap_or(serde_json::Value::Null);
            let app = remote().lock().unwrap().as_ref().map(|r| r.app.clone());
            if let (Some(app), true) = (app, command.is_object()) {
                let _ = app.emit_to("main", "remote-command", command);
                reply(&mut conn, "200 OK", "text/plain", b"ok")
            } else {
                reply(&mut conn, "400 Bad Request", "text/plain", b"bad command")
            }
        }
        _ => reply(&mut conn, "404 Not Found", "text/plain", b"not found"),
    }
}
