# E.2 Adaptador HTTP local — spec de implementación

Estado: **implementado y validado localmente** el 2026-09-16. Coordinador y responsable de código confirman 8 tests unitarios + 19 HTTP + 18 stdio aprobados, Clippy limpio y formato comprobado. E.3 tiene guía operativa preparada, sin túnel abierto; E.4 (Grok real) y E.5 (comparación) pendientes. Esta validación local no acredita una conexión remota.

Contrato de código para el experimento [EXPERIMENTO-GROK-TUNEL.md](./EXPERIMENTO-GROK-TUNEL.md) §10. No cierra 4.9 ni acredita conexión a Grok.

## Objetivo

El mismo binario `paravel-mcp` ofrece un modo HTTP opcional. Stdio sigue siendo el modo por omisión y conserva sus pruebas. Las tres tools, el ámbito `--espacio` y `paravel-context` no se duplican.

## CLI

Stdio (sin cambios de semántica):

```text
paravel-mcp --db ABS_PATH --espacio UUID
paravel-mcp --help
paravel-mcp --version
```

HTTP (todos los flags de stdio más):

```text
paravel-mcp --db ABS_PATH --espacio UUID --http 127.0.0.1:8787 --public-url https://HOST --operator-secret-file ABS_PATH
paravel-mcp --db ABS_PATH --espacio UUID --http 127.0.0.1:8787 --public-url http://127.0.0.1:8787 --operator-secret-file ABS_PATH
```

Reglas:

- `--http` exige `host:port`. Solo `127.0.0.1` o `localhost` (loopback). Rechazar `0.0.0.0`, `::`, `::1` publicado, IPs LAN. Mensaje `INVALID_ARGUMENT` por stderr, exit 2, stdout vacío.
- `--http` exige `--public-url`. Sin path o con path `/` únicamente. Scheme `https` salvo loopback `http://127.0.0.1` / `http://localhost` para pruebas locales. Recortar slash final. El issuer/resource se derivan de esta URL, no del bind.
- `--operator-secret-file` es **obligatorio en HTTP**: ruta absoluta, archivo privado fuera del repositorio, un solo renglón UTF-8 sin BOM, mínimo 16 caracteres imprimibles ASCII. Si falta, rechazar con `INVALID_ARGUMENT`, exit 2, stdout vacío y sin abrir listener. Nunca generar un secreto como fallback ni imprimirlo, tampoco «una sola vez» en stderr. No registrar su contenido ni ruta; no admitir secretos en argumentos, URL, historial o logs. En stdio no se necesita ni admite este flag.
- `--help`/`--version` siguen sin abrir DB ni bind. `--help` menciona el modo HTTP.
- Flags desconocidos, repetidos o HTTP sin `--db`/`--espacio`: igual que hoy.
- Ctrl+C / cierre del listener termina el proceso. No hay servicio Windows ni restart automático.

## Transporte MCP

- Feature `rmcp`: añadir `transport-streamable-http-server` manteniendo `=3.4.0`, `server` y `transport-io`.
- `StreamableHttpService::new` + `LocalSessionManager` + configuración de `StreamableHttpServerConfig` con `json_response = true`; no depender de SSE. Comprobar el GET streaming del cliente real, no asumir compatibilidad por el nombre del transporte.
- Montar en `/mcp` con axum 0.8 (`nest_service`). Bind `tokio::net::TcpListener` al socket de `--http`.
- Factory del handler: clonar el `Reader` ya abierto (o `ContextServer` clonable). No reabrir la DB por petición si el Reader existente es `Arc<Mutex<Reader>>` — reutilizar `ContextServer` como está.
- No habilitar feature `auth` de rmcp (es cliente OAuth).
- No registrar SSE dedicado. `/mcp` admite POST/DELETE; GET autenticado devuelve 405. Streamable HTTP JSON es el camino; comprobar en E.4 que Grok no dependa de SSE.
- Cuerpo máximo 64 KiB antes de parsear. Tramas/respuestas MCP conservan 256 KiB.

## Autenticación OAuth 2.1 (servidor local, en memoria)

Las páginas xAI consultadas no documentan un campo de Bearer estático en el diálogo de conectores personalizados; no prueban que sea imposible ni garantizan este flujo OAuth exacto. OAuth 2.1 es la decisión de E.1, **pendiente de verificar en la cuenta real**. El adaptador propuesto es el authorization server y el resource server; usar `rmcp` para transporte no convierte este OAuth propio en una implementación auditada.

