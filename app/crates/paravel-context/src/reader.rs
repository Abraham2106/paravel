use rusqlite::{
    params,
    types::{Type, ValueRef},
    Connection, OpenFlags, OptionalExtension, Row,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{path::Path, time::Duration};
use uuid::Uuid;

const MAX_BYTES: usize = 256 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReadError {
    InvalidArgument,
    NotFoundOrNotVisible,
    ContextTooLarge,
    InvalidStoredData,
    DatabaseUnavailable,
    SchemaUnsupported,
}

impl ReadError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidArgument => "INVALID_ARGUMENT",
            Self::NotFoundOrNotVisible => "NOT_FOUND_OR_NOT_VISIBLE",
            Self::ContextTooLarge => "CONTEXT_TOO_LARGE",
            Self::InvalidStoredData => "INVALID_STORED_DATA",
            Self::DatabaseUnavailable => "DATABASE_UNAVAILABLE",
            Self::SchemaUnsupported => "SCHEMA_UNSUPPORTED",
        }
    }

    pub fn message(&self) -> &'static str {
        match self {
            Self::InvalidArgument => "Los argumentos no son válidos.",
            Self::NotFoundOrNotVisible => "El contexto no existe o no está compartido.",
            Self::ContextTooLarge => "El contexto supera el límite de respuesta.",
            Self::InvalidStoredData => "El contexto guardado no es válido.",
            Self::DatabaseUnavailable => "El contexto no está disponible. Intente de nuevo.",
            Self::SchemaUnsupported => {
                "El modelo de datos no es compatible. Abra Paravel para actualizarlo."
            }
        }
    }
}

impl std::fmt::Display for ReadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code(), self.message())
    }
}

impl std::error::Error for ReadError {}

fn db_error(error: rusqlite::Error) -> ReadError {
    match error {
        rusqlite::Error::FromSqlConversionFailure(_, _, error) => error
            .downcast_ref::<ReadError>()
            .copied()
            .unwrap_or(ReadError::InvalidStoredData),
        rusqlite::Error::InvalidColumnType(..) | rusqlite::Error::IntegralValueOutOfRange(..) => {
            ReadError::InvalidStoredData
        }
        _ => ReadError::DatabaseUnavailable,
    }
}

fn text(row: &Row<'_>, index: usize) -> rusqlite::Result<String> {
    let result = match row.get_ref(index)? {
        ValueRef::Text(bytes) if bytes.len() > MAX_BYTES => Err(ReadError::ContextTooLarge),
        ValueRef::Text(bytes) => std::str::from_utf8(bytes)
            .map(str::to_owned)
            .map_err(|_| ReadError::InvalidStoredData),
        _ => Err(ReadError::InvalidStoredData),
    };
    result.map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(index, Type::Text, Box::new(error))
    })
}

fn optional_text(row: &Row<'_>, index: usize) -> rusqlite::Result<Option<String>> {
    if matches!(row.get_ref(index)?, ValueRef::Null) {
        Ok(None)
    } else {
        text(row, index).map(Some)
    }
}

fn uuid(raw: &str) -> Result<String, ReadError> {
    if raw.len() != 36
        || !raw.bytes().enumerate().all(|(index, byte)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                byte == b'-'
            } else {
                byte.is_ascii_hexdigit()
            }
        })
    {
        return Err(ReadError::InvalidArgument);
    }
    Uuid::parse_str(raw)
        .map(|id| id.to_string())
        .map_err(|_| ReadError::InvalidArgument)
}

fn stored_uuid(raw: &str) -> Result<(), ReadError> {
    if uuid(raw).is_ok_and(|id| id == raw) {
        Ok(())
    } else {
        Err(ReadError::InvalidStoredData)
    }
}

fn bounded(value: Value) -> Result<Value, ReadError> {
    let serialized = serde_json::to_string(&value).map_err(|_| ReadError::InvalidStoredData)?;
    if serialized.len() > MAX_BYTES {
        return Err(ReadError::ContextTooLarge);
    }
    let result = json!({"content": [{"type": "text", "text": serialized}], "structuredContent": &value, "isError": false});
    if serde_json::to_vec(&result)
        .map_err(|_| ReadError::InvalidStoredData)?
        .len()
        > MAX_BYTES
    {
        Err(ReadError::ContextTooLarge)
    } else {
        Ok(value)
    }
}

