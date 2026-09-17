use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;

use super::stored_group_icon;

pub const MAX_NAVIGATION_ENTITIES: usize = 20_000;
pub const MAX_NAVIGATION_BYTES: usize = 8 * 1024 * 1024;
pub const NAVIGATION_CATALOG_EXCEEDED: &str = "NAVIGATION_CATALOG_EXCEEDED";
pub const NAVIGATION_INCONSISTENT: &str = "NAVIGATION_INCONSISTENT";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NavigationGroup {
    pub id: String,
    pub name: String,
    pub icon: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NavigationSpace {
    pub id: String,
    pub group_id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NavigationPiece {
    pub id: String,
    pub space_id: String,
    pub name: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NavigationCatalog {
    pub groups: Vec<NavigationGroup>,
    pub spaces: Vec<NavigationSpace>,
    pub pieces: Vec<NavigationPiece>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum NavigationTarget {
    #[serde(rename = "group", rename_all = "camelCase")]
    Group { group_id: String },
    #[serde(rename = "space", rename_all = "camelCase")]
    Space { space_id: String },
    #[serde(rename = "piece", rename_all = "camelCase")]
    Piece { piece_id: String },
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum NavigationResolved {
    #[serde(rename = "group", rename_all = "camelCase")]
    Group {
        group_id: String,
        name: String,
        icon: String,
    },
    #[serde(rename = "space", rename_all = "camelCase")]
    Space {
        space_id: String,
        group_id: String,
        name: String,
        group_name: String,
    },
    #[serde(rename = "piece", rename_all = "camelCase")]
    Piece {
        piece_id: String,
        space_id: String,
        group_id: String,
        name: String,
        kind: String,
        space_name: String,
        group_name: String,
    },
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NavigationResolve {
    pub status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<NavigationResolved>,
}

impl NavigationResolve {
    fn found(target: NavigationResolved) -> Self {
        Self {
            status: "found",
            target: Some(target),
        }
    }

    fn not_found() -> Self {
        Self {
            status: "notFound",
            target: None,
        }
    }
}

fn read_error() -> String {
    "No se pudo leer el catálogo de navegación.".to_string()
}

fn resolve_error() -> String {
    "No se pudo resolver el destino.".to_string()
}

fn parse_id(raw: &str, empty: &str) -> Result<String, String> {
    Uuid::parse_str(raw).map_err(|_| empty.to_string())?;
    Ok(raw.to_string())
}

pub fn list_navigation_catalog(db: &Connection) -> Result<NavigationCatalog, String> {
    list_navigation_catalog_bounded(db, MAX_NAVIGATION_ENTITIES, MAX_NAVIGATION_BYTES)
}

pub fn list_navigation_catalog_bounded(
    db: &Connection,
    max_entities: usize,
    max_bytes: usize,
) -> Result<NavigationCatalog, String> {
    let tx = db.unchecked_transaction().map_err(|_| read_error())?;
    let total: i64 = tx
        .query_row(
            "SELECT (SELECT COUNT(*) FROM grupo)
                  + (SELECT COUNT(*) FROM espacio)
                  + (SELECT COUNT(*) FROM pieza)",
            [],
            |row| row.get(0),
        )
        .map_err(|_| read_error())?;
    if total < 0 || total as usize > max_entities {
        return Err(NAVIGATION_CATALOG_EXCEEDED.to_string());
    }

    let mut groups_stmt = tx
        .prepare(
            "SELECT id, nombre, COALESCE(NULLIF(icono, ''), 'folder') AS icono
             FROM grupo ORDER BY id",
        )
        .map_err(|_| read_error())?;
    let groups = groups_stmt
        .query_map([], |row| {
            let icon: String = row.get(2)?;
            Ok(NavigationGroup {
                id: row.get(0)?,
                name: row.get(1)?,
                icon: stored_group_icon(&icon),
            })
        })
        .map_err(|_| read_error())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| read_error())?;
    drop(groups_stmt);
    if groups.len() > max_entities {
        return Err(NAVIGATION_CATALOG_EXCEEDED.to_string());
    }

    let mut spaces_stmt = tx
        .prepare("SELECT id, grupo_id, nombre FROM espacio ORDER BY id")
        .map_err(|_| read_error())?;
    let spaces = spaces_stmt
        .query_map([], |row| {
            Ok(NavigationSpace {
                id: row.get(0)?,
                group_id: row.get(1)?,
                name: row.get(2)?,
            })
        })
        .map_err(|_| read_error())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| read_error())?;
    drop(spaces_stmt);
    if groups.len() + spaces.len() > max_entities {
        return Err(NAVIGATION_CATALOG_EXCEEDED.to_string());
    }

    let mut pieces_stmt = tx
        .prepare("SELECT id, espacio_id, nombre, kind FROM pieza ORDER BY id")
        .map_err(|_| read_error())?;
    let pieces = pieces_stmt
        .query_map([], |row| {
            Ok(NavigationPiece {
                id: row.get(0)?,
                space_id: row.get(1)?,
                name: row.get(2)?,
                kind: row.get(3)?,
            })
        })
        .map_err(|_| read_error())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| read_error())?;
    drop(pieces_stmt);
    if groups.len() + spaces.len() + pieces.len() > max_entities {
        return Err(NAVIGATION_CATALOG_EXCEEDED.to_string());
    }

    let relations_ok = {
        let group_ids: HashSet<&str> = groups.iter().map(|group| group.id.as_str()).collect();
        let space_ids: HashSet<&str> = spaces.iter().map(|space| space.id.as_str()).collect();
        spaces
            .iter()
            .all(|space| group_ids.contains(space.group_id.as_str()))
            && pieces
                .iter()
                .all(|piece| space_ids.contains(piece.space_id.as_str()))
    };
    if !relations_ok {
        return Err(NAVIGATION_INCONSISTENT.to_string());
    }

    let catalog = NavigationCatalog {
        groups,
        spaces,
        pieces,
    };
    let encoded = serde_json::to_vec(&catalog).map_err(|_| read_error())?;
    if encoded.len() > max_bytes {
        return Err(NAVIGATION_CATALOG_EXCEEDED.to_string());
    }
    Ok(catalog)
}

pub fn resolve_navigation_target(
    db: &Connection,
    target: &NavigationTarget,
) -> Result<NavigationResolve, String> {
    match target {
        NavigationTarget::Group { group_id } => {
            parse_id(group_id, "El grupo no tiene un UUID válido.")?;
            let found = db
                .query_row(
                    "SELECT id, nombre, COALESCE(NULLIF(icono, ''), 'folder')
                     FROM grupo WHERE id = ?1",
                    [group_id],
                    |row| {
                        let icon: String = row.get(2)?;
                        Ok(NavigationResolved::Group {
                            group_id: row.get(0)?,
                            name: row.get(1)?,
                            icon: stored_group_icon(&icon),
                        })
                    },
                )
                .optional_resolve()?;
            Ok(found.map_or_else(NavigationResolve::not_found, NavigationResolve::found))
        }
        NavigationTarget::Space { space_id } => {
            parse_id(space_id, "El espacio no tiene un UUID válido.")?;
            let found = db
                .query_row(
                    "SELECT e.id, e.grupo_id, e.nombre, g.nombre
                     FROM espacio e JOIN grupo g ON g.id = e.grupo_id
                     WHERE e.id = ?1",
                    [space_id],
                    |row| {
                        Ok(NavigationResolved::Space {
                            space_id: row.get(0)?,
                            group_id: row.get(1)?,
                            name: row.get(2)?,
                            group_name: row.get(3)?,
                        })
                    },
                )
                .optional_resolve()?;
            Ok(found.map_or_else(NavigationResolve::not_found, NavigationResolve::found))
        }
        NavigationTarget::Piece { piece_id } => {
            parse_id(piece_id, "La pieza no tiene un UUID válido.")?;
            let found = db
                .query_row(
                    "SELECT p.id, p.espacio_id, e.grupo_id, p.nombre, p.kind, e.nombre, g.nombre
                     FROM pieza p
                     JOIN espacio e ON e.id = p.espacio_id
                     JOIN grupo g ON g.id = e.grupo_id
                     WHERE p.id = ?1",
                    [piece_id],
                    |row| {
                        Ok(NavigationResolved::Piece {
                            piece_id: row.get(0)?,
                            space_id: row.get(1)?,
                            group_id: row.get(2)?,
                            name: row.get(3)?,
                            kind: row.get(4)?,
                            space_name: row.get(5)?,
                            group_name: row.get(6)?,
                        })
                    },
                )
                .optional_resolve()?;
            Ok(found.map_or_else(NavigationResolve::not_found, NavigationResolve::found))
        }
    }
}

trait OptionalResolve<T> {
    fn optional_resolve(self) -> Result<Option<T>, String>;
}

impl<T> OptionalResolve<T> for rusqlite::Result<T> {
    fn optional_resolve(self) -> Result<Option<T>, String> {
        match self {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(_) => Err(resolve_error()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use serde_json::{json, Value};

    const GROUP_A: &str = "aaaaaaaa-0000-4000-8000-000000000000";
    const GROUP_B: &str = "bbbbbbbb-0000-4000-8000-000000000000";
    const GROUP_EMPTY: &str = "cccccccc-0000-4000-8000-000000000000";
    const SPACE_ATLAS: &str = "aaaaaaaa-1111-4111-8111-111111111111";
    const SPACE_DISENO: &str = "bbbbbbbb-1111-4111-8111-111111111111";
    const SPACE_OTHER: &str = "cccccccc-1111-4111-8111-111111111111";
    const PIECE_MANUAL: &str = "aaaaaaaa-2222-4222-8222-222222222222";
    const PIECE_REPO_A: &str = "bbbbbbbb-2222-4222-8222-222222222222";
    const PIECE_REPO_B: &str = "cccccccc-2222-4222-8222-222222222222";
    const PIECE_REPO_C: &str = "dddddddd-2222-4222-8222-222222222222";
    const PIECE_PERCENT: &str = "eeeeeeee-2222-4222-8222-222222222222";
    const NOTE_SECRET: &str = "NOTE_ONLY_SENTINEL_should_not_appear";
    const PAYLOAD_SECRET: &str = "PAYLOAD_ONLY_SENTINEL_should_not_appear";
    const CLOSURE_SECRET: &str = "CLOSURE_ONLY_SENTINEL_should_not_appear";
    const URL_SECRET: &str = "https://example.invalid/private-url";
    const PATH_SECRET: &str = "C:/Users/Private/secret-path";

    fn schema() -> &'static str {
        "CREATE TABLE grupo (
            id TEXT PRIMARY KEY, nombre TEXT NOT NULL, icono TEXT NOT NULL DEFAULT 'folder',
            orden INTEGER NOT NULL, creado_en TEXT NOT NULL, editado_en TEXT NOT NULL
         );
         CREATE TABLE espacio (
            id TEXT PRIMARY KEY, grupo_id TEXT NOT NULL,
            nombre TEXT NOT NULL, nota TEXT, bot_activo INTEGER NOT NULL DEFAULT 0,
            creado_en TEXT NOT NULL, editado_en TEXT NOT NULL
         );
         CREATE TABLE pieza (
            id TEXT PRIMARY KEY, espacio_id TEXT NOT NULL,
            kind TEXT NOT NULL, nombre TEXT NOT NULL, payload TEXT NOT NULL,
            marcada INTEGER NOT NULL DEFAULT 1, orden INTEGER NOT NULL,
            creado_en TEXT NOT NULL, editado_en TEXT NOT NULL
         );
         CREATE TABLE pack_pieza (espacio_id TEXT NOT NULL, pieza_id TEXT NOT NULL);
         CREATE TABLE cierre (id TEXT, espacio_id TEXT, progress TEXT);"
    }

    fn seed(db: &Connection) {
        db.execute_batch(schema()).unwrap();
        let stamp = "1800000000";
        db.execute(
            "INSERT INTO grupo VALUES (?1, 'Trabajo', 'briefcase', 0, ?2, ?2)",
            params![GROUP_A, stamp],
        )
        .unwrap();
        db.execute(
            "INSERT INTO grupo VALUES (?1, 'Investigación', 'flask-conical', 1, ?2, ?2)",
            params![GROUP_EMPTY, stamp],
        )
        .unwrap();
        db.execute(
            "INSERT INTO grupo VALUES (?1, 'Universidad', 'graduation-cap', 2, ?2, ?2)",
            params![GROUP_B, stamp],
        )
        .unwrap();
        db.execute(
            "INSERT INTO espacio VALUES (?1, ?2, 'Atlas', ?3, 1, ?4, ?4)",
            params![SPACE_ATLAS, GROUP_A, NOTE_SECRET, stamp],
        )
        .unwrap();
        db.execute(
            "INSERT INTO espacio VALUES (?1, ?2, 'Diseño', NULL, 0, ?3, ?3)",
            params![SPACE_DISENO, GROUP_A, stamp],
        )
        .unwrap();
        db.execute(
            "INSERT INTO espacio VALUES (?1, ?2, 'Taller', NULL, 0, ?3, ?3)",
            params![SPACE_OTHER, GROUP_B, stamp],
        )
        .unwrap();
        db.execute(
            "INSERT INTO pieza VALUES (?1, ?2, 'firefox', 'Manual Atlas', ?3, 0, 0, ?4, ?4)",
            params![
                PIECE_MANUAL,
                SPACE_ATLAS,
                json!({"urls": [URL_SECRET], "secret": PAYLOAD_SECRET}).to_string(),
                stamp
            ],
        )
        .unwrap();
        db.execute(
            "INSERT INTO pieza VALUES (?1, ?2, 'folder', 'Repositorio', ?3, 1, 1, ?4, ?4)",
            params![
                PIECE_REPO_A,
                SPACE_ATLAS,
                json!({"path": PATH_SECRET}).to_string(),
                stamp
            ],
        )
        .unwrap();
        db.execute(
            "INSERT INTO pieza VALUES (?1, ?2, 'file', 'Repositorio', '{}', 0, 0, ?3, ?3)",
            params![PIECE_REPO_B, SPACE_DISENO, stamp],
        )
        .unwrap();
        db.execute(
            "INSERT INTO pieza VALUES (?1, ?2, 'vscode', 'Repositorio', 'not-json', 1, 0, ?3, ?3)",
            params![PIECE_REPO_C, SPACE_OTHER, stamp],
        )
        .unwrap();
        db.execute(
            "INSERT INTO pieza VALUES (?1, ?2, 'firefox', '100% Atlas', '{}', 0, 2, ?3, ?3)",
            params![PIECE_PERCENT, SPACE_ATLAS, stamp],
        )
        .unwrap();
        db.execute(
            "INSERT INTO pack_pieza VALUES (?1, ?2)",
            params![SPACE_ATLAS, PIECE_MANUAL],
        )
        .unwrap();
        db.execute(
            "INSERT INTO cierre VALUES ('cierre-1', ?1, ?2)",
            params![SPACE_ATLAS, CLOSURE_SECRET],
        )
        .unwrap();
    }

    fn snapshot(db: &Connection) -> Value {
        json!({
            "groups": db.prepare("SELECT id, nombre, icono, orden FROM grupo ORDER BY id")
                .unwrap().query_map([], |row| Ok(json!([row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, i64>(3)?])))
                .unwrap().collect::<Result<Vec<_>, _>>().unwrap(),
            "spaces": db.prepare("SELECT id, grupo_id, nombre, nota, bot_activo FROM espacio ORDER BY id")
                .unwrap().query_map([], |row| Ok(json!([row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, Option<String>>(3)?, row.get::<_, i64>(4)?])))
                .unwrap().collect::<Result<Vec<_>, _>>().unwrap(),
            "pieces": db.prepare("SELECT id, espacio_id, kind, nombre, payload, marcada, orden FROM pieza ORDER BY id")
                .unwrap().query_map([], |row| Ok(json!([row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, String>(4)?, row.get::<_, i64>(5)?, row.get::<_, i64>(6)?])))
                .unwrap().collect::<Result<Vec<_>, _>>().unwrap(),
            "pack": db.prepare("SELECT espacio_id, pieza_id FROM pack_pieza ORDER BY pieza_id")
                .unwrap().query_map([], |row| Ok(json!([row.get::<_, String>(0)?, row.get::<_, String>(1)?])))
                .unwrap().collect::<Result<Vec<_>, _>>().unwrap(),
            "closures": db.prepare("SELECT id, espacio_id, progress FROM cierre ORDER BY id")
                .unwrap().query_map([], |row| Ok(json!([row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?])))
                .unwrap().collect::<Result<Vec<_>, _>>().unwrap(),
        })
    }

    #[test]
    fn catalog_is_minimal_includes_empty_groups_and_keeps_homonyms() {
        let db = Connection::open_in_memory().unwrap();
        seed(&db);
        db.execute_batch("PRAGMA query_only = ON;").unwrap();
        let catalog = list_navigation_catalog(&db).unwrap();
        assert_eq!(catalog.groups.len(), 3);
        assert!(catalog.groups.iter().any(|group| group.id == GROUP_EMPTY
            && group.name == "Investigación"
            && group.icon == "flask-conical"));
        assert_eq!(catalog.spaces.len(), 3);
        assert_eq!(catalog.pieces.len(), 5);
        let repos: Vec<_> = catalog
            .pieces
            .iter()
            .filter(|piece| piece.name == "Repositorio")
            .map(|piece| piece.id.as_str())
            .collect();
        assert_eq!(
            repos,
            vec![PIECE_REPO_A, PIECE_REPO_B, PIECE_REPO_C]
        );
        for space in &catalog.spaces {
            let keys: std::collections::BTreeSet<_> = serde_json::to_value(space)
                .unwrap()
                .as_object()
                .unwrap()
                .keys()
                .cloned()
                .collect();
            assert_eq!(keys, ["groupId", "id", "name"].into_iter().map(String::from).collect());
        }
        for piece in &catalog.pieces {
            let keys: std::collections::BTreeSet<_> = serde_json::to_value(piece)
                .unwrap()
                .as_object()
                .unwrap()
                .keys()
                .cloned()
                .collect();
            assert_eq!(
                keys,
                ["id", "kind", "name", "spaceId"].into_iter().map(String::from).collect()
            );
        }
    }

    #[test]
    fn catalog_serialization_excludes_private_sentinels() {
        let db = Connection::open_in_memory().unwrap();
        seed(&db);
        let catalog = list_navigation_catalog(&db).unwrap();
        let encoded = serde_json::to_string(&catalog).unwrap();
        for secret in [
            NOTE_SECRET,
            PAYLOAD_SECRET,
            CLOSURE_SECRET,
            URL_SECRET,
            PATH_SECRET,
            "botActive",
            "marked",
            "payload",
            "note",
            "pack",
        ] {
            assert!(
                !encoded.contains(secret),
                "catalog leaked {secret}: {encoded}"
            );
        }
        assert_eq!(
            serde_json::to_value(&catalog.spaces.iter().find(|space| space.id == SPACE_ATLAS).unwrap()).unwrap(),
            json!({"id": SPACE_ATLAS, "groupId": GROUP_A, "name": "Atlas"})
        );
        assert_eq!(
            serde_json::to_value(&catalog.pieces.iter().find(|piece| piece.id == PIECE_MANUAL).unwrap()).unwrap(),
            json!({"id": PIECE_MANUAL, "spaceId": SPACE_ATLAS, "name": "Manual Atlas", "kind": "firefox"})
        );
    }

    #[test]
    fn invalid_payload_does_not_block_valid_names() {
        let db = Connection::open_in_memory().unwrap();
        seed(&db);
        let catalog = list_navigation_catalog(&db).unwrap();
        assert!(catalog.pieces.iter().any(|piece| piece.id == PIECE_REPO_C
            && piece.name == "Repositorio"
            && piece.kind == "vscode"));
    }

    #[test]
    fn catalog_is_read_only_and_uses_one_relationship_snapshot() {
        let db = Connection::open_in_memory().unwrap();
        seed(&db);
        let before = snapshot(&db);
        db.execute_batch("PRAGMA query_only = ON;").unwrap();
        let catalog = list_navigation_catalog(&db).unwrap();
        db.execute_batch("PRAGMA query_only = OFF;").unwrap();
        assert_eq!(snapshot(&db), before);
        assert_eq!(catalog.spaces.len(), 3);
        assert_eq!(catalog.pieces.len(), 5);
        assert!(list_navigation_catalog(&db).is_ok());
    }

    #[test]
    fn empty_sede_is_an_empty_catalog_not_an_error() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(schema()).unwrap();
        let catalog = list_navigation_catalog(&db).unwrap();
        assert_eq!(
            serde_json::to_value(&catalog).unwrap(),
            json!({"groups": [], "spaces": [], "pieces": []})
        );
    }

    #[test]
    fn exceeded_limits_fail_without_returning_a_partial_catalog() {
        let db = Connection::open_in_memory().unwrap();
        seed(&db);
        let error = list_navigation_catalog_bounded(&db, 3, MAX_NAVIGATION_BYTES).unwrap_err();
        assert_eq!(error, NAVIGATION_CATALOG_EXCEEDED);
        let error = list_navigation_catalog_bounded(&db, MAX_NAVIGATION_ENTITIES, 32).unwrap_err();
        assert_eq!(error, NAVIGATION_CATALOG_EXCEEDED);
    }

    #[test]
    fn inconsistent_relations_are_rejected() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(schema()).unwrap();
        db.execute(
            "INSERT INTO espacio VALUES ('orphan-space', 'missing-group', 'Huérfano', NULL, 0, '1', '1')",
            [],
        )
        .unwrap();
        assert_eq!(
            list_navigation_catalog(&db).unwrap_err(),
            NAVIGATION_INCONSISTENT
        );
    }

    #[test]
    fn create_rename_move_and_delete_are_visible_on_next_catalog() {
        let db = Connection::open_in_memory().unwrap();
        seed(&db);
        db.execute(
            "INSERT INTO grupo VALUES (?1, 'Nuevo', 'folder', 3, '1', '1')",
            ["dddddddd-0000-4000-8000-000000000000"],
        )
        .unwrap();
        db.execute(
            "UPDATE espacio SET nombre = 'Atlas Norte' WHERE id = ?1",
            [SPACE_ATLAS],
        )
        .unwrap();
        db.execute(
            "UPDATE espacio SET grupo_id = ?1 WHERE id = ?2",
            params![GROUP_B, SPACE_DISENO],
        )
        .unwrap();
        db.execute(
            "UPDATE pieza SET espacio_id = ?1 WHERE id = ?2",
            params![SPACE_OTHER, PIECE_REPO_A],
        )
        .unwrap();
        db.execute("DELETE FROM pieza WHERE id = ?1", [PIECE_PERCENT])
            .unwrap();
        let catalog = list_navigation_catalog(&db).unwrap();
        assert!(catalog
            .groups
            .iter()
            .any(|group| group.name == "Nuevo"));
        assert_eq!(
            catalog
                .spaces
                .iter()
                .find(|space| space.id == SPACE_ATLAS)
                .unwrap()
                .name,
            "Atlas Norte"
        );
        assert_eq!(
            catalog
                .spaces
                .iter()
                .find(|space| space.id == SPACE_DISENO)
                .unwrap()
                .group_id,
            GROUP_B
        );
        assert_eq!(
            catalog
                .pieces
                .iter()
                .find(|piece| piece.id == PIECE_REPO_A)
                .unwrap()
                .space_id,
            SPACE_OTHER
        );
        assert!(catalog
            .pieces
            .iter()
            .all(|piece| piece.id != PIECE_PERCENT));
    }

    #[test]
    fn resolve_returns_current_identity_or_not_found() {
        let db = Connection::open_in_memory().unwrap();
        seed(&db);
        let group = resolve_navigation_target(
            &db,
            &NavigationTarget::Group {
                group_id: GROUP_EMPTY.to_string(),
            },
        )
        .unwrap();
        assert_eq!(
            serde_json::to_value(&group).unwrap(),
            json!({
                "status": "found",
                "target": {
                    "type": "group",
                    "groupId": GROUP_EMPTY,
                    "name": "Investigación",
                    "icon": "flask-conical"
                }
            })
        );
        let missing = resolve_navigation_target(
            &db,
            &NavigationTarget::Piece {
                piece_id: "99999999-9999-4999-8999-999999999999".into(),
            },
        )
        .unwrap();
        assert_eq!(
            serde_json::to_value(&missing).unwrap(),
            json!({"status": "notFound"})
        );
        db.execute(
            "UPDATE pieza SET espacio_id = ?1, nombre = 'Repositorio movido' WHERE id = ?2",
            params![SPACE_OTHER, PIECE_REPO_A],
        )
        .unwrap();
        let moved = resolve_navigation_target(
            &db,
            &NavigationTarget::Piece {
                piece_id: PIECE_REPO_A.to_string(),
            },
        )
        .unwrap();
        assert_eq!(
            serde_json::to_value(&moved).unwrap(),
            json!({
                "status": "found",
                "target": {
                    "type": "piece",
                    "pieceId": PIECE_REPO_A,
                    "spaceId": SPACE_OTHER,
                    "groupId": GROUP_B,
                    "name": "Repositorio movido",
                    "kind": "folder",
                    "spaceName": "Taller",
                    "groupName": "Universidad"
                }
            })
        );
        db.execute("DELETE FROM pieza WHERE id = ?1", [PIECE_REPO_A])
            .unwrap();
        let deleted = resolve_navigation_target(
            &db,
            &NavigationTarget::Piece {
                piece_id: PIECE_REPO_A.to_string(),
            },
        )
        .unwrap();
        assert_eq!(
            serde_json::to_value(&deleted).unwrap(),
            json!({"status": "notFound"})
        );
    }

    #[test]
    fn resolve_rejects_invalid_ids_and_does_not_write() {
        let db = Connection::open_in_memory().unwrap();
        seed(&db);
        let before = snapshot(&db);
        let error = resolve_navigation_target(
            &db,
            &NavigationTarget::Space {
                space_id: "not-a-uuid".into(),
            },
        )
        .unwrap_err();
        assert!(error.contains("UUID"));
        assert!(!error.to_lowercase().contains("select"));
        assert_eq!(snapshot(&db), before);
        let extra = serde_json::from_value::<NavigationTarget>(json!({
            "type": "group",
            "groupId": GROUP_A,
            "extra": true
        }));
        assert!(extra.is_err());
    }

    #[test]
    fn resolve_does_not_expose_payloads_or_notes() {
        let db = Connection::open_in_memory().unwrap();
        seed(&db);
        let resolved = resolve_navigation_target(
            &db,
            &NavigationTarget::Piece {
                piece_id: PIECE_MANUAL.to_string(),
            },
        )
        .unwrap();
        let encoded = serde_json::to_string(&resolved).unwrap();
        for secret in [NOTE_SECRET, PAYLOAD_SECRET, CLOSURE_SECRET, URL_SECRET, PATH_SECRET] {
            assert!(!encoded.contains(secret), "resolve leaked {secret}");
        }
    }
}
