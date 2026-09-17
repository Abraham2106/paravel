use rusqlite::{params, Connection};
use serde::Deserialize;
use paravel_context::ui::{self, group_icon, stored_group_icon};
pub use paravel_context::ui::{Group, Space, Piece};
use paravel_context::ui::navigation::{NavigationCatalog, NavigationResolve, NavigationTarget};
use serde_json::Value;
use std::{env, fs, path::PathBuf, sync::Mutex};
use uuid::Uuid;

use crate::{canonical_folder, validate_piece_payload};

pub struct AppState {
    pub db: Mutex<Connection>,
    pub db_path: PathBuf,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddPiece {
    pub space_id: String,
    pub kind: String,
    pub name: String,
    pub payload: Value,
}

fn now() -> String {
    crate::chrono_like_timestamp()
}

fn trimmed_name(raw: String, empty: &str) -> Result<String, String> {
    let name = raw.trim().to_string();
    if name.is_empty() {
        return Err(empty.to_string());
    }
    if name.chars().count() > 80 {
        return Err("El nombre es demasiado largo.".to_string());
    }
    Ok(name)
}

fn ensure_grupo_icono(db: &Connection) -> Result<(), String> {
    let mut stmt = db.prepare("PRAGMA table_info(grupo)").map_err(|e| e.to_string())?;
    let names = stmt.query_map([], |row| row.get::<_, String>(1)).map_err(|e| e.to_string())?;
    for name in names {
        if name.map_err(|e| e.to_string())? == "icono" {
            return Ok(());
        }
    }
    db.execute(
        "ALTER TABLE grupo ADD COLUMN icono TEXT NOT NULL DEFAULT 'folder'",
        [],
    ).map_err(|e| format!("No se pudo agregar icono al grupo: {e}"))?;
    Ok(())
}

pub fn open(path: PathBuf) -> Result<AppState, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("No se pudo crear la carpeta de datos: {e}"))?;
    }
    let connection = Connection::open(&path).map_err(|e| format!("No se pudo abrir SQLite: {e}"))?;
    migrate(&connection)?;
    seed_if_empty(&connection)?;
    Ok(AppState { db: Mutex::new(connection), db_path: path })
}

