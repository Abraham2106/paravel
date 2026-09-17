# WBS — Paravel

Actualización de aceptación: regresión nativa Tauri + MCP completada (evidencia local en `reports/`, no versionada). Cliente elegido: Grok web/app. La conexión requiere transporte remoto y autenticación, todavía ausentes del servidor stdio local. WP 4.9 permanece abierto por esa integración; las menciones posteriores a regresión pendiente quedan actualizadas por este resultado.

Alcance: etapas 1–3 y etapa 4, abierta por instrucción del usuario el 2026-09-16. Puertas 2.9 y 3.8 aceptadas históricamente. MCP implementado y E2E automatizado completo, con resultados PASSED de agentes y coordinador registrados en WBS-MCP.md. Pendientes conexión en el cliente real del usuario y regresión interactiva WebView 3.8, no repetida esta ronda; 4.9 no está aceptado.

```text
pack + chat  →  Iniciar  →  pantalla de espacio  →  MCP (implementado; aceptación humana pendiente)
```

Regla del 100 %: si no está aquí, no es trabajo de este tramo. Lo excluido va al final, no se esconde en un WP.

Infografía de etapas: [`ETAPAS.md`](./ETAPAS.md) · arquitectura: [`ARQUITECTURA.md`](../arquitectura/ARQUITECTURA.md)

---

## Árbol

