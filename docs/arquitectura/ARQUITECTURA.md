# Arquitectura de Paravel

Complementa [`PRODUCTO.md`](../producto/PRODUCTO.md) a nivel de implementación. No lo sustituye.

Cubre: capa **Iniciar**, modelo de datos y MCP de lectura para un cliente local (implementado y verificado por E2E automatizado; aceptación humana pendiente). El kit reutilizable de spawn está también en [`CAPAS.md`](./CAPAS.md).

---

## 0. Contexto

Paravel es primero un workspace de escritorio: piezas reales por proyecto e **Iniciar**. Grok Bot es capa opcional. Paravel funciona sin él.

Antes de construir: capas reutilizables, no código solo de Paravel. Criterios: sencillo, seguro, auditable, fácil de debuggear, clean, que se entienda qué pasa.

Criterio de avance: un Tauri mínimo que abra una carpeta en VS Code y dos URLs en Firefox, con el argv en un log. Si ese argv no se puede pegar en una terminal y obtener lo mismo, no se sigue a Paravel.

---

## 1. Framework: Tauri v2, no Electron

- **Tauri:** frontend web (React) + backend Rust. No empaqueta Chromium+Node como Electron.
- **Sidecar:** binario extra empaquetado por Tauri. Este diseño **no usa sidecar** para Iniciar: el host es el propio proceso Rust.
- **capabilities.json:** permisos declarados, auditables sin leer código. Ayuda; **no es la cerradura** si Rust spawnea por `ShellExt` (ese camino no pasa por el scope del plugin).

Por qué no Electron: `child_process.exec()` sin capa de permisos nativa. Tauri v2 declara qué comandos ve el frontend.

Regla profunda: el frontend **nunca** tiene `shell:allow-execute`. Solo `invoke` a comandos propios (`launch_vscode`, `launch_firefox`, …). Rust valida, arma argv, loguea, spawnea el `.exe`.

---

## 2. Capas (arriba → abajo)

```text
SQLite: grupo, espacio, pieza, pack_pieza
  ↑ consultas de lectura
app/crates/paravel-context (biblioteca Rust sin Tauri ni efectos de escritura/spawn)
  ↑ wrappers de lectura Tauri              ↑ consultas acotadas por espacio + pack
app/src-tauri/src/db.rs                    app/crates/paravel-mcp
  ↑ invoke                                ↑ stdio
UI React                                  cliente MCP local
  ↓ invoke de escritura / Iniciar
Rust Tauri: validación, CRUD, migraciones, argv y spawn
```

Tauri y MCP comparten consultas/DTO, **no privilegios**. La UI conserva lecturas de sede y comandos de escritura/Iniciar; MCP registra solo tres herramientas de lectura de una mesa. El binario independiente abre SQLite read-only y no llama al inicializador Tauri que migra y siembra datos.

Cada frontera se valida en Rust. Compartir biblioteca no expone invokes, adaptadores de lanzamiento ni SQL libre al modelo. Extracción implementada y verificada automáticamente; resultados y aceptación humana pendiente en [WBS-MCP.md](../planificacion/WBS-MCP.md).

---

## 3. Iniciar — corazón

### 3.1 Lo que se descartó

Regex tipo `^[^;&|]+$` en capabilities como “seguridad”. No prueba que la ruta sea tuya ni que exista. En Windows `;` `|` no son el ataque si ya hay argv… **salvo** que el proceso sea un `.cmd` (ver 3.3).

Llamar `ShellExt` desde Rust creyendo que `capabilities.json` corta ese disparo. No lo corta.

Asumir `code` / `firefox` en PATH.

### 3.2 Flujo

1. UI empaqueta intención tipada: `{ kind: "vscode", path: "..." }` o `{ kind: "firefox", urls: [...] }`. React no construye comando.
2. `invoke()` cruza a Rust. Puerta única.
3. Rust valida, en orden:
   - existe la función de ese `kind` (allowlist = el código que escribiste);
   - **path kinds** (`vscode`, `carpeta`, archivo): `canonicalize`, cae bajo un root permitido, es el tipo de entrada esperado (dir/file);
   - **url kinds** (`firefox`, Notion URL): solo `http`/`https` (otro predicado, mismo sitio en Rust);
   - el **`.exe` objetivo existe** (`Code.exe`, `Cursor.exe`, `firefox.exe` — no `code.cmd`).
4. Solo entonces argv como lista de strings. Spawn directo al `.exe`.
5. Log del argv exacto (archivo de log, no hace falta tabla SQLite en el mínimo).

### 3.3 Windows: no spawnear `.cmd`

