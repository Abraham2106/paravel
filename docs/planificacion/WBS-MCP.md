# WBS 4 — MCP local de lectura

Ampliación experimental elegida por el usuario: [puente a Grok mediante túnel temporal](./EXPERIMENTO-GROK-TUNEL.md). Reabre deliberadamente la exclusión de túneles para una mesa de prueba autenticada; no cambia el diseño permanente del MCP local ni acredita conexión o cierre de 4.9.

## Actualización: regresión nativa y cliente elegido

La regresión interactiva de Tauri con MCP release conectado ya pasó: guardar pack, revocación, Todo/Ninguno, Iniciar solo marcadas, Quitar y persistencia al reiniciar Tauri manteniendo MCP activo. EOF terminó MCP con exit 0. Informe local en `reports/` (no versionado). Esta evidencia actualiza los pendientes de regresión que figuran en las secciones históricas siguientes.

El usuario eligió **Grok web/app**, no Cursor/OpenCode. El experimento [EXPERIMENTO-GROK-TUNEL.md](./EXPERIMENTO-GROK-TUNEL.md) añade un modo HTTP opcional y autenticado en el mismo binario, más un túnel temporal. **4.9 sigue abierto**: no hay conector configurado en grok.com ni transcript de Grok.

Fecha: 2026-09-16. Estado: **implementación y E2E automatizado completos; aceptación humana pendiente**. Este documento descompone el WP 4 de [WBS.md](./WBS.md) y registra resultados PASSED comunicados por los agentes y el coordinador, contrastados con los manifiestos, CLI y pruebas actuales. La dependencia **3.8** conserva su aceptación histórica local; el recorrido interactivo WebView no se repitió en esta ronda. No se configuró ninguna conexión en el Cursor/opencode real del usuario. La aceptación final 4.9 permanece abierta.

## Resultado y límite

Un cliente MCP **local** consulta la nota y las piezas compartidas de una sola mesa mediante herramientas de lectura sobre la misma biblioteca Rust que usa Tauri. El proceso MCP no cambia SQLite, abre programas, sigue enlaces ni lee archivos referenciados por un payload. Paravel sigue funcionando sin MCP.

El contrato inicial es deliberadamente pequeño: contexto persistido, sin extracción automática de documentos. El esquema actual no guarda excerpts ni adjuntos; no se promete devolverlos. Un path es una etiqueta y una URL es un dato. Incorporar lectura de contenido necesitaría otro alcance con consentimiento de archivos, límites, canonicalización y tratamiento de secretos.

## Decisiones de implementación