Estado: `HashMap` detrás de `Mutex`/`RwLock`. Nada a disco. Reiniciar = revocar.

### Endpoints públicos (sin Bearer)

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/.well-known/oauth-protected-resource` | RFC 9728. `resource` = `{public-url}/mcp`, `authorization_servers` = `[{public-url}]`, `scopes_supported` = `["mcp"]`, `bearer_methods_supported` = `["header"]`. |
| GET | `/.well-known/oauth-protected-resource/mcp` | El mismo documento (path insertion). |
| GET | `/.well-known/oauth-authorization-server` | RFC 8414. `issuer` = public-url. `authorization_endpoint` `{public-url}/authorize`. `token_endpoint` `{public-url}/token`. `registration_endpoint` `{public-url}/register`. `code_challenge_methods_supported` = `["S256"]`. `grant_types_supported` = `["authorization_code","refresh_token"]`. `token_endpoint_auth_methods_supported` = `["none"]`. `response_types_supported` = `["code"]`. `scopes_supported` = `["mcp"]`. `registration_endpoint` presente. |
| POST | `/register` | DCR RFC 7591. JSON. Aceptar `redirect_uris` (array no vacío). Guardar exactamente las URIs registradas. Host permitido: `grok.com`, `x.ai`, `127.0.0.1`, `localhost`. Scheme `https` salvo loopback `http`. Rechazar otros hosts (p. ej. `evil.example`). Cliente público: `token_endpoint_auth_method` `none` o ausente. Devolver `client_id` opaco, `redirect_uris` echo, `token_endpoint_auth_method: none`. Sin `client_secret`. |
| GET | `/authorize` | Valida `response_type=code`, cliente registrado, `redirect_uri` exacta, PKCE S256 (challenge base64url de 32 bytes), `state` opcional hasta 2048 bytes, `resource` opcional igual a `{public-url}/mcp` y `scope` opcional vacío o `mcp`. Guarda la solicitud en un intento de 5 min en memoria. Devuelve formulario con `attempt_id`, `csrf_token`, campo password `operator_secret` y `decision`; no replica parámetros OAuth editables en el POST. Cookie `paravel_consent`, `Path=/authorize`, `HttpOnly`, `SameSite=Lax`, `Max-Age=300`, `Secure` cuando public-url es HTTPS. |
| POST | `/authorize` | Formulario `ConsentRequest`: `attempt_id`, `csrf_token`, `operator_secret` opcional para denegar y `decision`; rechaza campos desconocidos. Exige intento vigente, cookie única coincidente y CSRF válido (403 si no coinciden). Aprobar consume el intento y emite 302 al redirect registrado con code de un uso (5 min) y state. Denegar consume el intento y devuelve 302 con `error=access_denied` y state, sin code. Intento inválido/consumido: 400. Frase incorrecta: 400 con formulario; tercer fallo y posteriores: 429. |
| POST | `/token` | `application/x-www-form-urlencoded`. Ambos grants exigen `client_id` vigente; si se envían `resource`/`scope`, deben ser `{public-url}/mcp` y `mcp`. Authorization code exige `code`, `redirect_uri` exacta y `code_verifier` PKCE válido de 43–128 caracteres; el code se consume. Emite access/refresh opacos de 32 bytes en hex, Bearer 3600 s y scope `mcp`. Refresh está ligado al cliente, rota y revoca el access anterior; conserva la caducidad original (24 h), no la prolonga. |

### Resource server

Toda petición a `/mcp` sin `Authorization: Bearer` válido → **401**, cuerpo vacío o `{"error":"invalid_token"}` **sin** nota/payload/UUID. Cabecera:

```http
WWW-Authenticate: Bearer realm="paravel-mcp", resource_metadata="{public-url}/.well-known/oauth-protected-resource", scope="mcp"
```

Token revocado, expirado o basura: el mismo 401. Comparación en tiempo constante (`subtle` o equivalente). No loguear el token.

`/mcp` nunca se sirve sin este middleware.

### Frase de operador

La frase se conserva como digest SHA-256 de 32 bytes en el estado OAuth y se compara con el digest recibido mediante `subtle::ConstantTimeEq`. HTML no incrusta ni devuelve la frase. El bloqueo tras tres fallos pertenece al intento de consentimiento, no al cliente completo; el POST no puede cambiar la solicitud OAuth guardada. Cookie y CSRF deben proceder del GET previo; aprobar/denegar consume el intento y evita replay.

`http.rs` valida Host y Origin (si aparece, igual a public-url), y rechaza POST de consentimiento con `Sec-Fetch-Site` distinto de `same-origin`/`none`. Respuestas con `no-store`, CSP `form-action 'self'` y `frame-ancestors 'none'`, `nosniff`, `DENY` y `no-referrer`. Estos controles locales no prueban el flujo del navegador de Grok.

## Límites HTTP

| Límite | Valor | Respuesta |
| --- | --- | --- |
| Cuerpo | 64 KiB | 413 |
| Concurrencia MCP | 4 | 429 si no hay hueco inmediato; no encolar sin tope |
| Cadencia | 60 req/min por access token; 60/min compartidas entre endpoints públicos, no por IP; techo global 600/min | 429 |
| Concurrencia global / conexiones | 16 peticiones; 32 conexiones TCP | 429 para peticiones; cerrar conexión excedente |
| Sesiones MCP | Hasta 64, vinculadas al token; caducidad menor entre 15 min y la del token; DELETE las retira | 429 sin slots; 404 si inexistente o de otro token |
| Estado OAuth | Hasta 128 clientes (24 h); 256 entradas por colección de intentos, codes, access y refresh; poda de expirados | 429 al alcanzar cota |
| Tiempo | Cabeceras/cuerpo 5 s; handler/cuerpo de respuesta 10 s; conexión 30 s | Rechazo o cierre acotado |

Errores HTTP no incluyen nota, payload, ruta de DB ni secreto. stderr: códigos (`AUTH_REQUIRED`, `RATE_LIMITED`, `BIND_FAILED`) sin contenido de mesa.

## Logging

Sin `tracing` de cuerpos. Stderr mínimo: bind, public-url (no secreto), arranque, parada. stdout en modo HTTP permanece vacío.

## Mesa sintética (pruebas)

`tests/http.rs` crea una SQLite temporal **propia** (no la DB de Tauri del usuario) con el mismo esquema que `tests/stdio.rs`: dos espacios A/B, pack parcial en A, pieza oculta, pieza extranjera, nota/payload sintéticos sin secretos reales. Reutilizar UUIDs de fixture de stdio si simplifica asserts; no refactorizar `stdio.rs`.

La guía de operador (E.3) dirá cómo crear en Paravel una mesa de prueba; el test no toca la DB de la app.

## Pruebas de aceptación E.2 (automatizadas, loopback)

Ejecutar con el binario real (`CARGO_BIN_EXE_paravel-mcp`), `--http 127.0.0.1:<ephemeral>`, `--public-url http://127.0.0.1:<ephemeral>` y `--operator-secret-file` apuntando a un archivo temporal privado creado por el test (contenido sintético).

