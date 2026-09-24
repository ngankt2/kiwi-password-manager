use super::*;
use serde_json::{json, Value};
use std::{
    fs,
    io::{Read, Write},
    net::TcpListener,
    sync::Arc,
    thread,
};

struct Server {
    url: String,
    response: Arc<Mutex<(Value, Vec<u8>)>>,
    stop: Arc<AtomicBool>,
    thread: Option<thread::JoinHandle<()>>,
}
impl Server {
    fn new() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        listener.set_nonblocking(true).unwrap();
        let response = Arc::new(Mutex::new((Value::Null, Vec::<u8>::new())));
        let stop = Arc::new(AtomicBool::new(false));
        let data = response.clone();
        let stopped = stop.clone();
        let thread = thread::spawn(move || {
            while !stopped.load(Ordering::Acquire) {
                let Ok((mut stream, _)) = listener.accept() else {
                    thread::sleep(Duration::from_millis(2));
                    continue;
                };
                // macOS can inherit the listener's nonblocking mode. Large real
                // payloads need blocking writes instead of truncating at WouldBlock.
                stream.set_nonblocking(false).unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                stream
                    .set_write_timeout(Some(Duration::from_secs(30)))
                    .unwrap();
                let mut request = [0_u8; 8192];
                let length = stream.read(&mut request).unwrap_or(0);
                let request = String::from_utf8_lossy(&request[..length]);
                let body = if request.starts_with("GET /latest ") {
                    serde_json::to_vec(&data.lock().unwrap().0).unwrap()
                } else {
                    data.lock().unwrap().1.clone()
                };
                write!(stream, "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n", body.len()).unwrap();
                let _ = stream.write_all(&body);
            }
        });
        Self {
            url,
            response,
            stop,
            thread: Some(thread),
        }
    }
    fn release(&self, version: &str, signature: &str, bytes: &[u8]) {
        *self.response.lock().unwrap() = (
            json!({"version":version,"notes":"Synthetic updater test","platforms":{"darwin-aarch64":{"url":format!("{}/update.app.tar.gz",self.url),"signature":signature},"darwin-x86_64":{"url":format!("{}/update.app.tar.gz",self.url),"signature":signature}}}),
            bytes.to_vec(),
        );
    }
}
impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        self.thread.take().unwrap().join().unwrap();
    }
}

#[test]
fn signed_updater_checks_downloads_rejects_tampering_and_installs_only_into_a_disposable_bundle() {
    let fixtures = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/updates");
    let public = fs::read_to_string(fixtures.join("updater.pub")).unwrap();
    let signature = fs::read_to_string(fixtures.join("update.app.tar.gz.sig")).unwrap();
    let bytes = fs::read(fixtures.join("update.app.tar.gz")).unwrap();
    let server = Server::new();
    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    // Insecure loopback transport exists exclusively in this unit test context.
    context.config_mut().plugins.0.insert("updater".into(), json!({"pubkey":public.trim(),"dangerousInsecureTransportProtocol":true,"requireSignedVersion":true,"endpoints":[format!("{}/latest",server.url)]}));
    let app = tauri::test::mock_builder()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .build(context)
        .unwrap();
    let directory = tempfile::tempdir().unwrap();
    let binary = directory
        .path()
        .join("Installed.app/Contents/MacOS/fixture");
    fs::create_dir_all(binary.parent().unwrap()).unwrap();
    fs::write(&binary, b"old application").unwrap();
    fs::write(
        directory.path().join("Installed.app/Contents/Info.plist"),
        b"fixture",
    )
    .unwrap();
    let updater = app
        .updater_builder()
        .executable_path(&binary)
        .no_proxy()
        .timeout(Duration::from_secs(3))
        .build()
        .unwrap();
    tauri::async_runtime::block_on(async {
        server.release("9.9.9", signature.trim(), &bytes);
        let update = updater.check().await.unwrap().unwrap();
        let mut progress = 0;
        let mut verifying = false;
        let verified = update
            .download(|length, _| progress += length, || verifying = true)
            .await
            .unwrap();
        assert!(verifying);
        assert_eq!(progress, bytes.len());
        assert_eq!(verified, bytes);
        let mut tampered = bytes.clone();
        tampered[20] ^= 1;
        server.release("9.9.9", signature.trim(), &tampered);
        let bad = updater.check().await.unwrap().unwrap();
        assert_eq!(
            classify(&bad.download(|_, _| {}, || {}).await.unwrap_err()),
            "INVALID_SIGNATURE"
        );
        assert_eq!(fs::read(&binary).unwrap(), b"old application");
        server.release("9.9.10", signature.trim(), &bytes);
        let mismatched = updater.check().await.unwrap().unwrap();
        assert!(matches!(
            mismatched.download(|_, _| {}, || {}).await.unwrap_err(),
            tauri_plugin_updater::Error::SignedVersionMismatch { .. }
        ));
        let unversioned = fs::read_to_string(fixtures.join("unversioned.sig")).unwrap();
        server.release("9.9.9", unversioned.trim(), &bytes);
        let unsigned_version = updater.check().await.unwrap().unwrap();
        assert!(matches!(
            unsigned_version
                .download(|_, _| {}, || {})
                .await
                .unwrap_err(),
            tauri_plugin_updater::Error::MissingSignedVersion
        ));
        server.release("0.0.1", signature.trim(), &bytes);
        assert!(updater.check().await.unwrap().is_none());
        *server.response.lock().unwrap() = (json!({"version":"0.0.0","platforms":{}}), Vec::new());
        assert!(matches!(
            updater.check().await,
            Err(tauri_plugin_updater::Error::TargetsNotFound(_))
        ));
        // Use the already verified bytes; the real Tauri installer runs here.
        update.install(verified).unwrap();
        assert_eq!(
            fs::read(&binary).unwrap(),
            b"synthetic signed replacement\n"
        );
    });
}