pub(crate) fn migrate(db: &Connection) -> Result<(), String> {
    db.execute_batch(
        "PRAGMA foreign_keys = ON;
         CREATE TABLE IF NOT EXISTS grupo (
           id TEXT PRIMARY KEY, nombre TEXT NOT NULL, icono TEXT NOT NULL DEFAULT 'folder',
           orden INTEGER NOT NULL, creado_en TEXT NOT NULL, editado_en TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS espacio (
           id TEXT PRIMARY KEY, grupo_id TEXT NOT NULL REFERENCES grupo(id) ON DELETE CASCADE,
           nombre TEXT NOT NULL, nota TEXT, bot_activo INTEGER NOT NULL DEFAULT 0,
           creado_en TEXT NOT NULL, editado_en TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS pieza (
           id TEXT PRIMARY KEY, espacio_id TEXT NOT NULL REFERENCES espacio(id) ON DELETE CASCADE,
           kind TEXT NOT NULL, nombre TEXT NOT NULL, payload TEXT NOT NULL,
           marcada INTEGER NOT NULL DEFAULT 1, orden INTEGER NOT NULL,
           creado_en TEXT NOT NULL, editado_en TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS pack_pieza (
           espacio_id TEXT NOT NULL REFERENCES espacio(id) ON DELETE CASCADE,
           pieza_id TEXT NOT NULL REFERENCES pieza(id) ON DELETE CASCADE,
           PRIMARY KEY (espacio_id, pieza_id)
         );
         CREATE INDEX IF NOT EXISTS idx_espacio_grupo ON espacio(grupo_id);
         CREATE INDEX IF NOT EXISTS idx_pieza_espacio ON pieza(espacio_id);
         CREATE INDEX IF NOT EXISTS idx_pack_pieza_pieza ON pack_pieza(pieza_id);",
    ).map_err(|e| format!("Migración SQLite falló: {e}"))?;
    ensure_grupo_icono(db)?;
    migrate_grupo_iconos(db)?;
    crate::continuity::migrate(db)?;
    crate::capture::migrate(db)?;
    crate::templates::migrate(db)
}

fn migrate_grupo_iconos(db: &Connection) -> Result<(), String> {
    let mut stmt = db.prepare("SELECT id, icono FROM grupo").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);
    for (id, icon) in rows {
        let next = stored_group_icon(&icon);
        if next != icon {
            db.execute("UPDATE grupo SET icono = ?1 WHERE id = ?2", params![next, id])
                .map_err(|e| format!("No se pudo migrar el icono del grupo: {e}"))?;
        }
    }
    Ok(())
}

fn seed_if_empty(db: &Connection) -> Result<(), String> {
    let count: i64 = db.query_row("SELECT COUNT(*) FROM grupo", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if count > 0 { return Ok(()); }
    let timestamp = now();
    let work = Uuid::new_v4().to_string();
    let university = Uuid::new_v4().to_string();
    let vscode_space = Uuid::new_v4().to_string();
    let firefox_space = Uuid::new_v4().to_string();
    let home = env::var_os("USERPROFILE").map(PathBuf::from)
        .and_then(|path| canonical_folder(path.to_string_lossy().as_ref()).ok());
    let folder = home.map(|path| serde_json::json!({ "path": path.to_string_lossy() }));
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO grupo (id, nombre, icono, orden, creado_en, editado_en) VALUES (?1, ?2, ?3, 0, ?4, ?4)",
        params![work, "Trabajo", "briefcase", timestamp],
    ).map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO grupo (id, nombre, icono, orden, creado_en, editado_en) VALUES (?1, ?2, ?3, 1, ?4, ?4)",
        params![university, "Universidad", "graduation-cap", timestamp],
    ).map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO espacio VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)", params![vscode_space, work, "Mi escritorio", "VS Code + carpeta", timestamp]).map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO espacio VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)", params![firefox_space, university, "Lecturas web", "Dos páginas de referencia", timestamp]).map_err(|e| e.to_string())?;
    if let Some(payload) = folder {
        tx.execute("INSERT INTO pieza VALUES (?1, ?2, 'vscode', ?3, ?4, 1, 0, ?5, ?5)",
            params![Uuid::new_v4().to_string(), vscode_space, "Workspace", payload.to_string(), timestamp]).map_err(|e| e.to_string())?;
    }
    for (order, url) in ["https://example.com", "https://www.mozilla.org"].iter().enumerate() {
        let payload = serde_json::json!({ "urls": [url] });
        tx.execute("INSERT INTO pieza VALUES (?1, ?2, 'firefox', ?3, ?4, 1, ?5, ?6, ?6)",
            params![Uuid::new_v4().to_string(), firefox_space, url, payload.to_string(), order as i64, timestamp]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_path(state: tauri::State<'_, AppState>) -> String {
    state.db_path.to_string_lossy().into_owned()
}

#[tauri::command]
pub fn list_groups(state: tauri::State<'_, AppState>) -> Result<Vec<Group>, String> {
    let db = state.db.lock().map_err(|_| "SQLite bloqueado.".to_string())?;
    ui::list_groups(&db)
}

#[tauri::command]
pub fn create_group(name: String, icon: String, state: tauri::State<'_, AppState>) -> Result<Group, String> {
    let name = trimmed_name(name, "El grupo necesita un nombre.")?;
    let icon = group_icon(&icon)?;
    let db = state.db.lock().map_err(|_| "SQLite bloqueado.".to_string())?;
    let order: i64 = db.query_row("SELECT COALESCE(MAX(orden), -1) + 1 FROM grupo", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let timestamp = now();
    db.execute(
        "INSERT INTO grupo (id, nombre, icono, orden, creado_en, editado_en) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![id, name, icon, order, timestamp],
    ).map_err(|e| format!("No se pudo crear el grupo: {e}"))?;
    Ok(Group { id, name, icon, order })
}

#[tauri::command]
pub fn update_group(id: String, name: String, icon: String, state: tauri::State<'_, AppState>) -> Result<Group, String> {
    Uuid::parse_str(&id).map_err(|_| "El grupo no tiene un UUID válido.".to_string())?;
    let name = trimmed_name(name, "El grupo necesita un nombre.")?;
    let icon = group_icon(&icon)?;
    let db = state.db.lock().map_err(|_| "SQLite bloqueado.".to_string())?;
    let changed = db.execute(
        "UPDATE grupo SET nombre = ?1, icono = ?2, editado_en = ?3 WHERE id = ?4",
        params![name, icon, now(), id],
    ).map_err(|e| format!("No se pudo editar el grupo: {e}"))?;
    if changed == 0 {
        return Err("El grupo no existe.".to_string());
    }
    let order: i64 = db.query_row("SELECT orden FROM grupo WHERE id = ?1", [&id], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(Group { id, name, icon, order })
}

#[tauri::command]
pub fn create_space(group_id: String, name: String, note: Option<String>, state: tauri::State<'_, AppState>) -> Result<Space, String> {
    Uuid::parse_str(&group_id).map_err(|_| "El grupo no tiene un UUID válido.".to_string())?;
    let name = trimmed_name(name, "El espacio necesita un nombre.")?;
    let note = note.map(|value| value.trim().to_string()).filter(|value| !value.is_empty());
    let db = state.db.lock().map_err(|_| "SQLite bloqueado.".to_string())?;
    let exists: i64 = db.query_row("SELECT COUNT(*) FROM grupo WHERE id = ?1", [&group_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if exists == 0 {
        return Err("El grupo no existe.".to_string());
    }
    let id = Uuid::new_v4().to_string();
    let timestamp = now();
    db.execute(
        "INSERT INTO espacio (id, grupo_id, nombre, nota, bot_activo, creado_en, editado_en) VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)",
        params![id, group_id, name, note, timestamp],
    ).map_err(|e| format!("No se pudo crear el espacio: {e}"))?;
    Ok(Space {
        id,
        group_id,
        name,
        note,
        pack: Vec::new(),
        bot_active: false,
    })
}

#[tauri::command]
pub fn list_spaces(state: tauri::State<'_, AppState>) -> Result<Vec<Space>, String> {
    let db = state.db.lock().map_err(|_| "SQLite bloqueado.".to_string())?;
    ui::list_spaces(&db)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InviteInput {
    pub space_id: String,
    pub piece_ids: Vec<String>,
}

#[tauri::command]
pub fn get_invite(space_id: String, state: tauri::State<'_, AppState>) -> Result<Vec<String>, String> {
    let db = state.db.lock().map_err(|_| "SQLite bloqueado.".to_string())?;
    ui::get_invite(&db, &space_id)
}

#[tauri::command]
pub fn set_invite(input: InviteInput, state: tauri::State<'_, AppState>) -> Result<Vec<String>, String> {
    Uuid::parse_str(&input.space_id).map_err(|_| "El espacio no tiene un UUID válido.".to_string())?;
    let mut piece_ids = input.piece_ids;
    piece_ids.sort();
    piece_ids.dedup();
    for piece_id in &piece_ids {
        Uuid::parse_str(piece_id).map_err(|_| "El pack contiene una pieza con UUID inválido.".to_string())?;
    }

    let db = state.db.lock().map_err(|_| "SQLite bloqueado.".to_string())?;
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    let space_exists: i64 = tx.query_row(
        "SELECT COUNT(*) FROM espacio WHERE id = ?1", [&input.space_id], |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    if space_exists == 0 {
        return Err("El espacio no existe.".to_string());
    }
    for piece_id in &piece_ids {
        let belongs: i64 = tx.query_row(
            "SELECT COUNT(*) FROM pieza WHERE id = ?1 AND espacio_id = ?2",
            params![piece_id, input.space_id],
            |row| row.get(0),
        ).map_err(|e| e.to_string())?;
        if belongs == 0 {
            return Err("Una pieza no pertenece a este espacio.".to_string());
        }
    }
    tx.execute("DELETE FROM pack_pieza WHERE espacio_id = ?1", [&input.space_id])
        .map_err(|e| e.to_string())?;
    for piece_id in &piece_ids {
        tx.execute(
            "INSERT INTO pack_pieza (espacio_id, pieza_id) VALUES (?1, ?2)",
            params![input.space_id, piece_id],
        ).map_err(|e| e.to_string())?;
    }
    tx.execute(
        "UPDATE espacio SET bot_activo = 1, editado_en = ?1 WHERE id = ?2",
        params![now(), input.space_id],
    ).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(piece_ids)
}

#[tauri::command]
pub fn clear_invite(space_id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    Uuid::parse_str(&space_id).map_err(|_| "El espacio no tiene un UUID válido.".to_string())?;
    let db = state.db.lock().map_err(|_| "SQLite bloqueado.".to_string())?;
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM pack_pieza WHERE espacio_id = ?1", [&space_id])
        .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE espacio SET bot_activo = 0, editado_en = ?1 WHERE id = ?2",
        params![now(), space_id],
    ).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_pieces(space_id: String, state: tauri::State<'_, AppState>) -> Result<Vec<Piece>, String> {
    let db = state.db.lock().map_err(|_| "SQLite bloqueado.".to_string())?;
    ui::list_pieces(&db, &space_id)
}

#[tauri::command]
pub fn set_marked(piece_id: String, marked: bool, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "SQLite bloqueado.".to_string())?;
    db.execute("UPDATE pieza SET marcada = ?1, editado_en = ?2 WHERE id = ?3", params![marked as i64, now(), piece_id])
        .map_err(|e| format!("No se pudo marcar la pieza: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_piece(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "SQLite bloqueado.".to_string())?;
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    let exists: i64 = tx.query_row(
        "SELECT COUNT(*) FROM pieza WHERE id = ?1",
        [&id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    if exists == 0 {
        return Err("La pieza no existe.".to_string());
    }
    tx.execute("DELETE FROM pack_pieza WHERE pieza_id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM pieza WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_navigation_catalog(state: tauri::State<'_, AppState>) -> Result<NavigationCatalog, String> {
    let db = state.db.lock().map_err(|_| "SQLite bloqueado.".to_string())?;
    ui::navigation::list_navigation_catalog(&db)
}

#[tauri::command]
pub fn resolve_navigation_target(
    target: NavigationTarget,
    state: tauri::State<'_, AppState>,
) -> Result<NavigationResolve, String> {
    let db = state.db.lock().map_err(|_| "SQLite bloqueado.".to_string())?;
    ui::navigation::resolve_navigation_target(&db, &target)
}

#[tauri::command]
pub fn add_piece(input: AddPiece, state: tauri::State<'_, AppState>) -> Result<Piece, String> {
    let input = if input.kind == "firefox-group" {
        AddPiece { name: trimmed_name(input.name, "El grupo de Firefox necesita un nombre.")?, ..input }
    } else { input };
    let payload = validate_piece_payload(&input.kind, input.payload)?;
    let db = state.db.lock().map_err(|_| "SQLite bloqueado.".to_string())?;
    let exists: i64 = db.query_row("SELECT COUNT(*) FROM espacio WHERE id = ?1", [&input.space_id], |r| r.get(0)).map_err(|e| e.to_string())?;
    if exists == 0 { return Err("El espacio no existe.".to_string()); }
    let order: i64 = db.query_row("SELECT COALESCE(MAX(orden), -1) + 1 FROM pieza WHERE espacio_id = ?1", [&input.space_id], |r| r.get(0)).map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    db.execute("INSERT INTO pieza VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, ?7)", params![id, input.space_id, input.kind, input.name, payload.to_string(), order, now()])
        .map_err(|e| format!("No se pudo guardar la pieza: {e}"))?;
    Ok(Piece { id, space_id: input.space_id, kind: input.kind, name: input.name, payload, marked: true, order })
}
