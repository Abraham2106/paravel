# WBS P04 — Navegación y búsqueda unificadas

Fecha: 2026-09-16.
Estado: **planteamiento para revisión; no autoriza implementación; contraste técnico realizado por lectura; validación humana pendiente**.
Origen: [P04 — Navegación y búsqueda unificadas](../producto/PROPUESTAS-EXPANSION.md#p04-navegación-y-búsqueda-unificadas).
Marco: [Producto](../producto/PRODUCTO.md), [arquitectura](../arquitectura/ARQUITECTURA.md), [modelo](../arquitectura/MODELO.md) y [WBS principal](./WBS.md).

## 1. Decisión propuesta

Construir una **búsqueda local de nombres que permite entrar a grupos y espacios, o localizar una pieza dentro de su mesa**, sin abrir sus recursos, modificar selecciones ni ampliar MCP.

La primera entrega debe resolver «encontrar y entrar», no convertirse en una paleta universal de comandos. La recomendación técnica es una proyección mínima de SQLite, un catálogo efímero en memoria y resolución actual del destino al activarlo. No requiere migración, FTS, IA ni servicios remotos.

La dificultad principal no está en comparar cadenas: está en conservar los borradores de continuidad, descartar respuestas atrasadas, distinguir resultados homónimos y no confundir **enfocar una pieza** con **marcarla o iniciarla**.

### Qué autoriza este documento

- Profundización conceptual, alternativas, contrato propuesto y descomposición de trabajo.
- Ninguna modificación del código de aplicación, permisos, schema o herramientas MCP.
- Las decisiones D01–D12 son recomendaciones por aprobar, no decisiones ya autorizadas.
- La autorización anterior de P01 no se extiende a P04.
- P04.x son paquetes locales de esta feature; no renumeran ni cierran los WP globales.

### Resultado esperado, todavía hipótesis

El usuario encuentra un destino conocido con menos tiempo y menos errores que recorriendo la jerarquía. Puede cancelar sin alterar su trabajo. Una persona que prefiere la navegación por grupos conserva ese recorrido.

Compilar, obtener resultados o responder rápido no demuestra por sí solo una mejora de producto.

## 2. Problema, usuarios y tareas

La jerarquía ayuda a organizar, pero exige recordar dónde se guardó cada cosa. Al crecer la sede, buscar un recurso puede requerir abrir varios grupos y mesas. Los nombres repetidos hacen insuficiente una lista plana.

| Escenario | Necesidad | Resultado útil |
| --- | --- | --- |
| Recuerda «Atlas», no el grupo | Encontrar la mesa sin recorrer estantes | Entrar a Atlas con su grupo visible |
| Recuerda «Especificación», no la mesa | Localizar una pieza en toda la sede | Llegar a su tarjeta, sin abrir el documento |
| Hay tres piezas «Repositorio» | Distinguir homónimos | Elegir por grupo, mesa y tipo |
| Escribe «investigacion» | Encontrar Investigación sin introducir acentos | Coincidencia nominal comprensible |
| Busca mientras escribe un cierre | No perder el borrador | Cancelar el cambio de mesa y continuar escribiendo |
| Un resultado fue eliminado | No navegar a un destino ficticio | Aviso, actualización y permanencia en un estado válido |
| Solo usa ratón o no conoce el atajo | Descubrir la función | Botón visible, no dependencia de Ctrl+K |

No se presupone que todas las sedes necesiten búsqueda global. Investigar primero cantidad de mesas/piezas, frecuencia de extravío, vocabulario recordado y coste de la navegación actual.

## 3. Punto de partida contrastado con el código

Referencias relativas a la raíz del proyecto y vigentes en la inspección del 2026-09-16. Son observaciones por lectura, no resultados de ejecución.

| Área | Hecho actual | Consecuencia para P04 |
| --- | --- | --- |
| Navegación | `app/src/Workspace.tsx:163` concentra guard y `goSede`/`goGroup`/`goSpace`; `app/src/App.tsx:1` monta Workspace sin router | Reutilizar navegación; no introducir router solo por la búsqueda |
| Búsqueda | `app/src/Workspace.tsx:228` filtra espacios por nombre, **nota** y nombre del grupo | P04 nominal cambia el alcance actual; debe aprobarse explícitamente |
| Atajo | `app/src/Workspace.tsx:207` usa Ctrl/Cmd+K para enfocar el input y maneja Escape globalmente | Sustituir la función del atajo y coordinar Escape con los diálogos |
| Carga | `app/src/Workspace.tsx:280` carga piezas de la mesa activa; `:292` carga grupos y espacios | No existen todas las piezas en memoria; evitar N+1 por mesa |
| Rutas | `app/src/Workspace.tsx:259` comprueba rutas durante la carga de mesa | Buscar no debe disparar esas comprobaciones |
| Tarjetas | `app/src/Workspace.tsx:655` permite marcar y lanzar desde una tarjeta | Añadir foco/resaltado independiente; nunca simular un clic sobre la tarjeta principal |
| Continuidad | `app/src/ContinuityPanel.tsx:75` confirma descarte y bloquea salida durante escritura; `app/src/continuity.ts:16` tipa el guard | Toda navegación entre mesas desde resultados pasa por este contrato |
| Respuestas obsoletas | `app/src/ContinuityPanel.tsx:83` utiliza generaciones; `app/src/Workspace.tsx:280` comprueba principalmente ID activo | Adoptar generaciones en el recorrido de piezas afectado por P04 |
| DTO de escritorio | `app/crates/paravel-context/src/ui.rs:59` contiene Group, Space y Piece; `:118` inicia sus consultas | DTO actuales incluyen nota/pack/payload: crear proyección explícita, no reutilizarlos completos |
| SQLite | `app/src-tauri/src/db.rs:65` define grupo, espacio y pieza y llama migraciones adicionales | Las relaciones existentes bastan; no leer cierres ni captura_operacion |
| Puente | `app/src-tauri/src/db.rs:155` muestra wrappers de lectura; `app/src-tauri/src/lib.rs:531` registra comandos | Añadir comandos propios de escritorio con el patrón existente |
| MCP | `app/crates/paravel-context/src/reader.rs:204` fija un espacio; `app/crates/paravel-mcp/src/server.rs:124` define tres herramientas | Mantener búsqueda global fuera de Reader y de ambos transportes MCP |
| Pruebas | `app/package.json:6` declara build con TypeScript; `app/scripts/continuity.test.mjs:1` usa node:test | Reutilizar pruebas puras, Rust y harness UI; no asumir Vitest ni npm test |

### Cambios de comportamiento que no deben ocultarse

1. **Notas:** hoy participan en el filtro. Se recomienda que P04 busque exclusivamente nombres. La UI deberá decir «Buscar grupos, espacios y piezas por nombre». La nota sigue disponible en su mesa y conserva su política MCP actual. No convertirla en privada ni borrarla.
2. **Sidebar:** se propone reemplazar el input filtrador por un disparador del buscador global; la jerarquía deja de filtrarse al escribir en el diálogo. No mantener dos buscadores con la misma etiqueta y alcances distintos.
3. **Grupos vacíos:** la propuesta original explicita secciones de espacios y piezas. Añadir una sección Grupos permite encontrar también grupos sin mesas; requiere aprobación como concreción del alcance.
4. **Piezas:** «Ir a la pieza» significa entrar a su mesa y enfocar su tarjeta, no abrir el recurso.
5. **Frescura:** no se promete actualización instantánea ante escritores externos mientras el diálogo permanece abierto.

## 4. Alcance mínimo y exclusiones

### Incluido

- Disparador visible en la sede y sus vistas; Ctrl+K dentro de la aplicación en Windows, Cmd+K si se mantiene soporte de plataforma.
- Diálogo de búsqueda sobre la vista actual, sin desmontar la mesa.
- Coincidencias por nombres de grupo, espacio y pieza; contexto jerárquico y tipo visible.
- Ranking determinista, normalización definida, resultados acotados en pantalla y estados diferenciados.
- Navegación por teclado y ratón, restauración de foco y soporte de composición de texto.
- Consulta mínima de metadatos y resolución del destino por ID al activarlo.
- Invalidación por mutaciones propias y refresco explícito/al recuperar foco.
- Integración con los guards de continuidad y pruebas de regresión de selección, Iniciar y MCP.
- Protocolo de comparación contra el recorrido actual.

### Excluido

- Lanzar recursos, marcar piezas, preparar selecciones, crear piezas o editar entidades desde resultados.
- Búsqueda en notas, cierres, payloads, URLs, rutas, contenido de archivos o documentos.
- Leer el disco, comprobar disponibilidad de rutas durante la búsqueda, descargar favicons o previsualizar páginas.
- Fuzzy search, tolerancia a errores ortográficos, embeddings, búsqueda semántica o IA.
- Favoritos, recientes, historial de consultas, filtros avanzados y lenguaje de operadores.
- Atajo global del sistema operativo, overlay flotante, extensiones y búsquedas remotas.
- Índice persistente, migraciones, sincronización, nuevas herramientas MCP o nuevas rutas HTTP.
- CRUD de renombre/movimiento/eliminación que todavía no exista. Las pruebas pueden simular cambios en SQLite sin construir esos flujos de producto.

## 5. Decisiones recomendadas para aprobación

| ID | Propuesta | Motivo y alternativa descartada por ahora |
| --- | --- | --- |
| D01 | Buscar exclusivamente nombres | Minimiza datos; sustituir conscientemente la coincidencia actual en notas |
| D02 | Diálogo único con acceso visible y atajo local | Descubrible y rápido; no segundo buscador ni launcher del SO |
| D03 | Resultados Espacios, Piezas y Grupos | Mantiene contexto e incluye grupos vacíos |
| D04 | Entrar/enfocar es la única activación | Separa navegación de mutaciones e Iniciar |
| D05 | Catálogo mínimo, efímero y completo dentro de límites | Evita N+1 y sincronización de índices; consultas por término se reconsideran por medición |
| D06 | Resolver destino contra SQLite antes del cambio | No confiar en padres o IDs obsoletos del catálogo |
| D07 | Mayúsculas y vocales acentuadas equivalentes; ñ distinta de n | Adaptación española explícita sin equivalencias accidentales |
| D08 | Tokens AND, ranking por coincidencia propia antes que contextual | Previsible; sin aprendizaje, recencia ni puntuación opaca |
| D09 | Sin consultas/recientes persistidos ni logs de nombres | No crear un nuevo historial de actividad |
| D10 | Guard de continuidad y generaciones de solicitud | No perder borradores ni aceptar respuestas de intentos anteriores |
| D11 | Refrescar al abrir, invalidar escrituras propias, revalidar al activar | Frescura comprobable sin prometer sincronización externa instantánea |
| D12 | Mantener permisos y superficie MCP existentes | Leer toda la sede en escritorio no autoriza a un bot a hacerlo |

Los límites numéricos posteriores son propuestas de ingeniería para aprobar y medir. No son capacidades ya verificadas de la aplicación.

## 6. Contrato funcional de búsqueda

### 6.1 Campos y significado de las coincidencias

| Resultado | Campos buscables | Contexto mostrado | Destino |
| --- | --- | --- | --- |
| Grupo | Su nombre | Etiqueta Grupo | Vista del grupo, incluso vacío |
| Espacio | Nombre propio y nombre de grupo | Grupo / Espacio | Mesa del espacio |
| Pieza | Nombre propio, nombre de espacio y nombre de grupo | Grupo / Espacio · tipo | Tarjeta dentro de su mesa |

El tipo ayuda a distinguir, pero no se convierte en campo buscable en v1. El icono de grupo puede mostrarse si es local; no se requieren cargas de red. Los homónimos se conservan como resultados distintos por ID, nunca se fusionan.

Una consulta por grupo puede devolver su resultado directo y descendientes. Es deliberado: el usuario puede recordar el estante y una parte del nombre del recurso. Indicar «Coincide en el grupo» o «Coincide en la mesa» cuando sea contextual, para no aparentar coincidencias inexplicables.

### 6.2 Normalización

Mantener el nombre original para mostrarlo. Para comparar:

1. Recortar extremos y colapsar secuencias de espacios Unicode a un espacio.
2. Convertir mayúsculas/minúsculas mediante una regla estable, no dependiente del locale del equipo.
3. Tratar formas Unicode canónicamente equivalentes igual.
4. Aplicar una tabla explícita de equivalencia para vocales españolas acentuadas y ü: á/é/í/ó/ú/ü → a/e/i/o/u/u.
5. Conservar ñ como letra distinta de n; no eliminar indiscriminadamente todas las marcas combinantes.
6. Conservar puntuación. No interpretar `%`, `_`, comillas o guiones como comodines u operadores.

Propuesta de límite de consulta: 256 valores escalares Unicode y 16 tokens separados por espacios. Si se excede, pedir reducirla; no truncar silenciosamente ni confundir unidades UTF-16 con valores escalares.

No se prometen transliteración universal, stemming, singular/plural ni equivalencias de todos los idiomas. Añadir casos explícitos si las sedes reales los necesitan.

### 6.3 Coincidencia y ranking

Todos los tokens deben aparecer en al menos uno de los campos autorizados del resultado. Pueden repartirse entre nombre propio y padres. No concatenar campos sin separación ni producir una coincidencia atravesando dos nombres.

Dentro de cada sección, ordenar por esta tupla ascendente:

1. Nivel: nombre propio completo igual a consulta normalizada; prefijo propio de la consulta completa; todos los tokens presentes en nombre propio; coincidencia repartida con padres o solo contextual.
2. Nombre propio normalizado.
3. Nombre de grupo normalizado.
4. Nombre de espacio normalizado cuando aplique.
5. ID de grupo, ID de espacio e ID del resultado, usando orden ordinal estable.

Un resultado pertenece al primer nivel que cumpla. IDs cierran el desempate aunque todos los nombres sean iguales. No usar orden de inserción como última regla. Mantener Espacios → Piezas → Grupos como orden de secciones, independientemente del ranking interno; no anunciar un ranking global si la agrupación lo interrumpe.

La primera fila puede mostrarse activa tras una nueva consulta; **solo Enter o clic activan navegación**. Ni blur, Tab, escribir, enfocar o recibir resultados la ejecutan. Al refrescar datos con la misma consulta, conservar identidad activa si existe; si desaparece, quitar activación hasta una nueva elección, no transferirla al mismo índice.

### 6.4 Ejemplos que se convierten en fixtures

| Consulta | Fixture | Resultado esperado |
| --- | --- | --- |
| `atlas` | Espacio Atlas y pieza Manual Atlas | Atlas tiene coincidencia propia exacta; la pieza aparece en su sección |
| `investigacion` | Grupo Investigación | Coincide y permite ver descendientes |
| `diseno` | Espacio Diseño | No coincide por equivalencia n/ñ; sí `diseño` |
| `atlas repo` | Pieza Repositorio dentro de Atlas | Coincidencia entre campos, con contexto visible |
| `repositorio` | Tres piezas homónimas | Tres filas con jerarquía y tipo; desempate estable |
| `%` | Un nombre contiene % | Coincidencia literal, no toda la sede |
| Texto presente solo en nota/payload/cierre | Nombres sin ese texto | Sin resultados |
| Espacios o consulta vacía | Cualquier catálogo | Instrucción inicial, no listado completo ni recientes |

### 6.5 Cantidad y rendimiento

- Propuesta: mostrar 20 resultados por sección al principio y ampliar en bloques de 20 con «Mostrar más»; los encabezados no son opciones activables.
- Buscar y contar sobre todo el catálogo aceptado, no solo sobre las primeras filas visibles. «Mostrando X de Y» distingue cantidad visible de coincidencias totales.
- Propuesta de defensa inicial: máximo 20 000 entidades entre grupos/espacios/piezas y 8 MiB de DTO serializado UTF-8. Comprobar antes de devolver el catálogo y acotar también su construcción; no leer sin límite para luego rechazar.
- Ante exceso, devolver error de capacidad específico, conservar navegación jerárquica y explicar la limitación. Nunca presentar una fracción del catálogo como búsqueda completa.
- Medir antes de fijar esos límites como compromiso de producto. No rechazar ni borrar datos de la sede por superar la capacidad del buscador.
- Normalizar nombres una vez por carga. Filtrar/rankear localmente sin IPC por pulsación. No introducir worker o virtualización hasta observar necesidad.
- Objetivos provisionales para el fixture de 500 espacios y 5 000 piezas en equipo de referencia: p95 apertura fría del buscador ≤ 300 ms; p95 desde edición hasta resultados pintados ≤ 100 ms. Registrar hardware, WebView2, build y tamaño real del DTO. No afirmar que ya se cumplen.
- Probar también sedes pequeñas y cercanas al límite, reportando ambas. Si falla el tamaño representativo, reconsiderar consultas backend antes de recortar silenciosamente resultados.

## 7. Interacción, foco y estados

### Recorrido principal

1. Pulsar «Buscar en Paravel» o Ctrl+K dentro de la ventana.
2. Abrir diálogo modal sobre la vista actual y enfocar el campo etiquetado.
3. Obtener catálogo actual; permitir escribir mientras carga, sin activar resultados antiguos.
4. Mostrar secciones, contexto y número de coincidencias.
5. Elegir fila mediante flechas/Enter o clic.
6. Resolver identidad y padres actuales. Si implica abandonar una mesa, aplicar el guard de continuidad.
7. Si se permite y el intento sigue vigente, navegar. Para pieza, cargar la mesa y llevar el foco a su tarjeta.
8. Iniciar sigue siendo un gesto posterior en la mesa, separado de la búsqueda.

### Teclado y accesibilidad

- Preferir el `<dialog>` nativo abierto con `showModal()`, ya utilizado por `app/src/FirefoxGroupDialog.tsx:14`, con título accesible y botón visible Cerrar.
- Proponer input combobox y lista de opciones agrupadas: `aria-controls`, `aria-expanded`, `aria-activedescendant`, nombres de grupos de resultados y opción activa coherente.
- El foco DOM permanece en el input al recorrer opciones; distinguir selección accesible de resultado y estado `marcada` de una pieza.
- Flechas arriba/abajo recorren opciones; Enter activa solo la opción vigente; no saltar de primera a última mediante wrapping implícito.
- Mantener edición nativa del texto, selección, izquierda/derecha y Home/End en el input. No secuestrar teclas estándar de edición.
- Tab/Shift+Tab recorren controles del diálogo sin salir al fondo. No anidar botones de acción dentro de opciones de listbox.
- Escape cierra la búsqueda y consume el evento para que no cierre otros formularios. Si hay confirmación superior, Escape resuelve primero esa confirmación.
- Durante IME, Enter no navega y Escape no debe interferir con la composición. Verificarlo en WebView2 real.
- Ctrl+K con la búsqueda abierta vuelve a enfocar su input, no crea otro diálogo. Con otro modal abierto, no apilar la búsqueda ni descartar ese formulario.
- Al cancelar, restaurar foco al elemento que la abrió; si desapareció, al disparador visible. Al navegar, enfocar el encabezado o tarjeta del destino, no el antiguo disparador.
- Anunciar carga/error/conteo mediante una región de estado sin leer toda la lista en cada pulsación. Validar contraste, foco visible, zoom 200 %, nombres largos y lector de pantalla.
- No depender de `closedby` ni invocadores declarativos recientes para funciones esenciales; Escape y Cerrar deben funcionar en el WebView2 soportado. No hace falta implementar un focus trap paralelo al modal nativo.

### Estados exigidos

| Estado | Presentación y acción |
| --- | --- |
| Consulta vacía | «Escribe el nombre de un grupo, espacio o pieza» |
| Cargando catálogo | Indicador explícito; campo utilizable; Enter no navega |
| Sede sin datos | Explicación de sede vacía; conservar navegación normal, sin crear automáticamente |
| Sin coincidencias | «No hay resultados por nombre»; permitir modificar consulta |
| Error de lectura | Mensaje sin SQL ni datos privados; Reintentar y Cerrar |
| Catálogo excedido | Explicar límite de búsqueda, sin llamar vacía a la sede |
| Actualizando | Datos anteriores no activables hasta confirmar la nueva carga |
| Resolviendo destino | Bloquear doble activación; conservar consulta y cancelar de forma controlada |
| Destino eliminado | No cambiar a una entidad ficticia; avisar y refrescar |
| Destino movido/renombrado | Mostrar contexto actual y pedir una nueva activación antes de ir a un destino distinto del mostrado |
| Guard cancelado | Misma mesa, mismo borrador; búsqueda y consulta recuperables |
| Carga de mesa fallida | Error propio de destino, Reintentar/Volver; nunca mostrar piezas de la mesa anterior |
| Pieza desaparece tras navegar | Mantener la mesa válida y avisar que la pieza ya no está; sin lanzar ni marcar otra |

### Enfoque de piezas y filtros

Una pieza puede estar oculta por «solo marcadas» o filtro de tipo. Después de navegación autorizada, cambiar únicamente esos filtros de presentación a «todas» para hacer visible el destino y explicar el ajuste. No modificar `marcada`, `pack` ni orden persistido.

El resaltado de destino debe tener estilo e identidad propios, no reutilizar `.selected`. Aplicar scroll y foco después de la carga vigente y el montaje de la tarjeta, no con un timeout arbitrario. Respetar movimiento reducido. Si la pieza ya pertenece a la mesa activa, no remontar continuidad ni pedir descarte solo para enfocarla.

## 8. Arquitectura y contrato de datos propuestos

### Alternativas evaluadas

| Alternativa | Ventaja | Coste o problema | Decisión |
| --- | --- | --- | --- |
| Invocar list_pieces por cada mesa | Reutiliza comandos | N+1, payloads innecesarios, múltiples estados inconsistentes | Descartar |
| Catálogo mínimo + búsqueda local | Una carga, matching puro, sin índice persistente | Memoria proporcional al catálogo; exige invalidación y límites | Recomendada para v1 |
| Consulta backend por término | Transferencia acotada, mejor para catálogo grande | IPC/cancelación por consulta; política Unicode/ranking más compleja | Alternativa si medición lo justifica |
| FTS/índice persistente | Puede ayudar con volumen o búsqueda más rica | Migración, actualización y duplicación de datos | Fuera hasta tener evidencia |
| Proveedor semántico | Podría resolver intención | Otra política de datos, latencia y dependencia | P08, no P04 |

### Flujo de lectura

```text
SQLite: grupo + espacio + pieza
  → paravel-context::ui::navigation
  → comandos Tauri de escritorio
  → catálogo efímero y funciones puras de matching/ranking
  → diálogo de búsqueda
  → resolver ID actual + guard de continuidad
  → navegación existente + carga vigente + foco de destino
```

No se crea un método global en `Reader`. Compartir crate entre escritorio y MCP no significa compartir privilegios.

### DTO mínimo

```ts
type NavigationCatalog = {
  groups: { id: string; name: string; icon: string }[];
  spaces: { id: string; groupId: string; name: string }[];
  pieces: { id: string; spaceId: string; name: string; kind: string }[];
};

type NavigationTarget =
  | { type: "group"; groupId: string }
  | { type: "space"; spaceId: string }
  | { type: "piece"; pieceId: string };

type NavigationOutcome =
  | { status: "navigated" }
  | { status: "cancelled" }
  | { status: "not-found" }
  | { status: "changed" }
  | { status: "error" };
```

Nombres ilustrativos para el contrato, no código implementado. Mantener serialización camelCase y convenciones Rust existentes.

Exclusiones obligatorias del DTO: nota, cierres, payload, URL, ruta, pack, `marked`, credenciales, logs, contenido, historial, estado de bot y resultados de comprobación del filesystem. Si un nombre contiene información sensible, seguirá siendo visible localmente; «solo nombres» no equivale a anonimización.

### Operaciones de escritorio

**`list_navigation_catalog`**

- Sin consulta textual como argumento: la búsqueda sucede en memoria.
- Tres proyecciones explícitas de columnas, dentro de una única transacción de lectura corta para obtener relaciones consistentes.
- Usar la conexión y mutex existentes; no mantener una transacción abierta mientras el usuario escribe.
- Validar límites de entidades/bytes durante construcción y antes de serializar/devolver. Los límites no autorizan truncamiento.
- Distinguir catálogo vacío, fallo de DB, capacidad excedida e inconsistencia de relaciones. No convertir errores de decodificación en listas vacías.
- No cargar ni interpretar payloads; incluso un payload inválido no debe impedir encontrar un nombre válido.
- No escribir tablas, no comprobar rutas y no pedir acceso de red.

**`resolve_navigation_target`**

- Aceptar únicamente el tipo y su ID correspondiente; validar forma y rechazar argumentos inesperados según el patrón de validación elegido.
- Consultar identidad y jerarquía actuales por IDs, con SQL parametrizado.
- Para pieza, devolver sus metadatos mínimos y espacio/grupo actuales; para espacio, su grupo; para grupo, sus propios metadatos.
- Devolver resultado tipado encontrado/no encontrado; fallo técnico se distingue de ausencia.
- No devolver payload, no iniciar nada, no servir como autorización para otra operación.
- Si el contexto difiere del mostrado, actualizar la fila y pedir confirmación mediante una nueva activación. No llevar silenciosamente a otra mesa tras un movimiento.

La resolución es válida en el momento de lectura, no reserva la entidad. Puede cambiar después; la carga de destino debe manejarlo. No mantener bloqueos de SQLite durante una confirmación humana.

### Integración de DTO parciales

El catálogo no sustituye los objetos completos de `Workspace`. Nunca insertar un espacio mínimo en un array cuyos consumidores esperan nota y pack, ni rellenar esos campos con vacíos inventados. Si el destino no está en el estado completo actual, refrescar las lecturas normales de sede y reconciliar por ID antes de cambiar vista. Esa carga habitual no amplía el catálogo de búsqueda.

## 9. Concurrencia, invalidación y continuidad

### Estado mínimo de coordinación

Separar sesión del diálogo, generación de carga de catálogo, revisión local de invalidación e intento de navegación. Una respuesta solo se aplica si coincide con la sesión y generación vigentes y no precede una mutación relevante.

Cerrar/desmontar invalida solicitudes pendientes. Si el IPC no admite cancelación física, descartar su resultado; no afirmar que se canceló la consulta Rust. Un error atrasado tampoco puede reemplazar el estado de una sesión nueva.

### Invalidaciones obligatorias

| Mutación | Tratamiento |
| --- | --- |
| Crear/editar grupo | Invalidar nombres/jerarquía tras confirmación de persistencia |
| Crear espacio | Invalidar tras alta confirmada |
| Añadir/eliminar pieza | Invalidar aunque el usuario ya haya cambiado de mesa |
| Captura con alguna alta efectiva | Invalidar una vez por lote confirmado, incluso con fallos parciales |
| Marcar, cambiar pack, guardar cierre | No invalidar por campos que no participan en búsqueda |
| Renombre/movimiento/baja incorporados en el futuro | Añadir al mismo mecanismo, sin olvidar cascadas |
| Cambio por otro proceso | Refrescar al recuperar foco, mediante Actualizar y al activar; sin garantía instantánea |

Puntos de integración actuales: `app/src/Workspace.tsx:569` para grupos; `:593` para alta de espacio; `:346` para baja de pieza; `:412` para alta. Invalidar antes del early return por cambio de mesa de `ingestPiece`.

`app/src-tauri/src/capture.rs:307` implementa `commit_capture`. Su existencia no prueba que su frontend esté integrado: en la inspección no aparecieron `CaptureDialog.tsx`/`capture.ts`. P04 no depende de terminar P02, pero toda integración de ese escritor deberá notificar las altas al catálogo.

### Navegación como operación completa

1. Capturar ID del resultado y contexto mostrado; bloquear doble Enter/clic.
2. Resolver destino vigente; rechazar ausencia o cambio de contexto no revisado.
3. Si abandona la mesa activa, consultar el guard existente.
4. Cancelar conserva borrador y ubicación. Escritura/eliminación de cierre pendiente impide salir.
5. Tras la espera, comprobar vigencia del intento y revalidar el destino antes del commit de navegación.
6. Actualizar navegación una sola vez. Ningún intento anterior puede sobrescribir el nuevo.
7. Cargar piezas con generación por solicitud, estado asociado al destino y errores también protegidos.
8. Enfocar solo cuando pieza y mesa coincidan con la carga vigente. Liberar bloqueo y cerrar diálogo de manera coherente con el resultado.

Si se cierra la búsqueda antes del commit, invalidar el intento para impedir una navegación tardía. Una vez realizado el cambio de vista, cerrar el diálogo no revierte mágicamente la navegación; los errores posteriores pertenecen a la vista destino.

### Refactor acotado necesario

El chequeo actual `activeSpace.current === id` no distingue A → B → A. Incorporar generaciones al recorrido afectado de `loadPieces` y comprobaciones de rutas. Proteger también errores y respuestas iniciadas antes de una mutación.

Hacer que las funciones de navegación comuniquen éxito/cancelación, y que el bloqueo abarque resolución, guard y commit, no solo el tiempo dentro del guard. Mantener generación o coordinación compartida con la navegación normal para que un clic en sidebar no compita con un intento pendiente.

No convertir esta entrega en una refactorización general de Workspace. No prometer protección de todos los formularios: continuidad tiene guard explícito; los demás modales requieren exclusión de apertura del buscador y sus reglas actuales.

## 10. Privacidad, permisos y compatibilidad

- Búsqueda local dentro de la ventana principal. No atajo global, filesystem, shell, HTTP ni permisos adicionales por conveniencia.
- La capability actual (`app/src-tauri/capabilities/default.json:1`) no declara permisos individuales de cada comando propio. Revisar registro y alcance real de Tauri; no inventar un permiso `allow-search` sin adoptar deliberadamente ese mecanismo.
- Registrar los nuevos comandos en el handler de escritorio. No registrarlos en `ContextServer`, `Reader`, stdio ni HTTP MCP.
- Conservar exactamente las tres herramientas MCP actuales y sus filtros de espacio/pack. Comprobar rechazo explícito de los nombres de búsqueda como herramientas desconocidas.
- Catálogo y consulta solo en memoria; limpiar al cerrar el buscador. No localStorage, sessionStorage de consultas, telemetría, logs de nombres ni persistencia de recientes.
- La navegación puede seguir guardando los IDs activos mediante el mecanismo actual de sessionStorage; no convertirlo en historial de búsquedas.
- Tratar nombres como texto no confiable: renderizado escapado normal de React, sin HTML inyectado; iconos locales y tipo desconocido con fallback visual, nunca interpretación como comando.
- No escribir nota, cierre, selección de Iniciar, pack ni logs de lanzamiento como efecto de buscar o navegar.
- «Privado respecto de MCP» no significa cifrado o protección frente a otro proceso con acceso a la cuenta local.
- P01 conserva borradores y política de cierres; P02 es un productor de altas, no requisito para P04; P08 podrá comparar contra esta búsqueda pero no recibe por ello permiso para enviar el catálogo a IA.

## 11. Árbol de entregables y paquetes de trabajo

```text
P04  Navegación y búsqueda unificadas                 [planteamiento]
├── P04.1  Evidencia y línea base
│   ├── P04.1.1  Tamaño de sede, vocabulario y tareas
│   ├── P04.1.2  Referencias y contraste de patrones
│   └── P04.1.3  Protocolo y puerta G1
├── P04.2  Contrato aprobado
│   ├── P04.2.1  Alcance nominal y sustitución del filtro actual
│   ├── P04.2.2  Ranking, Unicode, límites y estados
│   └── P04.2.3  Datos, frescura y puerta G2
├── P04.3  Lecturas Rust
│   ├── P04.3.1  Catálogo mínimo consistente
│   ├── P04.3.2  Resolución por identidad actual
│   └── P04.3.3  Wrappers Tauri y tests SQLite
├── P04.4  Motor local y diálogo
│   ├── P04.4.1  Tipos, normalización y ranking puros
│   ├── P04.4.2  Carga efímera e invalidación
│   └── P04.4.3  Estados, teclado y accesibilidad
├── P04.5  Navegación integrada
│   ├── P04.5.1  Guard, resultado de navegación y exclusión mutua
│   ├── P04.5.2  Generaciones y foco de pieza
│   └── P04.5.3  Escritores y compatibilidad con P01/P02
├── P04.6  Verificación integral
│   ├── P04.6.1  Pruebas puras, SQLite y UI simulada
│   ├── P04.6.2  Recorrido nativo aislado y regresiones MCP
│   └── P04.6.3  Rendimiento, accesibilidad y puerta G3
├── P04.7  Validación de producto
│   ├── P04.7.1  Comparación con navegación jerárquica
│   ├── P04.7.2  Análisis de errores y esfuerzo
│   └── P04.7.3  Continuar / iterar / retirar, puerta G4
└── P04.8  Documentación y cierre
    ├── P04.8.1  Contrato vigente y guía de uso
    ├── P04.8.2  Evidencia y limitaciones reales
    └── P04.8.3  Entrega y retirada reversible
```

| WP | Entregable verificable | Dependencia | Criterio de terminación | Responsable propuesto |
| --- | --- | --- | --- | --- |
| P04.1 | Tareas, línea base y fuentes fechadas | Consentimiento | Observaciones separadas de hipótesis y protocolo fijado | Producto + usuario |
| P04.2 | Decisiones D01–D12 y fixtures de contrato | G1 o excepción explícita | Alcance y límites aprobados; no vacíos críticos de interacción | Producto + ingeniería |
| P04.3 | Dos lecturas y pruebas de datos mínimos | G2 + autorización de código | Snapshot, límites y resolución probados sin escrituras | Backend |
| P04.4 | Matching puro y diálogo accesible | G2; DTO de P04.3 acordado | Orden total, estados completos, teclado y consulta efímera | Frontend |
| P04.5 | Navegación real protegida | P04.3 + P04.4 | Sin pérdida de borrador, marcado ni lanzamiento implícitos | Integración |
| P04.6 | Matriz, comandos y evidencia | P04.5 | Casos críticos pasan en nativo aislado; brechas explícitas | Ingeniería / QA |
| P04.7 | Evaluación y decisión humana | G3 y línea base | Mejora y contramétricas revisadas; no solo demo | Usuario + producto |
| P04.8 | Documentos reconciliados y entrega | Avance paralelo; cierre tras G4 | Estado honesto, regresiones y retirada documentadas | Ingeniería + producto |

Los roles no son personas asignadas ni autorización de ejecución automática.

### Secuencia y paralelización

Ruta técnica: contrato → lecturas/motor → integración protegida → nativo/regresiones → evaluación. Backend y funciones puras pueden avanzar en paralelo tras cerrar DTO y semántica; el diálogo puede usar fixtures, pero la aceptación no puede depender de mocks.

`Workspace.tsx` debe tener un único responsable de integración mientras se conectan guard, invalidación y foco. No ejecutar simultáneamente harnesses que usan puertos fijos o la misma instancia de Tauri.

### Estimación preliminar, no compromiso de calendario

| Bloque | Rango orientativo de jornadas-persona |
| --- | --- |
| Contrato y protocolo | 1–2 |
| Lecturas Rust y pruebas | 1–2 |
| Matching y diálogo | 2–3 |
| Integración, carreras y guards | 2–3 |
| Pruebas, nativo, accesibilidad y documentación | 2–4 |
| Total técnico orientativo | 8–14 |

Supone una persona familiarizada con React/Tauri, entorno nativo operativo y ausencia de rediseño. No incluye espera por entrevistas/piloto ni reorganización de código concurrente. Reestimar después de G2; accesibilidad nativa, tamaño real del catálogo y carreras son las incertidumbres principales. Los rangos no provienen de un benchmark histórico de velocidad del equipo.

## 12. Superficie de implementación prevista

| Archivo o área | Cambio futuro esperado |
| --- | --- |
| `app/crates/paravel-context/src/ui/navigation.rs` | Nuevo módulo de DTO, catálogo, resolución y tests de lectura |
| `app/crates/paravel-context/src/ui.rs` | Exponer el módulo de escritorio sin ampliar Reader |
| `app/src-tauri/src/db.rs` | Wrappers de comandos de lectura; sin migración |
| `app/src-tauri/src/lib.rs` | Registro de comandos de escritorio |
| `app/src/navigation.ts` | Tipos, normalización, ranking y contratos puros |
| `app/src/useNavigationCatalog.ts` | Sesiones, generaciones, refresco e invalidación |
| `app/src/GlobalSearchDialog.tsx` | Campo, resultados, teclado, estados y activación |
| `app/src/Workspace.tsx` | Sustituir filtro, conectar navegación protegida, invalidación y foco |
| `app/src/App.css` | Diálogo y resaltado independiente de marcada, siguiendo estilos existentes |
| `app/scripts/navigation*.test.mjs` | Tests puros, UI simulada y nativo aislado, siguiendo convenciones existentes |
| Tests de MCP | Rechazo de búsqueda global y conservación de tres herramientas |
| Documentos de modelo/arquitectura/propuesta | Registrar contrato cuando se apruebe; no anticipar implementación |

Nombres de archivos nuevos propuestos, no existentes ni creados por este planteamiento. Evitar nuevas dependencias salvo necesidad demostrada. No deberían cambiar producción de MCP, adaptadores de lanzamiento, tablas ni capability por esta feature.

## 13. Matriz de aceptación técnica

| ID | Prueba | Resultado exigido | Nivel |
| --- | --- | --- | --- |
| T01 | Exacta/prefijo/tokens/contexto | Orden conforme al contrato con desempate por ID | Pura |
| T02 | Caja, NFC/NFD, vocales, ü, ñ | Equivalencias explícitas, sin confusión accidental n/ñ | Pura |
| T03 | Consulta vacía, espacios, límites, símbolos | Estados correctos; búsqueda literal; sin truncamiento | Pura/UI |
| T04 | Homónimos y grupos vacíos | Identidades separadas y contexto suficiente | SQLite/UI |
| T05 | Texto solo en nota/payload/cierre | No aparece por contenido excluido | SQLite/pura |
| T06 | Serialización con sentinelas privados | Claves exactas; ningún dato excluido en DTO | SQLite |
| T07 | Payload inválido y nombres válidos | Búsqueda no intenta deserializar payload | SQLite |
| T08 | Read-only y snapshot de relaciones | Sin escritura ni mezcla de estados de distintas lecturas | SQLite |
| T09 | Alta, rename, movimiento y cascada en fixture | Siguiente catálogo refleja estado real | SQLite |
| T10 | Resolver eliminado/movido/renombrado | Ausencia o contexto actual; no destino silenciosamente cambiado | SQLite/UI |
| T11 | Ctrl+K, flechas, Enter, Escape, Tab | Una navegación explícita; foco confinado/restaurado | UI/nativo |
| T12 | IME y lector de pantalla | Sin Enter accidental; anuncios y edición comprensibles | Nativo/manual |
| T13 | Abrir-cerrar-reabrir con respuesta demorada | Ninguna respuesta vieja reabre o contamina búsqueda | UI simulada |
| T14 | Carga previa a alta/baja y recarga posterior | Datos atrasados no restauran elementos eliminados | UI simulada |
| T15 | Secuencia A → B → A | Solo generación vigente controla piezas, rutas y errores | UI simulada |
| T16 | Borrador sucio: cancelar/aceptar navegación | Cancelar conserva texto; aceptar descarta solo tras confirmación | UI/nativo |
| T17 | Guardado/eliminación de cierre en curso | No se abandona la mesa; sin doble envío | UI/nativo |
| T18 | Pieza en mesa actual y oculta por filtros | Se muestra/enfoca sin remontar cierre ni cambiar marcada | UI/nativo |
| T19 | Pieza en otra mesa | Se carga mesa correcta y enfoca identidad exacta | Nativo |
| T20 | Buscar y navegar con piezas inertes | Cero invokes de lanzamiento/marcado/pack; DB lógica intacta | UI/nativo |
| T21 | Error, reintento, catálogo excedido | Error distinguible de vacío; navegación normal disponible | SQLite/UI |
| T22 | Cambio externo con diálogo abierto | No prometer tiempo real; refresco y activación detectan cambio | SQLite/nativo |
| T23 | MCP por stdio y HTTP | Tres herramientas; rechaza búsqueda global; ámbito de mesa intacto | Integración MCP |
| T24 | Reinicio y cierre del diálogo | Consultas no persistidas; catálogo nuevo reconstruido | Nativo |
| T25 | Volumen, nombres largos y zoom | Objetivos medidos, resultados alcanzables y UI legible | Benchmark/manual |

### Estrategia de fixtures

Catálogo sintético reproducible, sin rutas privadas: varios grupos, mesas repetidas en grupos distintos, grupos vacíos, piezas de distintos tipos, nombres acentuados y normalizaciones equivalentes. Añadir nombres iguales con IDs distintos y texto sentinel solo en campos excluidos.

Para movimiento/rename no expuesto hoy en UI, usar una conexión de fixture controlada: eso prueba frescura y resolución, no acredita un flujo CRUD inexistente. Para concurrencia usar gates/promesas controladas como los de `app/scripts/continuity-ui.test.mjs:88`, no sleeps como única sincronización.

### Entorno y comandos previstos

Desde `app`, el comando existente `npm run build` ejecuta `tsc && vite build`. No hay script de lint ni de test en `app/package.json`; acordar el comando de lint con el usuario antes de una implementación y no inventar una ejecución exitosa.

Pruebas existentes de referencia: `node --test scripts/continuity.test.mjs` y las suites UI/nativas del proyecto, tras verificar la versión de Node y sus dependencias. Los futuros tests P04 seguirán ese patrón, pero sus nombres definitivos se fijarán al crearlos.

Para Rust, ejecutar las suites pertinentes mediante sus manifiestos de `src-tauri`, `crates/paravel-context` y `crates/paravel-mcp`, incluyendo la configuración HTTP definida en su Cargo.toml. Verificar primero features, comandos vigentes y requisitos del harness; no asumir que todos los crates forman un único workspace ni inventar nombres de features.

El harness nativo exige binario debug actualizado, WebView2, Playwright resuelto por el entorno y base sintética bajo el temporal aprobado. `PARAVEL_TEST_DATA_DIR` se aplica bajo debug en `app/src-tauri/src/lib.rs:39`; no usar un release suponiendo aislamiento. Comprobar ruta efectiva de DB antes de interactuar.

Bloquear comandos de lanzamiento antes de la prueba, utilizar recursos inertes y comprobar después invariantes de DB y ausencia de lanzamientos. El test de continuidad tiene puerto fijo 9223 (`app/scripts/continuity-native.test.mjs:14`): ejecución exclusiva. El harness de captura no se considera listo para reutilizar sin revisar sus precondiciones de archivos.

**Evidencia de esta tarea:** inspección documental/código y consulta de guías. No se han ejecutado build, lint, Rust, tests P04, pruebas nativas ni benchmarks como parte de este planteamiento documental. No hay código P04 para certificar.

## 14. Research y validación del valor

### Contraste realizado

Fuentes técnicas consultadas el **2026-09-16**, fecha de acceso, no de publicación:

| Fuente | Evidencia utilizable | Límite |
| --- | --- | --- |
| [WAI-ARIA APG — Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) | Relación input/lista, `aria-activedescendant`, selección, Escape y conservación de edición de texto | No demuestra utilidad de P04 ni certifica nuestra implementación |
| [WAI-ARIA APG — Dialog Modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | Fondo inerte, foco inicial, Tab contenido, cierre y restitución de foco | Requiere prueba con tecnología asistiva y WebView2 concretos |
| modern-web-guidance, búsqueda y guía `platform-controls-dismiss-dialog` | Uso modal de dialog y disponibilidad limitada de `closedby`; conservar controles de cierre básicos | Guía técnica consultada por CLI, no estudio de usuarios ni prueba de compatibilidad local |

No se hicieron entrevistas, capturas de referencias visuales, pruebas interactivas en Raycast/Linear ni mediciones de productividad. Mobbin no estaba disponible como herramienta de búsqueda de pantallas en esta sesión. Las analogías de Raycast/Linear del documento original permanecen pendientes; no se atribuyen a esos productos funciones o resultados no consultados.

### Protocolo propuesto, no ejecutado

1. Recoger de tres a cinco usuarios representativos, si están disponibles, tareas de «sé qué busco pero no dónde está». Si solo participa el propietario, reportar estudio individual, no generalizar a un mercado.
2. Usar datos sintéticos o nombres consentidos; no registrar rutas, notas, consultas privadas ni capturas de trabajo real por defecto.
3. Preparar al menos doce tareas por participante: localizar mesa, localizar pieza, distinguir homónimo, nombre incompleto, acento omitido, grupo vacío y destino inexistente. Equilibrar dificultad entre versiones, con destinos esperados definidos antes de la sesión.
4. Medir la línea base con navegación actual, distinguiendo el filtro existente por notas de la navegación jerárquica. Incluir una tarea dependiente de nota para hacer visible la capacidad que se retira; no contar como mejora una comparación que la esconda.
5. Comparar con P04 mediante conjuntos equivalentes A/B y alternar orden entre participantes para reducir aprendizaje. Una práctica breve no se incluye en los tiempos.
6. Cronometrar desde la presentación de la tarea hasta mesa/tarjeta correcta, no hasta abrir un programa. Registrar éxito, destino erróneo, reformulaciones, pasos, uso de teclado, abandono y confianza declarada.
7. Evaluar cancelación y borrador como tareas separadas; no provocar pérdida real de información sensible.
8. Analizar por tipo de tarea y participante: mediana/rango, porcentaje de acierto y ejemplos de errores. No mezclar tareas triviales y difíciles para ocultar regresiones.
9. Revisar con el usuario continuar, ajustar o retirar. Declarar tamaño de muestra, aprendizaje, tareas artificiales y falta de cobertura.

### Métricas y puertas de decisión

| Métrica | Qué indica | Criterio propuesto |
| --- | --- | --- |
| Tiempo hasta destino correcto | Utilidad del acceso directo | Candidato: reducción de mediana ≥ 25 % en tareas difíciles frente a línea base |
| Acierto | Calidad de identificación | Candidato: ≥ 90 % de tareas resueltas y sin empeorar frente a base |
| Error de destino | Ambigüedad/ranking | Revisar cada error; no aceptar crecimiento oculto por velocidad |
| Lanzamientos o mutaciones implícitas | Integridad del recorrido | Cero en todas las pruebas |
| Pérdida de borrador al cancelar | Integración con continuidad | Cero |
| Latencia y capacidad | Viabilidad técnica | Medir objetivos de sección 6.5 en equipo/fixture declarados |
| Esfuerzo/confianza | Comprensibilidad | Registrar explicación cualitativa, no solo una escala |

Los porcentajes son candidatos, no umbrales ya acordados ni resultados. Tras medir línea base y antes de observar P04, fijar los criterios finales con fecha. No reajustarlos después para declarar éxito.

- **G1 — Necesidad:** evidencia de fricción y tareas representativas; continuar, simplificar o posponer.
- **G2 — Contrato:** aprobar D01–D12, límites, retirada del filtro por notas y autorización de implementación.
- **G3 — Técnica:** pruebas críticas, aislamiento, recorrido nativo y accesibilidad con evidencia; brechas declaradas.
- **G4 — Valor:** comparación humana y decisión explícita. G3 no implica G4.

Una excepción que permita implementar antes de G1 debe registrarse expresamente por el usuario. No convertirla en evidencia de investigación realizada.

## 15. Riesgos, mitigaciones y retirada

| Riesgo | Impacto | Mitigación / señal de revisión |
| --- | --- | --- |
| Retirar coincidencias por nota sin avisar | Regresión de hábitos existentes | Aprobar D01, copy claro y tarea específica en piloto |
| Ranking contextual demasiado amplio | Demasiados descendientes irrelevantes | Mostrar motivo de coincidencia; medir; reconsiderar herencia sin añadir IA |
| Catálogo mayor de lo supuesto | Apertura lenta/memoria | Límites explícitos y benchmarks; cambiar estrategia de consulta si hace falta |
| Resultado obsoleto | Destino equivocado o fantasma | Invalidación, resolución actual y nueva activación ante contexto cambiado |
| Carrera A → B → A | Piezas/mensajes de otra carga | Generaciones en éxito y error del recorrido afectado |
| Escape/guard mal coordinados | Pérdida de borrador o modal cerrado de más | Prioridad de overlays, intento invalidable y prueba nativa |
| Resaltado confundido con selección | Lanzamiento posterior de recursos no deseados | Estilo separado y prueba de invariancia de marcada |
| Catálogo reutilizado desde MCP/IA | Ampliación accidental de exposición | Módulo UI separado, DTO mínimo y pruebas negativas de superficie |
| Dependencia de UI aún no integrada de P02 | Bloqueo o falsas garantías | Integrar escritor disponible; anotar hook pendiente sin asumir frontend |
| Refactor excesivo de Workspace | Regresión fuera de P04 | Un responsable de integración y cambios acotados al recorrido |

### Despliegue y retirada

Primero integración con fixture sintética; después prueba nativa aislada y piloto consentido. No reemplazar la versión habitual sin verificación de regresiones.

Al no haber migración ni datos propios persistidos, retirar P04 consiste en desconectar disparador, comandos y módulos de búsqueda y restaurar el comportamiento de navegación anterior desde una versión conocida. Conservar tablas, nombres, piezas, cierres, pack y selecciones. No borrar recursos para «limpiar el índice»: no existe tal índice persistente en esta propuesta.

No se requiere infraestructura de feature flags para validar el mínimo. Si se adopta un flag temporal para el piloto, definir propietario y fecha de retirada para no mantener permanentemente dos semánticas de búsqueda.

## 16. Estado de cierre del planteamiento

| Área | Estado real |
| --- | --- |
| Identificación de P04 y contraste con implementación actual | Realizado por lectura |
| Alcance, decisiones, DTO, ranking y navegación | Propuestos para aprobación |
| WBS, matriz técnica, protocolo y riesgos | Documentados |
| Referencias de accesibilidad | Consultadas; no equivalen a validación de UI |
| Referencias de producto y research humano | Pendientes |
| Código, permisos o migraciones P04 | No modificados |
| Tests/build/benchmark de P04 | No ejecutados; feature no implementada |
| Autorización para implementar | Pendiente |

**Siguiente decisión:** aprobar o ajustar D01–D12, especialmente búsqueda solo por nombres, sección Grupos, comportamiento «ir a pieza» y política de frescura. Después autorizar la implementación por P04.3–P04.6, sin presentar las validaciones humanas pendientes como completadas.
