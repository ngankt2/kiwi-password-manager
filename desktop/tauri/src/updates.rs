use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_updater::{Update, UpdaterExt};

pub const CHANNEL: &str = "https://raw.githubusercontent.com/ngankt2/appkiro.com/main/updates/appkiro-password-manager/latest.json";
type Result<T> = std::result::Result<T, &'static str>;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    version: String,
    notes: String,
    published_at: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    status: &'static str,
    current_version: String,
    release: Option<Release>,
    checked_at: Option<String>,
    received_bytes: u64,
    total_bytes: Option<u64>,
    error: Option<&'static str>,
    unavailable_reason: Option<&'static str>,
}
pub struct Updates {
    busy: AtomicBool,
    pending: Mutex<Option<Update>>,
    view: Mutex<View>,
}
struct Operation<'a>(&'a AtomicBool);
impl Drop for Operation<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
impl Updates {
    pub fn new(version: String) -> Self {
        Self {
            busy: AtomicBool::new(false),
            pending: Mutex::new(None),
            view: Mutex::new(View {
                status: if cfg!(debug_assertions) {
                    "unavailable"
                } else {
                    "idle"
                },
                current_version: version,
                release: None,
                checked_at: None,
                received_bytes: 0,
                total_bytes: None,
                error: None,
                unavailable_reason: if cfg!(debug_assertions) {
                    Some("development")
                } else {
                    None
                },
            }),
        }
    }
    fn begin(&self) -> Result<Operation<'_>> {
        self.busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| "BUSY")?;
        Ok(Operation(&self.busy))
    }
    fn snapshot(&self) -> View {
        self.view.lock().unwrap().clone()
    }
    fn publish(&self, app: &AppHandle, change: impl FnOnce(&mut View)) -> View {
        let view = {
            let mut view = self.view.lock().unwrap();
            change(&mut view);
            view.clone()
        };
        let _ = app.emit_to("main", "updates:state", &view);
        view
    }
    fn failed(&self, app: &AppHandle, error: &'static str) -> View {
        *self.pending.lock().unwrap() = None;
        self.publish(app, |view| {
            view.status = "error";
            view.error = Some(error);
            view.release = None;
        })
    }
}
fn trusted(window: &WebviewWindow) -> Result<()> {
    if window.label() != "main" || !window.url().is_ok_and(|url| crate::trusted_url(&url)) {
        return Err("PERMISSION");
    }
    Ok(())
}
fn classify(error: &tauri_plugin_updater::Error) -> &'static str {
    use tauri_plugin_updater::Error::*;
    match error {
        Minisign(_)
        | Base64(_)
        | SignatureUtf8(_)
        | SignedVersionMismatch { .. }
        | MissingSignedVersion => "INVALID_SIGNATURE",
        Semver(_) | Serialization(_) | UrlParse(_) | InsecureTransportProtocol => {
            "INVALID_MANIFEST"
        }
        Io(error) => match error.kind() {
            std::io::ErrorKind::StorageFull => "STORAGE_FULL",
            std::io::ErrorKind::PermissionDenied => "INSTALL_LOCATION",
            _ => "INSTALL_FAILED",
        },
        BinaryNotFoundInArchive | InvalidUpdaterFormat => "INVALID_ARCHIVE",
        Reqwest(_) | Network(_) | ReleaseNotFound => "NETWORK",
        _ => "INSTALL_FAILED",
    }
}
pub fn valid_download(url: &tauri::Url, version: &str) -> bool {
    let prefix =
        format!("/ngankt2/appkiro.com/releases/download/appkiro-password-manager-v{version}/");
    let Some(file) = url.path().strip_prefix(&prefix) else {
        return false;
    };
    url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && file.ends_with(".app.tar.gz")
        && file.len() <= 240
        && file
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
}
fn installed_bundle(executable: &Path) -> Result<PathBuf> {
    let bundle = executable
        .parent()
        .and_then(Path::parent)
        .and_then(Path::parent)
        .ok_or("INSTALL_LOCATION")?;
    if executable
        .parent()
        .and_then(Path::file_name)
        .is_none_or(|s| s != "MacOS")
        || bundle.extension().is_none_or(|s| s != "app")
        || bundle.join("Contents/Info.plist").is_file() == false
    {
        return Err("INSTALL_LOCATION");
    }
    let path = bundle.to_str().ok_or("INSTALL_LOCATION")?;
    // Require an installed, writable bundle. Avoid the plugin's privileged
    // AppleScript fallback for translocated, read-only or unusual bundle paths.
    if path.starts_with("/Volumes/")
        || path.contains("/AppTranslocation/")
        || path.chars().any(|c| c.is_control() || "'\"\\".contains(c))
    {
        return Err("INSTALL_LOCATION");
    }
    for directory in [bundle, bundle.parent().ok_or("INSTALL_LOCATION")?] {
        let path = std::ffi::CString::new(directory.as_os_str().as_encoded_bytes())
            .map_err(|_| "INSTALL_LOCATION")?;
        if unsafe { libc::access(path.as_ptr(), libc::W_OK) } != 0 {
            return Err("INSTALL_LOCATION");
        }
    }
    Ok(bundle.to_path_buf())
}

#[tauri::command]
pub fn desktop_update_state(window: WebviewWindow, state: State<'_, Updates>) -> Result<View> {
    trusted(&window)?;
    Ok(state.snapshot())
}

