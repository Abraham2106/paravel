use crate::db::{AppState, Space};
use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

const MAX_ENVELOPE: usize = 128 * 1024;
const MAX_FIELD_BYTES: usize = 16 * 1024;
const MAX_REVISION: i64 = 9_007_199_254_740_991;
type Fields = BTreeMap<String, String>;
type Result<T> = std::result::Result<T, TemplateError>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
}

fn error(code: &str) -> TemplateError {
    let message = match code {
        "TEMPLATE_NOT_FOUND" => "La plantilla no está disponible.",
        "TEMPLATE_VERSION_UNSUPPORTED" => "La versión de plantilla no es compatible.",
        "GROUP_NOT_FOUND" => "El grupo de destino ya no existe.",
        "INVALID_FIELD" => "Revisa el valor, las claves y los límites del campo.",
        "INVALID_PIECE" => "Revisa el tipo, nombre y destino del recurso.",
        "REQUEST_CONFLICT" => "La solicitud ya se utilizó con otros datos.",
        "REVISION_CONFLICT" => "La preparación cambió. Recarga antes de guardar.",
        "SLOT_STATE_CONFLICT" => {
            "La sugerencia no está disponible en ese estado. Recarga antes de continuar."
        }
        "DB_BUSY" => "La base de datos está ocupada. Reintenta con la misma solicitud.",
        _ => "No se pudo acceder a la preparación.",
    };
    TemplateError {
        code: code.into(),
        message: message.into(),
        field: None,
    }
}

fn invalid(code: &str, field: &str) -> TemplateError {
    TemplateError {
        field: Some(field.into()),
        ..error(code)
    }
}

