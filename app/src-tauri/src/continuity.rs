use crate::db::AppState;
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const MAX_BYTES: usize = 32_768;
const MAX_TIMESTAMP: i64 = 9_007_199_254_740_991;
const UNAVAILABLE: &str =
    "DATABASE_UNAVAILABLE: Los cierres no están disponibles. Intente de nuevo.";
const NOT_FOUND: &str = "NOT_FOUND: El cierre o el espacio no existe en este espacio.";
const CONFLICT: &str =
    "CONFLICT: El cierre cambió o el identificador ya está en uso. Recargue antes de reintentar.";
const CAPACITY: &str = "CAPACITY_EXCEEDED: Este espacio contiene 1000 cierres. Elimine uno explícitamente antes de crear otro.";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Closure {
    pub id: String,
    pub space_id: String,
    pub objective: String,
    pub progress: String,
    pub next_action: String,
    pub blocker: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub revision: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveClosure {
    pub id: String,
    pub space_id: String,
    pub objective: String,
    pub progress: String,
    pub next_action: String,
    pub blocker: String,
    #[serde(deserialize_with = "Option::<u32>::deserialize")]
    pub expected_revision: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClosurePage {
    pub items: Vec<Closure>,
    pub next_cursor: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Cursor {
    version: u8,
    space_id: String,
    created_at: i64,
    id: String,
}

fn invalid(message: &str) -> String {
    format!("INVALID_ARGUMENT: {message}")
}

fn db_error(_: rusqlite::Error) -> String {
    UNAVAILABLE.to_string()
}

fn uuid(raw: &str) -> Result<String, String> {
    if raw.len() != 36
        || !raw.bytes().enumerate().all(|(index, byte)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                byte == b'-'
            } else {
                byte.is_ascii_hexdigit()
            }
        })
    {
        return Err(invalid("Se requiere un UUID válido con guiones."));
    }
    Uuid::parse_str(raw)
        .map(|id| id.to_string())
        .map_err(|_| invalid("Se requiere un UUID válido con guiones."))
}

fn validate(mut input: SaveClosure) -> Result<SaveClosure, String> {
    input.id = uuid(&input.id)?;
    input.space_id = uuid(&input.space_id)?;
    if input.expected_revision == Some(0) {
        return Err(invalid("La revisión debe ser mayor que cero."));
    }
    let fields = [
        (&input.objective, 500),
        (&input.progress, 4000),
        (&input.next_action, 2000),
        (&input.blocker, 2000),
    ];
    if fields.iter().any(|(text, _)| text.len() > MAX_BYTES)
        || fields.iter().map(|(text, _)| text.len()).sum::<usize>() > MAX_BYTES
    {
        return Err(invalid("El texto total supera 32768 bytes UTF-8."));
    }
    if fields.iter().any(|(text, max)| text.chars().count() > *max) {
        return Err(invalid("Límites de caracteres: objetivo 500, avance 4000, siguiente acción 2000 y bloqueo 2000."));
    }
    input.objective = input.objective.trim().to_owned();
    input.progress = input.progress.trim().to_owned();
    input.next_action = input.next_action.trim().to_owned();
    input.blocker = input.blocker.trim().to_owned();
    if input.progress.is_empty() {
        return Err(invalid("El último avance es obligatorio."));
    }
    Ok(input)
}

struct BusyTimeout<'a> {
    db: &'a Connection,
    previous: Duration,
}

impl<'a> BusyTimeout<'a> {
    fn new(db: &'a Connection) -> Result<Self, String> {
        let millis: u64 = db
            .query_row("PRAGMA busy_timeout", [], |row| row.get(0))
            .map_err(db_error)?;
        db.busy_timeout(Duration::from_millis(1500))
            .map_err(db_error)?;
        Ok(Self {
            db,
            previous: Duration::from_millis(millis),
        })
    }
}

impl Drop for BusyTimeout<'_> {
    fn drop(&mut self) {
        let _ = self.db.busy_timeout(self.previous);
    }
}

pub(crate) fn migrate(db: &Connection) -> Result<(), String> {
    let _timeout = BusyTimeout::new(db)?;
    let tx = Transaction::new_unchecked(db, TransactionBehavior::Immediate).map_err(db_error)?;
    tx.execute_batch(
        "CREATE TABLE IF NOT EXISTS cierre (
            id TEXT NOT NULL PRIMARY KEY,
            espacio_id TEXT NOT NULL REFERENCES espacio(id) ON DELETE CASCADE,
            objective TEXT NOT NULL CHECK(length(objective) <= 500),
            progress TEXT NOT NULL CHECK(length(progress) BETWEEN 1 AND 4000),
            next_action TEXT NOT NULL CHECK(length(next_action) <= 2000),
            blocker TEXT NOT NULL CHECK(length(blocker) <= 2000),
            created_at INTEGER NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
            updated_at INTEGER NOT NULL CHECK(updated_at BETWEEN created_at AND 9007199254740991),
            revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 4294967295),
            CHECK(length(CAST(objective AS BLOB)) + length(CAST(progress AS BLOB)) +
                  length(CAST(next_action AS BLOB)) + length(CAST(blocker AS BLOB)) <= 32768)
         );
         CREATE INDEX IF NOT EXISTS idx_cierre_espacio_created_id
            ON cierre(espacio_id, created_at DESC, id DESC);",
    )
    .map_err(db_error)?;
    tx.commit().map_err(db_error)
}

