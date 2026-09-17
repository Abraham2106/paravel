# Propuestas de expansión de Paravel

Fecha: 2026-09-16.
Estado: ocho ideas seleccionadas por el usuario para profundización; investigación y validación pendientes.
Documento de referencia: [PRODUCTO.md](./PRODUCTO.md).

> La aprobación de las ideas autoriza su desarrollo conceptual. No equivale a aprobar una arquitectura definitiva, migraciones, conexiones externas, publicación de datos ni la implementación simultánea de las ocho propuestas.

## 1. Propósito y lectura

Paravel organiza proyectos como espacios con piezas, permite iniciar una selección y ofrece contexto acotado a clientes MCP. La expansión propuesta busca reducir el esfuerzo de empezar, retomar, encontrar y entregar trabajo sin sustituir las herramientas donde ese trabajo ocurre.

**Promesa de producto propuesta:** «Abre un proyecto y recupera dónde estabas, qué necesitas y cuál es el siguiente paso».

Las referencias a Raycast, Linear, Notion, Obsidian y Slack son analogías de producto pendientes de contrastar. No se han verificado para este documento sus funciones actuales, precios, resultados comerciales, políticas de datos ni limitaciones. No se afirma que una función explique el éxito de esas empresas.

En cada propuesta se distingue:

- **Hipótesis:** beneficio que creemos que podría existir.
- **Versión mínima:** alcance con el que se probaría esa hipótesis.
- **Evolución:** posibilidades posteriores, no compromisos de construcción.
- **Validación:** investigación y prueba de uso necesarias para decidir.

La complejidad es relativa al producto actual y no constituye una estimación de calendario. Las métricas propuestas todavía no tienen línea base ni resultados observados.

## 2. Principios comunes

1. El espacio continúa siendo la unidad principal de trabajo.
2. Entrar a una mesa no inicia programas; Iniciar sigue siendo una acción explícita.
3. La utilidad básica no depende de un proveedor de IA.
4. Las nuevas funciones no amplían automáticamente lo que comparte MCP.
5. Capturar una referencia no equivale a copiar, leer o subir su contenido.
6. Los cambios de permisos se confirman y se explican en términos de datos, no solo de integraciones.
7. La automatización se introduce después de validar el flujo manual.
8. Se conservan rutas de salida: exportar, desconectar y retirar una función sin perder el trabajo.

## 3. Catálogo

| ID | Idea | Trabajo que facilita | Complejidad inicial | Dependencias principales |
| --- | --- | --- | --- | --- |
| P01 | Continuidad de proyecto | Retomar una tarea | Media | Nota actual; historial solo si se valida |
| P02 | Captura rápida hacia una mesa | Incorporar recursos | Media | Validadores de piezas y selección de destino |
| P03 | Plantillas de espacios | Crear estructuras repetibles | Baja–media | Modelo de espacios; P01 mejora su contenido |
| P04 | Navegación y búsqueda unificadas | Encontrar y actuar | Media | Consultas locales de metadatos |
| P05 | Centro de contexto compartido | Comprender y controlar la exposición | Media | Contrato y consultas autorizadas de MCP |
| P06 | Exportación, respaldo y portabilidad | Recuperar o trasladar trabajo | Media | Formato versionado e importación validada |
| P07 | Mesas compartidas entre personas | Entregar contexto | Media para instantáneas | P06; P05 para revisar lo compartido |
| P08 | Asistente de orientación de la sede | Localizar proyectos por intención | Media–alta | Línea base de P04 y mapa autorizado |

---

## P01. Continuidad de proyecto

<!-- (idea creada, falta verificar contra research y websearch) -->

**Estado:** (idea creada, falta verificar contra research y websearch)

### Problema e hipótesis

Una mesa puede abrir todos los recursos correctos y aun así dejar al usuario preguntándose qué estaba haciendo. Las decisiones y próximos pasos suelen quedar dispersos entre chats, notas y memoria personal.

