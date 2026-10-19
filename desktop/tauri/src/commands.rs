use crate::{biometric, files::*, preferences, security, Host};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{atomic::Ordering, Arc},
    time::Duration,
};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize)]
pub struct Reply {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    value: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    code: Option<&'static str>,
}
impl From<Result<Value>> for Reply {
    fn from(value: Result<Value>) -> Self {
        match value {
            Ok(value) => Self {
                ok: true,
                value: Some(value),
                code: None,
            },
            Err(code) => Self {
                ok: false,
                value: None,
                code: Some(code),
            },
        }
    }
}
pub fn string(args: &[Value], index: usize) -> Result<&str> {
    args.get(index).and_then(Value::as_str).ok_or("VALIDATION")
}
pub fn bytes(args: &[Value], index: usize) -> Result<Vec<u8>> {
    let value = string(args, index)?;
    if value.len() > MAX_BYTES.div_ceil(3) * 4 {
        return Err("LIMIT_EXCEEDED");
    }
    let bytes = STANDARD.decode(value).map_err(|_| "VALIDATION")?;
    if bytes.len() > MAX_BYTES {
        return Err("LIMIT_EXCEEDED");
    }
    Ok(bytes)
}
fn selected_path(path: Option<tauri_plugin_dialog::FilePath>) -> Result<Option<PathBuf>> {
    path.map(|p| p.into_path().map_err(|_| "VALIDATION"))
        .transpose()
}
fn text(host: &Host, source: &str) -> String {
    preferences::text(&host.settings.lock().unwrap(), source)
}
fn export_selected(
    window: &WebviewWindow,
    app: &AppHandle,
    host: &Host,
    args: &[Value],
) -> Result<Value> {
    let name = string(args, 0)?;
    let bytes = bytes(args, 1)?;
    let plaintext = args[2].as_bool().ok_or("VALIDATION")?;
    if !plaintext {
        encrypted(&bytes)?;
    }
    let safe = safe_name(
        Path::new(name)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("Vault"),
        180,
    );
    let filename = if plaintext {
        safe
    } else {
        vault_filename(&safe)
    };
    let extension = if plaintext {
        Path::new(name)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("txt")
    } else {
        "akpr"
    };
    let _activity = security::DialogActivity::new(app);
    let selected = app
        .dialog()
        .file()
        .set_parent(window)
        .set_can_create_directories(true)
        .set_title(text(
            host,
            if plaintext {
                "Lưu file không mã hoá"
            } else {
                "Lưu kho mã hoá"
            },
        ))
        .set_file_name(filename)
        .add_filter(
            text(
                host,
                if plaintext {
                    "File xuất"
                } else {
                    "Kho mã hoá"
                },
            ),
            &[extension],
        )
        .blocking_save_file();
    let Some(destination) = selected_path(selected)? else {
        return Ok(json!(false));
    };
    if !plaintext
        && destination
            .extension()
            .and_then(|s| s.to_str())
            .is_none_or(|s| !s.eq_ignore_ascii_case("akpr"))
    {
        return Err("VALIDATION");
    }
    if plaintext {
        write_verified(&destination, &bytes)?;
        return Ok(json!(true));
    }
    let parent = destination.parent().ok_or("VALIDATION")?;
    let temporary = parent.join(format!(
        ".{}-{}.tmp",
        destination.file_name().unwrap().to_string_lossy(),
        uuid::Uuid::new_v4()
    ));
    let result = (|| {
        write_verified(&temporary, &bytes)?;
        match fs::symlink_metadata(&destination) {
            Ok(metadata) => {
                if !metadata.is_file() || metadata.file_type().is_symlink() {
                    return Err("PERMISSION");
                }
                let backup = PathBuf::from(format!(
                    "{}.backup-{}.akpr",
                    destination.display(),
                    chrono::Utc::now().timestamp_millis()
                ));
                let (previous, _) = read_bounded(&destination, MAX_BYTES)?;
                write_new(&backup, &previous)?;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(io_error(error)),
        }
        fs::rename(&temporary, &destination).map_err(io_error)?;
        std::fs::File::open(parent)
            .and_then(|directory| directory.sync_all())
            .map_err(io_error)?;
        Ok(json!(true))
    })();
    let _ = fs::remove_file(&temporary);
    result
}
pub fn validate_external_url(value: &str) -> Result<tauri::Url> {
    if value.len() > 8192 {
        return Err("VALIDATION");
    }
    let url = tauri::Url::parse(value).map_err(|_| "VALIDATION")?;
    if !["http", "https"].contains(&url.scheme())
        || !url.username().is_empty()
        || url.password().is_some()
        || url.host_str().is_none()
    {
        return Err("VALIDATION");
    }
    Ok(url)
}
pub fn expected_args(channel: &str) -> Option<usize> {
    match channel {
        "vault-files:list" | "dialog:open" | "preferences:read" | "security:locked"
        | "backup:status" | "backup:folder" | "biometric:support" => Some(0),
        "files:read" | "files:remove" | "files:list" | "vault-files:read"
        | "vault-files:forget" | "preferences:write" | "clipboard:clear" | "external:open"
        | "biometric:enrolled" | "biometric:revoke" => Some(1),
        "files:write"
        | "files:promote"
        | "vault-files:choose-location"
        | "clipboard:copy"
        | "icons:fetch" => Some(2),
        "dialog:save" | "biometric:enroll" | "biometric:recover" => Some(3),
        "vault-files:attach" | "vault-files:write" => Some(4),
        "vault-files:relocate" => Some(5),
        _ => None,
    }
}
pub fn dispatch(
    window: &WebviewWindow,
    app: &AppHandle,
    host: &Arc<Host>,
    channel: &str,
    args: &[Value],
) -> Result<Value> {
    if expected_args(channel) != Some(args.len()) {
        return Err("VALIDATION");
    }
    let none = Value::Null;
    match channel {
        "icons:fetch" => {
            if host.device_locked.load(Ordering::SeqCst) {
                return Err("PERMISSION");
            }
            let result = crate::icons::fetch_resource(string(args, 0)?, string(args, 1)?)?;
            if host.device_locked.load(Ordering::SeqCst) {
                return Err("PERMISSION");
            }
            Ok(result)
        }
        "files:read" => Ok(json!(STANDARD.encode(host.files.read(string(args, 0)?)?))),
        "files:write" => {
            let path = string(args, 0)?;
            let data = bytes(args, 1)?;
            host.files.write(path, &data)?;
            if path.starts_with("backups/") && path.ends_with(".vault.meta") {
                let metadata: Value = serde_json::from_slice(&data).map_err(|_| "VALIDATION")?;
                if let (Some(name), Some(date), Some(reason)) = (
                    metadata["name"].as_str(),
                    metadata["createdAt"].as_str(),
                    metadata["reason"].as_str(),
                ) {
                    let data = host.files.read(&path[..path.len() - 5])?;
                    let retention = host.settings.lock().unwrap()["backupRetention"]
                        .as_u64()
                        .unwrap_or(10) as usize;
                    host.mirror
                        .lock()
                        .unwrap()
                        .mirror(name, date, reason, &data, retention);
                }
            }
            Ok(none)
        }
        "files:promote" => {
            host.files.promote(string(args, 0)?, string(args, 1)?)?;
            Ok(none)
        }
        "files:remove" => {
            host.files.remove(string(args, 0)?)?;
            Ok(none)
        }
        "files:list" => Ok(json!(host.files.list(string(args, 0)?)?)),
        "vault-files:list" => Ok(host.linked.lock().unwrap().list()),
        "vault-files:read" => host.linked.lock().unwrap().read(string(args, 0)?),
        "vault-files:attach" => host.linked.lock().unwrap().attach(
            string(args, 0)?,
            string(args, 1)?,
            &bytes(args, 2)?,
            string(args, 3)?,
        ),
        "vault-files:write" => host.linked.lock().unwrap().write(
            string(args, 0)?,
            string(args, 1)?,
            &bytes(args, 2)?,
            string(args, 3)?,
        ),
        "vault-files:relocate" => {
            if !args[3].is_null() && !args[3].is_string() {
                return Err("VALIDATION");
            }
            host.linked.lock().unwrap().relocate(
                string(args, 0)?,
                string(args, 1)?,
                &bytes(args, 2)?,
                args[3].as_str(),
                string(args, 4)?,
            )
        }
        "vault-files:forget" => {
            host.linked.lock().unwrap().forget(string(args, 0)?)?;
            Ok(none)
        }
        "vault-files:choose-location" => {
            let id = string(args, 0)?;
            let name = string(args, 1)?;
            valid_id(id)?;
            valid_name(name)?;
            let _activity = security::DialogActivity::new(app);
            let selection = app
                .dialog()
                .file()
                .set_parent(window)
                .set_title(text(host, "Chọn thư mục lưu Vault"))
                .set_can_create_directories(true)
                .blocking_pick_folder();
            match selected_path(selection)? {
                Some(path) => Ok(json!(host
                    .linked
                    .lock()
                    .unwrap()
                    .select_destination(id, name, &path)?)),
                None => Ok(none),
            }
        }
        "dialog:open" => {
            let _activity = security::DialogActivity::new(app);
            #[cfg(feature = "runtime-tests")]
            if let Some(path) = crate::runtime_tests::picked(app) {
                return host.linked.lock().unwrap().select_source(&path);
            }
            let selection = app
                .dialog()
                .file()
                .set_parent(window)
                .set_title(text(host, "Mở kho hoặc file để nhập"))
                .add_filter(
                    text(host, "Kho và file nhập"),
                    &["akpr", "vault", "kdbx", "key", "keyx", "json", "csv"],
                )
                .add_filter(text(host, "Tất cả file"), &["*"])
                .blocking_pick_file();
            let Some(path) = selected_path(selection)? else {
                return Ok(none);
            };
            if vault_extension(&path) {
                host.linked.lock().unwrap().select_source(&path)
            } else {
                let (data, _) = read_bounded(&path, MAX_BYTES)?;
                Ok(
                    json!({"name": path.file_name().unwrap().to_string_lossy(), "bytes": STANDARD.encode(data)}),
                )
            }
        }
        "dialog:save" => export_selected(window, app, host, args),
        "preferences:read" => {
            let settings = preferences::read(&host.directory);
            *host.settings.lock().unwrap() = settings.clone();
            crate::apply_preferences(app, &settings);
            Ok(settings)
        }
        "preferences:write" => {
            let settings = preferences::normalize(args[0].clone())?;
            atomic_json(&host.directory, "preferences.json", &settings)?;
            *host.settings.lock().unwrap() = settings.clone();
            crate::apply_preferences(app, &settings);
            Ok(none)
        }
        "clipboard:copy" => {
            let value = string(args, 0)?;
            let seconds = args[1].as_u64().ok_or("VALIDATION")?;
            if value.encode_utf16().count() > 4_194_304 || ![0, 10, 30, 60].contains(&seconds) {
                return Err("VALIDATION");
            }
            let token = {
                let mut clipboard = host.clipboard.lock().unwrap();
                if host.device_locked.load(Ordering::Acquire) {
                    return Err("CANCELLED");
                }
                clipboard.copy(value.into())?
            };
            if seconds > 0 {
                let host = host.clone();
                let owner = token.parse().map_err(|_| "PERMISSION")?;
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(seconds));
                    let mut clipboard = host.clipboard.lock().unwrap();
                    if clipboard.token == Some(owner) {
                        let _ = clipboard.clear(Some(owner));
                    }
                });
            }
            Ok(json!(token))
        }
        "clipboard:clear" => {
            let token = string(args, 0)?;
            if token.is_empty() || !token.bytes().all(|b| b.is_ascii_digit()) {
                return Ok(json!(false));
            }
            let Some(owner) = token.parse::<u64>().ok() else {
                return Ok(json!(false));
            };
            Ok(json!(host.clipboard.lock().unwrap().clear(Some(owner))?))
        }
        "security:locked" => Ok(json!(host.device_locked.load(Ordering::Acquire))),
        "biometric:support" => biometric::support(host),
        "biometric:enrolled" => biometric::enrolled(host, string(args, 0)?),
        "biometric:enroll" => {
            biometric::enroll(host, string(args, 0)?, string(args, 1)?, string(args, 2)?)
        }
        "biometric:recover" => {
            biometric::recover(host, string(args, 0)?, string(args, 1)?, string(args, 2)?)
        }
        "biometric:revoke" => biometric::revoke(host, string(args, 0)?),
        "backup:status" => Ok(host.mirror.lock().unwrap().status()),
        "backup:folder" => {
            let _activity = security::DialogActivity::new(app);
            let selection = app
                .dialog()
                .file()
                .set_parent(window)
                .set_title(text(host, "Chọn thư mục sao lưu mã hoá"))
                .set_can_create_directories(true)
                .blocking_pick_folder();
            let mut mirror = host.mirror.lock().unwrap();
            match selected_path(selection)? {
                Some(path) => mirror.choose(&path),
                None => Ok(mirror.status()),
            }
        }
        "external:open" => {
            let url = validate_external_url(string(args, 0)?)?;
            app.opener()
                .open_url(url.as_str(), None::<&str>)
                .map_err(|_| "PERMISSION")?;
            Ok(none)
        }
        _ => Err("VALIDATION"),
    }
}
#[tauri::command]
pub async fn desktop_call(
    window: WebviewWindow,
    app: AppHandle,
    channel: String,
    args: Vec<Value>,
) -> Reply {
    if window.label() != "main" || !window.url().is_ok_and(|url| crate::trusted_url(&url)) {
        return Err("PERMISSION").into();
    }
    let host = app.state::<Arc<Host>>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || dispatch(&window, &app, &host, &channel, &args))
        .await
        .unwrap_or(Err("SAVE_FAILED"))
        .into()
}
