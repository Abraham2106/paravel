# Paravel MCP local

`paravel-mcp` permite a un cliente MCP leer la nota y las piezas compartidas de una única mesa de Paravel. El cliente inicia un proceso por stdio con una DB y un UUID fijos. La app Tauri crea y mantiene la SQLite; este ejecutable la abre en modo solo lectura, sin migraciones ni seed. Los payloads son datos persistidos: no se abren sus archivos, carpetas ni URLs.

Esta guía describe instalación y comprobación; no certifica una conexión en un cliente concreto. El estado de aceptación y sus evidencias pertenecen a [WBS-MCP.md](../../../docs/planificacion/WBS-MCP.md).

## Compilar

Desde la raíz del repositorio, con Rust/Cargo 1.88 o superior, el toolchain MSVC y Visual Studio Build Tools con herramientas C++ y Windows SDK en Windows:

```powershell
cargo build --release --locked --manifest-path app/crates/paravel-mcp/Cargo.toml
```

La crate usa `rmcp = "=3.4.0"` y una dependencia local `../paravel-context`; conservar ambas crates y el `Cargo.lock` al compilar. La primera compilación necesita descargar las dependencias o disponer de ellas en la caché de Cargo. Si falla `--locked`, resolver la entrega o el lockfile: no quitar esa opción para simular un build reproducible.

No hay workspace de Cargo en la raíz. Sin personalizar `CARGO_TARGET_DIR`, `--target` ni la configuración de Cargo, el resultado Windows es `app/crates/paravel-mcp/target/release/paravel-mcp.exe`, separado del ejecutable Tauri. Usar la ruta real de salida si se personaliza el target.

```powershell
& '.\app\crates\paravel-mcp\target\release\paravel-mcp.exe' --help
& '.\app\crates\paravel-mcp\target\release\paravel-mcp.exe' --version
```

Ambos comandos terminan sin abrir una DB y escriben su información en stderr. El servidor normal recibe `--db RUTA_ABSOLUTA --espacio UUID`, sin argumentos adicionales. Rutas relativas, UUID inválido o flags repetidos se rechazan. Iniciarlo manualmente sin enviar mensajes MCP lo deja esperando stdin; eso no comprueba una conexión.

## Elegir qué se comparte

1. Abrir Paravel normalmente para crear o actualizar su DB. Obtener su ruta efectiva mediante el invoke local `db_path` en un entorno de desarrollo Tauri de confianza. No deducirla del nombre del producto ni crear una SQLite vacía para MCP.
2. Obtener `Space.id` de `list_spaces` y contrastar nombre/grupo con la mesa elegida; `list_groups` permite resolver el grupo. Son comandos locales de Tauri, no herramientas MCP. No hay un botón «copiar UUID» ni se garantiza invocar Tauri desde una consola externa.
3. Como alternativa para conocer el UUID, abrir la DB conocida con una herramienta SQLite local en **modo solo lectura** y ejecutar la consulta siguiente. El MCP no ofrece SQL ni inventario de otras mesas.
4. Revisar la nota completa y guardar la selección en **Preparar pack / Editar pack → Guardar**. Las casillas de **Iniciar** y las selecciones sin guardar no autorizan piezas. Revisar la selección inicial que proponga la UI.

```sql
SELECT e.id, e.nombre, g.nombre AS grupo
FROM espacio e JOIN grupo g ON g.id = e.grupo_id
ORDER BY g.nombre, e.nombre;
```

**Habilitar una mesa autoriza siempre su nota y metadatos**, incluso con el pack vacío o `bot_activo = 0`. Solo las piezas guardadas en `pack_pieza` y pertenecientes a esa mesa son visibles. **Quitar pack** revoca las piezas para la próxima llamada, pero no la nota. Para revocar también la nota hay que deshabilitar el servidor en el cliente y terminar su proceso. El cliente puede conservar datos ya recibidos en su historial.

