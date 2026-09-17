# Paravel

Workplace de tus workplaces. Plataforma para dar sitio a proyectos, investigaciones y productos.

Los nombres concretos —un repo, una startup, un curso— son **inquilinos**, no el producto.

Infografía de producto: [`paravel-infografia.png`](../visual/paravel-infografia.png)

Etapas y capas (entregables, expectativa, reutilización): [`etapas.html`](../visual/etapas.html) · [`paravel-etapas.png`](../visual/paravel-etapas.png) · [`ETAPAS.md`](../planificacion/ETAPAS.md)

WBS: [`WBS.md`](../planificacion/WBS.md)

Pack de mesa (1.1–1.4): [`PACK.md`](../pack/PACK.md) · [`PROMPT-MESA.md`](../pack/PROMPT-MESA.md) · [`OBSERVAR-PACK.md`](../pack/OBSERVAR-PACK.md) · asiento [`packs/lecturas-web.md`](../../packs/lecturas-web.md)

Complemento de implementación: [`ARQUITECTURA.md`](../arquitectura/ARQUITECTURA.md) · freeze del schema: [`MODELO.md`](../arquitectura/MODELO.md) · kit de spawn: [`CAPAS.md`](../arquitectura/CAPAS.md)

---

## Tesis

Entras a un **espacio**, marcas qué piezas de su mesa se inician, y puedes sentar un Grok Bot en esa mesa.

En la **puerta de Paravel**, un Grok Bot tipo CTO te escucha y te dirige a un espacio — o pone a hablar a los Bots de dos espacios. Ese CTO no hace el trabajo de todas las mesas.

Paravel **funciona sin Grok Bot**. Se potencia con él: compañeros persistentes, sin construirles computador. La integración pega una pieza. No es el eje.

## Qué no es

- Un launcher
- Un IDE
- Otro Notion
- Grok Bot (eso se invita; no se reconstruye)
- Un marketplace de plugins
- Un overlay flotante

## Paleta e interfaz

Estilo primero: paleta y tipografía tipo **Cursor**; agrupación de espacios tipo **Notion** (grupos, listas, tablas). Paravel se usa como **ventana de sede**, no como botón sobre el escritorio.

Guía temporal de UI (interacción, no producto): [`preview.html`](../visual/preview.html) · contrato [`UI.md`](../visual/UI.md)

---

## Capas

```text
Paravel          → la app
  CTO            → dirigir a un espacio · orquestar Bots de mesas distintas
  Grupo          → estante (Trabajo, Universidad, …)
    Espacio      → un proyecto o investigación
      Piezas     → código, web, Notion, carpeta…
      Iniciar    → play de lo marcado
      Bot de mesa → opcional; trabaja en esa mesa
```

Un solo linaje. Se replica: muchos grupos, muchos espacios, mismas reglas.

| Capa | Es | No es |
| --- | --- | --- |
| Paravel | Workplace de tus espacios | Launcher, IDE, ni otro Notion |
| CTO | Dirige a un espacio y orquesta Bots entre espacios | Quien hace el trabajo de todas las mesas |
| Grupo | Estante (Trabajo, Universidad) | Otro tipo de producto |
| Espacio | Sitio de un proyecto o investigación | Un atajo a una app |
| Pieza | Superficie que se abre | Un plugin de marketplace |
| Grok | El modelo (cerebro; p. ej. Grok 4.6) | Un compañero con escritorio |
| Grok Bot | Producto de xAI: compañero persistente que se invita | Algo que Paravel debe reconstruir |
| MCP / plugins | Tubería para contexto del Bot | El menú ni el eje de la app |

---

## El espacio

Unidad que usas. Un proyecto de código y una investigación son el **mismo tipo de objeto**: un conjunto con piezas. Los grupos solo los ordenan.

### Mesa

Piezas que ya usas: editor (Cursor / VS Code), carpeta, web, Notion. Se marcan. Se agregan o se quitan como en una carpeta de apps del teléfono.

### Iniciar

No es el clic del espacio. Es el play de la esquina sobre la **selección**: una pieza, un subgrupo, o todo. A veces abres solo el repo; a veces todas las pestañas relacionadas.

### Compañía (opcional)

Grok Bot invitado a **esa** mesa. Sin Bot, el espacio sigue sirviendo: mesa + iniciar ya son producto.

---

## Relación con Grok Bot

Grok es el motor. **Grok Bot** es el producto de xAI (beta 2026): compañeros con nombre, memoria y una **computadora en la nube por cuenta** (browser, archivos, terminal, conectores, MCP). Compite en el mismo mercado que Claude Cowork y ChatGPT Work. Promesa útil para Paravel: puede operar apps **sin API ni conector MCP**.

Paravel no reconstruye esa computadora. La **invita** a un espacio.

Punto de diseño, no de marketing: xAI avisa que **bots distintos no son un límite de seguridad**. La VM, archivos, sesiones de browser y conectores se comparten a nivel de cuenta. Borrar un Bot no limpia esa mesa compartida.

Por tanto **“esta mesa no mezcla con esa” no viene de Grok Bot**. Lo pone Paravel: qué contexto le pasa a cada Bot invitado (pack de esa mesa, no el disco ni el resto de espacios). El aislamiento es de producto, no un supuesto de la plataforma.