- **Rust + SDK oficial `rmcp`, versión exacta `=3.4.0`.** La dependencia no sigue `main` ni un rango abierto; Los lockfiles están entregados; el de MCP fija `rmcp` 3.4.0 y el build verificado usa `--locked`. El tag oficial `rmcp-v3.4.0` declara Rust mínimo 1.88 y ofrece features `server`, `transport-io` y macros opcionales. El manifiesto MCP observado usa `server` y `transport-io`, con default-features desactivadas. Ver fuentes al final. Resolución y compilación release confirmadas por agentes y coordinador; comandos y resultados en la sección de evidencia.
- **stdio local:** `app/crates/paravel-mcp` es un binario independiente, iniciado por el cliente con `--db ABSOLUTE_SQLITE_PATH --espacio UUID`. Ofrece `--help` y `--version`. En modo servidor, stdin/stdout contienen solo mensajes MCP; diagnóstico mínimo por stderr y salida al cerrar stdin. No usa puerto, shell, sidecar Tauri ni IPC propio.
- **Biblioteca compartida:** `app/crates/paravel-context` contiene consultas y DTO Rust de solo lectura, sin dependencia de Tauri, migraciones, seed, escritura ni spawn. Los wrappers de `app/src-tauri/src/db.rs` delegan sus lecturas; la UI conserva su alcance local y sus comandos de escritura/Iniciar. Compartir biblioteca no concede al MCP las facultades de la UI.
- **Conexión MCP read-only:** abre una SQLite existente y compatible. No llama `db::open`, que crea directorios, migra y siembra datos. La app Tauri sigue siendo responsable del ciclo de vida de la DB.
- **Ámbito inmutable por proceso, comprobado en cada llamada.** `--espacio` se fija en configuración local de confianza. Ni prompt, ni sesión MCP, ni parámetros del modelo son autoridad para elegir otra mesa.
- **Visibilidad por `pack_pieza`:** solo piezas actualmente incluidas y pertenecientes al espacio configurado. Pack vacío = cero piezas, sin fallback a toda la mesa. `marcada` pertenece a Iniciar y no autoriza lecturas. Consultar permiso y datos juntos, sin caché de contenido; retirar una pieza afecta la siguiente llamada, no deshace una respuesta ya entregada.
- **Nota siempre compartida:** configurar un espacio autoriza su nota y metadatos aunque el pack esté vacío o `bot_activo` sea 0. `clear_invite` vacía `pack_pieza` y pone `bot_activo = 0`; no desconecta MCP ni revoca la nota. Para detener futuras lecturas de la nota hay que deshabilitar la entrada del cliente y terminar su proceso. No se promete autenticación mediante `bot_activo` ni borrado de contexto ya recibido por el cliente.
- **Sin mapa global:** no se registra `listar_espacios`; el grupo es solo una etiqueta de la mesa autorizada. No hay puente hacia una VM de Grok Bot.

Son decisiones de Paravel, reflejadas en [ARQUITECTURA.md](../arquitectura/ARQUITECTURA.md) y [PACK.md](../pack/PACK.md), no permisos concedidos por MCP.

### SDK, protocolo y cliente: hechos frente a aceptación

| Elemento | Base comprobada / decisión | Pendiente |
| --- | --- | --- |
| SDK | `rmcp = "=3.4.0"`, resuelto a 3.4.0 en `app/crates/paravel-mcp/Cargo.lock`; lockfiles de contexto y Tauri presentes; build release PASSED | Sin bloqueo técnico de resolución |
| Legacy | `ProtocolVersion::LATEST`/default upstream es `2025-11-25`; pruebas de cable negocian `2024-11-05`, `2025-03-26`, `2025-06-18` y `2025-11-25` y leen contexto | Registrar versión efectiva del cliente del usuario |
| Revisión `2026-07-28` | E2E real stdio pasa `server/discover`, metadatos por petición, `tools/list`, lectura, rechazo de pieza ajena y versión no soportada; anuncia las cinco revisiones | No equivale a conexión en Cursor/opencode del usuario |
| Cliente local | Cliente automatizado lanza el binario real con fixtures; no es un mock. Ejemplo genérico `mcpServers` compatible con el formato de Cursor | Elegir/configurar el cliente real, registrar nombre/versión, consentimiento y aceptación humana |

En legacy se prueba `initialize` → respuesta con la misma versión ofrecida → `notifications/initialized` → tools. En `2026-07-28` se prueba `server/discover` y `_meta` por petición, sin imponer el handshake legacy. `LATEST` no limita por sí solo las versiones soportadas: la evidencia es el intercambio real en `app/crates/paravel-mcp/tests/stdio.rs`. Ambos caminos conservan el mismo ámbito de mesa fijado por proceso; metadatos de protocolo no amplían autorización.

## Árbol de entregables

```text
4     MCP local de lectura                            [implementado; E2E automatizado completo; aceptación humana pendiente]
├── 4.1  Contrato, versiones y entrada a implementación
├── 4.2  Servicio de lectura Rust compartido
├── 4.3  Ámbito de espacio y autorización de piezas
├── 4.4  Herramientas tipadas de contexto
├── 4.5  Ejecutable y transporte stdio
├── 4.6  Errores, límites y diagnóstico
├── 4.7  Pruebas de aislamiento y ausencia de efectos
├── 4.8  Instalación y conexión de cliente local
└── 4.9  Aceptación y cierre con evidencia
```