El usuario debe revisar esta selección antes de habilitar el cliente. Compartir datos mediante un cliente local puede entregarlos al modelo/proveedor que ese cliente utilice; stdio local describe el transporte a Paravel, no el destino posterior de las respuestas. **Stdio no autentica:** quien pueda lanzar el exe con `--db` y `--espacio` lee esa mesa. El servidor no pide credenciales; la frontera de confianza es el equipo y la configuración del cliente.

## Configurar el cliente local

[cursor-mcp.example.json](./cursor-mcp.example.json) es una plantilla con placeholders, no una configuración instalada. Sustituir `REPLACE_WITH_REPO`, `REPLACE_WITH_DATABASE_DIRECTORY` y `REPLACE_WITH_SPACE_UUID` por valores verificados. Ajustar también el nombre del archivo si la DB real no se llama `paravel.sqlite3`.

```json
{
  "mcpServers": {
    "paravel-mesa": {
      "type": "stdio",
      "command": "C:/REPLACE_WITH_REPO/app/crates/paravel-mcp/target/release/paravel-mcp.exe",
      "args": [
        "--db", "C:/REPLACE_WITH_DATABASE_DIRECTORY/paravel.sqlite3",
        "--espacio", "REPLACE_WITH_SPACE_UUID"
      ]
    }
  }
}
```

