use serde_json::Value;

pub(crate) fn validate_payload(payload: Value) -> Result<Value, String> {
    let raw = payload.get("urls").and_then(Value::as_array)
        .ok_or("El grupo necesita payload.urls.")?;
    if raw.is_empty() { return Err("El grupo necesita al menos una URL.".into()); }
    let urls = raw.iter().enumerate().map(|(index, value)| {
        let value = value.as_str().ok_or("Cada URL debe ser texto.")?;
        validate_url(value).map(|url| url.to_string())
            .map_err(|error| format!("URL {}: {error}", index + 1))
    }).collect::<Result<Vec<_>, String>>()?;
    Ok(serde_json::json!({ "urls": urls }))
}

fn validate_url(value: &str) -> Result<url::Url, String> {
    if value.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("Codifica los espacios de la URL como %20.".into());
    }
    let lower = value.to_ascii_lowercase();
    if !["http://", "https://", "file:///"].iter().any(|prefix| lower.starts_with(prefix)) {
        return Err("Usa http(s) o file:/// con una ruta local absoluta.".into());
    }
    let parsed = url::Url::parse(value).map_err(|_| "URL no válida.")?;
    match parsed.scheme() {
        "http" | "https" if parsed.host_str().is_some() => {},
        "file" => {
            let path = parsed.to_file_path().map_err(|_| "La URL file debe apuntar a un archivo local.")?;
            let bytes = parsed.path().as_bytes();
            if parsed.host_str().is_some() || !path.is_absolute()
                || bytes.len() < 5 || !bytes[1].is_ascii_alphabetic()
                || bytes[2] != b':' || bytes[3] != b'/' {
                return Err("Usa file:/// con una unidad local, por ejemplo file:///C:/Documentos/lectura.pdf.".into());
            }
            crate::canonical_file(&path.to_string_lossy())?;
        },
        _ => return Err("Solo se permiten http(s) y archivos locales.".into()),
    }
    Ok(parsed)
}

/// Validate the whole group before spawning anything; opening local files follows
/// the same roots and file restrictions as an ordinary file piece.
pub(crate) fn launch_args(urls: Vec<String>) -> Result<Vec<String>, String> {
    let payload = validate_payload(serde_json::json!({ "urls": urls }))?;
    let mut args = vec!["--new-window".to_string()];
    for value in payload["urls"].as_array().unwrap() {
        let raw = value.as_str().unwrap();
        args.push(raw.to_string());
    }
    Ok(args)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn keeps_order_encoded_paths_queries_and_fragments() {
        let urls = vec![
            "https://example.com/file-storage/#/246411095",
            "https://example.com/view/public%2Fdoc.pdf?loc=&web=1",
        ];
        assert_eq!(validate_payload(json!({ "urls": urls })).unwrap(), json!({ "urls": urls }));
    }

    #[test]
    fn rejects_empty_malformed_options_scripts_and_remote_files() {
        for urls in [
            json!([]), json!(["https://"]), json!(["--profile"]), json!(["javascript:alert(1)"]),
            json!(["file://server/share/test.pdf"]), json!(["file:///relative.pdf"]),
            json!(["https://example.com", 42]), json!(["https://example.com/a b"]),
        ] {
            assert!(validate_payload(json!({ "urls": urls })).is_err());
        }
    }

    #[test]
    fn builds_one_window_without_shell_interpolation() {
        let urls = vec!["https://example.com/?a=1&b=%7B2%7D".into(), "https://example.org/#x".into()];
        let args = launch_args(urls.clone()).unwrap();
        assert_eq!(args[0], "--new-window");
        assert_eq!(&args[1..], urls);
    }

    #[test]
    fn missing_local_file_prevents_launch() {
        assert!(launch_args(vec!["file:///Z:/paravel-missing-test-9f35.pdf".into()]).is_err());
        assert!(validate_payload(json!({ "urls": ["file:///Z:/paravel-missing-test-9f35.pdf"] })).is_err());
    }

    #[test]
    fn validates_local_files_when_saving_and_rechecks_when_launching() {
        let dir = std::env::temp_dir().join("launch-host-test").join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("lectura con espacios.pdf");
        std::fs::write(&path, b"acceptance fixture").unwrap();
        let url = url::Url::from_file_path(&path).unwrap().to_string();
        assert!(url.contains("%20"));
        assert!(validate_payload(json!({ "urls": [&url] })).is_ok());
        assert!(launch_args(vec![url.clone()]).is_ok());
        std::fs::remove_file(&path).unwrap();
        assert!(validate_payload(json!({ "urls": [&url] })).is_err());
        assert!(launch_args(vec![url]).is_err());
        for name in ["blocked.ps1", "blocked.exe"] {
            let script = dir.join(name);
            std::fs::write(&script, b"fixture").unwrap();
            let script_url = url::Url::from_file_path(&script).unwrap().to_string();
            assert!(validate_payload(json!({ "urls": [script_url] })).is_err());
            std::fs::remove_file(script).unwrap();
        }
        std::fs::remove_dir(dir).unwrap();
    }
}
