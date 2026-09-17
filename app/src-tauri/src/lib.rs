use serde::{Deserialize, Serialize};
use std::{
    env,
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

mod capture;
mod continuity;
mod db;
mod firefox_group;
mod settings;
mod templates;

use serde_json::Value;
use tauri::Manager;

#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;

const FIREFOX_URLS: [&str; 2] = ["https://example.com", "https://www.mozilla.org"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchResult {
    request_id: String,
    argv: Vec<String>,
    log_path: String,
}

fn request_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("{millis}-{}", std::process::id())
}

fn log_path() -> Result<PathBuf, String> {
    let path = settings::log_file();
    if let Some(directory) = path.parent() {
        fs::create_dir_all(directory).map_err(|error| format!("No se pudo crear el log: {error}"))?;
    }
    Ok(path)
}

#[tauri::command]
fn read_launch_log(lines: Option<usize>) -> Result<String, String> {
    let path = log_path()?;
    let content = match fs::read_to_string(&path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(String::new()),
        Err(error) => return Err(format!("No se pudo leer el log: {error}")),
    };
    let limit = lines.unwrap_or(100).clamp(1, 1000);
    let entries = content.lines().collect::<Vec<_>>();
    Ok(entries
        .into_iter()
        .rev()
        .take(limit)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n"))
}

fn append_log(
    request_id: &str,
    kind: &str,
    argv: &[String],
    result: &str,
) -> Result<PathBuf, String> {
    let path = log_path()?;
    let entry = serde_json::json!({
        "time": chrono_like_timestamp(),
        "request_id": request_id,
        "kind": kind,
        "argv": argv,
        "resultado": result,
    });
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| format!("No se pudo abrir el log: {error}"))?;
    writeln!(file, "{entry}").map_err(|error| format!("No se pudo escribir el log: {error}"))?;
    Ok(path)
}

pub(crate) fn chrono_like_timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

pub(crate) fn validate_piece_payload(kind: &str, payload: Value) -> Result<Value, String> {
    match kind {
        "firefox-group" => firefox_group::validate_payload(payload),
        "vscode" | "cursor" | "folder" | "file" => {
            let path = payload.get("path").and_then(Value::as_str)
                .ok_or_else(|| "La pieza necesita payload.path.".to_string())?;
            let canonical = if kind == "file" { canonical_file(path)? } else { canonical_folder(path)? };
            Ok(serde_json::json!({ "path": canonical.to_string_lossy() }))
        }
        "firefox" => {
            let raw_urls = payload.get("urls").and_then(Value::as_array)
                .ok_or_else(|| "La pieza necesita payload.urls.".to_string())?;
            if raw_urls.is_empty() {
                return Err("La pieza necesita al menos una URL.".to_string());
            }
            let mut urls = Vec::with_capacity(raw_urls.len());
            for raw_url in raw_urls {
                let value = raw_url.as_str()
                    .ok_or_else(|| "Cada URL debe ser texto.".to_string())?;
                if value.trim().is_empty() {
                    return Err("No se permiten URLs vacías.".to_string());
                }
                let parsed = url::Url::parse(value)
                    .map_err(|_| "La URL no es válida.".to_string())?;
                if !matches!(parsed.scheme(), "http" | "https") {
                    return Err("Solo se permiten URLs http(s).".to_string());
                }
                urls.push(parsed.to_string());
            }
            Ok(serde_json::json!({ "urls": urls }))
        }
        _ => Err(format!("Kind no permitido: {kind}")),
    }
}

fn allowed_roots() -> Vec<PathBuf> {
    let configured = env::var_os("LAUNCH_HOST_ALLOWED_ROOTS")
        .map(|value| env::split_paths(&value).collect::<Vec<_>>())
        .unwrap_or_default();
    let mut roots = configured;
    roots.extend(settings::extra_roots());
    if let Some(home) = env::var_os("USERPROFILE").map(PathBuf::from) {
        roots.push(home);
    }
    if let Some(temp) = env::var_os("TEMP").map(PathBuf::from) {
        roots.push(temp.join("launch-host-test"));
    }
    roots
        .into_iter()
        .filter_map(|root| {
            fs::canonicalize(root)
                .ok()
                .map(|canonical| dunce::simplified(&canonical).to_path_buf())
        })
        .collect()
}

fn canonical_folder(raw_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw_path);
    if !path.is_absolute() {
        return Err("La carpeta debe ser una ruta absoluta.".to_string());
    }
    let canonical = fs::canonicalize(&path)
        .map(|canonical| dunce::simplified(&canonical).to_path_buf())
        .map_err(|error| format!("No se pudo resolver la carpeta: {error}"))?;
    if !canonical.is_dir() {
        return Err("La ruta seleccionada no es una carpeta.".to_string());
    }
    if !allowed_roots()
        .iter()
        .any(|root| canonical.starts_with(root))
    {
        return Err("La carpeta está fuera de los roots permitidos.".to_string());
    }
    Ok(canonical)
}

