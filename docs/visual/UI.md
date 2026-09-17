# UI — guía temporal

El HTML en [`preview.html`](./preview.html) es **guía de UI/UX**, no el producto ni el host.

Cerrado (no se reabre en este mock):

| Qué | Cómo |
| --- | --- |
| Paleta y tipo | Cursor: `#0f0f0f` / `#121212` / `#171717` / `#ececec` / acento `#6f8dff`. IBM Plex Sans + Mono. |
| Agrupación | Notion: grupos en el sidebar, sede en galería **o** tabla, breadcrumbs Sede / grupo / espacio. |
| Iniciar | Play de la esquina sobre lo **marcado**. El clic del espacio no lanza. |
| Host | Solo Rust / mock. La UI no hace shell. Argv: `Code.exe`, `Cursor.exe`, `firefox.exe` — nunca `.cmd`. |

Del demo se toma (temporal):

- Tiles de pieza con dos estados reales (`aria-pressed`)
- Barra Iniciar solo con selección
- Preparar pack = guardar / copiar el pack de esa mesa (no abre chat)
- Log del host (argv, copiar, reproducir)
- ⌘K, atajos, CTO que dirige y no abre el repo
- Tema claro tipo papel Notion (el oscuro sigue siendo Cursor)

No es fuente de verdad: spawn, SQLite, MCP, ni el CTO de producción. Banner `mock host`.
