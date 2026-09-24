use crate::files::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Serialize, Deserialize)]
struct BackupRecord {
    file: String,
    reason: String,
}
pub struct BackupMirror {
    directory: PathBuf,
    folder: Option<PathBuf>,
    failed: bool,
}
impl BackupMirror {
    pub fn new(directory: PathBuf) -> Self {
        let folder = read_json(&directory.join("backup-location.json"), 4096)
            .ok()
            .and_then(|v| {
                v["folder"]
                    .as_str()
                    .filter(|s| s.starts_with('/'))
                    .map(PathBuf::from)
            });
        Self {
            directory,
            folder,
            failed: false,
        }
    }
    pub fn status(&self) -> Value {
        json!({"path": self.folder, "failed": self.failed})
    }
    pub fn choose(&mut self, parent: &Path) -> Result<Value> {
        let folder = fs::canonicalize(parent)
            .map_err(io_error)?
            .join("Kiro Vault Backups");
        private_dir(&folder)?;
        atomic_json(
            &self.directory,
            "backup-location.json",
            &json!({"folder": folder}),
        )?;
        self.folder = Some(folder);
        self.failed = false;
        Ok(self.status())
    }
    pub fn mirror(&mut self, name: &str, date: &str, reason: &str, bytes: &[u8], retention: usize) {
        let Some(folder) = self.folder.clone() else {
            return;
        };
        let temporary = folder.join(format!(".kiro-{}.tmp", uuid::Uuid::new_v4()));
        let result = (|| -> Result<()> {
            encrypted(bytes)?;
            let stamp: String = date
                .chars()
                .filter(|c| c.is_ascii_digit())
                .take(14)
                .collect();
            let file = vault_filename(&format!(
                "{}-{stamp}-{}",
                safe_name(name, 100),
                &uuid::Uuid::new_v4().to_string()[..8]
            ));
            write_verified(&temporary, bytes)?;
            fs::rename(&temporary, folder.join(&file)).map_err(io_error)?;
            let mut records: Vec<BackupRecord> =
                read_json(&folder.join(".kiro-backup-index.json"), 1_048_576)
                    .ok()
                    .and_then(|v| v.as_array().cloned())
                    .unwrap_or_default()
                    .into_iter()
                    .filter_map(|v| serde_json::from_value::<BackupRecord>(v).ok())
                    .filter(|r| {
                        !r.file.contains("..")
                            && Path::new(&r.file).file_name().and_then(|s| s.to_str())
                                == Some(r.file.as_str())
                            && vault_extension(Path::new(&r.file))
                    })
                    .collect();
            records.insert(
                0,
                BackupRecord {
                    file,
                    reason: reason.into(),
                },
            );
            let mut automatic = 0;
            let (keep, remove): (Vec<_>, Vec<_>) = records.into_iter().partition(|row| {
                if row.reason != "automatic" {
                    true
                } else {
                    automatic += 1;
                    automatic <= retention.clamp(1, 100)
                }
            });
            atomic_json(
                &folder,
                ".kiro-backup-index.json",
                &serde_json::to_value(&keep).map_err(|_| "VALIDATION")?,
            )?;
            for row in remove {
                let _ = fs::remove_file(folder.join(row.file));
            }
            Ok(())
        })();
        self.failed = result.is_err();
        let _ = fs::remove_file(temporary);
    }
}
