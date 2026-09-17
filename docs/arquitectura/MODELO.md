# Modelo de datos — freeze (WBS 3.8)

Fuente: `app/src-tauri/src/db.rs` (`migrate` + comandos) y `validate_piece_payload` en `lib.rs`. No hay crate `rusqlite_migration`: el schema es `CREATE TABLE IF NOT EXISTS` al abrir.

SQLite local: `%APPDATA%\app.paravel.desktop\paravel.sqlite3`. Si el destino aún no existe y `PARAVEL_IMPORT_DB` apunta a un archivo, se copia una vez al abrir. El log de spawn es archivo (`launch.log` en esa misma carpeta), no tabla. Carpetas extra y rutas de `.exe` viven en `settings.json` del mismo directorio, editables desde **Este equipo**.

No se agregan tablas «por si acaso». No hay tabla CTO, ni MCP, ni sync.

---

## Tablas

```sql
CREATE TABLE grupo (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  icono       TEXT NOT NULL DEFAULT 'folder',
  orden       INTEGER NOT NULL,
  creado_en   TEXT NOT NULL,
  editado_en  TEXT NOT NULL
);

CREATE TABLE espacio (
  id          TEXT PRIMARY KEY,
  grupo_id    TEXT NOT NULL REFERENCES grupo(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  nota        TEXT,
  bot_activo  INTEGER NOT NULL DEFAULT 0,
  creado_en   TEXT NOT NULL,
  editado_en  TEXT NOT NULL
);

CREATE TABLE pieza (
  id          TEXT PRIMARY KEY,
  espacio_id  TEXT NOT NULL REFERENCES espacio(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  nombre      TEXT NOT NULL,
  payload     TEXT NOT NULL,
  marcada     INTEGER NOT NULL DEFAULT 1,
  orden       INTEGER NOT NULL,
  creado_en   TEXT NOT NULL,
  editado_en  TEXT NOT NULL
);

CREATE TABLE pack_pieza (
  espacio_id  TEXT NOT NULL REFERENCES espacio(id) ON DELETE CASCADE,
  pieza_id    TEXT NOT NULL REFERENCES pieza(id) ON DELETE CASCADE,
  PRIMARY KEY (espacio_id, pieza_id)
);
```

- `id` = UUID TEXT.
- `grupo.icono` = id Lucide de paleta fija (~24, p.ej. `briefcase`, `graduation-cap`). No es emoji ni el componente React. `create_group` / `update_group` lo validan. DB vieja: `ALTER TABLE` al abrir; filas con emoji se mapean al id equivalente o a `folder`.
- `payload` = JSON; Rust valida la forma, no SQLite.
- `marcada` = selección de Iniciar. No es el pack del Bot.
- `pack_pieza` = piezas de **ese** espacio visibles para el Bot. `set_invite` exige que cada `pieza_id` pertenezca al `espacio_id`. `delete_piece` borra antes de `pack_pieza` y luego la pieza.
- Índices: `idx_espacio_grupo`, `idx_pieza_espacio`, `idx_pack_pieza_pieza`.
- No se persiste viva/desconectada: se recalcula al abrir.
- Una DB abierta **antes** de este freeze puede no tener `pack_pieza` todavía. Se crea al reabrir la app (`CREATE TABLE IF NOT EXISTS`). No se migran filas a mano.

---

## Kinds y payload (v1)

Allowlist en `validate_piece_payload`. Otro `kind` = rechazo, no INSERT.

| `kind` | Payload |
| --- | --- |
| `vscode` | `{ "path": "<carpeta canonicalizada>" }` |
| `cursor` | `{ "path": "<carpeta canonicalizada>" }` |
| `folder` | `{ "path": "<carpeta canonicalizada>" }` |
| `file` | `{ "path": "<archivo canonicalizado>" }` |
| `firefox` | `{ "urls": ["http(s)://…", …] }` ≥ 1 URL |
| `firefox-group` | `{ "urls": ["http(s)://…", "file:///C:/…", …] }` ≥ 1 URL; orden conservado |

`folder` es la carpeta de producto. Notion / web son `firefox` + `urls`. El INSERT nuevo no acepta `{ "url": "…" }` suelto; la UI todavía lee `payload.url` en filas viejas.

