# Informe de creación y gasto — septiembre de 2026

**Proyecto:** CharlyBrown (`charly-brown`)  
**Corte de actividad:** 30 de septiembre de 2026, 11:29 h de Cancún.  
**Periodo de actividad:** 1 de septiembre, 00:00 h, al corte indicado (America/Cancun).  
**Costo:** consulta de Cloud Billing del 30 de septiembre; cifras provisionales en MXN, después de los ahorros mostrados. El gasto puede actualizarse por retrasos de facturación.

## Resumen

| Editor | Resultado de septiembre | Costo aprox. parcial MXN |
|---|---|---:|
| Podcaster | 26 sesiones propias creadas, con 285 filas de escena | Veo + imagen: ver anexo A |
| PigPen Creator | 74 escape rooms/temas creados en 37 sesiones contenedoras | Imagen imputada: 1,714.17 |
| Marcie Blog Editor | 13 versiones de artículo con contenido en 8 sesiones nuevas; se consideran pruebas | ND: sin tokens por versión |
| Moodle Course | 2 cursos creados | ND: sin consumo por curso |
| Image Creator | 36 imágenes generadas en 11 sesiones nuevas | Imagen imputada: 173.83 |
| Charly MCPEditor | 5 sesiones nuevas; 5 unidades guardadas, con diferente grado de avance | Imagen imputada: 111.06; texto ND |
| Science Activities | 2 registros de prueba del mismo simulador; 0 actividades del plan Trim. 2 completadas | ND: sin consumo por registro |
| Generar Lectura | 2 lecturas guardadas con usuario y fecha de septiembre | ND: sin tokens por lectura |
| Schroeder Sound Lab | 1 sesión musical en el almacén compartido | ND: sin consumo por pista |

El gasto observado para el proyecto fue **MXN 20,277.33**. Vertex AI representó **MXN 19,090.89** (aproximadamente 94.1%). El resto de servicios representó MXN 1,186.44 (5.9%). Son cifras del proyecto completo, no cargos exclusivos de un editor.

Las cifras de “costo aproximado” en las tablas son **imputaciones parciales** del SKU Veo y del SKU de salida de imágenes; no son el costo completo de producción ni un cobro individual. El método y el importe que queda sin repartir figuran en los anexos A y D. La suma de filas redondeadas puede diferir un centavo del subtotal calculado antes del redondeo.

## Justificación ejecutiva del gasto

Entre mayo y agosto se crearon y probaron los editores, flujos de guion, generación visual, audio, video y guardado. El inventario actual conserva 12 sesiones de Podcaster creadas en mayo, 6 en junio, 19 en julio y 13 en agosto; septiembre incorporó 26 sesiones de Podcaster y una de Schroeder en la misma colección. El registro de trabajos de video listo está disponible para agosto y septiembre: pasó de **187 videos de escena listos en agosto a 312 en septiembre** (**+66.8%**). No se interpreta la ausencia de trabajos en mayo-julio como cero videos, porque el registro de trabajos no demuestra cobertura histórica uniforme. PigPen conserva 67 temas creados en julio, 5 en agosto y 74 en septiembre. Esto respalda el paso de construcción y pruebas a una producción de contenido más intensa; el incremento de PigPen frente a julio es **10.4%**, por lo que el cambio más claro en los datos es el video.

El costo principal es el uso de modelos: **94.1% corresponde a Vertex AI**. La infraestructura del proyecto (Cloud Run, Functions, Hosting, Storage y servicios menores) representa **5.9%**. Las automatizaciones convierten las llamadas de IA en activos editables: guiones y escenas de video, voces, música, escape rooms con misiones y preguntas, imágenes, cursos, lecturas y unidades de libro. “Listo” en un trabajo de generación significa archivo o resultado guardado; la publicación comercial aún requiere la revisión editorial y de derechos de cada pieza.

### Video: escenas e iteraciones que explican Veo

Las **26 sesiones de Podcaster** tienen **285 filas de escena**. De ellas, **237 escenas distintas** recibieron al menos un video listo (**83.2% de las filas actuales**). Se completaron **312 generaciones de video de escena**: una primera generación en 237 escenas y **75 generaciones adicionales** sobre escenas ya cubiertas. Esas 75 son evidencia de iteración o regeneración; los registros no permiten afirmar cuántas fueron reediciones manuales del guion. Además hubo **17 intentos de video con error y 5 cancelados**, que no se suman a los 312 videos listos. Cada video es una generación de **una sola escena**; no se cuenta como un video de sesión completa. El detalle por nombre de sesión figura en el anexo A.

Los **2,496 segundos** de videos listos registrados no coinciden exactamente con las **2,472 unidades** que muestra el SKU facturado de Veo. Por ello la distribución monetaria por usuario es estimada. Las generaciones adicionales y los intentos fallidos son parte del proceso productivo; esta evidencia **no demuestra** si cada error o cancelación produjo cargo ni permite adjudicarle un monto separado.

La producción de las mismas sesiones incluyó **457 narraciones o voces en off listas** para 281 filas de escena; **176** son generaciones adicionales de voz para filas ya cubiertas. Se conservan **241 imágenes de referencia** de escena; **97** tienen historial de edición y ese historial registra **115 modificaciones aplicadas**. Son señales concretas de trabajo audiovisual y de iteración. El registro de referencias no distingue de modo fiable cuántas imágenes originales se generaron con IA y cuántas se adjuntaron o importaron, por lo que 241 no se presenta como número de generaciones facturadas. No se observaron referencias con fecha de actualización posterior al corte original.

### Imágenes y otros productos

En PigPen hay **266 misiones, 1,064 preguntas y 355 campos de imagen poblados**: 247 imágenes de misión, 71 portadas y 37 imágenes de cierre. Estos campos muestran recursos incorporados al producto, pero no equivalen necesariamente a 355 llamadas facturadas ni prueban que todas las imágenes sean distintas. Image Creator guardó **36 resultados de imagen**. Charly MCPEditor sirve para armar unidades completas de libro; Science Activities construye actividades y simuladores; Podcaster produce apoyos visuales por escena. Cada editor usa imágenes con un fin diferente. No existe en Cloud Billing una etiqueta por editor que permita repartir con precisión los **MXN 3,718.05** de SKU de salida de imágenes Gemini.

Schroeder Sound Lab apoya la creación de música de fondo y audio para videos. Se identificó una sesión musical propia en el almacén compartido y Podcaster registra 10 trabajos musicales listos en septiembre; estos dos conteos no deben sumarse como diez pistas únicas de Schroeder. El costo específico de Schroeder no se puede separar de los SKU de audio y demás consumos del proyecto con los registros disponibles.

### Avance contra la hoja de planeación

