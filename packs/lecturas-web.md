# Pack — Lecturas web

Grupo: Universidad   (etiqueta)
Nota:
Dos páginas de referencia. Mesa de lecturas web; no es la sede ni el mapa de Paravel.

## Cómo se usa (asiento 1.3)

No es una sesión live con Grok Bot. El humano pega, en este orden, en el Grok Bot invitado:

1. [`PROMPT-MESA.md`](../docs/pack/PROMPT-MESA.md) — completar `Mesa: Lecturas web` y `Grupo: Universidad`.
2. Este pack (esta hoja). Nada más de otra mesa.

El JSON de piezas de **esta** mesa (mismo recorte, forma `list_pieces` / `set_invite`): [`lecturas-web.json`](./lecturas-web.json).

## Piezas

| nombre | kind | payload | excerpt | adjunto |
| --- | --- | --- | --- | --- |
| https://example.com | firefox | `{"urls":["https://example.com/"]}` | sí | no |
| https://www.mozilla.org | firefox | `{"urls":["https://www.mozilla.org/"]}` | sí | no |
| web-design | vscode | `{"path":"web-design"}` | no | no |

Path = etiqueta, no montaje. No va `C:\Users\...`. Marcado / no marcado es de Iniciar, no de este pack.

## Excerpts

pieza: https://example.com
kind:  firefox
origen: https://example.com/
---
Dominio de ejemplo. Página mínima de referencia HTTP.

pieza: https://www.mozilla.org
kind:  firefox
origen: https://www.mozilla.org/
---
Sitio de Mozilla. Segunda pestaña de esta mesa de lecturas.

## Adjuntos

Ninguno. El repo `web-design` no se adjunta: el Bot trabaja con la lista y las URLs de esta mesa, no con el disco.