Spawn: `Code.exe`, `Cursor.exe`, `firefox.exe`, `explorer.exe`, `ShellExecuteW` para `file`. Nunca `code.cmd`.

`firefox-group` abre una ventana con todos sus enlaces. Las URLs locales deben apuntar a archivos existentes bajo los roots permitidos; se rechazan ejecutables, atajos y scripts (p. ej. `.exe`, `.lnk`, `.cmd`, `.bat`, `.ps1`). La misma validación se ejecuta antes del INSERT y otra vez antes del lanzamiento completo. `firefox` conserva su contrato exclusivamente HTTP(S).

---

## Invokes (freeze)

`pick_folder`, `pick_file`, `pick_executable`, `get_host_settings`, `save_host_settings`, `read_launch_log`, `launch_vscode`, `launch_cursor`, `launch_firefox`, `launch_folder`, `launch_file`, `probe_paths`, `db_path`, `list_groups`, `create_group`, `update_group`, `list_spaces`, `create_space`, `get_invite`, `set_invite`, `clear_invite`, `list_pieces`, `list_navigation_catalog`, `resolve_navigation_target`, `set_marked`, `delete_piece`, `add_piece`, `list_space_templates`, `preview_space_template`, `create_space_from_template`, `get_space_preparation`, `update_space_preparation`, `resolve_preparation_slot`.

El webview no usa `tauri-plugin-sql`. Capability base: `core:default`; P01 añade `core:window:allow-destroy` para el cierre de la ventana principal (ver anexo).

El adaptador `launch_firefox_group` también está registrado; reutiliza `run_launch` y el mismo log.

---

## P01 — Contrato aditivo de cierres