fn ensure_space(db: &Connection, space_id: &str) -> Result<(), String> {
    let exists: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM espacio WHERE id = ?1)",
            [space_id],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    if exists {
        Ok(())
    } else {
        Err(NOT_FOUND.to_string())
    }
}

fn read_row(row: &Row<'_>) -> rusqlite::Result<Closure> {
    Ok(Closure {
        id: row.get(0)?,
        space_id: row.get(1)?,
        objective: row.get(2)?,
        progress: row.get(3)?,
        next_action: row.get(4)?,
        blocker: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        revision: row.get(8)?,
    })
}

fn find(db: &Connection, space_id: &str, id: &str) -> Result<Option<Closure>, String> {
    db.query_row(
        "SELECT id, espacio_id, objective, progress, next_action, blocker, created_at, updated_at, revision
         FROM cierre WHERE espacio_id = ?1 AND id = ?2",
        params![space_id, id], read_row,
    ).optional().map_err(db_error)
}

pub(crate) fn get(db: &Connection, space_id: &str, id: &str) -> Result<Closure, String> {
    let space_id = uuid(space_id)?;
    let id = uuid(id)?;
    let _timeout = BusyTimeout::new(db)?;
    find(db, &space_id, &id)?.ok_or_else(|| NOT_FOUND.to_string())
}

pub(crate) fn list(
    db: &Connection,
    space_id: &str,
    cursor: Option<&str>,
    limit: Option<u32>,
) -> Result<ClosurePage, String> {
    let space_id = uuid(space_id)?;
    let limit = limit.unwrap_or(20);
    if !(1..=50).contains(&limit) {
        return Err(invalid("El tamaño de página debe estar entre 1 y 50."));
    }
    let after = cursor
        .map(|raw| {
            if raw.is_empty() || raw.len() > 1024 {
                return Err(invalid("El cursor no es válido."));
            }
            let decoded: Cursor =
                serde_json::from_str(raw).map_err(|_| invalid("El cursor no es válido."))?;
            if decoded.version != 1
                || decoded.space_id != space_id
                || uuid(&decoded.id)? != decoded.id
                || !(0..=MAX_TIMESTAMP).contains(&decoded.created_at)
            {
                return Err(invalid(
                    "El cursor no corresponde a este espacio o no es válido.",
                ));
            }
            Ok(decoded)
        })
        .transpose()?;
    let _timeout = BusyTimeout::new(db)?;
    let tx = db.unchecked_transaction().map_err(db_error)?;
    ensure_space(&tx, &space_id)?;
    let mut items = {
        let mut stmt = tx.prepare(
            "SELECT id, espacio_id, objective, progress, next_action, blocker, created_at, updated_at, revision
             FROM cierre WHERE espacio_id = ?1 AND (?2 IS NULL OR (created_at, id) < (?2, ?3))
             ORDER BY created_at DESC, id DESC LIMIT ?4",
        ).map_err(db_error)?;
        let rows = stmt
            .query_map(
                params![
                    space_id,
                    after.as_ref().map(|c| c.created_at),
                    after.as_ref().map(|c| c.id.as_str()),
                    limit + 1
                ],
                read_row,
            )
            .map_err(db_error)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(db_error)?
    };
    let next_cursor = if items.len() > limit as usize {
        items.truncate(limit as usize);
        items
            .last()
            .map(|last| {
                serde_json::to_string(&Cursor {
                    version: 1,
                    space_id,
                    created_at: last.created_at,
                    id: last.id.clone(),
                })
                .map_err(|_| UNAVAILABLE.to_string())
            })
            .transpose()?
    } else {
        None
    };
    tx.commit().map_err(db_error)?;
    Ok(ClosurePage { items, next_cursor })
}

fn now() -> Result<i64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|time| i64::try_from(time.as_millis()).ok())
        .filter(|time| *time <= MAX_TIMESTAMP)
        .ok_or_else(|| UNAVAILABLE.to_string())
}

