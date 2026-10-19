use crate::{files::*, Host};
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Read, Write},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{atomic::Ordering, Arc},
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};
use wait_timeout::ChildExt;
use zeroize::Zeroize;

pub struct Clipboard {
    pub helper: PathBuf,
    pub token: Option<u64>,
}
/// Run one JSON request through the native helper. Secrets in `value` and `key` are
/// zeroized once serialized; `wait` bounds how long a request (such as Touch ID) may take.
pub fn helper_request(helper: &PathBuf, mut request: Value, wait: Duration) -> Result<Value> {
    let mut payload = serde_json::to_vec(&request).map_err(|_| "VALIDATION")?;
    for field in ["value", "key"] {
        if let Some(Value::String(value)) = request.get_mut(field) {
            value.zeroize();
        }
    }
    let mut child = Command::new(helper)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "PERMISSION")?;
    let sent = child.stdin.take().ok_or("PERMISSION")?.write_all(&payload);
    payload.zeroize();
    if sent.is_err() {
        let _ = child.kill();
        let _ = child.wait();
        return Err("PERMISSION");
    }
    let status = child.wait_timeout(wait).map_err(|_| "PERMISSION")?;
    if status.is_none() {
        let _ = child.kill();
        let _ = child.wait();
        return Err("CANCELLED");
    }
    if !status.unwrap().success() {
        return Err("PERMISSION");
    }
    let mut output = Vec::new();
    child
        .stdout
        .take()
        .ok_or("PERMISSION")?
        .take(4097)
        .read_to_end(&mut output)
        .map_err(|_| "PERMISSION")?;
    if output.len() > 4096 {
        output.zeroize();
        return Err("PERMISSION");
    }
    let reply = serde_json::from_slice(&output).map_err(|_| "PERMISSION");
    output.zeroize();
    reply
}
impl Clipboard {
    fn request(&self, request: Value) -> Result<Value> {
        helper_request(&self.helper, request, Duration::from_secs(5)).map_err(|code| {
            if code == "CANCELLED" {
                "PERMISSION"
            } else {
                code
            }
        })
    }
    pub fn copy(&mut self, mut value: String) -> Result<String> {
        let result = self.request(json!({"action": "copy", "value": value}));
        value.zeroize();
        let token = result?["token"].as_u64().ok_or("PERMISSION")?;
        self.token = Some(token);
        Ok(token.to_string())
    }
    pub fn clear(&mut self, token: Option<u64>) -> Result<bool> {
        let Some(owner) = token.or(self.token) else {
            return Ok(false);
        };
        let response = self.request(json!({"action": "clear", "token": owner}))?;
        if self.token == Some(owner) {
            self.token = None;
        }
        Ok(response["cleared"].as_bool().unwrap_or(false))
    }
}
pub fn emit(app: &AppHandle, kind: &str) {
    let _ = app.emit_to("main", "security:event", kind);
    if ["deviceLocked", "lock"].contains(&kind) {
        let host = app.state::<Arc<Host>>().inner().clone();
        std::thread::spawn(move || {
            let _ = host.clipboard.lock().map(|mut c| c.clear(None));
        });
    }
}
pub fn sync_activity(app: &AppHandle) {
    let host = app.state::<Arc<Host>>();
    if host.device_locked.load(Ordering::Acquire) {
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        let visible =
            window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(true);
        let foreground = visible
            && host.active.load(Ordering::Acquire)
            && (window.is_focused().unwrap_or(false)
                || host.active_dialogs.load(Ordering::Acquire) > 0);
        emit(
            app,
            if foreground {
                "foreground"
            } else {
                "background"
            },
        );
    }
}
pub fn shutdown(host: &Host) {
    host.quitting.store(true, Ordering::Release);
    let _ = host
        .clipboard
        .lock()
        .map(|mut clipboard| clipboard.clear(None));
    if let Some(mut monitor) = host.monitor.lock().unwrap().take() {
        let _ = monitor.kill();
        let _ = monitor.wait();
    }
}
pub struct DialogActivity(AppHandle);
impl DialogActivity {
    pub fn new(app: &AppHandle) -> Self {
        app.state::<Arc<Host>>()
            .active_dialogs
            .fetch_add(1, Ordering::AcqRel);
        Self(app.clone())
    }
}
impl Drop for DialogActivity {
    fn drop(&mut self) {
        self.0
            .state::<Arc<Host>>()
            .active_dialogs
            .fetch_sub(1, Ordering::AcqRel);
        sync_activity(&self.0);
    }
}
pub fn start_monitor(app: &AppHandle, helper: &PathBuf) -> Result<Child> {
    let mut child = Command::new(helper)
        .arg("--watch")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "PERMISSION")?;
    let output = child.stdout.take().ok_or("PERMISSION")?;
    let app = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(output)
            .lines()
            .map_while(std::result::Result::ok)
        {
            if line.len() > 32 {
                break;
            }
            let host = app.state::<Arc<Host>>();
            match line.as_str() {
                "deviceLocked" => {
                    host.device_locked.store(true, Ordering::Release);
                    emit(&app, "deviceLocked");
                }
                "deviceUnlocked" => {
                    host.device_locked.store(false, Ordering::Release);
                    sync_activity(&app);
                }
                "foreground" => {
                    host.active.store(true, Ordering::Release);
                    sync_activity(&app);
                }
                "background" => {
                    host.active.store(false, Ordering::Release);
                    emit(&app, "background");
                }
                _ => break,
            }
        }
        let host = app.state::<Arc<Host>>();
        if !host.quitting.load(Ordering::Acquire) {
            host.device_locked.store(true, Ordering::Release);
            emit(&app, "deviceLocked");
        }
    });
    Ok(child)
}