| WP | Entregable | Dependencias | Se acepta si |
| --- | --- | --- | --- |
| **4.1** | Contrato MCP, SDK exacto, protocolo/cliente registrados y arquitectura/pack coherentes | **3.8 aceptado con evidencia** | No hay contradicciones; versiones efectivas y matriz de compatibilidad verificadas. Ningún cambio reabre modelo/Iniciar. |
| **4.2** | `paravel-context` independiente de Tauri; wrappers UI delgados; conexión MCP read-only | 4.1 | UI mantiene sus consultas; MCP consulta SQLite sin crear DB, migrar ni escribir. DB ausente/schema incompatible falla sin reparación implícita. |
| **4.3** | Contexto inmutable y SQL autorizado por espacio + pack | 4.2 | IDs ajenos, piezas no invitadas y relaciones corruptas no devuelven datos. Retirada del pack afecta la siguiente llamada; nota sigue visible tras `clear_invite`. |
| **4.4** | Tres herramientas con schemas de entrada/salida y resultados estructurados | 4.3 | `tools/list` enumera solo el contrato inferior; tipos, límites y errores probados. Sin escritura, SQL libre o shell. |
| **4.5** | `paravel-mcp` stdio, CLI y rutas Windows seguras | 4.2, 4.4 | Cliente real intercambia mensajes; stdout limpio; EOF termina el proceso; reinicio conserva ámbito; ningún listener de red. `--help`/`--version` terminan sin abrir DB. |
| **4.6** | Errores públicos, límites, timeout SQLite y diagnóstico mínimo | 4.4, 4.5 | Payload roto, DB ocupada y respuesta excesiva fallan explícitamente; diagnóstico sin nota, payload, secretos ni rutas privadas. |
| **4.7** | Suite Rust e integración stdio con dos espacios y pack parcial | 4.3–4.6 | Matriz inferior pasa con comandos, versiones y resultados reproducibles. |
| **4.8** | Guía local de build, configuración, selección y desconexión | 4.5–4.7 | Un tercero configura exe, DB y UUID sin modificar código; comprueba qué comparte y puede detenerlo. No se afirma conexión remota. |
| **4.9** | Aceptación del cliente elegido, transcript sanitizado y regresión Tauri | 4.7, 4.8 | Lee A/pieza permitida, rechaza B/no invitada, respeta retirada, no altera DB/log de lanzamientos y no rompe 3.8. El coordinador confirma el cierre. |

### Estado consolidado de las puertas

| WP | Estado al cierre técnico |
| --- | --- |
| 4.1 | Contrato, SDK/lockfiles y matriz de protocolo verificados; falta identificar la versión del cliente del usuario |
| 4.2–4.6 | Implementados y verificados automáticamente: biblioteca compartida, aislamiento, tools, CLI/stdio, errores y límites |
| 4.7 | E2E automatizado completo: 17 tests de contexto, 5 unitarios MCP y 18 integraciones con proceso real; PASSED |
| 4.8 | Build release y guía listos; conexión en Cursor/opencode del usuario no configurada |
| 4.9 | **Abierto**: falta aceptación en cliente real y repetir regresión interactiva WebView 3.8 |

Secuencia de aceptación: `3.8 → 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6 → 4.7 → 4.8 → 4.9`. Los resultados automáticos no sustituyen las puertas humanas.

## Contrato de herramientas v1

El ámbito no es un parámetro elegible por el modelo. El nombre configurado del servidor identifica la mesa para el usuario. Los schemas rechazan propiedades desconocidas, incluidos `espacio_id`, `path`, `sql` y `command` introducidos donde no corresponden.