El formato y `type: "stdio"` corresponden a la [configuración oficial de Cursor](https://cursor.com/docs/mcp). Cursor permite `.cursor/mcp.json` en el proyecto o `~/.cursor/mcp.json` para configuración personal. Incorporar únicamente esta entrada, preservando las demás, mediante el mecanismo de configuración del cliente elegido. No versionar las rutas privadas en una configuración compartida. Otros clientes pueden requerir otra estructura.

`command` es la ruta al exe; cada argumento es un elemento separado. Las rutas con espacios no necesitan comillas adicionales dentro del valor JSON. Usar `/` o escapar cada barra Windows como `\\`. No envolver el exe en PowerShell, `cmd.exe` ni `cargo run`. Elegir un nombre identificable por mesa; cada proceso mantiene un solo ámbito. Cambiar DB o UUID requiere editar configuración de confianza y reiniciar.

## Comprobación mínima

Primero, ejecutar las pruebas con fixtures temporales sin datos personales desde la raíz:

```powershell
cargo test --locked --manifest-path app/crates/paravel-mcp/Cargo.toml --test stdio
```

La suite contiene inicialización, descubrimiento, lecturas autorizadas, rechazo entre espacios, retirada del pack, paginación, límites y cierre por EOF. Este comando documentado no implica que ya se haya ejecutado ni sustituye la aceptación del cliente elegido.

Después, con una mesa de prueba cuyo contenido pueda compartirse:

1. Habilitar la entrada en el cliente. Registrar nombre/versión del cliente y salida `--version` del binario.
2. Confirmar `initialize`, la versión devuelta y `notifications/initialized` antes de llamar a herramientas. `server.rs` usa `ServerConfig` predeterminado del SDK fijado; la referencia de este contrato y la suite stdio es **2025-11-25**. Registrar la negociación real: no dar por probado **2026-07-28** por existir una constante en el SDK. Véase el [ciclo de vida MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle).
3. `tools/list` debe descubrir exactamente `leer_espacio`, `listar_piezas` y `leer_contexto_pieza`, con anotaciones de lectura y schemas. No debe aparecer `listar_espacios`.
4. Llamar `leer_espacio` con `{}`, `listar_piezas` con `{ "limite": 1 }` y `leer_contexto_pieza` con `{ "pieza_id": "UUID_DE_PIEZA_INVITADA" }`. Contrastar nota, conteo y datos; el cursor se devuelve en `cursor_siguiente` y se usa en `listar_piezas`, no en `tools/list`.
5. Una pieza no invitada, de otra mesa o inexistente debe devolver `isError: true` y `NOT_FOUND_OR_NOT_VISIBLE`. Retirar una pieza en la UI, guardar y repetir: la siguiente llamada debe rechazarla. Con pack vacío, la lista queda vacía pero la nota sigue disponible.
6. Deshabilitar la entrada y comprobar que termina su proceso. Reiniciar con la misma configuración conserva el ámbito. Mantener stdout exclusivo de JSON-RPC y diagnóstico por stderr, conforme al [transporte stdio](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

Guardar evidencia sanitizada sin notas, payloads, rutas privadas ni datos reales ajenos a la prueba. La regresión de Tauri y el cierre formal se registran por separado en el WBS.

## Errores y límites

| Resultado | Acción del operador |
| --- | --- |
| `INVALID_ARGUMENT` | Revisar CLI, UUID y argumentos de la herramienta; no se admite cambiar espacio por tool. |
| `DATABASE_UNAVAILABLE` | Comprobar ruta real, permisos y bloqueos; SQLite espera hasta 2 segundos. Reintentar tras resolver la causa. |
| `SCHEMA_UNSUPPORTED` | Abrir/actualizar la DB con la versión compatible de Paravel; el MCP no la repara. |
| `NOT_FOUND_OR_NOT_VISIBLE` | Revisar mesa y pack guardado; el error no revela si existe una pieza oculta. |
| `INVALID_STORED_DATA` | Corregir datos mediante Paravel o su mantenimiento; no interpretar JSON roto como contenido válido. |
| `CONTEXT_TOO_LARGE` | Reducir contenido persistido o tamaño de página; no hay truncado silencioso. |
| `PROTOCOL_ERROR` | Revisar transporte y mensajes del cliente; no escribir texto libre a stdin. |

Las páginas admiten de 1 a 100 piezas, con 50 por defecto; la respuesta serializada se limita a 256 KiB. Las anotaciones de tools describen el comportamiento, mientras la biblioteca aplica la autorización.

## Modo HTTP experimental (túnel hacia Grok)

El mismo exe puede escuchar Streamable HTTP en loopback, con OAuth 2.1 (PKCE + DCR) y frase de operador en un archivo local. Stdio no cambia. No es un servicio 24/7 ni cierra la aceptación 4.9.

```powershell
paravel-mcp --db ABS_PATH --espacio UUID --http 127.0.0.1:8787 --public-url https://HOST --operator-secret-file ABS_PATH
```

`--http` solo admite `127.0.0.1` o `localhost`. `--public-url` debe ser la URL HTTPS del túnel (o `http://127.0.0.1:PUERTO` en pruebas locales). La frase no se imprime ni se guarda en el repo. Instrucciones de túnel y conector: [E3-TUNEL.md](../../../docs/planificacion/E3-TUNEL.md). Contrato: [EXPERIMENTO-GROK-TUNEL.md](../../../docs/planificacion/EXPERIMENTO-GROK-TUNEL.md).

## Actualizar o desinstalar

Para actualizar, deshabilitar la entrada, esperar el cierre del proceso, recompilar con `--locked`, comprobar `--version` y repetir la conexión antes de habilitarlo para datos reales.

Para desinstalar, deshabilitar y retirar únicamente la entrada `paravel-mesa`, terminar su proceso si el cliente no lo cerró y evitar su reinicio automático. Se puede borrar después la copia del ejecutable instalada para MCP. **Conservar `paravel.sqlite3`, sus archivos auxiliares, los datos de Paravel y la app Tauri.** Cerrar Tauri por sí solo no termina un MCP iniciado por otro cliente. Retirar el MCP tampoco borra el historial del cliente.

Fuentes consultadas el 2026-09-16: [manifiesto oficial rmcp-v3.4.0](https://github.com/modelcontextprotocol/rust-sdk/blob/rmcp-v3.4.0/Cargo.toml) y [modelo de protocolo de ese tag](https://github.com/modelcontextprotocol/rust-sdk/blob/rmcp-v3.4.0/crates/rmcp/src/model.rs), además de las guías enlazadas en cada paso. La versión fijada se comprueba en [Cargo.toml](./Cargo.toml); la aceptación requiere los resultados reales del binario.