fn canonical_file(raw_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw_path);
    if !path.is_absolute() {
        return Err("El archivo debe ser una ruta absoluta.".to_string());
    }
    let canonical = fs::canonicalize(&path)
        .map(|canonical| dunce::simplified(&canonical).to_path_buf())
        .map_err(|error| format!("No se pudo resolver el archivo: {error}"))?;
    if !canonical.is_file() {
        return Err("La ruta seleccionada no es un archivo.".to_string());
    }
    if blocked_open_extension(&canonical) {
        return Err("No se abren ejecutables, atajos ni scripts.".to_string());
    }
    if !allowed_roots().iter().any(|root| canonical.starts_with(root)) {
        return Err("El archivo está fuera de los roots permitidos.".to_string());
    }
    Ok(canonical)
}

fn blocked_open_extension(path: &std::path::Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.to_ascii_lowercase())
            .as_deref(),
        Some(
            "exe" | "com" | "scr" | "pif" | "msi" | "msp" | "msix" | "appx"
                | "cmd" | "bat" | "ps1"
                | "js" | "jse" | "vbs" | "vbe" | "wsf" | "wsh"
                | "hta" | "cpl" | "msc" | "lnk" | "jar" | "reg"
        )
    )
}

fn resolve_exe(candidates: impl IntoIterator<Item = PathBuf>, name: &str) -> Result<PathBuf, String> {
    candidates
        .into_iter()
        .find(|candidate| candidate.is_file() && candidate.extension().is_some_and(|ext| ext == "exe"))
        .ok_or_else(|| format!("No se encontró {name}. Instálalo o configura la ruta conocida."))
}

fn vscode_exe() -> Result<PathBuf, String> {
    let mut candidates = Vec::new();
    if let Some(custom) = settings::vscode_exe() {
        candidates.push(custom);
    }
    if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
        candidates.push(PathBuf::from(local_app_data).join("Programs/Microsoft VS Code/Code.exe"));
    }
    if let Some(program_files) = env::var_os("ProgramFiles") {
        candidates.push(PathBuf::from(program_files).join("Microsoft VS Code/Code.exe"));
    }
    if let Some(program_files_x86) = env::var_os("ProgramFiles(x86)") {
        candidates.push(PathBuf::from(program_files_x86).join("Microsoft VS Code/Code.exe"));
    }
    resolve_exe(candidates, "Code.exe")
}

fn cursor_exe() -> Result<PathBuf, String> {
    let mut candidates = Vec::new();
    if let Some(custom) = settings::cursor_exe() {
        candidates.push(custom);
    }
    if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
        let root = PathBuf::from(local_app_data);
        candidates.push(root.join("Programs/cursor/Cursor.exe"));
        candidates.push(root.join("Programs/Cursor/Cursor.exe"));
    }
    if let Some(program_files) = env::var_os("ProgramFiles") {
        candidates.push(PathBuf::from(program_files).join("Cursor/Cursor.exe"));
    }
    if let Some(program_files_x86) = env::var_os("ProgramFiles(x86)") {
        candidates.push(PathBuf::from(program_files_x86).join("Cursor/Cursor.exe"));
    }
    resolve_exe(candidates, "Cursor.exe")
}

fn firefox_exe() -> Result<PathBuf, String> {
    let mut candidates = Vec::new();
    if let Some(custom) = settings::firefox_exe() {
        candidates.push(custom);
    }
    for variable in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
        if let Some(root) = env::var_os(variable) {
            candidates.push(PathBuf::from(root).join("Mozilla Firefox/firefox.exe"));
        }
    }
    resolve_exe(candidates, "firefox.exe")
}