`code.cmd` es el atajo de terminal. `std::process::Command` sobre `.cmd`/`.bat` entra por `cmd.exe /c`. Ahí sí hay shell.

El host llama:

- VS Code: `Code.exe` (p. ej. `%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe`) + `--new-window` + path
- Cursor: `Cursor.exe` + path
- Firefox: `firefox.exe` + `--new-window` + urls

### 3.4 Aceptación

Reproducir a mano el argv del log. Si no, no se sigue a Paravel.

---

## 4. Datos: SQLite local

No Notion como backend (Notion es pieza, no motor). Persistencia local sin backend de red; el cliente MCP puede enviar resultados a su proveedor de modelo, por lo que stdio local no garantiza inferencia local. Esquema listo para sync futuro, sync no se construye ahora.

Freeze por uso (WBS 3.8): [`MODELO.md`](./MODELO.md). Lo que está en rusqlite + invokes es el modelo; no se agregan tablas «por si acaso».

```sql
CREATE TABLE grupo (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  orden       INTEGER NOT NULL,
  creado_en   TEXT NOT NULL,
  editado_en  TEXT NOT NULL
);

CREATE TABLE espacio (
  id          TEXT PRIMARY KEY,
  grupo_id    TEXT NOT NULL REFERENCES grupo(id),
  nombre      TEXT NOT NULL,
  nota        TEXT,
  bot_activo  INTEGER NOT NULL DEFAULT 0,
  creado_en   TEXT NOT NULL,
  editado_en  TEXT NOT NULL
);

CREATE TABLE pieza (
  id          TEXT PRIMARY KEY,
  espacio_id  TEXT NOT NULL REFERENCES espacio(id),
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

- `id` uuid (TEXT), no autoincrement.
- `payload` JSON según `kind`; Rust valida la forma, no SQLite.
- timestamps en entidades; `pack_pieza` es relación sin timestamps.
- `marcada` en la pieza: Iniciar sin tocar reproduce la última selección; no autoriza MCP.
- `pack_pieza` conserva la selección compartida; Rust verifica pertenencia al guardar y MCP vuelve a comprobar espacio + selección al leer. Pack vacío no expone todas las piezas.
- `bot_activo` es estado de preparación de pack de la UI, no autenticación MCP. La nota sigue compartida por el proceso configurado aunque sea 0 o se ejecute `clear_invite`; revocar futuras lecturas exige desconectar y terminar el proceso.

No se persiste viva/desconectada: se recalcula al abrir el espacio. El log de spawn es archivo, no tabla del modelo central.

### Agregar pieza

1. UI: diálogo nativo del SO para carpetas (no texto libre).
2. Rust valida **antes** del INSERT (canonicalize / URL / API Notion si aplica).
3. Se guarda la forma ya verificada.
4. UI enseña el resultado real o el error; si falla, no hay fila.
5. Al abrir el espacio, re-check “viva”.

Dos “permisos”: el del SO (sale al operar) y el de Paravel (si no hay función `kind`, no hay camino).

---

## 5. Bot de mesa y cliente local

El Bot que recibe un pack manual y el cliente que ejecuta MCP son integraciones distintas. Una VM remota no alcanza un servidor stdio de Windows: este alcance no crea un puente a Grok Bot ni orquesta Bots entre espacios. El aislamiento MCP es una restricción del proceso y de sus consultas, no una promesa de aislamiento del proveedor del modelo.

---

## 6. Preparar pack, y MCP (opcional)

Paravel ya es producto sin Bot. **Preparar pack** guarda una selección y permite copiar texto; no conecta un Bot ni abre un chat. El humano pega el texto y añade excerpts/adjuntos si hacen falta. SQLite no almacena esos contenidos manuales. Ver [PACK.md](../pack/PACK.md).

| Vía | Qué comparte | Quién entrega el contexto |
| --- | --- | --- |
| Pack manual completo | Nota y todas las piezas de una mesa, más excerpts/adjuntos seleccionados a mano | El humano lo arma y pega en el chat |
| Pack seleccionado en la UI | Nota y piezas guardadas en `pack_pieza` | La UI copia texto; el humano lo pega |
| MCP local | Nota, metadatos de la mesa y piezas actuales de `pack_pieza` | Cliente local inicia `paravel-mcp` y llama tools |

Contrato fijo: `leer_espacio`, `listar_piezas`, `leer_contexto_pieza`. No existe `listar_espacios` en MCP. Solo se devuelve el grupo como etiqueta; sin inventario de sede, escritura, lanzamiento, lectura de archivos ni fetch de URLs. Paths y URLs del payload son datos, no acceso a su contenido.

```text
Manual:   humano --pack de una mesa--> chat del Bot
MCP:      cliente local --stdio--> paravel-mcp --paravel-context--> SQLite read-only
Iniciar:  UI --invoke--> Rust Tauri --validación/argv--> proceso del SO
```

`app/crates/paravel-mcp` usa el SDK oficial `rmcp = "=3.4.0"` y la biblioteca de lectura pura `app/crates/paravel-context`, compartida con Tauri. CLI: `--db ABSOLUTE_SQLITE_PATH --espacio UUID`, además de `--help` y `--version`. Sin sidecar, listener de red, túneles ni servicio 24/7. Build, ruta del exe, configuración `mcpServers` y fuentes oficiales están en [WBS-MCP.md](../planificacion/WBS-MCP.md).

**Autoridad:** el operador fija el espacio al arrancar. Ni el system prompt, ni una sesión MCP, ni un argumento del modelo pueden elegir otro. Cada consulta comprueba pertenencia de la pieza al espacio y presencia en `pack_pieza`; no basta validar al iniciar. Pack vacío devuelve cero piezas, sin fallback. `marcada` y `bot_activo` no autorizan MCP.

**Retirada:** `clear_invite` vacía el pack y pone `bot_activo = 0`, pero la nota y los metadatos siguen disponibles mientras el proceso esté conectado. Para revocar futuras lecturas de la nota, deshabilitar la entrada del cliente y terminar el proceso, evitando reinicio automático. Cerrar Tauri no lo detiene. No se puede retirar retroactivamente contexto ya entregado.

**Protocolo y estado:** SDK exacto 3.4.0 con lockfiles y build release verificados. El default upstream es `2025-11-25`; además, las pruebas de cable pasan `server/discover` con metadatos por petición en `2026-07-28` y negociación legacy `2024-11-05`, `2025-03-26`, `2025-06-18`, `2025-11-25`. Implementación y E2E automatizado completos: contexto 17 tests, MCP 5 unitarios + 18 integraciones reales stdio, Tauri 5 tests de biblioteca, clippy de las tres crates, fmt de crates nuevas, frontend build y release/CLI PASSED. Evidencia en [WBS-MCP.md](../planificacion/WBS-MCP.md). No se configuró conexión en el Cursor/opencode del usuario y no se repitió la regresión interactiva WebView 3.8 esta ronda; la aceptación histórica no sustituye esa comprobación final.

---

## 7. Fuera de scope ahora

Túneles, MCP público, 24/7, scopes para terceros, registrar `iniciar_espacio`, sync entre dispositivos, motor de vistas tipo Notion detallado.

**MCP local de lectura está implementado como etapa 4**, con E2E automatizado completo, después de aceptar históricamente 2.9 y 3.8. [WBS-MCP.md](../planificacion/WBS-MCP.md) registra evidencia técnica y las puertas humanas aún abiertas: cliente personal y regresión interactiva WebView. Chat + pack sigue siendo una vía independiente; MCP no es el asiento del Bot.

---

## 9. Orden de avance (cerrado)

```text
pack + chat  →  Iniciar (Tauri mínimo)  →  pantalla de espacio  →  MCP local de lectura
```

Detalle de entregables, expectativa y reutilización: [`ETAPAS.md`](../planificacion/ETAPAS.md) · infografía [`etapas.html`](../visual/etapas.html). Paquetes de trabajo: [`WBS.md`](../planificacion/WBS.md).

1. **Pack + chat** — Bot sentado en una carpeta/espacio, conversación, sin tools formales.
2. **Iniciar** — Tauri mínimo: `Code.exe` + carpeta, `firefox.exe` + URLs, argv en log, reproducible a mano.
3. **Pantalla de espacio** — UI de mesa, marcar, play; SQLite detrás.
4. **MCP** — implementado y E2E automatizado completo; aceptación del cliente personal y regresión interactiva WebView pendientes para 4.9.

---

## Glosario

- **Argv** — argumentos ya partidos. Sin shell que interprete.
- **Canonicalizar** — ruta absoluta real (`..`, symlinks).
- **Frontera de confianza** — invokes UI → Rust Tauri; tools MCP → consultas de lectura autorizadas por espacio + pack.
- **kind** — tipo de pieza; elige función Rust y forma de payload.
- **Payload** — JSON de la pieza según kind.
- **MCP** — protocolo para que un modelo llame herramientas.
- **Capability** — permiso Tauri declarado; no sustituye la validación Rust del spawn.