Fuente: [Guión videos Secundaria Aprende 2026-2027](https://docs.google.com/spreadsheets/d/1KeIukb-Cu_iv9eiJii3Jg1O2P4-bMgaE7K2OvKSgerg/edit). Se contaron bloques de guion identificados por grado y tema, y filas de las hojas de planificación. El avance de video significa **sesión enlazada en la hoja**, no validación editorial final de todas sus escenas. El avance de escape room significa **tema curricular con al menos un proyecto que contiene misiones**, deduplicado por grado, trimestre, asignatura y tema.

| Línea planificada | Plan | Con evidencia de avance | Pendiente | Avance |
|---|---:|---:|---:|---:|
| Guiones de video Secundaria, Trim. 2 | 63 | 22 sesiones enlazadas | 41 | 34.9% |
| Escape rooms de asignaturas en idioma español, Trim. 2 | 65 | 39 temas con misiones | 26 | 60.0% |
| Escape rooms Inglés, Trim. 2 y 3 | 30 | 11 capítulos con misiones | 19 | 36.7% |
| Actividades científicas, Trim. 2 | 26 | 0 entregables del plan | 26 | 0% |
| Simuladores, Trim. 2 | 8 | 0 entregables del plan | 8 | 0% |

Los 65 escape rooms de la hoja `Escape Rooms Trim2` abarcan asignaturas impartidas **en idioma español**: Español, Matemáticas, Geografía, Biología, Historia, Formación Cívica y Ética, Física y Química. La asignatura de Inglés se mide en su propia hoja.

La hoja de Inglés incluye también 15 capítulos de Trim. 1, excluidos del denominador solicitado de Trim. 2 y 3. Su columna “Estatus” marca como pendientes los 30 capítulos de Trim. 2 y 3; el inventario de Firestore ya contiene proyectos con misiones para 11 de ellos. El porcentaje anterior usa la evidencia del producto guardado y señala esta falta de actualización de la planeación. Los 74 documentos de PigPen creados en septiembre no equivalen a 74 temas únicos de estas dos hojas: incluyen versiones repetidas, trabajo de Trim. 1 y un borrador sin misiones.

### Derechos de uso y comercialización

Los [términos de Google Cloud vigentes en julio de 2026](https://cloud.google.com/legal/archive/terms/service-terms/index-20260729) consideran la salida generada como datos del cliente y Google no reclama la propiedad de nueva propiedad intelectual creada en ella. Los [términos de Gemini API](https://ai.google.dev/gemini-api/terms) también indican que Google no reclama propiedad sobre el contenido generado. Esto respalda que el equipo **pueda explotar comercialmente sus materiales, sujeto a los términos aplicables y a los derechos sobre los insumos y componentes usados**. **No respalda exclusividad absoluta:** ambos documentos reconocen que se puede producir contenido igual o similar para otros clientes. No debe afirmarse ante dirección que la API concede derechos exclusivos de comercialización por sí sola.

## Podcaster

Se contaron documentos de `podcaster_sessions` por `createdAt`, incluidos los archivados que aún existen, y se excluyó una sesión identificada como `schroeder-sound-lab` que usa la misma colección.

| Creador | Sesiones | Costo aprox. parcial MXN |
|---|---:|---:|
| rmora@asc.education | 17 | Veo + imagen: 6,666.18 |
| wlopez@asc.education | 9 | Veo + imagen: 3,439.82 |
| **Total** | **26** | **10,105.99** |

## PigPen Creator

Cada documento `escapeRoom/{sesión}/topics/{tema}` cuenta como un escape room. La sesión padre es un contenedor y se informa aparte. Todos los 74 temas creados en el periodo son de **Secundaria**.

| Creador | Sesiones contenedoras | Escape rooms | Imágenes de misión | Portadas | Imágenes de cierre | **Imágenes guardadas en todos los temas** | Costo aprox. imágenes MXN |
|---|---:|---:|---:|---:|---:|---:|---:|
| rmora@asc.education | 10 | 41 | 128 | 40 | 31 | **199** | 960.90 |
| wlopez@asc.education | 27 | 33 | 119 | 31 | 6 | **156** | 753.27 |
| **Total** | **37** | **74** | **247** | **71** | **37** | **355** | **1,714.17** |

El total de imágenes es la suma de los campos de imagen de misión, portada y cierre que permanecen guardados en los temas al corte. No equivale necesariamente al número de llamadas facturadas ni demuestra que cada imagen sea única.

| Grado | Escape rooms |
|---|---:|
| Primero | 33 |
| Segundo | 19 |
| Tercero | 22 |

| Trimestre | Escape rooms |
|---|---:|
| 1 | 17 |
| 2 | 57 |

| Tema | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Total** | **20** | **17** | **14** | **13** | **8** | **1** | **1** |

### Cruce completo por usuario, grado, trimestre y tema

El nivel es Secundaria en todas las filas. Un guion significa cero.

| Creador | Grado | Trim. | Tema 1 | 2 | 3 | 4 | 5 | 6 | 7 | Total |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| rmora@asc.education | Primero | 1 | — | — | — | 1 | 1 | — | — | 2 |
| rmora@asc.education | Primero | 2 | 5 | 5 | 5 | 5 | — | — | — | 20 |
| rmora@asc.education | Segundo | 2 | 2 | 2 | 2 | 1 | — | — | — | 7 |
| rmora@asc.education | Tercero | 2 | 2 | 2 | 2 | 2 | 2 | 1 | 1 | 12 |
| wlopez@asc.education | Primero | 1 | — | 1 | 1 | 1 | 1 | — | — | 4 |
| wlopez@asc.education | Primero | 2 | 4 | 1 | 1 | — | 1 | — | — | 7 |
| wlopez@asc.education | Segundo | 1 | 2 | 1 | 1 | 1 | 1 | — | — | 6 |
| wlopez@asc.education | Segundo | 2 | 1 | 2 | 1 | 1 | 1 | — | — | 6 |
| wlopez@asc.education | Tercero | 1 | 1 | 1 | 1 | 1 | 1 | — | — | 5 |
| wlopez@asc.education | Tercero | 2 | 3 | 2 | — | — | — | — | — | 5 |
| **Total** | | | **20** | **17** | **14** | **13** | **8** | **1** | **1** | **74** |

## Marcie Blog Editor

Se contaron versiones por público dentro de las sesiones creadas en septiembre cuando el artículo tiene bloques de contenido. Esta es una medida de versiones guardadas, no de publicaciones nuevas ni de generaciones repetidas. El editor no registra una fecha de creación independiente para cada versión; por eso la fecha que delimita el periodo es la de su sesión. Las versiones actuales se tratan como pruebas.

| Creador | Sesiones creadas | Versiones con contenido | Costo aprox. MXN |
|---|---:|---:|---|
| wlopez@asc.education | 5 | 10 | ND: sin tokens por versión |
| auribe@asc.education | 2 | 2 | ND: sin tokens por versión |
| mserrano@asc.education | 1 | 1 | ND: sin tokens por versión |
| **Total** | **8** | **13** | ND |

Una novena sesión existente fue creada en agosto y quedó fuera del periodo. Una de las ocho sesiones nuevas aún no tiene artículo con contenido. Dos versiones aparecen con estado `published` en Firestore, aunque se incluyen en el conjunto de pruebas indicado para este informe.

## Moodle Course

Se contaron documentos `moodleCourses` de tipo curso por el campo `creado`.

| Creador | Cursos | Costo aprox. MXN |
|---|---:|---|
| amartinez@asc.education | 1 | ND |
| ipech@asc.education | 1 | ND |
| **Total** | **2** | ND |

## Image Creator

Las sesiones se contaron por `createdAt`; las imágenes, por la fecha propia de cada resultado guardado. Así se incluyen imágenes de septiembre aun cuando la sesión sea anterior.

| Creador | Sesiones nuevas | Imágenes generadas | Costo aprox. imágenes MXN |
|---|---:|---:|---:|
| amartinez@asc.education | 5 | 16 | 77.26 |
| ipech@asc.education | 2 | 15 | 72.43 |
| wlopez@asc.education | 4 | 5 | 24.14 |
| **Total** | **11** | **36** | **173.83** |

De las 36 imágenes, 31 figuran con `gemini-3.1-flash-image` y 5 con `gemini-3-pro-image`.

## Gasto de Firebase y Google Cloud

Fuente: [Cloud Billing, cuenta Herramientas IA, proyecto CharlyBrown, mes actual agrupado por servicio](https://console.cloud.google.com/billing/014D79-71DB41-2ADBDB/reports;projects=charly-brown?project=charly-brown). La tabla muestra subtotales después de ahorros. Firebase Hosting es una línea propia; Firebase Functions aparece bajo **Cloud Run Functions** y el almacenamiento bajo **Cloud Storage**.

| Servicio | Subtotal MXN | Participación aproximada |
|---|---:|---:|
| Vertex AI | 19,090.89 | 94.1% |
| Cloud Run | 716.46 | 3.5% |
| Cloud Run Functions | 284.98 | 1.4% |
| Firebase Hosting | 67.63 | 0.3% |
| App Engine | 60.16 | 0.3% |
| Cloud Text-to-Speech API | 32.10 | 0.2% |
| Artifact Registry | 17.14 | 0.1% |
| Cloud Storage | 7.46 | <0.1% |
| Cloud Scheduler | 0.49 | <0.1% |
| **Total mostrado por Cloud Billing** | **20,277.33** | **100%** |

Los subtotales visibles suman MXN 20,277.31; la diferencia de MXN 0.02 frente al total procede del redondeo de las líneas de la consola. Los demás servicios visibles tienen subtotal cero.

### Conciliación del gasto de Vertex AI

Se filtró [Cloud Billing a Vertex AI y se agrupó por SKU](https://console.cloud.google.com/billing/014D79-71DB41-2ADBDB/reports;grouping=GROUP_BY_SKU;products=services%2FC7E2-9256-1C43?project=charly-brown). El servicio reúne 47 SKU en septiembre. Agrupados por el nombre de cada SKU, sus subtotales después de ahorros son:

| Grupo de SKU de Vertex AI | Subtotal MXN | Componentes principales |
|---|---:|---|
| Generación de video Veo | 8,441.28 | Veo 3 Video Generation: 8,387.00; Veo 3 Audio Video Generation: 54.28 |
| Grounding con Google Search | 3,921.77 | Grounding with Google Search on Gemini 3 |
| Salida de imágenes Gemini | 3,718.05 | Gemini 3.1 Flash Image: 1,944.24; Gemini 3.0/3.1 Pro Image: 1,630.17; Gemini 3.1 Flash Lite Image: 143.64 |
| Texto Gemini: entrada, salida y caché | 2,936.65 | Destacan Gemini 3.6 Flash Text Output: 1,411.66; Gemini 3.8 Flash Text Output: 590.87; Gemini 3.6 Flash Text Input: 377.96 |
| Otros SKU de audio y entradas multimodales | 73.13 | Incluye Lyria, audio en vivo y entradas de imagen, audio y video |
| Ajuste por redondeo de SKU | 0.01 | Diferencia entre los SKU mostrados a centavos y el total del servicio |
| **Total Vertex AI** | **19,090.89** | |

Estos SKU incluyen consumos de todas las aplicaciones del proyecto. El nombre de un SKU no identifica por sí mismo al editor ni al usuario que originó cada cargo.

## Gasto por creador: parte estimable y límite

Cloud Billing agrupa cargos por proyecto, servicio y SKU; sus filas de septiembre no contienen el UID de Firebase. No existe un dataset de exportación de facturación visible en el proyecto `charly-brown`. Por eso **no es posible calcular un total exacto por creador para septiembre** ni asignar a una persona los cargos compartidos de Hosting, Run, Storage o Grounding con evidencia suficiente.

Sí existe una **estimación parcial para un solo SKU de Veo**, basada en los trabajos de video completados de `podcaster_ai_jobs`. Se distribuyen los MXN 8,387.00 del SKU **Veo 3 Video Generation** según los segundos de video guardados por usuario. Esta tabla **no reparte los MXN 19,090.89 completos de Vertex AI**:

| Creador | Videos listos | Segundos guardados | Parte estimada del SKU Veo, MXN |
|---|---:|---:|---:|
| rmora@asc.education | 202 | 1,616 | 5,430.04 |
| wlopez@asc.education | 110 | 880 | 2,956.96 |
| **Total** | **312** | **2,496** | **8,387.00** |

Esta distribución es **orientativa**, no un cargo individual facturado. Cloud Billing registra 2,472 unidades para ese SKU, frente a 2,496 segundos de videos listos en los trabajos fechados en septiembre: hay una diferencia de 24 segundos, compatible con desfases de facturación o corte. El modelo de los trabajos figura como `veo-3.1-generate-001`, mientras Cloud Billing usa el nombre de SKU “Veo 3 Video Generation”. De Vertex AI quedan **MXN 10,703.89 sin atribución confiable por usuario**. Los demás servicios de Google Cloud suman **MXN 1,186.44**, también sin atribución individual; en conjunto son **MXN 11,890.33** sin reparto por creador.

Render y otros proveedores externos no están incluidos en esa cifra de Google Cloud. La página de facturación de Render solicitó iniciar sesión, por lo que su gasto de septiembre quedó **pendiente de verificar**.

Para que el siguiente informe tenga costo completo por creador, cada llamada de IA debe guardar UID, editor, modelo, operación, unidades facturables, fecha y un ID de correlación. Después se puede conciliar ese libro de consumo con la exportación detallada de Cloud Billing y repartir los servicios compartidos mediante una regla explícita.

## Método y límites

- Fuente de actividad: Firestore de producción `charly-brown`, consultado en modo lectura el 30 de septiembre. [Datos agregados y registros del informe](september-2026-data.json) y [script reproducible](../scripts/report-september-2026.cjs).
- Fechas de actividad en `America/Cancun`; el informe es parcial hasta el corte de las 11:29 h del último día del mes. Las eliminaciones anteriores al corte no pueden reconstruirse con un inventario actual.
- La cifra de Cloud Billing es una captura provisional del periodo de cargos del 1 al 30 de septiembre, no una factura cerrada. Google advierte que distintos productos reportan los cargos con retrasos variables; el total puede cambiar al cerrar el mes. [Documentación de informes de Cloud Billing](https://docs.cloud.google.com/billing/docs/how-to/reports).
- Los cargos de Cloud Billing incluyen descuentos/créditos mostrados por la consola; no se asignaron impuestos ni pagos externos. El inventario de actividad y la facturación tienen cortes temporales y criterios de fecha distintos.

## Anexo A. Podcaster: inventario de sesiones y videos por escena

**Criterio del costo aproximado:** Veo se prorratea a MXN 3.36 por segundo de video listo (SKU de MXN 8,387.00 / 2,496 segundos). El SKU de salida de imágenes Gemini (MXN 3,718.05) se distribuye como **escenario de imputación** entre 770 campos u operaciones visuales observables: imágenes de PigPen, resultados de Image Creator, archivos de imagen de Charly, referencias conservadas y ediciones registradas de Podcaster. Cada unidad recibe MXN 4.83. Una referencia pudo ser importada y una edición no equivale necesariamente a una llamada facturada; por eso este prorrateo **no es un cargo real por editor o usuario**. La columna muestra únicamente esos SKU; excluye texto, grounding, audio, el segundo SKU de Veo, infraestructura y Render. “ND” significa que los registros no permiten una cifra defendible.

Cada fila indica una sesión creada en septiembre. “Esc. con video” son IDs de escena distintos; “Videos listos” son generaciones guardadas; “Videos extra” son generaciones posteriores a la primera de su escena. “Voces” son trabajos de narración listos; “Voces extra” son trabajos posteriores a la primera narración de su fila. “Refs.” son imágenes de referencia conservadas; “Refs. editadas” cuentan imágenes con historial de edición y “Ediciones” los cambios aplicados que constan en ese historial. Una referencia guardada pudo generarse, importarse o adjuntarse; el inventario no identifica de forma fiable su origen. El número de escenas y referencias es el estado guardado al corte.

| Fecha | Creador | Sesión guardada | Escenas | Esc. con video | Videos listos | Videos extra | Voces listas | Voces extra | Refs. imagen | Refs. editadas | Ediciones | Enlace para compartir | Costo aprox. parcial MXN |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 02/09/2026 | wlopez@asc.education | La entrevista Español 1 bloque 2 | 14 | 12 | 20 | 8 | 39 | 25 | 12 | 1 | 1 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_3gp8dair) | 600.40 |
| 14/09/2026 | rmora@asc.education | La narrativa contemporánea, Español 2, Bloque 2, Tema 1 | 12 | 10 | 13 | 3 | 43 | 31 | 10 | 3 | 7 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_3fj393qy) | 431.55 |
| 14/09/2026 | wlopez@asc.education | La monografía Español 1 Tema 2 | 12 | 10 | 18 | 8 | 36 | 24 | 10 | 6 | 6 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_fr49vh6w) | 561.12 |
| 14/09/2026 | wlopez@asc.education | La narrativa contemporánea experimenta con | 1 | 1 | 1 | 0 | 1 | 0 | 1 | 0 | 0 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_uml4sxmu) | 31.71 |
| 17/09/2026 | wlopez@asc.education | leer, analizar, escribir y compartir textos narrativos Español 1 Tema 3 | 12 | 10 | 23 | 13 | 39 | 27 | 10 | 8 | 10 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_if4k1pmr) | 714.85 |
| 17/09/2026 | rmora@asc.education | La historieta como forma narrativa, Español 2 | 12 | 10 | 10 | 0 | 15 | 3 | 10 | 0 | 0 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_uba5k0ip) | 317.10 |
| 18/09/2026 | rmora@asc.education | Analizar canciones como textos líricos y productos culturales | 12 | 10 | 18 | 8 | 32 | 20 | 10 | 10 | 12 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_lkzeji8d) | 590.10 |
| 18/09/2026 | wlopez@asc.education | creación y lectura en voz alta de poemas Español 1 Tema 4 | 12 | 10 | 16 | 6 | 38 | 26 | 10 | 9 | 12 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_mky7z3p5) | 536.33 |
| 21/09/2026 | rmora@asc.education | La lectura dramatizada de una obra de teatro | 12 | 10 | 13 | 3 | 32 | 20 | 10 | 10 | 12 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_ys3mrk9v) | 455.69 |
| 21/09/2026 | rmora@asc.education | Analizar manifestaciones poéticas dentro de un movimiento literario | 12 | 10 | 15 | 5 | 12 | 0 | 10 | 9 | 9 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_lfiu63j4) | 494.97 |
| 22/09/2026 | rmora@asc.education | Las obras literarias del Renacimiento | 12 | 10 | 11 | 1 | 12 | 0 | 10 | 10 | 10 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_7xj1taha) | 392.27 |
| 22/09/2026 | rmora@asc.education | Comprender la función de los textos introductorios | 12 | 10 | 12 | 2 | 12 | 0 | 10 | 10 | 10 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_lhe58bi9) | 419.15 |
| 22/09/2026 | rmora@asc.education | Panel de discusión: argumentar para comprender | 12 | 10 | 16 | 6 | 12 | 0 | 10 | 10 | 15 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_id3xuppb) | 550.82 |
| 23/09/2026 | rmora@asc.education | Funciones: relaciones que cambian | 12 | 10 | 10 | 0 | 12 | 0 | 10 | 10 | 10 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_ruumx9sg) | 365.39 |
| 24/09/2026 | wlopez@asc.education | Comprender y calcular la probabilidad de eventos aleatorios | 12 | 10 | 12 | 2 | 12 | 0 | 10 | 0 | 0 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_ajc35j2v) | 370.86 |
| 24/09/2026 | rmora@asc.education | Sucesiones y expresiones equivalentes: descubre el patrón | 12 | 10 | 12 | 2 | 12 | 0 | 10 | 1 | 1 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_g86a2ez7) | 375.69 |
| 25/09/2026 | rmora@asc.education | Porcentajes y proporciones: relaciones que están en todas partes | 12 | 10 | 12 | 2 | 12 | 0 | 10 | 0 | 0 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_0k1k0dv1) | 370.86 |
| 28/09/2026 | rmora@asc.education | Polígonos: formas, ángulos y estructuras | 12 | 10 | 10 | 0 | 12 | 0 | 10 | 0 | 0 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_x6zple76) | 317.10 |
| 28/09/2026 | rmora@asc.education | Pendiente y razón de cambio: cómo cambia una recta | 12 | 10 | 10 | 0 | 12 | 0 | 10 | 0 | 0 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_967o3z99) | 317.10 |
| 28/09/2026 | rmora@asc.education | Sistemas de ecuaciones: modelar para resolver | 12 | 10 | 10 | 0 | 12 | 0 | 10 | 0 | 0 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_k6s1v6lb) | 317.10 |
| 29/09/2026 | rmora@asc.education | Ecuaciones cuadráticas: modelar para encontrar soluciones | 12 | 10 | 10 | 0 | 12 | 0 | 10 | 0 | 0 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_3qy0o5a6) | 317.10 |
| 29/09/2026 | rmora@asc.education | Ecuaciones cuadráticas: de la parábola a la solución | 12 | 10 | 10 | 0 | 12 | 0 | 10 | 0 | 0 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_cm186i38) | 317.10 |
| 29/09/2026 | rmora@asc.education | Parábolas: del modelo a la gráfica | 12 | 10 | 10 | 0 | 12 | 0 | 10 | 0 | 0 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_zw9r60sw) | 317.10 |
| 29/09/2026 | wlopez@asc.education | ¡Mira a tu alrededor! Podemos | 14 | 14 | 20 | 6 | 14 | 0 | 14 | 0 | 0 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_dgcv8avs) | 605.23 |
| 29/09/2026 | wlopez@asc.education | Nueva sesión | 2 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=hLYPCxeqPj0m0wJkakNS) | 9.66 |
| 29/09/2026 | wlopez@asc.education | Nueva sesión | 2 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=v8Kl45ENB4xhaPZdN08P) | 9.66 |

