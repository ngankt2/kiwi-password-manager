//! Touch ID quick unlock. The helper seals the vault key under a Secure Enclave key that
//! requires the current biometric set; this module only stores that sealed record, one file
//! per vault, in the app's private directory. The record is useless on another Mac.
use crate::{files::*, security::helper_request, Host};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf, sync::Mutex, time::Duration};

/// Long enough for the person to reach the sensor; the prompt closes when the helper is killed.
const PROMPT_WAIT: Duration = Duration::from_secs(120);
const QUICK_WAIT: Duration = Duration::from_secs(10);
/// One Touch ID prompt at a time.
static PROMPT: Mutex<()> = Mutex::new(());

fn directory(host: &Host) -> Result<PathBuf> {
    let directory = host.directory.join("quick-unlock");
    private_dir(&directory)?;
    Ok(directory)
}
fn filename(id: &str) -> Result<String> {
    if id.is_empty() || id.len() > 256 {
        return Err("VALIDATION");
    }
    Ok(format!("{:x}.json", Sha256::digest(id.as_bytes())))
}
fn binding(value: &str) -> Result<&str> {
    if value.is_empty() || value.len() > 4096 {
        return Err("VALIDATION");
    }
    Ok(value)
}
fn failure(reply: &Value) -> Option<&'static str> {
    Some(match reply.get("error")?.as_str()? {
        "CANCELLED" => "CANCELLED",
        "VALIDATION" => "VALIDATION",
        "QUICK_UNLOCK_UNSUPPORTED" => "QUICK_UNLOCK_UNSUPPORTED",
        "QUICK_UNLOCK_INVALIDATED" => "QUICK_UNLOCK_INVALIDATED",
        _ => "QUICK_UNLOCK_UNAVAILABLE",
    })
}
fn valid_record(record: &Value) -> bool {
    let Some(fields) = record.as_object() else {
        return false;
    };
    fields.len() == 4
        && record["version"] == json!(1)
        && ["enclaveKey", "ephemeral", "sealed"].iter().all(|field| {
            record[field]
                .as_str()
                .is_some_and(|value| !value.is_empty() && value.len() <= 2048)
        })
}

pub fn support(host: &Host) -> Result<Value> {
    let reply = helper_request(&host.helper, json!({"action": "bio-support"}), QUICK_WAIT)?;
    if let Some(code) = failure(&reply) {
        return Err(code);
    }
    let method = match reply["method"].as_str() {
        Some("faceId") => "faceId",
        Some("touchId") => "touchId",
        _ => "biometric",
    };
    let reason = match reply["reason"].as_str() {
        Some("not-enrolled") => json!("not-enrolled"),
        Some("insecure") => json!("insecure"),
        Some(_) => json!("unsupported"),
        None => Value::Null,
    };
    Ok(
        json!({"method": method, "available": reply["available"].as_bool().unwrap_or(false), "reason": reason}),
    )
}
pub fn enrolled(host: &Host, id: &str) -> Result<Value> {
    Ok(json!(directory(host)?.join(filename(id)?).is_file()))
}
pub fn enroll(host: &Host, id: &str, context: &str, key: &str) -> Result<Value> {
    if key.len() != 44 {
        return Err("VALIDATION");
    }
    let name = filename(id)?;
    let request =
        json!({"action": "bio-enroll", "id": id, "binding": binding(context)?, "key": key});
    let reply = helper_request(&host.helper, request, QUICK_WAIT)?;
    if let Some(code) = failure(&reply) {
        return Err(code);
    }
    let record = reply
        .get("record")
        .filter(|record| valid_record(record))
        .ok_or("QUICK_UNLOCK_UNAVAILABLE")?;
    atomic_json(&directory(host)?, &name, record)?;
    Ok(Value::Null)
}
/// Returns the base64 vault key, or null when this vault has no Touch ID record.
pub fn recover(host: &Host, id: &str, context: &str, reason: &str) -> Result<Value> {
    let path = directory(host)?.join(filename(id)?);
    if !path.is_file() {
        return Ok(Value::Null);
    }
    let record = read_json(&path, 8192)?;
    if !valid_record(&record) {
        let _ = fs::remove_file(&path);
        return Err("QUICK_UNLOCK_UNAVAILABLE");
    }
    let reason: String = reason.chars().take(200).collect();
    let request = json!({"action": "bio-recover", "id": id, "binding": binding(context)?, "reason": reason, "record": record});
    let _prompt = PROMPT.lock().map_err(|_| "QUICK_UNLOCK_UNAVAILABLE")?;
    let reply = helper_request(&host.helper, request, PROMPT_WAIT)?;
    match failure(&reply) {
        // A changed fingerprint set retires the Secure Enclave key; drop the stale record.
        Some("QUICK_UNLOCK_INVALIDATED") => {
            let _ = fs::remove_file(&path);
            Err("QUICK_UNLOCK_UNAVAILABLE")
        }
        Some(code) => Err(code),
        None => reply
            .get("key")
            .and_then(Value::as_str)
            .filter(|key| key.len() == 44)
            .map(|key| json!(key))
            .ok_or("QUICK_UNLOCK_UNAVAILABLE"),
    }
}
pub fn revoke(host: &Host, id: &str) -> Result<Value> {
    let path = directory(host)?.join(filename(id)?);
    match fs::remove_file(&path) {
        Ok(()) => {
            sync_directory(path.parent().unwrap());
            Ok(Value::Null)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Value::Null),
        Err(_) => Err("SAVE_FAILED"),
    }
}
