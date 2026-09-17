use crate::db::AppState;
use serde::{Deserialize, Serialize};
use std::{
    env, fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

const MAX_ROOTS: usize = 32;
const SETTINGS_FILE: &str = "settings.json";
const DB_FILE: &str = "paravel.sqlite3";

static DATA_DIR: Mutex<Option<PathBuf>> = Mutex::new(None);
static SETTINGS: Mutex<Option<HostSettings>> = Mutex::new(None);

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HostSettings {
    #[serde(default)]
    pub extra_roots: Vec<String>,
    #[serde(default)]
    pub vscode_exe: Option<String>,
    #[serde(default)]
    pub cursor_exe: Option<String>,
    #[serde(default)]
    pub firefox_exe: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostSettingsView {
    pub extra_roots: Vec<String>,
    pub vscode_exe: Option<String>,
    pub cursor_exe: Option<String>,
    pub firefox_exe: Option<String>,
    pub data_dir: String,
    pub db_path: String,
    pub log_path: String,
    pub home_root: Option<String>,
}

fn lock_dir() -> std::sync::MutexGuard<'static, Option<PathBuf>> {
    DATA_DIR.lock().unwrap_or_else(|poison| poison.into_inner())
}

fn lock_settings() -> std::sync::MutexGuard<'static, Option<HostSettings>> {
    SETTINGS.lock().unwrap_or_else(|poison| poison.into_inner())
}

pub fn set_data_dir(path: PathBuf) {
    *lock_dir() = Some(path);
    *lock_settings() = None;
}

pub fn data_dir() -> PathBuf {
    if let Some(directory) = lock_dir().clone() {
        return directory;
    }
    #[cfg(debug_assertions)]
    if let Some(directory) = env::var_os("PARAVEL_TEST_DATA_DIR") {
        let directory = PathBuf::from(directory);
        if directory.is_absolute() {
            return directory;
        }
    }
    env::var_os("APPDATA")
        .or_else(|| env::var_os("LOCALAPPDATA"))
        .map(PathBuf::from)
        .unwrap_or_else(env::temp_dir)
        .join("app.paravel.desktop")
}

fn settings_path() -> PathBuf {
    data_dir().join(SETTINGS_FILE)
}

fn blank(value: Option<String>) -> Option<String> {
    value.and_then(|text| {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn canonicalize_dir(raw: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw.trim());
    if !path.is_absolute() {
        return Err("Cada carpeta extra debe ser una ruta absoluta.".into());
    }
    let canonical = fs::canonicalize(&path)
        .map(|canonical| dunce::simplified(&canonical).to_path_buf())
        .map_err(|error| format!("No se pudo usar la carpeta {raw}: {error}"))?;
    if !canonical.is_dir() {
        return Err(format!("{raw} no es una carpeta."));
    }
    Ok(canonical)
}

fn canonicalize_exe(raw: &str, name: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw.trim());
    if !path.is_absolute() {
        return Err(format!("La ruta de {name} debe ser absoluta."));
    }
    let canonical = fs::canonicalize(&path)
        .map(|canonical| dunce::simplified(&canonical).to_path_buf())
        .map_err(|error| format!("No se encontró {name}: {error}"))?;
    if !(canonical.is_file() && canonical.extension().is_some_and(|ext| ext == "exe")) {
        return Err(format!("{name} debe apuntar a un archivo .exe."));
    }
    Ok(canonical)
}

fn normalize(mut settings: HostSettings) -> Result<HostSettings, String> {
    if settings.extra_roots.len() > MAX_ROOTS {
        return Err("Máximo 32 carpetas extra.".into());
    }
    let mut roots = Vec::new();
    for raw in settings.extra_roots {
        let canonical = canonicalize_dir(&raw)?;
        let text = canonical.to_string_lossy().into_owned();
        if !roots.iter().any(|existing: &String| existing.eq_ignore_ascii_case(&text)) {
            roots.push(text);
        }
    }
    settings.extra_roots = roots;
    settings.vscode_exe = blank(settings.vscode_exe)
        .map(|path| canonicalize_exe(&path, "Code.exe").map(|value| value.to_string_lossy().into_owned()))
        .transpose()?;
    settings.cursor_exe = blank(settings.cursor_exe)
        .map(|path| canonicalize_exe(&path, "Cursor.exe").map(|value| value.to_string_lossy().into_owned()))
        .transpose()?;
    settings.firefox_exe = blank(settings.firefox_exe)
        .map(|path| canonicalize_exe(&path, "firefox.exe").map(|value| value.to_string_lossy().into_owned()))
        .transpose()?;
    Ok(settings)
}

fn read_file() -> HostSettings {
    match fs::read_to_string(settings_path()) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(_) => HostSettings::default(),
    }
}

fn cached() -> HostSettings {
    let mut slot = lock_settings();
    if slot.is_none() {
        *slot = Some(read_file());
    }
    slot.clone().unwrap_or_default()
}

fn persist(settings: HostSettings) -> Result<HostSettings, String> {
    let settings = normalize(settings)?;
    let directory = data_dir();
    fs::create_dir_all(&directory).map_err(|error| format!("No se pudo guardar la configuración: {error}"))?;
    let encoded = serde_json::to_string_pretty(&settings)
        .map_err(|error| format!("No se pudo serializar la configuración: {error}"))?;
    fs::write(settings_path(), encoded).map_err(|error| format!("No se pudo guardar la configuración: {error}"))?;
    *lock_settings() = Some(settings.clone());
    Ok(settings)
}