| Herramienta | Entrada | Salida y límite de autoridad |
| --- | --- | --- |
| `leer_espacio` | `{}` | ID, nombre, etiqueta de grupo, nota y cantidad de piezas compartidas del espacio configurado. Sin inventario global ni contador de piezas ocultas. |
| `listar_piezas` | `{ "limite"?: 1..100, "cursor"?: string }` | Página determinista de ID, nombre y kind de las piezas actuales de `pack_pieza`. Default 50. Cursor ligado al espacio; nunca sustituye la autorización. |
| `leer_contexto_pieza` | `{ "pieza_id": UUID }` | ID, nombre, kind y payload persistido si pertenece al espacio y sigue invitada. Sin abrir path, recorrer carpeta, fetch ni adaptador. |

Las herramientas publican `inputSchema`, `outputSchema`, `structuredContent` y JSON serializado como texto compatible; anotaciones `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true` y `openWorldHint: false`. Son metadatos, no seguridad. `arguments` debe ser un objeto explícito: omitirlo o enviar `null` no equivale a `{}`. Resultados de éxito: `leer_espacio` devuelve `id`, `nombre`, `grupo`, `nota`, `piezas_compartidas`; `listar_piezas`, `piezas` y `cursor_siguiente` (string o null); `leer_contexto_pieza`, `id`, `nombre`, `kind`, `payload`.

Errores de dominio: `NOT_FOUND_OR_NOT_VISIBLE` (igual para ID ajeno/inexistente), `INVALID_ARGUMENT`, `CONTEXT_TOO_LARGE`, `INVALID_STORED_DATA`, `DATABASE_UNAVAILABLE`, `SCHEMA_UNSUPPORTED`. En tools se representan con `isError: true` y `{ "code": "...", "message": "..." }` estructurado y serializado en texto; herramientas desconocidas/continuaciones no admitidas usan errores JSON-RPC. Errores de arranque van por stderr con salida no cero, sin SQL ni rutas privadas. El esquema de salida describe el éxito; los errores tienen su forma propia, verificada por la suite.

Límites de producto: 256 KiB por respuesta, 100 piezas por página, espera SQLite de 2 segundos y sin reintentos ilimitados. Nota/payload indivisible demasiado grande retorna `CONTEXT_TOO_LARGE`, sin truncado silencioso ni lectura alternativa del disco. Se comprueba el tamaño serializado, incluida la representación de texto y el ID JSON-RPC; no son límites impuestos por MCP. Entrada limitada a 64 KiB por trama; cursor de 1 a 1024 bytes; UUID con guiones de 36 caracteres. Las pruebas cubren exceso de tamaño, escapes y tramas incompletas.

## Matriz mínima de pruebas

| Caso | Evidencia exigida |
| --- | --- |
| Mesa A con dos invitadas y una oculta; mesa B con otras piezas | Solo nota de A e invitadas de A. No filtrar B mediante nombres, errores, conteos o paginación. |
| Pieza B, UUID inexistente/inválido, propiedades extra | Rechazo consistente; nunca cambio de ámbito ni interpretación de path/SQL. |
| `pack_pieza` corrupto apuntando a B | JOIN comprueba ambos espacio_id y no devuelve B. |
| Retirar pieza entre llamadas | Siguiente lectura denegada; sin caché previa. |
| Pack vacío, cambios de `marcada`, `bot_activo = 0` | Cero piezas, independientemente de Iniciar/bot; la nota permanece accesible. |
| `clear_invite` y desconexión | Pack vacío tras limpiar; nota aún accesible. Deshabilitar entrada y terminar proceso impide nuevas llamadas; no borra contexto previo del cliente. |
| Nota/payload con instrucciones, URL, `file:///`, path o secreto de fixture | Datos autorizados, sin ejecución ni dereferencia. Logs sin contenido. No afirmar detección automática de secretos. |
| DB inexistente, schema incompatible, JSON roto, DB ocupada | Error definido; no crear/migrar/escribir ni colgarse. |
| Payload grande, paginación y cursor ajeno | Límite serializado explícito y orden estable; cursor no amplía ámbito. |
| UI cerrada sobre fixture congelada | Tablas/esquema idénticos antes/después, cero spawn y log intacto. No comparar binariamente SQLite mientras otra app escribe. |
| UI y MCP simultáneos; EOF/reinicio | Lecturas válidas o error controlado; sin corrupción, huérfanos ni contaminación de stdout. |
| CLI | Rechazar DB relativa, argumentos ausentes/extra y UUID inválido. `--help`/`--version` sin DB; rutas con espacios funcionan en argv separados. |
| Protocolo y cliente elegidos | Transcript de negociación efectiva, tres tools, éxito y rechazo; registrar nombre/versión del cliente y del exe. |
| Regresión de 3.8 | Entrar, marcar, Iniciar solo marcadas, quitar y persistir al reabrir tras extraer biblioteca. |

