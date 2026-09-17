# Pack de mesa — contrato (WBS 1.1)

Qué se pone en la sesión de un Bot de mesa. Lo arma Paravel (hoy: a mano). Un tercero con esta hoja y los datos de **un** espacio arma el pack sin preguntar.

No es el CTO. No es MCP. No es el disco. En la sede la acción se llama **Preparar pack**: guardar y copiar el texto de esa mesa para pegarlo en un Bot. Paravel no conecta el Bot ni abre el chat. Ver [`ARQUITECTURA.md`](../arquitectura/ARQUITECTURA.md) §6.

Prompt de rol (aparte, se pega en la misma sesión): [`PROMPT-MESA.md`](./PROMPT-MESA.md).

---

## Dos vías: pack manual completo y selección persistida

Este contrato manual (WBS 1.1) permite armar un pack **completo**, con todas las piezas de una sola mesa y excerpts/adjuntos añadidos por el humano. La UI actual **Preparar pack / Editar pack** guarda un subconjunto en `pack_pieza` mediante `set_invite` y copia la nota más esas piezas seleccionadas; no genera excerpts ni adjuntos automáticamente. No confundir ese texto seleccionado con la plantilla manual completa de abajo.

MCP local (WBS 4, **implementado y verificado por E2E automatizado; aceptación humana pendiente**) consulta la selección **guardada** de `pack_pieza`, nunca todas las piezas por defecto. Pack vacío devuelve cero piezas; `marcada` solo decide Iniciar. Las casillas sin guardar no cambian el acceso MCP. La UI puede proponer todas las piezas al preparar un pack nuevo: revisarlas antes de guardar.

El proceso `paravel-mcp` se configura con `--db ABSOLUTE_SQLITE_PATH --espacio UUID`. Expone solo `leer_espacio`, `listar_piezas` y `leer_contexto_pieza`, mediante la biblioteca de lectura compartida `paravel-context`. No lista espacios, cambia de mesa, lee archivos, sigue URLs ni ejecuta acciones. Ni el prompt de rol ni una sesión MCP son autoridad de acceso; la configuración local fija el ámbito y SQL comprueba espacio + pack en cada llamada.

**La nota y los metadatos de la mesa siempre se comparten con el proceso configurado**, incluso sin piezas o con `bot_activo = 0`. `clear_invite` vacía `pack_pieza` y pone ese indicador a 0; no revoca la nota ni desconecta MCP. Para revocar futuras lecturas de la nota hay que deshabilitar la entrada del cliente y terminar su proceso, evitando reinicio automático. Cerrar Tauri no basta. Lo ya pegado en un chat o recibido por un cliente no se retira retroactivamente.

No se promete autenticación mediante `bot_activo`, detección automática de secretos ni puente hacia Grok Bot remoto. Revisar nota y payloads antes de compartir. Guía, comandos y evidencia técnica PASSED: [WBS-MCP.md](../planificacion/WBS-MCP.md). No se configuró conexión en el Cursor/opencode del usuario ni se repitió la regresión interactiva WebView 3.8 esta ronda. Esas comprobaciones humanas siguen pendientes para cerrar 4.9; el E2E automatizado con fixtures no las sustituye.

## Qué entra en el pack manual completo

| # | Pieza del pack | Fuente | Cómo se copia |
| --- | --- | --- | --- |
| 1 | Cabecera | El espacio | Nombre del espacio. Grupo: solo etiqueta. Nota del espacio, **completa**. |
| 2 | Lista de piezas | Mesa de **ese** espacio | Todas las piezas. Cada fila: nombre, `kind`, payload. Aunque no aporte excerpt. |
| 3 | Payloads | Cada pieza | JSON/`kind` de **esa** mesa. Path = etiqueta, no montaje. URLs web o locales según kind; no se abren al copiar ni vía MCP. |
| 4 | Excerpts | Piezas que aportan contexto | Fragmento suficiente para trabajar sin disco. Ver tabla de forma. |
| 5 | Adjuntos | Archivos **de esa mesa** | Solo si el Bot los necesita enteros (md, txt, pdf de la mesa). Si pesan: excerpt + nombre. |

Nada más. Marcado / no marcado es de Iniciar, no del pack. Ejemplo armado: [`packs/lecturas-web.md`](../../packs/lecturas-web.md).

