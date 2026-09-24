use chrono::{DateTime, Utc};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt};
use std::{
    fs::{self, DirBuilder, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};

pub type Result<T> = std::result::Result<T, &'static str>;
pub const MAX_BYTES: usize = 67_108_864;
pub fn io_error(error: std::io::Error) -> &'static str {
    match error.raw_os_error() {
        Some(libc::ENOENT) => "NOT_FOUND",
        Some(libc::EACCES | libc::EPERM | libc::ELOOP) => "PERMISSION",
        Some(libc::ENOSPC | libc::EDQUOT) => "STORAGE_FULL",
        Some(libc::EEXIST) => "CONFLICT",
        _ => "SAVE_FAILED",
    }
}
pub fn private_dir(path: &Path) -> Result<()> {
    DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(path)
        .map_err(io_error)
}
pub fn encrypted(bytes: &[u8]) -> Result<()> {
    if bytes.len() < 28 || &bytes[..8] != b"KIROVLT\0" {
        return Err("INVALID_FILE");
    }
    if bytes.len() > MAX_BYTES {
        return Err("LIMIT_EXCEEDED");
    }
    Ok(())
}
pub fn valid_id(id: &str) -> Result<()> {
    if id.is_empty()
        || id.len() > 160
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        Err("VALIDATION")
    } else {
        Ok(())
    }
}
pub fn valid_name(name: &str) -> Result<()> {
    if name.is_empty() || name.encode_utf16().count() > 4096 {
        Err("VALIDATION")
    } else {
        Ok(())
    }
}
pub fn revision(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}
pub fn stamp() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
pub fn read_bounded(path: &Path, limit: usize) -> Result<(Vec<u8>, String)> {
    let file = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW)
        .open(path)
        .map_err(io_error)?;
    let metadata = file.metadata().map_err(io_error)?;
    if !metadata.is_file() {
        return Err("PERMISSION");
    }
    if metadata.len() > limit as u64 {
        return Err("LIMIT_EXCEEDED");
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(io_error)?;
    if bytes.len() > limit {
        return Err("LIMIT_EXCEEDED");
    }
    let updated: DateTime<Utc> = metadata.modified().map_err(io_error)?.into();
    Ok((
        bytes,
        updated.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    ))
}
pub fn read_json(path: &Path, limit: usize) -> Result<Value> {
    serde_json::from_slice(&read_bounded(path, limit)?.0).map_err(|_| "VALIDATION")
}
pub fn write_new(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW)
        .open(path)
        .map_err(io_error)?;
    file.write_all(bytes).map_err(io_error)?;
    file.sync_all().map_err(io_error)
}
pub fn write_verified(path: &Path, bytes: &[u8]) -> Result<()> {
    write_new(path, bytes)?;
    if revision(&read_bounded(path, MAX_BYTES)?.0) != revision(bytes) {
        return Err("SAVE_FAILED");
    }
    Ok(())
}
pub fn sync_directory(path: &Path) {
    if let Ok(dir) = File::open(path) {
        let _ = dir.sync_all();
    }
}
pub fn atomic_json(directory: &Path, filename: &str, value: &Value) -> Result<()> {
    let temporary = directory.join(format!("{filename}-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let bytes = serde_json::to_vec(value).map_err(|_| "VALIDATION")?;
        write_verified(&temporary, &bytes)?;
        fs::rename(&temporary, directory.join(filename)).map_err(io_error)?;
        sync_directory(directory);
        Ok(())
    })();
    let _ = fs::remove_file(&temporary);
    result
}
pub fn safe_name(name: &str, maximum: usize) -> String {
    let result: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_control() || "/\\<>:\"|?*".contains(c) {
                '-'
            } else {
                c
            }
        })
        .take(maximum)
        .collect();
    if result.is_empty() {
        "Vault".into()
    } else {
        result
    }
}
pub fn vault_filename(name: &str) -> String {
    let lower = name.to_lowercase();
    let base = if lower.ends_with(".akpr") {
        &name[..name.len() - 5]
    } else if lower.ends_with(".vault") {
        &name[..name.len() - 6]
    } else {
        name
    };
    format!("{}.akpr", if base.is_empty() { "Vault" } else { base })
}
pub fn vault_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|x| x.to_str())
        .is_some_and(|x| x.eq_ignore_ascii_case("akpr") || x.eq_ignore_ascii_case("vault"))
}