Fecha de decisión: **2026-09-16**. El usuario autoriza implementar P01 completo sin esperar research ni piloto manual. Alcance y estado: [DEC-P01-2026-09-16 y WBS P01](../planificacion/WBS-P01-CONTINUIDAD.md#1-decisión-de-ejecución-y-resultado-esperado). La base freeze anterior se conserva como referencia; este anexo documenta **implementación técnica P01.3–P01.7 entregada al alcance**, con resultados comunicados por el coordinador el 2026-09-16. No acredita despliegue en datos personales ni utilidad aceptada; las verificaciones pendientes se detallan al final.

> (idea creada, falta verificar contra research y websearch)
>
> Research web parcial documentado en P01.1; research con usuarios, línea base, pilotos y utilidad pendientes. La autorización de código no satisface esas tareas ni G3.

### Tabla privada y snapshots

Añadir una tabla `cierre` a SQLite, sin reutilizar `espacio.nota`, cambiar las tablas previas ni reinterpretar notas existentes. Relación **espacio 1:N cierre**, FK `espacio_id → espacio(id) ON DELETE CASCADE`. Activar FK en cada conexión escritora. Eliminar una mesa elimina su historial; la confirmación debe advertirlo. La cascada de grupo a espacio alcanza también sus cierres.

Mapeo contrastado con `app/src-tauri/src/continuity.rs:139`. Reconciliación documental del 2026-09-16: los opcionales de contenido usan cadenas vacías, no SQL/JSON `null`; todos los campos textuales se envían como string. Se corrige la representación propuesta anteriormente sin hacer obligatorio su contenido. Los límites se comprueban sobre el texto recibido antes de trim (`continuity.rs:84`), no solo sobre el resultado normalizado.

| Columna SQL | Campo DTO | Tipo / contrato |
| --- | --- | --- |
| `id` | `id` | TEXT PRIMARY KEY NOT NULL; UUID canónico estable generado por cliente |
| `espacio_id` | `spaceId` | TEXT NOT NULL; FK con cascada al espacio |
| `objective` | `objective` | TEXT NOT NULL; vacío permitido; objetivo de esa sesión, máximo 500 valores escalares Unicode |
| `progress` | `progress` | TEXT NOT NULL; único texto obligatorio, no vacío tras trim; máximo 4000 valores escalares Unicode |
| `next_action` | `nextAction` | TEXT NOT NULL; vacío permitido; máximo 2000 valores escalares Unicode |
| `blocker` | `blocker` | TEXT NOT NULL; vacío permitido; máximo 2000 valores escalares Unicode |
| `created_at` | `createdAt` | INTEGER NOT NULL; Unix ms UTC asignados por backend; inmutable |
| `updated_at` | `updatedAt` | INTEGER NOT NULL; Unix ms UTC asignados por backend al crear/editar |
| `revision` | `revision` | INTEGER NOT NULL; positivo, inicial 1, incremento por edición; CAS |

Son snapshots históricos textuales, no propiedades globales sincronizadas del espacio: editar un cierre no cambia otros ni la nota. Sin versiones por campo, IDs de piezas vinculadas, autoselección, lanzamientos ni IA. Los opcionales vacíos se representan como `""`; solo `progress` exige contenido. Validar longitudes/bytes antes de trim en extremos y no truncar silenciosamente.

Límites autoritativos en backend, coherentes en UI:

- **500 / 4000 / 2000 / 2000 valores escalares Unicode** para `objective` / `progress` / `nextAction` / `blocker`, respectivamente; no unidades UTF-16 ni grafemas.
- **32 KiB = 32768 bytes UTF-8 en total**, suma de los cuatro textos recibidos antes de trim; cadenas vacías cuentan cero. Es límite de contenido, no del envelope JSON ni del archivo SQLite. Probarlo además de los límites individuales con texto multibyte.
- **1000 cierres por espacio**. El alta que exceda el cupo falla y permite borrar explícitamente para liberar capacidad; sin TTL ni purga automática. Cupo y alta se comprueban en la misma transacción para evitar carreras. Consultar/editar sigue permitido al alcanzar el cupo.

`createdAt` y `updatedAt` son enteros Unix ms, presentados en zona local por UI. No se convierten los `creado_en`/`editado_en` previos, que `chrono_like_timestamp` en `app/src-tauri/src/lib.rs:91` genera en segundos como texto. En la creación ambas fechas coinciden; `revision`, no el reloj, controla concurrencia.

### Creación idempotente y CAS

El cliente genera un UUID una sola vez por intención de creación y conserva UUID/payload de la solicitud durante el envío y los reintentos de resultado incierto. La repetición con el mismo ID, espacio y contenido normalizado devuelve el cierre existente sin duplicar, incrementar revisión, cambiar fechas ni consumir capacidad. Resolver repetición antes de rechazar cupo completo.

Un ID reutilizado con contenido o espacio diferente produce conflicto y no sobrescribe ni revela un cierre ajeno. La garantía es para creación de un registro existente: no replay eterno tras borrado, no recuperación de borradores tras reinicio. Si una edición posterior impide comparar con el contenido reenviado, devolver conflicto, no restaurar contenido viejo.

Toda lectura/edición/eliminación de un cierre comprueba conjuntamente `spaceId` e `id`. Editar exige revisión esperada y actualización atómica por `(espacio_id, id, revision)`; con éxito incrementa revisión, conserva creación y actualiza modificación. Eliminar también usa revisión esperada tras confirmación. Revisión obsoleta no sobrescribe ni borra: conservar borrador y ofrecer revisión/recarga explícitas. Dos operaciones pueden compartir milisegundo sin compartir revisión. No exponer SQL ni contenido privado en errores públicos.

### Último e historial paginado

Índice compuesto requerido por el patrón de consulta: `(espacio_id, created_at DESC, id DESC)`. Último e historial se ordenan por **`createdAt DESC, id DESC`**, con comparación determinista de UUID canónico. Editar un cierre antiguo no cambia su posición. Eliminar el último muestra el anterior o vacío; un fallo de consulta no equivale a historial vacío.

Página por defecto **20**, máximo **50**, valores fuera de 1–50 rechazados. Cursor versionado y acotado al espacio, con `spaceId` y clave `(createdAt, id)` del último elemento; validar tipos/formato y rechazar espacio ajeno o cursor malformado. Continuar con claves estrictamente menores en ese orden, no con offset. Devolver elementos y siguiente cursor o `null` al terminar.

Orden estable en datos sin cambios; no se promete snapshot de todo el historial entre páginas con escrituras concurrentes. Nuevas altas se recuperan refrescando desde el inicio. El cursor no autoriza acceso ni cifra datos.

### Privacidad, borradores y compatibilidad

- **Privado = excluido de MCP**, del pack copiado y de cualquier exposición automática. No es cifrado en disco ni protección frente a otros programas con acceso a la cuenta; copias completas de SQLite contienen también cierres.
- Mantener nota, pack, `marcada`, permisos, herramientas y respuestas MCP sin cambios. La nota puede seguir expuesta según su contrato; no usarla como borrador privado. No registrar cierres en logs, errores técnicos o telemetría.
- UI solo mediante comandos backend específicos; no añadir cierre al DTO `Space` compartido ni escribir a través del proceso MCP read-only. La lectura de esquema actual está en `app/crates/paravel-context/src/reader.rs:133`; su compatibilidad aditiva debe probarse, no asumirse como aislamiento demostrado.
- Borradores **solo en memoria**, separados del dato confirmado: confirmar descarte al cancelar/navegar/cerrar normalmente, permitir cancelar para conservarlos y mantenerlos ante errores mientras viva la vista. Nada en nota, DB, localStorage o sessionStorage. Sin promesa de recuperación tras caída, recarga o cierre abrupto.
- Migración P01 aditiva, idempotente y transaccional; sin borrar/recrear datos previos. Probar DB nueva/existente, reapertura, fallo/rollback y cascadas. Desactivar UI no borra tabla ni datos. Comprobar compatibilidad antes de recomendar downgrade; restaurar una DB completa puede revertir trabajo posterior ajeno a P01.

### Estado de verificación

P01.3–P01.7 entregados al alcance técnico. Evidencia comunicada por el coordinador el 2026-09-16, no ejecutada de nuevo por esta tarea documental:

- `cargo test --lib` en `app/src-tauri`: **20 PASS (15 cierres + 5 previos)**; `cargo clippy --lib -- -D warnings`: limpio.
- `npm run build`: PASS; resuelto el antiguo error de `retryCursor`. `node --test scripts/continuity.test.mjs`: **6 PASS**, no 18.
- `node scripts/continuity-native.test.mjs`: **3 PASS en Tauri/WebView2 real y fixture SQLite aislada**, cubriendo crear con opcionales/cancelar descarte sucio, edición con revisión y creación estable/eliminación, persistencia al reiniciar; `launchLogEntries: 0`.
- Mock `node scripts/continuity-ui.test.mjs`: **4/4 PASS confirmados por el coordinador tras `currentWindowSafe`**; reemplaza el fallo intermedio por metadatos de ventana ausentes. `npm run build` nuevamente confirmado PASS.
- Contexto `cargo test` en `app/crates/paravel-context`: **17 PASS**. MCP `cargo test` en `app/crates/paravel-mcp`: **45 PASS (8 unit + 19 HTTP + 18 stdio)**.
- React Doctor final confirmado por el coordinador el 2026-09-16: `npx.cmd -y react-doctor@latest --verbose --scope changed` hizo fallback a escaneo completo sin baseline Git: **17 archivos, score 66/100, 22 warnings, 0 errores**, igual al score previo del agente. Incluye avisos de complejidad/estado de carga de `ContinuityPanel` (operaciones asíncronas protegidas y probadas) y mantenibilidad/accesibilidad de `Workspace` existente. No es lint limpio ni prueba ausencia de regresiones; sin baseline no se atribuyen cambios a P01. No hay script de lint frontend declarado; Doctor no sustituye typecheck.

Invokes registrados en `app/src-tauri/src/lib.rs:554`: `list_closures`, `get_closure`, `save_closure`, `delete_closure`. `save_closure` recibe `input` con cuatro strings y `expectedRevision` explícito (`null` para crear, revisión positiva para editar); `delete_closure` recibe espacio, ID y revisión. Último se obtiene del inicio de la lista ordenada, sin comando separado. Cursor JSON versión 1, máximo 1024 bytes (`continuity.rs:207`). Fechas acotadas a enteros seguros JS; `updatedAt` no retrocede y CAS controla conflictos incluso si coincide la fecha.

La capability `core:window:allow-destroy` permite el cierre de la ventana principal; no modifica permisos MCP. `currentWindowSafe` en `app/src/ContinuityPanel.tsx:16` devuelve `null` ante fallo síncrono de metadatos del host/mock. La existencia de ese código y del permiso **no demuestra cancelación del cierre desde Windows/Alt+F4**. Tampoco se reportó prueba con lector de pantalla: ambas verificaciones quedan pendientes, separadas de cancelar un descarte en el formulario.

Aislamiento del harness: `PARAVEL_TEST_DATA_DIR` y ruta de log alternativa bajo `cfg(debug_assertions)` en `app/src-tauri/src/lib.rs:39` y `:512`; release conserva su ruta habitual. Prueba native con puerto CDP fijo 9223 y datos sintéticos; no lanzar otra concurrentemente. No se infiere validación de datos personales, restore/downgrade ni lanzamiento explícito de `launchLogEntries: 0`.

Detalle y brechas: [matriz P01.7 y G3](../planificacion/WBS-P01-CONTINUIDAD.md#8-p017-matriz-mínima-y-evidencia-de-aceptación). [Guía de uso, recuperación y retirada](../planificacion/WBS-P01-CONTINUIDAD.md#guía-de-uso-recuperación-y-retirada): cierres confirmados recuperables al reiniciar, borradores solo en memoria, eliminación sin papelera, desactivar UI no borra datos, restaurar DB completa requiere copia consistente y autorización y afecta también datos ajenos a P01. No se añade función de backup/exportación.

[Estado P01](../planificacion/WBS-P01-CONTINUIDAD.md#11-secuencia-y-estado-actual): research parcial y marcador conservado; P01.2/P01.8 y G1 humanos pendientes. Implementación autorizada pese al research pendiente; no declarar utilidad ni G3 sin reservas por terminar el código.

---

## P03 — Contrato aditivo de plantillas de espacios

Fecha de decisión: **2026-09-16**. El usuario autoriza implementar P03 al alcance técnico sin esperar research ni piloto humano. Alcance y estado: [PLANTEAMIENTO-P03](../planificacion/PLANTEAMIENTO-P03.md). La base freeze y el anexo P01 se conservan; este anexo documenta **implementación técnica P03.3–P03.7 entregada**, con P03.9 documental. No acredita utilidad aceptada.

> (idea creada, falta verificar contra research y websearch)
>
> Research con usuarios, línea base y piloto P03.8 pendientes. Terminar el código no satisface G3.

### Catálogo incluido, no tabla

No hay tabla `plantilla`. Las tres definiciones viven en `app/src-tauri/src/templates.rs` (`list_space_templates`) y el host las entrega tipadas. El frontend envía referencia (`templateId`, `revision`, `schemaVersion`) y valores, no una definición arbitraria.

| `templateId` | Nombre | Campos | Sugerencias (kinds admitidos) |
| --- | --- | --- | --- |
| `development` | Desarrollo | `objective`, `firstStep` | `workspace`: vscode/cursor/folder; `reference`: firefox/file |
| `research` | Investigación | `question`, `approach` | `sources`: firefox/firefox-group; `material`: folder/file |
| `client` | Cliente | `outcome`, `nextDelivery` | `materials`: folder/file; `deliveryReference`: firefox/file |

`schemaVersion = 1`, `revision = 1`. Cambiar una definición exige nueva revisión. Las mesas existentes leen `definition_snapshot`, no el catálogo vigente.

### Tablas privadas

Relación **espacio 1:0..1 preparación** y **preparación 1:N sugerencias**. Mesas vacías o previas no tienen fila. Mapeo: `templates.rs:262`.

```sql
CREATE TABLE espacio_preparacion (
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

CREATE TABLE preparacion_sugerencia (
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
```

Índice `idx_preparacion_pieza(pieza_id)`. Triggers: recibo de creación inmutable; alcance de `pieza_id` a la misma mesa; al `SET NULL` de la FK, incrementa revisión de la sugerencia. Estado derivado: pieza informada → completada; sin pieza y `omitida = 1` → omitida; resto → pendiente.

`creation_fingerprint` y los digest de pieza/resolución son `sha256-v1:` + 64 hex (prefijos `paravel-template-command-v1` / `paravel-template-piece-v1`). No se publican ni cifran. Sirven para reintentos, no como prueba de integridad frente a programas locales.

### Materialización

Creación atómica en una transacción: espacio (`nota` NULL, `bot_activo = 0`), snapshot, sugerencias y solo piezas realmente aportadas. Pack vacío; cero cierres P01. Piezas P03 nacen con `marcada = 0`; no cambia el DEFAULT 1 de `add_piece`. IDs nuevos generados por backend. Preview y creación comparten `normalize` + `validate_piece_payload`.

Límites reconciliados con el host vigente, no con la propuesta 120:

- Nombre de espacio/pieza: 1–80 valores escalares Unicode tras trim.
- Textos de preparación: hasta 1000 por clave; suma UTF-8 de valores ≤ 16 KiB antes de normalizar.
- Envelope JSON ≤ 128 KiB. Rechazo, nunca truncado.

### Operaciones

| Comando | Contrato |
| --- | --- |
| `list_space_templates` | Catálogo empaquetado; sin datos personales |
| `preview_space_template` | Plan normalizado; no escribe ni reserva IDs |
| `create_space_from_template` | UUID de intención del cliente; mismo ID+fingerprint → identidad existente; mismo ID otro payload → `REQUEST_CONFLICT` |
| `get_space_preparation` | Preparación o `null` si la mesa no tiene guía |
| `update_space_preparation` | CAS de textos y `oculta`; no toca nota, pack ni cierres |
| `resolve_preparation_slot` | Alta de pieza + vínculo atómicos, u omisión; replay equivalente no duplica |

Errores públicos: `TEMPLATE_NOT_FOUND`, `TEMPLATE_VERSION_UNSUPPORTED`, `GROUP_NOT_FOUND`, `INVALID_FIELD`, `INVALID_PIECE`, `REQUEST_CONFLICT`, `REVISION_CONFLICT`, `SLOT_STATE_CONFLICT`, `DB_BUSY`, `STORAGE_ERROR`. Sin SQL ni textos privados.

### Privacidad y borradores

Privado = excluido de MCP y de packs automáticos, no cifrado. Los lectores MCP no cambian. Borradores del asistente y de la guía viven solo en memoria. Desactivar la UI no borra tablas. Borrar espacio/grupo cascada la preparación.

Invokes P03 en `app/src-tauri/src/lib.rs:566`. Detalle, evidencia y brechas: [PLANTEAMIENTO-P03 §14](../planificacion/PLANTEAMIENTO-P03.md#14-estado-de-esta-entrega).

---

## P04 — Contrato aditivo de navegación

Fecha de decisión: **2026-09-17**. El product owner autoriza implementar P04 al alcance técnico (búsqueda local de nombres + e2e) sin esperar research ni piloto humano. Contrato: [WBS-P04](../planificacion/WBS-P04-NAVEGACION.md). No hay tabla nueva ni índice persistente.

> Research con usuarios, línea base y G4 pendientes. Terminar el código no satisface utilidad.

### Lecturas de escritorio

Dos comandos, fuera de `Reader` y de MCP:

| Comando | Contrato |
| --- | --- |
| `list_navigation_catalog` | Snapshot de nombres de grupo/espacio/pieza. Sin nota, payload, pack, marcada, rutas ni URLs. Máximo 20 000 entidades y 8 MiB UTF-8; exceso = error, nunca un recorte presentado como catálogo completo |
| `resolve_navigation_target` | Identidad y padres actuales por tipo+ID. `found` / `notFound`; un fallo técnico no es ausencia |

La UI compara, ordena y acota en memoria (D07–D08). Activar un resultado solo navega o enfoca. Iniciar, marcar y pack siguen siendo gestos de mesa. El catálogo se reconstruye al abrir el diálogo; las consultas no se persisten.

Invokes P04 en `app/src-tauri/src/lib.rs`. Detalle: [WBS-P04 §17](../planificacion/WBS-P04-NAVEGACION.md#17-estado-de-esta-entrega-2026-09-17).