## Instalación y configuración local (4.8)

Guía de la implementación terminada y probada automáticamente, **no constancia de conexión aceptada en el cliente del usuario**. No se modifican configuraciones de clientes en esta tarea.

### 1. Compilar y verificar CLI

Prerrequisitos: Rust/Cargo compatible con el SDK (mínimo upstream 1.88) y herramientas C++ de compilación para Windows. Ambas crates y sus lockfiles están entregados. Desde la raíz del repositorio:

```powershell
cargo build --release --locked --manifest-path app/crates/paravel-mcp/Cargo.toml
```

Ejecutable release construido: `app/crates/paravel-mcp/target/release/paravel-mcp.exe`. No es el ejecutable Tauri. Los lockfiles están entregados; mantener `--locked` al reproducir la compilación. `--help` y `--version` terminan con exit 0, escriben por stderr y no abren DB; versión observada: `paravel-mcp 0.1.0 (rmcp 3.4.0)`.

```powershell
& ".\app\crates\paravel-mcp\target\release\paravel-mcp.exe" --help
& ".\app\crates\paravel-mcp\target\release\paravel-mcp.exe" --version
```

En uso normal, el cliente lanza ese exe con `--db ABSOLUTE_SQLITE_PATH --espacio UUID`. Con DB existente, compatible y espacio válido, el servidor espera protocolo por stdin; si la DB no existe, rechaza el arranque sin crearla. Este rechazo no es un smoke exitoso de lectura de una mesa real.

### 2. Elegir DB, UUID y selección compartida

- Abrir Paravel para crear/migrar su DB por el flujo normal. La app usa su directorio de datos Tauri y `paravel.sqlite3`; obtener la ruta efectiva con el invoke local existente `db_path`, no deducirla del nombre del producto ni crear una DB vacía para MCP.
- En el entorno local de confianza de la UI, consultar el resultado del invoke existente `list_spaces`: `Space.id` es el UUID; contrastar nombre y grupo con la mesa elegida. `list_groups` permite resolver la etiqueta de grupo. Estos comandos son de Tauri, **no herramientas MCP**. No se promete un nuevo botón «copiar UUID» ni acceso a invokes desde cualquier consola externa.
- Alternativa para el operador: abrir esa SQLite con una herramienta local de confianza **en modo solo lectura** y consultar `SELECT e.id, e.nombre, g.nombre AS grupo FROM espacio e JOIN grupo g ON g.id = e.grupo_id ORDER BY g.nombre, e.nombre;`. No pasar SQL al modelo ni agregar una tool global para descubrir UUIDs.
- Revisar la nota completa y las piezas en **Preparar pack / Editar pack**. Guardar la selección mediante la UI (`set_invite`) antes de conectar; las casillas sin guardar no cambian `pack_pieza`. La UI puede proponer todas las piezas al preparar un pack nuevo: revisar antes de guardar. El MCP nunca aplica ese fallback.
- El pack manual completo de PACK.md lista toda la mesa; la selección persistida que copia la UI y consulta MCP puede ser parcial. Excerpts/adjuntos manuales no aparecen automáticamente en SQLite ni en MCP.