pub fn extra_roots() -> Vec<PathBuf> {
    cached()
        .extra_roots
        .into_iter()
        .map(PathBuf::from)
        .collect()
}

pub fn vscode_exe() -> Option<PathBuf> {
    cached().vscode_exe.map(PathBuf::from)
}

pub fn cursor_exe() -> Option<PathBuf> {
    cached().cursor_exe.map(PathBuf::from)
}

pub fn firefox_exe() -> Option<PathBuf> {
    cached().firefox_exe.map(PathBuf::from)
}

pub fn log_file() -> PathBuf {
    data_dir().join("launch.log")
}

fn sibling_with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(suffix);
    PathBuf::from(name)
}

fn copy_db_tree(old: &Path, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("No se pudo crear la carpeta de datos: {error}"))?;
    }
    fs::copy(old, dest).map_err(|error| format!("No se pudo copiar la base anterior: {error}"))?;
    for suffix in ["-wal", "-shm"] {
        let source = sibling_with_suffix(old, suffix);
        if source.exists() {
            let _ = fs::copy(&source, sibling_with_suffix(dest, suffix));
        }
    }
    Ok(())
}

fn find_import_db() -> Option<PathBuf> {
    let path = PathBuf::from(env::var_os("PARAVEL_IMPORT_DB")?);
    path.is_file().then_some(path)
}

pub fn maybe_adopt_legacy_db(dest: &Path) -> Result<(), String> {
    if dest.exists() {
        return Ok(());
    }
    let Some(old) = find_import_db() else {
        return Ok(());
    };
    copy_db_tree(&old, dest)
}

#[tauri::command]
pub fn get_host_settings(state: tauri::State<'_, AppState>) -> HostSettingsView {
    let settings = cached();
    HostSettingsView {
        extra_roots: settings.extra_roots,
        vscode_exe: settings.vscode_exe,
        cursor_exe: settings.cursor_exe,
        firefox_exe: settings.firefox_exe,
        data_dir: data_dir().to_string_lossy().into_owned(),
        db_path: state.db_path.to_string_lossy().into_owned(),
        log_path: log_file().to_string_lossy().into_owned(),
        home_root: env::var_os("USERPROFILE").map(|value| PathBuf::from(value).to_string_lossy().into_owned()),
    }
}

#[tauri::command]
pub fn save_host_settings(input: HostSettings) -> Result<HostSettings, String> {
    persist(input)
}

#[tauri::command]
pub async fn pick_executable(title: String) -> Option<String> {
    rfd::AsyncFileDialog::new()
        .set_title(title)
        .add_filter("Ejecutable", &["exe"])
        .pick_file()
        .await
        .map(|handle| handle.path().to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    fn isolate() -> (PathBuf, std::sync::MutexGuard<'static, ()>) {
        let guard = TEST_LOCK.lock().unwrap_or_else(|poison| poison.into_inner());
        let directory = env::temp_dir()
            .join("launch-host-test")
            .join(Uuid::new_v4().to_string());
        fs::create_dir_all(&directory).unwrap();
        set_data_dir(directory.clone());
        (directory, guard)
    }

    #[test]
    fn extra_root_roundtrip_dedupes_and_rejects_files() {
        let (directory, _guard) = isolate();
        let extra = directory.join("work");
        fs::create_dir_all(&extra).unwrap();
        let saved = persist(HostSettings {
            extra_roots: vec![
                extra.to_string_lossy().into_owned(),
                extra.to_string_lossy().into_owned(),
            ],
            ..HostSettings::default()
        })
        .unwrap();
        assert_eq!(saved.extra_roots.len(), 1);
        assert!(extra_roots()[0].ends_with("work"));
        let file = directory.join("notes.txt");
        fs::write(&file, "x").unwrap();
        assert!(persist(HostSettings {
            extra_roots: vec![file.to_string_lossy().into_owned()],
            ..HostSettings::default()
        })
        .is_err());
    }

    #[test]
    fn blank_exe_clears_override() {
        let (_directory, _guard) = isolate();
        let saved = persist(HostSettings {
            vscode_exe: Some("   ".into()),
            ..HostSettings::default()
        })
        .unwrap();
        assert!(saved.vscode_exe.is_none());
        assert!(vscode_exe().is_none());
    }

    #[test]
    fn adopt_skips_when_destination_exists() {
        let (directory, _guard) = isolate();
        let dest = directory.join(DB_FILE);
        fs::write(&dest, b"new").unwrap();
        maybe_adopt_legacy_db(&dest).unwrap();
        assert_eq!(fs::read(&dest).unwrap(), b"new");
    }

    #[test]
    fn adopt_copies_from_paravel_import_db() {
        let (directory, _guard) = isolate();
        let source = directory.join("old.sqlite3");
        fs::write(&source, b"legacy").unwrap();
        // SAFETY: tests are serialized by TEST_LOCK.
        unsafe {
            env::set_var("PARAVEL_IMPORT_DB", &source);
        }
        let dest = directory.join("fresh").join(DB_FILE);
        maybe_adopt_legacy_db(&dest).unwrap();
        unsafe {
            env::remove_var("PARAVEL_IMPORT_DB");
        }
        assert_eq!(fs::read(&dest).unwrap(), b"legacy");
    }
}