Hipótesis: un cierre breve y voluntario reduce el tiempo de reconstrucción del contexto en la siguiente sesión. Inspiración a investigar: claridad de prioridades y estados en Linear, sin convertir Paravel en un gestor completo de tareas.

### Usuarios y escenarios

- Desarrollador que alterna entre varios repositorios.
- Investigador que vuelve a una lectura después de varios días.
- Profesional que interrumpe una entrega para atender otra.

Ejemplo: «Dejé funcionando el formulario; falta comprobar los errores de validación. Necesito el repo y la especificación, no todas las piezas de la mesa».

### Experiencia propuesta

1. Al entrar, el usuario ve el último cierre y su fecha.
2. Identifica la siguiente acción y los recursos relacionados.
3. Puede preparar una selección, pero debe pulsar Iniciar para abrirla.
4. Durante el trabajo puede corregir el objetivo o el bloqueo.
5. Al terminar, guarda un cierre breve o decide no hacerlo.

No se interpreta cerrar la ventana como terminar una sesión: el gesto de guardar debe ser explícito y recuperable si falla.

### Versión mínima y evolución

Primero probar una plantilla en la nota existente: objetivo, último avance, siguiente acción y bloqueo. Después, si demuestra uso, incorporar un cierre estructurado con historial por espacio.

Evoluciones posibles: comparar cierres, vincular piezas y proponer un resumen asistido. La IA no observa toda la actividad ni guarda conclusiones sin confirmación.

Fuera del mínimo: temporizador obligatorio, vigilancia de aplicaciones, captura de pantalla, gestión de sprints y escritura automática desde MCP.

### Datos e integración

Un historial futuro necesitaría identificador, espacio, fecha, contenido y referencias opcionales a piezas. Las piezas eliminadas no deben hacer ilegible un cierre anterior. La retención y eliminación del historial deben ser comprensibles.

**Decisión de privacidad previa al prototipo:** la nota actual forma parte del contexto MCP. Si se escribe allí el cierre, también se comparte. Para un historial privado se necesitaría un almacenamiento separado y una política explícita; no debe introducirse como si ya fuera privado.

### Validación y aceptación

- Registrar una línea base del tiempo que tarda el usuario en identificar su siguiente acción.
- Probar en tres mesas durante una semana, incluyendo proyectos abandonados varios días.
- Medir tiempo hasta una acción útil, cierres consultados y esfuerzo de mantenimiento percibido.
- Comprobar guardado, edición, persistencia al reiniciar y recuperación ante errores.
- Verificar que seleccionar un cierre nunca abre piezas automáticamente.

Continuar si los cierres se consultan y mejoran la continuidad. Simplificar o retirar si solo se rellenan para cumplir el experimento.

### Riesgos y research pendiente

Riesgos: duplicación de tareas externas, resúmenes obsoletos, carga de mantenimiento y exposición de notas personales. Investigar cómo trabajan realmente los usuarios entre sesiones, qué alternativas emplean y qué aspectos de Linear son transferibles. Definir los umbrales de éxito después de medir la línea base, no después de observar el resultado.

---

## P02. Captura rápida hacia una mesa

<!-- (idea creada, falta verificar contra research y websearch) -->

**Estado:** (idea creada, falta verificar contra research y websearch)

### Problema e hipótesis

Guardar un recurso exige cambiar de contexto, localizar la mesa y completar varios pasos. Parte del material termina en pestañas abiertas o notas provisionales.

Hipótesis: capturar una referencia con destino explícito aumenta la recuperación posterior de recursos útiles. Inspiración a investigar: acceso rápido de Raycast y patrones de bandeja de entrada; la velocidad no debe eliminar la revisión.

### Experiencia propuesta

1. Pegar una URL o arrastrar un archivo o carpeta dentro de Paravel.
2. Ver una previsualización con nombre, tipo, destino y posibles duplicados.
3. Confirmar qué elementos se incorporan.
4. Recibir un resultado por elemento, con posibilidad de corregir los rechazados.
5. Volver al trabajo sin iniciar los recursos capturados.

En una mesa abierta puede proponerse esa mesa como destino, pero debe permanecer visible. Desde una vista general se exige elegir destino.