### 3. Configuración de cliente

Ejemplo genérico `mcpServers`, con `command` y `args` separados, compatible con el formato de Cursor. Sustituir `ABSOLUTE_SQLITE_PATH` por la ruta absoluta real y `UUID` por el ID verificado antes de usarlo; dentro de JSON, escapar barras Windows como `\\` o usar `/`.

```json
{
  "mcpServers": {
    "paravel-mesa": {
      "command": "C:/REPLACE_WITH_REPO/app/crates/paravel-mcp/target/release/paravel-mcp.exe",
      "args": [
        "--db",
        "ABSOLUTE_SQLITE_PATH",
        "--espacio",
        "UUID"
      ]
    }
  }
}
```

El usuario incorpora la entrada mediante el mecanismo de configuración de su cliente local elegido; no sobrescribir otras entradas. No envolver el comando en PowerShell, `cmd.exe`, `cargo run` ni scripts. No pasar credenciales o todo el entorno en la configuración. Un nombre de servidor distinto por mesa ayuda a revisar el consentimiento; cada proceso conserva un solo ámbito.

### 4. Conectar, comprobar y retirar

1. Habilitar la entrada en el cliente y revisar sus permisos de tools. Registrar nombre/versión del cliente, salida `--version`, versión negociada y tres herramientas descubiertas.
2. Leer el espacio y una pieza invitada; comprobar rechazo de pieza no invitada y ajena con fixtures sin secretos. No usar datos privados para producir transcripts públicos.
3. Retirar una pieza en Paravel, guardar y repetir la lectura. `clear_invite` retira todas las piezas, **no la nota**. MCP no escucha `bot_activo` como autenticación.
4. Para revocar futuras lecturas de la nota, deshabilitar la entrada y terminar el proceso asociado; evitar que el cliente lo reinicie automáticamente. Cerrar solo la ventana Tauri no detiene un servidor iniciado por otro cliente. La información ya recibida puede persistir en el historial del cliente.
5. Cambiar DB o mesa requiere editar configuración de confianza y reiniciar. Ninguna tool realiza ese cambio.

## Comandos y evidencia de verificación técnica

Resultados PASSED de agentes y coordinador comunicados para esta entrega (2026-09-16), contrastados con código/lockfiles actuales. En esta finalización documental se repitieron suites Rust, build release, CLI, clippy de las tres crates y build frontend: todos pasaron. No se inició una sesión del cliente real del usuario ni un recorrido WebView.

Desde la raíz del repositorio:

```powershell
cargo test --locked --manifest-path app/crates/paravel-context/Cargo.toml
cargo test --locked --manifest-path app/crates/paravel-mcp/Cargo.toml
cargo test --locked --manifest-path app/src-tauri/Cargo.toml
cargo clippy --locked --manifest-path app/crates/paravel-context/Cargo.toml --all-targets -- -D warnings
cargo clippy --locked --manifest-path app/crates/paravel-mcp/Cargo.toml --all-targets -- -D warnings
cargo clippy --locked --manifest-path app/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo fmt --manifest-path app/crates/paravel-context/Cargo.toml -- --check
cargo fmt --manifest-path app/crates/paravel-mcp/Cargo.toml -- --check
npm.cmd --prefix app run build
cargo build --release --locked --manifest-path app/crates/paravel-mcp/Cargo.toml
```