fn validate_schema(db: &Connection) -> Result<(), ReadError> {
    for (table, required) in [
        ("grupo", &[("id", "TEXT", 1), ("nombre", "TEXT", 0)][..]),
        (
            "espacio",
            &[
                ("id", "TEXT", 1),
                ("grupo_id", "TEXT", 0),
                ("nombre", "TEXT", 0),
                ("nota", "TEXT", 0),
            ][..],
        ),
        (
            "pieza",
            &[
                ("id", "TEXT", 1),
                ("espacio_id", "TEXT", 0),
                ("nombre", "TEXT", 0),
                ("kind", "TEXT", 0),
                ("payload", "TEXT", 0),
                ("orden", "INTEGER", 0),
            ][..],
        ),
        (
            "pack_pieza",
            &[("espacio_id", "TEXT", 1), ("pieza_id", "TEXT", 2)][..],
        ),
    ] {
        let ordinary: bool = db.query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_list WHERE schema='main' AND name=?1 AND type='table')",
            [table], |row| row.get(0),
        ).map_err(db_error)?;
        if !ordinary {
            return Err(ReadError::SchemaUnsupported);
        }
        let mut statement = db
            .prepare("SELECT name, type, pk FROM pragma_table_info(?1, 'main')")
            .map_err(db_error)?;
        let columns = statement
            .query_map([table], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, u32>(2)?,
                ))
            })
            .map_err(db_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db_error)?;
        if required.iter().any(|(name, kind, pk)| {
            !columns.iter().any(|column| {
                column.0 == *name && column.1.eq_ignore_ascii_case(kind) && column.2 == *pk
            })
        }) || columns.iter().filter(|column| column.2 != 0).count()
            != required.iter().filter(|column| column.2 != 0).count()
        {
            return Err(ReadError::SchemaUnsupported);
        }
    }
    Ok(())
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Cursor {
    version: u8,
    space: String,
    order: i64,
    id: String,
}

pub struct Reader {
    db: Connection,
    space: String,
}

impl Reader {
    pub fn open(path: &Path, space: &str) -> Result<Self, ReadError> {
        let space = uuid(space)?;
        if !path.is_absolute() {
            return Err(ReadError::InvalidArgument);
        }
        let db = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(db_error)?;
        db.busy_timeout(Duration::from_secs(2)).map_err(db_error)?;
        validate_schema(&db)?;
        Ok(Self { db, space })
    }

    pub fn leer_espacio(&self) -> Result<Value, ReadError> {
        let result = self
            .db
            .query_row(
                "SELECT e.id, e.nombre, g.nombre,
             CASE WHEN length(CAST(e.nota AS BLOB)) <= ?2 THEN e.nota END,
             COALESCE(length(CAST(e.nota AS BLOB)),0),
             (SELECT COUNT(*) FROM pieza p JOIN pack_pieza pp ON pp.pieza_id=p.id
              AND pp.espacio_id=p.espacio_id WHERE p.espacio_id=e.id)
             FROM espacio e JOIN grupo g ON g.id=e.grupo_id WHERE e.id=?1",
                params![self.space, MAX_BYTES as i64],
                |row| {
                    Ok((
                        text(row, 0)?,
                        text(row, 1)?,
                        text(row, 2)?,
                        optional_text(row, 3)?,
                        row.get::<_, i64>(4)?,
                        row.get::<_, i64>(5)?,
                    ))
                },
            )
            .optional()
            .map_err(db_error)?
            .ok_or(ReadError::NotFoundOrNotVisible)?;
        if result.4 > MAX_BYTES as i64 {
            return Err(ReadError::ContextTooLarge);
        }
        stored_uuid(&result.0)?;
        bounded(
            json!({"id":result.0,"nombre":result.1,"grupo":result.2,"nota":result.3,"piezas_compartidas":result.5}),
        )
    }