1. Sin Bearer a `/mcp`: 401 + `WWW-Authenticate` con `resource_metadata`. Cero JSON de mesa.
2. Metadata y authorization-server sirven JSON válido.
3. DCR con `redirect_uris=["http://127.0.0.1/cb"]` obtiene `client_id`. DCR con host `evil.example` se rechaza.
4. Flujo PKCE: authorize + operador correcto → code → token → `tools/list` exactamente `leer_espacio`, `listar_piezas`, `leer_contexto_pieza`.
5. Operador incorrecto: no hay code. Token basura: 401. Refresh rotado: el viejo falla.
6. `leer_espacio` ve solo A. UUID de B y pieza no invitada de A → `NOT_FOUND_OR_NOT_VISIBLE` sin secretos ajenos.
7. Retirar fila de `pack_pieza` entre llamadas: la siguiente lectura de esa pieza falla sin reiniciar el proceso HTTP.
8. Pack vacío: lista vacía, nota de A sigue.
9. Stdio: `cargo test --locked --manifest-path app/crates/paravel-mcp/Cargo.toml --test stdio` sigue PASSED.
10. `--http 0.0.0.0:8787` exit 2. `--help`/`--version` stdout vacío.
11. Concurrencia/cadencia: exceso → 429, el proceso no crece sin límite.
12. Snapshot SQLite igual antes/después de lecturas HTTP.
13. HTTP sin archivo de operador: exit 2, sin listener, stdout vacío; stdout/stderr nunca contienen el secreto, tampoco en arranque, fallo o parada. Archivo inválido/ilegible se rechaza sin revelar contenido ni ruta.
14. Respuestas POST MCP en JSON (`json_response = true`), sin depender de un stream SSE; verificar el comportamiento del GET Streamable HTTP antes de elegir Quick Tunnel.