#[tauri::command]
pub async fn desktop_update_check(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, Updates>,
) -> Result<View> {
    trusted(&window)?;
    let Ok(_operation) = state.begin() else {
        return Ok(state.snapshot());
    };
    let current = state.snapshot();
    if ["ready", "restarting"].contains(&current.status)
        || current.unavailable_reason == Some("development")
    {
        return Ok(current);
    }
    // An unsuccessful recheck can never leave an older release installable.
    *state.pending.lock().unwrap() = None;
    state.publish(&app, |view| {
        view.status = "checking";
        view.release = None;
        view.error = None;
        view.unavailable_reason = None;
        view.received_bytes = 0;
        view.total_bytes = None;
    });
    let result = match app
        .updater_builder()
        .endpoints(vec![CHANNEL.parse().unwrap()])
        .and_then(|builder| builder.timeout(Duration::from_secs(20)).build())
    {
        Ok(updater) => updater.check().await,
        Err(error) => Err(error),
    };
    state.publish(&app, |view| view.checked_at = Some(crate::files::stamp()));
    match result {
        Ok(Some(mut update)) => {
            if !valid_download(&update.download_url, &update.version) {
                return Ok(state.failed(&app, "INVALID_MANIFEST"));
            }
            update.timeout = Some(Duration::from_secs(15 * 60));
            let release = Release {
                version: update.version.clone(),
                notes: update
                    .body
                    .as_deref()
                    .unwrap_or("")
                    .chars()
                    .take(16_384)
                    .collect(),
                published_at: update.date.map(|date| date.to_string()),
            };
            *state.pending.lock().unwrap() = Some(update);
            Ok(state.publish(&app, |view| {
                view.status = "available";
                view.release = Some(release);
            }))
        }
        Ok(None) => Ok(state.publish(&app, |view| view.status = "current")),
        Err(
            tauri_plugin_updater::Error::TargetNotFound(_)
            | tauri_plugin_updater::Error::TargetsNotFound(_),
        ) => Ok(state.publish(&app, |view| {
            view.status = "unavailable";
            view.unavailable_reason = Some("unpublished");
        })),
        Err(error) => Ok(state.failed(&app, classify(&error))),
    }
}

#[tauri::command]
pub async fn desktop_update_download(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, Updates>,
    version: String,
) -> Result<View> {
    trusted(&window)?;
    let _operation = state.begin()?;
    if state.snapshot().status != "available" {
        return Err("INVALID_MANIFEST");
    }
    let update = state
        .pending
        .lock()
        .unwrap()
        .as_ref()
        .filter(|update| update.version == version)
        .cloned()
        .ok_or("INVALID_MANIFEST")?;
    if std::env::current_exe()
        .ok()
        .and_then(|path| installed_bundle(&path).ok())
        .is_none()
    {
        return Ok(state.failed(&app, "INSTALL_LOCATION"));
    }
    state.publish(&app, |view| {
        view.status = "downloading";
        view.received_bytes = 0;
        view.total_bytes = None;
        view.error = None;
    });
    let mut received = 0_u64;
    let mut progress = Instant::now();
    let bytes = update
        .download(
            |length, total| {
                received = received.saturating_add(length as u64);
                if progress.elapsed() >= Duration::from_millis(100) || Some(received) == total {
                    state.publish(&app, |view| {
                        view.received_bytes = received;
                        view.total_bytes = total;
                    });
                    progress = Instant::now();
                }
            },
            || {
                state.publish(&app, |view| view.status = "verifying");
            },
        )
        .await;
    let bytes = match bytes {
        Ok(bytes) => bytes,
        Err(error) => return Ok(state.failed(&app, classify(&error))),
    };
    // Tauri has verified both the signature and signed version before any install.
    state.publish(&app, |view| view.status = "staging");
    let result = tauri::async_runtime::spawn_blocking(move || update.install(bytes)).await;
    match result {
        Ok(Ok(())) => {
            *state.pending.lock().unwrap() = None;
            Ok(state.publish(&app, |view| view.status = "ready"))
        }
        Ok(Err(error)) => Ok(state.failed(&app, classify(&error))),
        Err(_) => Ok(state.failed(&app, "INSTALL_FAILED")),
    }
}

#[tauri::command]
pub async fn desktop_update_restart(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, Updates>,
    version: String,
) -> Result<View> {
    trusted(&window)?;
    let _operation = state.begin()?;
    let current = state.snapshot();
    if current.status != "ready"
        || current
            .release
            .as_ref()
            .is_none_or(|release| release.version != version)
    {
        return Err("INVALID_MANIFEST");
    }
    let view = state.publish(&app, |view| view.status = "restarting");
    let host = app.state::<std::sync::Arc<crate::Host>>().inner().clone();
    // Restart bypasses prevent_exit; finish native cleanup before requesting it.
    tauri::async_runtime::spawn_blocking(move || crate::security::shutdown(&host))
        .await
        .map_err(|_| "INSTALL_FAILED")?;
    app.request_restart();
    Ok(view)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn operations_do_not_overlap_and_error_paths_release_the_guard() {
        let state = Updates::new("1.0.0".into());
        let guard = state.begin().unwrap();
        assert!(state.begin().is_err());
        drop(guard);
        assert!(state.begin().is_ok());
    }
    #[test]
    fn releases_are_scoped_to_the_product_and_exact_version() {
        let good = "https://github.com/ngankt2/appkiro.com/releases/download/appkiro-password-manager-v1.2.3/Appkiro_1.2.3_arm64.app.tar.gz";
        assert!(valid_download(&good.parse().unwrap(), "1.2.3"));
        for bad in [
            good.replace("https:", "http:"),
            good.replace("appkiro-password-manager", "agentprofiles"),
            good.replace("github.com/", "github.com.evil.invalid/"),
            good.replace("Appkiro_", "../Appkiro_"),
            format!("{good}?token=private"),
        ] {
            assert!(!valid_download(&bad.parse().unwrap(), "1.2.3"));
        }
        assert!(!valid_download(&good.parse().unwrap(), "1.2.4"));
    }
}

#[cfg(test)]
#[path = "updater_tests.rs"]
mod updater_tests;
