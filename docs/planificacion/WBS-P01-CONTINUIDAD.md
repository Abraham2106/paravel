# WBS P01 — Continuidad de proyecto

Fecha: 2026-09-16.
Estado: **P01.3–P01.7 entregados al alcance técnico con evidencia del coordinador; suites confirmadas y verificaciones específicas pendientes; research parcial y utilidad humana no validada**.
Origen: [P01 — Continuidad de proyecto](../producto/PROPUESTAS-EXPANSION.md#p01-continuidad-de-proyecto).
Marco: [Producto](../producto/PRODUCTO.md), [modelo](../arquitectura/MODELO.md) y [WBS principal](./WBS.md).

<!-- (idea creada, falta verificar contra research y websearch) -->

> (idea creada, falta verificar contra research y websearch)
>
> Marcador conservado por requisito del usuario: el contraste web es parcial y el research con usuarios sigue pendiente. No significa ausencia de toda consulta web ni acredita utilidad. Los identificadores P01.x no renumeran ni cierran los WP globales.

## 1. Decisión de ejecución y resultado esperado

### DEC-P01-2026-09-16 — Autorización explícita del usuario

El 2026-09-16 el usuario autoriza **la implementación completa de P01 sin esperar las puertas de research o el piloto manual previo**. Se sustituye, solo para P01, la secuencia que condicionaba el código a G1 y G2. Se elige el contrato de la sección 6 y del [anexo P01 del modelo](../arquitectura/MODELO.md#p01--contrato-aditivo-de-cierres).

- Backend/UI y verificación P01.3–P01.7 se entregan al alcance técnico según evidencia posterior del coordinador (sección 8), con las brechas allí declaradas; esta actualización tiene propiedad exclusiva sobre `docs/planificacion/WBS-P01-CONTINUIDAD.md` y `docs/arquitectura/MODELO.md`. No modifica código, la propuesta, el WBS global ni afirmaciones globales de producto.
- La autorización es una **excepción de secuencia**, no evidencia de que G1 se haya satisfecho, de que el piloto se haya realizado o de que G2/G3 hayan pasado pruebas.
- P01.1–P01.2 continúan como investigación humana pendiente/parcial, en paralelo al desarrollo. P01.7 exige evidencia técnica y P01.8 exige evaluación y decisión humana aunque todo el código esté terminado.
- No se inventan participantes, sesiones, mediciones, testimonios, resultados ni aprobación de utilidad. Tampoco se autoriza por esta decisión exposición MCP, IA o ampliaciones P02–P08.

### Resultado esperado, todavía hipótesis

Al volver a un espacio, el usuario puede leer dónde quedó el trabajo y elegir su siguiente acción sin reconstruir todo el contexto. El producto debe permitir **guardar un cierre voluntario y recuperarlo después**:

- Entrar a un espacio no inicia programas.
- Guardar un cierre no cambia la nota, la selección de Iniciar ni el pack MCP.
- Paravel sigue siendo útil sin IA y sin conexión a servicios externos.
- No guardar un cierre no impide salir ni trabajar normalmente.
- Un cierre no es un gestor de tareas ni un registro automático de actividad.

La aceptación separa funcionamiento técnico de utilidad observada. Compilar o mostrar un formulario no demuestra mejora de productividad.

## 2. Alcance y decisiones elegidas

### Incluido

1. Research del problema, referencias oficiales y protocolo de línea base/piloto.
2. Historial privado separado por espacio: crear, consultar último, paginar, editar y eliminar.
3. Resumen compacto al entrar, formulario voluntario e historial bajo demanda.
4. Migración aditiva, límites, concurrencia, idempotencia y pruebas de regresión.
5. Evaluación humana y retirada sin borrado automático de datos.

### Excluido

- IA, captura de pantalla/actividad, resúmenes automáticos y telemetría de productividad.
- Nuevas herramientas MCP, escritura desde bots y publicación automática.
- Sincronización, colaboración, exportación e integración con gestores de tareas.
- Subtareas, dependencias, sprints o tableros de planificación.
- Piezas vinculadas por ID, selección automática o lanzamiento desde un cierre. Los nombres pueden escribirse como texto; no se convierten en referencias navegables.
- Recuperación persistente de borradores o promesa de recuperación tras un cierre abrupto.

### Decisiones del contrato

| Decisión | Contrato elegido el 2026-09-16 | Verificación pendiente |
| --- | --- | --- |
| D01 — Privacidad del piloto | Mesas sintéticas o contenido consentido; soporte separado para datos privados, nunca asumir privada la nota | Consentimiento y soporte concretos en P01.2/P01.8 |
| D02 — Persistencia | Tabla aditiva `cierre`, FK a `espacio` con `ON DELETE CASCADE`; excluida de MCP | Migración y exposición negativa |
| D03 — Campos | Snapshots históricos `objective`, `progress`, `nextAction`, `blocker`; solo `progress` obligatorio | Validación y proyectos terminados |
| D04 — Edición | Explícita; `createdAt` inmutable, `updatedAt` Unix ms y `revision` CAS; sin versiones por campo | Conflictos y orden |
| D05 — Retención | Máximo 1000 cierres por espacio; sin purga automática; eliminación confirmada | Límites, concurrencia y cascada |
| D06 — Borradores | Solo memoria; confirmar descarte al salir/navegar con cambios; conservar ante error mientras viva la vista | Cancelar, reintentar y cierre nativo |
| D07 — Presentación | Último cierre compacto, fecha visible, formulario voluntario e historial paginado | Recorrido nativo y accesibilidad |

Son decisiones autorizadas para construir, no resultados aceptados. Un cambio de contrato debe anotarse aquí y en el modelo antes de considerarlo conforme.

## 3. Árbol de entregables

```text
P01  Continuidad de proyecto                         [autorizado; no aceptado]
├── P01.1  Evidencia del problema y referencias
│   ├── P01.1.1  Casos de uso y alternativas actuales
│   ├── P01.1.2  Research y websearch verificables
│   └── P01.1.3  Línea base y protocolo de medición
├── P01.2  Piloto manual y decisión de valor
│   ├── P01.2.1  Mesas, consentimiento y plantilla
│   ├── P01.2.2  Sesiones observadas
│   └── P01.2.3  Evaluación y puerta G1
├── P01.3  Contrato funcional y de datos
│   ├── P01.3.1  Campos, estados y operaciones
│   ├── P01.3.2  Privacidad, retención y límites
│   └── P01.3.3  Compatibilidad y puerta G2
├── P01.4  Interacción
│   ├── P01.4.1  Retomar y consultar historial
│   ├── P01.4.2  Guardar, editar y eliminar
│   └── P01.4.3  Errores, accesibilidad y validación
├── P01.5  Persistencia y servicio Rust
│   ├── P01.5.1  Migración y recuperación
│   ├── P01.5.2  Operaciones por espacio
│   └── P01.5.3  Pruebas de servicio
├── P01.6  Integración en la aplicación
│   ├── P01.6.1  Consulta al entrar
│   ├── P01.6.2  Formulario y acciones explícitas
│   └── P01.6.3  Historial y estados de interfaz
├── P01.7  Verificación integral
│   ├── P01.7.1  Persistencia y aislamiento
│   ├── P01.7.2  Regresión de Iniciar y MCP
│   └── P01.7.3  Recorrido nativo y puerta G3
├── P01.8  Piloto de producto y aceptación
│   ├── P01.8.1  Uso real consentido
│   ├── P01.8.2  Comparación con la línea base
│   └── P01.8.3  Decisión continuar / iterar / retirar
└── P01.9  Documentación y cierre
    ├── P01.9.1  Guía de uso y privacidad
    ├── P01.9.2  Evidencia y limitaciones
    └── P01.9.3  Entrega y procedimiento de retirada
```

## 4. Diccionario de paquetes de trabajo

| WP | Entregable verificable | Dependencias vigentes | Criterio de aceptación | Responsable propuesto |
| --- | --- | --- | --- | --- |
| P01.1 | Problema, fuentes y protocolo | Autorizado; paralelo al código | Fuentes fechadas, inferencias separadas y línea base real | Producto / research |
| P01.2 | Sesiones manuales y decisión G1 | P01.1; consentimiento D01 | Beneficio y coste revisados por el usuario; no bloquea código | Producto + usuario |
| P01.3 | Contrato de datos y comportamiento | DEC-P01-2026-09-16, sin esperar G1 | Decisiones explícitas y compatibilidad contrastada; documentar no equivale a probar | Producto + ingeniería |
| P01.4 | Interacción y tareas | Contrato P01.3 | Guardado/descarte comprensibles; teclado, errores y navegación | Diseño + usuario |
| P01.5 | Servicio Rust y fixtures | Contrato P01.3; no espera piloto | Migración, operaciones, aislamiento y límites probados | Backend |
| P01.6 | Flujo integrado | Contrato P01.3; integración con P01.5 | Sin mocks en aceptación; carga/error/vacío; nada implícito | Frontend |
| P01.7 | Suite y recorrido nativo reproducible | P01.5–P01.6 integrados | Matriz técnica con comandos, resultados y aislamiento MCP | Ingeniería / QA |
| P01.8 | Informe de utilidad y decisión | G3; línea base P01.1; consentimiento | Comparación real y aprobación humana | Usuario + producto |
| P01.9 | Documentación y cierre trazable | Avance documental paralelo; cierre tras P01.8 | Estado real, limitaciones y retirada sin borrar por defecto | Ingeniería + producto |

Los responsables son roles propuestos. Ningún subagente ni resultado de compilación sustituye la aprobación humana del valor.

## 5. P01.1–P01.2: research parcial y piloto reproducible

### Fuentes oficiales consultadas mediante webfetch

Fecha de consulta de todas las fuentes: **2026-09-16**. Es fecha de acceso, no de publicación. Son documentación primaria del fabricante; no estudios independientes de productividad ni uso observado en Paravel.

| ID | Fuente y sección | Observación verificable | Analogía propuesta y límite |
| --- | --- | --- | --- |
| R01 | [Linear — Initiative and Project updates](https://linear.app/docs/initiative-and-project-updates), Overview; Create/View updates; Updates tab; FAQ | Describe informes con indicador de salud y texto sobre estado, dificultades y próximos pasos. Muestra la actualización más reciente en Overview y las anteriores en Updates; permite editar y eliminar | Separar resumen reciente de historial y escritura explícita. No demuestra que los cuatro campos de Paravel sean óptimos ni que reduzcan tiempo al retomar |
| R02 | [Linear — Initiative and Project updates](https://linear.app/docs/initiative-and-project-updates), Manage notifications; Reminders; Agent assisted updates | Documenta Slack, recordatorios configurables y borradores asistidos por agente | Diferencia deliberada: P01 es local, privado respecto de MCP, voluntario y sin IA, recordatorios ni publicación. No se importan esas funciones ni sus permisos |
| R03 | [Linear — Projects](https://linear.app/docs/projects), Overview; View your projects; Project details sidebar | Sitúa resumen, propiedades, documentos y enlaces en un proyecto orientado a un resultado | Contexto localizado en una unidad de trabajo como analogía; no justifica añadir issues, equipos, hitos ni vínculos a piezas a P01 |

R01 y R02 son secciones de **una misma fuente**, no corroboración independiente. La ruta ensayada `https://linear.app/docs/project-updates` devolvió 404; no se usa como evidencia. La documentación accesible de updates es la citada en R01. No se realizó prueba interactiva de Linear ni se verificaron resultados comerciales, rendimiento o productividad.

**Síntesis:** el patrón análogo documentado es «actualización explícita + último estado visible + historial consultable». La afirmación «un cierre reduce el tiempo para retomar» sigue siendo una hipótesis de Paravel, no un hallazgo verificado por estas páginas. Los límites, privacidad, CAS y campos son decisiones de ingeniería/producto del usuario, no recomendaciones atribuidas a Linear.

### Preguntas humanas pendientes

- Frecuencia y coste de perder el hilo; alternativas actuales (nota, chat, gestor externo, memoria).
- Qué información realmente se necesita al regresar y si duplica el hábito existente.
- Uso del historial frente a solo el último cierre; efecto de cierres antiguos o ambiguos.
- Coste de escribir frente al tiempo ahorrado; casos terminados sin siguiente acción.

| Tarea | Estado de research |
| --- | --- |
| P01.1.1 | Escenarios de la propuesta leídos; entrevistas y observaciones pendientes |
| P01.1.2 | Parcial: webfetch oficial R01–R03; transferencia y research con usuarios pendientes |
| P01.1.3 | Protocolo propuesto aquí; línea base y umbrales aún no medidos/acordados |
| P01.2.1–P01.2.3 | Selección, consentimiento, sesiones y evaluación humana pendientes; no realizadas por esta tarea |

### Protocolo propuesto, no ejecutado

1. Acordar consentimiento y tres proyectos con tipos de trabajo distintos. Usar alias, no secretos, en el registro manual. Definir para cada proyecto una «primera acción útil» observable antes de medir (por ejemplo, ejecutar la prueba concreta que el usuario identificó para continuar).
2. **Línea base:** observar al menos tres reanudaciones por proyecto usando el hábito actual, sin imponer cierres. Cronometrar desde entrar a la mesa hasta esa acción; registrar también preparación habitual al salir. Incluir, si ocurre naturalmente, una interrupción de varios días. Si no hay suficientes ocasiones, extender la observación y declarar la carencia, no inventarlas.
3. Antes de la fase con cierres, el usuario fija y deja fechados el ahorro mínimo deseable, coste máximo tolerable y tolerancia a errores, a partir de esa línea base. No elegir umbrales después de ver los resultados. Registrar la versión del protocolo y de la app.
4. **Piloto manual P01.2:** cinco días de trabajo con la plantilla siguiente en soporte local acordado. **Piloto integrado P01.8:** después de G3, repetir el mismo protocolo en la app durante cinco días de trabajo. Ambos siguen pendientes; la autorización de código no los convierte en realizados ni sustituye uno por otro.
5. Buscar al menos tres reanudaciones comparables por proyecto y fase; no forzar cierres para rellenar una cuota. Registrar cierres omitidos, sesiones sin consulta y abandonos. Si no se alcanza cobertura, extender o declarar insuficiencia.
6. Usar el mismo registro manual: fase, alias de proyecto, tipo/dificultad de tarea, duración de interrupción, antigüedad del cierre, inicio/fin al retomar, primera acción útil, segundos de escritura/corrección, consulta último/historial, utilidad percibida (1–5 y explicación), errores de contexto y factores externos.
7. Comparar por proyecto tareas de dificultad e interrupción similares: número de observaciones, mediana/rango de tiempo al retomar, coste de cierre, consulta efectiva y errores. Presentar tiempos brutos y coste neto orientativo, no solo porcentajes. No mezclar proyectos distintos para simular una mejora uniforme.
8. Revisar con el usuario ejemplos reales y decidir continuar, iterar o retirar. Declarar aprendizaje, orden de fases, sesgo de observación, muestra pequeña y datos faltantes; no inferir causalidad ni productividad general de esta prueba exploratoria.

```text
Objetivo:
Último avance:
Siguiente acción:
Bloqueo:
```

### Privacidad y G1

La nota de una mesa puede ser contexto MCP; vaciar `pack_pieza` no convierte la nota en privada. No usarla para un piloto privado. Si se elige una mesa sintética o contenido autorizado en la nota, explicar la exposición antes de escribir; preferir soporte local separado para contenido privado.

G1 conserva su significado de decisión humana sobre necesidad: **continuar / iterar / retirar**, con beneficio y mantenimiento contrastados. Está pendiente, pero ya no bloquea la construcción por DEC-P01-2026-09-16. Una decisión negativa posterior requiere revisar el alcance o retirar explícitamente, no borrar automáticamente el historial.

## 6. P01.3: contrato funcional elegido

### Datos, validación y retención

El [modelo P01](../arquitectura/MODELO.md#p01--contrato-aditivo-de-cierres) fija el contrato aditivo, no certifica la migración. Cada cierre pertenece a un espacio mediante FK con `ON DELETE CASCADE`. No se migra `espacio.nota` a cierres ni se altera ninguna tabla/DTO de nota, pieza o pack para añadirlos.

| Campo del DTO | Contrato |
| --- | --- |
| `id` | UUID estable generado por el cliente para una creación; reutilizado en reintentos del mismo guardado |
| `spaceId` | UUID del espacio de destino, comprobado en todas las operaciones |
| `objective` | Snapshot textual opcional de objetivo de esa sesión; máximo 500 valores escalares Unicode |
| `progress` | Único texto obligatorio: último avance no vacío tras trim; máximo 4000 valores escalares Unicode |
| `nextAction` | Snapshot opcional, máximo 2000 valores escalares Unicode; vacío válido al terminar |
| `blocker` | Snapshot opcional, máximo 2000 valores escalares Unicode |
| `createdAt` | Entero Unix en milisegundos UTC asignado por backend; inmutable |
| `updatedAt` | Entero Unix en milisegundos UTC asignado por backend al crear/editar |
| `revision` | Entero positivo; comienza en 1 y aumenta en cada edición confirmada; control CAS |

Reconciliación con implementación el 2026-09-16: los cuatro campos se envían como string; los opcionales de contenido vacíos se guardan/devuelven como `""`, no `null`. Solo `progress` exige contenido. El backend comprueba longitudes y bytes sobre el texto recibido antes de recortar extremos; después aplica trim y exige avance no vacío (`app/src-tauri/src/continuity.rs:84`). Contar valores escalares Unicode, no bytes, unidades UTF-16 ni grafemas; no truncar silenciosamente. Límite total adicional: **32 KiB = 32768 bytes UTF-8 sumados entre los cuatro textos recibidos**, cadenas vacías cuentan cero. El total no es una cuota de DB ni tamaño de página. Los límites individuales permiten superar 32 KiB con caracteres multibyte, por lo que ambos controles son necesarios.

Son snapshots históricos, no campos globales sincronizados del espacio: editar un cierre no actualiza otros. No hay historial de versiones por campo. Mostrar fechas en zona local del usuario, sin convertir los timestamps antiguos de otras tablas, que actualmente usan segundos en texto.

Capacidad: **1000 cierres por espacio**. El alta 1001 falla de forma accionable y conserva el borrador; permite consultar, editar o eliminar explícitamente para liberar capacidad. Comprobar capacidad y alta en una misma transacción, también con escritores concurrentes. Sin TTL ni purga automática. Eliminar un espacio elimina sus cierres por cascada; la confirmación de eliminación de mesa debe explicarlo. Esta regla no implica crear un flujo nuevo para eliminar espacios.

### Operaciones y concurrencia

- **Crear:** acción explícita. El cliente conserva el mismo UUID y payload de la solicitud durante reintentos, incluido un resultado incierto. Mismo ID, espacio y contenido normalizado ya persistido devuelve ese cierre sin duplicar, consumir otra plaza, cambiar fechas ni aumentar revisión. Reutilizar un ID con otro contenido o espacio produce conflicto, nunca overwrite ni revelación de datos ajenos. Comprobar repetición antes de rechazar por capacidad completa.
- **Límite de idempotencia:** la garantía cubre reintentos de creación de un registro existente. No promete recuperar borradores tras reinicio, replay eterno tras eliminación ni restaurar una versión anterior. Si el cierre fue editado y ya no coincide, resolver conflicto sin sobrescribirlo; no tratar una nueva intención como reintento.
- **Leer cierre:** comprobar conjuntamente `spaceId` e `id`. ID ajeno/inexistente no devuelve el registro de otra mesa. Los errores públicos no contienen texto privado ni SQL.
- **Último:** `createdAt DESC, id DESC`, comparación determinista del UUID canónico. Editar uno antiguo no lo mueve al principio. Devuelve vacío si no hay cierres; distingue error de consulta de vacío.
- **Historial:** paginación por cursor, 20 por defecto, máximo 50; rechazar límites fuera de 1–50. Cursor versionado con espacio y clave `(createdAt, id)` del último elemento; validar forma y coincidencia con el espacio solicitado, rechazar cursor malformado o ajeno. Consultar claves estrictamente menores en ese orden, no usar offset. Devolver elementos y siguiente cursor o `null` al terminar.
- **Semántica de página:** orden estable sin omisiones/duplicados con datos sin cambios. No prometer snapshot de todo el historial durante escrituras concurrentes; nuevas altas se ven al refrescar desde el principio. El cursor no da autorización ni cifra datos.
- **Editar:** enviar revisión esperada y actualizar atómicamente por `(spaceId, id, revision)`. Con éxito incrementa `revision`, conserva `createdAt` y asigna `updatedAt`. CAS obsoleto falla sin sobrescribir y conserva el borrador para revisar/recargar explícitamente. La revisión, no el reloj, detecta conflictos; dos cambios pueden compartir milisegundo.
- **Eliminar:** confirmación identificando el cierre y revisión esperada; CAS impide borrar silenciosamente una edición concurrente. Tras éxito refrescar último/historial; mostrar el anterior o vacío. Sin papelera ni recuperación prometida.

### Aislamiento y G2

- Historial privado significa **excluido de MCP**, packs copiados y exposición automática. No significa cifrado en disco ni protección frente a programas con acceso a la cuenta local; una copia completa de SQLite puede contener cierres.
- No añadir cierres a logs, mensajes técnicos ni telemetría. Mantener intactos nota, pack, `marcada`, permisos y respuestas MCP existentes.
- UI mediante comandos propios del backend; no SQL directo, no escritura a través de MCP, no lanzamiento, IA, piezas vinculadas ni autoselección.
- Migración aditiva idempotente y transaccional de las estructuras P01; preservar datos previos y probar base nueva, existente, reapertura y fallo/rollback. Verificar FK activa en las conexiones escritoras.

G2 dejó de ser espera para empezar a programar por decisión del usuario. La implementación y suites reportadas aportan evidencia técnica en P01.7; la autorización o este texto por sí solos no equivalen a una prueba ni a la aceptación humana de utilidad.

## 7. P01.4–P01.6: interacción e implementación entregada al alcance

| Situación | Comportamiento exigido |
| --- | --- |
| Mesa sin cierres | Invitación discreta, voluntaria, sin bloquear el uso |
| Mesa con cierres | Último cierre con fecha y acceso al historial bajo demanda |
| Trabajo terminado | Guardar `progress` sin exigir siguiente acción |
| Borrador modificado | Confirmar descarte al cancelar, navegar, cambiar de mesa o cerrar normalmente la app; cancelar mantiene vista y texto |
| Error o conflicto al guardar | Mantener borrador mientras viva la vista, mensaje accionable y reintento/revisión explícitos |
| Guardado en curso | Bloquear doble envío y no trasladar el borrador a otra mesa; mantener UUID de solicitud |
| Guardado confirmado | Mostrar éxito solo después de persistencia; separar fallo de recarga de fallo de escritura |
| Respuesta atrasada | No mostrar datos ni mensajes en otra mesa; respuesta asociada al espacio y solicitud de origen |
| Edición/eliminación | Identificar cierre; confirmar eliminación; tratar CAS obsoleto sin overwrite |
| Historial largo | Páginas acotadas, carga/error/vacío distinguibles, posibilidad de refrescar |
| Teclado/zoom | Etiquetas, foco y lectura completa sin depender del ratón |

El borrador vive **solo en memoria**, no en nota, SQLite, localStorage ni sessionStorage. La confirmación en un cierre normal no garantiza interceptar una terminación forzada; caída, recarga o cierre abrupto pueden perderlo. No ofrecer recuperación que no exista. Un cierre ya confirmado sí debe persistir y reaparecer al reiniciar.

Backend/frontend integrados y entregados al alcance técnico P01.3–P01.7 según el coordinador. La distribución visual no está certificada por el research de Linear; el recorrido nativo probado y sus límites se detallan en la sección 8. La prueba humana de interacción y utilidad sigue pendiente. No se relanzan aquí suites ni navegadores: el harness nativo usa un puerto fijo y se coordina en exclusiva.

## 8. P01.7: matriz mínima y evidencia de aceptación

**P01.3–P01.7: entregados al alcance técnico con evidencia del coordinador del 2026-09-16.** Esta matriz conserva los requisitos; no implica que cada variante tenga prueba individual aprobada. Los resultados reproducidos por el coordinador y las brechas se enumeran debajo. Esta tarea documental no vuelve a ejecutar suites ni atribuye sus resultados a ejecución propia.

| Caso | Resultado exigido |
| --- | --- |
| Crear y reiniciar | Un único cierre en su mesa, datos y fechas persistidos |
| Opcionales vacíos / progreso vacío | Opcionales válidos; progreso vacío o solo espacios rechazado |
| Límites Unicode | Cada límite exacto y +1; multibyte y caracteres combinados; UI y Rust cuentan igual |
| Total UTF-8 | 32768 bytes permitido si cada campo cumple; 32769 rechazado, sin truncado |
| Capacidad | 1000 permitido, 1001 rechazado; carrera de altas no excede cupo; sin purga |
| Replay de creación | Mismo UUID/payload devuelve mismo cierre incluso a capacidad completa; sin revisión/fecha nueva |
| Reutilización conflictiva | UUID con otro payload/espacio no sobrescribe ni revela datos ajenos |
| CAS concurrente | Dos ediciones con misma revisión: solo una prospera; delete obsoleto no borra |
| Editar antiguo | Creación y posición intactas; revisión incrementada y modificación registrada |
| IDs ajenos / espacio inexistente | No leer, editar, eliminar ni crear fuera del espacio validado |
| Último/historial | Fechas iguales desempatan por ID descendente; eliminar último/único refresca correctamente |
| Paginación | Default 20, max 50, inválidos rechazados; cursor ajeno/malformado rechazado; fin `null` |
| Cambio de mesa y respuestas atrasadas | Sin contenido ni guardado en mesa equivocada |
| Error DB / respuesta incierta | Sin éxito falso; borrador y UUID conservados; reintento sin duplicado |
| Descarte y cierre nativo | Cancelar conserva; confirmar descarta; no promesa ante terminación forzada |
| Migración | DB nueva/existente/reapertura; fallo revierte P01 sin destruir tablas ni datos previos |
| Cascada | Borrar espacio (y grupo por cascada) elimina sus cierres, no los de otros espacios |
| MCP antes/después | Misma exposición; ninguno de los cuatro textos ni metadatos del cierre en respuestas |
| Nota, pack e Iniciar | Guardar/editar/borrar no altera nota, pack ni marcada; cero lanzamientos implícitos |
| Lanzamiento explícito | Selección y log de Iniciar mantienen el comportamiento previo |
| Privacidad y accesibilidad | Sin texto privado en logs; teclado, foco, zoom, etiquetas y lectura verificables |

### Evidencia técnica comunicada por el coordinador — 2026-09-16

Procedencia: resultados explícitos del coordinador en este encargo; no ejecución propia de esta actualización ni piloto humano. No se asigna una revisión/build exacta no proporcionada.

| Directorio | Comando ejecutado por coordinador | Resultado y alcance |
| --- | --- | --- |
| `app/src-tauri` | `cargo test --lib` | **20 PASS: 15 de cierres + 5 previos** |
| `app/src-tauri` | `cargo clippy --lib -- -D warnings` | **Limpio**, sin warnings |
| `app` | `npm run build` | **PASS**, incluye TypeScript; error previo `retryCursor` resuelto |
| `app` | `node --test scripts/continuity.test.mjs` | **6 PASS**. La afirmación anterior de 18 de un agente era incorrecta y no se adopta |
| `app` | `node scripts/continuity-native.test.mjs` | **3 PASS**, Tauri/WebView2 real con SQLite fixture aislada: crear con opcionales y cancelar descarte sucio; editar con revisión y `createdAt` estable/eliminar; persistencia al reiniciar. `launchLogEntries: 0` |
| `app` | `node scripts/continuity-ui.test.mjs` | **4/4 PASS confirmados en la última repetición del coordinador**, después de `currentWindowSafe`. Sustituye el fallo intermedio por metadatos de ventana ausentes tras habilitar cierre; es mock, no native |
| `app/crates/paravel-context` | `cargo test` | **17 PASS**, suite de contexto confirmada por el coordinador |
| `app/crates/paravel-mcp` | `cargo test` | **45 PASS: 8 unit + 19 HTTP + 18 stdio**, confirmados por el coordinador |

El native PASS usa fixture sintética y no prueba beneficio de producto. Cero entradas de lanzamiento demuestra ausencia de lanzamientos en ese recorrido; no demuestra por sí solo lanzamiento explícito correcto ni toda la regresión MCP. No se trasladan resultados de suites no reportadas a esta tabla.

### Brechas explícitas y aislamiento del harness

- **Mock final confirmado:** 4/4 PASS tras el fallback, sin bloqueo vigente de esa suite. **React Doctor final confirmado por el coordinador el 2026-09-16:** `npx.cmd -y react-doctor@latest --verbose --scope changed` recurrió a escaneo completo por ausencia de baseline Git: **17 archivos, score 66/100, 22 warnings, 0 errores**, igual al score previo del agente. Los avisos incluyen complejidad/patrones de estado de carga de `ContinuityPanel` (operaciones asíncronas protegidas y probadas) y mantenibilidad/accesibilidad de `Workspace` existente. No es lint limpio ni demuestra ausencia de regresiones; sin baseline no se atribuyen mejoras/regresiones a P01.
- **Lector de pantalla y cancelación del cierre nativo del SO:** no demostrados por una prueba explícita reportada. Cancelar un descarte sucio en el formulario no acredita pulsar cerrar en Windows/Alt+F4, cancelar y conservar la ventana y el borrador. El requisito sigue vigente, sin afirmar validación completa de accesibilidad.
- `core:window:allow-destroy` está habilitado en la capability de la ventana principal para el flujo de cierre; no amplía MCP. `currentWindowSafe` protege la obtención síncrona de ventana cuando el entorno mock carece de metadatos; no sustituye la prueba nativa del evento de cierre.
- `PARAVEL_TEST_DATA_DIR` y el redireccionamiento de log de pruebas están bajo `cfg(debug_assertions)`: el harness usa datos/log aislados y no cambia la ruta de release. El puerto CDP fijo es 9223; no ejecutar simultáneamente otro harness/browser sobre él. Esta tarea no lanza pruebas.
- Restore de copia completa, downgrade y pruebas adicionales no incluidas expresamente en el reporte no se declaran verificadas. Research humano, consentimiento, línea base y utilidad siguen pendientes.

### Fuente técnica y comandos reproducibles

Lectura inicial de fuente el 2026-09-16, anterior a la integración; las líneas históricas siguientes pueden desplazarse y no son evidencia de ejecución. Fuente integrada adicional: `app/src-tauri/src/continuity.rs:139` (migración), `:289` (save/CAS), `:388` (invokes); `app/src/ContinuityPanel.tsx:16` (fallback de ventana); `app/src-tauri/src/lib.rs:554` (registro P01).

- `app/src-tauri/src/db.rs:55` y `:65`: apertura, FK y esquema aditivo existente; `:240` separa operaciones del pack.
- `app/src-tauri/src/lib.rs:91`: reloj actual en segundos como texto; P01 requiere Unix ms propio. `:508`: registro de invokes, que deberá incluir comandos P01 cuando se integren.
- `app/crates/paravel-context/src/ui.rs:127`: DTO/listado de espacios sin cierre.
- `app/crates/paravel-context/src/reader.rs:133`, `:210`, `:222`: esquema de lectura, apertura read-only y lectura de nota MCP; añadir una tabla no es por sí solo evidencia de exclusión.
- `app/src/Workspace.tsx:59`: texto de pack; `:161`–`:186`: navegación; `:261`: consulta con control de mesa activa. Son puntos de regresión, no funciones P01 aceptadas.
- `app/package.json:6`: `build` ejecuta `tsc && vite build`; no declara scripts `lint` o `typecheck`. `app/README.md:38`–`:44` documenta pruebas existentes de Firefox; no son pruebas de cierres.

Comandos para registrar por el responsable de implementación con salida, fecha y versión exactas; esta lista no afirma ejecución ni éxito:

| Directorio | Comando | Alcance |
| --- | --- | --- |
| `app` | `npx tsc --noEmit` | Tipos UI, no aceptación funcional |
| `app` | `npm run build` | Typecheck y build UI |
| `app` | `node --experimental-strip-types --test scripts/firefox-group.test.mjs` | Regresión existente, no P01 |
| `app/src-tauri` | `cargo test --lib` | Servicio Rust; acreditar qué tests de cierres incluye |
| `app/crates/paravel-context` | `cargo test` | Lecturas/aislamiento; añadir evidencia negativa P01 al integrar |
| `app/crates/paravel-mcp` | `cargo test` | Regresión MCP aplicable |

Lint Rust: el coordinador reporta `cargo clippy --lib -- -D warnings` limpio. No hay script de lint frontend declarado; no inventar `npm run lint`. React Doctor final está confirmado con los 22 warnings descritos arriba; no es lint limpio, no hay comparación Git ni verificación adicional de formato reportada. La tabla superior distingue resultados ejecutados de otros comandos reproducibles aún sin resultado reportado.

### Verificación ejecutada en esta actualización documental

El 2026-09-16 se ejecutó `npx tsc --noEmit --incremental false` desde `app`. Resultado: **falló** con `src/ContinuityPanel.tsx(55,9): error TS6133: 'retryCursor' is declared but its value is never read.` Es una observación del árbol en implementación concurrente, no una aceptación ni diagnóstico de utilidad. No se modificó ese archivo porque esta tarea solo posee los dos documentos autorizados. **Estado posterior:** el coordinador confirma corregido ese error y `npm run build` PASS (incluye TypeScript). El fallo se conserva como antecedente, no como bloqueo vigente. No se afirma haber repetido aquí el comando original; la evidencia funcional posterior consta en la tabla del coordinador.

### G3 — Candidato a piloto real

P01.7 entrega la verificación técnica al alcance reportado, con recorrido nativo real. **No se declara G3 sin reservas**: mock, contexto y MCP están confirmados PASS; quedan las brechas explícitas anteriores para resolver o aceptar conscientemente con alcance limitado antes de un piloto real consentido. Un mock/typecheck no sustituye native y native no sustituye investigación humana. G1 no bloqueó la implementación por decisión del usuario; G1 y P01.8 siguen sin resultados.

## 9. P01.8: evaluación humana del producto

Medir tiempo al retomar, coste de cierre, consulta efectiva, mantenimiento percibido, utilidad del historial y errores de contexto con el protocolo de la sección 5. La apertura automática del resumen no cuenta por sí sola como consulta útil. No se incorpora telemetría para producir resultados.

El usuario debe confirmar con ejemplos observados que facilita retomar y que escribir el cierre es aceptable. Si solo beneficia a un tipo de proyecto, documentar ese alcance, no generalizar. Resultados posibles: continuar con el mínimo, iterar, simplificar historial o retirar. Cambios de retención requieren nueva decisión, nunca purga implícita.

**Piloto, línea base medida, utilidad y aceptación humana: pendientes aun si se completa todo el código.**

## 10. Riesgos, retirada y documentación

| Riesgo | Medida |
| --- | --- |
| Duplicar una herramienta sin aportar valor | Research paralelo, campos mínimos y decisión humana posterior |
| Compartir texto privado en nota/pack | Almacenamiento separado; explicar D01 y probar exposición negativa |
| Perder borrador o sobrescribir edición | Memoria claramente limitada, descarte confirmado, UUID estable y CAS |
| Crecer sin límite | 1000 por espacio y límites de texto; error accionable, sin purga |
| Dañar DB existente | Migración aditiva, rollback probado y copia consistente antes de piloto real |
| Confundir código terminado con utilidad | Estados separados de implementación, aceptación técnica y humana |

Desactivar la interfaz **no borra** cierres. Comprobar que una versión anterior tolera las tablas añadidas antes de recomendar downgrade; no asumir que revertir código revierte datos. El borrado de cierres se confirma por separado; borrar una mesa sí aplica la cascada elegida. Restaurar una copia completa de DB puede revertir trabajo posterior ajeno a P01: explicar alcance y pedir autorización, sin prometer recuperación selectiva.

### Guía de uso, recuperación y retirada

1. Abre una mesa y consulta su último cierre/fecha. Para registrar una sesión, crea un cierre y escribe **Último avance**; objetivo, siguiente acción y bloqueo pueden quedar vacíos, también en un proyecto terminado. Guarda explícitamente y espera confirmación; no se inicia ninguna pieza.
2. Consulta el historial bajo demanda (20 por página, máximo backend 50). Editar conserva la fecha de creación y aumenta revisión; ante conflicto, conserva el texto y revisa/recarga antes de volver a guardar. Eliminar requiere confirmación y no ofrece papelera.
3. Respeta los límites 500/4000/2000/2000 valores escalares Unicode y 32768 bytes UTF-8 totales. A los 1000 cierres de una mesa, el nuevo guardado se rechaza sin purga: elimina uno conscientemente si quieres liberar espacio. Guardar un cierre nunca cambia nota, pack ni selección de Iniciar.
4. Si hay cambios sin guardar, cancelar el descarte conserva el borrador; aceptar lo pierde. Vive solo en memoria: no hay recuperación tras caída, recarga o terminación abrupta. La cancelación desde el cierre del SO todavía no tiene evidencia explícita, aunque exista implementación del guard.
5. Un cierre confirmado reaparece al reiniciar: ese recorrido sí está probado en fixture nativa. No hay restauración selectiva ni deshacer de eliminación. Para recuperar desde una copia completa de SQLite, cerrar la app y lectores, conservar una copia consistente del estado actual y obtener autorización antes de sustituir la DB; la copia restaura también otros datos y puede perder trabajo posterior. Este procedimiento no se declara ensayado ni añade una función de backup/exportación.
6. Retirar/desactivar la UI no borra el historial. No ejecutar una purga como parte de un downgrade; verificar compatibilidad antes. Borrar una mesa elimina sus cierres por cascada y debe explicarse al confirmar. Cierres privados significa excluidos de MCP/pack, no cifrados: una copia de la DB también contiene esos textos.

Esta guía se incorpora aquí, sin crear documentos nuevos. P01.9 queda documentado al alcance técnico; cierre de producto y aprobación de utilidad siguen pendientes.

## 11. Secuencia y estado actual

```text
DEC-P01-2026-09-16 → contrato P01.3 → P01.4 / P01.5 / P01.6 en paralelo
                                                       ↓
                                                P01.7 → G3
                                                       ↓
P01.1 → línea base → P01.2 → G1 (sin bloquear código) → P01.8 → P01.9
```

| Elemento | Estado al 2026-09-16 |
| --- | --- |
| Autorización de código P01 | Completa y explícita; sin esperar research/piloto |
| P01.1 — Research/websearch | Parcial R01–R03; investigación humana y línea base pendientes |
| P01.2 — Piloto manual / G1 | Pendiente; no realizado ni necesidad demostrada |
| P01.3 — Contrato / D01–D07 | Elegido y documentado; consentimiento concreto de piloto pendiente |
| G2 | Espera de entrada dispensada por usuario; contrato integrado con evidencia técnica reportada |
| P01.3–P01.6 — Contrato/backend/UI | Entregados al alcance técnico; representación de opcionales y validación reconciliadas con fuente |
| P01.7 | Entregado al alcance reportado: Rust 20, Clippy limpio, build PASS, Node 6, native 3, mock 4/4, contexto 17 y MCP 45 PASS |
| G3 | Recorrido native y suites acreditados; sin cierre incondicional por brechas declaradas de lector de pantalla/cancelación del cierre del SO; Doctor final registrado con warnings |
| P01.8 | Piloto integrado, utilidad y aprobación humana pendientes aunque el código esté entregado |
| P01.9 | Guía, modelo y evidencia técnica actualizados en estos dos documentos; cierre de producto pendiente |
| WBS global / propuestas / producto | Sin cambios por esta tarea |
| Estimación de calendario | No comprometida |

**Siguiente acción de coordinación:** verificar lector de pantalla/cancelación desde el cierre del SO y acordar consentimiento, línea base y sesiones. React Doctor final ya está registrado, con sus warnings y limitaciones. La entrega de los dos documentos asignados queda finalizada con los resultados confirmados y estas limitaciones explícitas. No volver a imponer G1 como espera para codificar ni marcar utilidad aceptada sin observaciones humanas.