```text
0  Paravel
│
├── 0.1  Gobierno de producto                          [hecho]
│
├── 1    Pack + chat                                   [asiento listo]
│   ├── 1.1  Contrato del pack                         [hecho]
│   ├── 1.2  Prompt de rol (no eres el CTO)            [hecho]
│   ├── 1.3  Asiento/pack de una mesa                   [hecho · pack, no sesión live]
│   └── 1.4  Criterio de salida                        [hecho · contrato/código]
│
├── 2    Launch-host — Iniciar                         [kit]
│   ├── 2.1  App Tauri v2 + React
│   ├── 2.2  Capabilities: solo invoke
│   ├── 2.3  Protocolo JSON / kind
│   ├── 2.4  Adaptador vscode (Code.exe)
│   ├── 2.5  Adaptador firefox (firefox.exe)
│   ├── 2.6  Validación (path, URL, .exe)
│   ├── 2.7  Log argv
│   ├── 2.8  UI mínima de disparo
│   └── 2.9  Criterio de salida                        [aceptado · replay real + confirmación visual del usuario]
│
├── 3    Pantalla de espacio                           [producto]
│   ├── 3.1  Esquema SQLite + migraciones
│   ├── 3.2  Persistencia grupo / espacio / pieza
│   ├── 3.3  Validar payload antes del INSERT
│   ├── 3.4  Diálogo nativo de carpeta
│   ├── 3.5  UI de mesa (Todo / Ninguno / Quitar)      [verificado · Tauri + SQLite reales]
│   ├── 3.6  Iniciar consume el kit (2.x)
│   ├── 3.7  Kinds v1
│   └── 3.8  Criterio de salida                        [aceptado · recorrido nativo + persistencia]
│
└── 4    MCP local de lectura                          [implementado · E2E automático completo · aceptación humana pendiente]
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

### Estado (honestidad)

| WP | Estado | Qué es, qué no es |
| --- | --- | --- |
| **1.1** | Hecho | [`PACK.md`](../pack/PACK.md). Iterado 2026-09-16: kinds reales `folder` / `file` / `firefox.urls`. |
| **1.2** | Hecho | [`PROMPT-MESA.md`](../pack/PROMPT-MESA.md). Texto fijo. |
| **1.3** | Hecho · asiento | Pack de **Lecturas web** listo para pegar: [`packs/lecturas-web.md`](../../packs/lecturas-web.md). No hubo sesión live con Grok Bot. |
| **1.4** | Hecho · contrato/código | Las dos preguntas en [`OBSERVAR-PACK.md`](../pack/OBSERVAR-PACK.md). No es cita de chat. MCP fuera. |
| **2.9** | Aceptado | VS Code + Firefox lanzados desde Tauri y reproducidos con `-Run`, exit 0. Rechazos con argv vacío comprobados. El usuario confirmó visualmente carpeta paravel y ventana Firefox con example.com y mozilla.org. |
| **3.3** | Verificado | Payload inválido rechazado sin INSERT, incluido archivo local inexistente/fuera de root en `firefox-group`. Validación repetida al lanzar. |
| **3.5** | Verificado · nativo | Entrar, Todo / Ninguno, Iniciar solo marcadas y Quitar (limpia `pack_pieza`) probados en WebView2 + SQLite reales. |
| **3.7** | Implementado · contrato actualizado | Kinds `vscode`, `cursor`, `firefox`, `firefox-group`, `folder`, `file`. Modelo documenta URLs locales validadas para grupos Firefox. |
| **3.8** | Aceptado | Recorrido nativo verificado; selección y eliminación persisten tras terminar/reabrir Tauri. [MODELO.md](../arquitectura/MODELO.md) actualizado. Dependencia 2.9 satisfecha con confirmación visual del usuario. |
| **4** | Implementado; E2E automatizado completo; aceptación humana pendiente | [WBS-MCP.md](./WBS-MCP.md): contexto 17 tests, MCP 5 unitarios + 18 integraciones stdio reales, Tauri 5 tests de biblioteca PASSED. SDK exacto 3.4.0/lockfiles, clippy tres crates, fmt crates nuevas, frontend build y release/CLI PASSED. No hay conexión configurada en el cliente del usuario ni regresión WebView repetida esta ronda; 4.9 abierto. |

Dependencia: 1 no bloquea 2; 2.9 → 3.8 → 4.1. Las puertas 2.9 y 3.8 conservan su aceptación histórica. Implementación y E2E automatizado de 4 completos; quedan conexión/aceptación en el cliente del usuario (4.8) y regresión interactiva WebView para el cierre 4.9. Los 5 tests de biblioteca Tauri no sustituyen ese recorrido.

---

## Diccionario

| Código | Paquete | Entregable | Se acepta si | Reutilizable |
| --- | --- | --- | --- | --- |
| **0.1** | Gobierno de producto | `PRODUCTO.md`, `ARQUITECTURA.md`, `CAPAS.md`, `ETAPAS.md`, infografías | Tesis, capas y orden de avance no se reabren cada sesión | Docs del producto |
| **1.1** | Contrato del pack | Lista de qué entra (notas, archivos, payloads de *esa* mesa) y qué no (disco, otras mesas) | Un tercero puede armar el pack sin preguntar | Gesto, no código |
| **1.2** | Prompt de rol | Texto fijo: trabajas esta mesa; no eres el CTO | El Bot no dirige Paravel ni mezcla espacios | Texto de producto |
| **1.3** | Asiento/pack de una mesa | Pack de ESA mesa listo para pegar (PROMPT + pack). Grok Bot lo sienta el humano | El pack existe y es de una sola mesa. Esta pasada **no** exige chat live | Producto xAI, no nuestro |
| **1.4** | Criterio de salida · pack | Registro: ¿el pack alcanzó? ¿usurpó al CTO? | Las dos preguntas tienen respuesta. Esta pasada: contrato/código. Si el pack no alcanza, se itera 1.1, no MCP | — |
| **2.1** | App Tauri v2 + React | `create-tauri-app` (React). Host = proceso Rust, no sidecar | Arranca ventana; el frontend no spawnea | Plantilla, no el validador |
| **2.2** | Capabilities | Manifiesto: comandos `invoke` propios. **Sin** `shell:allow-execute` | Grep del frontend: cero spawn, cero plugin shell | Kit |
| **2.3** | Protocolo | JSON tipado: `kind` + payload. Un comando Rust por `kind` | Un `kind` desconocido se rechaza; no hay “comando libre” | Kit |
| **2.4** | Adaptador vscode | Spawn de `Code.exe --new-window <carpeta>`. No `code.cmd` | El argv del log, pegado en terminal, abre la misma carpeta | Kit |
| **2.5** | Adaptador firefox | Spawn de `firefox.exe --new-window` + dos URLs `http(s)` | Igual: argv reproducible; ventana nueva con esas URLs | Kit |
| **2.6** | Validación | `canonicalize` + root permitido; `firefox` solo `http`/`https`; el `.exe` existe | Path fuera del root o URL `file:` en `firefox` = rechazo en log, cero proceso. `firefox-group` permite archivos locales con la misma validación de `file`. Error claro si falta el `.exe` | Kit |
| **2.7** | Log argv | Archivo append-only: tiempo, request_id, kind, argv, resultado | Se reproduce un `request_id` a mano | Kit |
| **2.8** | UI mínima | Un control que dispara vscode y otro firefox. Host apagado → “host no disponible”, no shell | Con el host caído, la UI no inventa un comando | Kit (el botón; no la sede) |
| **2.9** | Criterio de salida · Iniciar | Los dos gestos de 2.4 y 2.5 + 2.6 y 2.7 | Si el argv del log no replica el de terminal, no se sigue a 3 | Kit entero |
| **3.1** | Esquema SQLite | Tablas `grupo`, `espacio`, `pieza`, `pack_pieza` (UUID TEXT, payload JSON, `marcada`). `CREATE TABLE IF NOT EXISTS` en rusqlite; no hay crate `rusqlite_migration` | Schema en un solo sitio; timestamps en entidades; `pack_pieza` es relación con PK compuesta sin timestamps, conforme a MODELO.md | No. Es Paravel |
| **3.2** | Persistencia | CRUD en Rust. El webview **no** usa `tauri-plugin-sql` | Toda escritura pasa por comando invoke | No |
| **3.3** | Validar al guardar | Misma validación que 2.6 **antes** del INSERT. Si falla, no hay fila | Path inválido no deja pieza fantasma | La validación es kit; el INSERT es Paravel |
| **3.4** | Diálogo nativo | Picker de carpeta del SO, no texto libre | No se pega un path a mano en un input | Tauri dialog; el criterio es nuestro |
| **3.5** | UI de mesa | Espacio: piezas, Todo / Ninguno / Quitar, Iniciar en la esquina. Paleta Cursor | El clic del espacio **no** lanza todo. Lo no marcado no se abre. Quitar llama `delete_piece` | Tiles/play, sí |
| **3.6** | Play → kit | Iniciar llama 2.x. No reescribe spawn | Un solo camino de argv; el log es el de 2.7 | Consume kit |
| **3.7** | Kinds v1 | `vscode`, `cursor` (`Cursor.exe`), `folder`, `file`, `firefox` (web / Notion), `firefox-group` (URLs web y archivos locales validados) | Un kind nuevo = adaptador nuevo, no un else genérico | Adaptadores: kit. Cuáles existen: Paravel |
| **3.8** | Criterio de salida · espacio | Mesa usable: entrar, marcar, play. Modelo quieto en [`MODELO.md`](../arquitectura/MODELO.md) | Grupo / espacio / pieza / `pack_pieza` e Iniciar no se rediseñan cada semana | — |
| **4** | MCP local de lectura | [Desglose 4.1–4.9 y guía de instalación](./WBS-MCP.md). `paravel-context` puro compartido con Tauri; `paravel-mcp` standalone stdio, SDK exacto 3.4.0; espacio fijo por CLI + `pack_pieza`. Solo `leer_espacio`, `listar_piezas`, `leer_contexto_pieza` | 4.9: cliente elegido consulta contexto autorizado; cero escritura/spawn, retirada comprobada y regresión 3.8 pasa. Sin aceptación anticipada por documentar/build | Biblioteca de lectura sí; tools propias de Paravel |

---

## Condiciones de alcance MCP

La nota se comparte siempre con el proceso configurado, incluso tras `clear_invite`: este vacía `pack_pieza` y pone `bot_activo = 0`, pero no desconecta MCP. Para revocar futuras lecturas de la nota hay que deshabilitar la entrada del cliente y terminar el proceso. `bot_activo` no es autenticación; `marcada` solo decide Iniciar. Pack vacío = cero piezas, sin fallback. El pack manual completo y la selección persistida son vías distintas, según [PACK.md](../pack/PACK.md).

Sin `listar_espacios`, autoridad del prompt/sesión ni puente hacia Grok Bot remoto. Configuración local fija DB/UUID; cada lectura valida espacio + selección. [WBS-MCP.md](./WBS-MCP.md) incluye build release reproducible con `--locked`, evidencia PASSED, ruta del exe, CLI, JSON `mcpServers`, fuentes oficiales del SDK/protocolo y comandos de verificación. La compatibilidad de formato con Cursor no sustituye la aceptación formal del cliente elegido.

## Qué cuenta como “terminado” cada etapa

| Etapa | WP de salida | Utilizable entonces |
| --- | --- | --- |
| 1 | 1.4 | Pack + prompt listos; 1.4 respondido por contrato/código. Charla live con Grok Bot sigue siendo del humano. |
| 2 | 2.9 | Launch-host en otros proyectos. Paravel todavía no es sede. |
| 3 | 3.8 | Paravel como ventana de sede. Pack sigue siendo carpeta/chat. |
| 4 | 4.9 | Cliente MCP local de lectura, instalado y probado en el cliente elegido; primero implementación, pruebas, transcript y aceptación de 4.1–4.9. Hoy implementación y E2E automatizado están completos; cliente personal y regresión interactiva WebView pendientes. |

---

## Fuera de este WBS

No se estiman, no se descomponen, no se “dejan a medias” dentro de 1–3:

- CTO en la puerta (UI de chat, dirigir, orquestar Bots entre espacios)
- Overlay flotante, Jarvis, Electron
- Reconstruir Grok Bot / su VM
- MCP de acción, `iniciar_espacio`, MCP público, túneles, 24/7
- Sync entre dispositivos
- Motor de vistas tipo Notion (gallery / tabla detallada)
- Icono nativo del SO (v1: mapa extensión → SVG)
- Reusar pestañas ya abiertas en Firefox
- Chrome / Edge como adaptadores
- `tauri-plugin-sql` desde el webview

El CTO y la orquestación son producto; entran en un WBS posterior, cuando 3.8 aguante.
