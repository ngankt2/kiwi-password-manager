use crate::files::*;
use serde_json::{json, Value};
use std::path::Path;

pub fn catalog() -> Value {
    serde_json::from_str(include_str!("../native-catalog.json")).expect("build-time native catalog")
}
pub fn defaults() -> Value {
    catalog()["defaults"].clone()
}
pub fn normalize(input: Value) -> Result<Value> {
    let mut object = input.as_object().cloned().ok_or("VALIDATION")?;
    object.remove("lockOnBackground");
    if object.get("autoLockSeconds") == Some(&json!(0)) {
        object.insert("autoLockSeconds".into(), json!(-1));
    }
    let mut result = defaults();
    for (key, value) in object {
        let valid = match key.as_str() {
            "language" => value
                .as_str()
                .is_some_and(|s| ["vi", "en", "es", "fr", "zh-CN"].contains(&s)),
            "theme" => value
                .as_str()
                .is_some_and(|s| ["system", "light", "dark"].contains(&s)),
            "lastOpenedVaultId" => {
                value.is_null() || value.as_str().is_some_and(|id| valid_id(id).is_ok())
            }
            "desktopLayout" => value.as_str().is_some_and(|s| ["A", "B", "C"].contains(&s)),
            "autoLockSeconds" => value
                .as_i64()
                .is_some_and(|n| [60, 180, 300, 900, 1800, -1].contains(&n)),
            "backgroundLockSeconds" => value
                .as_i64()
                .is_some_and(|n| [0, 60, 180, 300, 900, 1800, -1].contains(&n)),
            "clipboardSeconds" => value.as_i64().is_some_and(|n| [0, 10, 30, 60].contains(&n)),
            "backupRetention" => value.as_i64().is_some_and(|n| (1..=100).contains(&n)),
            "requireAuthenticationToReveal"
            | "automaticBackups"
            | "compactRows"
            | "reduceMotion" => value.is_boolean(),
            _ => false,
        };
        if !valid {
            return Err("VALIDATION");
        }
        result[&key] = value;
    }
    Ok(result)
}
pub fn read(directory: &Path) -> Value {
    read_json(&directory.join("preferences.json"), 32768)
        .and_then(normalize)
        .unwrap_or_else(|_| defaults())
}
pub fn text(settings: &Value, source: &str) -> String {
    catalog()["locales"][settings["language"].as_str().unwrap_or("vi")][source]
        .as_str()
        .unwrap_or(source)
        .into()
}