pub struct FileStore {
    pub root: PathBuf,
}
impl FileStore {
    pub fn path(&self, relative: &str) -> Result<PathBuf> {
        let parts: Vec<_> = relative.split('/').collect();
        if parts.len() != 3 || !["vaults", "backups"].contains(&parts[0]) || relative.contains("..")
        {
            return Err("VALIDATION");
        }
        valid_id(parts[1])?;
        if parts[2].is_empty()
            || parts[2].len() > 240
            || !parts[2]
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_.:-".contains(&b))
        {
            return Err("VALIDATION");
        }
        let path = self.root.join(relative);
        private_dir(path.parent().ok_or("VALIDATION")?)?;
        let root = fs::canonicalize(&self.root).map_err(io_error)?;
        let parent = fs::canonicalize(path.parent().unwrap()).map_err(io_error)?;
        if !parent.starts_with(&root) || parent == root {
            return Err("PERMISSION");
        }
        Ok(path)
    }
    pub fn read(&self, path: &str) -> Result<Vec<u8>> {
        Ok(read_bounded(&self.path(path)?, MAX_BYTES)?.0)
    }
    pub fn write(&self, path: &str, bytes: &[u8]) -> Result<()> {
        if bytes.len() > MAX_BYTES {
            return Err("VALIDATION");
        }
        if path.ends_with(".vault") || path.ends_with(".vault.tmp") {
            encrypted(bytes)?;
        } else if path.ends_with(".meta") {
            if bytes.len() > 32768 {
                return Err("VALIDATION");
            }
            let value: Value = serde_json::from_slice(bytes).map_err(|_| "VALIDATION")?;
            let object = value.as_object().ok_or("VALIDATION")?;
            for (key, value) in object {
                if !["name", "updatedAt", "id", "vaultId", "createdAt", "reason"]
                    .contains(&key.as_str())
                    || value
                        .as_str()
                        .is_none_or(|s| s.encode_utf16().count() > 4096)
                {
                    return Err("VALIDATION");
                }
            }
        } else {
            return Err("VALIDATION");
        }
        write_new(&self.path(path)?, bytes)
    }
    pub fn promote(&self, from: &str, to: &str) -> Result<()> {
        if !from.ends_with(".vault.tmp")
            || !to.ends_with(".vault")
            || Path::new(from).parent() != Path::new(to).parent()
        {
            return Err("VALIDATION");
        }
        let source = self.path(from)?;
        let destination = self.path(to)?;
        if !fs::symlink_metadata(&source).map_err(io_error)?.is_file() {
            return Err("PERMISSION");
        }
        fs::hard_link(&source, &destination).map_err(io_error)?;
        File::open(destination.parent().unwrap())
            .and_then(|dir| dir.sync_all())
            .map_err(io_error)?;
        fs::remove_file(&source).map_err(io_error)
    }
    pub fn remove(&self, path: &str) -> Result<()> {
        match fs::remove_file(self.path(path)?) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(io_error(e)),
        }
    }
    pub fn list(&self, prefix: &str) -> Result<Vec<String>> {
        let parts: Vec<_> = prefix.split('/').collect();
        if !(parts.len() == 2 || parts.len() == 3)
            || !["vaults", "backups"].contains(&parts[0])
            || parts.last() != Some(&"")
        {
            return Err("VALIDATION");
        }
        if parts.len() == 3 {
            valid_id(parts[1])?;
        }
        private_dir(&self.root)?;
        let mut found = Vec::new();
        fn visit(root: &Path, path: &Path, prefix: &str, found: &mut Vec<String>) -> Result<()> {
            for entry in fs::read_dir(path).map_err(io_error)? {
                let entry = entry.map_err(io_error)?;
                let kind = entry.file_type().map_err(io_error)?;
                if kind.is_symlink() {
                    continue;
                }
                if kind.is_dir() {
                    visit(root, &entry.path(), prefix, found)?;
                } else if kind.is_file() {
                    let path = entry.path();
                    let local = path
                        .strip_prefix(root)
                        .map_err(|_| "PERMISSION")?
                        .to_string_lossy();
                    if local.starts_with(prefix) {
                        found.push(local.into_owned());
                    }
                }
            }
            Ok(())
        }
        visit(&self.root, &self.root, prefix, &mut found)?;
        Ok(found)
    }
}
