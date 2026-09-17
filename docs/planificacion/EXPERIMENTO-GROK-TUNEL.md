# Experimento: Paravel → túnel temporal → Grok

Estado: E.1 decidido; E.2 implementado y validado localmente; E.3 con guía operativa preparada, sin túnel abierto. E.4 (conector real en grok.com) y E.5 (utilidad vs pack manual) pendientes de acción humana. 4.9 sigue abierto.
Fecha: 2026-09-16.
Decisión del usuario: usar un túnel temporal hacia el equipo local para esta fase.

## 1. Qué queremos comprobar

Validar si las tres herramientas de lectura de Paravel aportan valor en una tarea real desde Grok web/app, conservando el aislamiento de una sola mesa y su selección `pack_pieza`.

El experimento debe responder dos preguntas: ¿Grok puede trabajar con ese contexto sin pedir acceso global? ¿La consulta actualizable del pack mejora el trabajo respecto a pegar un pack manual? Una conexión técnica exitosa por sí sola no demuestra valor de producto.

## 2. Decisión y justificación

Elegimos un túnel temporal hacia la PC. El MCP existente nació como stdio local, un único `--espacio` y acceso limitado por `pack_pieza`. Grok web necesita un endpoint HTTPS accesible desde su infraestructura; no puede iniciar el ejecutable Windows mediante una ruta local.

El túnel permite probar ese enlace sin contratar hosting, mover la SQLite ni construir un servicio permanente. Solo funciona mientras la PC, el adaptador y el túnel estén activos. Apagar o suspender el equipo local interrumpe el acceso; no hay promesa de disponibilidad continua.

Un servidor alojado se reconsiderará únicamente después de demostrar valor con Grok y justificar disponibilidad 24/7. Sería otra decisión de arquitectura, operación y costes, no la evolución automática de este experimento.

## 3. Excepción deliberada al alcance

