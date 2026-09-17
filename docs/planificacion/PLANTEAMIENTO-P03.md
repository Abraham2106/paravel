# Planteamiento P03 — Plantillas de espacios

Fecha: 2026-09-16.
Estado: **P03.3–P03.7 y P03.9 entregados al alcance técnico; P03.1 research y P03.8 piloto humano pendientes**.
Origen: [P03 — Plantillas de espacios](../producto/PROPUESTAS-EXPANSION.md#p03-plantillas-de-espacios).
Marco: [Modelo](../arquitectura/MODELO.md#p03--contrato-aditivo-de-plantillas-de-espacios), [Capas](../arquitectura/CAPAS.md), [P01](./WBS-P01-CONTINUIDAD.md).

> Idea desarrollada conceptualmente; falta contrastar con research, websearch y uso real. Las secciones 1–13 conservan el contrato propuesto. La implementación y sus reconciliaciones están en la sección 14 y en el [anexo P03 del modelo](../arquitectura/MODELO.md#p03--contrato-aditivo-de-plantillas-de-espacios).

## 1. Resultado que se busca

Permitir crear una mesa con una estructura inicial pequeña, comprensible y editable, sin repetir su preparación desde cero y sin tener que inventar recursos para llenar una pantalla vacía.

**Promesa:** «Elige cómo vas a trabajar, añade lo que ya tienes y completa lo demás cuando lo necesites».

La plantilla orienta la preparación. No ejecuta trabajo, no impone una metodología y no mantiene sincronizadas las mesas creadas a partir de ella.

Una mesa útil tiene nombre y destino correctos, una intención comprensible y al menos un recurso real relevante para la tarea. Se puede crear antes de alcanzar ese estado: una mesa incompleta es válida, pero no se contabiliza automáticamente como éxito de producto.

### Problemas concretos

- Repetir las mismas decisiones al iniciar proyectos similares.
- No saber qué incorporar a una mesa vacía.
- Confundir referencias que todavía faltan con recursos disponibles.
- Arrastrar información o permisos de otro proyecto al reutilizarlo.

### No confundir tres operaciones

| Operación | Significado | P03 inicial |
| --- | --- | --- |
| Usar una plantilla | Materializar una estructura incluida en la app con datos nuevos | Incluido |
| Duplicar una mesa | Copiar contenido y referencias de un espacio existente | Excluido |
| Guardar como plantilla | Extraer una estructura reutilizable de una mesa propia | Evolución posterior |

## 2. Base conocida y límites de esta propuesta

La documentación consultada describe SQLite local con `grupo`, `espacio`, `pieza` y `pack_pieza`; P01 incorpora `cierre` por separado. `marcada` controla Iniciar, no autorización MCP. Los cierres no son propiedades globales del proyecto y no deben convertirse en contenido inicial ficticio.

Fuentes de decisiones existentes:

- `docs/producto/PROPUESTAS-EXPANSION.md:174`: elección, nombre, grupo, revisión e independencia de la instancia.
- `docs/producto/PROPUESTAS-EXPANSION.md:184`: sugerencias visibles, no rutas ficticias.
- `docs/producto/PROPUESTAS-EXPANSION.md:192`: formato versionado, nuevos IDs, validación y creación atómica.
- `docs/arquitectura/MODELO.md:33`: piezas reales y selección de Iniciar.
- `docs/arquitectura/MODELO.md:94`: almacenamiento separado de continuidad P01.
- `docs/arquitectura/CAPAS.md:18`: frontend de presentación, host responsable de validación y operaciones nativas.

**Nivel de verificación:** este planteamiento se basa en esos documentos. No se han inspeccionado las implementaciones completas de los comandos ni ejecutado pruebas en esta tarea. Los puntos de integración y nombres nuevos son propuestos; hay que reconciliarlos con el código vigente antes de programar, especialmente si P02 avanza en paralelo.

## 3. Alcance recomendado

### Incluido en el MVP

1. Tres plantillas incluidas: Desarrollo, Investigación y Cliente.
2. Mantener «Espacio vacío» como alternativa de primera clase.
3. Nombre y grupo de destino obligatorios; resto opcional.
4. Vista previa de lo que se guardará, lo que falta y lo que no se comparte.
5. Incorporación opcional de recursos reales compatibles con los tipos actuales.
6. Guía inicial persistente, separada de piezas, nota y cierres.
7. Completar u omitir sugerencias después de crear la mesa.
8. Creación transaccional, reintentos controlados e independencia entre instancias.
9. Funcionamiento local sin IA, red, cuentas ni nuevas capacidades de lanzamiento.
10. Pruebas de persistencia, aislamiento y regresión de los recorridos existentes.

### Fuera del MVP

- Editor de plantillas, plantillas personales y duplicación de mesas.
- Marketplace, importación de JSON externo y paquetes de terceros.
- Variables ejecutables, scripts, condiciones, macros o interpolación de comandos.
- Exportación, colaboración y sincronización.
- Actualizar mesas existentes cuando cambie el catálogo.
- Crear repositorios, carpetas, archivos, cuentas o documentos externos.
- Inventar URLs, detectar automáticamente recursos o leer su contenido.
- Nuevas herramientas MCP o configuración automática de clientes.
- Crear grupos dentro del asistente: se reutiliza la gestión actual antes de empezar.
- Convertir la guía en gestor de tareas, cronograma o historial de sesiones.

## 4. Catálogo inicial propuesto

Son candidatas tomadas de la propuesta P03, no patrones validados con usuarios. Cada una incluye como máximo dos textos opcionales y dos sugerencias de recursos.

| Plantilla | Textos iniciales opcionales | Sugerencias de recursos | Qué no presume |
| --- | --- | --- | --- |
| Desarrollo | Objetivo; primer paso | Repositorio/carpeta de trabajo; referencia funcional | No presupone proveedor Git, editor instalado ni URL del repositorio |
| Investigación | Pregunta de investigación; enfoque inicial | Fuentes; material de trabajo | No genera fuentes ni afirma que exista una síntesis |
| Cliente | Resultado esperado; próxima entrega | Materiales; referencia de la entrega | No inventa cliente, fecha, contrato ni acceso a documentos |

### Correspondencia con tipos existentes

- Repositorio/carpeta: elegir `vscode`, `cursor` o `folder` y seleccionar una carpeta real. El usuario decide con qué tipo incorporarla.
- Referencia funcional: `firefox` para enlaces web o `file` para un documento local.
- Fuentes: `firefox` o `firefox-group`, respetando el contrato distinto de ambos tipos.
- Material de trabajo/materiales: `folder` o `file`.
- Referencia de entrega: `firefox` o `file`.

Los tipos admitidos por cada sugerencia son una restricción del catálogo, no un nuevo adaptador. La allowlist y los validadores del host siguen siendo autoritativos.

### Reglas de contenido

- Los textos guía se muestran como ayuda o placeholder, no se guardan como si los hubiera escrito el usuario.
- Todos los recursos son opcionales al crear. Un recurso empezado pero inválido debe corregirse o retirarse explícitamente.
- Una sugerencia vacía no genera una fila en `pieza`.
- No se crean cierres P01. Crear un proyecto no equivale a registrar un avance.
- La nota compartible queda vacía en este recorrido. Los textos iniciales se guardan en la preparación privada respecto de MCP.
- Los recursos elegidos se guardan como referencias, no se copian ni se abren.

## 5. Experiencia funcional

### 5.1 Entrada

Desde la acción actual de crear espacio, ofrecer «Vacío» y «Desde plantilla». El destino puede venir preseleccionado del grupo actual, pero debe permanecer visible y editable antes de confirmar.

Si no existen grupos, explicar el requisito y dirigir a la creación existente. No inventar un grupo ni guardar en otro por defecto.

### 5.2 Elegir

Mostrar las tres opciones con nombre, propósito y recursos sugeridos. Evitar galería remota, buscador y categorías para un catálogo tan pequeño.

Cambiar de plantilla con campos modificados requiere confirmar qué se descartará. No trasladar silenciosamente una pregunta de investigación al objetivo de un cliente.

### 5.3 Preparar

Pedir nombre y grupo, mostrar los dos textos opcionales y permitir añadir los dos recursos sugeridos. Usar los pickers y los formularios de tipos actuales; no introducir un input de shell ni asumir que una URL Git representa una carpeta local.

El asistente mantiene el borrador en memoria. Volver al paso anterior conserva los datos; cancelar con cambios solicita confirmación. No se promete recuperar el borrador después de una caída o recarga.

### 5.4 Revisar

La vista previa presenta:

- Nombre y grupo exactos de destino.
- Textos iniciales que se guardarán.
- Recursos válidos preparados, con tipo y destino visibles.
- Sugerencias pendientes u omitidas.
- «No se abrirán aplicaciones ni archivos».
- «No se configurará MCP ni se añadirán piezas al pack».
- «La preparación inicial queda fuera del contexto MCP. Esto no cifra los datos locales».

Botón principal: **Crear espacio**. No usar «Crear e iniciar» en esta versión.

### 5.5 Crear

Bloquear envíos simultáneos, conservar la intención de creación y esperar confirmación del backend. Tras éxito, entrar en la nueva mesa y refrescar su grupo.

Si el guardado fue confirmado pero falla la recarga, mostrar «Espacio creado; no se pudo actualizar la vista» y permitir abrirlo o refrescar. No repetir una creación como si la escritura hubiera fallado.

### 5.6 Completar después

Dentro de la mesa aparece una sección compacta «Preparación inicial», separada de Continuidad:

- Los textos iniciales pueden editarse explícitamente.
- Una sugerencia pendiente ofrece «Añadir recurso» y «Omitir».
- Añadir reutiliza el formulario del tipo elegido, pero la creación de la pieza y la resolución de la sugerencia se confirman juntas en backend.
- Omitir solo cambia esa sugerencia; no borra piezas.
- Las sugerencias completadas identifican la pieza asociada.
- Si se elimina esa pieza, la sugerencia vuelve a pendiente. No se recrea el recurso.
- El usuario puede ocultar la sección y volver a mostrarla; ocultar no elimina datos.

No bloquear Iniciar ni el resto de la mesa porque falten sugerencias. No mostrar puntuación de productividad ni exigir completar todos los campos.

### Estados y errores obligatorios

| Estado | Respuesta de producto |
| --- | --- |
| Catálogo no disponible | Reintentar o crear espacio vacío |
| Plantilla/revisión incompatible | Rechazar antes de escribir; conservar borrador para revisión |
| Grupo eliminado mientras se prepara | Pedir nuevo destino; no elegir otro automáticamente |
| Ruta cancelada en picker | No crear recurso ni tratar la cancelación como error |
| Ruta o URL inválida | Error junto al recurso; opción de corregir o retirarlo |
| Archivo desaparece tras previsualizar | Revalidar al crear; operación completa rechazada si ya no cumple |
| DB ocupada o escritura fallida | Sin éxito falso ni mesa parcial; conservar borrador |
| Resultado incierto | Reconciliar con la misma intención; no generar IDs nuevos automáticamente |
| Respuesta tardía | No navegar ni pintar resultados en un flujo distinto |
| Conflicto de revisión | Conservar edición local y ofrecer revisar el estado vigente |
| Borrador modificado al salir | Cancelar mantiene el borrador; confirmar lo descarta |

## 6. Modelo de datos propuesto

### 6.1 Catálogo incluido y versionado

**No añadir una tabla de catálogo `plantilla` al MVP.** Las tres definiciones se empaquetan con la aplicación y el backend entrega su representación tipada a la UI. Una tabla editable anticiparía gestión de plantillas que no está incluida.

Cada definición contiene:

| Campo | Función |
| --- | --- |
| `schemaVersion` | Versión del formato, inicialmente 1 |
| `templateId` | Clave estable, por ejemplo `development`, `research`, `client` |
| `revision` | Revisión positiva de esa definición |
| `name`, `description` | Presentación |
| `fields` | Claves, etiquetas y ayudas de hasta dos textos opcionales |
| `slots` | Hasta dos sugerencias, con clave, etiqueta y tipos admitidos |

El formato es declarativo: no contiene scripts, permisos, IDs de espacios, rutas personales ni URLs preseleccionadas. El frontend envía referencia de plantilla y valores, no una definición arbitraria que el host ejecute o confíe.

Cambiar una definición exige nueva revisión. `schemaVersion` y `revision` tienen significados distintos: compatibilidad del formato frente a cambios del contenido.

### 6.2 Tabla nueva `espacio_preparacion`

Relación 1:0..1 con `espacio`. Las mesas previas y las creadas vacías no necesitan fila.

| Columna | Tipo / regla propuesta |
| --- | --- |
| `espacio_id` | TEXT PRIMARY KEY; FK a `espacio`, `ON DELETE CASCADE` |
| `creation_request_id` | TEXT NOT NULL UNIQUE; UUID de intención de creación |
| `creation_fingerprint` | TEXT NOT NULL; digest del comando normalizado y versionado, solo para reconciliar reintentos |
| `template_id` | TEXT NOT NULL; origen informativo, no FK a catálogo mutable |
| `template_revision` | INTEGER NOT NULL, positivo |
| `schema_version` | INTEGER NOT NULL, inicialmente 1 |
| `definition_snapshot` | TEXT NOT NULL; JSON validado de etiquetas, ayudas y estructura materializadas |
| `field_values` | TEXT NOT NULL; JSON validado con valores de las claves permitidas |
| `oculta` | INTEGER NOT NULL DEFAULT 0; restringido a 0 o 1 |
| `revision` | INTEGER NOT NULL DEFAULT 1, positivo; CAS para editar preparación |
| `creado_en`, `editado_en` | TEXT NOT NULL; seguir el contrato temporal vigente de entidades base tras verificarlo en código |

El snapshot impide que actualizar o retirar una plantilla cambie la interpretación de mesas existentes. No guardar una segunda copia de payloads de piezas en esta tabla.

El fingerprint no se publica ni registra. No es cifrado, permiso ni prueba de integridad frente a programas locales. Su serialización canónica y algoritmo deben quedar fijados y probados al implementar; comprobar primero las dependencias disponibles.

### 6.3 Tabla nueva `preparacion_sugerencia`

Relación preparación 1:N sugerencias materializadas.

| Columna | Tipo / regla propuesta |
| --- | --- |
| `id` | TEXT PRIMARY KEY; UUID nuevo del backend |
| `espacio_id` | TEXT NOT NULL; FK a `espacio_preparacion(espacio_id)`, `ON DELETE CASCADE` |
| `slot_key` | TEXT NOT NULL; clave presente en el snapshot |
| `orden` | INTEGER NOT NULL, no negativo |
| `omitida` | INTEGER NOT NULL DEFAULT 0; restringido a 0 o 1 |
| `pieza_id` | TEXT NULL; FK a `pieza(id)`, `ON DELETE SET NULL` |
| `revision` | INTEGER NOT NULL DEFAULT 1, positivo; CAS para mutaciones explícitas |

Restricciones adicionales: `UNIQUE(espacio_id, slot_key)` y no permitir `omitida = 1` con `pieza_id` informado. Indexar `pieza_id` para la acción de la FK; el índice compuesto único cubre consultas por espacio.

Estado derivado:

- `pieza_id` informado → completada.
- Sin pieza y `omitida = 1` → omitida.
- Sin pieza y `omitida = 0` → pendiente.

No guardar además una columna de estado que pueda contradecir esos datos.

La FK a `pieza` no demuestra que pertenezca a la misma mesa. Cada operación debe comprobarlo dentro de la transacción; nunca aceptar un vínculo a una pieza ajena. P03 inicial crea la pieza al completar la sugerencia, sin ofrecer un selector global de piezas existentes.

Al eliminar una pieza, la FK limpia la referencia. Como este cambio puede ocurrir fuera de los comandos P03, las mutaciones deben verificar tanto revisión como estado actual dentro de la transacción; no asumir que CAS por sí solo detecta todo cambio producido por una FK.

### 6.4 Invariantes de materialización

- Nuevos UUID para espacio, piezas y sugerencias, generados por backend.
- `bot_activo = 0`, pack vacío y ninguna configuración de cliente copiada.
- Recomendación P03: las piezas iniciales nacen con `marcada = 0`; Iniciar exige selección posterior. Es una diferencia deliberada frente al DEFAULT 1 documentado y requiere aprobación explícita. No cambiar el default global de `add_piece`.
- Nota vacía; cero cierres sintéticos; textos iniciales solo en preparación.
- Orden de sugerencias y piezas determinista según catálogo y selección revisada.
- Instancias independientes aunque usen la misma plantilla/revisión.
- Sin migrar ni reinterpretar notas o cierres existentes.

### 6.5 Límites iniciales recomendados

- Nombre: no vacío tras trim; máximo propuesto 120 valores escalares Unicode. Reconciliar con la política vigente de nombres antes de cerrar el contrato.
- Hasta dos campos de preparación y dos sugerencias por plantilla inicial.
- Hasta 1000 valores escalares Unicode por texto; hasta 16 KiB UTF-8 para los valores recibidos antes de normalizar.
- Hasta una pieza por sugerencia en este flujo. Un grupo Firefox puede contener varias URLs dentro de los límites ya vigentes de ese tipo.
- Envelope de creación acotado, propuesta inicial 128 KiB UTF-8; verificar compatibilidad con límites reales de payloads antes de fijarlo.
- Rechazar claves desconocidas, versiones incompatibles y tamaños excesivos; nunca truncar silenciosamente.

Los límites son decisiones propuestas de ingeniería, no resultados de investigación. Las pruebas deben cubrir frontera exacta, exceso y Unicode multibyte.

## 7. API local propuesta

Comandos Tauri propios del host; ninguno se registra como herramienta MCP. Los nombres siguientes son nuevos y deben contrastarse con el registro existente.

| Comando | Entrada principal | Resultado / responsabilidad |
| --- | --- | --- |
| `list_space_templates` | Sin datos personales | Catálogo tipado compatible |
| `preview_space_template` | Referencia de plantilla, destino, textos y recursos opcionales | Plan normalizado, errores por campo y resumen; no escribe ni reserva IDs |
| `create_space_from_template` | `requestId`, plantilla/revisión, grupo, nombre, textos, recursos y omisiones | Espacio creado y preparación confirmada, o rechazo sin altas parciales |
| `get_space_preparation` | `spaceId` | Preparación con sugerencias y revisiones, o ausencia explícita |
| `update_space_preparation` | `spaceId`, `expectedRevision`, textos y visibilidad | Edición CAS, sin cambiar nota, cierres ni catálogo |
| `resolve_preparation_slot` | `spaceId`, `slotId`, revisión esperada; añadir recurso u omitir | Alta de pieza y vínculo atómicos, o solo omisión |

`preview_space_template` es útil para que UI y backend no mantengan dos interpretaciones independientes. No convierte un path previamente válido en autorización permanente: `create_space_from_template` repite validación.

### Creación atómica

1. Validar envelope, referencia de catálogo y claves admitidas.
2. Normalizar texto y payloads con las reglas autoritativas del host.
3. Resolver primero si existe una creación con ese `requestId`.
4. En una transacción escritora, revalidar destino y ausencia de conflicto de intención.
5. Insertar espacio, snapshot, sugerencias y solo piezas realmente aportadas.
6. Asociar cada pieza a su sugerencia, sin escribir pack ni cierres.
7. Confirmar y devolver identidad persistida.

El mismo constructor de plan y validador alimenta preview y creación. No implementar una secuencia de `invoke(create_space)` seguida de varios `invoke(add_piece)`: podría dejar mesas parciales.

La validación del sistema de archivos no puede ser atómica con SQLite. Validar antes de guardar y conservar la revalidación habitual al lanzar; no prometer que un archivo no desaparecerá entre ambos momentos. La transacción cubre el estado de Paravel, no el estado futuro del disco.

### Idempotencia y respuestas inciertas

- Generar `requestId` una vez por intención en la UI, usando una API disponible en el host actual.
- Conservar el payload enviado durante el envío y un resultado incierto.
- Mismo ID y mismo comando normalizado: devolver la identidad existente sin recrear piezas, modificar fechas ni restaurar contenido anterior.
- Mismo ID con comando diferente: conflicto, nunca sobrescritura.
- No comparar el reintento contra los campos actuales editables: usar el fingerprint inmutable de creación.
- Buscar una creación ya confirmada antes de rechazar porque su plantilla haya sido retirada o una ruta deje de existir; la repetición devuelve un resultado, no vuelve a materializar recursos.
- Comprobar otra vez dentro de la transacción para carreras entre solicitudes iguales.
- Eliminar la mesa elimina también su recibo de creación. No se promete idempotencia eterna después del borrado ni recuperación del borrador tras reinicio.
- Tras reiniciar sin borrador, consultar el listado de mesas para localizar una creación confirmada, no reenviar automáticamente.

Para `resolve_preparation_slot`, mientras la sugerencia ya esté vinculada a la pieza resultante, un reintento equivalente devuelve ese vínculo sin crear otra pieza. Estado o contenido distinto produce conflicto. Tras eliminación posterior de la pieza no se promete replay eterno; exigir recarga/revisión explícita antes de una nueva alta.

### Errores tipados mínimos

`TEMPLATE_NOT_FOUND`, `TEMPLATE_VERSION_UNSUPPORTED`, `GROUP_NOT_FOUND`, `INVALID_FIELD`, `INVALID_PIECE`, `REQUEST_CONFLICT`, `REVISION_CONFLICT`, `SLOT_STATE_CONFLICT`, `DB_BUSY`, `STORAGE_ERROR`.

La UI debe distinguir error validado, conflicto, escritura confirmada y resultado desconocido. Los errores públicos no contienen SQL, notas, payloads completos ni datos de otras mesas.

## 8. Arquitectura e integración

### Backend

- Módulo propuesto `app/src-tauri/src/templates.rs`: catálogo, DTOs, construcción del plan y servicio transaccional.
- `app/src-tauri/src/db.rs`: integración de migración, FK e índices, siguiendo el mecanismo real que se encuentre.
- `app/src-tauri/src/lib.rs`: registro de comandos y reutilización/extracción mínima de los validadores de piezas existentes.
- Reutilizar helpers de inserción que admitan la transacción activa; no llamar comandos públicos que abran conexiones independientes dentro de la materialización.
- Mantener los adaptadores de lanzamiento fuera del servicio de plantillas.

### Frontend

- `app/src/Workspace.tsx`: punto de entrada, navegación tras éxito y presentación de preparación en la mesa.
- Componentes propuestos separados para asistente y preparación, en lugar de concentrar todo el estado en Workspace.
- DTOs y cliente tipado de invokes en un módulo de plantillas.
- Reutilizar formularios/pickers existentes y verificar su capacidad de operar en modo borrador, sin guardar inmediatamente.
- Separar selección de plantilla, datos editables, plan validado y estado de envío; cualquier edición invalida el preview anterior.
- Invalidar respuestas tardías por identidad del flujo y solicitud, no solo por un booleano global de carga.
- Comprobar librerías actuales antes de elegir validación, formularios, modales o manejo de estado. No añadir un framework por anticipación.

### Relación con P01 y P02

P01 aporta vocabulario de objetivo y siguiente acción, no una dependencia técnica para crear cierres. La preparación describe cómo empezar; el cierre describe lo que ocurrió al trabajar. No sincronizar ambos automáticamente.

P02 puede compartir validación y formularios de recursos. No depender de su UI ni copiar su política de resultados parciales: P03 requiere creación completa o ningún espacio nuevo. Si ambos se desarrollan a la vez, acordar propiedad de `db.rs`, `lib.rs`, Workspace y los helpers comunes antes de editar.

### MCP y privacidad

No cambiar DTOs ni herramientas de contexto para incluir preparación o catálogo. Usar comandos locales separados para leer la guía y probar que los lectores actuales no la incorporen indirectamente.

Pack vacío impide compartir piezas según el contrato existente; `bot_activo = 0` no es autenticación ni desconexión. Si más adelante alguien configura un cliente para ese espacio, la nota sigue su política actual. P03 no añade una conexión ni promete ocultar metadatos que el contrato existente ya expone.

Privado en este documento significa excluido de MCP y de packs generados automáticamente, no cifrado ni inaccesible para procesos con permisos de la cuenta local.

## 9. Migración, compatibilidad y retirada

1. Añadir las dos tablas e índices sin reconstruir tablas existentes.
2. Ejecutar la migración P03 de forma transaccional e idempotente.
3. Confirmar `foreign_keys` activas en todas las conexiones escritoras relevantes.
4. Probar base nueva, base previa con P01, reapertura y fallo intermedio.
5. No crear filas de preparación para mesas antiguas.
6. Verificar que los lectores MCP toleran las tablas aditivas y mantienen el mismo alcance.
7. Cambiar una plantilla solo afecta nuevas creaciones; las mesas existentes leen su snapshot.
8. Desactivar el asistente no borra mesas ni recursos. Ocultar la guía tampoco borra datos.
9. No recomendar downgrade hasta probar compatibilidad con una copia aislada; nunca eliminar tablas como retirada automática.

No se incorpora un sistema de backup bajo P03. Cualquier prueba sobre datos personales necesita copia consistente y autorización; la aceptación automatizada usa fixtures sintéticas.

## 10. Desglose de trabajo y puertas

| WP | Entregable | Dependencia | Criterio de salida |
| --- | --- | --- | --- |
| P03.1 | Inventario consentido de estructuras reales y revisión del catálogo | Desarrollo conceptual | Justificación de cada texto/sugerencia y registro de supuestos |
| P03.2 | Contrato cerrado: alcance, privacidad, esquema, estados y comandos | P03.1 o excepción expresa del usuario | Decisiones aprobadas y reconciliadas con código vigente |
| P03.3 | Prototipo funcional del recorrido, sin escritura personal | P03.2 | Elegir, preparar, revisar, cancelar y corregir comprensibles |
| P03.4 | Catálogo tipado y plan de materialización | P03.2 | Preview y creación usan una sola interpretación validada |
| P03.5 | Migración y servicio transaccional | P03.4 | Atomicidad, reintentos, CAS y cascadas probados |
| P03.6 | Asistente y preparación integrados | P03.3–P03.5 | Flujo completo sin alta parcial ni lanzamiento implícito |
| P03.7 | Regresión automatizada y recorrido nativo | P03.6 | Matriz técnica con evidencia y brechas explícitas |
| P03.8 | Piloto comparativo y decisión de valor | P03.7, consentimiento y línea base | Continuar, iterar o retirar según protocolo previo |
| P03.9 | Documentación final y entrega | Resultados anteriores | Estado real, contratos y limitaciones actualizados |

Puertas propuestas:

- **G1 — Alcance aprobado:** decisiones de la sección 13 resueltas. Este documento no la da por satisfecha.
- **G2 — Candidato técnico:** pruebas críticas de datos, privacidad e Iniciar aprobadas y recorrido nativo registrado.
- **G3 — Valor aceptado:** usuarios crean mesas útiles con menos esfuerzo sin sobrecarga de estructura.

Después de cerrar el contrato, prototipo/UI y backend pueden avanzar en paralelo con DTOs acordados y archivos compartidos coordinados. No extrapolar la excepción de implementación de P01 a P03.

### Estimación relativa

El catálogo es pequeño; el coste principal está en materialización atómica, reintentos y guía persistente. Frente a un asistente efímero sin seguimiento, las dos tablas y su integración elevan la complejidad inicial a **media**. No se compromete calendario sin revisar los helpers y formularios vigentes.

Si hay que reducir alcance, recortar edición de guía o seguimiento posterior mediante una nueva decisión explícita. No recortar validación, atomicidad, independencia ni aislamiento MCP.

## 11. Matriz mínima de aceptación

| ID | Caso | Resultado exigido |
| --- | --- | --- |
| A01 | Crear con cada plantilla y solo campos obligatorios | Mesa válida, guía persistida, cero piezas ficticias |
| A02 | Crear con recursos reales y reiniciar | Nombre, grupo, textos, orden y piezas conservados |
| A03 | Crear dos veces la misma plantilla con intenciones distintas | IDs distintos e instancias independientes |
| A04 | Editar una instancia o actualizar el catálogo | Ningún cambio en otras instancias; snapshot previo conservado |
| A05 | Versión, clave o tipo desconocido | Rechazo antes de crear el espacio |
| A06 | Grupo inexistente o eliminado durante el flujo | Sin mesa en destino alternativo ni filas huérfanas |
| A07 | Una pieza inválida entre otras válidas | Ninguna alta de esa creación; errores por elemento |
| A08 | Fallo tras insertar espacio y antes de terminar piezas | Rollback de espacio, preparación, sugerencias y piezas |
| A09 | Doble clic y reintentos concurrentes con mismo ID/payload | Una mesa y un conjunto de piezas |
| A10 | Mismo ID con otro payload | Conflicto sin sobrescribir ni revelar contenido |
| A11 | Commit exitoso y respuesta perdida | Repetición recupera identidad sin duplicar |
| A12 | Commit exitoso y fallo al refrescar UI | Se informa creación confirmada; no nueva creación |
| A13 | Completar sugerencia | Una pieza real y un vínculo en la misma transacción |
| A14 | Reintentar resolución ya confirmada | Sin segunda pieza; conflicto si cambió el estado relevante |
| A15 | Omitir sugerencia / ocultar preparación | Sin borrar ni lanzar piezas; estado persistente |
| A16 | Eliminar pieza asociada | Sugerencia pendiente; sin recreación automática |
| A17 | ID de pieza o sugerencia de otra mesa | Rechazo sin lectura/escritura ajena |
| A18 | Ediciones con revisión obsoleta | No sobrescritura; borrador conservado para revisión |
| A19 | Borrar espacio o grupo en fixture | Cascadas correctas; otras mesas intactas |
| A20 | DB nueva, previa con P01 y reapertura | Migración aditiva; datos previos intactos |
| A21 | Consultas MCP antes/después con textos centinela privados | Preparación ausente; nota y pack conservan contrato |
| A22 | Crear, previsualizar, completar u omitir | Cero invocaciones de lanzamiento; cero conexiones nuevas |
| A23 | Iniciar después de selección explícita | Solo piezas marcadas, mismo validador/adaptador y log habitual |
| A24 | Cancelar picker o asistente, retroceder y cambiar plantilla | Sin escrituras; conservación/descarte conforme al flujo |
| A25 | Navegar durante respuesta tardía | No mostrar otra mesa ni abandonar un flujo nuevo |
| A26 | Límites exactos/excedidos y Unicode | UI y backend coherentes; sin truncado |
| A27 | Teclado, foco, lector de pantalla y zoom | Etiquetas, errores y recorrido utilizables sin ratón |
| A28 | Cerrar ventana con borrador modificado | Cancelar conserva ventana y borrador; probar evento nativo, no solo modal |
| A29 | Crear espacio vacío | Recorrido anterior intacto, sin preparación forzada |
| A30 | Nota, pack, selección y cierres existentes | Sin modificaciones colaterales por P03 |

### Estrategia de pruebas

- Unitarias Rust: catálogo, versiones, construcción del plan, límites y errores.
- Integración SQLite: migración, rollback, concurrencia, cascadas y reintentos.
- UI: estados del asistente, borradores, errores, invalidación del preview y respuestas tardías.
- Tauri/WebView2 real: pickers, creación, reapertura, completar sugerencias y cierre nativo.
- Contexto/MCP: exposición negativa con valores centinela y regresión de selección.
- Lanzamiento: verificar ausencia de efectos en P03 y funcionamiento separado de Iniciar explícito.

Comandos existentes documentados que se deben confirmar al implementar: `npm run build` en `app` —incluye TypeScript según P01—, `cargo test --lib` y `cargo clippy --lib -- -D warnings` en `app/src-tauri`, y `cargo test` en los crates de contexto y MCP. Descubrir las pruebas frontend vigentes; no inventar un script `npm run lint` que la documentación indica que no existe.

Añadir suites específicas P03 y registrar sus comandos reales, versión de app, fixture, salida y resultado. No declarar PASS por escribir esta matriz. No ejecutar harnesses nativos concurrentes si comparten el puerto de depuración fijo documentado para P01.

## 12. Validación de producto

### Research pendiente

Observar mesas usadas con consentimiento, no inspeccionar datos personales automáticamente. Preguntar:

- ¿Qué preparación se repite y qué parte cambia siempre?
- ¿Conviene una plantilla o bastaría con crear una mesa vacía más rápido?
- ¿Se entienden los recursos pendientes sin confundirlos con piezas disponibles?
- ¿Los textos iniciales aportan orientación o duplican notas/gestores externos?
- ¿La sección de preparación sigue siendo útil después del primer día?

La referencia a Notion sigue siendo una analogía por contrastar. No se realizó websearch ni se atribuyen resultados de productividad a otro producto.

### Protocolo exploratorio propuesto

1. Acordar entre tres y cinco participantes o, si solo hay un usuario, declarar estudio individual sin generalización.
2. Preparar tareas equivalentes de creación con recursos sintéticos o consentidos.
3. Observar la creación actual sin plantilla y medir el tiempo hasta la mesa útil definida en la sección 1.
4. Antes de probar P03, fijar ahorro mínimo esperado, coste aceptable y tolerancia a estructura descartada.
5. Comparar tareas equivalentes con plantillas, alternando el orden cuando sea posible para reducir aprendizaje.
6. Registrar tiempo, ayuda requerida, errores de destino, recursos válidos incorporados, campos/sugerencias omitidos y abandono.
7. Volver a la mesa después para comprobar que permite trabajar; terminar el asistente no demuestra utilidad sostenida.
8. Revisar ejemplos y decidir continuar, ajustar catálogo, simplificar seguimiento o retirar una plantilla.

No usar el número de mesas creadas como única métrica. Omitir una sugerencia puede ser una decisión correcta; preocupa que una plantilla se descarte casi completa de forma repetida o retrase tareas simples.

No incorporar telemetría automática para este piloto. Medición manual local, datos mínimos y resultados separados de inferencias.

## 13. Decisiones que requieren aprobación

| Decisión | Recomendación |
| --- | --- |
| Catálogo | Tres plantillas incluidas, sin editor personal |
| Preparación pendiente | Persistir guía y sugerencias fuera de `pieza` |
| Privacidad de textos | Preparación excluida de MCP; nota vacía en este recorrido |
| Continuidad | No crear cierres P01 ni sincronizar campos |
| Selección inicial | Piezas P03 desmarcadas, sin cambiar el default global |
| Escritura | Creación totalmente atómica, sin modalidad parcial |
| Identidad/reintentos | UUID de intención estable, fingerprint de creación y límites de replay explícitos |
| Evolución del catálogo | Snapshot independiente; sin actualización automática de mesas |
| Campos y límites | Dos textos/dos sugerencias; reconciliar límites con código antes de fijarlos |
| Secuencia | Aprobar alcance antes de implementar; cualquier excepción debe ser expresa |

**Siguiente paso recomendado:** revisar estas decisiones y contrastar el contrato con el código vigente. Después, cerrar P03.2 e implementar una primera sección completa —Desarrollo, creación transaccional y guía persistente— antes de incorporar las otras dos definiciones al mismo mecanismo.

## 14. Estado de esta entrega

### DEC-P03-2026-09-16 — Autorización de código

El usuario autorizó implementar P03 al alcance técnico el 2026-09-16, sin esperar G1 de research ni P03.8. Es una **excepción de secuencia**, igual de explícita que P01: no acredita utilidad ni cierra G3.

Reconciliaciones con el código vigente, distintas de la propuesta original:

- Nombre de espacio/pieza: **80** valores escalares Unicode, el límite de `create_space` / `add_piece`, no 120.
- `preparacion_sugerencia` añade `resolution_fingerprint` y `piece_fingerprint` para replay de resolución; `UNIQUE(espacio_id, orden)`.
- Fingerprint de creación: `sha256-v1:` + SHA-256 hex del comando normalizado, prefijo `paravel-template-command-v1`. Longitud fija 74.
- Piezas P03 con `marcada = 0`, sin cambiar el DEFAULT global.
- Asistente de 4 pasos visibles (Elegir / Preparar / Revisar / Crear); «Espacio vacío» sigue siendo primera clase.

### P03.3–P03.7 entregados

| WP | Entrega |
| --- | --- |
| P03.3–P03.6 | `templates.rs`, `db.rs`, `lib.rs`; `TemplateWizard.tsx`, `PreparationPanel.tsx`, `TemplateResource.tsx`, `templates.ts`, `Templates.css`; integración en `Workspace.tsx` |
| P03.7 | 20 tests Rust; harness nativo `templates-native.test.mjs` (13 escenarios: 7 de contrato embebidos + 6 visibles/reinicio/auditoría); helpers `templates.test.mjs` |
| P03.8 | Pendiente: consentimiento, línea base y decisión humana |
| P03.9 | Este documento + anexo del modelo; guía debajo |

Comandos: `list_space_templates`, `preview_space_template`, `create_space_from_template`, `get_space_preparation`, `update_space_preparation`, `resolve_preparation_slot`. Ninguno es herramienta MCP.

### Evidencia técnica — 2026-09-16

Procedencia de las suites nativas y de regresión: coordinador de la implementación E2E. Esta actualización no relanza el harness Tauri (puerto CDP exclusivo). Verificación propia de esta tarea: `cargo test --lib` **57/57 PASS**, `npm run build` PASS, `node --test scripts/templates.test.mjs` **2/2 PASS**.

| Directorio | Comando | Resultado reportado |
| --- | --- | --- |
| `app` | `node scripts/templates-native.test.mjs` | **13/13 PASS** (wizard, recursos, rollbacks, replay, CAS, reinicio, MCP centinela, auditoría); `launchLogEntries: 0` |
| `app/src-tauri` | `cargo test --lib` | **57/57 PASS** (20 propios de plantillas) |
| `app/src-tauri` | `cargo clippy --lib -- -D warnings` | Limpio |
| `app/crates/paravel-context` | `cargo test` | **17 PASS** |
| `app/crates/paravel-mcp` | `cargo test` | **45 PASS** |
| `app` | `npm run build` | PASS |
| `app` | React Doctor | 59/100, 0 errores nuevos |
| `app` | Regresión templates+continuity+firefox-group+capture (node), continuity-ui, capture-ui, continuity-native, capture-native | PASS |

El native PASS usa fixture sintética. Cero entradas de lanzamiento demuestra ausencia de spawn en ese recorrido, no Iniciar explícito. El harness bloquea lanzamientos por diseño.

### Brechas explícitas

- Sin gestos de picker OS ni arrastre en el harness; los pickers nativos sí se usan en la UI real (`pick_folder` / `pick_file`).
- Sin prueba de Iniciar real en P03; las piezas nacen desmarcadas y el validador/adaptador no cambian.
- Sin respuesta tardía forzada ni auditoría con lector de pantalla.
- A25 (navegar durante respuesta tardía) queda cubierto por generaciones en el asistente/preparación, no por un delay inyectado.
- P03.1 y P03.8 siguen pendientes. No se declara G3 ni utilidad.

### Guía de uso, recuperación y retirada

1. En un grupo, **Crear espacio**. Elige Vacío o una plantilla. Nombre y grupo son obligatorios; textos y recursos, opcionales. La vista previa confirma destino, qué se guarda y qué no se comparte. **Crear espacio** no inicia nada.
2. En la mesa, **Preparación inicial** (separada de Continuidad): edita textos, añade u omite sugerencias, oculta la sección. Ocultar no borra. Quitar una pieza vinculada deja la sugerencia pendiente; no se recrea sola. Iniciar sigue exigiendo marcar piezas.
3. Borrador solo en memoria. Cancelar con cambios pide confirmación. Un espacio ya creado no se duplica al reintentar la misma solicitud. Tras reiniciar, la guía persistida reaparece; el borrador no.
4. Retirar la UI no borra `espacio_preparacion` ni sugerencias. Borrar la mesa sí las elimina por cascada. Restaurar una copia completa de SQLite afecta también datos ajenos a P03; no hay backup selectivo.
5. La preparación es privada respecto de MCP y del pack automático. Una copia de la DB local también la contiene.

**Siguiente acción:** P03.8 con consentimiento y línea base, o aceptar las brechas técnicas de forma consciente. No marcar utilidad por haber terminado el código.
