# Etapas y capas

Infografía: [`etapas.html`](../visual/etapas.html) · [`paravel-etapas.png`](../visual/paravel-etapas.png)

WBS (paquetes, aceptación, kit): [`WBS.md`](./WBS.md)

Orden cerrado ([ARQUITECTURA.md](../arquitectura/ARQUITECTURA.md) §9):

```text
pack + chat  →  Iniciar (Tauri mínimo)  →  pantalla de espacio  →  MCP local de lectura
```

Las **capas** no cambian de etapa a etapa. Cambia qué se entrega y si el artefacto sirve fuera de Paravel.

---

## Capas (siempre)

### Kit de inicio — [CAPAS.md](../arquitectura/CAPAS.md)

```text
UI React  →  invoke()  →  Rust valida / argv  →  .exe del SO
```

React y el Bot son clientes. Solo Rust toca el SO. Sin `code.cmd`, sin `shell:allow-execute` en el frontend.

### Producto — [PRODUCTO.md](../producto/PRODUCTO.md)

```text
Paravel (sede, CTO)  →  Grupo  →  Espacio  →  Piezas + Iniciar + Bot opcional
```

---

## Etapa 1 — Pack + chat

| | |
| --- | --- |
| **Estado** | Ahora. Uso, no código de app. |
| **Entregable** | Un Grok Bot sentado en *una* carpeta local. Pack = notas, archivos, payloads de esa mesa. Prompt de rol: no eres el CTO. |
| **Se espera** | ¿El pack alcanza? ¿El Bot usurpa al CTO o se queda en su mesa? |
| **Uso** | Validar la tesis con conversación real. El chat es el producto Grok Bot; Paravel solo decide qué carpeta se le da. |
| **Reutilizable** | El gesto sí. No hay binario propio. No es kit. |

---

## Etapa 2 — Iniciar (Tauri mínimo)

| | |
| --- | --- |
| **Estado** | Siguiente a construir. Kit. |
| **Entregable** | App Tauri mínima. `Code.exe` + carpeta. `firefox.exe` + dos URLs. Log con el argv exacto. |
| **Se espera** | Pegar el argv del log en una terminal produce el mismo resultado. Error claro si el `.exe` no está. |
| **Uso** | Abrir VS Code / Cursor / Firefox desde cualquier launcher futuro. Sirve hoy, antes de que exista la sede. |
| **Reutilizable** | Sí. Kit launch-host. Otros proyectos pueden copiarlo entero. |

---

## Etapa 3 — Pantalla de espacio

| | |
| --- | --- |
| **Estado** | Producto Paravel. |
| **Entregable** | SQLite grupo / espacio / pieza. UI de mesa: marcar una o todas, Iniciar en la esquina. Diálogo nativo de carpeta. |
| **Se espera** | Entrar a un espacio, marcar piezas, play. Lo no marcado no se abre. El modelo deja de moverse cada semana. |
| **Uso** | Paravel como sede. El play llama al kit de la etapa 2; no lo reescribe. |
| **Reutilizable** | Tiles y play, sí. El esquema SQLite es Paravel, no kit. |

---

## Etapa 4 — MCP lectura (pospuesto)

| | |
| --- | --- |
| **Estado** | Después. No se construye ni se audita ahora. |
| **Entregable** | Tools de lectura sobre la misma capa Rust. Filtro por `espacio_id`. No registrar `iniciar_espacio`. |
| **Se espera** | El Bot lee el pack por tubería tipada. Acceso auditable. |
| **Uso** | Mejora opcional del asiento. No sustituye pack + chat. |
| **Reutilizable** | El servidor MCP genérico, sí. Las tools son Paravel. |

MCP no es el asiento. No entra hasta que las etapas 1–3 no se muevan cada semana.