fn storage(err: rusqlite::Error) -> TemplateError {
    match err.sqlite_error_code() {
        Some(rusqlite::ErrorCode::DatabaseBusy | rusqlite::ErrorCode::DatabaseLocked) => {
            error("DB_BUSY")
        }
        _ => error("STORAGE_ERROR"),
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TemplateField {
    pub key: String,
    pub label: String,
    pub hint: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TemplateSlot {
    pub key: String,
    pub label: String,
    pub kinds: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TemplateDefinition {
    pub schema_version: u32,
    pub template_id: String,
    pub revision: u32,
    pub name: String,
    pub description: String,
    pub fields: Vec<TemplateField>,
    pub slots: Vec<TemplateSlot>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TemplatePiece {
    pub kind: String,
    pub name: String,
    pub payload: Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SlotInput {
    pub key: String,
    pub omitted: bool,
    #[serde(deserialize_with = "Option::<TemplatePiece>::deserialize")]
    pub piece: Option<TemplatePiece>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TemplateInput {
    pub request_id: String,
    pub template_id: String,
    pub template_revision: u32,
    pub schema_version: u32,
    pub group_id: String,
    pub name: String,
    pub fields: Fields,
    pub slots: Vec<SlotInput>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplatePreview {
    pub template: TemplateDefinition,
    pub name: String,
    pub group_id: String,
    pub fields: Fields,
    pub slots: Vec<SlotInput>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparationSlot {
    pub id: String,
    pub key: String,
    pub label: String,
    pub kinds: Vec<String>,
    pub order: i64,
    pub omitted: bool,
    pub piece_id: Option<String>,
    pub revision: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preparation {
    pub space_id: String,
    pub template: TemplateDefinition,
    pub fields: Fields,
    pub hidden: bool,
    pub revision: i64,
    pub slots: Vec<PreparationSlot>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedSpace {
    pub space: Space,
    pub preparation: Preparation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdatePreparation {
    pub space_id: String,
    pub expected_revision: i64,
    pub fields: Fields,
    pub hidden: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolveSlot {
    pub space_id: String,
    pub slot_id: String,
    pub expected_revision: i64,
    pub omitted: bool,
    #[serde(deserialize_with = "Option::<TemplatePiece>::deserialize")]
    pub piece: Option<TemplatePiece>,
}

#[tauri::command]
pub fn list_space_templates() -> Vec<TemplateDefinition> {
    let field = |key: &str, label: &str, hint: &str| TemplateField {
        key: key.into(),
        label: label.into(),
        hint: hint.into(),
    };
    let slot = |key: &str, label: &str, kinds: &[&str]| TemplateSlot {
        key: key.into(),
        label: label.into(),
        kinds: kinds.iter().map(|v| (*v).into()).collect(),
    };
    vec![
        TemplateDefinition {
            schema_version: 1,
            template_id: "development".into(),
            revision: 1,
            name: "Desarrollo".into(),
            description: "Prepara un lugar para desarrollar con tus recursos reales.".into(),
            fields: vec![
                field("objective", "Objetivo", "¿Qué quieres conseguir?"),
                field("firstStep", "Primer paso", "¿Por dónde empezarás?"),
            ],
            slots: vec![
                slot(
                    "workspace",
                    "Repositorio o carpeta de trabajo",
                    &["vscode", "cursor", "folder"],
                ),
                slot("reference", "Referencia funcional", &["firefox", "file"]),
            ],
        },
        TemplateDefinition {
            schema_version: 1,
            template_id: "research".into(),
            revision: 1,
            name: "Investigación".into(),
            description: "Reúne fuentes y material para explorar una pregunta.".into(),
            fields: vec![
                field(
                    "question",
                    "Pregunta de investigación",
                    "¿Qué quieres averiguar?",
                ),
                field(
                    "approach",
                    "Enfoque inicial",
                    "¿Cómo empezarás a investigarlo?",
                ),
            ],
            slots: vec![
                slot("sources", "Fuentes", &["firefox", "firefox-group"]),
                slot("material", "Material de trabajo", &["folder", "file"]),
            ],
        },
        TemplateDefinition {
            schema_version: 1,
            template_id: "client".into(),
            revision: 1,
            name: "Cliente".into(),
            description: "Prepara los materiales y la referencia de una entrega.".into(),
            fields: vec![
                field("outcome", "Resultado esperado", "¿Qué resultado se espera?"),
                field(
                    "nextDelivery",
                    "Próxima entrega",
                    "¿Qué prepararás a continuación?",
                ),
            ],
            slots: vec![
                slot("materials", "Materiales", &["folder", "file"]),
                slot(
                    "deliveryReference",
                    "Referencia de la entrega",
                    &["firefox", "file"],
                ),
            ],
        },
    ]
}

pub(crate) fn migrate(db: &Connection) -> std::result::Result<(), String> {
    let tx = Transaction::new_unchecked(db, TransactionBehavior::Immediate)
        .map_err(|_| error("STORAGE_ERROR").message)?;
    tx.execute_batch(
        "CREATE TABLE IF NOT EXISTS espacio_preparacion (
            espacio_id TEXT NOT NULL PRIMARY KEY REFERENCES espacio(id) ON DELETE CASCADE,
            creation_request_id TEXT NOT NULL UNIQUE,
            creation_fingerprint TEXT NOT NULL CHECK(length(creation_fingerprint) = 74),
            template_id TEXT NOT NULL,
            template_revision INTEGER NOT NULL CHECK(template_revision > 0),
            schema_version INTEGER NOT NULL CHECK(schema_version = 1),
            definition_snapshot TEXT NOT NULL CHECK(json_valid(definition_snapshot)),
            field_values TEXT NOT NULL CHECK(json_valid(field_values)),
            oculta INTEGER NOT NULL DEFAULT 0 CHECK(oculta IN (0, 1)),
            revision INTEGER NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
            creado_en TEXT NOT NULL, editado_en TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS preparacion_sugerencia (
            id TEXT NOT NULL PRIMARY KEY,
            espacio_id TEXT NOT NULL REFERENCES espacio_preparacion(espacio_id) ON DELETE CASCADE,
            slot_key TEXT NOT NULL,
            orden INTEGER NOT NULL CHECK(orden >= 0),
            omitida INTEGER NOT NULL DEFAULT 0 CHECK(omitida IN (0, 1)),
            pieza_id TEXT REFERENCES pieza(id) ON DELETE SET NULL,
            resolution_fingerprint TEXT,
            piece_fingerprint TEXT,
            revision INTEGER NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
            UNIQUE(espacio_id, slot_key), UNIQUE(espacio_id, orden),
            CHECK(omitida = 0 OR pieza_id IS NULL)
         );
         CREATE INDEX IF NOT EXISTS idx_preparacion_pieza ON preparacion_sugerencia(pieza_id);
         CREATE TRIGGER IF NOT EXISTS preparacion_receipt_immutable
         BEFORE UPDATE OF espacio_id, creation_request_id, creation_fingerprint, template_id,
            template_revision, schema_version, definition_snapshot, creado_en ON espacio_preparacion
         BEGIN SELECT RAISE(ABORT, 'immutable preparation'); END;
         CREATE TRIGGER IF NOT EXISTS preparacion_slot_insert_scope
         BEFORE INSERT ON preparacion_sugerencia WHEN NEW.pieza_id IS NOT NULL
         BEGIN
            SELECT RAISE(ABORT, 'piece scope') WHERE NOT EXISTS (
                SELECT 1 FROM pieza WHERE id = NEW.pieza_id AND espacio_id = NEW.espacio_id);
         END;
         CREATE TRIGGER IF NOT EXISTS preparacion_slot_update_scope
         BEFORE UPDATE OF pieza_id, espacio_id ON preparacion_sugerencia WHEN NEW.pieza_id IS NOT NULL
         BEGIN
            SELECT RAISE(ABORT, 'piece scope') WHERE NOT EXISTS (
                SELECT 1 FROM pieza WHERE id = NEW.pieza_id AND espacio_id = NEW.espacio_id);
         END;
         CREATE TRIGGER IF NOT EXISTS preparacion_piece_move_scope
         BEFORE UPDATE OF espacio_id ON pieza
         BEGIN
            SELECT RAISE(ABORT, 'piece scope') WHERE EXISTS (
                SELECT 1 FROM preparacion_sugerencia WHERE pieza_id = OLD.id AND espacio_id != NEW.espacio_id);
         END;
         CREATE TRIGGER IF NOT EXISTS preparacion_piece_deleted
         AFTER UPDATE OF pieza_id ON preparacion_sugerencia
         WHEN OLD.pieza_id IS NOT NULL AND NEW.pieza_id IS NULL
         BEGIN
            UPDATE preparacion_sugerencia SET revision = revision + 1 WHERE id = NEW.id;
         END;
         CREATE TRIGGER IF NOT EXISTS preparacion_slot_changed
         AFTER UPDATE OF pieza_id, omitida ON preparacion_sugerencia
         WHEN OLD.pieza_id IS NOT NEW.pieza_id OR OLD.omitida != NEW.omitida
         BEGIN
            UPDATE espacio_preparacion SET revision = revision + 1,
                editado_en = CAST(strftime('%s', 'now') AS TEXT) WHERE espacio_id = NEW.espacio_id;
         END;",
    ).map_err(|_| error("STORAGE_ERROR").message)?;
    tx.commit().map_err(|_| error("STORAGE_ERROR").message)
}

fn uuid(raw: &str, field: &str) -> Result<String> {
    if raw.len() != 36 {
        return Err(invalid("INVALID_FIELD", field));
    }
    Uuid::parse_str(raw)
        .map(|id| id.to_string())
        .map_err(|_| invalid("INVALID_FIELD", field))
}

fn bounded<T: Serialize>(input: &T) -> Result<()> {
    if serde_json::to_vec(input)
        .map_err(|_| invalid("INVALID_FIELD", "input"))?
        .len()
        > MAX_ENVELOPE
    {
        return Err(invalid("INVALID_FIELD", "input"));
    }
    Ok(())
}

fn decode<T: DeserializeOwned>(input: Value) -> Result<T> {
    bounded(&input)?;
    serde_json::from_value(input).map_err(|_| invalid("INVALID_FIELD", "input"))
}

fn name(raw: &str, field: &str) -> Result<String> {
    let value = raw.trim();
    if value.is_empty() || value.chars().count() > 80 {
        return Err(invalid("INVALID_FIELD", field));
    }
    Ok(value.into())
}

fn fields(raw: Fields, template: &TemplateDefinition) -> Result<Fields> {
    if raw.values().map(String::len).sum::<usize>() > MAX_FIELD_BYTES {
        return Err(invalid("INVALID_FIELD", "fields"));
    }
    let mut result: Fields = template
        .fields
        .iter()
        .map(|f| (f.key.clone(), String::new()))
        .collect();
    for (key, value) in raw {
        let target = result
            .get_mut(&key)
            .ok_or_else(|| invalid("INVALID_FIELD", "fields"))?;
        if value.trim().chars().count() > 1000 {
            return Err(invalid("INVALID_FIELD", &format!("fields.{key}")));
        }
        *target = value.trim().into();
    }
    Ok(result)
}

fn normalize_piece(
    mut piece: TemplatePiece,
    kinds: &[String],
    field: &str,
) -> Result<TemplatePiece> {
    if !kinds.contains(&piece.kind) {
        return Err(invalid("INVALID_PIECE", field));
    }
    piece.name = name(&piece.name, field).map_err(|_| invalid("INVALID_PIECE", field))?;
    let key = if matches!(piece.kind.as_str(), "firefox" | "firefox-group") {
        "urls"
    } else {
        "path"
    };
    let object = piece
        .payload
        .as_object()
        .ok_or_else(|| invalid("INVALID_PIECE", field))?;
    if object.len() != 1 || !object.contains_key(key) {
        return Err(invalid("INVALID_PIECE", field));
    }
    if key == "urls" {
        let urls = piece.payload[key]
            .as_array()
            .ok_or_else(|| invalid("INVALID_PIECE", field))?;
        if urls.is_empty() {
            return Err(invalid("INVALID_PIECE", field));
        }
        let normalized = urls
            .iter()
            .map(|v| {
                let raw = v.as_str().ok_or_else(|| invalid("INVALID_PIECE", field))?;
                if piece.kind == "firefox-group"
                    && (raw.chars().any(|c| c.is_whitespace() || c.is_control())
                        || !["http://", "https://", "file:///"]
                            .iter()
                            .any(|prefix| raw.to_ascii_lowercase().starts_with(prefix)))
                {
                    return Err(invalid("INVALID_PIECE", field));
                }
                let parsed = url::Url::parse(raw).map_err(|_| invalid("INVALID_PIECE", field))?;
                if !(matches!(parsed.scheme(), "http" | "https")
                    || piece.kind == "firefox-group" && parsed.scheme() == "file")
                {
                    return Err(invalid("INVALID_PIECE", field));
                }
                Ok(parsed.to_string())
            })
            .collect::<Result<Vec<_>>>()?;
        piece.payload = serde_json::json!({ "urls": normalized });
    } else if piece.payload[key].as_str().is_none_or(str::is_empty) {
        return Err(invalid("INVALID_PIECE", field));
    }
    Ok(piece)
}

fn normalize(mut input: TemplateInput, template: &TemplateDefinition) -> Result<TemplateInput> {
    bounded(&input)?;
    input.request_id = uuid(&input.request_id, "requestId")?;
    input.group_id = uuid(&input.group_id, "groupId")?;
    if input.schema_version != 1
        || input.schema_version != template.schema_version
        || input.template_revision != template.revision
        || input.template_id != template.template_id
    {
        return Err(error("TEMPLATE_VERSION_UNSUPPORTED"));
    }
    input.name = name(&input.name, "name")?;
    input.fields = fields(input.fields, template)?;
    let mut supplied = BTreeMap::new();
    for slot in input.slots {
        if !template.slots.iter().any(|s| s.key == slot.key) || supplied.contains_key(&slot.key) {
            return Err(invalid("INVALID_FIELD", "slots"));
        }
        supplied.insert(slot.key.clone(), slot);
    }
    input.slots = template
        .slots
        .iter()
        .map(|definition| {
            let mut slot = supplied
                .remove(&definition.key)
                .unwrap_or_else(|| SlotInput {
                    key: definition.key.clone(),
                    omitted: false,
                    piece: None,
                });
            let field = format!("slots.{}", slot.key);
            if slot.omitted && slot.piece.is_some() {
                return Err(invalid("INVALID_PIECE", &field));
            }
            slot.piece = slot
                .piece
                .map(|piece| normalize_piece(piece, &definition.kinds, &field))
                .transpose()?;
            Ok(slot)
        })
        .collect::<Result<_>>()?;
    Ok(input)
}

fn fingerprint(input: &TemplateInput) -> Result<String> {
    let value = serde_json::to_value(input).map_err(|_| error("STORAGE_ERROR"))?;
    let mut hash = Sha256::new();
    hash.update(b"paravel-template-command-v1\0");
    hash.update(serde_json::to_vec(&value).map_err(|_| error("STORAGE_ERROR"))?);
    Ok(format!("sha256-v1:{:x}", hash.finalize()))
}

fn piece_digest(piece: &TemplatePiece) -> Result<String> {
    let value = serde_json::to_value(piece).map_err(|_| error("STORAGE_ERROR"))?;
    let mut hash = Sha256::new();
    hash.update(b"paravel-template-piece-v1\0");
    hash.update(serde_json::to_vec(&value).map_err(|_| error("STORAGE_ERROR"))?);
    Ok(format!("sha256-v1:{:x}", hash.finalize()))
}

fn definition(id: &str) -> Result<TemplateDefinition> {
    list_space_templates()
        .into_iter()
        .find(|t| t.template_id == id)
        .ok_or_else(|| error("TEMPLATE_NOT_FOUND"))
}

fn ensure_group(db: &Connection, id: &str) -> Result<()> {
    let exists: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM grupo WHERE id = ?1)",
            [id],
            |r| r.get(0),
        )
        .map_err(storage)?;
    if exists {
        Ok(())
    } else {
        Err(error("GROUP_NOT_FOUND"))
    }
}

fn validate_resources(input: &mut TemplateInput) -> Result<()> {
    for slot in &mut input.slots {
        if let Some(piece) = &mut slot.piece {
            piece.payload = crate::validate_piece_payload(&piece.kind, piece.payload.clone())
                .map_err(|_| invalid("INVALID_PIECE", &format!("slots.{}", slot.key)))?;
        }
    }
    Ok(())
}

fn preview(db: &Connection, input: TemplateInput) -> Result<TemplatePreview> {
    bounded(&input)?;
    let template = definition(&input.template_id)?;
    let mut input = normalize(input, &template)?;
    ensure_group(db, &input.group_id)?;
    validate_resources(&mut input)?;
    Ok(TemplatePreview {
        template,
        name: input.name,
        group_id: input.group_id,
        fields: input.fields,
        slots: input.slots,
    })
}

fn read_preparation(db: &Connection, space_id: &str) -> Result<Option<Preparation>> {
    let row = db.query_row(
        "SELECT definition_snapshot, field_values, oculta, revision FROM espacio_preparacion WHERE espacio_id = ?1",
        [space_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, bool>(2)?, r.get::<_, i64>(3)?)),
    ).optional().map_err(storage)?;
    let Some((snapshot, values, hidden, revision)) = row else {
        return Ok(None);
    };
    let template: TemplateDefinition =
        serde_json::from_str(&snapshot).map_err(|_| error("STORAGE_ERROR"))?;
    if template.schema_version != 1
        || template.revision == 0
        || template.fields.len() > 2
        || template.slots.len() > 2
        || template
            .fields
            .iter()
            .map(|f| &f.key)
            .collect::<BTreeSet<_>>()
            .len()
            != template.fields.len()
        || template
            .slots
            .iter()
            .map(|s| &s.key)
            .collect::<BTreeSet<_>>()
            .len()
            != template.slots.len()
    {
        return Err(error("STORAGE_ERROR"));
    }
    let fields: Fields = serde_json::from_str(&values).map_err(|_| error("STORAGE_ERROR"))?;
    let mut stmt = db.prepare("SELECT id, slot_key, orden, omitida, pieza_id, revision FROM preparacion_sugerencia WHERE espacio_id = ?1 ORDER BY orden").map_err(storage)?;
    let rows = stmt
        .query_map([space_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, bool>(3)?,
                r.get::<_, Option<String>>(4)?,
                r.get::<_, i64>(5)?,
            ))
        })
        .map_err(storage)?;
    let mut slots = Vec::new();
    for row in rows {
        let (id, key, order, omitted, piece_id, revision) = row.map_err(storage)?;
        let slot = template
            .slots
            .get(slots.len())
            .filter(|s| s.key == key && order == slots.len() as i64)
            .ok_or_else(|| error("STORAGE_ERROR"))?;
        slots.push(PreparationSlot {
            id,
            key,
            label: slot.label.clone(),
            kinds: slot.kinds.clone(),
            order,
            omitted,
            piece_id,
            revision,
        });
    }
    if slots.len() != template.slots.len() {
        return Err(error("STORAGE_ERROR"));
    }
    Ok(Some(Preparation {
        space_id: space_id.into(),
        template,
        fields,
        hidden,
        revision,
        slots,
    }))
}

fn get(db: &Connection, space_id: &str) -> Result<Option<Preparation>> {
    let space_id = uuid(space_id, "spaceId")?;
    let tx = db.unchecked_transaction().map_err(storage)?;
    let result = read_preparation(&tx, &space_id)?;
    tx.commit().map_err(storage)?;
    Ok(result)
}

fn required(db: &Connection, space_id: &str) -> Result<Preparation> {
    read_preparation(db, space_id)?.ok_or_else(|| error("SLOT_STATE_CONFLICT"))
}

fn created(db: &Connection, space_id: &str) -> Result<CreatedSpace> {
    let mut space = db
        .query_row(
            "SELECT id, grupo_id, nombre, nota, bot_activo FROM espacio WHERE id = ?1",
            [space_id],
            |r| {
                Ok(Space {
                    id: r.get(0)?,
                    group_id: r.get(1)?,
                    name: r.get(2)?,
                    note: r.get(3)?,
                    bot_active: r.get(4)?,
                    pack: Vec::new(),
                })
            },
        )
        .map_err(storage)?;
    let mut stmt = db
        .prepare("SELECT pieza_id FROM pack_pieza WHERE espacio_id = ?1 ORDER BY rowid")
        .map_err(storage)?;
    space.pack = stmt
        .query_map([space_id], |r| r.get(0))
        .map_err(storage)?
        .collect::<std::result::Result<_, _>>()
        .map_err(storage)?;
    Ok(CreatedSpace {
        space,
        preparation: required(db, space_id)?,
    })
}

fn replay(db: &Connection, input: &TemplateInput) -> Result<Option<CreatedSpace>> {
    let receipt = db.query_row("SELECT espacio_id, creation_fingerprint FROM espacio_preparacion WHERE creation_request_id = ?1", [&input.request_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).optional().map_err(storage)?;
    let Some((space_id, digest)) = receipt else {
        return Ok(None);
    };
    let preparation = required(db, &space_id)?;
    let normalized =
        normalize(input.clone(), &preparation.template).map_err(|_| error("REQUEST_CONFLICT"))?;
    if fingerprint(&normalized)? != digest {
        return Err(error("REQUEST_CONFLICT"));
    }
    created(db, &space_id).map(Some)
}

fn insert_piece(db: &Connection, space_id: &str, piece: &TemplatePiece) -> Result<String> {
    let order: i64 = db
        .query_row(
            "SELECT COALESCE(MAX(orden), -1) + 1 FROM pieza WHERE espacio_id = ?1",
            [space_id],
            |r| r.get(0),
        )
        .map_err(storage)?;
    let id = Uuid::new_v4().to_string();
    db.execute("INSERT INTO pieza (id, espacio_id, kind, nombre, payload, marcada, orden, creado_en, editado_en) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, ?7)", params![id, space_id, piece.kind, piece.name, piece.payload.to_string(), order, crate::chrono_like_timestamp()]).map_err(storage)?;
    Ok(id)
}

fn create(db: &Connection, mut input: TemplateInput) -> Result<CreatedSpace> {
    bounded(&input)?;
    input.request_id = uuid(&input.request_id, "requestId")?;
    {
        let tx = db.unchecked_transaction().map_err(storage)?;
        if let Some(result) = replay(&tx, &input)? {
            tx.commit().map_err(storage)?;
            return Ok(result);
        }
        tx.commit().map_err(storage)?;
    }
    let tx = Transaction::new_unchecked(db, TransactionBehavior::Immediate).map_err(storage)?;
    if let Some(result) = replay(&tx, &input)? {
        tx.commit().map_err(storage)?;
        return Ok(result);
    }
    let template = definition(&input.template_id)?;
    let mut input = normalize(input, &template)?;
    let digest = fingerprint(&input)?;
    ensure_group(&tx, &input.group_id)?;
    let requested_slots = input.slots.clone();
    validate_resources(&mut input)?;
    let id = Uuid::new_v4().to_string();
    let timestamp = crate::chrono_like_timestamp();
    tx.execute("INSERT INTO espacio (id, grupo_id, nombre, nota, bot_activo, creado_en, editado_en) VALUES (?1, ?2, ?3, NULL, 0, ?4, ?4)", params![id, input.group_id, input.name, timestamp]).map_err(storage)?;
    tx.execute("INSERT INTO espacio_preparacion (espacio_id, creation_request_id, creation_fingerprint, template_id, template_revision, schema_version, definition_snapshot, field_values, creado_en, editado_en) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, ?8, ?8)", params![id, input.request_id, digest, template.template_id, template.revision, serde_json::to_string(&template).map_err(|_| error("STORAGE_ERROR"))?, serde_json::to_string(&input.fields).map_err(|_| error("STORAGE_ERROR"))?, timestamp]).map_err(storage)?;
    for (order, slot) in input.slots.iter().enumerate() {
        let piece_id = slot
            .piece
            .as_ref()
            .map(|p| insert_piece(&tx, &id, p))
            .transpose()?;
        tx.execute("INSERT INTO preparacion_sugerencia (id, espacio_id, slot_key, orden, omitida, pieza_id, resolution_fingerprint, piece_fingerprint) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)", params![Uuid::new_v4().to_string(), id, slot.key, order as i64, slot.omitted, piece_id, requested_slots[order].piece.as_ref().map(piece_digest).transpose()?, slot.piece.as_ref().map(piece_digest).transpose()?]).map_err(storage)?;
    }
    let result = created(&tx, &id)?;
    tx.commit().map_err(storage)?;
    Ok(result)
}

fn revision(expected: i64) -> Result<()> {
    if !(1..MAX_REVISION).contains(&expected) {
        return Err(invalid("INVALID_FIELD", "expectedRevision"));
    }
    Ok(())
}

fn update(db: &Connection, input: UpdatePreparation) -> Result<Preparation> {
    bounded(&input)?;
    let space_id = uuid(&input.space_id, "spaceId")?;
    revision(input.expected_revision)?;
    let tx = Transaction::new_unchecked(db, TransactionBehavior::Immediate).map_err(storage)?;
    let previous = required(&tx, &space_id)?;
    if previous.revision != input.expected_revision {
        return Err(error("REVISION_CONFLICT"));
    }
    let fields = fields(input.fields, &previous.template)?;
    let changed = tx.execute("UPDATE espacio_preparacion SET field_values = ?1, oculta = ?2, revision = revision + 1, editado_en = ?3 WHERE espacio_id = ?4 AND revision = ?5", params![serde_json::to_string(&fields).map_err(|_| error("STORAGE_ERROR"))?, input.hidden, crate::chrono_like_timestamp(), space_id, input.expected_revision]).map_err(storage)?;
    if changed != 1 {
        return Err(error("REVISION_CONFLICT"));
    }
    let result = required(&tx, &space_id)?;
    tx.commit().map_err(storage)?;
    Ok(result)
}

fn resolve(db: &Connection, input: ResolveSlot) -> Result<Preparation> {
    bounded(&input)?;
    let space_id = uuid(&input.space_id, "spaceId")?;
    let slot_id = uuid(&input.slot_id, "slotId")?;
    revision(input.expected_revision)?;
    if input.omitted && input.piece.is_some() {
        return Err(invalid("INVALID_PIECE", "piece"));
    }
    let tx = Transaction::new_unchecked(db, TransactionBehavior::Immediate).map_err(storage)?;
    let previous = required(&tx, &space_id)?;
    let slot = previous
        .slots
        .iter()
        .find(|s| s.id == slot_id)
        .ok_or_else(|| error("SLOT_STATE_CONFLICT"))?;
    let piece = input
        .piece
        .map(|p| normalize_piece(p, &slot.kinds, "piece"))
        .transpose()?;
    if let Some(piece_id) = &slot.piece_id {
        if input.omitted || piece.is_none() {
            return Err(error("SLOT_STATE_CONFLICT"));
        }
        let stored = tx
            .query_row(
                "SELECT kind, nombre, payload FROM pieza WHERE id = ?1 AND espacio_id = ?2",
                params![piece_id, space_id],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()
            .map_err(storage)?
            .ok_or_else(|| error("SLOT_STATE_CONFLICT"))?;
        let stored = TemplatePiece {
            kind: stored.0,
            name: stored.1,
            payload: serde_json::from_str(&stored.2).map_err(|_| error("STORAGE_ERROR"))?,
        };
        let receipts = tx.query_row("SELECT resolution_fingerprint, piece_fingerprint FROM preparacion_sugerencia WHERE id = ?1 AND espacio_id = ?2", params![slot_id, space_id], |r| Ok((r.get::<_, Option<String>>(0)?, r.get::<_, Option<String>>(1)?))).map_err(storage)?;
        let requested_digest = piece.as_ref().map(piece_digest).transpose()?;
        let stored_digest = Some(piece_digest(&stored)?);
        if receipts.1 != stored_digest
            || (requested_digest != receipts.0 && requested_digest != stored_digest)
            || !(slot.revision == input.expected_revision
                || slot.revision == input.expected_revision + 1)
        {
            return Err(error("SLOT_STATE_CONFLICT"));
        }
        tx.commit().map_err(storage)?;
        return Ok(previous);
    }
    if slot.revision != input.expected_revision {
        if slot.omitted
            && input.omitted
            && piece.is_none()
            && slot.revision == input.expected_revision + 1
        {
            tx.commit().map_err(storage)?;
            return Ok(previous);
        }
        return Err(error("REVISION_CONFLICT"));
    }
    if piece.is_none() && slot.omitted == input.omitted {
        tx.commit().map_err(storage)?;
        return Ok(previous);
    }
    if previous.revision >= MAX_REVISION {
        return Err(error("REVISION_CONFLICT"));
    }
    let requested_digest = piece.as_ref().map(piece_digest).transpose()?;
    let mut stored_digest = None;
    let piece_id = piece
        .map(|mut p| {
            p.payload = crate::validate_piece_payload(&p.kind, p.payload)
                .map_err(|_| invalid("INVALID_PIECE", "piece"))?;
            stored_digest = Some(piece_digest(&p)?);
            insert_piece(&tx, &space_id, &p)
        })
        .transpose()?;
    let changed = tx.execute("UPDATE preparacion_sugerencia SET pieza_id = ?1, omitida = ?2, revision = revision + 1, resolution_fingerprint = ?6, piece_fingerprint = ?7 WHERE espacio_id = ?3 AND id = ?4 AND revision = ?5 AND pieza_id IS NULL", params![piece_id, input.omitted, space_id, slot_id, input.expected_revision, requested_digest, stored_digest]).map_err(storage)?;
    if changed != 1 {
        return Err(error("REVISION_CONFLICT"));
    }
    let result = required(&tx, &space_id)?;
    tx.commit().map_err(storage)?;
    Ok(result)
}

#[tauri::command]
pub fn preview_space_template(
    input: Value,
    state: tauri::State<'_, AppState>,
) -> Result<TemplatePreview> {
    let input = decode(input)?;
    let db = state.db.try_lock().map_err(|_| error("DB_BUSY"))?;
    preview(&db, input)
}

#[tauri::command]
pub fn create_space_from_template(
    input: Value,
    state: tauri::State<'_, AppState>,
) -> Result<CreatedSpace> {
    let input = decode(input)?;
    let db = state.db.try_lock().map_err(|_| error("DB_BUSY"))?;
    create(&db, input)
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_space_preparation(
    space_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<Preparation>> {
    let db = state.db.try_lock().map_err(|_| error("DB_BUSY"))?;
    get(&db, &space_id)
}

#[tauri::command]
pub fn update_space_preparation(
    input: Value,
    state: tauri::State<'_, AppState>,
) -> Result<Preparation> {
    let input = decode(input)?;
    let db = state.db.try_lock().map_err(|_| error("DB_BUSY"))?;
    update(&db, input)
}

#[tauri::command]
pub fn resolve_preparation_slot(
    input: Value,
    state: tauri::State<'_, AppState>,
) -> Result<Preparation> {
    let input = decode(input)?;
    let db = state.db.try_lock().map_err(|_| error("DB_BUSY"))?;
    resolve(&db, input)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::OpenFlags;
    use serde_json::json;
    use std::{
        path::PathBuf,
        sync::{Arc, Barrier},
        time::Duration,
    };

    const GROUP: &str = "00000000-0000-4000-8000-000000000001";
    const PRIVATE: &str = "P03_PRIVATE_SENTINEL";

    fn setup(db: &Connection) {
        crate::db::migrate(db).unwrap();
        db.execute(
            "INSERT INTO grupo VALUES (?1, 'Grupo', 'folder', 0, '1', '1')",
            [GROUP],
        )
        .unwrap();
    }

    fn fixture() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        setup(&db);
        db
    }

    fn input(id: &str) -> TemplateInput {
        TemplateInput {
            request_id: Uuid::new_v4().to_string(),
            template_id: id.into(),
            template_revision: 1,
            schema_version: 1,
            group_id: GROUP.into(),
            name: " Mesa ".into(),
            fields: Fields::new(),
            slots: Vec::new(),
        }
    }

    fn web() -> TemplatePiece {
        TemplatePiece {
            kind: "firefox".into(),
            name: "Referencia".into(),
            payload: json!({"urls": ["https://example.com"]}),
        }
    }

    fn resource_input() -> TemplateInput {
        let mut request = input("research");
        request.slots.push(SlotInput {
            key: "sources".into(),
            omitted: false,
            piece: Some(web()),
        });
        request
    }

    fn resolution(
        p: &Preparation,
        key: &str,
        piece: Option<TemplatePiece>,
        omitted: bool,
    ) -> ResolveSlot {
        let slot = p.slots.iter().find(|s| s.key == key).unwrap();
        ResolveSlot {
            space_id: p.space_id.clone(),
            slot_id: slot.id.clone(),
            expected_revision: slot.revision,
            omitted,
            piece,
        }
    }

    fn code<T: std::fmt::Debug>(result: Result<T>, expected: &str) {
        assert_eq!(result.unwrap_err().code, expected);
    }

    fn count(db: &Connection, table: &str) -> i64 {
        db.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
            .unwrap()
    }

    fn snapshot(db: &Connection) -> Vec<Value> {
        [
            "grupo",
            "espacio",
            "pieza",
            "pack_pieza",
            "cierre",
            "espacio_preparacion",
            "preparacion_sugerencia",
        ]
        .iter()
        .map(|table| {
            let mut stmt = db
                .prepare(&format!("SELECT * FROM {table} ORDER BY 1"))
                .unwrap();
            let columns = stmt.column_count();
            let rows = stmt
                .query_map([], |r| {
                    (0..columns)
                        .map(|i| {
                            r.get::<_, rusqlite::types::Value>(i)
                                .map(|v| format!("{v:?}"))
                        })
                        .collect::<std::result::Result<Vec<_>, _>>()
                })
                .unwrap()
                .collect::<std::result::Result<Vec<_>, _>>()
                .unwrap();
            json!(rows)
        })
        .collect()
    }

    struct Disk(PathBuf);

    impl Disk {
        fn new() -> Self {
            Self(
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("target")
                    .join(format!("templates-{}.sqlite3", Uuid::new_v4())),
            )
        }
    }

    impl Drop for Disk {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }

    struct LocalFile(PathBuf);

    impl LocalFile {
        fn new() -> Self {
            let dir = std::env::temp_dir()
                .join("launch-host-test")
                .join(Uuid::new_v4().to_string());
            std::fs::create_dir_all(&dir).unwrap();
            let path = dir.join("fixture.txt");
            std::fs::write(&path, b"synthetic fixture").unwrap();
            Self(path)
        }

        fn piece(&self) -> TemplatePiece {
            TemplatePiece {
                kind: "file".into(),
                name: "Documento".into(),
                payload: json!({"path": self.0.parent().unwrap().join(".").join("fixture.txt")}),
            }
        }
    }

    impl Drop for LocalFile {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(self.0.parent().unwrap());
        }
    }

    #[test]
    fn catalog_preview_and_empty_materialization_are_deterministic() {
        let db = fixture();
        let baseline = snapshot(&db);
        let catalog = list_space_templates();
        assert_eq!(catalog.len(), 3);
        for template in &catalog {
            assert_eq!(template.fields.len(), 2);
            assert_eq!(template.slots.len(), 2);
            let preview = preview(&db, input(&template.template_id)).unwrap();
            assert_eq!(preview.name, "Mesa");
            assert_eq!(preview.template, *template);
            assert!(preview.fields.values().all(String::is_empty));
            assert!(preview
                .slots
                .iter()
                .all(|s| s.piece.is_none() && !s.omitted));
        }
        assert_eq!(snapshot(&db), baseline);
        for template in catalog {
            let result = create(&db, input(&template.template_id)).unwrap();
            assert_eq!(result.preparation.template, template);
            assert_eq!(result.preparation.revision, 1);
            assert!(result.space.note.is_none());
            assert!(!result.space.bot_active);
            assert!(result.space.pack.is_empty());
            assert_eq!(
                get(&db, &result.space.id).unwrap().unwrap(),
                result.preparation
            );
        }
        assert_eq!(count(&db, "espacio"), 3);
        assert_eq!(count(&db, "pieza"), 0);
        assert_eq!(count(&db, "cierre"), 0);
        assert_eq!(count(&db, "pack_pieza"), 0);
    }

    #[test]
    fn independent_instances_private_snapshots_and_immutable_receipts() {
        let db = fixture();
        let mut request = resource_input();
        request.fields.insert("question".into(), PRIVATE.into());
        let first = create(&db, request.clone()).unwrap();
        request.request_id = Uuid::new_v4().to_string();
        let second = create(&db, request).unwrap();
        assert_ne!(first.space.id, second.space.id);
        assert_ne!(
            first.preparation.slots[0].id,
            second.preparation.slots[0].id
        );
        assert_ne!(
            first.preparation.slots[0].piece_id,
            second.preparation.slots[0].piece_id
        );
        update(
            &db,
            UpdatePreparation {
                space_id: first.space.id.clone(),
                expected_revision: 1,
                fields: Fields::new(),
                hidden: true,
            },
        )
        .unwrap();
        assert_eq!(
            get(&db, &second.space.id).unwrap().unwrap(),
            second.preparation
        );
        for column in [
            "creation_request_id",
            "creation_fingerprint",
            "definition_snapshot",
        ] {
            assert!(db
                .execute(
                    &format!(
                        "UPDATE espacio_preparacion SET {column} = {column} WHERE espacio_id = ?1"
                    ),
                    [&first.space.id]
                )
                .is_err());
        }
        let mut changed_catalog = list_space_templates();
        changed_catalog[1].slots[0].label = "Nueva etiqueta".into();
        assert_ne!(
            get(&db, &second.space.id).unwrap().unwrap().template,
            changed_catalog[1]
        );
        let mut stmt = db
            .prepare("SELECT creation_fingerprint, definition_snapshot FROM espacio_preparacion")
            .unwrap();
        for row in stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .unwrap()
        {
            let (digest, definition) = row.unwrap();
            assert_eq!(digest.len(), 74);
            assert!(!digest.contains(PRIVATE));
            assert!(!definition.contains(PRIVATE));
            assert!(!definition.contains("https://example.com"));
        }
    }

    #[test]
    fn creation_retry_is_immutable_and_normalized_before_path_revalidation() {
        let db = fixture();
        let file = LocalFile::new();
        let mut request = input("client");
        request.slots.push(SlotInput {
            key: "materials".into(),
            omitted: false,
            piece: Some(file.piece()),
        });
        let first = create(&db, request.clone()).unwrap();
        std::fs::remove_file(&file.0).unwrap();
        let edited = update(
            &db,
            UpdatePreparation {
                space_id: first.space.id.clone(),
                expected_revision: 1,
                fields: [("outcome".into(), PRIVATE.into())].into(),
                hidden: true,
            },
        )
        .unwrap();
        let before = snapshot(&db);
        let replay = create(&db, request.clone()).unwrap();
        assert_eq!(replay.space.id, first.space.id);
        assert_eq!(replay.preparation, edited);
        assert_eq!(snapshot(&db), before);
        request.name = "Mesa".into();
        request.fields.insert("outcome".into(), "  ".into());
        assert_eq!(
            create(&db, request.clone()).unwrap().space.id,
            first.space.id
        );
        request.name = "Otra".into();
        code(create(&db, request.clone()), "REQUEST_CONFLICT");
        request.request_id = Uuid::new_v4().to_string();
        code(create(&db, request), "INVALID_PIECE");
        db.execute("DELETE FROM pieza WHERE espacio_id = ?1", [&first.space.id])
            .unwrap();
        let mut original = input("client");
        original.request_id = db
            .query_row(
                "SELECT creation_request_id FROM espacio_preparacion WHERE espacio_id = ?1",
                [&first.space.id],
                |r| r.get(0),
            )
            .unwrap();
        original.slots.push(SlotInput {
            key: "materials".into(),
            omitted: false,
            piece: Some(file.piece()),
        });
        assert!(create(&db, original).unwrap().preparation.slots[0]
            .piece_id
            .is_none());
        assert_eq!(count(&db, "pieza"), 0);
    }

    #[test]
    fn fingerprints_are_canonical_versioned_and_have_a_fixed_vector() {
        let request = TemplateInput {
            request_id: GROUP.into(),
            ..input("development")
        };
        let normalized = normalize(request.clone(), &definition("development").unwrap()).unwrap();
        let digest = fingerprint(&normalized).unwrap();
        assert_eq!(
            digest,
            "sha256-v1:4d63470b7a6924565f496da9bb1508c944c1d9e9e7e0c846f5701df531e1d2da"
        );
        assert_eq!(digest.len(), 74);
        let mut equivalent = request;
        equivalent.name = "Mesa".into();
        equivalent.slots = vec![
            SlotInput {
                key: "reference".into(),
                omitted: false,
                piece: None,
            },
            SlotInput {
                key: "workspace".into(),
                omitted: false,
                piece: None,
            },
        ];
        equivalent.fields.insert("firstStep".into(), " ".into());
        assert_eq!(
            digest,
            fingerprint(&normalize(equivalent, &definition("development").unwrap()).unwrap())
                .unwrap()
        );
        assert_eq!(
            format!("{:x}", Sha256::digest(b"abc")),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        let encoded = serde_json::to_string(&serde_json::to_value(normalized).unwrap()).unwrap();
        assert!(
            encoded.starts_with("{\"fields\":{\"firstStep\":\"\",\"objective\":\"\"},\"groupId\":")
        );
    }

    #[test]
    fn versions_keys_destinations_and_invalid_resources_never_write() {
        let db = fixture();
        let before = snapshot(&db);
        let mut cases = Vec::new();
        cases.push((input("missing"), "TEMPLATE_NOT_FOUND"));
        let mut r = input("development");
        r.schema_version = 2;
        cases.push((r, "TEMPLATE_VERSION_UNSUPPORTED"));
        let mut r = input("development");
        r.template_revision = 2;
        cases.push((r, "TEMPLATE_VERSION_UNSUPPORTED"));
        let mut r = input("development");
        r.group_id = Uuid::new_v4().to_string();
        cases.push((r, "GROUP_NOT_FOUND"));
        let mut r = input("development");
        r.fields.insert("unknown".into(), "x".into());
        cases.push((r, "INVALID_FIELD"));
        let mut r = resource_input();
        r.slots.push(r.slots[0].clone());
        cases.push((r, "INVALID_FIELD"));
        let mut r = resource_input();
        r.slots[0].key = "unknown".into();
        cases.push((r, "INVALID_FIELD"));
        let mut r = resource_input();
        r.slots[0].omitted = true;
        cases.push((r, "INVALID_PIECE"));
        let mut r = resource_input();
        r.slots[0].piece.as_mut().unwrap().kind = "folder".into();
        cases.push((r, "INVALID_PIECE"));
        for (request, expected) in cases {
            code(preview(&db, request.clone()), expected);
            code(create(&db, request), expected);
            assert_eq!(snapshot(&db), before);
        }
        for payload in [
            json!({"urls": []}),
            json!({"urls": [7]}),
            json!({"urls": ["javascript:alert(1)"]}),
            json!({"urls": ["https://example.com"], "extra": true}),
        ] {
            let mut r = resource_input();
            r.slots[0].piece.as_mut().unwrap().payload = payload;
            code(create(&db, r), "INVALID_PIECE");
        }
        let mut r = resource_input();
        r.slots.push(SlotInput {
            key: "material".into(),
            omitted: false,
            piece: Some(TemplatePiece {
                kind: "file".into(),
                name: "Missing".into(),
                payload: json!({"path": "relative.txt"}),
            }),
        });
        code(create(&db, r), "INVALID_PIECE");
        assert_eq!(snapshot(&db), before);
    }

    #[test]
    fn limits_accept_exact_unicode_and_reject_excess_without_truncation() {
        let db = fixture();
        let mut r = input("development");
        r.name = "é".repeat(80);
        r.fields
            .insert("objective".into(), "\u{10ffff}".repeat(1000));
        assert_eq!(preview(&db, r.clone()).unwrap().name.chars().count(), 80);
        r.name.push('é');
        code(create(&db, r.clone()), "INVALID_FIELD");
        r.name = "ok".into();
        r.fields.get_mut("objective").unwrap().push('a');
        code(create(&db, r), "INVALID_FIELD");
        for text in ["", " \r\n\t\u{2003}"] {
            let mut r = input("development");
            r.name = text.into();
            code(create(&db, r), "INVALID_FIELD");
        }
        let mut r = input("development");
        r.fields
            .insert("objective".into(), " ".repeat(MAX_FIELD_BYTES));
        assert!(preview(&db, r.clone()).unwrap().fields["objective"].is_empty());
        r.fields.get_mut("objective").unwrap().push(' ');
        code(create(&db, r), "INVALID_FIELD");
        let mut r = resource_input();
        let base = serde_json::to_vec(&r).unwrap().len();
        let urls = &mut r.slots[0].piece.as_mut().unwrap().payload["urls"][0];
        *urls = json!(format!(
            "https://example.com{}",
            "/".repeat(MAX_ENVELOPE - base)
        ));
        assert_eq!(serde_json::to_vec(&r).unwrap().len(), MAX_ENVELOPE);
        preview(&db, r.clone()).unwrap();
        let urls = &mut r.slots[0].piece.as_mut().unwrap().payload["urls"][0];
        *urls = json!(format!("{}/", urls.as_str().unwrap()));
        code(create(&db, r), "INVALID_FIELD");
        assert_eq!(count(&db, "espacio"), 0);
    }

    #[test]
    fn strict_wire_contract_and_sanitized_errors() {
        let valid = serde_json::to_value(resource_input()).unwrap();
        decode::<TemplateInput>(valid.clone()).unwrap();
        for key in valid.as_object().unwrap().keys() {
            let mut missing = valid.clone();
            missing.as_object_mut().unwrap().remove(key);
            code(decode::<TemplateInput>(missing), "INVALID_FIELD");
        }
        let mut extra = valid.clone();
        extra["definition"] = json!({});
        code(decode::<TemplateInput>(extra), "INVALID_FIELD");
        let mut extra = valid.clone();
        extra["slots"][0]["pieceId"] = json!(GROUP);
        code(decode::<TemplateInput>(extra), "INVALID_FIELD");
        let mut missing = valid.clone();
        missing["slots"][0].as_object_mut().unwrap().remove("piece");
        code(decode::<TemplateInput>(missing), "INVALID_FIELD");
        for bad in [json!(-1), json!(1.5), json!("1"), json!(null)] {
            let mut r = valid.clone();
            r["schemaVersion"] = bad;
            code(decode::<TemplateInput>(r), "INVALID_FIELD");
        }
        let db = fixture();
        let created = create(&db, resource_input()).unwrap();
        let output = serde_json::to_value(created).unwrap();
        assert_eq!(output.as_object().unwrap().len(), 2);
        assert_eq!(output["preparation"].as_object().unwrap().len(), 6);
        assert_eq!(
            output["preparation"]["slots"][0].as_object().unwrap().len(),
            8
        );
        assert!(output["space"]["botActive"].is_boolean());
        assert_eq!(
            serde_json::to_value(error("STORAGE_ERROR"))
                .unwrap()
                .as_object()
                .unwrap()
                .len(),
            2
        );
        let e = invalid("INVALID_FIELD", "fields");
        assert_eq!(serde_json::to_value(e).unwrap()["field"], "fields");
        for bad in ["", "bad", "00000000000040008000000000000001"] {
            code(get(&db, bad), "INVALID_FIELD");
            let mut r = input("development");
            r.request_id = bad.into();
            code(create(&db, r), "INVALID_FIELD");
        }
    }

    #[test]
    fn rollback_at_every_materialization_stage_preserves_all_tables() {
        for (table, condition) in [
            ("espacio_preparacion", "1"),
            ("preparacion_sugerencia", "NEW.orden = 1"),
            ("pieza", "NEW.orden = 1"),
        ] {
            let db = fixture();
            let file = LocalFile::new();
            let mut r = resource_input();
            r.slots.push(SlotInput {
                key: "material".into(),
                omitted: false,
                piece: Some(file.piece()),
            });
            db.execute_batch(&format!("CREATE TRIGGER fail_insert BEFORE INSERT ON {table} WHEN {condition} BEGIN SELECT RAISE(ABORT, 'private failure'); END;")).unwrap();
            let before = snapshot(&db);
            let e = create(&db, r.clone()).unwrap_err();
            assert_eq!(e.code, "STORAGE_ERROR");
            assert!(!e.message.contains("private failure"));
            assert_eq!(snapshot(&db), before);
            assert!(db.is_autocommit());
            db.execute_batch("DROP TRIGGER fail_insert;").unwrap();
            assert_eq!(
                create(&db, r)
                    .unwrap()
                    .preparation
                    .slots
                    .iter()
                    .filter(|s| s.piece_id.is_some())
                    .count(),
                2
            );
        }
    }

    #[test]
    fn resolve_retry_omit_unomit_and_cas_are_atomic() {
        let db = fixture();
        let created = create(&db, input("research")).unwrap();
        let request = resolution(&created.preparation, "sources", Some(web()), false);
        let saved = resolve(&db, request.clone()).unwrap();
        assert_eq!(saved.revision, 2);
        assert_eq!(saved.slots[0].revision, 2);
        let before = snapshot(&db);
        assert_eq!(resolve(&db, request.clone()).unwrap(), saved);
        assert_eq!(snapshot(&db), before);
        let mut different = request.clone();
        different.piece.as_mut().unwrap().name = "Otra".into();
        code(resolve(&db, different), "SLOT_STATE_CONFLICT");
        code(
            resolve(&db, resolution(&saved, "sources", None, true)),
            "SLOT_STATE_CONFLICT",
        );
        let omitted = resolve(&db, resolution(&saved, "material", None, true)).unwrap();
        assert!(omitted.slots[1].omitted);
        assert_eq!(count(&db, "pieza"), 1);
        let pending = resolve(&db, resolution(&omitted, "material", None, false)).unwrap();
        assert!(!pending.slots[1].omitted);
        code(
            update(
                &db,
                UpdatePreparation {
                    space_id: saved.space_id.clone(),
                    expected_revision: 1,
                    fields: Fields::new(),
                    hidden: true,
                },
            ),
            "REVISION_CONFLICT",
        );
        let edited = update(
            &db,
            UpdatePreparation {
                space_id: saved.space_id.clone(),
                expected_revision: pending.revision,
                fields: [("question".into(), PRIVATE.into())].into(),
                hidden: true,
            },
        )
        .unwrap();
        assert!(edited.hidden);
        assert_eq!(edited.fields["question"], PRIVATE);
        assert_eq!(count(&db, "pack_pieza"), 0);
        assert_eq!(count(&db, "cierre"), 0);
        assert!(paravel_context::ui::list_pieces(&db, &saved.space_id)
            .unwrap()
            .iter()
            .all(|p| !p.marked));
    }

    #[test]
    fn resolution_failures_roll_back_piece_and_parent_revision() {
        let db = fixture();
        let created = create(&db, input("research")).unwrap();
        db.execute_batch("CREATE TRIGGER fail_resolve BEFORE UPDATE ON preparacion_sugerencia BEGIN SELECT RAISE(ABORT, 'failure'); END;").unwrap();
        let before = snapshot(&db);
        code(
            resolve(
                &db,
                resolution(&created.preparation, "sources", Some(web()), false),
            ),
            "STORAGE_ERROR",
        );
        assert_eq!(snapshot(&db), before);
        db.execute_batch("DROP TRIGGER fail_resolve;").unwrap();
        db.execute_batch("CREATE TRIGGER fail_parent BEFORE UPDATE ON espacio_preparacion BEGIN SELECT RAISE(ABORT, 'failure'); END;").unwrap();
        code(
            resolve(
                &db,
                resolution(&created.preparation, "sources", Some(web()), false),
            ),
            "STORAGE_ERROR",
        );
        assert_eq!(snapshot(&db), before);
        code(
            update(
                &db,
                UpdatePreparation {
                    space_id: created.space.id,
                    expected_revision: 1,
                    fields: Fields::new(),
                    hidden: true,
                },
            ),
            "STORAGE_ERROR",
        );
        assert_eq!(snapshot(&db), before);
    }

    #[test]
    fn deleted_piece_invalidates_cas_and_resolution_replay_checks_original_digest() {
        let db = fixture();
        let file = LocalFile::new();
        let p = create(&db, input("client")).unwrap().preparation;
        let request = resolution(&p, "materials", Some(file.piece()), false);
        let saved = resolve(&db, request.clone()).unwrap();
        std::fs::remove_file(&file.0).unwrap();
        assert_eq!(resolve(&db, request.clone()).unwrap(), saved);
        let piece_id = saved.slots[0].piece_id.as_ref().unwrap();
        db.execute(
            "UPDATE pieza SET nombre = 'Editada' WHERE id = ?1",
            [piece_id],
        )
        .unwrap();
        code(resolve(&db, request.clone()), "SLOT_STATE_CONFLICT");
        db.execute("DELETE FROM pieza WHERE id = ?1", [piece_id])
            .unwrap();
        let pending = get(&db, &p.space_id).unwrap().unwrap();
        assert_eq!(pending.slots[0].revision, saved.slots[0].revision + 1);
        assert_eq!(pending.revision, saved.revision + 1);
        assert!(pending.slots[0].piece_id.is_none());
        code(resolve(&db, request), "REVISION_CONFLICT");
        code(
            resolve(
                &db,
                resolution(&saved, "materials", Some(file.piece()), false),
            ),
            "REVISION_CONFLICT",
        );
        assert_eq!(count(&db, "pieza"), 0);
    }

    #[test]
    fn foreign_slot_piece_moves_and_cascades_are_isolated() {
        let db = fixture();
        let a = create(&db, resource_input()).unwrap();
        let b = create(&db, resource_input()).unwrap();
        let mut request = resolution(&a.preparation, "sources", None, true);
        request.space_id = b.space.id.clone();
        code(resolve(&db, request), "SLOT_STATE_CONFLICT");
        assert!(db
            .execute(
                "UPDATE preparacion_sugerencia SET pieza_id = ?1 WHERE id = ?2",
                params![a.preparation.slots[0].piece_id, b.preparation.slots[0].id]
            )
            .is_err());
        assert!(db
            .execute(
                "UPDATE pieza SET espacio_id = ?1 WHERE id = ?2",
                params![b.space.id, a.preparation.slots[0].piece_id]
            )
            .is_err());
        db.execute("DELETE FROM espacio WHERE id = ?1", [&a.space.id])
            .unwrap();
        assert!(get(&db, &a.space.id).unwrap().is_none());
        assert_eq!(get(&db, &b.space.id).unwrap().unwrap(), b.preparation);
        db.execute("DELETE FROM grupo WHERE id = ?1", [GROUP])
            .unwrap();
        for table in [
            "espacio",
            "pieza",
            "espacio_preparacion",
            "preparacion_sugerencia",
        ] {
            assert_eq!(count(&db, table), 0);
        }
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| r
                .get::<_, i64>(
                0
            ))
            .unwrap(),
            0
        );
    }

    #[test]
    fn migration_is_repeatable_atomic_and_preserves_legacy_data() {
        let db = fixture();
        let p = create(&db, resource_input()).unwrap();
        let before = snapshot(&db);
        crate::db::migrate(&db).unwrap();
        crate::db::migrate(&db).unwrap();
        assert_eq!(snapshot(&db), before);
        assert_eq!(get(&db, &p.space.id).unwrap().unwrap(), p.preparation);
        let db = fixture();
        db.execute_batch("DROP TABLE preparacion_sugerencia; DROP TABLE espacio_preparacion; CREATE TABLE idx_preparacion_pieza (id INTEGER);").unwrap();
        assert!(migrate(&db).is_err());
        assert!(db.is_autocommit());
        assert_eq!(db.query_row("SELECT COUNT(*) FROM sqlite_master WHERE name IN ('espacio_preparacion', 'preparacion_sugerencia')", [], |r| r.get::<_, i64>(0)).unwrap(), 0);
        db.execute_batch("DROP TABLE idx_preparacion_pieza;")
            .unwrap();
        migrate(&db).unwrap();
        assert_eq!(count(&db, "grupo"), 1);
    }

    #[test]
    fn disk_reopen_and_real_context_reader_exclude_private_preparation() {
        let disk = Disk::new();
        let request = resource_input();
        let saved;
        let before;
        {
            let db = Connection::open(&disk.0).unwrap();
            setup(&db);
            saved = create(&db, request.clone()).unwrap();
            let reader = paravel_context::Reader::open(&disk.0, &saved.space.id).unwrap();
            before = vec![
                reader.leer_espacio().unwrap(),
                reader.listar_piezas(None, None).unwrap(),
            ];
            update(
                &db,
                UpdatePreparation {
                    space_id: saved.space.id.clone(),
                    expected_revision: 1,
                    fields: [("question".into(), PRIVATE.into())].into(),
                    hidden: true,
                },
            )
            .unwrap();
            assert_eq!(
                vec![
                    reader.leer_espacio().unwrap(),
                    reader.listar_piezas(None, None).unwrap()
                ],
                before
            );
            assert!(reader
                .leer_contexto_pieza(saved.preparation.slots[0].piece_id.as_ref().unwrap())
                .is_err());
            assert!(!serde_json::to_string(&before).unwrap().contains(PRIVATE));
        }
        let state = crate::db::open(disk.0.clone()).unwrap();
        let db = state.db.lock().unwrap();
        assert_eq!(create(&db, request).unwrap().space.id, saved.space.id);
        assert_eq!(
            get(&db, &saved.space.id).unwrap().unwrap().fields["question"],
            PRIVATE
        );
        let reader = paravel_context::Reader::open(&disk.0, &saved.space.id).unwrap();
        assert_eq!(
            vec![
                reader.leer_espacio().unwrap(),
                reader.listar_piezas(None, None).unwrap()
            ],
            before
        );
    }

    #[test]
    fn concurrent_creations_and_updates_serialize_without_duplicates() {
        let disk = Disk::new();
        let db = Connection::open(&disk.0).unwrap();
        setup(&db);
        let request = resource_input();
        let barrier = Arc::new(Barrier::new(2));
        let handles: Vec<_> = (0..2)
            .map(|_| {
                let path = disk.0.clone();
                let request = request.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    let db = Connection::open(path).unwrap();
                    db.execute_batch("PRAGMA foreign_keys = ON").unwrap();
                    barrier.wait();
                    create(&db, request)
                })
            })
            .collect();
        let results: Vec<_> = handles
            .into_iter()
            .map(|h| h.join().unwrap().unwrap())
            .collect();
        assert_eq!(results[0].space.id, results[1].space.id);
        assert_eq!(count(&db, "espacio"), 1);
        assert_eq!(count(&db, "pieza"), 1);
        let barrier = Arc::new(Barrier::new(2));
        let handles: Vec<_> = (0..2)
            .map(|_| {
                let path = disk.0.clone();
                let space_id = results[0].space.id.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    let db = Connection::open(path).unwrap();
                    db.execute_batch("PRAGMA foreign_keys = ON").unwrap();
                    barrier.wait();
                    update(
                        &db,
                        UpdatePreparation {
                            space_id,
                            expected_revision: 1,
                            fields: Fields::new(),
                            hidden: true,
                        },
                    )
                })
            })
            .collect();
        let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
        assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
        assert_eq!(
            results.iter().find_map(|r| r.as_ref().err()).unwrap().code,
            "REVISION_CONFLICT"
        );
    }

    #[test]
    fn retired_catalog_replays_and_edits_use_only_the_persisted_definition() {
        let db = fixture();
        let mut request = input("development");
        let saved = create(&db, request.clone()).unwrap();
        let mut retired = saved.preparation.template.clone();
        retired.template_id = "retired-development".into();
        retired.revision = 7;
        retired.fields[0].key = "retiredObjective".into();
        retired.slots[0].label = "Etiqueta histórica".into();
        request.template_id = retired.template_id.clone();
        request.template_revision = retired.revision;
        let normalized = normalize(request.clone(), &retired).unwrap();
        db.execute_batch("DROP TRIGGER preparacion_receipt_immutable;")
            .unwrap();
        db.execute("UPDATE espacio_preparacion SET template_id = ?1, template_revision = ?2, definition_snapshot = ?3, field_values = ?4, creation_fingerprint = ?5 WHERE espacio_id = ?6", params![retired.template_id, retired.revision, serde_json::to_string(&retired).unwrap(), serde_json::to_string(&normalized.fields).unwrap(), fingerprint(&normalized).unwrap(), saved.space.id]).unwrap();
        migrate(&db).unwrap();
        code(preview(&db, request.clone()), "TEMPLATE_NOT_FOUND");
        let replayed = create(&db, request).unwrap();
        assert_eq!(replayed.space.id, saved.space.id);
        assert_eq!(replayed.preparation.template, retired);
        let updated = update(
            &db,
            UpdatePreparation {
                space_id: saved.space.id,
                expected_revision: 1,
                fields: [("retiredObjective".into(), PRIVATE.into())].into(),
                hidden: false,
            },
        )
        .unwrap();
        assert_eq!(updated.template, retired);
        assert_eq!(updated.fields["retiredObjective"], PRIVATE);
        assert_eq!(updated.slots[0].label, "Etiqueta histórica");
    }

    #[test]
    fn existing_validators_cover_all_allowed_kinds_and_distinct_firefox_contracts() {
        let db = fixture();
        let file = LocalFile::new();
        for kind in ["vscode", "cursor", "folder"] {
            let mut r = input("development");
            r.slots.push(SlotInput {
                key: "workspace".into(),
                omitted: false,
                piece: Some(TemplatePiece {
                    kind: kind.into(),
                    name: "Carpeta".into(),
                    payload: json!({"path": file.0.parent().unwrap()}),
                }),
            });
            let saved = create(&db, r).unwrap();
            let pieces = paravel_context::ui::list_pieces(&db, &saved.space.id).unwrap();
            assert_eq!(pieces[0].kind, kind);
            assert!(!pieces[0].marked);
        }
        let local_url = url::Url::from_file_path(&file.0).unwrap().to_string();
        let mut r = resource_input();
        r.slots[0].piece.as_mut().unwrap().payload = json!({"urls": [&local_url]});
        code(preview(&db, r.clone()), "INVALID_PIECE");
        r.slots[0].piece.as_mut().unwrap().kind = "firefox-group".into();
        let saved = create(&db, r.clone()).unwrap();
        std::fs::remove_file(&file.0).unwrap();
        code(preview(&db, r.clone()), "INVALID_PIECE");
        assert_eq!(create(&db, r.clone()).unwrap().space.id, saved.space.id);
        r.request_id = Uuid::new_v4().to_string();
        code(create(&db, r), "INVALID_PIECE");
        for kind in ["file", "firefox-group"] {
            let script = file.0.with_extension("ps1");
            std::fs::write(&script, b"synthetic script fixture").unwrap();
            let mut r = if kind == "file" {
                input("client")
            } else {
                resource_input()
            };
            r.slots = vec![SlotInput {
                key: if kind == "file" {
                    "materials"
                } else {
                    "sources"
                }
                .into(),
                omitted: false,
                piece: Some(TemplatePiece {
                    kind: kind.into(),
                    name: "Script".into(),
                    payload: if kind == "file" {
                        json!({"path": script})
                    } else {
                        json!({"urls": [url::Url::from_file_path(&script).unwrap().to_string()]})
                    },
                }),
            }];
            code(create(&db, r), "INVALID_PIECE");
        }
    }

    #[test]
    fn concurrent_resolution_replays_one_piece_and_stale_omission_conflicts() {
        let disk = Disk::new();
        let db = Connection::open(&disk.0).unwrap();
        setup(&db);
        let saved = create(&db, input("research")).unwrap();
        let request = resolution(&saved.preparation, "sources", Some(web()), false);
        let barrier = Arc::new(Barrier::new(2));
        let handles: Vec<_> = (0..2)
            .map(|_| {
                let path = disk.0.clone();
                let request = request.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    let db = Connection::open(path).unwrap();
                    db.execute_batch("PRAGMA foreign_keys = ON").unwrap();
                    barrier.wait();
                    resolve(&db, request)
                })
            })
            .collect();
        let results: Vec<_> = handles
            .into_iter()
            .map(|h| h.join().unwrap().unwrap())
            .collect();
        assert_eq!(results[0], results[1]);
        assert_eq!(count(&db, "pieza"), 1);
        let omit = resolution(&results[0], "material", None, true);
        let omitted = resolve(&db, omit.clone()).unwrap();
        assert_eq!(resolve(&db, omit.clone()).unwrap(), omitted);
        let pending = resolve(&db, resolution(&omitted, "material", None, false)).unwrap();
        code(resolve(&db, omit), "REVISION_CONFLICT");
        assert!(!pending.slots[1].omitted);
    }

    #[test]
    fn preview_revalidates_destination_and_paths_at_commit_and_receipt_expires_on_delete() {
        let db = fixture();
        let file = LocalFile::new();
        let mut request = input("client");
        request.slots.push(SlotInput {
            key: "materials".into(),
            omitted: false,
            piece: Some(file.piece()),
        });
        preview(&db, request.clone()).unwrap();
        std::fs::remove_file(&file.0).unwrap();
        code(create(&db, request), "INVALID_PIECE");
        let request = resource_input();
        preview(&db, request.clone()).unwrap();
        db.execute("DELETE FROM grupo WHERE id = ?1", [GROUP])
            .unwrap();
        code(create(&db, request.clone()), "GROUP_NOT_FOUND");
        assert_eq!(count(&db, "espacio"), 0);
        db.execute(
            "INSERT INTO grupo VALUES (?1, 'Grupo', 'folder', 0, '1', '1')",
            [GROUP],
        )
        .unwrap();
        let saved = create(&db, request.clone()).unwrap();
        db.execute("DELETE FROM espacio WHERE id = ?1", [&saved.space.id])
            .unwrap();
        let recreated = create(&db, request).unwrap();
        assert_ne!(recreated.space.id, saved.space.id);
        assert_eq!(count(&db, "espacio_preparacion"), 1);
    }

    #[test]
    fn busy_readonly_and_revision_bounds_fail_safely() {
        let disk = Disk::new();
        let db = Connection::open(&disk.0).unwrap();
        setup(&db);
        let saved = create(&db, input("research")).unwrap();
        db.busy_timeout(Duration::from_millis(20)).unwrap();
        let lock = Connection::open(&disk.0).unwrap();
        let tx = Transaction::new_unchecked(&lock, TransactionBehavior::Exclusive).unwrap();
        code(create(&db, input("research")), "DB_BUSY");
        code(get(&db, &saved.space.id), "DB_BUSY");
        tx.rollback().unwrap();
        let readonly =
            Connection::open_with_flags(&disk.0, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
        code(create(&readonly, input("research")), "STORAGE_ERROR");
        code(
            update(
                &readonly,
                UpdatePreparation {
                    space_id: saved.space.id.clone(),
                    expected_revision: 1,
                    fields: Fields::new(),
                    hidden: true,
                },
            ),
            "STORAGE_ERROR",
        );
        for expected_revision in [0, -1, MAX_REVISION, i64::MAX] {
            code(
                update(
                    &db,
                    UpdatePreparation {
                        space_id: saved.space.id.clone(),
                        expected_revision,
                        fields: Fields::new(),
                        hidden: true,
                    },
                ),
                "INVALID_FIELD",
            );
            let mut r = resolution(&saved.preparation, "sources", Some(web()), false);
            r.expected_revision = expected_revision;
            code(resolve(&db, r), "INVALID_FIELD");
        }
        assert_eq!(
            get(&db, &saved.space.id).unwrap().unwrap(),
            saved.preparation
        );
    }
}
