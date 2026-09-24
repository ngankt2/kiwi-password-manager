use crate::files::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkRecord {
    pub id: String,
    pub name: String,
    pub location: String,
    pub updated_at: String,
}
#[derive(Clone)]
struct SourceGrant {
    location: String,
    revision: String,
}
#[derive(Clone)]
struct DestinationGrant {
    id: String,
    location: String,
}
pub struct LinkedVaultFiles {
    directory: PathBuf,
    entries: Vec<LinkRecord>,
    sources: Vec<(String, SourceGrant)>,
    destinations: Vec<(String, DestinationGrant)>,
}
fn grant<T>(grants: &mut Vec<(String, T)>, value: T) -> String {
    if grants.len() >= 32 {
        grants.remove(0);
    }
    let token = uuid::Uuid::new_v4().to_string();
    grants.push((token.clone(), value));
    token
}
fn record_json(entry: &LinkRecord, bytes: &[u8], updated_at: &str) -> Value {
    json!({ "id": entry.id, "name": entry.name, "location": entry.location, "updatedAt": updated_at,
        "bytes": STANDARD.encode(bytes), "revision": revision(bytes), "external": true })
}
impl LinkedVaultFiles {
    pub fn new(directory: PathBuf) -> Result<Self> {
        private_dir(&directory)?;
        let mut this = Self {
            directory,
            entries: vec![],
            sources: vec![],
            destinations: vec![],
        };
        match read_json(&this.directory.join("linked-vaults.json"), 1_048_576) {
            Ok(value) => {
                let entries: Vec<LinkRecord> =
                    serde_json::from_value(value).map_err(|_| "VALIDATION")?;
                if entries.len() > 2000 {
                    return Err("VALIDATION");
                }
                let mut ids = std::collections::HashSet::new();
                let mut paths = std::collections::HashSet::new();
                for entry in &entries {
                    valid_id(&entry.id)?;
                    valid_name(&entry.name)?;
                    if !Path::new(&entry.location).is_absolute()
                        || entry.location.contains('\0')
                        || chrono::DateTime::parse_from_rfc3339(&entry.updated_at).is_err()
                        || !ids.insert(&entry.id)
                        || !paths.insert(&entry.location)
                    {
                        return Err("VALIDATION");
                    }
                }
                this.entries = entries;
            }
            Err("NOT_FOUND") => {}
            Err(error) => return Err(error),
        }
        Ok(this)
    }
    fn canonical(&self, path: &Path) -> Result<PathBuf> {
        if !path.is_absolute() || path.to_string_lossy().contains('\0') {
            return Err("VALIDATION");
        }
        let parent = fs::canonicalize(path.parent().ok_or("VALIDATION")?).map_err(io_error)?;
        let canonical = parent.join(path.file_name().ok_or("VALIDATION")?);
        let managed = fs::canonicalize(&self.directory)
            .map_err(io_error)?
            .join("encrypted-files");
        if canonical.starts_with(managed) {
            return Err("PERMISSION");
        }
        Ok(canonical)
    }
    fn read_entry(&self, entry: &LinkRecord) -> Result<Value> {
        if self.canonical(Path::new(&entry.location))? != Path::new(&entry.location) {
            return Err("PERMISSION");
        }
        let (bytes, updated) = read_bounded(Path::new(&entry.location), MAX_BYTES)?;
        encrypted(&bytes)?;
        Ok(record_json(entry, &bytes, &updated))
    }
    fn persist(&mut self, next: Vec<LinkRecord>) -> Result<()> {
        if next.len() > 2000 {
            return Err("LIMIT_EXCEEDED");
        }
        let value = serde_json::to_value(&next).map_err(|_| "VALIDATION")?;
        if serde_json::to_vec(&value).map_err(|_| "VALIDATION")?.len() > 1_048_576 {
            return Err("LIMIT_EXCEEDED");
        }
        atomic_json(&self.directory, "linked-vaults.json", &value)?;
        self.entries = next;
        Ok(())
    }
    fn updated(&self, entry: LinkRecord) -> Vec<LinkRecord> {
        let mut next = self.entries.clone();
        if let Some(position) = next.iter().position(|e| e.id == entry.id) {
            next[position] = entry;
        } else {
            next.push(entry);
        }
        next
    }
    pub fn list(&self) -> Value {
        Value::Array(self.entries.iter().map(|entry| json!({"id": entry.id, "name": entry.name, "location": entry.location, "updatedAt": entry.updated_at, "external": true})).collect())
    }
    pub fn read(&self, id: &str) -> Result<Value> {
        valid_id(id)?;
        match self.entries.iter().find(|entry| entry.id == id) {
            Some(entry) => self.read_entry(entry),
            None => Ok(Value::Null),
        }
    }
    pub fn select_source(&mut self, path: &Path) -> Result<Value> {
        let path = self.canonical(&fs::canonicalize(path).map_err(io_error)?)?;
        let (bytes, _) = read_bounded(&path, MAX_BYTES)?;
        encrypted(&bytes)?;
        let location = path.to_string_lossy().into_owned();
        let token = grant(
            &mut self.sources,
            SourceGrant {
                location: location.clone(),
                revision: revision(&bytes),
            },
        );
        Ok(
            json!({"name": path.file_name().unwrap().to_string_lossy(), "bytes": STANDARD.encode(bytes), "sourceLocation": location, "sourceToken": token}),
        )
    }
    pub fn select_destination(&mut self, id: &str, name: &str, folder: &Path) -> Result<String> {
        valid_id(id)?;
        valid_name(name)?;
        let filename = self
            .entries
            .iter()
            .find(|e| e.id == id)
            .map(|e| {
                Path::new(&e.location)
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
            })
            .unwrap_or_else(|| vault_filename(&safe_name(name, 160)));
        let location =
            self.canonical(&fs::canonicalize(folder).map_err(io_error)?.join(filename))?;
        Ok(grant(
            &mut self.destinations,
            DestinationGrant {
                id: id.into(),
                location: location.to_string_lossy().into_owned(),
            },
        ))
    }
    pub fn attach(&mut self, id: &str, name: &str, bytes: &[u8], token: &str) -> Result<Value> {
        valid_id(id)?;
        valid_name(name)?;
        encrypted(bytes)?;
        let source = self
            .sources
            .iter()
            .find(|(key, _)| key == token)
            .map(|(_, v)| v.clone())
            .ok_or("PERMISSION")?;
        let existing = self.entries.iter().find(|e| e.location == source.location);
        if existing.is_none() && self.entries.iter().any(|e| e.id == id) {
            return Err("CONFLICT");
        }
        let mut entry = LinkRecord {
            id: existing.map_or(id, |e| &e.id).into(),
            name: name.into(),
            location: source.location,
            updated_at: stamp(),
        };
        let current = self.read_entry(&entry)?;
        if current["revision"] != source.revision || current["revision"] != revision(bytes) {
            return Err("CONFLICT");
        }
        entry.updated_at = current["updatedAt"].as_str().unwrap().into();
        self.persist(self.updated(entry))?;
        self.sources.retain(|(key, _)| key != token);
        Ok(current)
    }
    pub fn write(&mut self, id: &str, name: &str, bytes: &[u8], expected: &str) -> Result<Value> {
        valid_id(id)?;
        valid_name(name)?;
        encrypted(bytes)?;
        let mut entry = self
            .entries
            .iter()
            .find(|e| e.id == id)
            .cloned()
            .ok_or("NOT_FOUND")?;
        if self.read_entry(&entry)?["revision"] != expected {
            return Err("CONFLICT");
        }
        let location = PathBuf::from(&entry.location);
        let temporary = location.parent().unwrap().join(format!(
            ".{}-{}.tmp",
            location.file_name().unwrap().to_string_lossy(),
            uuid::Uuid::new_v4()
        ));
        let result = (|| {
            write_verified(&temporary, bytes)?;
            if self.read_entry(&entry)?["revision"] != expected {
                return Err("CONFLICT");
            }
            fs::rename(&temporary, &location).map_err(io_error)?;
            sync_directory(location.parent().unwrap());
            entry.name = name.into();
            let saved = self.read_entry(&entry)?;
            if saved["revision"] != revision(bytes) {
                return Err("CONFLICT");
            }
            entry.updated_at = saved["updatedAt"].as_str().unwrap().into();
            let _ = self.persist(self.updated(entry)); // A committed file survives recent-name metadata failure.
            Ok(saved)
        })();
        let _ = fs::remove_file(&temporary);
        result
    }
    pub fn relocate(
        &mut self,
        id: &str,
        name: &str,
        bytes: &[u8],
        expected: Option<&str>,
        token: &str,
    ) -> Result<Value> {
        valid_id(id)?;
        valid_name(name)?;
        encrypted(bytes)?;
        let selected = self
            .destinations
            .iter()
            .find(|(key, entry)| key == token && entry.id == id)
            .map(|(_, value)| value.clone())
            .ok_or("PERMISSION")?;
        let entry = self.entries.iter().find(|e| e.id == id).cloned();
        let source = entry.as_ref().map(|e| self.read_entry(e)).transpose()?;
        if source.as_ref().and_then(|s| s["revision"].as_str()) != expected
            || source
                .as_ref()
                .is_some_and(|s| s["revision"] != revision(bytes))
        {
            return Err("CONFLICT");
        }
        if source
            .as_ref()
            .is_some_and(|s| s["location"] == selected.location)
        {
            self.destinations.retain(|(key, _)| key != token);
            return Ok(json!({"record": source.unwrap(), "previousFileRetained": false}));
        }
        let target = Path::new(&selected.location);
        if self.canonical(target)? != target {
            return Err("PERMISSION");
        }
        if self.entries.iter().any(|e| e.location == selected.location) {
            return Err("FILE_EXISTS");
        }
        let temporary = target.parent().unwrap().join(format!(
            ".{}-{}.tmp",
            target.file_name().unwrap().to_string_lossy(),
            uuid::Uuid::new_v4()
        ));
        let mut created = false;
        let mut committed = false;
        let result = (|| {
            write_verified(&temporary, bytes)?;
            fs::hard_link(&temporary, target).map_err(|e| {
                if e.kind() == std::io::ErrorKind::AlreadyExists {
                    "FILE_EXISTS"
                } else {
                    io_error(e)
                }
            })?;
            created = true;
            sync_directory(target.parent().unwrap());
            let mut next = LinkRecord {
                id: id.into(),
                name: name.into(),
                location: selected.location.clone(),
                updated_at: stamp(),
            };
            let saved = self.read_entry(&next)?;
            if saved["revision"] != revision(bytes) {
                return Err("CONFLICT");
            }
            if let Some(old) = &entry {
                if self.read_entry(old)?["revision"].as_str() != expected {
                    return Err("CONFLICT");
                }
            }
            next.updated_at = saved["updatedAt"].as_str().unwrap().into();
            self.persist(self.updated(next))?;
            committed = true;
            self.destinations.retain(|(key, _)| key != token);
            let mut retained = false;
            if let Some(old) = &entry {
                match self.read_entry(old) {
                    Ok(current) if current["revision"].as_str() == expected => {
                        if let Err(error) = fs::remove_file(&old.location) {
                            retained = error.kind() != std::io::ErrorKind::NotFound;
                        }
                        sync_directory(Path::new(&old.location).parent().unwrap());
                    }
                    Err("NOT_FOUND") => {}
                    _ => retained = true,
                }
            }
            Ok(json!({"record": saved, "previousFileRetained": retained}))
        })();
        let _ = fs::remove_file(&temporary);
        if created
            && !committed
            && read_bounded(target, MAX_BYTES)
                .is_ok_and(|(value, _)| revision(&value) == revision(bytes))
        {
            let _ = fs::remove_file(target);
        }
        result
    }
    pub fn forget(&mut self, id: &str) -> Result<()> {
        valid_id(id)?;
        if !self.entries.iter().any(|e| e.id == id) {
            return Ok(());
        }
        let next = self
            .entries
            .iter()
            .filter(|e| e.id != id)
            .cloned()
            .collect();
        self.persist(next)
    }
}
