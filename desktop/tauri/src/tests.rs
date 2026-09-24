use crate::{
    backup::BackupMirror, commands, files::*, linked_files::LinkedVaultFiles, preferences,
    security::Clipboard,
};
use serde_json::json;
use std::{
    fs,
    os::unix::fs::{symlink, PermissionsExt},
    path::PathBuf,
};

fn payload(value: u8) -> Vec<u8> {
    let mut bytes = vec![value; 64];
    bytes[..8].copy_from_slice(b"KIROVLT\0");
    bytes
}

#[test]
fn storage_rejects_traversal_plaintext_and_secret_metadata() {
    let directory = tempfile::tempdir().unwrap();
    let store = FileStore {
        root: directory.path().join("encrypted-files"),
    };
    for path in [
        "../../private",
        "/tmp/file",
        "vaults/../outside",
        "vaults/id/../../out",
        "vaults/id/file/child",
        "vaults/id/colon..meta",
    ] {
        assert_eq!(store.path(path).unwrap_err(), "VALIDATION");
    }
    assert_eq!(
        store
            .write("vaults/id/1.vault.tmp", b"plain password")
            .unwrap_err(),
        "INVALID_FILE"
    );
    assert_eq!(
        store
            .write("vaults/id/1.meta", br#"{"password":"secret"}"#)
            .unwrap_err(),
        "VALIDATION"
    );
    assert_eq!(
        store
            .write("vaults/id/1.meta", br#"{"name":1}"#)
            .unwrap_err(),
        "VALIDATION"
    );
    assert_eq!(
        store.write("vaults/id/1.txt", b"text").unwrap_err(),
        "VALIDATION"
    );
}
#[test]
fn no_follow_reads_and_escaped_parents_are_denied() {
    let directory = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let store = FileStore {
        root: directory.path().join("encrypted-files"),
    };
    private_dir(&store.root.join("vaults/id")).unwrap();
    fs::write(outside.path().join("1.vault"), payload(1)).unwrap();
    symlink(outside.path(), store.root.join("vaults/escape")).unwrap();
    assert_eq!(
        store.read("vaults/escape/1.vault").unwrap_err(),
        "PERMISSION"
    );
    symlink(
        outside.path().join("1.vault"),
        store.root.join("vaults/id/1.vault"),
    )
    .unwrap();
    assert_eq!(store.read("vaults/id/1.vault").unwrap_err(), "PERMISSION");
    assert!(store.list("vaults/").unwrap().is_empty());
}
#[test]
fn generations_are_private_exclusive_and_survive_restart() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path().join("encrypted-files");
    let store = FileStore { root: root.clone() };
    store.write("vaults/id/1.vault.tmp", &payload(1)).unwrap();
    store
        .promote("vaults/id/1.vault.tmp", "vaults/id/1.vault")
        .unwrap();
    assert_eq!(
        fs::metadata(root.join("vaults/id/1.vault"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o600
    );
    store.write("vaults/id/2.vault.tmp", &payload(2)).unwrap();
    assert_eq!(
        store
            .promote("vaults/id/2.vault.tmp", "vaults/id/1.vault")
            .unwrap_err(),
        "CONFLICT"
    );
    assert_eq!(store.read("vaults/id/1.vault").unwrap(), payload(1));
    store
        .promote("vaults/id/2.vault.tmp", "vaults/id/2.vault")
        .unwrap();
    assert_eq!(
        FileStore { root }.read("vaults/id/2.vault").unwrap(),
        payload(2)
    );
}
#[test]
fn linked_grants_preserve_schema_and_detect_external_changes() {
    let directory = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(directory.path()).unwrap();
    let prefs = root.join("preferences");
    let source = root.join("Legacy.vault");
    fs::write(&source, payload(1)).unwrap();
    let mut linked = LinkedVaultFiles::new(prefs.clone()).unwrap();
    assert_eq!(
        linked
            .attach("id", "Legacy", &payload(1), "renderer-path")
            .unwrap_err(),
        "PERMISSION"
    );
    let chosen = linked.select_source(&source).unwrap();
    let saved = linked
        .attach(
            "id",
            "Legacy",
            &payload(1),
            chosen["sourceToken"].as_str().unwrap(),
        )
        .unwrap();
    assert_eq!(saved["location"], source.to_string_lossy().as_ref());
    assert_eq!(saved["revision"], revision(&payload(1)));
    assert_eq!(
        linked
            .attach(
                "id",
                "Legacy",
                &payload(1),
                chosen["sourceToken"].as_str().unwrap()
            )
            .unwrap_err(),
        "PERMISSION"
    );
    let reopened = LinkedVaultFiles::new(prefs.clone()).unwrap();
    assert_eq!(reopened.list()[0]["id"], "id");
    fs::write(&source, payload(3)).unwrap();
    assert_eq!(
        linked
            .write(
                "id",
                "New",
                &payload(2),
                saved["revision"].as_str().unwrap()
            )
            .unwrap_err(),
        "CONFLICT"
    );
    assert_eq!(fs::read(&source).unwrap(), payload(3));
    linked
        .write("id", "New", &payload(2), &revision(&payload(3)))
        .unwrap();
    assert_eq!(fs::read(&source).unwrap(), payload(2));
    linked.forget("id").unwrap();
    assert!(fs::metadata(source).is_ok());
    assert_eq!(linked.list(), json!([]));
}
#[test]
fn relocation_never_overwrites_and_commits_binding_before_removing_source() {
    let directory = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(directory.path()).unwrap();
    let mut linked = LinkedVaultFiles::new(root.join("prefs")).unwrap();
    let destination = root.join("chosen");
    private_dir(&destination).unwrap();
    fs::write(destination.join("Test.akpr"), b"unrelated").unwrap();
    let token = linked
        .select_destination("id", "Test", &destination)
        .unwrap();
    assert_eq!(
        linked
            .relocate("id", "Test", &payload(1), None, &token)
            .unwrap_err(),
        "FILE_EXISTS"
    );
    assert_eq!(
        fs::read(destination.join("Test.akpr")).unwrap(),
        b"unrelated"
    );
    let source = root.join("Old.vault");
    fs::write(&source, payload(1)).unwrap();
    let chosen = linked.select_source(&source).unwrap();
    linked
        .attach(
            "id",
            "Old",
            &payload(1),
            chosen["sourceToken"].as_str().unwrap(),
        )
        .unwrap();
    let grant = linked
        .select_destination("id", "Old", &destination)
        .unwrap();
    let moved = linked
        .relocate(
            "id",
            "Old",
            &payload(1),
            Some(&revision(&payload(1))),
            &grant,
        )
        .unwrap();
    assert_eq!(moved["previousFileRetained"], false);
    assert!(!source.exists());
    assert_eq!(fs::read(destination.join("Old.vault")).unwrap(), payload(1));
    assert_eq!(
        LinkedVaultFiles::new(root.join("prefs"))
            .unwrap()
            .read("id")
            .unwrap()["revision"],
        revision(&payload(1))
    );
}
#[test]
fn internal_generations_cannot_be_attached_as_writable_files() {
    let directory = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(directory.path()).unwrap();
    let mut linked = LinkedVaultFiles::new(root.clone()).unwrap();
    let store = FileStore {
        root: root.join("encrypted-files"),
    };
    store.write("vaults/id/1.vault", &payload(1)).unwrap();
    assert_eq!(
        linked
            .select_source(&root.join("encrypted-files/vaults/id/1.vault"))
            .unwrap_err(),
        "PERMISSION"
    );
}
#[test]
fn mirror_keeps_manual_and_unrelated_files_and_reads_legacy_index() {
    let directory = tempfile::tempdir().unwrap();
    let prefs = directory.path().join("prefs");
    private_dir(&prefs).unwrap();
    let mut mirror = BackupMirror::new(prefs.clone());
    let status = mirror.choose(directory.path()).unwrap();
    let folder = PathBuf::from(status["path"].as_str().unwrap());
    fs::write(folder.join("unrelated.akpr"), b"unchanged").unwrap();
    fs::write(folder.join("legacy.vault"), payload(1)).unwrap();
    fs::write(folder.join("legacy-automatic.vault"), payload(1)).unwrap();
    atomic_json(&folder, ".kiro-backup-index.json", &json!([{"file":"legacy.vault","reason":"manual"},{"file":"legacy-automatic.vault","reason":"automatic"}])).unwrap();
    for _ in 0..4 {
        mirror.mirror("Test", &stamp(), "automatic", &payload(1), 2);
    }
    mirror.mirror("Test", &stamp(), "manual", &payload(1), 2);
    let index = read_json(&folder.join(".kiro-backup-index.json"), 1_048_576).unwrap();
    assert_eq!(index.as_array().unwrap().len(), 4);
    assert_eq!(
        fs::read(folder.join("unrelated.akpr")).unwrap(),
        b"unchanged"
    );
    assert!(!folder.join("legacy-automatic.vault").exists());
    assert!(index
        .as_array()
        .unwrap()
        .iter()
        .filter(|entry| entry["reason"] == "automatic")
        .all(|entry| entry["file"].as_str().unwrap().ends_with(".akpr")));
    assert_eq!(fs::read(folder.join("legacy.vault")).unwrap(), payload(1));
    assert_eq!(BackupMirror::new(prefs).status()["path"], status["path"]);
}
#[test]
fn preferences_keep_existing_fields_and_reject_unknown_inputs() {
    let old = preferences::normalize(json!({"language":"fr", "autoLockSeconds":0, "lockOnBackground":true, "clipboardSeconds":10})).unwrap();
    assert_eq!(old["language"], "fr");
    assert_eq!(old["autoLockSeconds"], -1);
    assert_eq!(old["backgroundLockSeconds"], 180);
    assert_eq!(old["clipboardSeconds"], 10);
    assert!(old["lastOpenedVaultId"].is_null());
    let recent =
        preferences::normalize(json!({"lastOpenedVaultId":"vault_123-test", "language":"fr"}))
            .unwrap();
    assert_eq!(recent["lastOpenedVaultId"], "vault_123-test");
    assert_eq!(recent["language"], "fr");
    for value in [
        json!({"backupRetention":101}),
        json!({"theme":"remote"}),
        json!({"lastOpenedVaultId":"../outside"}),
        json!({"lastOpenedVaultId":""}),
        json!({"lastOpenedVaultId":true}),
        json!({"secret":"value"}),
        json!([]),
    ] {
        assert!(preferences::normalize(value).is_err());
    }
    for locale in ["vi", "en", "fr", "es", "zh-CN"] {
        assert_eq!(
            preferences::normalize(json!({"language":locale})).unwrap()["language"],
            locale
        );
    }
}
#[test]
fn urls_and_channel_arguments_are_scoped() {
    for value in [
        "file:///etc/passwd",
        "javascript:alert(1)",
        "https://user:secret@example.com",
        "ftp://example.com",
    ] {
        assert_eq!(
            commands::validate_external_url(value).unwrap_err(),
            "VALIDATION"
        );
    }
    assert!(commands::validate_external_url("https://appkiro.com?utm_source=Appkiro").is_ok());
    assert_eq!(commands::expected_args("files:read"), Some(1));
    assert_eq!(commands::expected_args("shell:exec"), None);
    assert!(crate::trusted_url(
        &tauri::Url::parse("tauri://localhost/vault").unwrap()
    ));
    assert!(!crate::trusted_url(
        &tauri::Url::parse("https://localhost/vault").unwrap()
    ));
}
#[test]
fn native_clipboard_ownership_does_not_clear_a_newer_copy() {
    let helper =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.desktop-stage/kiro-security");
    let mut clipboard = Clipboard {
        helper: helper.clone(),
        token: None,
    };
    let first: u64 = clipboard
        .copy("synthetic-owner-one".into())
        .unwrap()
        .parse()
        .unwrap();
    let mut external = Clipboard {
        helper,
        token: None,
    };
    let next: u64 = external
        .copy("synthetic-owner-two".into())
        .unwrap()
        .parse()
        .unwrap();
    assert!(!clipboard.clear(Some(first)).unwrap());
    assert!(external.clear(Some(next)).unwrap());
}