| Verificación | Resultado y alcance |
| --- | --- |
| `paravel-context` | **17/17 PASSED**: aislamiento, pertenencia/pack corrupto, revocación y nota, WAL, límites, schema y wrappers UI de lectura |
| `paravel-mcp` unitarios | **5/5 PASSED**: validación de argumentos, schemas/anotaciones, límites de respuesta y framing |
| `paravel-mcp` integración | **18/18 PASSED**: proceso real del binario conectado por stdin/stdout, fixtures SQLite, sin mocks de transporte |
| Tauri | **5/5 tests de biblioteca PASSED**; targets main/doc-tests sin tests. No equivale a interacción WebView |
| Clippy | **PASSED** en las tres crates, `--all-targets -- -D warnings` |
| Formato | **PASSED** en las dos crates nuevas; no se afirma check de formato de todo Tauri |
| Frontend | **PASSED** `npm.cmd run build` desde `app` (equivalente al comando con `--prefix`): TypeScript + Vite |
| Release/CLI | **PASSED** build `--release --locked`; `--help`/`--version` exit 0, stdout vacío; `paravel-mcp 0.1.0 (rmcp 3.4.0)` |

Log temporal local de la repetición de suites Rust, release y CLI (fuera del repositorio). No es un documento nuevo del proyecto ni transcript del cliente del usuario. PowerShell 5.1 presenta parte de stderr como `NativeCommandError` al redirigirlo; los procesos comprobados terminaron con exit 0 y las suites reportaron `test result: ok`.

La suite E2E se reproduce por separado con:

```powershell
cargo test --locked --manifest-path app/crates/paravel-mcp/Cargo.toml --test stdio
```

También se repitió en release el caso de lectura autorizada sobre SQLite temporal: **1/1 PASSED**, 17 casos filtrados, con el comando siguiente. Es evidencia con fixture, no un smoke sobre la DB del usuario.

```powershell
cargo test --release --locked --manifest-path app/crates/paravel-mcp/Cargo.toml --test stdio discovers_exact_read_only_contract_and_reads_authorized_data -- --exact
```

Evidencia verificable en `app/crates/paravel-mcp/tests/stdio.rs`:

- `discovers_exact_read_only_contract_and_reads_authorized_data`: tres tools exactas, schemas, anotaciones, texto/structuredContent y datos autorizados.
- `every_legacy_protocol_version_negotiates`: negociación real de las cuatro revisiones legacy, seguida de listado/lectura y EOF.
- `discovery_2026_uses_per_request_metadata_and_rejects_unsupported_versions`: `server/discover` 2026-07-28, cinco versiones anunciadas, metadatos por petición, respuesta privada sin caché, lectura y rechazos.
- `foreign_hidden_and_missing_ids_are_indistinguishable_even_with_corrupt_pack`, `revocation_and_mark_changes_take_effect_between_calls` y paginación: ámbito, retirada inmediata, pack vacío y cursor ligado a mesa.
- Límites de respuestas/tramas, JSON roto, DB ocupada con recuperación, EOF/reinicio, CLI y diagnóstico sanitizado.
- `missing_database_is_not_created` e `incompatible_schema_is_not_migrated_or_seeded`: **rechazo esperado**, sin creación/reparación. No se presentan como lectura exitosa de una DB de usuario.
- Snapshots de tablas/esquema/archivos y ausencia de log de lanzamiento en fixtures. Cambios concurrentes mediante conexiones SQLite de prueba no equivalen a operar la UI nativa.

`app/package.json` define `build` como `tsc && vite build`; no existen scripts npm `lint`, `typecheck` ni `test`. No inventar comandos npm ausentes. Pruebas Node de Firefox ejecutadas en la pasada documental anterior: 4/4 PASSED; reproducción desde `app`: `node --experimental-strip-types --test scripts/firefox-group.test.mjs`.

El bloqueo temprano por ausencia de `paravel-context/Cargo.toml` quedó resuelto por la entrega integrada y las verificaciones anteriores; ya no es un pendiente técnico.

### Aceptación humana restante (4.8/4.9)

