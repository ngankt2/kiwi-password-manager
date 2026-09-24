use crate::files::Result;
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::{blocking::Client, redirect::Policy};
use serde_json::{json, Value};
use std::{
    io::Read,
    net::{IpAddr, ToSocketAddrs},
    sync::atomic::{AtomicUsize, Ordering},
    time::Duration,
};

const MAX_BYTES: u64 = 512 * 1024;
static ACTIVE: AtomicUsize = AtomicUsize::new(0);
struct Permit;
impl Drop for Permit {
    fn drop(&mut self) {
        ACTIVE.fetch_sub(1, Ordering::SeqCst);
    }
}

pub fn public_address(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(ip) => {
            let [a, b, c, _] = ip.octets();
            a != 0
                && a != 10
                && a != 127
                && a < 224
                && !(a == 100 && (64..=127).contains(&b))
                && !(a == 169 && b == 254)
                && !(a == 172 && (16..=31).contains(&b))
                && !(a == 192 && (b == 168 || b == 0 || b == 88 && c == 99))
                && !(a == 198 && (b == 18 || b == 19 || b == 51 && c == 100))
                && !(a == 203 && b == 0 && c == 113)
        }
        IpAddr::V6(ip) => {
            let segments = ip.segments();
            segments[0] & 0xe000 == 0x2000
                && segments[0] != 0x2002
                && !(segments[0] == 0x2001 && (segments[1] < 0x200 || segments[1] == 0xdb8))
        }
    }
}

pub fn validate_url(value: &str) -> Result<tauri::Url> {
    if value.len() > 4096 {
        return Err("VALIDATION");
    }
    let mut url = tauri::Url::parse(value).map_err(|_| "VALIDATION")?;
    let host = url
        .host_str()
        .ok_or("VALIDATION")?
        .trim_matches(['[', ']'])
        .trim_end_matches('.')
        .to_lowercase();
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some_and(|port| port != 443)
        || !host.contains(['.', ':'])
        || [
            "localhost",
            "local",
            "internal",
            "invalid",
            "test",
            "example",
            "onion",
        ]
        .iter()
        .any(|suffix| host == *suffix || host.ends_with(&format!(".{suffix}")))
        || host.parse::<IpAddr>().is_ok_and(|ip| !public_address(ip))
    {
        return Err("VALIDATION");
    }
    url.set_fragment(None);
    Ok(url)
}

pub fn fetch_resource(input: &str, kind: &str) -> Result<Value> {
    if !["image", "html"].contains(&kind) {
        return Err("VALIDATION");
    }
    if ACTIVE.fetch_add(1, Ordering::SeqCst) >= 4 {
        ACTIVE.fetch_sub(1, Ordering::SeqCst);
        return Err("LIMIT_EXCEEDED");
    }
    let _permit = Permit;
    let mut url = validate_url(input)?;
    for _ in 0..=3 {
        let host = url.host_str().ok_or("VALIDATION")?.trim_matches(['[', ']']);
        let addresses: Vec<_> = (host, 443)
            .to_socket_addrs()
            .map_err(|_| "NOT_FOUND")?
            .collect();
        if addresses.is_empty()
            || addresses
                .iter()
                .any(|address| !public_address(address.ip()))
        {
            return Err("PERMISSION");
        }
        let client = Client::builder()
            .https_only(true)
            .no_proxy()
            .redirect(Policy::none())
            .timeout(Duration::from_secs(6))
            .connect_timeout(Duration::from_secs(4))
            .resolve_to_addrs(host, &addresses)
            .build()
            .map_err(|_| "NOT_FOUND")?;
        let response = client
            .get(url.clone())
            .header("Accept-Encoding", "identity")
            .header(
                "Accept",
                if kind == "html" {
                    "text/html,application/xhtml+xml"
                } else {
                    "image/*"
                },
            )
            .header("User-Agent", "Kiro-Icon/1.0")
            .send()
            .map_err(|_| "NOT_FOUND")?;
        if [301, 302, 303, 307, 308].contains(&response.status().as_u16()) {
            let location = response
                .headers()
                .get("location")
                .and_then(|value| value.to_str().ok())
                .ok_or("NOT_FOUND")?;
            url = validate_url(url.join(location).map_err(|_| "VALIDATION")?.as_str())?;
            continue;
        }
        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            .to_lowercase();
        if response.status().as_u16() != 200
            || response
                .headers()
                .get("content-encoding")
                .is_some_and(|value| value != "identity")
            || kind == "html"
                && !["text/html", "application/xhtml+xml"].contains(&content_type.as_str())
            || kind == "image"
                && !content_type.is_empty()
                && !content_type.starts_with("image/")
                && !["application/octet-stream", "binary/octet-stream"]
                    .contains(&content_type.as_str())
        {
            return Err("INVALID_FILE");
        }
        if kind == "image"
            && response
                .content_length()
                .is_some_and(|length| length > MAX_BYTES)
        {
            return Err("LIMIT_EXCEEDED");
        }
        let mut bytes = Vec::new();
        response
            .take(MAX_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "NOT_FOUND")?;
        if bytes.len() as u64 > MAX_BYTES {
            if kind == "image" {
                return Err("LIMIT_EXCEEDED");
            }
            bytes.truncate(MAX_BYTES as usize);
        }
        return Ok(
            json!({ "bytes": STANDARD.encode(bytes), "url": url.as_str(), "contentType": content_type }),
        );
    }
    Err("NOT_FOUND")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn refuses_private_destinations_and_credentials() {
        for input in [
            "http://example.com/icon.png",
            "file:///etc/passwd",
            "https://localhost/icon",
            "https://127.1/icon",
            "https://10.0.0.1/",
            "https://[::1]/",
            "https://[::ffff:127.0.0.1]/",
            "https://example.com:444/",
            "https://user:password@example.com/",
        ] {
            assert!(validate_url(input).is_err(), "{input}");
        }
        assert!(validate_url("https://example.com/icon.png").is_ok());
        for ip in [
            "0.0.0.0",
            "169.254.169.254",
            "100.64.0.1",
            "172.16.0.1",
            "192.168.1.1",
            "198.18.0.1",
            "224.0.0.1",
            "fc00::1",
            "2001:db8::1",
            "2002:7f00:1::",
        ] {
            assert!(!public_address(ip.parse().unwrap()), "{ip}");
        }
        for ip in [
            "1.1.1.1",
            "8.8.8.8",
            "2606:4700:4700::1111",
            "2001:4860:4860::8888",
        ] {
            assert!(public_address(ip.parse().unwrap()), "{ip}");
        }
    }

    #[test]
    #[ignore = "requires a public HTTPS connection"]
    fn downloads_a_public_favicon_with_verified_tls() {
        let result = fetch_resource("https://github.com/favicon.ico", "image").unwrap();
        let bytes = STANDARD.decode(result["bytes"].as_str().unwrap()).unwrap();
        assert!(!bytes.is_empty());
        assert!(bytes.len() as u64 <= MAX_BYTES);
        assert!(result["contentType"]
            .as_str()
            .unwrap()
            .starts_with("image/"));
    }
}