### Payload por `kind` (v1)

Freeze: [`MODELO.md`](../arquitectura/MODELO.md). Los `kind` son los de `validate_piece_payload`, no sinónimos de producto.

| `kind` | Payload que se copia | Excerpt / adjunto |
| --- | --- | --- |
| `vscode` | `{ "path": "<etiqueta>" }` | No el repo. Solo docs de esa mesa que hagan falta para hablar. |
| `cursor` | `{ "path": "<etiqueta>" }` | Igual. |
| `folder` | `{ "path": "<etiqueta>" }` | Archivos de **esa** carpeta que sean de la mesa. |
| `file` | `{ "path": "<etiqueta>" }` | Solo si el archivo es el objeto de trabajo; si pesa, excerpt + nombre. |
| `firefox` | `{ "urls": ["http(s)://..."] }` | Web / Notion. Excerpt de la página si sin él no se puede trabajar. |
| `firefox-group` | `{ "urls": ["https://...", "file:///C:/..."] }` | URLs web y archivos locales validados por la app. Copiar el payload no lee sus destinos; excerpts/adjuntos solo manuales. |

`folder` = carpeta. Notion no es un kind aparte: es `firefox` + URL `http(s)`. Otro `kind`: se anota como link (`nombre` + URL o path-etiqueta). No se inventa payload.

El pack **manual completo** lista todas las piezas de esa mesa. El texto seleccionado que copia la UI y las lecturas MCP usan el subconjunto guardado en `pack_pieza` / `set_invite`, siempre de la misma mesa. Marcado / no marcado sigue siendo de Iniciar.

### Forma de un excerpt

```text
pieza: <nombre>
kind:  <kind>
origen: <path-etiqueta o URL>
---
<texto>
```

Un excerpt por documento. Varios documentos = varios bloques. Origen siempre etiqueta o URL, nunca “abre C:\…”.

---

## Qué no entra

| Queda fuera | Por qué |
| --- | --- |
| Disco de la cuenta, home, otras carpetas | El Bot no ve `C:\Users\...` salvo lo que este pack le pase. Path ≠ montaje. |
| Otras mesas / otros espacios | Aislamiento de producto. Aunque vivan en el mismo disco. |
| Mapa de Paravel (grupos, lista de espacios) | Eso es el CTO. |
| Instrucciones de dirigir, despachar u orquestar Bots | El Bot de mesa no es el CTO. |
| Secretos (`.env`, claves, credenciales) | No van al pack. |
| MCP, tools, conectores, el repo de Paravel | El asiento manual es chat + pack; MCP solo da lectura de la selección guardada, con otra aceptación propia. |
| Código fuente masivo | Solo si **es** el objeto de trabajo de esa mesa y sin un recorte no se puede hablar. Recorte, no dump. |

Si hay duda entre dos espacios: no entra. Si hay duda de si el Bot “necesita el mapa”: no entra.

---

## Cómo armar (orden fijo)

1. Elegir **un** espacio. Ignorar el resto.
2. Escribir la cabecera (plantilla abajo).
3. Listar **todas** las piezas de esa mesa, con payload.
4. Por cada pieza que aporte contexto: excerpt o adjunto. El resto queda solo en la lista.
5. Quitar todo lo de la tabla “no entra”.
6. Entregar cabecera + lista + excerpts + adjuntos a la sesión. Pegar [`PROMPT-MESA.md`](./PROMPT-MESA.md).

Listo si un tercero lo arma sin preguntar y el Bot puede trabajar **esa** mesa sin pedir disco ni otra mesa.

Si el pack manual no alcanza: se itera **esta** hoja, no MCP. Registro: [`OBSERVAR-PACK.md`](./OBSERVAR-PACK.md).

---

## Plantilla (copiar por mesa)

```text
# Pack — <nombre del espacio>
Grupo: <nombre del grupo>   (etiqueta)
Nota:
<nota completa del espacio>

## Piezas
| nombre | kind | payload | excerpt | adjunto |
| --- | --- | --- | --- | --- |
|  |  |  | sí/no | sí/no |

## Excerpts
pieza:
kind:
origen:
---

## Adjuntos
- <nombre de archivo> — de esta mesa
```