Este planteamiento **reabre a propósito el «túneles fuera de scope» del §7 de [ARQUITECTURA.md](../arquitectura/ARQUITECTURA.md#7-fuera-de-scope-ahora)** y las exclusiones correspondientes de [WBS.md](./WBS.md) y [WBS-MCP.md](./WBS-MCP.md).

La excepción permite exclusivamente un puente temporal, autenticado y de lectura hacia Grok para una mesa de prueba. No transforma el MCP local en un servicio público permanente ni autoriza hosting, sync, inventario global, escritura, lanzamiento de programas o coordinación entre Bots.

El servidor stdio conserva su contrato y puede seguir usándose sin red. Este documento es una ampliación experimental de alcance; no afirma que el puente esté construido ni que 4.9 esté aceptado.

## 4. Recorrido propuesto

```text
Grok web/app
    │ HTTPS + autenticación comprobada
    ▼
URL temporal del proveedor de túnel
    │ reenvío únicamente al puerto del adaptador
    ▼
Adaptador MCP HTTP en 127.0.0.1, en el equipo local
    │ reutiliza el servidor/servicio de lectura existente
    ▼
Un único espacio de prueba fijado al arrancar
    │ filtro por espacio_id + pack_pieza en cada consulta
    ▼
SQLite local abierta en modo solo lectura
```

**Un túnel no convierte stdio en HTTP.** E.2 implementa el adaptador Streamable HTTP del SDK `rmcp` fijado en el mismo binario, reutilizando herramientas y autorización de contexto sin duplicar permisos. Está validado localmente; la compatibilidad con la cuenta real de Grok sigue pendiente de E.4.

El túnel apunta solo al adaptador en loopback. No se publican el puerto de desarrollo de Tauri, WebView2/CDP, un explorador de archivos, una consola SQL ni un endpoint de descarga de SQLite.

## 5. Condiciones obligatorias

| Condición | Aplicación en el experimento |
| --- | --- |
| Autenticación desde el primer acceso | OAuth 2.1 del adaptador, implementado y probado localmente; las páginas xAI no garantizan el flujo exacto del conector y su compatibilidad con Grok se comprueba después, solo con datos sintéticos y aprobación humana. |
| HTTPS | Usar el endpoint HTTPS del túnel. HTTPS protege el transporte, pero no sustituye la autenticación. |
| Un solo espacio | Fijar `--espacio` mediante configuración local de confianza; ninguna petición puede sustituirlo. |
| Datos de prueba | Primera conexión con una mesa de contenido sintético y revisado, sin secretos. Compartir datos reales requiere elegir y revisar esa mesa expresamente. |
| Pack como límite de piezas | Cada lectura comprueba pertenencia al espacio y selección actual en `pack_pieza`; no basta con recibir un UUID. |
| SQLite permanece local | No subir, copiar ni permitir descargar la DB completa. El proceso local la consulta; Grok recibe únicamente las respuestas autorizadas. |
| Solo tres tools | `leer_espacio`, `listar_piezas`, `leer_contexto_pieza`. Sin SQL libre, lectura de archivos referenciados, fetch de URLs, escritura ni spawn. |
| Límites desde la prueba | Conservar límites existentes de argumentos/respuestas y timeout SQLite. Añadir límites de peticiones y concurrencia en HTTP, con valores registrados y probados antes de exponerlo. |
| Revocación | Rechazar credenciales inválidas/revocadas y aplicar retirada del pack en la próxima consulta; nunca servir contexto desde una caché antigua. |
| Apagado sencillo | Detener túnel y adaptador, desconectar el conector y revocar sus credenciales cuando corresponda. Sin inicio automático ni servicio permanente. |

La nota y los metadatos de la mesa siguen compartidos aunque el pack esté vacío: es el contrato actual. Quitar pack revoca piezas, no la nota. Para impedir nuevas lecturas de la nota se corta la conexión. Ningún apagado retira información que Grok ya haya recibido.

El proveedor del túnel forma parte del recorrido de los datos; antes de elegirlo se revisarán terminación TLS, registro de tráfico, compatibilidad MCP, duración de URL y costes. No registrar tokens, notas, payloads ni parámetros privados en logs de diagnóstico. Una URL difícil de adivinar no es autenticación.

## 6. Entregables y orden

Estos identificadores pertenecen al experimento; no renumeran los WP 4.1–4.9 existentes.

| Paso | Entregable | Criterio de avance |
| --- | --- | --- |
| E.1 | Contrato de conexión Grok | Confirmar superficie exacta (grok.com/app), transporte, autenticación y versiones compatibles con evidencia del cliente. |
| E.2 | Adaptador HTTP local | Las tres tools funcionan en loopback, con ámbito fijo, autenticación y límites; stdio conserva sus pruebas. |
| E.3 | Operación del túnel | Proveedor elegido; instrucciones reproducibles de arrancar/parar; URL temporal y credenciales gestionadas sin incluir secretos en el repositorio. |
| E.4 | Conector Grok sobre mesa sintética | Grok descubre exactamente tres tools y lee únicamente datos autorizados. No darlo por conectado por pasar tests de un cliente simulado. |
| E.5 | Evidencia y decisión | Transcript sanitizado, pruebas de aislamiento/desconexión y evaluación de utilidad frente al pack manual. Registrar continuar, iterar o retirar. |

Antes de exponer el endpoint se completan las pruebas locales de autenticación y alcance. No se presenta una URL sin protección como un paso provisional de instalación.

## 7. Pruebas de aceptación

- Sin credenciales, con credenciales incorrectas o revocadas: ningún contexto autorizado es devuelto.
- Mesa A configurada; mesa B existente: un UUID de B y una pieza no invitada de A producen rechazo sin revelar sus datos.
- Relaciones de pack corruptas no permiten atravesar el filtro de espacio.
- Guardar una selección desde Paravel se refleja en Grok; retirar una pieza hace fallar la siguiente lectura sin reiniciar el proceso.
- Pack vacío: cero piezas; nota visible según el contrato y explicada al usuario.
- Datos con rutas, URLs o instrucciones permanecen datos; no se ejecutan ni se abren.
- Exceso de tamaño, frecuencia o concurrencia: rechazo controlado, sin crecimiento ilimitado de colas ni filtración de contenido en errores.
- Uso simultáneo de Paravel y Grok: selección, Iniciar, Quitar y persistencia siguen funcionando; MCP no modifica tablas ni genera lanzamientos.
- Detener el túnel/adaptador impide llamadas posteriores desde Grok. Reiniciar exige comprobar URL, credenciales y el mismo espacio de prueba.
- Comparar el estado lógico de la DB antes/después de lecturas MCP, separando las escrituras intencionales hechas por la UI.

Registrar cliente y versión, versiones del servidor/adaptador, protocolo efectivo, resultados y comandos reproducibles. Las capturas/transcripts solo contienen la mesa sintética y secretos redactados.

## 8. Cierre y decisión posterior

Se considera completado el experimento cuando Grok resuelve una tarea concreta usando el contexto permitido, pasan aislamiento y desconexión, y queda documentado si la lectura actualizable aporta valor frente al pack manual. Una autenticación fallida o un aislamiento incorrecto bloquea la exposición; se corrige localmente.

Si no aporta valor, se retiran conector, túnel y adaptador, conservando Paravel y su MCP stdio. Si aporta valor, se puede repetir con una mesa revisada. Hosting y operación 24/7 solo se plantean después, con una necesidad demostrada y un alcance nuevo.

El cierre de 4.9 se registra únicamente tras satisfacer sus criterios aplicables con el cliente elegido y enlazar la evidencia de este puente. Escribir el planteamiento no cierra ese WP.

## 9. Referencias

- [WBS del MCP local](./WBS-MCP.md): contrato de las tres herramientas y exclusiones originales.
- Regresión nativa con MCP activo: evidencia local en `reports/` (no versionada); no prueba conexión con Grok.
- [Conectores de Grok](https://docs.x.ai/grok/connectors): conector personalizado mediante URL.
- [Túneles MCP para Grok](https://docs.x.ai/grok/connectors/custom-mcp-tunneling): alcance de red y diferencia entre túnel y autenticación.

Las guías de xAI fueron consultadas durante la investigación de esta conexión. El contrato efectivo queda en la sección 10; no se da por conectado Grok ni cerrado 4.9.

## 10. Contrato E.1 (decidido 2026-09-16)

Fuentes comprobadas el 2026-09-16: [conectores Grok](https://docs.x.ai/grok/connectors), [túneles MCP](https://docs.x.ai/grok/connectors/custom-mcp-tunneling), [Remote MCP Tools (API, no es el cliente del experimento)](https://docs.x.ai/developers/tools/remote-mcp), [autorización MCP 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), SDK `rmcp` 3.4.0 (`transport-streamable-http-server`; feature `auth` es cliente, no servidor de autorización).

| Superficie | Decisión | Evidencia / motivo |
| --- | --- | --- |
| Cliente | `grok.com/connectors` → New Connector → Custom. No Cursor, no OpenCode, no xAI API `tools.mcp`. | El usuario eligió Grok web/app. La API sí admite `authorization` Bearer; **el diálogo de conectores no documenta un campo de cabecera estática**. |
| Transporte | Streamable HTTP en `/mcp`, respuestas POST JSON; sin dependencia SSE. | La guía xAI distingue SSE de Streamable HTTP y recomienda este último para Cloudflare. Quick Tunnels **no** soporta SSE. Streamable HTTP puede tener respuestas SSE: exigir JSON y comprobar que el cliente no dependa del stream. `rmcp` 3.4.0 aporta el transporte, no la aceptación del cliente. |
| Autenticación | OAuth 2.1 Authorization Code + PKCE S256 + DCR (RFC 7591) + Protected Resource Metadata (RFC 9728). Gate humano: frase de operador local. | MCP HTTP SHOULD usar OAuth 2.1. Se propone discovery, registro y consentimiento con PKCE; las páginas xAI no especifican este intercambio completo ni el callback de la cuenta. **Compatibilidad real pendiente de E.4**. No asumir Bearer arbitrario ni tratar el ejemplo Bearer del SDK como prueba de OAuth para Grok. |
| HTTPS | Lo aporta el túnel. El adaptador escucha solo `127.0.0.1`. | Grok rechaza localhost/RFC1918. HTTPS del túnel no sustituye OAuth. |
| Túnel (E.3) | Cloudflare quick tunnel (`cloudflared tunnel --url http://127.0.0.1:PORT`). ngrok queda de reserva si Streamable HTTP fallara. | Documentado por xAI para Streamable HTTP. Sin cuenta para quick tunnel; esto no significa ausencia de registro por el proveedor. URL cambia al reiniciar: hay que re-registrar el conector. |
| Ámbito | Igual que stdio: `--espacio` fijo, `pack_pieza` en cada lectura, SQLite read-only, tres tools. | Reutilizar `ContextServer` / `paravel-context`. Ninguna petición sustituye el UUID. |
| Retirada | Parar adaptador y túnel; tokens solo en memoria. Reiniciar revoca. Quitar el conector en Grok. | Sin servicio permanente ni arranque automático. |
| Límites HTTP | Cuerpo 64 KiB; 4 peticiones MCP concurrentes; 60 req/min por token; 429 sin cola ilimitada. | Complementan 256 KiB de respuesta, 100 piezas/página y timeout SQLite de 2 s. |

**No cubre E.1:** pegar una URL en grok.com, ni un transcript de Grok. Eso es E.4. E.1 queda cerrado al fijar superficie, transporte, autenticación y versiones contra documentación del cliente, no contra un cliente simulado.

Spec de implementación: [E2-ADAPTADOR-HTTP.md](./E2-ADAPTADOR-HTTP.md). Operación del túnel: [E3-TUNEL.md](./E3-TUNEL.md).

## 11. Preparación reproducible sin exposición

Esta guía contiene comandos para que el operador los ejecute; no instala ni inicia `cloudflared`. E.2 está validado localmente, pero **no ejecutar §12 sin aprobación humana explícita para publicar el endpoint**, indicando mesa A, proveedor y ventana de prueba. Elegir un túnel como arquitectura no sustituye esa aprobación operativa.

### 11.1 Build y pruebas locales

PowerShell desde la raíz de Paravel; requisitos y ubicación del binario en el [README existente](../../app/crates/paravel-mcp/README.md). Ejecutar cada comando y detenerse si su código de salida no es cero. No quitar `--locked`, actualizar dependencias ni sustituir el binario por uno antiguo para superar un fallo.

```powershell
cargo build --release --locked --manifest-path app/crates/paravel-mcp/Cargo.toml
cargo test --locked --manifest-path app/crates/paravel-context/Cargo.toml
cargo test --locked --manifest-path app/crates/paravel-mcp/Cargo.toml
cargo test --locked --manifest-path app/crates/paravel-mcp/Cargo.toml --test stdio
cargo test --locked --manifest-path app/crates/paravel-mcp/Cargo.toml --test http
cargo check --locked --manifest-path app/crates/paravel-mcp/Cargo.toml --all-targets
cargo clippy --locked --manifest-path app/crates/paravel-mcp/Cargo.toml --all-targets -- -D warnings
cargo fmt --manifest-path app/crates/paravel-mcp/Cargo.toml -- --check
& '.\app\crates\paravel-mcp\target\release\paravel-mcp.exe' --help
& '.\app\crates\paravel-mcp\target\release\paravel-mcp.exe' --version
```

La prueba mínima reproducible con binario, SQLite, OAuth y MCP reales es (coordinador y reejecución local del 2026-09-16: 1 passed, 18 filtered out):

```powershell
cargo test --locked --manifest-path app/crates/paravel-mcp/Cargo.toml --test http authorized_discovery_and_reads_preserve_the_entire_sqlite_snapshot -- --exact --nocapture
```

Suite completa confirmada: 8 unitarios + 19 HTTP + 18 stdio aprobados; Clippy exit 0 limpio. No usa la DB personal, el túnel ni una cuenta Grok. Exigir además evidencia de cada caso de §7 y de la spec E.2, especialmente tokens inválidos/revocados, pieza de B, relaciones corruptas, límites HTTP, snapshot lógico y ausencia de secretos en salida. Un test unitario OAuth no acredita OAuth en grok.com.

### 11.2 Fixture humana A/B y selección de confianza

1. En Paravel crear un grupo de prueba y dos mesas nuevas, A y B, sin importar datos reales. No lanzar las piezas. El MCP lee su payload persistido, **no el contenido del archivo o URL referenciado**; la tarea se resuelve con nota, nombres y payloads sintéticos.
2. Usar esta fixture v1, guardando los UUID reales localmente como A, A1, A2, A3, B y B1. Son alias de medición, no UUID que se puedan pasar al binario.

| Elemento | Valor sintético fijado | Pack |
| --- | --- | --- |
| A | Nombre `Experimento A`; nota `REV-1. Preparar una revisión de 20 minutos. Orden: agenda, revisión. Usar solo piezas compartidas. No abrir rutas ni URLs.` | A1 y A2 |
| A1 | Pieza carpeta, nombre `Agenda REV-1`, destino `C:\Paravel-Sintetico\agenda-v1` | Sí |
| A2 | Pieza carpeta, nombre `Revision REV-1`, destino `C:\Paravel-Sintetico\revision-v1` | Sí |
| A3 | Pieza carpeta, nombre `OCULTA-A-731`, destino `C:\Paravel-Sintetico\oculta-731` | No |
| B | Nombre `Experimento B`; nota `NO-COMPARTIR-B-947` | Independiente de A |
| B1 | Pieza carpeta, nombre `EXTRANJERA-B-947`, destino `C:\Paravel-Sintetico\extranjera-947` | Puede estar en B; nunca en A |

Si la UI exige que el destino exista, el operador prepara carpetas vacías de prueba en una ubicación privada verificada y usa esos mismos destinos en ambas modalidades; registrar la variante sin rutas personales en el informe. No reutilizar carpetas personales ni crear archivos ejecutables. La nota A no contiene los nombres ni marcadores ocultos.

3. Obtener la ruta efectiva mediante `db_path` y contrastar `list_spaces`/`list_groups` en un entorno Tauri local de confianza, como explica el README. Alternativa: herramienta SQLite local abierta **solo lectura** sobre esa ruta, nunca SQL por MCP. Confirmar nombre y grupo, no seleccionar el UUID sugerido por Grok.
4. En A, **Preparar pack / Editar pack → Guardar**, marcar exactamente A1 y A2; A3 desmarcada. Las casillas de Iniciar no autorizan el pack. Revisar nota completa y selección persistida. Conservar aparte UUID de A3 y B1 para pruebas negativas, sin pegar sus contenidos en Grok.
5. Fijar ruta y UUID A en la CLI local. No exponer la DB, consola Tauri, CDP, servidor de desarrollo ni otro puerto. Para comprobar el pack desde SQLite local, usar parámetros enlazados con A verificado:

```sql
SELECT p.id, p.nombre, p.kind, p.payload
FROM pieza p JOIN pack_pieza pp
  ON pp.pieza_id = p.id AND pp.espacio_id = p.espacio_id
WHERE p.espacio_id = :espacio_a
ORDER BY p.orden, p.id;
```

### 11.3 Frase de operador y arranque local

El archivo de operador es **obligatorio para HTTP**. Prepararlo con un gestor de contraseñas o editor local de confianza en una carpeta privada ya verificada, fuera del repo, sincronización y capturas: UTF-8 sin BOM, una sola línea ASCII imprimible, al menos 16 caracteres; preferir 32 bytes aleatorios codificados en hex. Restringir ACL al operador y cuentas de sistema necesarias. El archivo contiene texto secreto en disco: no es un almacén cifrado; conservarlo solo durante el ensayo.

No pegar la frase en comandos, variables literales, URL/query, chat, configuración versionada, historial ni logs; pasar **solo la ruta** con `--operator-secret-file`. No usar `Get-Content`, `type`, `echo`, `--verbose`, tracing de cuerpos, transcripciones de terminal o capturas HAR para visualizarla. Introducirla únicamente en el formulario de consentimiento verificado (POST), nunca en la URL. No publicar códigos OAuth, Bearer, refresh, cookies, ID de sesión ni cabeceras de autorización. Redactar también rutas privadas de DB/archivo en evidencia compartida.

**Bloqueo resuelto en código:** el primer borrador de `src/main.rs::operator_secret` permitía omitir el archivo e imprimía la frase en stderr. La versión implementada exige `--operator-secret-file`, no genera ni registra secretos, y la regresión de salida limpia está en la suite aprobada (19 HTTP incluyen los casos de rechazo). No se acepta «imprimir una vez» como logging seguro.

En una terminal sin transcripción, introducir solo rutas y UUID mediante prompts. El puerto 8787 es ejemplo fijo: verificar que esté libre; si está ocupado elegir otro y cambiarlo coherentemente en todos los pasos, nunca apuntar el túnel a un servicio existente.

```powershell
$Db = Read-Host 'Ruta absoluta de SQLite verificada'
$Espacio = Read-Host 'UUID verificado de la mesa A'
$SecretFile = Read-Host 'Ruta absoluta del archivo privado de operador'
if (-not (Test-Path -LiteralPath $Db -PathType Leaf)) { throw 'DB no encontrada' }
if (-not (Test-Path -LiteralPath $SecretFile -PathType Leaf)) { throw 'Archivo privado no encontrado' }
Get-NetTCPConnection -State Listen -LocalPort 8787 -ErrorAction SilentlyContinue
& '.\app\crates\paravel-mcp\target\release\paravel-mcp.exe' --db "$Db" --espacio "$Espacio" --http 127.0.0.1:8787 --public-url http://127.0.0.1:8787 --operator-secret-file "$SecretFile"
```

Si la consulta de puerto devuelve un listener, **no ejecutar la última línea**. En otra terminal, sin credenciales y sin cuerpos privados:

```powershell
curl.exe --silent --show-error --include --request POST http://127.0.0.1:8787/mcp
curl.exe --silent --show-error http://127.0.0.1:8787/.well-known/oauth-protected-resource
curl.exe --silent --show-error http://127.0.0.1:8787/.well-known/oauth-authorization-server
```

Esperado, no observado por esta guía: `/mcp` devuelve 401 sin contexto y `WWW-Authenticate`; metadata devuelve issuer loopback y resource loopback terminado en `/mcp`. Las rutas OAuth/discovery son públicas por diseño, no una excepción para lecturas de mesa. Completar el flujo autenticado con la suite y las pruebas E.2; estos tres `curl` no lo sustituyen. Parar el adaptador con Ctrl+C y comprobar que ya no hay listener. Aún no hay túnel.

## 12. Túnel temporal y conexión real (operador, tras aprobación)

### 12.1 Restricciones verificadas del proveedor

Fuentes xAI de §9 y [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/), consultadas el 2026-09-16 a partir de la documentación Cloudflare enlazada por xAI:

- Quick Tunnel genera un subdominio aleatorio `trycloudflare.com`, no requiere cuenta y se destina solo a pruebas/desarrollo; **sin SLA ni garantía de uptime**.
- **No soporta SSE**, con límite de **200 peticiones simultáneas en vuelo**, exceso 429. No confundir ese límite del proveedor con 4 solicitudes MCP concurrentes y 60/min por token del adaptador; registrar origen del error cuando sea observable.
- Un `config.yaml` existente en `.cloudflared` puede impedir quick tunnels. No borrar/renombrar configuración ajena automáticamente: detener y pedir decisión al operador.
- `cloudflared` establece conexiones salientes; el tráfico pasa por Cloudflare. HTTPS no oculta datos al proveedor que termina TLS ni elimina sus políticas de registro. Revisar términos/privacidad antes de autorizar, no prometer «sin logs».
- xAI recomienda Streamable HTTP para Cloudflare. El borrador usa `json_response = true`, pero Streamable HTTP también contempla SSE: verificar `Content-Type` y si Grok intenta o depende de GET streaming. Ante dependencia SSE, parar e investigar; ngrok es una alternativa **sujeta a nueva aprobación**, no un cambio automático ni motivo para quitar OAuth.

### 12.2 Resolver la URL antes de arrancar el adaptador público

La URL aleatoria se necesita para issuer/resource y `--public-url`; inventarla o dejar loopback durante OAuth público rompería discovery. Orden seguro:

1. Con pruebas locales completas y el adaptador detenido, verificar que 8787 sigue libre. Confirmar aprobación explícita, binario revisado, archivo privado y mesa A. `cloudflared` debe estar instalado por decisión previa del operador; esta guía no lo instala ni configura como servicio.
2. En terminal T, iniciar **solo el túnel hacia ese puerto vacío**. Esto ya crea un endpoint público y requiere aprobación; mientras el origen no escucha debe fallar, nunca mostrar otro servicio. No levantar un servidor HTTP provisional ni modo sin autenticación.

```powershell
cloudflared --version
Get-NetTCPConnection -State Listen -LocalPort 8787 -ErrorAction SilentlyContinue
cloudflared tunnel --url http://127.0.0.1:8787
```

Si hay listener inesperado, no ejecutar `cloudflared tunnel`. Anotar la URL HTTPS real emitida, sin añadir `/mcp` a `--public-url`. Si no se obtiene URL manteniendo el origen cerrado, detener y resolver el bootstrap, no abrir un endpoint desprotegido.

3. En la terminal del adaptador conservar `$Db`, `$Espacio`, `$SecretFile` verificados de §11; si es otra terminal repetir esos prompts. Confirmar que el puerto continúa libre y arrancar el adaptador **autenticado desde el primer bind**, ahora con la URL real:

```powershell
$PublicUrl = Read-Host 'URL HTTPS real emitida por el tunel, sin path'
& '.\app\crates\paravel-mcp\target\release\paravel-mcp.exe' --db "$Db" --espacio "$Espacio" --http 127.0.0.1:8787 --public-url "$PublicUrl" --operator-secret-file "$SecretFile"
```

4. En otra terminal introducir la misma URL y comprobar sin credenciales:

```powershell
$PublicUrl = Read-Host 'Misma URL HTTPS real del tunel, sin path'
curl.exe --silent --show-error --include --request POST "$PublicUrl/mcp"
curl.exe --silent --show-error "$PublicUrl/.well-known/oauth-protected-resource"
curl.exe --silent --show-error "$PublicUrl/.well-known/oauth-authorization-server"
```

Exigir 401 sin datos en `/mcp`, metadata con **esa** URL HTTPS e issuer/resource coherentes, nunca localhost. Un 502 mientras el puerto estaba vacío no prueba autenticación; un 200 de metadata tampoco. Si falla cualquier control, detener T y adaptador, corregir localmente.

### 12.3 Cuenta Grok y prueba mínima humana E.4

1. Abrir [grok.com/connectors](https://grok.com/connectors) → **New Connector → Custom** e introducir la URL real seguida de `/mcp`. xAI dice que conectores están disponibles para todos los usuarios; Business/Enterprise necesita provisión previa de un administrador. Registrar disponibilidad real en la cuenta, fecha, superficie web/app y versión visible; no asumir paridad de la app móvil.
2. Completar el flujo de autenticación que aparezca. Verificar dominio del formulario (URL temporal vigente), host de retorno y consentimiento antes de introducir la frase por POST. Si callback/discovery/PKCE no encaja, registrar solo etapa y error sanitizado, detener y devolver a E.2: **no quitar autenticación, permitir cualquier redirect ni poner la frase como Bearer estático**.
3. Confirmar `initialize`/`notifications/initialized`, versión efectiva y exactamente tres tools, por evidencia que el cliente realmente exponga. Referencia local: `2025-11-25`, no atribuir otra versión sin negociación observada. Si Grok no muestra RPC, marcar esos detalles «no observable» y mantener la comprobación local separada.
4. Pedir `leer_espacio {}`, `listar_piezas {"limite":1}`, continuar con `cursor_siguiente`, y `leer_contexto_pieza {"pieza_id":"UUID_REAL_A1"}`/A2. Contrastar nota REV-1, dos piezas y sus payloads sin abrir destinos. La instrucción al modelo no demuestra que haya llamado: verificar trazas de tools cuando existan.
5. En una conversación aparte pedir lecturas de UUID A3 y B1, sin pegar marcadores ocultos: ambos deben dar `isError: true`, `NOT_FOUND_OR_NOT_VISIBLE`, sin sus nombres, notas o payloads. Un UUID de mesa no reemplaza `--espacio`; argumentos extra deben rechazarse. Probar relaciones corruptas solo en fixtures automatizadas, nunca corromper la DB de la app.
6. Retirar A2 en Paravel y Guardar; repetir su lectura sin reiniciar: rechazo. Vaciar pack: listado vacío, nota A todavía visible. Restaurar v1 para comparación. No confundir respuesta recordada por Grok con una nueva lectura: contrastar resultado de tool, no solo prosa.
7. Ejecutar retirada de §14 y demostrar que una **nueva** llamada falla. Registrar estado real; crear el conector no completa E.4 si faltan aislamiento y desconexión.

## 13. Comparación pack manual vs tools (E.5, sin resultados todavía)

### Variables y control

- Independiente: contexto pegado manualmente frente a tres tools de lectura. Misma cuenta/modelo seleccionado, idioma, prompt, datos v1 y ventana temporal; deshabilitar otros conectores y no usar búsqueda web. Conversaciones nuevas para cada modalidad y repetición, sin copiar respuestas entre ellas.
- Preparar el pack manual como transcripción revisada de los **mismos campos autorizados**: id/nombre/grupo/nota de A, conteo 2 y lista id/nombre/kind/payload de A1/A2. No requiere una función de exportación inexistente. No incluir A3, B, B1 ni cuerpos de archivos referenciados. Conservar el texto exacto localmente y registrar bytes UTF-8; no es una copia de SQLite.
- Dos repeticiones emparejadas mínimas: R1 manual → tools; restaurar fixture v1; R2 tools → manual. Registrar latencia/red y errores, no eliminar intentos fallidos. Este tamaño solo aporta evidencia exploratoria, no significación estadística.

Prompt común, añadiendo únicamente cómo acceder al contexto (pack pegado / conector Paravel):

```text
Con el contexto autorizado de Experimento A, prepara una revisión de 20 minutos. Indica revisión y orden de la nota, enumera exactamente las piezas compartidas con nombre y destino persistido, y propone dos pasos que no abran archivos ni URLs ni ejecuten programas. No inventes contenido de los destinos. Si falta información, dilo.
```

Éxito de tarea v1 = 5 comprobaciones binarias: REV-1; 20 minutos; orden agenda → revisión; exactamente A1/A2 con destinos correctos; dos pasos sin inventar contenido ni ejecutar/abrir. Registrar puntos 0–5 y éxito completo solo con 5/5, sin datos ocultos. Los marcadores ocultos pertenecen al evaluador, nunca al prompt inicial.

### Cambio controlado y contexto antiguo

Después de la primera respuesta de cada modalidad, el operador cambia en Paravel **solo** la nota a `REV-2. Preparar una revisión de 15 minutos. Orden: agenda. Usar solo piezas compartidas. No abrir rutas ni URLs.` y retira A2 del pack, Guardar. Anotar instante de persistencia. A1 no cambia, A3/B1 siguen fuera. Repetir exactamente:

```text
He guardado cambios en la mesa. Actualiza la respuesta usando el contexto vigente; no adivines los cambios. Si no puedes consultar una versión nueva, indica que tu contexto puede estar desactualizado.
```

- Manual, fase M1: **no** pegar aún la actualización; medir si avisa de contexto antiguo o presenta v1 como vigente. No penalizar la declaración honesta de falta de actualización como fuga o fallo OAuth.
- Tools, fase T1: permitir relectura; comprobar REV-2, 15 minutos, solo A1 y no presentar A2 como actualmente autorizada. Registrar si realmente consulta. Conservar prosa recordada separada del payload devuelto: la retirada no borra memoria del cliente.
- Manual, fase M2: cronometrar regeneración/revisión/copia del pack v2 (solo A1), pegarlo y repetir el prompt. Comparar M2 con T1 para tiempo total hasta respuesta **correcta con información equivalente**, y M1 con T1 para detectar necesidad de refresco. No declarar ventaja solo porque se ocultó v2 al baseline.
- Repetir solicitud explícita de leer A2 por UUID en tools: el rechazo de la llamada comprueba revocación; el modelo puede recordar su valor previo sin que el servidor lo haya vuelto a entregar.

### Métricas predefinidas

| Variable | Cómo medir en cada intento |
| --- | --- |
| Éxito v1 / v2 | Rúbrica v1 anterior; v2 exige REV-2, 15 minutos, orden agenda, solo A1 correcto y dos pasos sin apertura/invención. Puntuación y aprobado separado de conectividad. |
| Contexto antiguo | Número de afirmaciones v1 presentadas como actuales tras guardar v2; aviso explícito de desactualización sí/no; tiempo desde guardado hasta primera respuesta v2 correcta. |
| Aislamiento | Contenido de A3/B1/nota B recibido por tool: cero esperado. Rechazo A2 retirado y pack vacío comprobados con llamada nueva. |
| Calls | Contar `tools/call` por nombre, fallidos y reintentos incluidos. Separar discovery/OAuth/`initialize` de llamadas de tarea. Manual tiene 0 llamadas MCP por diseño, no 0 trabajo humano. Si Grok no muestra recuento, «no observable», no estimar. |
| Tiempos | Cronómetro monotónico del operador en segundos: preparar/corregir pack, setup OAuth+túnel aparte, enviar prompt→respuesta final, guardado→v2 correcta, interrupciones. Registrar timestamps y duración sin inventar precisión de servidor. |
| Intervenciones | Número de pegados, mensajes aclaratorios y reintentos humanos. Conservar prompts idénticos y anotar desviaciones. |
| Tamaño y operación | Bytes del pack manual revisado; bytes de tools solo si observables sin logging sensible. Errores 401/429/5xx, desconexiones y versión de cliente/binario/proveedor. Coste solo si la cuenta lo informa, no estimar tokens ocultos. |

Continuar solo si pasan todos los controles de seguridad y ambas repeticiones tools resuelven v1/v2 correctamente, y al menos una métrica predefinida (tiempo total hasta v2 correcta o intervenciones de actualización) mejora en ambas sin degradar exactitud. Si los resultados son mixtos, iterar localmente con hipótesis registrada; si no hay ventaja, retirar. No convertir este umbral exploratorio en aceptación de hosting o cierre automático de 4.9.

## 14. Stop, retirada y repetición

**Stop inmediato:** contexto fuera de A/pack; lectura sin token válido; secreto en cualquier salida; callback/dominio inesperado; listener fuera de loopback; dependencia SSE no resuelta; límites/cotas sin validar; necesidad de datos reales no revisados. Parar el túnel primero, después el adaptador, y devolver el bloqueo a E.2. No intentar sortear OAuth ni abrir otro puerto/proveedor por cuenta propia.

**Stop operativo:** no poder obtener URL con origen vacío, error de build/pruebas, cuenta sin conector, flujo OAuth incompatible, tres intentos de conexión fallidos o 30 minutos sin completar la prueba mínima (lo que ocurra primero). Registrar fallo y tiempo, no repetir indefinidamente; una nueva ventana requiere decidir qué cambió. Acordar además un final de ventana explícito antes del arranque: no dejarlo abierto al terminar la sesión.

Retirada normal o por stop:

1. Ctrl+C en terminal T (`cloudflared`); confirmar que termina. Pedir una nueva llamada en Grok: debe fallar sin respuesta nueva del servidor, aunque pueda quedar información en el chat.
2. Ctrl+C en terminal del adaptador; confirmar proceso terminado y ausencia de listener en el puerto. Si no termina, el operador identifica ese PID antes de detenerlo; no matar procesos por nombre globalmente. Los tokens/códigos del borrador viven en memoria; reinicio revoca, pero exigir evidencia local de esa propiedad.
3. Desconectar/eliminar el conector personalizado en Grok y revocar autorizaciones que la cuenta permita. No hay endpoint de revocación documentado en el borrador: no inventarlo.
4. Retirar el archivo temporal de operador mediante la herramienta local de confianza, limpiar portapapeles y rotar la frase para otra sesión. No prometer borrado forense en SSD ni retirada de historiales del proveedor. Si hubo filtración, tratar frase/tokens como comprometidos y no conservar logs sin sanear.
5. Mantener app, SQLite y MCP stdio intactos. Las escrituras de preparación/cambio de fixture fueron humanas, no del MCP. Eliminar las mesas sintéticas solo por decisión del operador; no borrar DB ni archivos auxiliares.
6. Para repetir: pruebas/ámbito revisados, nueva aprobación, puerto libre, archivo nuevo, túnel nuevo, URL real nueva y nuevo registro OAuth/conector. Nunca reutilizar una URL antigua como si apuntara al mismo proceso.

## 15. Registro de evidencia y estado (rellenar, no inferir)

Sin crear nuevos documentos por defecto, añadir aquí la devolución sanitizada del responsable y del operador. Identificar binario/revisión real, fecha, comandos y códigos de salida; conservar transcripts sintéticos revisados, nunca volcado de red o archivo de secretos. Para snapshot comparar filas/estado lógico antes/después en fixtures propias, excluyendo escrituras intencionales de UI; un hash del archivo SQLite con WAL no sustituye esa comparación.

| Evidencia | Estado actual |
| --- | --- |
| E.1 fuentes xAI/Cloudflare | Consultadas 2026-09-16; decisiones y límites arriba. No conexión de cuenta. |
| E.2 implementación | **Completada y validada localmente** el 2026-09-16. Coordinador y responsable confirman 8 unitarios + 19 HTTP + 18 stdio aprobados; Clippy exit 0 limpio; formato comprobado. Prueba mínima reproducible: `cargo test --locked --manifest-path app/crates/paravel-mcp/Cargo.toml --test http authorized_discovery_and_reads_preserve_the_entire_sqlite_snapshot -- --exact --nocapture` → **1 passed, 18 filtered out**, reejecutada localmente con el mismo resultado. Detalle y comandos en [E2-ADAPTADOR-HTTP.md](./E2-ADAPTADOR-HTTP.md). Los fallos intermedios (DCR, Clippy, locks) fueron resultados obsoletos de edición concurrente, sin vigencia. |
| Verificación inicial durante esta tarea documental | Se intentaron Clippy, check y `--test http` con `--locked` y manifiesto de la crate. Check/test agotaron 120 s esperando locks; Clippy devolvió error de herramienta `ChildProcess.kill`. Reintento de check (30 s): mismo error de herramienta. No se eliminaron locks ni procesos ajenos. |
| Reintentos offline, código en edición paralela | `cargo check --offline --locked --manifest-path app/crates/paravel-mcp/Cargo.toml --all-targets`: exit 0. Clippy y `--test http` fallaron durante la edición concurrente; resultados invalidados por la validación final del coordinador y reejecuciones locales posteriores (Clippy exit 0; prueba mínima 1 passed/18 filtered). |
| Revisión independiente HTTP+OAuth (binario real, 2026-09-16) | Flujo completo contra el exe real en loopback con SQLite temporal propia y archivo de operador sintético: 401 sin Bearer con `WWW-Authenticate`; metadata RFC 9728/8414; DCR 201; consentimiento con attempt/CSRF/cookie → 302 con code; token + rotación de refresh (el access anterior revocado → 401); initialize/sesión con protocolo 2026-07-28 (rmcp 3.4.0 exige cabeceras SEP-2243 `Mcp-Method`/`Mcp-Name` y `_meta` con protocolVersion); exactamente tres tools; `leer_espacio` acotado a A; pieza oculta → `NOT_FOUND_OR_NOT_VISIBLE`; payload de pieza correcto; **sin secreto en stdout/stderr**. Resultado: **18/18 comprobaciones correctas** (script temporal en `%TEMP%`, sin cambios en el repo). Nota: `INVALID_STORED_DATA` observado una vez fue causa un fixture con payload no-JSON, no un defecto del servidor. Este ensayo sigue siendo local: no acredita E.4/E.5 ni conexión con Grok. |
| E.3 ejecución/aprobación | Pendiente. Esta tarea no instala ni inicia túnel/adaptador público. |
| E.4 cuenta, OAuth y tres tools reales | Pendiente; sin transcript ni compatibilidad OAuth acreditada. |
| E.5 comparación | Pendiente; no hay tiempos, éxitos ni recuentos medidos. |
| 4.9 / E.4 / E.5 aceptación | No cerrada por esta guía ni por tests locales. |

Plantilla de corrida (duplicar filas aquí al disponer de evidencia):

| Corrida/orden/modalidad | Modelo/superficie/versiones | v1 puntos/éxito | M1 aviso/stale | v2 puntos/éxito | calls por tool/fallos | segundos preparación/respuesta/actualización | intervenciones | aislamiento/retirada | decisión |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 manual → tools | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente |
| R2 tools → manual | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente |

Siguientes acciones humanas: el operador revisa mesa/archivo/proveedor y autoriza una ventana explícita; solo entonces ejecuta §12, mide §13 y demuestra retirada §14. Continuar, iterar o retirar se decide con esos datos, no con la existencia de esta guía.