### Versión mínima y evolución

Mínimo: captura dentro de la aplicación y alta de referencias compatibles con los tipos actuales. La importación por lotes debe tener un límite definido y evitar fallos silenciosos.

Después: atajo global, captura desde navegador y una bandeja temporal, solo si los usuarios muestran necesidad. No construir una extensión antes de validar el recorrido dentro de la app.

Fuera del mínimo: descargar páginas, copiar árboles de carpetas, extraer documentos o compartir con un bot durante la captura.

### Datos e integración

Reutilizar la validación Rust existente; el frontend no decide por sí solo si una ruta o URL es aceptable. La detección de duplicados es una ayuda, no una razón para fusionar recursos irreversiblemente.

Debe investigarse la normalización: dos URLs con parámetros distintos pueden representar contenidos diferentes. Las referencias locales pueden dejar de existir y requieren un estado accionable, no borrado automático.

Capturar no concede acceso MCP. La selección compartida sigue siendo otra decisión. Si se ofrece deshacer, solo debe revertir las altas de esa operación, sin eliminar recursos que ya existían.

### Validación y aceptación

Comparar el flujo actual con diez capturas representativas: URL, archivo, carpeta, duplicado y dato inválido. Medir tiempo, errores de destino, correcciones y reutilización posterior.

Aceptar cuando todos los resultados son visibles, no hay altas en mesas incorrectas, no se ejecutan programas y los fallos parciales no obligan a repetir elementos exitosos.

### Riesgos y research pendiente

Riesgos: acumulación, duplicados ambiguos, capturas accidentales y expectativas de copia de archivos. Investigar hábitos de captura, compatibilidad real de drag-and-drop en Tauri/Windows, limitaciones de navegadores y principios de interacción de Raycast. El número de piezas creadas por sí solo no demuestra valor.

---

## P03. Plantillas de espacios

<!-- (idea creada, falta verificar contra research y websearch) -->