---

## El CTO (puerta de Paravel)

Conversación: le dices en qué andas. Tres salidas:

1. **Dirigir** — un espacio, o varios, o “no hay, ¿lo creamos?”
2. **Orquestar** — poner en contacto a Bots de distintos espacios
3. Nada — si ya sabes adónde ir, no le hablas; la lista sigue siendo puerta

Conoce el **mapa** (nombres, grupos, de qué va cada sitio). No el contenido de cada mesa.

Si se pone a investigar o a codear por ti, dejó de ser CTO y se volvió un chat omnisciente.

### Orquestación (terreno de Paravel)

Grok Bot no documenta un chat nativo donde varios Bots conversan solos entre sí. Lo documentado es orquestación **hacia** un Bot (rutinas, eventos, capas tipo Composio sobre apps).

El equivalente en Paravel no es “apps”: es **espacios**. Ejemplo (inquilino, no el producto): *“@cto contáctame con el bot de Alaira; que conversen”*. El CTO no hace la investigación de Alaira. Abre un hilo, le pasa a cada Bot **solo el contexto de su mesa**, y coordina el handoff.

Eso es valor propio. Sin esa capa, el CTO solo es un buscador de espacios por chat.

### Dos Bots, dos trabajos

- **CTO** — mapa + despacho + orquestación entre espacios.
- **Bot de mesa** — invitado a un espacio. Trabaja con el pack de esa mesa.

Rutinas de Grok Bot (eventos, reejecución) pueden vivir *dentro* de un espacio (“vigila esta investigación”). El CTO no las ejecuta por debajo de todas las mesas.

---

## Integración

El producto gira alrededor del **espacio**. La integración es cómo una pieza se pega.

Contrato de una pieza:

1. **Estar** — se ve en el espacio, se puede marcar
2. **Iniciar** — el play la abre
3. **Aportar contexto** — opcional: qué puede leer un Bot invitado
4. **Decir si está viva** — opcional: desconectada, path que no existe

Detrás: atajos y deep links (Cursor, VS Code, carpeta, URL). MCP solo donde un Bot necesita leer o actuar, no para abrir apps.

Los plugins de Grok Bot se **invitan**, no se clonan. Paravel no es el marketplace.

v1 visible: Cursor, VS Code, carpeta, URL (web / Notion), Bot invitado. El resto es un link hasta que duela.

---

## Loop

```text
CTO (o lista)  →  Entrar  →  Marcar  →  Iniciar
       ↓                          ↘  Bot de mesa (si hay)
  orquestar Bots de espacios distintos
```

Tres verbos: **entrar**, **encargar**, **orquestar**. El resto es mantenimiento.

---

## Plan para observar (no para construir)

Cada sesión se pasa o se corrige la tesis. Si obliga a hablar de plugins, MCP o esquemas, se está bajando de capa demasiado pronto.

| # | Qué hacer | Qué observar | Se rompe si |
| --- | --- | --- | --- |
| 1 | Decir la tesis a alguien que no estuvo en estas charlas | Si “Paravel” se entiende en una frase | La gente oye “otro Notion” o “un launcher” |
| 2 | Mapear 5 cosas reales como espacios | Si el objeto de primer nivel aguanta diversidad | Hay que inventar un tipo nuevo por cada ejemplo |
| 3 | Recorrer entrar → marcar → iniciar (una pieza, luego todo) | Si el play de esquina cubre ambos gestos | El clic del espacio lanza todo y no se puede elegir |
| 4 | Usar un espacio sin Bot invitado | Si la mesa sola ya es producto | Sin agente el espacio no tiene sentido |
| 5 | Invitar un Grok Bot a un solo espacio | Si el contexto es el pack de esa mesa | El Bot ve otra mesa o el disco de la cuenta |
| 6 | Usar Paravel como ventana de sede, sin overlay | Si la casa se entiende como app | Se cuela un overlay o launcher como el producto |
| 7 | Hablarle al CTO con 5 intenciones reales | Si dirige al espacio y no hace él el trabajo | Investiga, codea o mezcla mesas |
| 8 | Pedirle al CTO que ponga en contacto dos Bots de espacios distintos | Si orquesta sin fusionar mesas | Un solo chat con el contexto de ambos proyectos |

### Seguir

- El espacio es el centro.
- El CTO dirige y orquesta; el Bot de mesa trabaja.
- El pack de contexto lo arma Paravel; no se fía del aislamiento de Grok Bot.
- Iniciar es una acción, no la entrada.
- Grok Bot se invita; no se clona. Paravel ya es producto sin él.

### Parar

- Menú de MCP o plugins como home.
- Un chat de Paravel que hace el trabajo de todas las mesas.
- Asumir que dos Bots invitados no se ven porque xAI los separa.
- Tratar un ejemplo (un repo, una startup) como el producto.
- Construir el computador del Bot dentro de Paravel.

---

## Siguiente piso

Cuando estas ocho sesiones no cambien la tesis: una pantalla de Paravel (grupos) y una de espacio (piezas + play). Todavía sin modelo de datos.
