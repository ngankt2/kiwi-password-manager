pub mod backup;
pub mod biometric;
pub mod commands;
pub mod files;
pub mod icons;
pub mod linked_files;
pub mod preferences;
#[cfg(feature = "runtime-tests")]
mod runtime_tests;
pub mod security;
#[cfg(test)]
mod tests;
pub mod updates;

use files::*;
use serde_json::Value;
use std::{
    path::PathBuf,
    process::Child,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
};
use tauri::{
    menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Emitter, Manager, Theme, WebviewWindowBuilder,
};

pub struct Host {
    pub directory: PathBuf,
    /// Native helper for clipboard, activity monitoring and Touch ID.
    pub helper: PathBuf,
    pub files: FileStore,
    pub linked: Mutex<linked_files::LinkedVaultFiles>,
    pub mirror: Mutex<backup::BackupMirror>,
    pub settings: Mutex<Value>,
    pub clipboard: Mutex<security::Clipboard>,
    pub device_locked: AtomicBool,
    pub active: AtomicBool,
    pub active_dialogs: AtomicUsize,
    pub quitting: AtomicBool,
    pub monitor: Mutex<Option<Child>>,
    pub zoom: Mutex<f64>,
}
impl Host {
    pub fn new(directory: PathBuf, helper: PathBuf) -> Result<Self> {
        private_dir(&directory)?;
        let root = directory.join("encrypted-files");
        private_dir(&root)?;
        let settings = preferences::read(&directory);
        Ok(Self {
            linked: Mutex::new(linked_files::LinkedVaultFiles::new(directory.clone())?),
            mirror: Mutex::new(backup::BackupMirror::new(directory.clone())),
            directory,
            helper: helper.clone(),
            files: FileStore { root },
            settings: Mutex::new(settings),
            clipboard: Mutex::new(security::Clipboard {
                helper,
                token: None,
            }),
            device_locked: AtomicBool::new(false),
            active: AtomicBool::new(true),
            active_dialogs: AtomicUsize::new(0),
            quitting: AtomicBool::new(false),
            monitor: Mutex::new(None),
            zoom: Mutex::new(1.0),
        })
    }
}
pub fn trusted_url(url: &tauri::Url) -> bool {
    url.scheme() == "tauri"
        && url.host_str() == Some("localhost")
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
}
fn data_directory(app: &AppHandle) -> tauri::Result<PathBuf> {
    if let Some(path) = std::env::var_os("KIRO_DESKTOP_TEST_DATA")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
    {
        return Ok(path);
    }
    // Deliberately preserve the original host's data path; no vault migration/copy is needed.
    Ok(app.path().data_dir()?.join("Kiro Vault"))
}
fn update_menu(app: &AppHandle, settings: &Value) -> tauri::Result<()> {
    let about = PredefinedMenuItem::about(
        app,
        None,
        Some(AboutMetadata {
            name: Some("Kiwi Password".into()),
            version: Some(app.package_info().version.to_string()),
            copyright: Some("Appkiro".into()),
            ..Default::default()
        }),
    )?;
    let lock = MenuItem::with_id(
        app,
        "lock",
        preferences::text(settings, "Khoá Vault"),
        true,
        Some("CmdOrCtrl+L"),
    )?;
    let check = MenuItem::with_id(
        app,
        "check-updates",
        preferences::text(settings, "Kiểm tra cập nhật…"),
        true,
        None::<&str>,
    )?;
    let application = Submenu::with_items(
        app,
        "Kiwi Password",
        true,
        &[
            &about,
            &check,
            &PredefinedMenuItem::separator(app)?,
            &lock,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    let view = Submenu::with_items(
        app,
        preferences::text(settings, "Xem"),
        true,
        &[
            &MenuItem::with_id(app, "zoom-reset", "Actual Size", true, Some("CmdOrCtrl+0"))?,
            &MenuItem::with_id(app, "zoom-in", "Zoom In", true, Some("CmdOrCtrl+Plus"))?,
            &MenuItem::with_id(app, "zoom-out", "Zoom Out", true, Some("CmdOrCtrl+-"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                "fullscreen",
                "Toggle Full Screen",
                true,
                Some("Ctrl+Command+F"),
            )?,
        ],
    )?;
    let window = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;
    app.set_menu(Menu::with_items(
        app,
        &[&application, &edit, &view, &window],
    )?)?;
    Ok(())
}
fn background(window: &tauri::WebviewWindow) {
    let dark = window.theme().ok() == Some(Theme::Dark);
    let color = if dark {
        tauri::window::Color(30, 33, 43, 255)
    } else {
        tauri::window::Color(247, 247, 249, 255)
    };
    let _ = window.set_background_color(Some(color));
}
pub fn apply_preferences(app: &AppHandle, settings: &Value) {
    let theme = match settings["theme"].as_str() {
        Some("dark") => Some(Theme::Dark),
        Some("light") => Some(Theme::Light),
        _ => None,
    };
    app.set_theme(theme);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_theme(theme);
        background(&window);
    }
    let _ = update_menu(app, settings);
}
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::desktop_call,
            updates::desktop_update_state,
            updates::desktop_update_check,
            updates::desktop_update_download,
            updates::desktop_update_restart
        ])
        .setup(|app| {
            let directory = data_directory(app.handle())?;
            let helper = if cfg!(debug_assertions) {
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.desktop-stage/kiro-security")
            } else {
                app.path()
                    .resolve("kiro-security", tauri::path::BaseDirectory::Resource)?
            };
            let host =
                Arc::new(Host::new(directory, helper.clone()).map_err(std::io::Error::other)?);
            app.manage(host.clone());
            app.manage(updates::Updates::new(
                app.package_info().version.to_string(),
            ));
            #[cfg(feature = "runtime-tests")]
            app.manage(runtime_tests::RuntimeTests::default());
            let config = app
                .config()
                .app
                .windows
                .first()
                .ok_or("Missing desktop window")?;
            let window = WebviewWindowBuilder::from_config(app, config)?
                .on_navigation(trusted_url)
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .on_web_resource_request(|_, response| {
                    response
                        .headers_mut()
                        .insert("Cache-Control", "no-store".parse().unwrap());
                    response
                        .headers_mut()
                        .insert("Referrer-Policy", "no-referrer".parse().unwrap());
                    response
                        .headers_mut()
                        .insert("X-Content-Type-Options", "nosniff".parse().unwrap());
                })
                .on_page_load(|window, payload| {
                    if payload.event() == tauri::webview::PageLoadEvent::Finished {
                        let _ = window.show();
                        let _ = window.set_focus();
                        #[cfg(feature = "runtime-tests")]
                        runtime_tests::start(&window);
                    }
                })
                .build()?;
            apply_preferences(app.handle(), &host.settings.lock().unwrap());
            let app_handle = app.handle().clone();
            window.on_window_event(move |event| {
                let host = app_handle.state::<Arc<Host>>();
                match event {
                    tauri::WindowEvent::Focused(true) => {
                        host.active.store(true, Ordering::Release);
                        security::sync_activity(&app_handle);
                    }
                    tauri::WindowEvent::Focused(false) => {
                        if host.active_dialogs.load(Ordering::Acquire) == 0
                            || !host.active.load(Ordering::Acquire)
                        {
                            security::emit(&app_handle, "background");
                        }
                    }
                    tauri::WindowEvent::ThemeChanged(_) => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            background(&window);
                        }
                    }
                    tauri::WindowEvent::Destroyed => app_handle.exit(0),
                    _ => {}
                }
            });
            *host.monitor.lock().unwrap() = Some(
                security::start_monitor(app.handle(), &helper).map_err(std::io::Error::other)?,
            );
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "check-updates" {
                let _ = app.emit_to("main", "updates:open", ());
                return;
            }
            if event.id().as_ref() == "lock" {
                security::emit(app, "lock");
                return;
            }
            if let Some(window) = app.get_webview_window("main") {
                match event.id().as_ref() {
                    "fullscreen" => {
                        let _ = window.set_fullscreen(!window.is_fullscreen().unwrap_or(false));
                    }
                    "zoom-reset" | "zoom-in" | "zoom-out" => {
                        let host = app.state::<Arc<Host>>();
                        let mut scale = host.zoom.lock().unwrap();
                        *scale = match event.id().as_ref() {
                            "zoom-in" => (*scale * 1.2).min(4.0),
                            "zoom-out" => (*scale / 1.2).max(0.25),
                            _ => 1.0,
                        };
                        let _ = window.set_zoom(*scale);
                    }
                    _ => {}
                }
            }
        });
    #[cfg(feature = "runtime-tests")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        commands::desktop_call,
        updates::desktop_update_state,
        updates::desktop_update_check,
        updates::desktop_update_download,
        updates::desktop_update_restart,
        runtime_tests::test_control,
        runtime_tests::test_report,
        runtime_tests::test_single_instance
    ]);
    let application = builder
        .build(tauri::generate_context!())
        .expect("Could not initialize the desktop host");
    application.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            let host = app.state::<Arc<Host>>().inner().clone();
            if !host.quitting.swap(true, Ordering::AcqRel) {
                api.prevent_exit();
                let app = app.clone();
                std::thread::spawn(move || {
                    security::shutdown(&host);
                    app.exit(0);
                });
            }
        }
    });
}