**Estado:** entregada al alcance técnico el 2026-09-16; research y piloto humano pendientes. Contrato: [PLANTEAMIENTO-P03](../planificacion/PLANTEAMIENTO-P03.md), [modelo](../arquitectura/MODELO.md#p03--contrato-aditivo-de-plantillas-de-espacios).

### Problema e hipótesis

Los proyectos comparten estructuras, pero hoy cada mesa se prepara desde cero. Una pantalla vacía dificulta comprender el producto.

Hipótesis: una estructura pequeña y editable acelera el primer espacio útil. Inspiración a investigar: plantillas de Notion, manteniendo un catálogo limitado en vez de un sistema de documentos configurable sin límites.

### Experiencia propuesta

Elegir plantilla, indicar nombre y grupo, completar solo los datos imprescindibles, revisar y crear. La mesa resultante es independiente: cambiar la plantilla no modifica proyectos existentes.

Tres candidatas iniciales:

- **Desarrollo:** objetivo, repositorio por seleccionar, referencia funcional y siguiente paso.
- **Investigación:** pregunta, fuentes por añadir y síntesis provisional.
- **Cliente:** resultado esperado, materiales y próxima entrega.

Los campos sin completar son sugerencias visibles, no piezas con rutas ficticias.

### Versión mínima y evolución

Mínimo: tres plantillas incluidas y creación de espacios independientes. Después: guardar una estructura propia como plantilla y duplicarla con una previsualización de lo que se conserva.

Fuera del mínimo: marketplace, ejecución de scripts, paquetes descargables de terceros y mantenimiento automático de mesas derivadas.

### Datos e integración

Definir un formato de plantilla versionado, independiente de la identidad de un espacio real. Al materializarla se generan nuevos identificadores y se aplican los validadores habituales.

Nunca copiar credenciales, permisos MCP, conexiones de clientes ni selecciones compartidas. Las rutas y URLs heredadas necesitan revisión; la plantilla debe distinguir estructura de contenido sensible.

La creación debe ser atómica o explicar claramente cualquier resultado parcial. Una plantilla incompatible debe rechazarse antes de crear un espacio incompleto.

### Validación y aceptación

Observar a usuarios nuevos creando una mesa con y sin plantilla. Medir tiempo al primer espacio útil, ayuda requerida, campos eliminados y abandono.

Aceptar si permite empezar sin asistencia y si las mesas resultantes no quedan sobrecargadas. Verificar que dos instancias no comparten IDs ni cambios involuntarios.

### Riesgos y research pendiente

Riesgos: imponer una metodología, multiplicar campos y convertir ejemplos en categorías rígidas del producto. Investigar las estructuras que se repiten de verdad y contrastar flujos actuales de plantillas de Notion. Retirar plantillas que se borran casi completas tras crearlas.

---

## P04. Navegación y búsqueda unificadas

<!-- (idea creada, falta verificar contra research y websearch) -->

**Estado:** entregada al alcance técnico el 2026-09-17; research y piloto humano pendientes. Contrato: [WBS-P04](../planificacion/WBS-P04-NAVEGACION.md), [modelo](../arquitectura/MODELO.md#p04--contrato-aditivo-de-navegación).

### Problema e hipótesis

La navegación por grupos funciona con pocas mesas, pero puede exigir demasiados pasos al crecer el catálogo.

Hipótesis: una búsqueda local de metadatos permite encontrar un recurso y actuar con menos esfuerzo que recorrer la estructura. Inspiración a investigar: navegación por teclado en Raycast y Linear.

### Experiencia propuesta

Abrir búsqueda, escribir un término y ver resultados agrupados por espacios y piezas. Cada resultado muestra suficiente contexto para distinguir homónimos: grupo, espacio y tipo.

Entrar al resultado es la acción predeterminada. Añadir una pieza o preparar una selección pueden ser acciones secundarias. Iniciar programas nunca se dispara por una coincidencia ambigua o por escribir una consulta.

### Versión mínima y evolución

Mínimo: búsqueda por nombres de grupo, espacio y pieza, con teclado, estados vacíos y orden determinista. Medir primero si hacen falta consultas aproximadas o índices adicionales.

Evolución: filtros, favoritos y recientes locales. La búsqueda semántica y la indexación de contenido son decisiones posteriores y separadas.

Fuera del mínimo: leer archivos, indexar el disco, mostrar payloads completos o consultar servicios remotos.

### Datos e integración

La búsqueda global pertenece a la UI local de la sede. No se registra como una herramienta global del Bot de mesa. El permiso de ver el escritorio no debe confundirse con el ámbito reducido del cliente MCP.

Si se guardan recientes, permitir borrarlos y definir retención. Si aparece un índice, garantizar actualización tras renombrar, mover o eliminar elementos y evitar duplicar contenido innecesariamente.

### Validación y aceptación

Preparar un catálogo sintético con nombres repetidos, acentos y múltiples grupos. Probar tareas conocidas y consultas incompletas. Medir tiempo de localización, elección del primer resultado, errores y latencia.

Aceptar si el teclado y el foco funcionan de forma consistente, no aparecen elementos eliminados y la búsqueda mejora tareas donde la navegación ya resulta costosa.

### Riesgos y research pendiente

Riesgos: ranking impredecible, resultados sin contexto y optimización prematura para miles de piezas. Investigar el tamaño real de las sedes, vocabulario empleado y accesibilidad de las interfaces de referencia. Comparar contra la navegación actual antes de añadir IA.

---

## P05. Centro de contexto compartido

<!-- (idea creada, falta verificar contra research y websearch) -->

**Estado:** (idea creada, falta verificar contra research y websearch)

### Problema e hipótesis

Un usuario puede seleccionar un pack sin comprender que la nota también se comparte o que cerrar Paravel no necesariamente termina un proceso MCP externo.

Hipótesis: una vista que muestre datos efectivos y consecuencias de cada acción mejora el consentimiento y reduce errores de exposición. Inspiración a investigar: revisión de acceso y visibilidad en productos colaborativos como Slack y Notion.

### Experiencia propuesta

Una vista «Qué comparto» muestra:

- Espacio y nota incluidos en el contexto.
- Piezas autorizadas actualmente por el pack.
- Datos que las herramientas pueden devolver y aquello que no hacen.
- Diferencia entre retirar una pieza, vaciar el pack y detener el acceso.
- Limitaciones para borrar información que un cliente ya recibió.

Previsualizar el contexto no debe llamar a un bot ni enviar datos a un proveedor.

### Versión mínima y evolución

Mínimo: vista local de la política efectiva y previsualización de las tres herramientas. Usar las mismas consultas autorizadas del backend, no una interpretación paralela en React.

Evolución: diagnósticos y gestión de conexiones únicamente cuando exista un mecanismo fiable para conocerlas y controlarlas. No mostrar «Grok conectado» a partir de un booleano local que no pruebe conexión.

Fuera del mínimo: auditoría completa de conversaciones, detección infalible de secretos y borrado remoto de datos ya entregados.

### Datos e integración

La configuración, el proceso y el cliente son conceptos distintos. La UI puede saber qué está autorizado sin saber quién lo leyó. Los estados desconocidos deben presentarse como desconocidos.

La previsualización debe respetar límites, paginación y errores del MCP. Los cambios de pack deben afectar la siguiente consulta; los datos precargados en la UI no constituyen evidencia de permisos actuales.

Si se incorpora auditoría futura, comenzar por metadatos mínimos con retención definida, sin registrar notas, payloads, tokens ni argumentos privados.

### Validación y aceptación

Pedir a usuarios que predigan lo que podrá leer un cliente después de guardar el pack, vaciarlo, cerrar la ventana y terminar el servidor. Contrastar sus respuestas con el comportamiento real.

Aceptar si la vista coincide con las respuestas autorizadas, explica que la nota sigue visible con pack vacío y no promete revocación retroactiva. Probar datos sintéticos, piezas ajenas y cambios entre llamadas.

### Riesgos y research pendiente

Riesgos: indicadores falsos de conexión, confundir ocultar con revocar y sobrecargar al usuario de detalles técnicos. Investigar lenguaje de consentimiento, controles de aplicaciones colaborativas y capacidades reales de cada transporte y cliente MCP. Esta propuesta no elimina la revisión de seguridad del servidor.

---

## P06. Exportación, respaldo y portabilidad

<!-- (idea creada, falta verificar contra research y websearch) -->

**Estado:** (idea creada, falta verificar contra research y websearch)

### Problema e hipótesis

Cuanto más útil se vuelve una sede, mayor es el coste de perderla o no poder trasladarla. Una referencia local no funciona automáticamente en otro equipo.

Hipótesis: un formato abierto y una importación revisable aumentan la confianza sin exigir sincronización en la nube. Inspiración a investigar: portabilidad y control local asociados a Obsidian.

### Tres operaciones que no deben confundirse

1. **Exportar una mesa:** estructura y referencias seleccionadas para traslado o entrega.
2. **Respaldar la sede:** copia recuperable del estado completo, potencialmente sensible.
3. **Sincronizar:** reconciliar cambios entre equipos; queda fuera de esta propuesta inicial.

La primera versión resuelve la primera operación. No se publicita como respaldo completo hasta implementar y probar restauración integral.

### Experiencia propuesta

Seleccionar mesas, revisar contenido incluido, exportar y recibir confirmación del archivo generado. Al importar: validar formato, mostrar resumen, resolver conflictos y señalar rutas que requieren reasignación.

Por defecto, importar crea identidades nuevas. Combinar con una mesa existente exige una política explícita y no debe ser una consecuencia implícita de IDs coincidentes.

### Versión mínima y evolución

Mínimo: JSON versionado con estructura, notas y referencias expresamente seleccionadas; sin archivos adjuntos ni credenciales. Después: respaldos con restauración probada y mapeo de rutas más cómodo.

Fuera del mínimo: cuentas, nube, sincronización, resolución distribuida de conflictos y copia automática de repositorios.

### Datos e integración

El importador trata el archivo como entrada no confiable: límites de tamaño, validación de tipos y versión, IDs regenerados cuando corresponda y transacción para evitar importaciones parciales.

Importar nunca abre programas, sigue URLs ni concede acceso MCP. Una ruta inexistente puede requerir reasignación; cualquier cambio al comportamiento actual de validación de piezas debe diseñarse, no saltarse.

Un respaldo SQLite futuro debe utilizar un método consistente mientras la aplicación está abierta. Copiar solo el archivo principal sin contemplar su modo de operación no es una estrategia de respaldo demostrada.

### Validación y aceptación

Exportar e importar en una instalación limpia y comparar el estado lógico esperado. Probar versiones desconocidas, archivos truncados, campos extra, duplicados, rutas rotas y fallos durante la operación.

Aceptar cuando el usuario entiende qué viajó, qué falta y qué no se compartió. Medir recuperación exitosa y trabajo manual requerido, no solo archivos exportados.

### Riesgos y research pendiente

Riesgos: exponer notas o rutas personales, crear falsas expectativas de respaldo y quedar atado a un formato frágil. Investigar formatos abiertos comparables, expectativas de portabilidad y prácticas oficiales de respaldo SQLite. Definir compatibilidad entre versiones antes de comprometer un formato estable.

---

## P07. Mesas compartidas entre personas

<!-- (idea creada, falta verificar contra research y websearch) -->

**Estado:** (idea creada, falta verificar contra research y websearch)

### Problema e hipótesis

Entregar trabajo exige explicar qué importa, qué está pendiente y dónde están los materiales. Una carpeta o una lista de enlaces no siempre transmite ese contexto.

Hipótesis: una instantánea revisada de la mesa reduce preguntas y tiempo de incorporación del destinatario. Inspiración a investigar: organización por contextos de colaboración de Slack, sin reproducir su mensajería.

### Experiencia propuesta

El emisor prepara una entrega con objetivo, resumen, siguiente paso y recursos seleccionados. Revisa exactamente qué sale y genera una instantánea. El destinatario la importa como mesa independiente, adapta referencias locales y confirma qué materiales puede utilizar.

Ejemplos: traspaso de una investigación, incorporación a un proyecto y entrega a un cliente. Compartir con una persona y autorizar un bot siguen siendo operaciones distintas.

### Versión mínima y evolución

Mínimo: entrega asíncrona mediante P06. Sin servidor, cuentas ni permisos de edición compartida. El usuario elige el canal por el que envía el archivo.

Evolución posible: comparaciones entre entregas y actualización manual revisada. La edición simultánea requeriría otro proyecto con identidad, permisos, conflictos, almacenamiento y soporte operativo.

Fuera del mínimo: chat, presencia, notificaciones en tiempo real y sincronización de cambios.

### Datos e integración

La instantánea debe identificar su versión y fecha, distinguir recursos incluidos de referencias pendientes y permitir omitir rutas privadas. No debe conservar IDs que habiliten sobrescritura accidental en el destino.

El pack MCP puede orientar una selección inicial, pero no es automáticamente la política de entrega humana. El emisor debe revisar notas y referencias por separado.

Una copia enviada no puede revocarse técnicamente desde Paravel. Si la revocación posterior es un requisito real, se necesitaría un servicio de acceso controlado y aun así no se podrían borrar copias ya descargadas.

### Validación y aceptación

Pedir a otra persona que continúe una tarea con la instantánea, sin explicación inicial en vivo. Registrar tiempo hasta comenzar, preguntas adicionales, materiales faltantes y enlaces inaccesibles.

Aceptar si la entrega mejora la continuidad y la importación no afecta mesas existentes. Probar receptor sin las mismas aplicaciones ni estructura de carpetas.

### Riesgos y research pendiente

Riesgos: confundir instantánea con espacio sincronizado, exponer información de terceros y esperar que todas las rutas sean portables. Investigar entregas reales, alternativas actuales y si los usuarios necesitan colaboración continua o solo traspasos puntuales. No deducir necesidad de un plan empresarial antes de esas entrevistas.

---

## P08. Asistente de orientación de la sede

<!-- (idea creada, falta verificar contra research y websearch) -->

**Estado:** (idea creada, falta verificar contra research y websearch)

### Problema e hipótesis

El usuario puede recordar su intención sin recordar el nombre del espacio correspondiente. Una consulta como «seguir con la propuesta del cliente» no siempre coincide con un nombre exacto.

Hipótesis: interpretar intenciones mejora algunos recorridos donde P04 no basta. Inspiración a investigar: asistentes contextuales y búsqueda en lenguaje natural; no se presupone que requieran un modelo remoto.

### Experiencia propuesta

1. El usuario describe qué quiere hacer.
2. El asistente propone un número pequeño de mesas con una explicación basada en el mapa permitido.
3. Si la intención es ambigua, pide aclaración.
4. Si no encuentra una mesa adecuada, propone crearla.
5. El usuario elige; ninguna recomendación abre programas ni crea espacios sin confirmación.

El asistente orienta. No investiga, desarrolla ni responde usando el contenido privado de todas las mesas.

### Versión mínima y evolución

Comenzar con el catálogo de P04 y descripciones explícitas de propósito. Comparar búsqueda textual y reglas sencillas antes de integrar un modelo.

Si hace falta IA, probar un adaptador desacoplado del proveedor con límites de coste, timeout, cancelación y alternativa de navegación convencional. No crear un chat omnisciente para justificar la función.

Fuera del mínimo: orquestación entre bots, lectura global de notas, ejecución autónoma, vigilancia de actividad y mezcla automática de packs.

### Datos e integración

Definir el mapa autorizado: nombres, grupos y descripciones específicamente destinadas a orientación. No reutilizar la nota completa como descripción sin revisar su exposición.

Si se envía ese mapa a un proveedor externo, debe existir consentimiento sobre su contenido y destino. Las descripciones son datos no confiables, no instrucciones que puedan ampliar permisos.

Las recomendaciones deben resolverse contra IDs existentes y autorizados. No ejecutar IDs, rutas o acciones inventados por un modelo. Sin una API controlada de orientación, no reutilizar el MCP de mesa como acceso global.

### Validación y aceptación

Preparar un conjunto de intenciones reales con destinos esperados antes de probar el sistema. Comparar P04 y el asistente en aciertos, aclaraciones, latencia, coste y esfuerzo del usuario.

Aceptar si mejora de forma consistente las consultas por intención y mantiene el control humano. Probar ambigüedad, nombres repetidos, mesa inexistente, timeout y falta de red.

### Riesgos y research pendiente

Riesgos: coste sin mejora, recomendaciones convincentes pero incorrectas, exposición del mapa y complejidad innecesaria. Investigar si la dificultad es recordar nombres, mala organización o falta de descripciones; cada causa puede resolverse sin IA. Contrastar capacidades, tratamiento de datos y precios de proveedores solo cuando se justifique su uso.

---

## 4. Dependencias y secuencia sugerida

No se propone construir las ocho ideas a la vez.

### Ola A: uso diario y confianza

- Validar P01 mediante un cierre manual y revisar su implicación sobre la nota compartida.
- Prototipar P02 dentro de la aplicación.
- Priorizar P05 si continúa el experimento de conexión con Grok.

### Ola B: repetición y control local

- Diseñar P03 a partir de mesas usadas, no de plantillas imaginadas.
- Implementar P04 cuando exista evidencia de fricción de navegación.
- Definir P06 y probar un ciclo completo de exportación/importación.

### Ola C: entrega y orientación

- Probar P07 sobre el formato ya validado de P06.
- Comparar P08 contra P04; cancelar la integración de IA si no aporta una mejora.

Dependencias orientativas:

```text
P01 ── aporta estructura ──→ P03
P02 ── aumenta catálogo ──→ evaluar necesidad de P04
P05 ── revisión de datos ──→ P06 / P07
P06 ── formato portable ──→ P07
P04 ── línea base ────────→ P08
```

## 5. Plan de research y websearch pendiente

Para cada idea se preparará una ficha de evidencia separando lo observado de lo inferido:

1. Entrevistar usuarios con tareas concretas y recoger alternativas actuales.
2. Consultar documentación oficial vigente de los productos de referencia.
3. Registrar fecha, fuente, función comprobada y limitaciones; no usar mensajes comerciales como prueba de impacto.
4. Revisar competidores directos y sustitutos: carpetas, marcadores, notas, gestores de tareas y hábitos manuales.
5. Contrastar viabilidad técnica con la codebase actual y las APIs oficiales implicadas.
6. Probar un prototipo con datos sintéticos cuando haya exposición o importación.
7. Documentar resultado, contradicciones y decisión de continuar, iterar o descartar.

**No realizado en este documento:** entrevistas, navegación de productos, websearch, evaluación de precios, investigación de mercado o estimaciones de demanda. Los comentarios de investigación pendiente permanecen incluso cuando una propuesta parezca completa.

## 6. Medición y reglas de decisión

| Idea | Señal principal | Contramétrica: qué no empeorar |
| --- | --- | --- |
| P01 | Tiempo hasta retomar una acción útil | Tiempo dedicado a mantener cierres |
| P02 | Capturas útiles recuperadas posteriormente | Recursos acumulados sin uso y destinos erróneos |
| P03 | Tiempo hasta crear una mesa útil | Campos sobrantes y confusión |
| P04 | Tiempo y acierto al encontrar un recurso | Latencia y acciones accidentales |
| P05 | Comprensión correcta del acceso efectivo | Falsa confianza en conexión o revocación |
| P06 | Recuperación fiel del estado previsto | Datos sensibles exportados por error |
| P07 | Tiempo del receptor hasta continuar | Preguntas adicionales y recursos inaccesibles |
| P08 | Mejora frente a búsqueda convencional | Coste, latencia y recomendaciones incorrectas |

Antes de cada experimento se fijan participantes, tareas, línea base, duración y criterio de decisión. No se cambian umbrales después de conocer el resultado para presentar la prueba como exitosa. La medición inicial puede ser manual y local; no requiere introducir telemetría por defecto.

## 7. Condiciones para autorizar implementación

Cada propuesta pasa por estas puertas:

- **Investigación:** problema y referencias contrastados.
- **Alcance:** versión mínima, exclusiones y dependencias aprobadas.
- **Datos:** campos, persistencia, migraciones, eliminación y exposición revisados.
- **Interacción:** recorrido y estados de error probados con un prototipo.
- **Técnica:** estimación basada en el código vigente, no solo en este documento.
- **Aceptación:** pruebas funcionales, permisos y criterios de valor definidos.

Para cada entrega deben conservarse los recorridos actuales de selección e Iniciar, la persistencia y el aislamiento del MCP. Si una función cambia deliberadamente alguno, necesita una decisión explícita y actualización del contrato, no una ampliación accidental.

## 8. Registro de aprobación

| Propuesta | Desarrollo conceptual | Research/websearch | Implementación |
| --- | --- | --- | --- |
| P01 | Solicitado por el usuario; documentado | Pendiente | No autorizada por este documento |
| P02 | Solicitado por el usuario; documentado | Pendiente | No autorizada por este documento |
| P03 | Solicitado por el usuario; documentado | Pendiente | Entregada al alcance técnico 2026-09-16; piloto humano P03.8 pendiente |
| P04 | Solicitado por el usuario; documentado | Pendiente | Entregada al alcance técnico 2026-09-17; piloto humano P04.7/G4 pendiente |
| P05 | Solicitado por el usuario; documentado | Pendiente | No autorizada por este documento |
| P06 | Solicitado por el usuario; documentado | Pendiente | No autorizada por este documento |
| P07 | Solicitado por el usuario; documentado | Pendiente | No autorizada por este documento |
| P08 | Solicitado por el usuario; documentado | Pendiente | No autorizada por este documento |

La siguiente decisión es qué ideas investigar primero. El resultado de research puede modificar, fusionar o retirar propuestas sin que ello invalide esta fase de exploración.