**Totales de las 26 sesiones:** 285 filas de escena; 237 escenas con video; 312 videos listos, incluidos 75 videos adicionales; 457 narraciones listas para 281 filas, incluidas 176 generaciones adicionales de voz; 241 referencias visuales conservadas, 97 de ellas con historial de edición y 115 ediciones aplicadas registradas. En video hubo 17 errores y 5 cancelaciones; en audio, 1 error. En todo el proyecto constan 470 audios de diálogo listos durante septiembre: 457 pertenecen a estas sesiones nuevas y 13 a otras sesiones. La sesión de Schroeder con ID `schroeder_0c61c228b15f426d8e` se informa por separado.

El enlace de “Compartir” reproduce el formato que construye Podcaster para `video-player.html` con `sessionId`. Puede requerir inicio de sesión y permisos de lectura; los borradores sin video pueden abrir una sesión sin reproducción final.

### Guiones de video planificados con enlace a producto

| Asignatura | Tema del plan | Sesión enlazada | Escenas | Esc. con video | Videos listos | Adicionales | Enlace para compartir | Costo aprox. Veo MXN |
|---|---|---|---|---|---|---|---|---|
| Español trim 2 | Español 1 - Tema 1 | session_3gp8dair | 14 | 12 | 20 | 8 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_3gp8dair) | 537.63 |
| Español trim 2 | Español 1 - Tema 2 | session_fr49vh6w | 12 | 10 | 18 | 8 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_fr49vh6w) | 483.87 |
| Español trim 2 | Español 1 - Tema 3 | session_if4k1pmr | 12 | 10 | 23 | 13 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_if4k1pmr) | 618.27 |
| Español trim 2 | Español 1 - Tema 4 | session_mky7z3p5 | 12 | 10 | 16 | 6 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_mky7z3p5) | 430.10 |
| Español trim 2 | Español 2 - Tema 1 | session_3fj393qy | 12 | 10 | 13 | 3 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_3fj393qy) | 349.46 |
| Español trim 2 | Español 2 - Tema 2 | session_uba5k0ip | 12 | 10 | 10 | 0 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_uba5k0ip) | 268.81 |
| Español trim 2 | Español 2 - Tema 3 | session_lkzeji8d | 12 | 10 | 18 | 8 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_lkzeji8d) | 483.87 |
| Español trim 2 | Español 3 - Tema 1 | session_ys3mrk9v | 12 | 10 | 13 | 3 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_ys3mrk9v) | 349.46 |
| Español trim 2 | Español 3 - Tema 2 | session_lfiu63j4 | 12 | 10 | 15 | 5 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_lfiu63j4) | 403.22 |
| Español trim 2 | Español 3 - Tema 3 | session_7xj1taha | 12 | 10 | 11 | 1 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_7xj1taha) | 295.70 |
| Español trim 2 | Español 3 - Tema 4 | session_lhe58bi9 | 12 | 10 | 12 | 2 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_lhe58bi9) | 322.58 |
| Español trim 2 | Español 3 - Tema 5 | session_id3xuppb | 12 | 10 | 16 | 6 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_id3xuppb) | 430.10 |
| Matemáticas Trim 2 | Matemáticas 1 - Tema 1 | session_ajc35j2v | 12 | 10 | 12 | 2 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_ajc35j2v) | 322.58 |
| Matemáticas Trim 2 | Matemáticas 1 - Tema 3 | session_0k1k0dv1 | 12 | 10 | 12 | 2 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_0k1k0dv1) | 322.58 |
| Matemáticas Trim 2 | Matemáticas 2 - Tema 1 | session_ruumx9sg | 12 | 10 | 10 | 0 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_ruumx9sg) | 268.81 |
| Matemáticas Trim 2 | Matemáticas 2 - Tema 2 | session_g86a2ez7 | 12 | 10 | 12 | 2 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_g86a2ez7) | 322.58 |
| Matemáticas Trim 2 | Matemáticas 2 - Tema 3 | session_x6zple76 | 12 | 10 | 10 | 0 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_x6zple76) | 268.81 |
| Matemáticas Trim 2 | Matemáticas 3 - Tema 1 | session_967o3z99 | 12 | 10 | 10 | 0 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_967o3z99) | 268.81 |
| Matemáticas Trim 2 | Matemáticas 3 - Tema 2 | session_k6s1v6lb | 12 | 10 | 10 | 0 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_k6s1v6lb) | 268.81 |
| Matemáticas Trim 2 | Matemáticas 3 - Tema 3 | session_3qy0o5a6 | 12 | 10 | 10 | 0 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_3qy0o5a6) | 268.81 |
| Matemáticas Trim 2 | Matemáticas 3 - Tema 4 | session_cm186i38 | 12 | 10 | 10 | 0 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_cm186i38) | 268.81 |
| Matemáticas Trim 2 | Matemáticas 3 - Tema 5 | session_zw9r60sw | 12 | 10 | 10 | 0 | [Compartir](https://charly-brown.web.app/video-player.html?sessionId=session_zw9r60sw) | 268.81 |

Las 41 posiciones sin enlace permanecen pendientes de vinculación o producción en la hoja. Un enlace confirma correspondencia de sesión, no la aprobación final de cada video.

## Anexo B. PigPen Creator: sesiones, temas y avance curricular

Una sesión padre puede contener varios temas. “Escape room” es un documento de tema; se distinguen proyectos con misiones de borradores.

| Fecha | Creador | Sesión contenedora | Temas actuales | Nivel | Grado | Trim. | Costo aprox. imágenes MXN |
|---|---|---|---|---|---|---|---|
| 01/09/2026 | wlopez@asc.education | Sesion sin titulo | 1 | Secundaria | Primero | 2 | 0.00 |
| 01/09/2026 | wlopez@asc.education | La entrevista | 1 | Secundaria | Primero | 2 | 4.83 |
| 02/09/2026 | rmora@asc.education | FFE Junior High Level 1, Book 1 (Chapter 4 y 5) | 2 | Secundaria | Primero | 1 | 28.97 |
| 02/09/2026 | wlopez@asc.education | The Web of Life Rescue | 3 | Secundaria | Primero | 1 | 67.60 |
| 03/09/2026 | wlopez@asc.education | The Living Language Archive | 1 | Secundaria | Segundo | 2 | 24.14 |
| 03/09/2026 | wlopez@asc.education | Backstage at the Moving-Picture Theater | 1 | Secundaria | Primero | 2 | 24.14 |
| 03/09/2026 | wlopez@asc.education | The Logic Chamber | 1 | Secundaria | Tercero | 2 | 19.31 |
| 03/09/2026 | wlopez@asc.education | The Midnight Wall Cipher | 1 | Secundaria | Segundo | 1 | 24.14 |
| 03/09/2026 | wlopez@asc.education | Gravity Lab Lockdown | 1 | Secundaria | Segundo | 1 | 24.14 |
| 03/09/2026 | wlopez@asc.education | The Steam Factory Shutdown | 1 | Secundaria | Segundo | 1 | 24.14 |
| 03/09/2026 | wlopez@asc.education | Operation: Save Every Drop | 2 | Secundaria | Tercero | 1 | 48.29 |
| 03/09/2026 | wlopez@asc.education | Blackbeard's Coded Manifest: Deep Sea Investigation | 1 | Secundaria | Tercero | 1 | 24.14 |
| 03/09/2026 | wlopez@asc.education | The Soreq Flow Code: A Hydrological Expedition | 1 | Secundaria | Tercero | 1 | 24.14 |
| 03/09/2026 | wlopez@asc.education | The Empathy Shield | 1 | Secundaria | Tercero | 1 | 24.14 |
| 03/09/2026 | wlopez@asc.education | Darwin's Selection Vault | 0 | Secundaria | Primero | 2 | 0.00 |
| 03/09/2026 | wlopez@asc.education | The Clean-Air Emergency | 1 | Secundaria | Primero | 2 | 24.14 |
| 03/09/2026 | wlopez@asc.education | The Silent Airport Code | 1 | Secundaria | Segundo | 1 | 24.14 |
| 03/09/2026 | wlopez@asc.education | The Three Hidden Studios | 2 | Secundaria | Segundo | 2 | 53.12 |
| 03/09/2026 | wlopez@asc.education | The Six-Panel Cartoon Archive | 1 | Secundaria | Segundo | 2 | 24.14 |
| 03/09/2026 | wlopez@asc.education | The Counterweight Bridge Vault | 1 | Secundaria | Segundo | 2 | 24.14 |
| 03/09/2026 | wlopez@asc.education | The Living Language Archive | 0 | Secundaria | Primero | 2 | 0.00 |
| 03/09/2026 | wlopez@asc.education | The Bioelectric Control Room | 1 | Secundaria | Segundo | 2 | 24.14 |
| 04/09/2026 | wlopez@asc.education | The Zocalo Architecture Cipher | 2 | Secundaria | Tercero | 2 | 53.12 |
| 07/09/2026 | wlopez@asc.education | The Polis Word Vault | 3 | Secundaria | Primero | 2 | 77.26 |
| 08/09/2026 | rmora@asc.education | Español_Secundaria 1_Trim2 | 4 | Secundaria | Primero | 2 | 82.09 |
| 08/09/2026 | wlopez@asc.education | The Locked Merchant Port | 2 | Secundaria | Segundo | 1 | 48.29 |
| 10/09/2026 | rmora@asc.education | Español_Secundaria 2_Trim2 | 4 | Secundaria | Segundo | 2 | 77.26 |
| 14/09/2026 | rmora@asc.education | Español_Secundaria 3_Trim2 | 5 | Secundaria | Tercero | 2 | 120.72 |
| 18/09/2026 | rmora@asc.education | Matemáticas_Secundaria 1_Trim2 | 4 | Secundaria | Primero | 2 | 96.57 |
| 21/09/2026 | rmora@asc.education | Matemáticas_Secundaria 2_Trim2 | 3 | Secundaria | Segundo | 2 | 72.43 |
| 23/09/2026 | rmora@asc.education | Matemáticas_Secundaria 3_Trim2 | 7 | Secundaria | Tercero | 2 | 197.97 |
| 24/09/2026 | wlopez@asc.education | La gran olimpiada de los números | 1 | Secundaria | Tercero | 2 | 24.14 |
| 24/09/2026 | wlopez@asc.education | La gran olimpiada de los números | 1 | Secundaria | Tercero | 2 | 24.14 |
| 25/09/2026 | rmora@asc.education | Geografía_Secundaria_1_Trim2 | 4 | Secundaria | Primero | 2 | 77.26 |
| 25/09/2026 | wlopez@asc.education | Expedición Geográfica: Atlas de la Tierra | 1 | Secundaria | Primero | 2 | 19.31 |
| 28/09/2026 | rmora@asc.education | Biología_Secundaria 1_Trim2 | 4 | Secundaria | Primero | 2 | 101.40 |
| 29/09/2026 | rmora@asc.education | Historia del mundo_Secundaria 1_Trim2 | 4 | Secundaria | Primero | 2 | 106.23 |

### Los 74 temas creados en septiembre

| Fecha | Creador | Título del escape room | Asignatura | Grado | Trim. | Tema | Misiones | Preguntas | Img. misión | Portada | Cierre | Imágenes totales | Costo aprox. imágenes MXN |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 01/09/2026 | wlopez@asc.education | Nuevo escape room | Sin asignatura | Primero | 2 | 1 | 0 | 0 | 0 | No | No | 0 | 0.00 |
| 01/09/2026 | wlopez@asc.education | El Archivo Perdido del Periodista | Español | Primero | 2 | 1 | 4 | 16 | 1 | No | No | 1 | 4.83 |
| 02/09/2026 | rmora@asc.education | Mark Twain's Delayed Invitation | Inglés | Primero | 1 | 4 | 4 | 16 | 3 | Sí | No | 4 | 19.31 |
| 02/09/2026 | wlopez@asc.education | The Web of Life Rescue | Inglés | Primero | 1 | 3 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 03/09/2026 | wlopez@asc.education | The Three Hidden Studios | Inglés | Segundo | 2 | 2 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 03/09/2026 | rmora@asc.education | NYC Ad Agency Mystery: Truth in Advertising | Inglés | Primero | 1 | 5 | 4 | 16 | 1 | Sí | No | 2 | 9.66 |
| 03/09/2026 | wlopez@asc.education | Backstage at the Moving-Picture Theater | Inglés | Primero | 2 | 3 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 03/09/2026 | wlopez@asc.education | The Logic Chamber | Matemáticas | Tercero | 2 | 1 | 4 | 16 | 3 | Sí | No | 4 | 19.31 |
| 03/09/2026 | wlopez@asc.education | The Midnight Wall Cipher | Inglés | Segundo | 1 | 3 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 03/09/2026 | wlopez@asc.education | Gravity Lab Lockdown | Inglés | Segundo | 1 | 4 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 03/09/2026 | wlopez@asc.education | The Steam Factory Shutdown | Inglés | Segundo | 1 | 5 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 03/09/2026 | wlopez@asc.education | Operation: Save Every Drop | Inglés | Tercero | 1 | 1 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 03/09/2026 | wlopez@asc.education | Blackbeard's Coded Manifest | Inglés | Tercero | 1 | 3 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 03/09/2026 | wlopez@asc.education | The Soreq Flow Code | Inglés | Tercero | 1 | 4 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 03/09/2026 | wlopez@asc.education | The Empathy Shield | Inglés | Tercero | 1 | 5 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 03/09/2026 | wlopez@asc.education | The Clean-Air Emergency | Inglés | Primero | 2 | 5 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 03/09/2026 | wlopez@asc.education | The Silent Airport Code | Inglés | Segundo | 1 | 1 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 03/09/2026 | wlopez@asc.education | The Three Hidden Studios | Inglés | Segundo | 2 | 2 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 03/09/2026 | wlopez@asc.education | The Six-Panel Cartoon Archive | Inglés | Segundo | 2 | 3 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 03/09/2026 | wlopez@asc.education | The Counterweight Bridge Vault | Inglés | Segundo | 2 | 4 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 03/09/2026 | wlopez@asc.education | The Bioelectric Control Room | Inglés | Segundo | 2 | 5 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 04/09/2026 | wlopez@asc.education | The Zocalo Architecture Cipher | Inglés | Tercero | 2 | 1 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 07/09/2026 | wlopez@asc.education | Darwin's Selection Vault | Inglés | Primero | 2 | 1 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 08/09/2026 | wlopez@asc.education | Biome Expedition Grid | Inglés | Primero | 1 | 2 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 08/09/2026 | rmora@asc.education | El Enigma de la Entrevista Perdida | Español | Primero | 2 | 1 | 3 | 12 | 3 | Sí | No | 4 | 19.31 |
| 08/09/2026 | wlopez@asc.education | The Lost Constellation Console | Inglés | Segundo | 1 | 1 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 08/09/2026 | rmora@asc.education | El Secreto del Manuscrito Perdido | Español | Primero | 2 | 2 | 3 | 12 | 3 | Sí | No | 4 | 19.31 |
| 08/09/2026 | rmora@asc.education | Rescate en la Biblioteca | Español | Primero | 2 | 3 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 08/09/2026 | wlopez@asc.education | The Locked Merchant Port | Inglés | Segundo | 1 | 2 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 08/09/2026 | wlopez@asc.education | The Binary Signal Rescue | Inglés | Tercero | 1 | 2 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 09/09/2026 | rmora@asc.education | Rescate en la Biblioteca Clásica | Español | Primero | 2 | 4 | 3 | 12 | 3 | Sí | No | 4 | 19.31 |
| 10/09/2026 | wlopez@asc.education | Mark Twain's Delayed Invitation | Inglés | Primero | 1 | 4 | 4 | 16 | 4 | Sí | No | 5 | 24.14 |
| 10/09/2026 | wlopez@asc.education | The Missing Newspaper Campaign | Inglés | Primero | 1 | 5 | 4 | 16 | 3 | Sí | No | 4 | 19.31 |
| 10/09/2026 | rmora@asc.education | El Enigma del Expediente Ceniza | Español | Segundo | 2 | 1 | 3 | 12 | 3 | Sí | No | 4 | 19.31 |
| 10/09/2026 | rmora@asc.education | Rescate en la biblioteca clásica | Español | Segundo | 2 | 2 | 3 | 12 | 3 | Sí | No | 4 | 19.31 |
| 10/09/2026 | rmora@asc.education | El Rescate del Archivo Sonoro: Ecos de la Lírica | Español | Segundo | 2 | 3 | 3 | 12 | 3 | Sí | No | 4 | 19.31 |
| 10/09/2026 | rmora@asc.education | Leyendas Populares en Escena: El Archivo de las Sombras | Español | Segundo | 2 | 4 | 3 | 12 | 3 | Sí | No | 4 | 19.31 |
| 11/09/2026 | wlopez@asc.education | The Silent Airport Code | Inglés | Segundo | 2 | 1 | 4 | 16 | 4 | Sí | Sí | 6 | 28.97 |
| 14/09/2026 | rmora@asc.education | El Enigma del Drama Renacentista | Español | Tercero | 2 | 1 | 3 | 12 | 3 | Sí | Sí | 5 | 24.14 |
| 17/09/2026 | wlopez@asc.education | The Living Language Archive | Inglés | Primero | 2 | 2 | 4 | 16 | 4 | Sí | Sí | 6 | 28.97 |
| 17/09/2026 | wlopez@asc.education | The Digestive Chemistry Reactor | Inglés | Tercero | 2 | 2 | 4 | 16 | 4 | Sí | Sí | 6 | 28.97 |
| 17/09/2026 | rmora@asc.education | Biblioteca Clásica | Español | Tercero | 2 | 2 | 3 | 12 | 3 | Sí | Sí | 5 | 24.14 |
| 17/09/2026 | rmora@asc.education | Manuscrito Dramático | Español | Tercero | 2 | 3 | 3 | 12 | 3 | Sí | Sí | 5 | 24.14 |
| 17/09/2026 | rmora@asc.education | Misterioso Manuscrito | Español | Tercero | 2 | 4 | 3 | 12 | 3 | Sí | Sí | 5 | 24.14 |
| 17/09/2026 | rmora@asc.education | El Teatro | Español | Tercero | 2 | 5 | 3 | 12 | 3 | Sí | Sí | 5 | 24.14 |
| 18/09/2026 | rmora@asc.education | El Enigma de la Probabilidad | Matemáticas | Primero | 2 | 1 | 3 | 12 | 3 | Sí | Sí | 5 | 24.14 |
| 18/09/2026 | rmora@asc.education | El Enigma de los Datos Ocultos | Matemáticas | Primero | 2 | 2 | 3 | 12 | 3 | Sí | Sí | 5 | 24.14 |
| 18/09/2026 | rmora@asc.education | El Enigma Proporcional | Matemáticas | Primero | 2 | 3 | 3 | 12 | 3 | Sí | Sí | 5 | 24.14 |
| 18/09/2026 | rmora@asc.education | El Enigma Algebraico | Matemáticas | Primero | 2 | 4 | 3 | 12 | 3 | Sí | Sí | 5 | 24.14 |
| 21/09/2026 | rmora@asc.education | El Enigma de las Variaciones Demográficas | Matemáticas | Segundo | 2 | 1 | 3 | 12 | 3 | Sí | Sí | 5 | 24.14 |
| 21/09/2026 | rmora@asc.education | El enigma del catastro central | Matemáticas | Segundo | 2 | 2 | 3 | 12 | 3 | Sí | Sí | 5 | 24.14 |
| 22/09/2026 | rmora@asc.education | La Gran Olimpiada: El Enigma de los Polígonos | Matemáticas | Segundo | 2 | 3 | 3 | 12 | 3 | Sí | Sí | 5 | 24.14 |
| 23/09/2026 | rmora@asc.education | La gran olimpiada de los números | Matemáticas | Tercero | 2 | 1 | 4 | 16 | 4 | Sí | Sí | 6 | 28.97 |
| 24/09/2026 | wlopez@asc.education | La gran olimpiada de los números | Matemáticas | Tercero | 2 | 1 | 7 | 28 | 3 | Sí | Sí | 5 | 24.14 |
| 24/09/2026 | rmora@asc.education | La gran olimpiada de la lógica matemática | Matemáticas | Tercero | 2 | 2 | 4 | 16 | 4 | Sí | Sí | 6 | 28.97 |
| 24/09/2026 | rmora@asc.education | Las leyes de la congruencia | Matemáticas | Tercero | 2 | 3 | 4 | 16 | 4 | Sí | Sí | 6 | 28.97 |
| 24/09/2026 | rmora@asc.education | El Enigma de las Coordenadas Espejo | Matemáticas | Tercero | 2 | 4 | 4 | 16 | 4 | Sí | Sí | 6 | 28.97 |
| 24/09/2026 | rmora@asc.education | Relaciones geométricas | Matemáticas | Tercero | 2 | 5 | 4 | 16 | 4 | Sí | Sí | 6 | 28.97 |
| 24/09/2026 | rmora@asc.education | La trigonometría avanzada | Matemáticas | Tercero | 2 | 6 | 4 | 16 | 4 | Sí | Sí | 6 | 28.97 |
| 24/09/2026 | rmora@asc.education | El Enigma de las Funciones Ocultas | Matemáticas | Tercero | 2 | 7 | 4 | 16 | 3 | Sí | Sí | 5 | 24.14 |
| 24/09/2026 | wlopez@asc.education | La gran olimpiada de los números | Matemáticas | Tercero | 2 | 2 | 3 | 12 | 3 | Sí | Sí | 5 | 24.14 |
| 25/09/2026 | rmora@asc.education | Atlas Global de Biomas | Geografía | Primero | 2 | 1 | 3 | 12 | 0 | No | Sí | 1 | 4.83 |
| 25/09/2026 | wlopez@asc.education | Expedición Geográfica: Atlas de la Tierra | Geografía | Primero | 2 | 1 | 4 | 16 | 2 | Sí | Sí | 4 | 19.31 |
| 25/09/2026 | rmora@asc.education | Expedición Geográfica: Atlas de Biomas y Sostenibilidad | Geografía | Primero | 2 | 2 | 3 | 12 | 3 | Sí | Sí | 5 | 24.14 |
| 25/09/2026 | rmora@asc.education | Expedición Cartográfica: Redes Globales y Territorios | Geografía | Primero | 2 | 3 | 3 | 12 | 3 | Sí | Sí | 5 | 24.14 |
| 25/09/2026 | rmora@asc.education | Expedición Geográfica Mundial: Dinámica Demográfica y Migraciones | Geografía | Primero | 2 | 4 | 3 | 12 | 3 | Sí | Sí | 5 | 24.14 |
| 28/09/2026 | rmora@asc.education | Ecosfera: Protocolo Biológico | Biología | Primero | 2 | 1 | 3 | 12 | 3 | Sí | Sí | 5 | 24.14 |
| 28/09/2026 | rmora@asc.education | Laboratorio Genético: El Enigma de la Biodiversidad | Biología | Primero | 2 | 2 | 3 | 12 | 3 | Sí | Sí | 5 | 24.14 |
| 28/09/2026 | rmora@asc.education | Genes y ADN: Continuidad y Ciclos | Biología | Primero | 2 | 3 | 4 | 16 | 4 | Sí | Sí | 6 | 28.97 |
| 28/09/2026 | rmora@asc.education | El Archivo Genético Oculto | Biología | Primero | 2 | 4 | 3 | 12 | 3 | Sí | Sí | 5 | 24.14 |
| 29/09/2026 | rmora@asc.education | Archivo de la Memoria Global | Historia del mundo | Primero | 2 | 1 | 4 | 16 | 4 | Sí | Sí | 6 | 28.97 |
| 29/09/2026 | rmora@asc.education | La Cumbre de la Paz | Historia del mundo | Primero | 2 | 2 | 4 | 16 | 4 | Sí | Sí | 6 | 28.97 |
| 29/09/2026 | rmora@asc.education | Expedientes de la Guerra Fría | Historia del mundo | Primero | 2 | 3 | 3 | 12 | 3 | Sí | Sí | 5 | 24.14 |
| 29/09/2026 | rmora@asc.education | Cronosfera: El Fin del Bipolarismo | Historia del mundo | Primero | 2 | 4 | 3 | 12 | 3 | Sí | Sí | 5 | 24.14 |

**Totales:** 74 documentos de tema, 73 con misiones, 266 misiones, 1,064 preguntas, 247 imágenes de misión, 71 portadas y 37 cierres. Hay 1 tema vacío “Nuevo escape room”. Las cifras de imagen son campos guardados, no cargos de IA individualizados.

### Avance de los 65 temas de asignaturas en idioma español, Trim. 2

| Asignatura | Plan | Tema con misiones | Pendiente | Avance | Costo aprox. MXN |
|---|---|---|---|---|---|
| Español | 13 | 13 | 0 | 100.0% | ND: plan, no factura |
| Matemáticas | 14 | 14 | 0 | 100.0% | ND: plan, no factura |
| Geografía | 4 | 4 | 0 | 100.0% | ND: plan, no factura |
| Biología | 4 | 4 | 0 | 100.0% | ND: plan, no factura |
| Historia del mundo | 4 | 4 | 0 | 100.0% | ND: plan, no factura |
| Historia de México 1 | 3 | 0 | 3 | 0.0% | ND: plan, no factura |
| Formación Cívica y Ética | 9 | 0 | 9 | 0.0% | ND: plan, no factura |
| Física | 3 | 0 | 3 | 0.0% | ND: plan, no factura |
| Química | 5 | 0 | 5 | 0.0% | ND: plan, no factura |
| Historia de México 2 | 6 | 0 | 6 | 0.0% | ND: plan, no factura |

Este cruce usa grado, trimestre, asignatura y número de tema. Un tema se cuenta una sola vez aunque tenga varias versiones guardadas.

### Inglés, Trim. 2 y 3

| Trimestre | Plan | Con misiones | Pendiente | Avance | Costo aprox. MXN |
|---|---|---|---|---|---|
| 2 | 15 | 11 | 4 | 73.3% | ND: plan, no factura |
| 3 | 15 | 0 | 15 | 0.0% | ND: plan, no factura |

La hoja de Inglés aún marca “Pendiente” estos 30 renglones; el cruce anterior se basa en proyectos conservados en Firestore. Se informa aparte de las asignaturas en idioma español porque corresponde a otro plan.

## Anexo C. Otros editores y productos conservados

### Charly MCPEditor: unidades de libro

| Fecha | Creador | Sesión / ID | Unidad | Nivel / grado / trim. | Temas registrados | Actividades | Recursos | Notas docentes | Lectura | Imágenes adjuntas | Enlace | Costo aprox. imágenes MXN |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 08/09/2026 | mserrano@asc.education | Tercero · Comprension Lectora · U3 / session_mtt26svi_41ejbh | Sin unidad | — | — | 0 | 0 | 0 | No | 0 | [Abrir editor](https://charly-brown.web.app/charlyMCPeditor.html) · `session_mtt26svi_41ejbh` | 0.00 |
| 18/09/2026 | mserrano@asc.education | Tercero · Todos · Uproyecto / session_mu1nhiu3_bzwexn | Nueva sesión | Primaria / Tercero / 3 | — | 0 | 0 | 0 | No | 0 | [Abrir editor](https://charly-brown.web.app/charlyMCPeditor.html) · `session_mu1nhiu3_bzwexn` | 0.00 |
| 18/09/2026 | mserrano@asc.education | Tercero · Todos · Uproyecto / session_mu1nhiu3_bzwexn | Una Aventura STEAM en el Patio | Primaria / Tercero / 3 | — | 0 | 0 | 0 | Sí | 0 | [Abrir editor](https://charly-brown.web.app/charlyMCPeditor.html) · `session_mu1nhiu3_bzwexn` | 0.00 |
| 18/09/2026 | mserrano@asc.education | Tercero · Todos · Uproyecto / session_mu1nhiu3_bzwexn | Tercero · Todos · Uproyecto | Primaria / Tercero / 3 | — | 0 | 0 | 0 | No | 0 | [Abrir editor](https://charly-brown.web.app/charlyMCPeditor.html) · `session_mu1nhiu3_bzwexn` | 0.00 |
| 18/09/2026 | mserrano@asc.education | Tercero · Comprension Lectora · U3 / session_mu7e5wjo_vj71nb | Sin unidad | — | — | 0 | 0 | 0 | No | 0 | [Abrir editor](https://charly-brown.web.app/charlyMCPeditor.html) · `session_mu7e5wjo_vj71nb` | 0.00 |
| 28/09/2026 | CCRUZ@ASC.EDUCATION | Un proyecto interesante / session_mulmxdje_85twsm | Unidad 1 | Primaria / Primero / 2 | Proyectos, Artes, Ortografía, TrazosDeLetras, ComprensionLectora, ExpresionOral, Habilidades, ConocimientoDelMedio, CivicaEtica, Socioemocional, Matemáticas, Matematicas | 16 | 20 | 16 | Sí | 23 | [Abrir editor](https://charly-brown.web.app/charlyMCPeditor.html) · `session_mulmxdje_85twsm` | 111.06 |
| 30/09/2026 | wlopez@asc.education | La Edad Media: ciencia y creencia / session_muo6ijmw_s10kn6 | Unidad 1 | Primaria / Sexto / 3 | Proyectos, Artes, Ortografía, Gramatica, ExpresionEscrita, ComprensionLectora, ExpresionOral, Habilidades, Dictado, Naturales, Historia, Geografia, CivicaEtica, Socioemocional, Matematicas | 5 | 0 | 0 | Sí | 0 | [Abrir editor](https://charly-brown.web.app/charlyMCPeditor.html) · `session_muo6ijmw_s10kn6` | 0.00 |

**Corrección de lectura de columnas:** en esta tabla, “Sesión / ID” identifica el contenedor y “Unidad” la unidad guardada. La unidad “Un proyecto interesante” conserva 16 actividades, 20 recursos, 16 notas docentes y 23 archivos de imagen (`image/png` o `image/jpeg`); sus otros 6 recursos adjuntos son PDF y quedan excluidos del conteo de imágenes. Los temas son etiquetas registradas y pueden tener variantes ortográficas. Las sesiones sin unidad son borradores. El enlace abre el editor; el ID permite localizar la sesión tras iniciar sesión, pues no se confirmó un parámetro público de acceso directo.

### Science Activities

| Fecha | Creador | Registro | Tipo | Costo aprox. MXN |
|---|---|---|---|---|
| 25/09/2026 | wlopez@asc.education | Proyectiles: laboratorio interactivo | simulator | ND |
| 25/09/2026 | wlopez@asc.education | Proyectiles: laboratorio interactivo | simulator | ND |

Los dos registros son pruebas con el mismo título y no corresponden a los 26 renglones de actividades ni a los 8 renglones de simuladores de Trim. 2 en la hoja. **Gasto atribuible al editor: no separable de la factura.** El avance curricular de ambas hojas es 0% al corte.

### Generar Lectura

| Fecha | Creador | Título | ID / colección | Nivel | Grado | Trim. | Texto guardado | Enlace | Costo aprox. MXN |
|---|---|---|---|---|---|---|---|---|---|
| 18/09/2026 | mserrano@asc.education | La gota que encontró su camino | wCo22Yavam558iY6IeRi / lecturasASC | Primaria | 3 | 3 | Sí | [Abrir editor](https://charly-brown.web.app/generarLectura.html) · `wCo22Yavam558iY6IeRi` | ND: sin tokens por lectura |
| 14/09/2026 | wlopez@asc.education | El secreto de los delfines en altamar | sRvkYrq1jVk17mA2J8TI / lecturasNuevas | Primaria | Tercero | 2 | Sí | [Abrir editor](https://charly-brown.web.app/generarLectura.html) · `sRvkYrq1jVk17mA2J8TI` | ND: sin tokens por lectura |

Hay 1 lectura de `mserrano@asc.education` y 1 de `wlopez@asc.education`. Las colecciones `lecturas`, `analisisLecturas` y `conversacionIA` no tienen registros fechados en septiembre al corte. Guardar la lectura no revela el modelo, tokens ni SKU usados; **no se puede asignar un costo monetario exacto por usuario**.

### Image Creator

| Fecha | Creador | Sesión / ID | Imágenes | Modelos | Enlace | Costo aprox. imágenes MXN |
|---|---|---|---|---|---|---|
| 07/09/2026 | wlopez@asc.education | crea una imagen de una montaña hundida en el mar estilo acua / lRPGUysMrFnGLnE0uiOJ | 1 | gemini-3-pro-image: 1 | [Abrir editor](https://charly-brown.web.app/imageCreator.html) · `lRPGUysMrFnGLnE0uiOJ` | 4.83 |
| 07/09/2026 | ipech@asc.education | Qumica, Practica 1, tema 1 / rJ0hj9b1SImnNKxff2Vq | 13 | gemini-3.1-flash-image: 13 | [Abrir editor](https://charly-brown.web.app/imageCreator.html) · `rJ0hj9b1SImnNKxff2Vq` | 62.77 |
| 09/09/2026 | ipech@asc.education | Quimica. Practica 2, tema 1 / R7aDxkiWHWx4xu4xbLAY | 2 | gemini-3-pro-image: 2 | [Abrir editor](https://charly-brown.web.app/imageCreator.html) · `R7aDxkiWHWx4xu4xbLAY` | 9.66 |
| 10/09/2026 | wlopez@asc.education | añadir el texto Informar \| Conocer \| Descubrir en la parte / Lgn1JSh0Ho63Jts2bAiR | 4 | gemini-3.1-flash-image: 3; gemini-3-pro-image: 1 | [Abrir editor](https://charly-brown.web.app/imageCreator.html) · `Lgn1JSh0Ho63Jts2bAiR` | 19.31 |
| 14/09/2026 | amartinez@asc.education | haz una imagen tipo caricatura, usando de referencia. Ojo us / 0UFBctmJ5dPkWGK7rTNN | 1 | gemini-3-pro-image: 1 | [Abrir editor](https://charly-brown.web.app/imageCreator.html) · `0UFBctmJ5dPkWGK7rTNN` | 4.83 |
| 14/09/2026 | amartinez@asc.education | haz una imagen tipo caricatura, usando de referencia. Ojo us / AuDJxOMvyhsL9hyQnQ6O | 6 | gemini-3.1-flash-image: 6 | [Abrir editor](https://charly-brown.web.app/imageCreator.html) · `AuDJxOMvyhsL9hyQnQ6O` | 28.97 |
| 14/09/2026 | amartinez@asc.education | haz una imagen tipo caricatura, usando de referencia el text / 87kvEQSY1wzxbLQ8acnY | 5 | gemini-3.1-flash-image: 5 | [Abrir editor](https://charly-brown.web.app/imageCreator.html) · `87kvEQSY1wzxbLQ8acnY` | 24.14 |
| 14/09/2026 | amartinez@asc.education | Nueva sesión / 3MCjThsJ9FOLiZzxKJea | 0 | — | [Abrir editor](https://charly-brown.web.app/imageCreator.html) · `3MCjThsJ9FOLiZzxKJea` | 0.00 |
| 14/09/2026 | amartinez@asc.education | haz una imagen tipo caricatura, usando de referencia el text / 1yuPbwFEsinkZKZ2k8nW | 4 | gemini-3.1-flash-image: 4 | [Abrir editor](https://charly-brown.web.app/imageCreator.html) · `1yuPbwFEsinkZKZ2k8nW` | 19.31 |
| 29/09/2026 | wlopez@asc.education | Nueva sesión / od00wme3FGJmjUk8maDi | 0 | — | [Abrir editor](https://charly-brown.web.app/imageCreator.html) · `od00wme3FGJmjUk8maDi` | 0.00 |
| 29/09/2026 | wlopez@asc.education | Nueva sesión / 9oTn9twcNtoye3UnCwmg | 0 | — | [Abrir editor](https://charly-brown.web.app/imageCreator.html) · `9oTn9twcNtoye3UnCwmg` | 0.00 |

### Marcie Blog Editor (pruebas)

| Fecha | Creador | Sesión / ID | Estado | Público y título de cada versión | Bloques | Enlace | Costo aprox. MXN |
|---|---|---|---|---|---|---|---|
| 07/09/2026 | auribe@asc.education | IA como tutor personalizado: el futuro del aprendizaje ya está aquí / CGgxDK6r0fY07aepFlsn | published | educators: IA como tutor personalizado: el futuro del aprendizaje ya está aquí | 4 | [Abrir editor](https://charly-brown.web.app/MarcieBlogEditor.html) · `CGgxDK6r0fY07aepFlsn` | ND: sin tokens por versión |
| 08/09/2026 | wlopez@asc.education | Investigación Aida: como aprende el cerebro / fBbJBBtT470jWtwMVVvI | review_required | students: Diseña tu propio mapa mental: entiende cómo funciona tu cerebro para estudiar menos y comprender mejor | 7 | [Abrir editor](https://charly-brown.web.app/MarcieBlogEditor.html) · `fBbJBBtT470jWtwMVVvI` | ND: sin tokens por versión |
| 08/09/2026 | wlopez@asc.education | Investigación Aida: como aprende el cerebro / fBbJBBtT470jWtwMVVvI | review_required | parents: ¿Por qué mi hijo olvida lo que estudia en casa y cómo ayudar a su cerebro a recordarlo? | 7 | [Abrir editor](https://charly-brown.web.app/MarcieBlogEditor.html) · `fBbJBBtT470jWtwMVVvI` | ND: sin tokens por versión |
| 08/09/2026 | mserrano@asc.education | IA como tutor personalizado: el futuro del aprendizaje ya está aquí / yl9Qsg9euRwdsAoVvfc0 | published | educators: IA como tutor personalizado: el futuro del aprendizaje ya está aquí | 4 | [Abrir editor](https://charly-brown.web.app/MarcieBlogEditor.html) · `yl9Qsg9euRwdsAoVvfc0` | ND: sin tokens por versión |
| 15/09/2026 | wlopez@asc.education | Cuando el diseño didáctico persigue fantasmas: el dilema de etiquetar cómo aprende cada estudiante / 0wt2qSe2V4H3cJ2ZBiiB | review_required | students: Hackea tu propia mente: cómo estudiar menos horas y aprender de verdad | 7 | [Abrir editor](https://charly-brown.web.app/MarcieBlogEditor.html) · `0wt2qSe2V4H3cJ2ZBiiB` | ND: sin tokens por versión |
| 15/09/2026 | wlopez@asc.education | Cuando el diseño didáctico persigue fantasmas: el dilema de etiquetar cómo aprende cada estudiante / 0wt2qSe2V4H3cJ2ZBiiB | review_required | parents: Cuando la libreta pesa más que el cansancio: el peligro de ignorar el descanso mental en casa | 7 | [Abrir editor](https://charly-brown.web.app/MarcieBlogEditor.html) · `0wt2qSe2V4H3cJ2ZBiiB` | ND: sin tokens por versión |
| 15/09/2026 | wlopez@asc.education | Cuando el diseño didáctico persigue fantasmas: el dilema de etiquetar cómo aprende cada estudiante / 0wt2qSe2V4H3cJ2ZBiiB | review_required | coordinators: La parálisis institucional ante el peso de los neuromitos y la urgencia de rediseñar la planeación curricular | 7 | [Abrir editor](https://charly-brown.web.app/MarcieBlogEditor.html) · `0wt2qSe2V4H3cJ2ZBiiB` | ND: sin tokens por versión |
| 15/09/2026 | wlopez@asc.education | Cuando el diseño didáctico persigue fantasmas: el dilema de etiquetar cómo aprende cada estudiante / 0wt2qSe2V4H3cJ2ZBiiB | review_required | educators: Cuando el diseño didáctico persigue fantasmas: el dilema de etiquetar cómo aprende cada estudiante | 8 | [Abrir editor](https://charly-brown.web.app/MarcieBlogEditor.html) · `0wt2qSe2V4H3cJ2ZBiiB` | ND: sin tokens por versión |
| 22/09/2026 | wlopez@asc.education | Neurobiología del rechazo verbal y su impacto en la capacidad de aprendizaje / 1Mp6MTxPTqznCgz9NL0t | new | Sin versión con contenido | 0 | [Abrir editor](https://charly-brown.web.app/MarcieBlogEditor.html) · `1Mp6MTxPTqznCgz9NL0t` | ND |
| 24/09/2026 | wlopez@asc.education | Bases neurobiológicas del diálogo interno y su impacto en la autorregulación del estudiante / GzQ5nIgmZBtY2OCHXNGD | researching | parents: Descubre cómo las palabras en casa modelan la estructura cerebral fomentando una sana autorregulación cognitiva | 10 | [Abrir editor](https://charly-brown.web.app/MarcieBlogEditor.html) · `GzQ5nIgmZBtY2OCHXNGD` | ND: sin tokens por versión |
| 24/09/2026 | wlopez@asc.education | Bases neurobiológicas del diálogo interno y su impacto en la autorregulación del estudiante / GzQ5nIgmZBtY2OCHXNGD | researching | educators: Optimiza la retroalimentación en el aula fortaleciendo el circuito prefrontal-amigdalino mediante lenguaje constructivo | 18 | [Abrir editor](https://charly-brown.web.app/MarcieBlogEditor.html) · `GzQ5nIgmZBtY2OCHXNGD` | ND: sin tokens por versión |
| 24/09/2026 | wlopez@asc.education | El error de ignorar el dolor social: por qué la crítica punitiva en el aula bloquea la corteza prefrontal y frena el aprendizaje / s051BL32RIieJVsN2LGm | review_required | educators: El error de ignorar el dolor social: por qué la crítica punitiva en el aula bloquea la corteza prefrontal y frena el aprendizaje | 14 | [Abrir editor](https://charly-brown.web.app/MarcieBlogEditor.html) · `s051BL32RIieJVsN2LGm` | ND: sin tokens por versión |
| 24/09/2026 | wlopez@asc.education | El error de ignorar el dolor social: por qué la crítica punitiva en el aula bloquea la corteza prefrontal y frena el aprendizaje / s051BL32RIieJVsN2LGm | review_required | parents: Cómo el diálogo familiar positivo fortalece la memoria y el desarrollo cerebral de tus hijos desde la neurociencia | 17 | [Abrir editor](https://charly-brown.web.app/MarcieBlogEditor.html) · `s051BL32RIieJVsN2LGm` | ND: sin tokens por versión |
| 28/09/2026 | auribe@asc.education | neuroplasticidad en diversas etapas de la vida / VQ9F0qIxvx9J8Cg6F1Si | review_required | educators: Estrategias prácticas para estimular la flexibilidad cerebral en cada etapa escolar. | 16 | [Abrir editor](https://charly-brown.web.app/MarcieBlogEditor.html) · `VQ9F0qIxvx9J8Cg6F1Si` | ND: sin tokens por versión |

Se conservan 13 versiones con contenido en 8 sesiones nuevas. El campo de estado `published` de dos versiones no cambia su clasificación editorial de pruebas para este informe.

### Moodle Course

| Fecha | Creador | Curso | Temas | Subtemas | Módulos enlazados | Costo aprox. MXN |
|---|---|---|---|---|---|---|
| 07/09/2026 | ipech@asc.education | Química, Bloque 2 | 1 | 3 | 6 | ND |
| 14/09/2026 | amartinez@asc.education | Biologia Bloq 2 | 2 | 2 | 8 | ND |

## Anexo D. Gasto por creador: evidencia disponible

La columna de Veo distribuye **MXN 8,387.00** del SKU de generación de video por duración de los trabajos guardados. La columna de imágenes presenta un **escenario hipotético de reparto** de los MXN 3,718.05 del SKU de salida de imágenes; sus importes por fila no constan en Cloud Billing. Los productos de texto y audio quedan con “ND” porque no se guardaron unidades facturables por operación. Un valor 0.00 en una tabla significa que no se identificó una unidad de los dos SKU repartidos; **no significa que crear esa sesión haya sido gratuito**. El total de Google Cloud permanece **MXN 20,277.33**, de los cuales solo Veo tiene una base de atribución relativamente sólida. Render también permanece pendiente de factura.

### Escenario parcial por creador

| Creador | Veo estimado MXN | Unidades visuales observadas | Imagen imputada MXN | Subtotal parcial hipotético MXN |
|---|---|---|---|---|
| amartinez@asc.education | 0.00 | 16 | 77.26 | 77.26 |
| ccruz@asc.education | 0.00 | 23 | 111.06 | 111.06 |
| ipech@asc.education | 0.00 | 15 | 72.43 | 72.43 |
| mserrano@asc.education | 0.00 | 0 | 0.00 | 0.00 |
| rmora@asc.education | 5,430.04 | 455 | 2,197.03 | 7,627.07 |
| wlopez@asc.education | 2,956.96 | 261 | 1,260.27 | 4,217.23 |

**Conciliación del escenario:** MXN 12,105.05 distribuidos entre Veo e imagen, frente a MXN 20,277.33 facturados en Google Cloud. Quedan MXN 8,172.28 fuera de este modelo (otros SKU, servicios y redondeos). Esta tabla no equivale a gasto facturado por empleado: la parte de imágenes depende de una regla de reparto y las actividades no guardadas o eliminadas no figuran en el inventario.

## Evidencias y criterios de reproducción

- Firestore de producción: [inventario agregado](september-2026-data.json), [detalle de productos](september-2026-details.json), [escenas y generaciones](september-2026-scenes.json), [audio y referencias de Podcaster](september-2026-podcaster-media.json), [histórico mensual](september-2026-history.json), [lecturas](september-2026-reading.json) y [PigPen histórico](september-2026-pigpen-progress.json).
- Charly MCPEditor: [detalle de sesiones, unidades y tipos de archivos](september-2026-charly-details.json); solo `image/png` y `image/jpeg` cuentan como imágenes adjuntas.
- Planeación: [Google Sheet fuente](https://docs.google.com/spreadsheets/d/1KeIukb-Cu_iv9eiJii3Jg1O2P4-bMgaE7K2OvKSgerg/edit) y [extracto de comparación](september-2026-plan.json).
- Scripts de solo lectura: `scripts/report-september-2026*.cjs`. No se consultó una exportación de Cloud Billing por evento o usuario porque no estaba disponible.
- Corte de actividad: 30/09/2026, 11:29 h de Cancún. Los documentos eliminados antes del corte no pueden reconstruirse del estado actual. Las cifras de Cloud Billing son provisionales y pueden cambiar con el cierre.