    pub fn listar_piezas(
        &self,
        limit: Option<u32>,
        cursor: Option<&str>,
    ) -> Result<Value, ReadError> {
        let limit = limit.unwrap_or(50);
        if !(1..=100).contains(&limit) {
            return Err(ReadError::InvalidArgument);
        }
        let after = match cursor {
            None => None,
            Some(raw) => {
                if raw.is_empty() || raw.len() > 1024 {
                    return Err(ReadError::InvalidArgument);
                }
                let decoded: Cursor =
                    serde_json::from_str(raw).map_err(|_| ReadError::InvalidArgument)?;
                if decoded.version != 1
                    || decoded.space != self.space
                    || uuid(&decoded.id)? != decoded.id
                {
                    return Err(ReadError::InvalidArgument);
                }
                Some(decoded)
            }
        };
        let mut stmt = self
            .db
            .prepare(
                "SELECT p.id,p.nombre,p.kind,p.orden FROM pieza p
             JOIN pack_pieza pp ON pp.pieza_id=p.id AND pp.espacio_id=p.espacio_id
             JOIN espacio e ON e.id=p.espacio_id
             WHERE p.espacio_id=?1 AND (?2 IS NULL OR (p.orden,p.id)>(?2,?3))
             ORDER BY p.orden,p.id LIMIT ?4",
            )
            .map_err(db_error)?;
        let rows = stmt
            .query_map(
                params![
                    self.space,
                    after.as_ref().map(|c| c.order),
                    after.as_ref().map(|c| c.id.as_str()),
                    limit + 1
                ],
                |row| {
                    Ok((
                        text(row, 0)?,
                        text(row, 1)?,
                        text(row, 2)?,
                        row.get::<_, i64>(3)?,
                    ))
                },
            )
            .map_err(db_error)?;
        let mut pieces = Vec::new();
        let mut last = None;
        let mut next = None;
        let mut bytes = 0;
        for row in rows {
            let (id, nombre, kind, order) = row.map_err(db_error)?;
            if pieces.len() == limit as usize {
                next = last;
                break;
            }
            stored_uuid(&id)?;
            last = Some(
                serde_json::to_string(&Cursor {
                    version: 1,
                    space: self.space.clone(),
                    order,
                    id: id.clone(),
                })
                .map_err(|_| ReadError::InvalidStoredData)?,
            );
            let piece = json!({"id": id, "nombre": nombre, "kind": kind});
            bytes += serde_json::to_vec(&piece)
                .map_err(|_| ReadError::InvalidStoredData)?
                .len();
            if bytes > MAX_BYTES {
                return Err(ReadError::ContextTooLarge);
            }
            pieces.push(piece);
        }
        bounded(json!({"piezas":pieces,"cursor_siguiente":next}))
    }

    pub fn leer_contexto_pieza(&self, id: &str) -> Result<Value, ReadError> {
        let id = uuid(id)?;
        let row = self
            .db
            .query_row(
                "SELECT p.id,p.nombre,p.kind,
             CASE WHEN length(CAST(p.payload AS BLOB)) <= ?3 THEN p.payload END,
             length(CAST(p.payload AS BLOB)) FROM pieza p
             JOIN pack_pieza pp ON pp.pieza_id=p.id AND pp.espacio_id=p.espacio_id
             JOIN espacio e ON e.id=p.espacio_id
             WHERE p.espacio_id=?1 AND p.id=?2",
                params![self.space, id, MAX_BYTES as i64],
                |row| {
                    Ok((
                        text(row, 0)?,
                        text(row, 1)?,
                        text(row, 2)?,
                        optional_text(row, 3)?,
                        row.get::<_, i64>(4)?,
                    ))
                },
            )
            .optional()
            .map_err(db_error)?
            .ok_or(ReadError::NotFoundOrNotVisible)?;
        if row.4 > MAX_BYTES as i64 {
            return Err(ReadError::ContextTooLarge);
        }
        stored_uuid(&row.0)?;
        let payload: Value =
            serde_json::from_str(row.3.as_deref().ok_or(ReadError::InvalidStoredData)?)
                .map_err(|_| ReadError::InvalidStoredData)?;
        bounded(json!({"id":row.0,"nombre":row.1,"kind":row.2,"payload":payload}))
    }
}

#[cfg(test)]
#[path = "reader_tests.rs"]
mod tests;