No afirmar conexión a Grok en estos tests.

## Validación local y evidencia E.2

Resultados finales comunicados por el coordinador el 2026-09-16 y confirmados por el responsable de código. Sustituyen los fallos intermedios de DCR/Clippy y esperas de locks observados mientras se editaba concurrentemente; no son bloqueos vigentes. Esta tarea documental no modifica fuente ni acredita una auditoría OAuth externa.

Prueba mínima reproducible desde la raíz, ejecutada por el coordinador con salida completa:

```powershell
cargo test --locked --manifest-path app/crates/paravel-mcp/Cargo.toml --test http authorized_discovery_and_reads_preserve_the_entire_sqlite_snapshot -- --exact --nocapture
```

Resultado: **1 passed, 18 filtered out**. Ejecuta el binario local real con SQLite temporal propia, OAuth y MCP; comprueba descubrimiento, lecturas autorizadas y preservación del snapshot completo. No usa una cuenta Grok ni un túnel y no sustituye la suite completa.

```powershell
cargo test --locked --manifest-path app/crates/paravel-mcp/Cargo.toml
cargo clippy --locked --manifest-path app/crates/paravel-mcp/Cargo.toml --all-targets -- -D warnings
cargo fmt --manifest-path app/crates/paravel-mcp/Cargo.toml -- --check
```

Suite completa confirmada: **8 unitarios + 19 HTTP + 18 stdio aprobados**. Clippy ejecutado por el coordinador: **exit 0, limpio**. El responsable confirma los mismos tests, Clippy y formato. `--operator-secret-file` es obligatorio, sin generación ni logging de frase; el consentimiento usa intento/cookie/CSRF según `oauth.rs`. Los hosts de callback permitidos son política local, no evidencia del callback efectivo de Grok: no ampliar la allowlist ni retirar controles automáticamente.

Revisión independiente adicional (2026-09-16, script temporal fuera del repo contra el exe real): flujo completo discovery → DCR → consentimiento (attempt/CSRF/cookie) → code → token → rotación → sesiones 2026-07-28 → tres tools → aislamiento → payload correcto, con **18/18 comprobaciones correctas y sin secreto en salida del proceso**. Detalle del protocolo: rmcp 3.4.0 exige cabeceras SEP-2243 (`Mcp-Method`, `Mcp-Name`) y `_meta` con `protocolVersion` en peticiones MCP; un `INVALID_STORED_DATA` puntual fue un fixture con payload no-JSON, no un defecto del adaptador. Sigue siendo evidencia local, no de Grok.

E.2 queda **implementado y validado localmente**. E.3: guía preparada, sin túnel abierto. E.4/E.5 y 4.9 siguen pendientes de evidencia humana; ver §11–§15 del experimento.

## Archivos esperados

- `app/crates/paravel-mcp/src/main.rs` — parseo CLI extendido; rama HTTP.
- `app/crates/paravel-mcp/src/http.rs` — axum, bind, límites, montaje `/mcp`.
- `app/crates/paravel-mcp/src/oauth.rs` — metadata, DCR, authorize, token, store.
- `app/crates/paravel-mcp/tests/http.rs` — integración real.
- `app/crates/paravel-mcp/Cargo.toml` / `Cargo.lock` — deps nuevas mínimas: `axum` 0.8, `tower`, `http`, `sha2`, `subtle`, `rand`, `serde`, `url`; tokio `net`+`macros`+`signal`; rmcp feature HTTP. Dev: `reqwest` (json, rustls), `rusqlite` bundled ya está, `tempfile` ya está.
- No secretos en el repo. Ignorar `*.operator-secret` en `app/crates/paravel-mcp/.gitignore`.

## Fuera de E.2

Túnel, cuenta Cloudflare, registro en grok.com, hosting, nuevas tools, escritura, spawn, caché de pack, OAuth de un IdP externo, panel ngrok.