1. Elegir el cliente local real (Cursor u opencode), registrar versión y configurar el exe con DB absoluta existente y UUID verificado, usando el formato propio de ese cliente. No hay conexión de usuario configurada en esta entrega; el JSON `mcpServers` es el ejemplo compatible con Cursor, no una promesa de formato universal.
2. Revisar nota/pack y consentir la exposición; capturar un transcript sanitizado de discovery/negociación, tres tools, lectura autorizada, rechazo ajeno/no invitado, retirada de piezas y desconexión del proceso para impedir nuevas lecturas de nota.
3. Repetir el recorrido nativo 3.8 en WebView: entrar, marcar, Iniciar solo marcadas, quitar, guardar pack y comprobar persistencia al reabrir, también con MCP conectado. La aceptación histórica sigue válida como antecedente, pero **no se repitió esta regresión interactiva durante esta ronda**.
4. Registrar la confirmación humana y cerrar 4.9 solo tras esas pruebas. E2E automatizado completo no significa UI ni cliente personal aceptados.

## Operación, revisión y retirada

La configuración local de DB/espacio es de confianza; el modelo solo controla argumentos de tools. El aislamiento protege frente a llamadas fuera de ámbito, no frente a un host malicioso con acceso a la cuenta Windows ni frente a otras herramientas del cliente que ya puedan leer disco. El cliente puede enviar los resultados a su proveedor de modelo: transporte local no implica inferencia local.

Revisión de 4.7: predicados dentro de SQL, no filtrado posterior de datos globales; biblioteca compartida sin efectos; binario sin comandos de Iniciar. Contenido leído = datos de usuario, no instrucciones del servidor. Diagnóstico sanitizado; errores de DB no revelan SQL ni contenido.

Rollback: deshabilitar entrada y terminar su proceso. MCP no migra ni escribe el modelo y no necesita restaurar datos. No borrar DB, packs ni preferencias. La extracción de consultas no debe cambiar el esquema.

## Fuera del WP 4

- `iniciar_espacio`, spawn, edición, eliminación, actualización de pack y SQL libre desde MCP.
- Lectura de archivos/repositorios, extracción PDF, fetch de URLs/Notion, adjuntos y búsqueda semántica.
- Inventario global de espacios, CTO y coordinación entre Bots.
- HTTP, OAuth remoto, túneles, publicación, servicio permanente, sync y registro público.
- Conexión a Grok Bot en una VM remota: stdio Windows requiere cliente local; no se implementa puente de red.
- Resources, prompts, sampling, elicitation, subscriptions y tasks: no hacen falta para estas tres tools.

## Fuentes oficiales verificadas

Consulta: 2026-09-16. La documentación upstream y el código del tag verifican el contrato del SDK, **no una instalación local de Paravel**.

- [SDK Rust oficial, manifiesto del tag rmcp-v3.4.0](https://github.com/modelcontextprotocol/rust-sdk/blob/rmcp-v3.4.0/Cargo.toml): versión 3.4.0 y Rust mínimo 1.88.
- [Features del SDK en ese tag](https://github.com/modelcontextprotocol/rust-sdk/blob/rmcp-v3.4.0/crates/rmcp/Cargo.toml): servidor, macros y transporte IO.
- [Modelo de protocolo del tag](https://github.com/modelcontextprotocol/rust-sdk/blob/rmcp-v3.4.0/crates/rmcp/src/model.rs): `LATEST = V_2025_11_25`, default correspondiente y constante `V_2026_07_28`; distinguir conocimiento de versión y negociación efectiva.
- [Transporte 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports): stdio, mensajes UTF-8 delimitados por salto de línea, stdout exclusivo de protocolo y stderr para logs.
- [Lifecycle 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle): inicialización, negociación, operación y cierre.
- [Tools 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools): schemas, resultados estructurados/texto y errores.

**Cierre técnico:** implementación, lockfiles SDK 3.4.0, build release/CLI, lint, formato de crates nuevas y E2E automatizado completos y PASSED. **Cierre de aceptación 4.9 pendiente:** no hay conexión configurada en el Cursor/opencode del usuario ni regresión interactiva WebView 3.8 repetida esta ronda. Las comprobaciones con fixtures no se presentan como aceptación del entorno personal.
