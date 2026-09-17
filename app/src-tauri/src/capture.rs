use crate::db::AppState;
use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    path::Path,
};
use uuid::Uuid;

const MAX_ITEMS: usize = 50;
const MAX_BYTES: usize = 256 * 1024;
const MAX_REFERENCE: usize = 32 * 1024;
const MAX_ROWS: usize = 10_000;
const MAX_STORED_BYTES: usize = 8 * 1024 * 1024;
const MAX_OPERATIONS: i64 = 1000;
const INVALID: &str = "INVALID_ARGUMENT: Los argumentos de captura no son válidos.";
const UNAVAILABLE: &str = "DATABASE_UNAVAILABLE: La captura no está disponible. Intente de nuevo.";
const NOT_FOUND: &str = "NOT_FOUND: El espacio no existe.";
const CONFLICT: &str =
    "CONFLICT: El identificador de operación ya está en uso con otros argumentos.";
const CAPACITY: &str = "CAPACITY_EXCEEDED: El espacio contiene 1000 operaciones de captura; no se eliminan recibos automáticamente.";
const TOO_LARGE: &str = "CAPACITY_EXCEEDED: La captura supera el límite de procesamiento.";

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Firefox,
    File,
    Folder,
    Vscode,
    Cursor,
}

impl Kind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Firefox => "firefox",
            Self::File => "file",
            Self::Folder => "folder",
            Self::Vscode => "vscode",
            Self::Cursor => "cursor",
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Candidate {
    pub item_id: String,
    pub kind: Kind,
    pub reference: String,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreviewInput {
    pub space_id: String,
    pub items: Vec<Candidate>,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DuplicatePolicy {
    Skip,
    Allow,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommitCandidate {
    pub item_id: String,
    pub kind: Kind,
    pub reference: String,
    pub name: String,
    pub duplicate_policy: DuplicatePolicy,
}

impl CommitCandidate {
    fn candidate(&self) -> Candidate {
        Candidate {
            item_id: self.item_id.clone(),
            kind: self.kind,
            reference: self.reference.clone(),
            name: self.name.clone(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommitInput {
    pub operation_id: String,
    pub space_id: String,
    pub items: Vec<CommitCandidate>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct CaptureError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewItem {
    pub item_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub normalized_name: Option<String>,
    pub duplicate_piece_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<CaptureError>,
}

#[derive(Debug, Serialize)]
pub struct PreviewResult {
    pub items: Vec<PreviewItem>,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommitItem {
    pub item_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub piece_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<CaptureError>,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommitResult {
    pub operation_id: String,
    pub items: Vec<CommitItem>,
}

#[derive(Debug, Serialize)]
pub struct PreparedPaths {
    pub items: Vec<Candidate>,
}

fn db_error(_: rusqlite::Error) -> String {
    UNAVAILABLE.into()
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
        return Err(INVALID.into());
    }
    Uuid::parse_str(raw)
        .map(|id| id.to_string())
        .map_err(|_| INVALID.into())
}

struct BoundedBytes(Vec<u8>);

impl std::io::Write for BoundedBytes {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        if bytes.len() > MAX_BYTES.saturating_sub(self.0.len()) {
            return Err(std::io::Error::other("capture size limit"));
        }
        self.0.extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

fn serialized(value: &impl Serialize) -> Result<Vec<u8>, String> {
    let mut output = BoundedBytes(Vec::new());
    serde_json::to_writer(&mut output, value).map_err(|_| TOO_LARGE.to_string())?;
    Ok(output.0)
}

fn validate_envelope<'a>(count: usize, ids: impl Iterator<Item = &'a str>) -> Result<(), String> {
    if !(1..=MAX_ITEMS).contains(&count) {
        return Err(INVALID.into());
    }
    let mut seen = HashSet::new();
    for id in ids {
        if !seen.insert(uuid(id)?) {
            return Err(INVALID.into());
        }
    }
    Ok(())
}

fn item_error(code: &str, message: &str) -> CaptureError {
    CaptureError {
        code: code.into(),
        message: message.into(),
    }
}

#[derive(Debug)]
struct Validated {
    name: String,
    payload: Value,
    key: (String, String),
}

fn validate(item: &Candidate) -> Result<Validated, CaptureError> {
    let name = item.name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(item_error(
            "INVALID_NAME",
            "El nombre necesita entre 1 y 80 caracteres.",
        ));
    }
    if item.reference.len() > MAX_REFERENCE || item.reference.trim().is_empty() {
        return Err(item_error(
            "INVALID_REFERENCE",
            "La referencia está vacía o supera 32768 bytes UTF-8.",
        ));
    }
    let reference = item.reference.trim();
    let raw = if item.kind == Kind::Firefox {
        json!({"urls": [reference]})
    } else {
        json!({"path": reference})
    };
    let payload = crate::validate_piece_payload(item.kind.as_str(), raw).map_err(|_| {
        item_error(
            "INVALID_REFERENCE",
            "La referencia no existe o no está permitida para este tipo.",
        )
    })?;
    let normalized = if item.kind == Kind::Firefox {
        payload["urls"][0].as_str()
    } else {
        payload["path"].as_str()
    }
    .ok_or_else(|| item_error("INVALID_REFERENCE", "La referencia no es válida."))?;
    Ok(Validated {
        name: name.into(),
        key: (item.kind.as_str().into(), normalized.into()),
        payload,
    })
}

fn ensure_space(db: &Connection, space: &str) -> Result<(), String> {
    let exists: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM espacio WHERE id = ?1)",
            [space],
            |r| r.get(0),
        )
        .map_err(db_error)?;
    if exists {
        Ok(())
    } else {
        Err(NOT_FOUND.into())
    }
}

type Duplicates = HashMap<(String, String), Vec<String>>;

fn duplicates(
    db: &Connection,
    space: &str,
    wanted: &HashSet<(String, String)>,
) -> Result<Duplicates, String> {
    let mut found = Duplicates::new();
    if wanted.is_empty() {
        return Ok(found);
    }
    let mut stmt = db.prepare(
        "SELECT CASE WHEN length(CAST(id AS BLOB)) = 36 THEN id END,
                kind, length(CAST(payload AS BLOB)),
                CASE WHEN length(CAST(payload AS BLOB)) <= ?2 THEN payload END
         FROM pieza WHERE espacio_id = ?1 AND kind IN ('firefox', 'firefox-group', 'file', 'folder', 'vscode', 'cursor')
         ORDER BY id LIMIT ?3"
    ).map_err(db_error)?;
    let mut rows = stmt
        .query(params![space, MAX_BYTES as i64, (MAX_ROWS + 1) as i64])
        .map_err(db_error)?;
    let mut count = 0;
    let mut bytes = 0usize;
    while let Some(row) = rows.next().map_err(db_error)? {
        count += 1;
        let size: usize = row.get(2).map_err(db_error)?;
        bytes = bytes.saturating_add(size);
        if count > MAX_ROWS || size > MAX_BYTES || bytes > MAX_STORED_BYTES {
            return Err(TOO_LARGE.into());
        }
        let id: Option<String> = row.get(0).map_err(db_error)?;
        let id = id
            .filter(|value| uuid(value).is_ok())
            .ok_or_else(|| UNAVAILABLE.to_string())?;
        let kind: String = row.get(1).map_err(db_error)?;
        let raw: String = row.get(3).map_err(db_error)?;
        let Ok(payload) = serde_json::from_str::<Value>(&raw) else {
            continue;
        };
        let mut keys = HashSet::new();
        if matches!(kind.as_str(), "firefox" | "firefox-group") {
            if let Some(urls) = payload["urls"].as_array() {
                for raw in urls.iter().filter_map(Value::as_str) {
                    if let Ok(url) = url::Url::parse(raw) {
                        if matches!(url.scheme(), "http" | "https") {
                            keys.insert(("firefox".into(), url.to_string()));
                        }
                    }
                }
            }
        } else if let Some(raw) = payload["path"].as_str() {
            let canonical = std::fs::canonicalize(raw).ok();
            let path = canonical
                .as_deref()
                .map(dunce::simplified)
                .unwrap_or_else(|| Path::new(raw));
            keys.insert((kind, path.to_string_lossy().into_owned()));
        }
        for key in keys {
            if wanted.contains(&key) {
                found.entry(key).or_default().push(id.clone());
            }
        }
    }
    Ok(found)
}

pub(crate) fn migrate(db: &Connection) -> Result<(), String> {
    let tx = Transaction::new_unchecked(db, TransactionBehavior::Immediate).map_err(db_error)?;
    tx.execute_batch(
        "CREATE TABLE IF NOT EXISTS captura_operacion (
            operation_id TEXT PRIMARY KEY NOT NULL CHECK(length(operation_id) = 36),
            espacio_id TEXT NOT NULL REFERENCES espacio(id) ON DELETE CASCADE,
            fingerprint BLOB NOT NULL CHECK(length(fingerprint) = 32),
            result TEXT NOT NULL CHECK(length(CAST(result AS BLOB)) <= 262144)
         );
         CREATE INDEX IF NOT EXISTS idx_captura_operacion_espacio ON captura_operacion(espacio_id);"
    ).map_err(db_error)?;
    tx.commit().map_err(db_error)
}

pub(crate) fn preview(db: &Connection, input: PreviewInput) -> Result<PreviewResult, String> {
    validate_envelope(
        input.items.len(),
        input.items.iter().map(|item| item.item_id.as_str()),
    )?;
    let space = uuid(&input.space_id)?;
    serialized(&input)?;
    let tx = db.unchecked_transaction().map_err(db_error)?;
    ensure_space(&tx, &space)?;
    let validated: Vec<_> = input.items.iter().map(validate).collect();
    let wanted = validated
        .iter()
        .filter_map(|item| item.as_ref().ok().map(|item| item.key.clone()))
        .collect();
    let existing = duplicates(&tx, &space, &wanted)?;
    let mut seen = HashSet::new();
    let items = input
        .items
        .into_iter()
        .zip(validated)
        .map(|(item, valid)| match valid {
            Err(error) => PreviewItem {
                item_id: item.item_id,
                status: "invalid".into(),
                normalized_name: None,
                duplicate_piece_ids: vec![],
                error: Some(error),
            },
            Ok(valid) => {
                let ids = existing.get(&valid.key).cloned().unwrap_or_default();
                let duplicate = !seen.insert(valid.key) || !ids.is_empty();
                PreviewItem {
                    item_id: item.item_id,
                    status: if duplicate { "duplicate" } else { "ready" }.into(),
                    normalized_name: Some(valid.name),
                    duplicate_piece_ids: ids,
                    error: None,
                }
            }
        })
        .collect();
    let result = PreviewResult { items };
    serialized(&result)?;
    Ok(result)
}

pub(crate) fn commit(db: &Connection, input: CommitInput) -> Result<CommitResult, String> {
    validate_envelope(
        input.items.len(),
        input.items.iter().map(|item| item.item_id.as_str()),
    )?;
    let operation = uuid(&input.operation_id)?;
    let space = uuid(&input.space_id)?;
    let fingerprint = Sha256::digest(serialized(&input)?).to_vec();
    let tx = Transaction::new_unchecked(db, TransactionBehavior::Immediate).map_err(db_error)?;
    ensure_space(&tx, &space)?;
    let saved: Option<(Vec<u8>, Option<String>)> = tx
        .query_row(
            "SELECT fingerprint, CASE WHEN length(CAST(result AS BLOB)) <= ?3 THEN result END
         FROM captura_operacion WHERE operation_id = ?1 AND espacio_id = ?2",
            params![operation, space, MAX_BYTES as i64],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(db_error)?;
    if let Some((previous, result)) = saved {
        if previous != fingerprint {
            return Err(CONFLICT.into());
        }
        let result = result.ok_or_else(|| UNAVAILABLE.to_string())?;
        return serde_json::from_str(&result).map_err(|_| UNAVAILABLE.into());
    }
    tx.execute(
        "INSERT INTO captura_operacion (operation_id, espacio_id, fingerprint, result) VALUES (?1, ?2, ?3, '{}')",
        params![operation, space, fingerprint]
    ).map_err(|error| {
        if matches!(&error, rusqlite::Error::SqliteFailure(code, _) if code.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_PRIMARYKEY) {
            CONFLICT.to_string()
        } else {
            db_error(error)
        }
    })?;
    let count: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM (SELECT 1 FROM captura_operacion WHERE espacio_id = ?1 LIMIT ?2)",
            params![space, MAX_OPERATIONS + 1],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    if count > MAX_OPERATIONS {
        return Err(CAPACITY.into());
    }
    let validated: Vec<_> = input
        .items
        .iter()
        .map(|item| validate(&item.candidate()))
        .collect();
    let wanted = validated
        .iter()
        .filter_map(|item| item.as_ref().ok().map(|item| item.key.clone()))
        .collect();
    let mut existing = duplicates(&tx, &space, &wanted)?;
    let last_order: i64 = tx
        .query_row(
            "SELECT COALESCE(MAX(orden), -1) FROM pieza WHERE espacio_id = ?1",
            [&space],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    let mut order = last_order
        .checked_add(1)
        .ok_or_else(|| TOO_LARGE.to_string())?;
    let timestamp = crate::chrono_like_timestamp();
    let mut items = Vec::with_capacity(input.items.len());
    for (item, valid) in input.items.into_iter().zip(validated) {
        let valid = match valid {
            Ok(valid) => valid,
            Err(error) => {
                items.push(CommitItem {
                    item_id: item.item_id,
                    status: "rejected".into(),
                    piece_id: None,
                    error: Some(error),
                });
                continue;
            }
        };
        if item.duplicate_policy == DuplicatePolicy::Skip && existing.contains_key(&valid.key) {
            items.push(CommitItem {
                item_id: item.item_id,
                status: "skipped_duplicate".into(),
                piece_id: None,
                error: None,
            });
            continue;
        }
        let id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO pieza (id, espacio_id, kind, nombre, payload, marcada, orden, creado_en, editado_en)
             VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, ?7)",
            params![id, space, item.kind.as_str(), valid.name, valid.payload.to_string(), order, timestamp]
        ).map_err(db_error)?;
        existing.entry(valid.key).or_default().push(id.clone());
        order = order.checked_add(1).ok_or_else(|| TOO_LARGE.to_string())?;
        items.push(CommitItem {
            item_id: item.item_id,
            status: "created".into(),
            piece_id: Some(id),
            error: None,
        });
    }
    let result = CommitResult {
        operation_id: input.operation_id,
        items,
    };
    let receipt = String::from_utf8(serialized(&result)?).map_err(|_| UNAVAILABLE.to_string())?;
    tx.execute(
        "UPDATE captura_operacion SET result = ?3 WHERE operation_id = ?1 AND espacio_id = ?2",
        params![operation, space, receipt],
    )
    .map_err(db_error)?;
    tx.commit().map_err(db_error)?;
    Ok(result)
}

#[tauri::command]
pub fn preview_capture(
    input: PreviewInput,
    state: tauri::State<'_, AppState>,
) -> Result<PreviewResult, String> {
    let db = state.db.lock().map_err(|_| UNAVAILABLE.to_string())?;
    preview(&db, input)
}

#[tauri::command]
pub fn commit_capture(
    input: CommitInput,
    state: tauri::State<'_, AppState>,
) -> Result<CommitResult, String> {
    let db = state.db.lock().map_err(|_| UNAVAILABLE.to_string())?;
    commit(&db, input)
}

#[tauri::command]
pub fn prepare_capture_paths(paths: Vec<String>) -> Result<PreparedPaths, String> {
    if paths.is_empty() || paths.len() > MAX_ITEMS {
        return Err(INVALID.into());
    }
    serialized(&json!({"paths": &paths}))?;
    let items = paths
        .into_iter()
        .map(|reference| {
            let path = Path::new(&reference);
            let kind = if reference.len() <= MAX_REFERENCE && path.is_absolute() && path.is_dir() {
                Kind::Folder
            } else {
                Kind::File
            };
            let name: String = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("Captura")
                .trim()
                .chars()
                .take(80)
                .collect();
            Candidate {
                item_id: Uuid::new_v4().to_string(),
                kind,
                reference,
                name: if name.is_empty() {
                    "Captura".into()
                } else {
                    name
                },
            }
        })
        .collect();
    let result = PreparedPaths { items };
    serialized(&result)?;
    Ok(result)
}

#[tauri::command]
pub async fn pick_capture_files() -> Vec<String> {
    rfd::AsyncFileDialog::new()
        .pick_files()
        .await
        .unwrap_or_default()
        .into_iter()
        .take(MAX_ITEMS)
        .map(|handle| handle.path().to_string_lossy().into_owned())
        .collect()
}

#[tauri::command]
pub async fn pick_capture_folders() -> Vec<String> {
    rfd::AsyncFileDialog::new()
        .pick_folders()
        .await
        .unwrap_or_default()
        .into_iter()
        .take(MAX_ITEMS)
        .map(|handle| handle.path().to_string_lossy().into_owned())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::PathBuf,
        sync::{Arc, Barrier},
        time::Duration,
    };

    const SPACE: &str = "11111111-1111-4111-8111-111111111111";
    const OTHER: &str = "22222222-2222-4222-8222-222222222222";

    struct Directory(PathBuf);

    impl Directory {
        fn new() -> Self {
            let path = std::env::temp_dir()
                .join("launch-host-test")
                .join(Uuid::new_v4().to_string());
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for Directory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn initialize(db: &Connection) {
        crate::db::migrate(db).unwrap();
        db.execute(
            "INSERT INTO grupo VALUES ('g', 'Group', 'folder', 0, '1', '1')",
            [],
        )
        .unwrap();
        for space in [SPACE, OTHER] {
            db.execute(
                "INSERT INTO espacio VALUES (?1, 'g', 'Space', 'private note', 1, '1', '1')",
                [space],
            )
            .unwrap();
        }
    }

    fn database() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        initialize(&db);
        db
    }

    fn candidate(reference: &str) -> Candidate {
        Candidate {
            item_id: Uuid::new_v4().to_string(),
            kind: Kind::Firefox,
            reference: reference.into(),
            name: "  Captura  ".into(),
        }
    }

    fn input(items: Vec<Candidate>) -> CommitInput {
        CommitInput {
            operation_id: Uuid::new_v4().to_string(),
            space_id: SPACE.into(),
            items: items
                .into_iter()
                .map(|item| CommitCandidate {
                    item_id: item.item_id,
                    kind: item.kind,
                    reference: item.reference,
                    name: item.name,
                    duplicate_policy: DuplicatePolicy::Skip,
                })
                .collect(),
        }
    }

    fn preview_input(items: Vec<Candidate>) -> PreviewInput {
        PreviewInput {
            space_id: SPACE.into(),
            items,
        }
    }

    fn piece(db: &Connection, space: &str, kind: &str, payload: Value) -> String {
        let id = Uuid::new_v4().to_string();
        db.execute(
            "INSERT INTO pieza VALUES (?1, ?2, ?3, 'Legacy', ?4, 1, 0, '1', '1')",
            params![id, space, kind, payload.to_string()],
        )
        .unwrap();
        id
    }

    fn count(db: &Connection, table: &str) -> i64 {
        db.query_row(
            &format!("SELECT COUNT(*) FROM {table} WHERE espacio_id = ?1"),
            [SPACE],
            |r| r.get(0),
        )
        .unwrap()
    }

    #[test]
    fn strict_wire_shape_uuid_and_unknown_fields() {
        let item = candidate("https://example.com");
        let raw = serde_json::to_value(&item).unwrap();
        assert!(raw.get("itemId").is_some());
        for field in ["payload", "marked", "duplicatePolicy"] {
            let mut invalid = raw.clone();
            invalid[field] = json!(true);
            assert!(serde_json::from_value::<Candidate>(invalid).is_err());
        }
        let mut invalid = raw;
        invalid["kind"] = json!("firefox-group");
        assert!(serde_json::from_value::<Candidate>(invalid).is_err());
        let commit = input(vec![item.clone()]);
        let mut value = serde_json::to_value(&commit).unwrap();
        value["items"][0]["payload"] = json!({});
        assert!(serde_json::from_value::<CommitInput>(value).is_err());
        let mut value = serde_json::to_value(&commit).unwrap();
        value["unexpected"] = json!(1);
        assert!(serde_json::from_value::<CommitInput>(value).is_err());
        let mut value = serde_json::to_value(preview_input(vec![item])).unwrap();
        value["unexpected"] = json!(1);
        assert!(serde_json::from_value::<PreviewInput>(value).is_err());
        for id in [
            "",
            "../private",
            "11111111111141118111111111111111",
            "urn:uuid:11111111-1111-4111-8111-111111111111",
        ] {
            assert_eq!(uuid(id).unwrap_err(), INVALID);
        }
        assert!(uuid(SPACE).is_ok());
        let db = database();
        let mut invalid = commit.clone();
        invalid.operation_id = "invalid".into();
        assert_eq!(commit_result_error(&db, invalid), INVALID);
        let mut invalid = commit.clone();
        invalid.items[0].item_id = "invalid".into();
        assert_eq!(commit_result_error(&db, invalid), INVALID);
        let mut invalid = commit;
        invalid.items.push(invalid.items[0].clone());
        assert_eq!(commit_result_error(&db, invalid), INVALID);
        assert_eq!(count(&db, "captura_operacion"), 0);
    }

    fn commit_result_error(db: &Connection, input: CommitInput) -> String {
        commit(db, input).unwrap_err()
    }

    #[test]
    fn preview_is_read_only_and_batch_duplicates_have_no_fabricated_piece_ids() {
        let db = database();
        db.execute_batch("PRAGMA query_only = ON").unwrap();
        let result = preview(
            &db,
            preview_input(vec![
                candidate("HTTPS://EXAMPLE.COM:443"),
                candidate("https://example.com/"),
                candidate("javascript:private"),
            ]),
        )
        .unwrap();
        assert_eq!(
            result
                .items
                .iter()
                .map(|item| item.status.as_str())
                .collect::<Vec<_>>(),
            ["ready", "duplicate", "invalid"]
        );
        assert_eq!(result.items[0].normalized_name.as_deref(), Some("Captura"));
        assert!(result.items[1].duplicate_piece_ids.is_empty());
        assert_eq!(count(&db, "pieza"), 0);
        assert_eq!(count(&db, "captura_operacion"), 0);
        let wire = serde_json::to_value(result).unwrap();
        assert!(wire["items"][0].get("error").is_none());
        assert!(wire["items"][2].get("normalizedName").is_none());
    }

    #[test]
    fn normalized_urls_include_group_arrays_and_preserve_query_fragment_scope() {
        let db = database();
        let local = piece(
            &db,
            SPACE,
            "firefox-group",
            json!({"urls": ["https://EXAMPLE.com:443/a?x=1#f", "https://example.com/a?x=1#f"]}),
        );
        let foreign = piece(
            &db,
            OTHER,
            "firefox",
            json!({"urls": ["https://foreign.example/"]}),
        );
        let result = preview(
            &db,
            preview_input(vec![
                candidate("https://example.com/a?x=1#f"),
                candidate("https://example.com/a?x=2#f"),
                candidate("https://example.com/a?x=1#g"),
                candidate("https://foreign.example"),
            ]),
        )
        .unwrap();
        assert_eq!(result.items[0].duplicate_piece_ids, [local]);
        assert!(result.items[1..].iter().all(|item| item.status == "ready"));
        assert!(!serde_json::to_string(&result).unwrap().contains(&foreign));
        let result = commit(
            &db,
            input(vec![
                candidate("https://example.com/a?x=1#f"),
                candidate("https://example.com/a?x=2#f"),
            ]),
        )
        .unwrap();
        assert_eq!(result.items[0].status, "skipped_duplicate");
        assert_eq!(result.items[1].status, "created");
    }

    #[test]
    fn mixed_errors_allow_and_skip_preserve_existing_state() {
        let db = database();
        let old = piece(
            &db,
            SPACE,
            "firefox",
            json!({"urls": ["https://old.example/"]}),
        );
        db.execute(
            "INSERT INTO pack_pieza VALUES (?1, ?2)",
            params![SPACE, old],
        )
        .unwrap();
        db.execute(
            "INSERT INTO cierre VALUES ('c', ?1, 'objective', 'progress', 'next', '', 1, 1, 1)",
            [SPACE],
        )
        .unwrap();
        let mut request = input(vec![
            candidate("https://new.example/?secret=value#fragment"),
            candidate("https://new.example/?secret=value#fragment"),
            candidate("https://new.example/?secret=value#fragment"),
            candidate("file:///C:/secret.txt"),
        ]);
        request.items[2].duplicate_policy = DuplicatePolicy::Allow;
        let result = commit(&db, request).unwrap();
        assert_eq!(
            result
                .items
                .iter()
                .map(|item| item.status.as_str())
                .collect::<Vec<_>>(),
            ["created", "skipped_duplicate", "created", "rejected"]
        );
        assert!(result.items[1].piece_id.is_none());
        assert!(!serde_json::to_string(&result).unwrap().contains("secret"));
        let pieces = paravel_context::ui::list_pieces(&db, SPACE).unwrap();
        assert_eq!(pieces.iter().filter(|piece| piece.marked).count(), 1);
        assert!(pieces
            .iter()
            .filter(|piece| piece.id != old)
            .all(|piece| piece.name == "Captura" && !piece.marked));
        assert_eq!(paravel_context::ui::get_invite(&db, SPACE).unwrap(), [old]);
        let state: (String, i64, String) = db
            .query_row(
                "SELECT nota, bot_activo, editado_en FROM espacio WHERE id = ?1",
                [SPACE],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(state, ("private note".into(), 1, "1".into()));
        crate::db::migrate(&db).unwrap();
        assert_eq!(count(&db, "cierre"), 1);
        assert_eq!(count(&db, "captura_operacion"), 1);
    }

    #[test]
    fn paths_classify_without_contents_canonicalize_and_keep_kind() {
        let dir = Directory::new();
        let file = dir.0.join("private.txt");
        fs::write(&file, "DO NOT EXPOSE CONTENT").unwrap();
        let paths = vec![
            file.to_string_lossy().into_owned(),
            dir.0.to_string_lossy().into_owned(),
            dir.0.join("missing").to_string_lossy().into_owned(),
        ];
        let prepared = prepare_capture_paths(paths.clone()).unwrap();
        assert_eq!(
            prepared
                .items
                .iter()
                .map(|item| item.kind)
                .collect::<Vec<_>>(),
            [Kind::File, Kind::Folder, Kind::File]
        );
        let again = prepare_capture_paths(paths).unwrap();
        assert!(prepared
            .items
            .iter()
            .zip(&again.items)
            .all(|(a, b)| a.item_id != b.item_id));
        let db = database();
        let mut items = prepared.items;
        let mut alias = items[0].clone();
        alias.item_id = Uuid::new_v4().to_string();
        alias.reference = dir
            .0
            .join(".")
            .join("private.txt")
            .to_string_lossy()
            .into_owned();
        items.push(alias);
        for kind in [Kind::Vscode, Kind::Cursor] {
            let mut item = items[1].clone();
            item.item_id = Uuid::new_v4().to_string();
            item.kind = kind;
            items.push(item);
        }
        let result = commit(&db, input(items)).unwrap();
        assert_eq!(
            result
                .items
                .iter()
                .map(|item| item.status.as_str())
                .collect::<Vec<_>>(),
            [
                "created",
                "created",
                "rejected",
                "skipped_duplicate",
                "created",
                "created"
            ]
        );
        let payloads = paravel_context::ui::list_pieces(&db, SPACE).unwrap();
        assert!(payloads
            .iter()
            .all(|item| !item.payload.to_string().contains("DO NOT EXPOSE")));
        let result = preview(&db, preview_input(again.items)).unwrap();
        assert_eq!(result.items[0].status, "duplicate");
        assert_eq!(result.items[1].duplicate_piece_ids.len(), 1);
    }

    #[test]
    fn rejects_roots_scripts_missing_paths_and_invalid_names_per_item() {
        let dir = Directory::new();
        let mut items = Vec::new();
        for extension in ["ps1", "cmd", "bat", "exe", "lnk"] {
            let path = dir.0.join(format!("private.{extension}"));
            fs::write(&path, "private fixture").unwrap();
            let mut item = candidate(&path.to_string_lossy());
            item.kind = Kind::File;
            items.push(item);
        }
        for reference in [
            "relative.txt".to_string(),
            dir.0.join("missing").to_string_lossy().into_owned(),
        ] {
            let mut item = candidate(&reference);
            item.kind = Kind::File;
            items.push(item);
        }
        #[cfg(windows)]
        {
            let mut item = candidate("C:\\Windows");
            item.kind = Kind::Folder;
            items.push(item);
        }
        let mut empty = candidate("https://example.com");
        empty.name = " \u{2003} ".into();
        items.push(empty);
        let mut long = candidate("https://example.com");
        long.name = "é".repeat(81);
        items.push(long);
        let result = commit(&database(), input(items)).unwrap();
        assert!(result.items.iter().all(|item| item.status == "rejected"));
        let raw = serde_json::to_string(&result).unwrap();
        assert!(!raw.contains("private"));
        assert!(!raw.contains("Windows"));
        let mut unicode = candidate("https://example.com");
        unicode.name = format!(" \u{2003}{} ", "é".repeat(80));
        assert_eq!(validate(&unicode).unwrap().name.chars().count(), 80);
    }

    #[test]
    fn byte_and_count_limits_are_enforced_before_writes() {
        let db = database();
        assert_eq!(commit_result_error(&db, input(vec![])), INVALID);
        assert_eq!(
            commit_result_error(
                &db,
                input((0..51).map(|_| candidate("https://example.com")).collect())
            ),
            INVALID
        );
        assert!(prepare_capture_paths(vec![]).is_err());
        assert!(prepare_capture_paths(vec!["missing".into(); 51]).is_err());
        let mut item = candidate("https://example.com");
        item.reference = format!("https://example.com/{}", "é".repeat(MAX_REFERENCE / 2));
        assert_eq!(
            commit(&db, input(vec![item.clone()])).unwrap().items[0].status,
            "rejected"
        );
        item.reference = format!("https://example.com/{}", "x".repeat(MAX_REFERENCE - 20));
        let mut many = Vec::new();
        for _ in 0..10 {
            let mut next = item.clone();
            next.item_id = Uuid::new_v4().to_string();
            many.push(next);
        }
        assert_eq!(commit_result_error(&db, input(many)), TOO_LARGE);
        let mut escaped = candidate("https://example.com");
        escaped.name = "\u{0000}".repeat(MAX_BYTES / 5);
        assert_eq!(commit_result_error(&db, input(vec![escaped])), TOO_LARGE);
        assert_eq!(count(&db, "pieza"), 0);
        assert_eq!(count(&db, "captura_operacion"), 1);
    }

    #[test]
    fn durable_retry_after_restart_and_deleted_path_never_resurrects_piece() {
        let dir = Directory::new();
        let path = dir.0.join("receipt.sqlite3");
        let file = dir.0.join("private.txt");
        fs::write(&file, "private contents").unwrap();
        let db = Connection::open(&path).unwrap();
        initialize(&db);
        let items = prepare_capture_paths(vec![file.to_string_lossy().into_owned()])
            .unwrap()
            .items;
        let request = input(items);
        let response = commit(&db, request.clone()).unwrap();
        let id = response.items[0].piece_id.as_ref().unwrap();
        db.execute(
            "DELETE FROM pieza WHERE id = ?1 AND espacio_id = ?2",
            params![id, SPACE],
        )
        .unwrap();
        fs::remove_file(file).unwrap();
        drop(db);
        let db = Connection::open(&path).unwrap();
        crate::db::migrate(&db).unwrap();
        assert_eq!(commit(&db, request.clone()).unwrap(), response);
        assert_eq!(count(&db, "pieza"), 0);
        for field in ["name", "reference", "duplicatePolicy", "itemId", "kind"] {
            let mut value = serde_json::to_value(&request).unwrap();
            value["items"][0][field] = match field {
                "duplicatePolicy" => json!("allow"),
                "kind" => json!("folder"),
                "itemId" => json!(Uuid::new_v4().to_string()),
                _ => json!("changed"),
            };
            assert_eq!(
                commit_result_error(&db, serde_json::from_value(value).unwrap()),
                CONFLICT
            );
        }
        let mut foreign = request.clone();
        foreign.space_id = OTHER.into();
        assert_eq!(commit_result_error(&db, foreign), CONFLICT);
        assert_eq!(count(&db, "captura_operacion"), 1);
        db.execute("DELETE FROM espacio WHERE id = ?1", [SPACE])
            .unwrap();
        assert_eq!(count(&db, "captura_operacion"), 0);
        assert_eq!(commit_result_error(&db, request), NOT_FOUND);
    }

    #[test]
    fn receipt_and_second_insert_failures_roll_back_everything() {
        for trigger in [
            "CREATE TRIGGER fail_capture BEFORE UPDATE ON captura_operacion BEGIN SELECT RAISE(ABORT, 'private database path'); END;",
            "CREATE TRIGGER fail_piece BEFORE INSERT ON pieza WHEN NEW.orden = 1 BEGIN SELECT RAISE(ABORT, 'private payload'); END;",
        ] {
            let db = database();
            db.execute_batch(trigger).unwrap();
            let request = input(vec![candidate("https://a.example"), candidate("https://b.example")]);
            assert_eq!(commit_result_error(&db, request.clone()), UNAVAILABLE);
            assert_eq!(count(&db, "pieza"), 0);
            assert_eq!(count(&db, "captura_operacion"), 0);
            db.execute_batch("DROP TRIGGER IF EXISTS fail_capture; DROP TRIGGER IF EXISTS fail_piece;").unwrap();
            assert!(commit(&db, request).unwrap().items.iter().all(|item| item.status == "created"));
        }
    }

    #[test]
    fn capacity_retains_receipts_and_allows_saved_retry() {
        let db = database();
        let request = input(vec![candidate("https://example.com")]);
        let result = commit(&db, request.clone()).unwrap();
        for _ in 1..MAX_OPERATIONS {
            db.execute(
                "INSERT INTO captura_operacion VALUES (?1, ?2, zeroblob(32), '{}')",
                params![Uuid::new_v4().to_string(), SPACE],
            )
            .unwrap();
        }
        assert_eq!(commit(&db, request).unwrap(), result);
        assert_eq!(
            commit_result_error(&db, input(vec![candidate("https://new.example")])),
            CAPACITY
        );
        assert_eq!(count(&db, "captura_operacion"), MAX_OPERATIONS);
        let mut other = input(vec![candidate("https://new.example")]);
        other.space_id = OTHER.into();
        assert_eq!(commit(&db, other).unwrap().items[0].status, "created");
    }

    #[test]
    fn bounded_stored_payloads_are_scoped_and_fail_without_partial_commit() {
        let db = database();
        let huge = json!({"urls": ["x".repeat(MAX_BYTES + 1)]});
        piece(&db, OTHER, "firefox", huge.clone());
        let request = input(vec![candidate("https://example.com")]);
        assert_eq!(commit(&db, request).unwrap().items[0].status, "created");
        piece(&db, SPACE, "firefox", huge);
        let request = input(vec![candidate("https://another.example")]);
        assert_eq!(commit_result_error(&db, request), TOO_LARGE);
        assert_eq!(count(&db, "captura_operacion"), 1);
        assert_eq!(count(&db, "pieza"), 2);
        let mut missing = preview_input(vec![candidate("https://example.com")]);
        missing.space_id = Uuid::new_v4().to_string();
        assert_eq!(preview(&db, missing).unwrap_err(), NOT_FOUND);
    }

    #[test]
    fn immediate_transactions_serialize_concurrent_skip_and_same_operation() {
        for same_operation in [false, true] {
            let dir = Directory::new();
            let path = dir.0.join("concurrent.sqlite3");
            let db = Connection::open(&path).unwrap();
            initialize(&db);
            let request = input(vec![candidate("https://example.com")]);
            let barrier = Arc::new(Barrier::new(2));
            let threads: Vec<_> = (0..2)
                .map(|index| {
                    let path = path.clone();
                    let barrier = barrier.clone();
                    let mut request = request.clone();
                    if index == 1 && !same_operation {
                        request.operation_id = Uuid::new_v4().to_string();
                    }
                    std::thread::spawn(move || {
                        let db = Connection::open(path).unwrap();
                        db.busy_timeout(Duration::from_secs(10)).unwrap();
                        db.execute_batch("PRAGMA foreign_keys = ON").unwrap();
                        barrier.wait();
                        commit(&db, request).unwrap()
                    })
                })
                .collect();
            let results: Vec<_> = threads
                .into_iter()
                .map(|thread| thread.join().unwrap())
                .collect();
            assert_eq!(count(&db, "pieza"), 1);
            if same_operation {
                assert_eq!(results[0], results[1]);
                assert_eq!(count(&db, "captura_operacion"), 1);
            } else {
                assert_eq!(
                    results
                        .iter()
                        .filter(|result| result.items[0].status == "created")
                        .count(),
                    1
                );
                assert_eq!(
                    results
                        .iter()
                        .filter(|result| result.items[0].status == "skipped_duplicate")
                        .count(),
                    1
                );
                assert_eq!(count(&db, "captura_operacion"), 2);
            }
        }
    }

    #[test]
    fn additive_capture_migration_rolls_back_on_failure_and_preserves_closures() {
        let db = database();
        db.execute(
            "INSERT INTO cierre VALUES ('c', ?1, 'objective', 'progress', 'next', '', 1, 1, 1)",
            [SPACE],
        )
        .unwrap();
        db.execute_batch(
            "DROP TABLE captura_operacion; CREATE TABLE idx_captura_operacion_espacio (id TEXT);",
        )
        .unwrap();
        assert_eq!(migrate(&db).unwrap_err(), UNAVAILABLE);
        let exists: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name = 'captura_operacion')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(!exists);
        assert_eq!(count(&db, "cierre"), 1);
        db.execute_batch("DROP TABLE idx_captura_operacion_espacio")
            .unwrap();
        crate::db::migrate(&db).unwrap();
        crate::db::migrate(&db).unwrap();
        assert_eq!(count(&db, "cierre"), 1);
        assert_eq!(
            commit(&db, input(vec![candidate("https://example.com")]))
                .unwrap()
                .items[0]
                .status,
            "created"
        );
    }

    #[test]
    fn receipt_survives_response_loss_and_wire_key_order_is_canonical() {
        let dir = Directory::new();
        let path = dir.0.join("response-loss.sqlite3");
        let db = Connection::open(&path).unwrap();
        initialize(&db);
        let request = input(vec![candidate("https://example.com/?a=1#f")]);
        let expected = commit(&db, request.clone()).unwrap();
        drop(db);
        let state = crate::db::open(path).unwrap();
        let db = state.db.lock().unwrap();
        let raw = serde_json::to_value(&request).unwrap();
        let reordered: CommitInput = serde_json::from_value(raw).unwrap();
        assert_eq!(commit(&db, reordered).unwrap(), expected);
        assert_eq!(count(&db, "pieza"), 1);
        assert_eq!(count(&db, "captura_operacion"), 1);
        let mut altered = request;
        altered.items[0].name = "Captura".into();
        assert_eq!(commit_result_error(&db, altered), CONFLICT);
    }

    #[test]
    fn row_budget_is_destination_scoped_and_does_not_silently_ignore_duplicates() {
        let db = database();
        db.execute(
            "WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x < ?2)
             INSERT INTO pieza SELECT printf('33333333-3333-4333-8333-%012d', x), ?1,
             'firefox', 'Legacy', '{\"urls\":[\"https://example.com/\"]}', 1, x, '1', '1' FROM n",
            params![OTHER, (MAX_ROWS + 1) as i64],
        )
        .unwrap();
        let result = preview(&db, preview_input(vec![candidate("https://example.com")])).unwrap();
        assert_eq!(result.items[0].status, "ready");
        db.execute(
            "UPDATE pieza SET espacio_id = ?1 WHERE espacio_id = ?2",
            params![SPACE, OTHER],
        )
        .unwrap();
        assert_eq!(
            commit_result_error(&db, input(vec![candidate("https://example.com")])),
            TOO_LARGE
        );
        assert_eq!(count(&db, "captura_operacion"), 0);
        assert_eq!(count(&db, "pieza"), (MAX_ROWS + 1) as i64);
    }

    #[test]
    fn exact_item_reference_and_unicode_limits_are_accepted() {
        let db = database();
        let mut item = candidate("https://example.com/");
        item.reference
            .push_str(&"x".repeat(MAX_REFERENCE - item.reference.len()));
        item.name = "界".repeat(80);
        assert_eq!(item.reference.len(), MAX_REFERENCE);
        assert!(validate(&item).is_ok());
        item.reference.push('é');
        assert!(validate(&item).is_err());
        let result = commit(
            &db,
            input(
                (0..MAX_ITEMS)
                    .map(|index| candidate(&format!("https://example.com/{index}")))
                    .collect(),
            ),
        )
        .unwrap();
        assert_eq!(result.items.len(), MAX_ITEMS);
        assert!(result.items.iter().all(|item| item.status == "created"));
        let prepared = prepare_capture_paths(vec!["missing".into(); MAX_ITEMS]).unwrap();
        assert_eq!(prepared.items.len(), MAX_ITEMS);
    }

    #[test]
    fn captured_pieces_are_invisible_to_real_mcp_reader_after_reopen() {
        let dir = Directory::new();
        let path = dir.0.join("mcp.sqlite3");
        let db = Connection::open(&path).unwrap();
        initialize(&db);
        let result = commit(
            &db,
            input(vec![candidate("https://private.example/?token=secret")]),
        )
        .unwrap();
        let id = result.items[0].piece_id.as_ref().unwrap();
        drop(db);
        let reader = paravel_context::Reader::open(&path, SPACE).unwrap();
        assert_eq!(
            reader.leer_contexto_pieza(id).unwrap_err(),
            paravel_context::ReadError::NotFoundOrNotVisible
        );
        assert!(!reader
            .leer_espacio()
            .unwrap()
            .to_string()
            .contains("private.example"));
    }
}
