// Compiled exclusively into a prepared debug test host, never into a distributable app.
use crate::{files::*, security, Host};
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::{AppHandle, Manager, WebviewWindow};
use wait_timeout::ChildExt;

#[derive(Default)]
pub struct RuntimeTests {
    started: AtomicBool,
    pub picker: Mutex<Option<PathBuf>>,
}
pub fn start(window: &WebviewWindow) {
    let app = window.app_handle();
    if std::env::var_os("KIRO_DESKTOP_TEST_DATA").is_none()
        || app
            .state::<RuntimeTests>()
            .started
            .swap(true, Ordering::AcqRel)
    {
        return;
    }
    if !cfg!(debug_assertions) {
        return;
    }
    // Test scripts may change independently of the prepared app. Never read/evaluate
    // external scripts in a distributable build or outside an isolated test profile.
    let script =
        std::fs::read_to_string(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test-runtime.js"))
            .expect("Prepare the native test harness before launching the test host");
    let _ = window.eval(script);
}
pub fn picked(app: &AppHandle) -> Option<PathBuf> {
    app.state::<RuntimeTests>().picker.lock().unwrap().take()
}
#[tauri::command]
pub fn test_control(app: AppHandle, window: WebviewWindow, action: String) -> Result<Value> {
    if !cfg!(debug_assertions)
        || std::env::var_os("KIRO_DESKTOP_TEST_DATA").is_none()
        || window.label() != "main"
    {
        return Err("PERMISSION");
    }
    let host = app.state::<Arc<Host>>();
    match action.as_str() {
        "configuration" => Ok(
            json!({"version": app.package_info().version.to_string(), "phase": read_json(&host.directory.join("test-input.json"), 4096)?["phase"]}),
        ),
        "pick-legacy" => {
            *app.state::<RuntimeTests>().picker.lock().unwrap() =
                Some(host.directory.join("legacy.vault"));
            Ok(Value::Null)
        }
        "minimum" | "standard" => {
            let (width, height) = if action == "minimum" {
                (760.0, 580.0)
            } else {
                (1320.0, 860.0)
            };
            window
                .set_size(tauri::LogicalSize::new(width, height))
                .map_err(|_| "PERMISSION")?;
            Ok(Value::Null)
        }
        "lock" => {
            host.device_locked.store(true, Ordering::Release);
            security::emit(&app, "deviceLocked");
            Ok(Value::Null)
        }
        "unlock" => {
            host.device_locked.store(false, Ordering::Release);
            security::emit(&app, "foreground");
            Ok(Value::Null)
        }
        "clipboard-other" => {
            let helper = host.clipboard.lock().unwrap().helper.clone();
            let mut external = security::Clipboard {
                helper,
                token: None,
            };
            external.copy("synthetic-runtime-newer-copy".into())?;
            Ok(Value::Null)
        }
        "window-count" => Ok(json!(app.webview_windows().len())),
        "window-state" => Ok(
            json!({"minimized":window.is_minimized().unwrap_or(false),"maximized":window.is_maximized().unwrap_or(false),"fullscreen":window.is_fullscreen().unwrap_or(false),"focused":window.is_focused().unwrap_or(false)}),
        ),
        "minimize" => {
            window.minimize().map_err(|_| "PERMISSION")?;
            Ok(Value::Null)
        }
        "restore" => {
            window.unminimize().map_err(|_| "PERMISSION")?;
            window.set_focus().map_err(|_| "PERMISSION")?;
            Ok(Value::Null)
        }
        "maximize" => {
            window.maximize().map_err(|_| "PERMISSION")?;
            Ok(Value::Null)
        }
        "unmaximize" => {
            window.unmaximize().map_err(|_| "PERMISSION")?;
            Ok(Value::Null)
        }
        _ => Err("VALIDATION"),
    }
}
#[tauri::command]
pub async fn test_single_instance(window: WebviewWindow) -> Result<bool> {
    if !cfg!(debug_assertions)
        || std::env::var_os("KIRO_DESKTOP_TEST_DATA").is_none()
        || window.label() != "main"
    {
        return Err("PERMISSION");
    }
    tauri::async_runtime::spawn_blocking(|| {
        let mut child =
            std::process::Command::new(std::env::current_exe().map_err(|_| "PERMISSION")?)
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
                .map_err(|_| "PERMISSION")?;
        let status = child
            .wait_timeout(std::time::Duration::from_secs(8))
            .map_err(|_| "PERMISSION")?;
        if status.is_none() {
            let _ = child.kill();
            let _ = child.wait();
        }
        Ok(status.is_some_and(|status| status.success()))
    })
    .await
    .map_err(|_| "PERMISSION")?
}
#[tauri::command]
pub fn test_report(app: AppHandle, report: Value) -> Result<()> {
    if !cfg!(debug_assertions) || std::env::var_os("KIRO_DESKTOP_TEST_DATA").is_none() {
        return Err("PERMISSION");
    }
    let host = app.state::<Arc<Host>>();
    atomic_json(&host.directory, "native-report.json", &report)?;
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(250));
        app.exit(0);
    });
    Ok(())
}
