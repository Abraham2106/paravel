# Hoja 1.4 — ¿el pack alcanzó? ¿usurpó al CTO?

Criterio de salida de la etapa 1. Esta pasada cierra 1.4 con **observación de contrato/código**, no con una sesión live de Grok Bot (no hay login a grok.com desde aquí). MCP sigue fuera.

Asiento 1.3 (pack listo para pegar, una mesa): [`packs/lecturas-web.md`](../../packs/lecturas-web.md). El humano pega [`PROMPT-MESA.md`](./PROMPT-MESA.md) (Mesa: Lecturas web · Grupo: Universidad) y luego ese pack.

Contrato: [`PACK.md`](./PACK.md). Rol: [`PROMPT-MESA.md`](./PROMPT-MESA.md). Modelo: [`MODELO.md`](../arquitectura/MODELO.md).

---

## Las dos preguntas

Contestar sí o no. Esta pasada: evidencia de contrato + código (qué entra al pack, que el CTO no vive ahí, aislamiento de mesas). Una charla live queda como fila aparte, si el humano la hace. No tesis suelta. No MCP.

| # | Pregunta | Sí si | No si |
| --- | --- | --- | --- |
| 1 | ¿El pack alcanzó? | El Bot trabajó la mesa con nota, piezas, excerpts y adjuntos que se le pasaron. No pidió disco ni otra mesa para poder hacer el trabajo. | Pidió el disco, otra carpeta, otra mesa, o el trabajo se cayó por falta de contexto que **sí** era de esta mesa y no estaba en el pack. |
| 2 | ¿Usurpó al CTO? | Dirigió a otros espacios, orquestó Bots, habló del mapa de Paravel, o hizo de despacho en vez de trabajar **esta** mesa. | Se quedó en su mesa. Si faltaba contexto, lo dijo; no se puso a dirigir Paravel. |

Las dos tienen que tener respuesta observada. Una en blanco = 1.4 no cierra.

---

## Cómo anotar

Una fila por observación. Corto. Si es charla: citar al Bot. Si es contrato/código (esta pasada): citar invoke, tabla o cláusula de PACK.md.

| Campo | Qué poner |
| --- | --- |
| Fecha | Día de la charla. |
| Mesa | Nombre del espacio. Una sola. |
| Pack alcanzó | `sí` / `no`. |
| Usurpó al CTO | `sí` / `no`. |
| Evidencia (pack) | Frase del Bot o del usuario que prueba 1. Recorte, no acta. |
| Evidencia (CTO) | Igual para 2. Si no usurpó: una frase donde se queda en la mesa o declara el hueco. |
| Siguiente | Ver tabla de abajo. Una línea. |

No anotar MCP, spawn, UI, ni “hay que construir tools”. Eso no es 1.4.

### Registro

```text
fecha:
mesa:
pack alcanzó:     sí / no
usurpó al CTO:    sí / no
evidencia pack:
evidencia CTO:
siguiente:
```

### 2026-09-16 — contrato/código (no charla)

```text
fecha:            2026-09-16
mesa:             Lecturas web (grupo Universidad)
pack alcanzó:     sí
usurpó al CTO:    no
evidencia pack:   PACK.md + list_pieces/get_invite filtran por espacio_id. El pack de esta mesa trae nota + 3 piezas suyas (2 firefox con urls, 1 vscode path-etiqueta web-design). set_invite rechaza pieza de otro espacio («Una pieza no pertenece a este espacio.»). No hace falta disco ni «Mi escritorio». Se iteró PACK.md: kinds reales folder/file/firefox.urls (antes carpeta / url suelta).
evidencia CTO:    PACK.md «Qué no entra» excluye mapa, otras mesas y despacho. PROMPT-MESA.md: «No eres el CTO». No hay tabla CTO. list_groups/list_spaces son invokes de sede, no van al pack. pack_pieza es (espacio_id, pieza_id) de ESA mesa; delete_piece limpia pack_pieza.
siguiente:        1.4 cierra por contrato/código. MCP sigue pospuesto. Charla live con Grok Bot = opcional del humano, no bloquea este WP.
```

---

## Si no alcanza — iterar el pack, no MCP

| Observado | Se toca | No se toca |
| --- | --- | --- |
| Pack no alcanzó | [`PACK.md`](./PACK.md): qué entra, excerpts, lista de piezas. Otra sesión 1.3. | MCP, tools, conectores, app, Rust. |
| Usurpó al CTO | [`PROMPT-MESA.md`](./PROMPT-MESA.md) (texto fijo; no un prompt distinto por mesa). Otra sesión 1.3. | MCP. No “darle el mapa para que no se pierda”. |
| Pack alcanzó y no usurpó | 1.4 cierra. | MCP sigue pospuesto. |

MCP no es el asiento. Si el pack no alcanza, se itera 1.1. No se salta a la etapa 4.
