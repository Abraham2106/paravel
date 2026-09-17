use rusqlite::Connection;
use serde::Serialize;
use serde_json::Value;
use uuid::Uuid;

const GROUP_ICONS: &[&str] = &[
    "folder",
    "briefcase",
    "graduation-cap",
    "home",
    "flask-conical",
    "book",
    "laptop",
    "globe",
    "notebook-pen",
    "hash",
    "target",
    "settings",
    "folders",
    "calendar",
    "lock",
    "lightbulb",
    "wrench",
    "package",
    "palette",
    "chart-bar",
    "mail",
    "rocket",
    "microscope",
    "sprout",
];
const DEFAULT_GROUP_ICON: &str = "folder";
const EMOJI_TO_ICON: &[(&str, &str)] = &[
    ("📁", "folder"),
    ("💼", "briefcase"),
    ("🎓", "graduation-cap"),
    ("🏠", "home"),
    ("🧪", "flask-conical"),
    ("📚", "book"),
    ("💻", "laptop"),
    ("🌐", "globe"),
    ("📝", "notebook-pen"),
    ("🎯", "target"),
    ("⚙️", "settings"),
    ("🗂️", "folders"),
    ("📅", "calendar"),
    ("🔒", "lock"),
    ("💡", "lightbulb"),
    ("🛠️", "wrench"),
    ("📦", "package"),
    ("🎨", "palette"),
    ("📊", "chart-bar"),
    ("✉️", "mail"),
    ("🚀", "rocket"),
    ("🔬", "microscope"),
    ("🌱", "sprout"),
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub order: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Space {
    pub id: String,
    pub group_id: String,
    pub name: String,
    pub note: Option<String>,
    pub pack: Vec<String>,
    pub bot_active: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Piece {
    pub id: String,
    pub space_id: String,
    pub kind: String,
    pub name: String,
    pub payload: Value,
    pub marked: bool,
    pub order: i64,
}

pub fn stored_group_icon(raw: &str) -> String {
    group_icon(raw).unwrap_or_else(|_| DEFAULT_GROUP_ICON.to_string())
}

pub fn group_icon(raw: &str) -> Result<String, String> {
    let icon = raw.trim();
    if GROUP_ICONS.contains(&icon) {
        return Ok(icon.to_string());
    }
    for (emoji, id) in EMOJI_TO_ICON {
        if *emoji == icon {
            return Ok((*id).to_string());
        }
    }
    Err("El icono del grupo no está en la paleta.".to_string())
}

fn map_group(row: &rusqlite::Row<'_>) -> rusqlite::Result<Group> {
    let icon: String = row.get(2)?;
    Ok(Group {
        id: row.get(0)?,
        name: row.get(1)?,
        icon: stored_group_icon(&icon),
        order: row.get(3)?,
    })
}

pub fn list_groups(db: &Connection) -> Result<Vec<Group>, String> {
    let mut stmt = db.prepare(
        "SELECT id, nombre, COALESCE(NULLIF(icono, ''), 'folder') AS icono, orden FROM grupo ORDER BY orden, nombre",
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_group).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn list_spaces(db: &Connection) -> Result<Vec<Space>, String> {
    let mut stmt = db
        .prepare(
            "SELECT e.id, e.grupo_id, e.nombre, e.nota, e.bot_activo,
                COALESCE((SELECT json_group_array(pp.pieza_id)
                          FROM pack_pieza pp WHERE pp.espacio_id = e.id), '[]')
         FROM espacio e ORDER BY e.nombre",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Space {
                id: row.get(0)?,
                group_id: row.get(1)?,
                name: row.get(2)?,
                note: row.get(3)?,
                bot_active: row.get::<_, i64>(4)? != 0,
                pack: serde_json::from_str(&row.get::<_, String>(5)?).unwrap_or_default(),
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn get_invite(db: &Connection, space_id: &str) -> Result<Vec<String>, String> {
    Uuid::parse_str(space_id).map_err(|_| "El espacio no tiene un UUID válido.".to_string())?;
    let mut stmt = db
        .prepare("SELECT pieza_id FROM pack_pieza WHERE espacio_id = ?1 ORDER BY rowid")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([space_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn list_pieces(db: &Connection, space_id: &str) -> Result<Vec<Piece>, String> {
    let mut stmt = db.prepare("SELECT id, espacio_id, kind, nombre, payload, marcada, orden FROM pieza WHERE espacio_id = ?1 ORDER BY orden, nombre").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([space_id], |row| {
            let payload: String = row.get(4)?;
            Ok(Piece {
                id: row.get(0)?,
                space_id: row.get(1)?,
                kind: row.get(2)?,
                name: row.get(3)?,
                payload: serde_json::from_str(&payload).unwrap_or(Value::Null),
                marked: row.get::<_, i64>(5)? != 0,
                order: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn desktop_groups_keep_order_and_normalize_legacy_icons_without_writes() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(
            "CREATE TABLE grupo (id TEXT, nombre TEXT, icono TEXT, orden INTEGER);
            INSERT INTO grupo VALUES ('b', 'Beta', 'unknown', 2), ('a', 'Alpha', '\u{1f4bc}', 1);
            PRAGMA query_only = ON;",
        )
        .unwrap();
        let groups = list_groups(&db).unwrap();
        assert_eq!(
            groups
                .iter()
                .map(|g| (g.id.as_str(), g.icon.as_str()))
                .collect::<Vec<_>>(),
            vec![("a", "briefcase"), ("b", "folder")]
        );
        let original: String = db
            .query_row("SELECT icono FROM grupo WHERE id = 'a'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(original, "\u{1f4bc}");
        assert!(group_icon("unknown").is_err());
    }

    #[test]
    fn desktop_reads_keep_pack_distinct_from_marked_and_keep_wire_shape() {
        const SPACE: &str = "11111111-1111-4111-8111-111111111111";
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE espacio (id TEXT, grupo_id TEXT, nombre TEXT, nota TEXT, bot_activo INTEGER);
            CREATE TABLE pieza (id TEXT, espacio_id TEXT, kind TEXT, nombre TEXT, payload TEXT, marcada INTEGER, orden INTEGER);
            CREATE TABLE pack_pieza (espacio_id TEXT, pieza_id TEXT);").unwrap();
        db.execute(
            "INSERT INTO espacio VALUES (?1, 'g', 'Desk', NULL, 1)",
            [SPACE],
        )
        .unwrap();
        db.execute(
            "INSERT INTO pieza VALUES ('invited', ?1, 'note', 'A', '{\"text\":\"hello\"}', 0, 0),
            ('marked', ?1, 'note', 'B', 'malformed legacy payload', 1, 1),
            ('elsewhere', 'other-space', 'note', 'C', '{}', 1, 0)",
            [SPACE],
        )
        .unwrap();
        db.execute("INSERT INTO pack_pieza VALUES (?1, 'invited')", [SPACE])
            .unwrap();
        db.execute_batch("PRAGMA query_only = ON;").unwrap();
        let spaces = list_spaces(&db).unwrap();
        assert_eq!(
            serde_json::to_value(&spaces[0]).unwrap(),
            json!({
                "id": SPACE, "groupId": "g", "name": "Desk", "note": null,
                "botActive": true, "pack": ["invited"]
            })
        );
        assert_eq!(get_invite(&db, SPACE).unwrap(), vec!["invited"]);
        assert!(get_invite(&db, "invalid-id").is_err());
        let pieces = list_pieces(&db, SPACE).unwrap();
        assert_eq!(pieces.len(), 2);
        assert_eq!(
            serde_json::to_value(&pieces[0]).unwrap(),
            json!({
                "id": "invited", "spaceId": SPACE, "kind": "note", "name": "A",
                "payload": {"text": "hello"}, "marked": false, "order": 0
            })
        );
        assert!(pieces[1].marked);
        assert_eq!(pieces[1].payload, Value::Null);
    }
}