fn run_launch(
    request_id: String,
    kind: &str,
    exe: PathBuf,
    args: Vec<String>,
) -> Result<LaunchResult, String> {
    let mut argv = vec![exe.to_string_lossy().into_owned()];
    argv.extend(args);
    let log_path = match Command::new(&exe).args(&argv[1..]).spawn() {
        Ok(_) => append_log(&request_id, kind, &argv, "ok")?,
        Err(error) => {
            let reason = format!("No se pudo iniciar {kind}: {error}");
            let _ = append_log(&request_id, kind, &argv, &reason);
            return Err(reason);
        }
    };
    Ok(LaunchResult {
        request_id,
        argv,
        log_path: log_path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
async fn pick_folder(title: String) -> Option<String> {
    rfd::AsyncFileDialog::new()
        .set_title(title)
        .pick_folder()
        .await
        .map(|handle| handle.path().to_string_lossy().into_owned())
}

#[tauri::command]
async fn pick_file(title: String) -> Option<String> {
    rfd::AsyncFileDialog::new()
        .set_title(title)
        .pick_file()
        .await
        .map(|handle| handle.path().to_string_lossy().into_owned())
}

#[tauri::command]
fn launch_vscode(path: String) -> Result<LaunchResult, String> {
    let request_id = request_id();
    let folder = match canonical_folder(&path) {
        Ok(folder) => folder,
        Err(reason) => {
            let _ = append_log(&request_id, "vscode", &[], &reason);
            return Err(reason);
        }
    };
    let exe = match vscode_exe() {
        Ok(exe) => exe,
        Err(reason) => {
            let _ = append_log(&request_id, "vscode", &[], &reason);
            return Err(reason);
        }
    };
    run_launch(
        request_id,
        "vscode",
        exe,
        vec!["--new-window".to_string(), folder.to_string_lossy().into_owned()],
    )
}

#[tauri::command]
fn launch_cursor(path: String) -> Result<LaunchResult, String> {
    let request_id = request_id();
    let folder = match canonical_folder(&path) {
        Ok(folder) => folder,
        Err(reason) => {
            let _ = append_log(&request_id, "cursor", &[], &reason);
            return Err(reason);
        }
    };
    let exe = match cursor_exe() {
        Ok(exe) => exe,
        Err(reason) => {
            let _ = append_log(&request_id, "cursor", &[], &reason);
            return Err(reason);
        }
    };
    run_launch(
        request_id,
        "cursor",
        exe,
        vec!["--new-window".to_string(), folder.to_string_lossy().into_owned()],
    )
}

#[tauri::command]
fn launch_firefox(urls: Option<Vec<String>>) -> Result<LaunchResult, String> {
    let request_id = request_id();
    let raw_urls = urls.unwrap_or_else(|| FIREFOX_URLS.iter().map(|value| (*value).to_string()).collect());
    let urls = raw_urls
        .iter()
        .map(|value| url::Url::parse(value))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Las URLs de prueba no son válidas.".to_string());
    let urls = match urls {
        Ok(urls) if urls.iter().all(|url| matches!(url.scheme(), "http" | "https")) => urls,
        _ => {
            let reason = "Solo se permiten URLs http(s).".to_string();
            let _ = append_log(&request_id, "firefox", &[], &reason);
            return Err(reason);
        }
    };
    let exe = match firefox_exe() {
        Ok(exe) => exe,
        Err(reason) => {
            let _ = append_log(&request_id, "firefox", &[], &reason);
            return Err(reason);
        }
    };
    let mut args = vec!["--new-window".to_string()];
    args.extend(urls.into_iter().map(|url| url.to_string()));
    run_launch(request_id, "firefox", exe, args)
}

#[tauri::command]
fn launch_firefox_group(urls: Vec<String>) -> Result<LaunchResult, String> {
    let request_id = request_id();
    let prepared = firefox_group::launch_args(urls)
        .and_then(|args| firefox_exe().map(|exe| (exe, args)));
    match prepared {
        Ok((exe, args)) => run_launch(request_id, "firefox-group", exe, args),
        Err(reason) => {
            let _ = append_log(&request_id, "firefox-group", &[], &reason);
            Err(reason)
        }
    }
}

#[tauri::command]
fn launch_folder(path: String) -> Result<LaunchResult, String> {
    let request_id = request_id();
    let folder = match canonical_folder(&path) {
        Ok(folder) => folder,
        Err(reason) => {
            let _ = append_log(&request_id, "folder", &[], &reason);
            return Err(reason);
        }
    };
    let args = vec![folder.to_string_lossy().into_owned()];
    let explorer = env::var_os("WINDIR")
        .map(PathBuf::from)
        .map(|root| root.join("explorer.exe"))
        .ok_or_else(|| "No se encontró explorer.exe.".to_string())?;
    run_launch(request_id, "folder", explorer, args)
}

#[tauri::command]
fn launch_file(path: String) -> Result<LaunchResult, String> {
    let request_id = request_id();
    let file = match canonical_file(&path) {
        Ok(file) => file,
        Err(reason) => {
            let _ = append_log(&request_id, "file", &[], &reason);
            return Err(reason);
        }
    };
    let file_text = file.to_string_lossy().into_owned();
    let argv = vec!["ShellExecuteW".to_string(), file_text];
    #[cfg(windows)]
    let result = {
        let operation: Vec<u16> = std::ffi::OsStr::new("open").encode_wide().chain(std::iter::once(0)).collect();
        let file_wide: Vec<u16> = file.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
        let result = unsafe {
            windows_sys::Win32::UI::Shell::ShellExecuteW(
                std::ptr::null_mut(),
                operation.as_ptr(),
                file_wide.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
            )
        };
        if result as usize <= 32 {
            Err(format!("El sistema no pudo abrir el archivo (ShellExecuteW: {result:?})."))
        } else {
            Ok(())
        }
    };
    #[cfg(not(windows))]
    let result: Result<(), String> = Err("Abrir archivos con el handler del SO solo está implementado en Windows.".to_string());
    match result {
        Ok(()) => {
            let log_path = append_log(&request_id, "file", &argv, "ok")?;
            Ok(LaunchResult { request_id, argv, log_path: log_path.to_string_lossy().into_owned() })
        }
        Err(reason) => {
            let _ = append_log(&request_id, "file", &argv, &reason);
            Err(reason)
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PathProbeItem {
    id: String,
    kind: String,
    path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PathProbeResult {
    id: String,
    ok: bool,
    error: Option<String>,
}

fn probe_error(error: String) -> String {
    if error.starts_with("No se pudo resolver") {
        "Ruta rota".to_string()
    } else {
        error
    }
}

#[tauri::command]
fn probe_paths(items: Vec<PathProbeItem>) -> Vec<PathProbeResult> {
    items
        .into_iter()
        .map(|item| {
            let checked = match item.kind.as_str() {
                "firefox" | "firefox-group" => Ok(()),
                "file" => match item.path.as_deref() {
                    Some(path) if !path.is_empty() => canonical_file(path).map(|_| ()).map_err(probe_error),
                    _ => Err("Sin ruta.".to_string()),
                },
                "vscode" | "cursor" | "folder" => match item.path.as_deref() {
                    Some(path) if !path.is_empty() => canonical_folder(path).map(|_| ()).map_err(probe_error),
                    _ => Err("Sin ruta.".to_string()),
                },
                other => Err(format!("Kind no permitido: {other}")),
            };
            match checked {
                Ok(()) => PathProbeResult {
                    id: item.id,
                    ok: true,
                    error: None,
                },
                Err(error) => PathProbeResult {
                    id: item.id,
                    ok: false,
                    error: Some(error),
                },
            }
        })
        .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(debug_assertions)]
            if let Some(directory) = env::var_os("PARAVEL_TEST_DATA_DIR") {
                let directory = PathBuf::from(directory);
                if !directory.is_absolute() {
                    return Err(Box::new(std::io::Error::other(
                        "PARAVEL_TEST_DATA_DIR debe ser una ruta absoluta.",
                    )));
                }
                settings::set_data_dir(directory.clone());
                let state = db::open(directory.join("paravel.sqlite3"))
                    .map_err(std::io::Error::other)?;
                app.manage(state);
                return Ok(());
            }
            let directory = app.path().app_data_dir()?;
            settings::set_data_dir(directory.clone());
            let path = directory.join("paravel.sqlite3");
            settings::maybe_adopt_legacy_db(&path).map_err(std::io::Error::other)?;
            let state = db::open(path).map_err(std::io::Error::other)?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_folder,
            pick_file,
            settings::pick_executable,
            settings::get_host_settings,
            settings::save_host_settings,
            read_launch_log,
            launch_vscode,
            launch_cursor,
            launch_firefox,
            launch_firefox_group,
            launch_folder,
            launch_file,
            probe_paths,
            db::db_path,
            db::list_groups,
            db::create_group,
            db::update_group,
            db::list_spaces,
            db::create_space,
            db::get_invite,
            db::set_invite,
            db::clear_invite,
            db::list_pieces,
            db::list_navigation_catalog,
            db::resolve_navigation_target,
            db::set_marked,
            db::delete_piece,
            db::add_piece,
            capture::preview_capture,
            capture::commit_capture,
            capture::prepare_capture_paths,
            capture::pick_capture_files,
            capture::pick_capture_folders,
            continuity::list_closures,
            continuity::get_closure,
            continuity::save_closure,
            continuity::delete_closure,
            templates::list_space_templates,
            templates::preview_space_template,
            templates::create_space_from_template,
            templates::get_space_preparation,
            templates::update_space_preparation,
            templates::resolve_preparation_slot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_rejects_executables_and_scripts_not_documents() {
        let directory = env::temp_dir()
            .join("launch-host-test")
            .join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&directory).unwrap();
        for name in ["nota.txt", "run.exe", "run.ps1", "atajo.lnk"] {
            fs::write(directory.join(name), b"fixture").unwrap();
        }
        assert!(canonical_file(&directory.join("nota.txt").to_string_lossy()).is_ok());
        for name in ["run.exe", "run.ps1", "atajo.lnk"] {
            let error = canonical_file(&directory.join(name).to_string_lossy()).unwrap_err();
            assert!(error.contains("No se abren ejecutables"));
        }
    }
}