pub(crate) fn save(db: &Connection, input: SaveClosure) -> Result<Closure, String> {
    let input = validate(input)?;
    let _timeout = BusyTimeout::new(db)?;
    let tx = Transaction::new_unchecked(db, TransactionBehavior::Immediate).map_err(db_error)?;
    ensure_space(&tx, &input.space_id)?;
    let existing = find(&tx, &input.space_id, &input.id)?;
    if let Some(revision) = input.expected_revision {
        let previous = existing.ok_or_else(|| NOT_FOUND.to_string())?;
        if previous.revision != revision || revision == u32::MAX {
            return Err(CONFLICT.to_string());
        }
        let timestamp = now()?.max(previous.updated_at);
        let changed = tx
            .execute(
                "UPDATE cierre SET objective = ?1, progress = ?2, next_action = ?3, blocker = ?4,
             updated_at = ?5, revision = revision + 1
             WHERE espacio_id = ?6 AND id = ?7 AND revision = ?8",
                params![
                    input.objective,
                    input.progress,
                    input.next_action,
                    input.blocker,
                    timestamp,
                    input.space_id,
                    input.id,
                    revision
                ],
            )
            .map_err(db_error)?;
        if changed != 1 {
            return Err(CONFLICT.to_string());
        }
    } else {
        if let Some(previous) = existing {
            if previous.objective != input.objective
                || previous.progress != input.progress
                || previous.next_action != input.next_action
                || previous.blocker != input.blocker
            {
                return Err(CONFLICT.to_string());
            }
            tx.commit().map_err(db_error)?;
            return Ok(previous);
        }
        let count: u32 = tx
            .query_row(
                "SELECT COUNT(*) FROM cierre WHERE espacio_id = ?1",
                [&input.space_id],
                |row| row.get(0),
            )
            .map_err(db_error)?;
        if count >= 1000 {
            return Err(CAPACITY.to_string());
        }
        let timestamp = now()?;
        let changed = tx.execute(
            "INSERT INTO cierre (id, espacio_id, objective, progress, next_action, blocker, created_at, updated_at, revision)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, 1) ON CONFLICT(id) DO NOTHING",
            params![input.id, input.space_id, input.objective, input.progress,
                input.next_action, input.blocker, timestamp],
        ).map_err(db_error)?;
        if changed != 1 {
            return Err(CONFLICT.to_string());
        }
    }
    let result = find(&tx, &input.space_id, &input.id)?.ok_or_else(|| UNAVAILABLE.to_string())?;
    tx.commit().map_err(db_error)?;
    Ok(result)
}