#[test]
#[ignore = "Run with KIRO_TEST_RELEASE_DIR after a signed production build"]
fn packaged_release_signature_version_and_installation_are_valid() {
    let directory = PathBuf::from(
        std::env::var_os("KIRO_TEST_RELEASE_DIR")
            .expect("Set KIRO_TEST_RELEASE_DIR to the local release artifacts"),
    );
    let manifest: Value =
        serde_json::from_slice(&fs::read(directory.join("latest.json")).unwrap()).unwrap();
    let platform = if cfg!(target_arch = "aarch64") {
        "darwin-aarch64"
    } else {
        "darwin-x86_64"
    };
    let url: tauri::Url = manifest["platforms"][platform]["url"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    let version = manifest["version"].as_str().unwrap();
    assert!(valid_download(&url, version));
    let bytes =
        fs::read(directory.join(url.path_segments().unwrap().next_back().unwrap())).unwrap();
    let public =
        fs::read_to_string(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("updater.pub")).unwrap();
    let server = Server::new();
    server.release(
        version,
        manifest["platforms"][platform]["signature"]
            .as_str()
            .unwrap(),
        &bytes,
    );
    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    context.config_mut().plugins.0.insert("updater".into(), json!({"pubkey":public.trim(),"dangerousInsecureTransportProtocol":true,"requireSignedVersion":true,"endpoints":[format!("{}/latest",server.url)]}));
    let app = tauri::test::mock_builder()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .build(context)
        .unwrap();
    let disposable = tempfile::tempdir().unwrap();
    let bundle = disposable.path().join("Appkiro Password Manager.app");
    let binary = bundle.join("Contents/MacOS/appkiro-password-manager");
    fs::create_dir_all(binary.parent().unwrap()).unwrap();
    fs::write(&binary, b"old test bundle").unwrap();
    fs::write(bundle.join("Contents/Info.plist"), b"old test bundle").unwrap();
    let updater = app
        .updater_builder()
        .executable_path(&binary)
        .no_proxy()
        .timeout(Duration::from_secs(30))
        .build()
        .unwrap();
    tauri::async_runtime::block_on(async {
        let update = updater.check().await.unwrap().unwrap();
        let verified = update.download(|_, _| {}, || {}).await.unwrap();
        update.install(verified).unwrap();
    });
    assert!(std::process::Command::new("codesign")
        .args(["--verify", "--deep", "--strict"])
        .arg(&bundle)
        .status()
        .unwrap()
        .success());
    let output = std::process::Command::new("/usr/libexec/PlistBuddy")
        .args(["-c", "Print CFBundleShortVersionString"])
        .arg(bundle.join("Contents/Info.plist"))
        .output()
        .unwrap();
    assert!(output.status.success());
    assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), version);
}