pub(crate) fn delete(
    db: &Connection,
    space_id: &str,
    id: &str,
    revision: u32,
) -> Result<(), String> {
    let space_id = uuid(space_id)?;
    let id = uuid(id)?;
    if revision == 0 {
        return Err(invalid("La revisión debe ser mayor que cero."));
    }
    let _timeout = BusyTimeout::new(db)?;
    let tx = Transaction::new_unchecked(db, TransactionBehavior::Immediate).map_err(db_error)?;
    let existing = find(&tx, &space_id, &id)?.ok_or_else(|| NOT_FOUND.to_string())?;
    if existing.revision != revision {
        return Err(CONFLICT.to_string());
    }
    let changed = tx
        .execute(
            "DELETE FROM cierre WHERE espacio_id = ?1 AND id = ?2 AND revision = ?3",
            params![space_id, id, revision],
        )
        .map_err(db_error)?;
    if changed != 1 {
        return Err(CONFLICT.to_string());
    }
    tx.commit().map_err(db_error)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_closures(
    space_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
    state: tauri::State<'_, AppState>,
) -> Result<ClosurePage, String> {
    let db = state.db.try_lock().map_err(|_| UNAVAILABLE.to_string())?;
    list(&db, &space_id, cursor.as_deref(), limit)
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_closure(
    space_id: String,
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Closure, String> {
    let db = state.db.try_lock().map_err(|_| UNAVAILABLE.to_string())?;
    get(&db, &space_id, &id)
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_closure(
    input: SaveClosure,
    state: tauri::State<'_, AppState>,
) -> Result<Closure, String> {
    let db = state.db.try_lock().map_err(|_| UNAVAILABLE.to_string())?;
    save(&db, input)
}

#[tauri::command(rename_all = "camelCase")]
pub fn delete_closure(
    space_id: String,
    id: String,
    revision: u32,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.try_lock().map_err(|_| UNAVAILABLE.to_string())?;
    delete(&db, &space_id, &id, revision)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::{types::Value, OpenFlags};
    use serde_json::json;
    use std::{
        path::PathBuf,
        sync::{Arc, Barrier},
        time::Instant,
    };

    const SPACE: &str = "00000000-0000-4000-8000-000000000001";
    const OTHER: &str = "00000000-0000-4000-8000-000000000002";
    const MISSING: &str = "00000000-0000-4000-8000-000000000003";
    const PIECE: &str = "00000000-0000-4000-8000-000000000004";
    const SENTINEL: &str = "PRIVATE_CLOSURE_SENTINEL_P01";

    fn legacy(db: &Connection) {
        db.execute_batch(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE grupo (
                id TEXT PRIMARY KEY, nombre TEXT NOT NULL, icono TEXT NOT NULL DEFAULT 'folder',
                orden INTEGER NOT NULL, creado_en TEXT NOT NULL, editado_en TEXT NOT NULL
             );
             CREATE TABLE espacio (
                id TEXT PRIMARY KEY, grupo_id TEXT NOT NULL REFERENCES grupo(id) ON DELETE CASCADE,
                nombre TEXT NOT NULL, nota TEXT, bot_activo INTEGER NOT NULL DEFAULT 0,
                creado_en TEXT NOT NULL, editado_en TEXT NOT NULL
             );
             CREATE TABLE pieza (
                id TEXT PRIMARY KEY, espacio_id TEXT NOT NULL REFERENCES espacio(id) ON DELETE CASCADE,
                kind TEXT NOT NULL, nombre TEXT NOT NULL, payload TEXT NOT NULL,
                marcada INTEGER NOT NULL DEFAULT 1, orden INTEGER NOT NULL,
                creado_en TEXT NOT NULL, editado_en TEXT NOT NULL
             );
             CREATE TABLE pack_pieza (
                espacio_id TEXT NOT NULL REFERENCES espacio(id) ON DELETE CASCADE,
                pieza_id TEXT NOT NULL REFERENCES pieza(id) ON DELETE CASCADE,
                PRIMARY KEY (espacio_id, pieza_id)
             );
             INSERT INTO grupo VALUES ('00000000-0000-4000-8000-000000000005', 'Grupo', 'folder', 0, '11', '12');",
        ).unwrap();
        for space in [SPACE, OTHER] {
            db.execute(
                "INSERT INTO espacio VALUES (?1, '00000000-0000-4000-8000-000000000005', 'Mesa', 'Nota pública', 1, '13', '14')",
                [space],
            ).unwrap();
        }
        db.execute("INSERT INTO pieza VALUES (?1, ?2, 'firefox', 'Pieza', '{\"urls\":[\"https://example.com\"]}', 0, 2, '15', '16')", params![PIECE, SPACE]).unwrap();
        db.execute(
            "INSERT INTO pack_pieza VALUES (?1, ?2)",
            params![SPACE, PIECE],
        )
        .unwrap();
    }

    fn fixture() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        legacy(&db);
        crate::db::migrate(&db).unwrap();
        db
    }

    fn input() -> SaveClosure {
        SaveClosure {
            id: Uuid::new_v4().to_string(),
            space_id: SPACE.to_string(),
            objective: String::new(),
            progress: "Avance".to_string(),
            next_action: String::new(),
            blocker: String::new(),
            expected_revision: None,
        }
    }

    fn assert_code<T: std::fmt::Debug>(result: Result<T, String>, code: &str) {
        assert!(result.unwrap_err().starts_with(&format!("{code}:")));
    }

    fn snapshot(db: &Connection) -> Vec<Vec<Vec<Value>>> {
        ["grupo", "espacio", "pieza", "pack_pieza"]
            .iter()
            .map(|table| {
                let mut stmt = db
                    .prepare(&format!("SELECT * FROM {table} ORDER BY 1, 2"))
                    .unwrap();
                let columns = stmt.column_count();
                stmt.query_map([], |row| (0..columns).map(|i| row.get(i)).collect())
                    .unwrap()
                    .collect::<Result<Vec<_>, _>>()
                    .unwrap()
            })
            .collect()
    }

    struct DiskDb(PathBuf);

    impl DiskDb {
        fn new() -> Self {
            Self(
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("target")
                    .join(format!("continuity-test-{}.sqlite3", Uuid::new_v4())),
            )
        }
    }

    impl Drop for DiskDb {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }

    #[test]
    fn migration_is_additive_repeatable_and_preserves_legacy_data() {
        let db = Connection::open_in_memory().unwrap();
        legacy(&db);
        let before = snapshot(&db);
        let schema = |db: &Connection| {
            let mut stmt = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name IN ('grupo', 'espacio', 'pieza', 'pack_pieza') ORDER BY name").unwrap();
            stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
        };
        let old_schema = schema(&db);
        crate::db::migrate(&db).unwrap();
        crate::db::migrate(&db).unwrap();
        assert_eq!(schema(&db), old_schema);
        assert_eq!(snapshot(&db), before);
        assert!(list(&db, SPACE, None, None).unwrap().items.is_empty());
        let request = input();
        let saved = save(&db, request.clone()).unwrap();
        crate::db::migrate(&db).unwrap();
        assert_eq!(get(&db, SPACE, &saved.id).unwrap(), saved);
        let edited = save(
            &db,
            SaveClosure {
                progress: SENTINEL.to_string(),
                expected_revision: Some(1),
                ..request
            },
        )
        .unwrap();
        delete(&db, SPACE, &edited.id, edited.revision).unwrap();
        assert_eq!(snapshot(&db), before);
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| r
                .get::<_, u32>(
                0
            ))
            .unwrap(),
            0
        );
    }

    #[test]
    fn failed_migration_rolls_back_and_can_be_retried() {
        let db = Connection::open_in_memory().unwrap();
        legacy(&db);
        let before = snapshot(&db);
        db.execute_batch("CREATE TABLE idx_cierre_espacio_created_id (id INTEGER);")
            .unwrap();
        assert_code(crate::db::migrate(&db), "DATABASE_UNAVAILABLE");
        assert!(db.is_autocommit());
        assert_eq!(
            db.query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE name = 'cierre'",
                [],
                |r| r.get::<_, u32>(0)
            )
            .unwrap(),
            0
        );
        assert_eq!(snapshot(&db), before);
        db.execute_batch("DROP TABLE idx_cierre_espacio_created_id;")
            .unwrap();
        crate::db::migrate(&db).unwrap();
        save(&db, input()).unwrap();
    }

    #[test]
    fn fresh_database_migrates_and_seeds() {
        let file = DiskDb::new();
        let state = crate::db::open(file.0.clone()).unwrap();
        let db = state.db.lock().unwrap();
        let space: String = db
            .query_row("SELECT id FROM espacio LIMIT 1", [], |r| r.get(0))
            .unwrap();
        assert!(list(&db, &space, None, None).unwrap().items.is_empty());
        save(
            &db,
            SaveClosure {
                space_id: space,
                ..input()
            },
        )
        .unwrap();
    }

    #[test]
    fn create_retry_edit_and_delete_use_revisions() {
        let db = fixture();
        let mut request = input();
        request.progress = "  Avance\n".to_string();
        let saved = save(&db, request.clone()).unwrap();
        assert_eq!(saved.progress, "Avance");
        assert_eq!(saved.revision, 1);
        assert_eq!(saved.created_at, saved.updated_at);
        assert!(saved.created_at > 1_700_000_000_000);
        assert_eq!(save(&db, request.clone()).unwrap(), saved);
        assert_code(
            save(
                &db,
                SaveClosure {
                    objective: "Diferente".into(),
                    ..request.clone()
                },
            ),
            "CONFLICT",
        );
        let edited = save(
            &db,
            SaveClosure {
                progress: "Editado".into(),
                expected_revision: Some(1),
                ..request.clone()
            },
        )
        .unwrap();
        assert_eq!(edited.revision, 2);
        assert_eq!(edited.created_at, saved.created_at);
        assert!(edited.updated_at >= saved.updated_at);
        assert_code(save(&db, request.clone()), "CONFLICT");
        assert_code(
            save(
                &db,
                SaveClosure {
                    expected_revision: Some(1),
                    ..request
                },
            ),
            "CONFLICT",
        );
        assert_code(delete(&db, SPACE, &saved.id, 1), "CONFLICT");
        assert_eq!(get(&db, SPACE, &saved.id).unwrap(), edited);
        delete(&db, SPACE, &saved.id, 2).unwrap();
        assert_code(get(&db, SPACE, &saved.id), "NOT_FOUND");
        assert_code(delete(&db, SPACE, &saved.id, 2), "NOT_FOUND");
        assert!(list(&db, SPACE, None, Some(1)).unwrap().items.is_empty());
    }

    #[test]
    fn foreign_ids_and_missing_spaces_are_isolated() {
        let db = fixture();
        let request = input();
        let saved = save(&db, request.clone()).unwrap();
        assert_code(get(&db, OTHER, &saved.id), "NOT_FOUND");
        assert_code(delete(&db, OTHER, &saved.id, saved.revision), "NOT_FOUND");
        assert_code(
            save(
                &db,
                SaveClosure {
                    space_id: OTHER.into(),
                    expected_revision: Some(1),
                    ..request.clone()
                },
            ),
            "NOT_FOUND",
        );
        assert_code(
            save(
                &db,
                SaveClosure {
                    space_id: OTHER.into(),
                    ..request.clone()
                },
            ),
            "CONFLICT",
        );
        assert!(list(&db, OTHER, None, None).unwrap().items.is_empty());
        assert_eq!(get(&db, SPACE, &saved.id).unwrap(), saved);
        assert_code(list(&db, MISSING, None, None), "NOT_FOUND");
        assert_code(
            save(
                &db,
                SaveClosure {
                    space_id: MISSING.into(),
                    ..input()
                },
            ),
            "NOT_FOUND",
        );
        assert_code(
            save(
                &db,
                SaveClosure {
                    expected_revision: Some(1),
                    ..input()
                },
            ),
            "NOT_FOUND",
        );
        assert_code(get(&db, MISSING, &saved.id), "NOT_FOUND");
        assert_code(delete(&db, MISSING, &saved.id, 1), "NOT_FOUND");
    }

    #[test]
    fn strict_uuids_are_checked_on_every_operation() {
        let db = fixture();
        let saved = save(&db, input()).unwrap();
        for bad in [
            "",
            "not-a-uuid",
            "00000000000040008000000000000001",
            "{00000000-0000-4000-8000-000000000001}",
            "' OR 1=1 --",
        ] {
            assert_code(list(&db, bad, None, None), "INVALID_ARGUMENT");
            assert_code(get(&db, bad, &saved.id), "INVALID_ARGUMENT");
            assert_code(get(&db, SPACE, bad), "INVALID_ARGUMENT");
            assert_code(delete(&db, bad, &saved.id, 1), "INVALID_ARGUMENT");
            assert_code(delete(&db, SPACE, bad, 1), "INVALID_ARGUMENT");
            assert_code(
                save(
                    &db,
                    SaveClosure {
                        id: bad.into(),
                        ..input()
                    },
                ),
                "INVALID_ARGUMENT",
            );
            assert_code(
                save(
                    &db,
                    SaveClosure {
                        space_id: bad.into(),
                        ..input()
                    },
                ),
                "INVALID_ARGUMENT",
            );
        }
        assert_eq!(get(&db, SPACE, &saved.id.to_uppercase()).unwrap(), saved);
        assert_code(delete(&db, SPACE, &saved.id, 0), "INVALID_ARGUMENT");
        assert_code(
            save(
                &db,
                SaveClosure {
                    expected_revision: Some(0),
                    ..input()
                },
            ),
            "INVALID_ARGUMENT",
        );
    }

    #[test]
    fn text_scalar_and_utf8_bounds_are_enforced_without_partial_writes() {
        let db = fixture();
        for text in ["", " \r\n\t\u{2003}"] {
            assert_code(
                save(
                    &db,
                    SaveClosure {
                        progress: text.into(),
                        ..input()
                    },
                ),
                "INVALID_ARGUMENT",
            );
        }
        for (field, max) in [(0, 500), (1, 4000), (2, 2000), (3, 2000)] {
            let mut request = input();
            let text = "é".repeat(max);
            match field {
                0 => request.objective = text,
                1 => request.progress = text,
                2 => request.next_action = text,
                _ => request.blocker = text,
            }
            save(&db, request.clone()).unwrap();
            request.id = Uuid::new_v4().to_string();
            match field {
                0 => request.objective.push('é'),
                1 => request.progress.push('é'),
                2 => request.next_action.push('é'),
                _ => request.blocker.push('é'),
            }
            assert_code(save(&db, request), "INVALID_ARGUMENT");
        }
        let mut exact = SaveClosure {
            objective: "\u{10ffff}".repeat(500),
            progress: "\u{10ffff}".repeat(4000),
            next_action: "\u{10ffff}".repeat(2000),
            blocker: "\u{10ffff}".repeat(1692),
            ..input()
        };
        assert_eq!(
            exact.objective.len()
                + exact.progress.len()
                + exact.next_action.len()
                + exact.blocker.len(),
            MAX_BYTES
        );
        save(&db, exact.clone()).unwrap();
        exact.id = Uuid::new_v4().to_string();
        exact.blocker.push('a');
        assert_code(save(&db, exact), "INVALID_ARGUMENT");
        assert_code(
            save(
                &db,
                SaveClosure {
                    progress: " ".repeat(MAX_BYTES + 1),
                    ..input()
                },
            ),
            "INVALID_ARGUMENT",
        );
        assert_eq!(list(&db, SPACE, None, None).unwrap().items.len(), 5);
    }

    #[test]
    fn wire_dtos_are_camel_case_and_input_is_strict() {
        let valid = json!({"id": SPACE, "spaceId": SPACE, "objective": "", "progress": "Avance", "nextAction": "", "blocker": "", "expectedRevision": null});
        assert!(serde_json::from_value::<SaveClosure>(valid.clone())
            .unwrap()
            .expected_revision
            .is_none());
        for field in [
            "id",
            "spaceId",
            "objective",
            "progress",
            "nextAction",
            "blocker",
            "expectedRevision",
        ] {
            let mut missing = valid.clone();
            missing.as_object_mut().unwrap().remove(field);
            assert!(
                serde_json::from_value::<SaveClosure>(missing).is_err(),
                "{field}"
            );
        }
        for bad_revision in [json!(-1), json!(1.5), json!(4294967296_u64), json!("1")] {
            let mut bad = valid.clone();
            bad["expectedRevision"] = bad_revision;
            assert!(serde_json::from_value::<SaveClosure>(bad).is_err());
        }
        let mut extra = valid;
        extra["createdAt"] = json!(0);
        assert!(serde_json::from_value::<SaveClosure>(extra).is_err());
        let db = fixture();
        let saved = save(&db, input()).unwrap();
        let value = serde_json::to_value(&saved).unwrap();
        assert_eq!(value.as_object().unwrap().len(), 9);
        for field in [
            "id",
            "spaceId",
            "objective",
            "progress",
            "nextAction",
            "blocker",
            "createdAt",
            "updatedAt",
            "revision",
        ] {
            assert!(value.get(field).is_some());
        }
        assert!(value["createdAt"].is_i64());
        assert!(value["updatedAt"].is_i64());
        assert!(value["revision"].is_u64());
        let page = serde_json::to_value(list(&db, SPACE, None, None).unwrap()).unwrap();
        assert_eq!(page, json!({"items": [value], "nextCursor": null}));
    }

    fn seed_closures(db: &Connection, count: u32) -> Vec<String> {
        let tx = db.unchecked_transaction().unwrap();
        let mut ids = Vec::new();
        for number in 1..=count {
            let id = Uuid::from_u128(number as u128).to_string();
            tx.execute(
                "INSERT INTO cierre VALUES (?1, ?2, '', 'Avance', '', '', 1000, 1000, 1)",
                params![id, SPACE],
            )
            .unwrap();
            ids.push(id);
        }
        tx.commit().unwrap();
        ids.reverse();
        ids
    }

    #[test]
    fn keyset_paging_ties_edit_order_and_deleting_last() {
        let db = fixture();
        let expected = seed_closures(&db, 55);
        let mut cursor = None;
        let mut actual = Vec::new();
        loop {
            let page = list(&db, SPACE, cursor.as_deref(), Some(7)).unwrap();
            actual.extend(page.items.into_iter().map(|item| item.id));
            cursor = page.next_cursor;
            if cursor.is_none() {
                break;
            }
        }
        assert_eq!(actual, expected);
        assert_eq!(list(&db, SPACE, None, None).unwrap().items.len(), 20);
        assert_eq!(list(&db, SPACE, None, Some(50)).unwrap().items.len(), 50);
        let oldest = expected.last().unwrap();
        let edited = save(
            &db,
            SaveClosure {
                id: oldest.clone(),
                progress: "Editado".into(),
                expected_revision: Some(1),
                ..input()
            },
        )
        .unwrap();
        assert_eq!(edited.created_at, 1000);
        assert!(edited.updated_at > 1000);
        let last = list(&db, SPACE, None, Some(1)).unwrap();
        assert_eq!(last.items[0].id, expected[0]);
        delete(&db, SPACE, &expected[0], 1).unwrap();
        assert_eq!(
            list(&db, SPACE, None, Some(1)).unwrap().items[0].id,
            expected[1]
        );
        let continued = list(&db, SPACE, last.next_cursor.as_deref(), Some(1)).unwrap();
        assert_eq!(continued.items[0].id, expected[1]);
        for id in &expected[1..54] {
            delete(&db, SPACE, id, 1).unwrap();
        }
        assert_eq!(list(&db, SPACE, None, Some(1)).unwrap().items, vec![edited]);
        delete(&db, SPACE, oldest, 2).unwrap();
        let empty = list(&db, SPACE, None, Some(1)).unwrap();
        assert!(empty.items.is_empty());
        assert!(empty.next_cursor.is_none());
    }

    #[test]
    fn cursors_are_strict_bounded_and_space_scoped() {
        let db = fixture();
        seed_closures(&db, 2);
        let raw = list(&db, SPACE, None, Some(1))
            .unwrap()
            .next_cursor
            .unwrap();
        assert!(raw.len() < 1024);
        assert_code(list(&db, OTHER, Some(&raw), None), "INVALID_ARGUMENT");
        for bad in [
            "",
            "null",
            "[]",
            "{}",
            "not-json",
            &(raw.clone() + " false"),
            &" ".repeat(1025),
        ] {
            assert_code(list(&db, SPACE, Some(bad), None), "INVALID_ARGUMENT");
        }
        for (field, value) in [
            ("version", json!(2)),
            ("spaceId", json!(OTHER)),
            ("createdAt", json!(-1)),
            ("createdAt", json!(MAX_TIMESTAMP + 1)),
            ("createdAt", json!(1.5)),
            ("id", json!("bad")),
            ("extra", json!(true)),
        ] {
            let mut bad: serde_json::Value = serde_json::from_str(&raw).unwrap();
            bad[field] = value;
            assert_code(
                list(&db, SPACE, Some(&bad.to_string()), None),
                "INVALID_ARGUMENT",
            );
        }
        let duplicate = raw.replacen('{', "{\"version\":1,", 1);
        assert_code(list(&db, SPACE, Some(&duplicate), None), "INVALID_ARGUMENT");
        for limit in [0, 51, u32::MAX] {
            assert_code(list(&db, SPACE, None, Some(limit)), "INVALID_ARGUMENT");
        }
    }

    #[test]
    fn capacity_rejects_without_purging_but_allows_retry_edit_and_other_space() {
        let db = fixture();
        seed_closures(&db, 999);
        let request = input();
        let saved = save(&db, request.clone()).unwrap();
        assert_eq!(save(&db, request.clone()).unwrap(), saved);
        assert_code(save(&db, input()), "CAPACITY_EXCEEDED");
        save(
            &db,
            SaveClosure {
                expected_revision: Some(1),
                progress: "Nuevo".into(),
                ..request
            },
        )
        .unwrap();
        save(
            &db,
            SaveClosure {
                space_id: OTHER.into(),
                ..input()
            },
        )
        .unwrap();
        assert_eq!(
            db.query_row(
                "SELECT COUNT(*) FROM cierre WHERE espacio_id = ?1",
                [SPACE],
                |r| r.get::<_, u32>(0)
            )
            .unwrap(),
            1000
        );
        delete(&db, SPACE, &saved.id, 2).unwrap();
        save(&db, input()).unwrap();
    }

    #[test]
    fn maximum_revision_cannot_wrap() {
        let db = fixture();
        let request = input();
        save(&db, request.clone()).unwrap();
        db.execute(
            "UPDATE cierre SET revision = ?1 WHERE espacio_id = ?2 AND id = ?3",
            params![u32::MAX, SPACE, request.id],
        )
        .unwrap();
        assert_code(
            save(
                &db,
                SaveClosure {
                    expected_revision: Some(u32::MAX),
                    ..request.clone()
                },
            ),
            "CONFLICT",
        );
        assert_eq!(get(&db, SPACE, &request.id).unwrap().revision, u32::MAX);
        delete(&db, SPACE, &request.id, u32::MAX).unwrap();
    }

    #[test]
    fn reopen_cascade_and_reader_outputs_exclude_private_sentinel() {
        let file = DiskDb::new();
        let request = SaveClosure {
            objective: SENTINEL.into(),
            progress: SENTINEL.into(),
            next_action: SENTINEL.into(),
            blocker: SENTINEL.into(),
            ..input()
        };
        let saved;
        let before;
        {
            let db = Connection::open(&file.0).unwrap();
            legacy(&db);
            let reader = paravel_context::Reader::open(&file.0, SPACE).unwrap();
            let outputs = || {
                vec![
                    reader.leer_espacio().unwrap(),
                    reader.listar_piezas(None, None).unwrap(),
                    reader.leer_contexto_pieza(PIECE).unwrap(),
                ]
            };
            before = outputs();
            crate::db::migrate(&db).unwrap();
            saved = save(&db, request.clone()).unwrap();
            assert_eq!(outputs(), before);
            assert!(!serde_json::to_string(&outputs())
                .unwrap()
                .contains(SENTINEL));
            assert!(reader.leer_contexto_pieza(&saved.id).is_err());
        }
        {
            let state = crate::db::open(file.0.clone()).unwrap();
            let db = state.db.lock().unwrap();
            assert_eq!(get(&db, SPACE, &saved.id).unwrap(), saved);
            assert_eq!(save(&db, request).unwrap(), saved);
            let reader = paravel_context::Reader::open(&file.0, SPACE).unwrap();
            assert_eq!(
                vec![
                    reader.leer_espacio().unwrap(),
                    reader.listar_piezas(None, None).unwrap(),
                    reader.leer_contexto_pieza(PIECE).unwrap()
                ],
                before
            );
            let other = save(
                &db,
                SaveClosure {
                    space_id: OTHER.into(),
                    ..input()
                },
            )
            .unwrap();
            db.execute("DELETE FROM espacio WHERE id = ?1", [SPACE])
                .unwrap();
            assert_code(get(&db, SPACE, &saved.id), "NOT_FOUND");
            assert_eq!(
                db.query_row(
                    "SELECT COUNT(*) FROM cierre WHERE espacio_id = ?1",
                    [SPACE],
                    |r| r.get::<_, u32>(0)
                )
                .unwrap(),
                0
            );
            assert_eq!(get(&db, OTHER, &other.id).unwrap(), other);
        }
    }

    #[test]
    fn unavailable_database_is_sanitized_and_timeout_is_local() {
        let file = DiskDb::new();
        let db = Connection::open(&file.0).unwrap();
        legacy(&db);
        crate::db::migrate(&db).unwrap();
        let saved = save(&db, input()).unwrap();
        let readonly =
            Connection::open_with_flags(&file.0, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
        assert_eq!(
            save(
                &readonly,
                SaveClosure {
                    progress: SENTINEL.into(),
                    ..input()
                }
            )
            .unwrap_err(),
            UNAVAILABLE
        );
        assert_eq!(
            delete(&readonly, SPACE, &saved.id, 1).unwrap_err(),
            UNAVAILABLE
        );
        db.busy_timeout(Duration::from_millis(73)).unwrap();
        let lock = Connection::open(&file.0).unwrap();
        let tx = Transaction::new_unchecked(&lock, TransactionBehavior::Exclusive).unwrap();
        let start = Instant::now();
        assert_eq!(save(&db, input()).unwrap_err(), UNAVAILABLE);
        assert!(start.elapsed() < Duration::from_secs(5));
        assert_eq!(
            db.query_row("PRAGMA busy_timeout", [], |r| r.get::<_, u32>(0))
                .unwrap(),
            73
        );
        assert_eq!(get(&db, SPACE, &saved.id).unwrap_err(), UNAVAILABLE);
        assert_eq!(list(&db, SPACE, None, None).unwrap_err(), UNAVAILABLE);
        assert_eq!(delete(&db, SPACE, &saved.id, 1).unwrap_err(), UNAVAILABLE);
        tx.rollback().unwrap();
        save(&db, input()).unwrap();
        let broken = Connection::open_in_memory().unwrap();
        assert_eq!(get(&broken, SPACE, &saved.id).unwrap_err(), UNAVAILABLE);
    }

    #[test]
    fn concurrent_creates_are_idempotent_and_edits_use_cas() {
        let file = DiskDb::new();
        let db = Connection::open(&file.0).unwrap();
        legacy(&db);
        crate::db::migrate(&db).unwrap();
        let request = input();
        let race = |request: SaveClosure| {
            let barrier = Arc::new(Barrier::new(2));
            let handles: Vec<_> = (0..2)
                .map(|_| {
                    let barrier = barrier.clone();
                    let path = file.0.clone();
                    let request = request.clone();
                    std::thread::spawn(move || {
                        let db = Connection::open(path).unwrap();
                        barrier.wait();
                        save(&db, request)
                    })
                })
                .collect();
            handles
                .into_iter()
                .map(|handle| handle.join().unwrap())
                .collect::<Vec<_>>()
        };
        let created = race(request.clone());
        assert_eq!(created[0], created[1]);
        assert!(created[0].is_ok());
        let edits = race(SaveClosure {
            expected_revision: Some(1),
            progress: "Editado".into(),
            ..request.clone()
        });
        assert_eq!(edits.iter().filter(|result| result.is_ok()).count(), 1);
        assert!(edits.iter().any(|result| result
            .as_ref()
            .is_err_and(|error| error.starts_with("CONFLICT:"))));
        assert_eq!(get(&db, SPACE, &request.id).unwrap().revision, 2);
    }
}
