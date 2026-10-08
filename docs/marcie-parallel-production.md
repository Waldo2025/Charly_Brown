# Producción persistente de Marcie

## Activación

La implementación está desactivada por defecto. Requiere `MARCIE_PARALLEL_PRODUCTION=true` en geminiApi, dispatchMarcieProductionTask y recoverMarcieProductions, y `window.__CHARLY_CONFIG__.marcieParallelProduction=true` en el frontend. No activar el frontend antes del worker, la cola y los permisos. Las producciones existentes con `engine=persistent` siguen consultándose aunque se desactive la bandera del frontend; para revertir, desactivar primero nuevas producciones en el frontend y dejar terminar las iniciadas.

Preparación, sin despliegue automático:

1. Ejecutar `node scripts/build-marcie-production-draft.cjs --check`. El adaptador del servidor se genera desde el redactor por partes del navegador; no modificar su copia generada manualmente.
2. Crear una cola exclusiva en el proyecto/entorno de prueba:

```sh
gcloud tasks queues create marcie-production --project=charly-brown --location=us-central1 --max-concurrent-dispatches=10 --max-dispatches-per-second=10 --min-backoff=10s --max-backoff=300s --max-attempts=-1
```

3. La cuenta `charly-functions-ai@charly-brown.iam.gserviceaccount.com` necesita permisos para leer/escribir Firestore, invocar Vertex, guardar imágenes, crear tareas en esa cola y actuar como `charly-tasks-invoker@charly-brown.iam.gserviceaccount.com`. El invocador necesita invocar exclusivamente `dispatchMarcieProductionTask`. Mantener el worker privado; el encabezado Cloud Tasks no sustituye IAM.
4. Desplegar las nuevas funciones, geminiApi, reglas Firestore y hosting mediante el procedimiento del proyecto, primero en un entorno de prueba. En el backend alternativo las rutas se registran con el agente existente, pero la ejecución usa el worker de Cloud Tasks; no hay un ejecutor local implícito.
5. Validar producción de uno y cuatro públicos, desconexión/recarga, cancelación, cuota y edición simultánea antes de activar para usuarios.

## Contratos

`POST /api/marcie/production/start` recibe `{sessionId}`. `status`, `resume` y `cancel` reciben `{productionId}`. Todos requieren token Firebase, acceso editorial y propiedad de la sesión. MCP expone `start_production`, `get_production`, `resume_production`, `cancel_production` con los mismos contratos y coordinador. La herramienta compatible `draft_articles` acepta `sessionId` para delegar a la producción persistente; sin él sigue siendo una operación sin persistencia. Con la bandera activa usa el mismo núcleo de redacción por partes.

Las respuestas incluyen estado, fechas, tareas resumidas y sesión actual. Los resultados internos se guardan en `MarcieProductionRuns/{id}/tasks/{taskId}`; el navegador no escribe esas colecciones. El ID de ejecución depende de sesión, configuración y comienzo de producción; las solicitudes duplicadas recuperan la misma ejecución. Cada intento posee un token y una época: los resultados anteriores a una cancelación o recuperación se descartan.

El contador muestra tiempo de pared `HH:MM:SS`: incluye reintentos y desconexiones. Se congela al completar/cancelar y se reinicia al regenerar. Las sesiones anteriores sin hora de inicio comienzan a medir cuando se reanudan; no se inventa una duración histórica.

## Límites y calidad

Hasta diez tareas con llamadas al proveedor a la vez para el coordinador, compartidas entre sesiones mediante permisos transaccionales. Sub-límites: validación/lectura 6, redacción 4, portadas 2. Los distintos tipos de revisión comparten el mismo presupuesto. Las búsquedas se dimensionan por faltantes y se dejan de iniciar cuando todos los públicos ya tienen un borrador en ejecución. La selección común agrupa los públicos en una llamada para no repetir la clasificación global.

Las fuentes pasan el verificador existente, se deduplican y se clasifican antes de redactar. Las correcciones tienen un único escritor y una segunda revisión. Los artículos con observaciones siguen sujetos a revisión humana. Publicación y aprobación mantienen sus contratos actuales.

La cola conserva el orden de despacho; los límites de cuota y el monitor de un minuto pueden añadir espera. Los límites de concurrencia no son una promesa de velocidad. Las herramientas antiguas invocadas fuera de una producción persistente conservan su comportamiento de compatibilidad.

## Verificación

Ejecutar las pruebas `functions/test/marcie-*.test.js`, las de rutas MCP de Charly, `backend/charly-brown-mcp.test.js`, `backend/sally/test/mcp.test.js` y las pruebas de Cloud Tasks. Las nuevas pruebas cubren idempotencia, límites, aislamiento por público, errores 429/503, checkpoints, cancelación, integración de artículos sin sobrescrituras y una producción completa con proveedor simulado.

Antes de activar, medir con un proveedor real en el entorno de prueba: tiempo total por producción, latencia por tarea, intentos, candidatos únicos, fuentes válidas por público y hallazgos pendientes. Comparar el mismo tema/configuración con el motor previo. Las pruebas locales simuladas no validan cuotas reales, IAM desplegado ni calidad factual del proveedor.

## Corrección del flujo HTTP compatible (24 de septiembre)

Sin activar la cola persistente, la investigación HTTP usa ahora un pool de hasta 10 llamadas de investigación por proceso, en lugar de una única promesa serial. Busca simultáneamente en las plataformas seleccionadas según los documentos faltantes; no obliga a lanzar diez consultas. La recuperación de documentos mantiene su límite de seis y las verificaciones editoriales no se omiten. Este pool local no constituye el límite distribuido entre todas las instancias y etapas del coordinador persistente.

Las llamadas de IA tienen un límite de 60 segundos con señal de cancelación. Las rutas de investigación y selección cancelan su trabajo a los 210 segundos, antes del timeout del navegador (240 segundos), y al desconectarse el cliente. La cancelación se transmite al SDK; una respuesta tardía no se entrega al solicitante. Los resultados globales se guardan antes de seleccionar por público, con su fingerprint, para que un fallo de selección no reinicie el descubrimiento. La interfaz muestra ese cambio de etapa y el número de fuentes guardadas.

La corrección requiere desplegar el backend y el frontend; no modifica por sí sola una pestaña o función ya desplegada. Verificar latencias y cuotas reales antes de atribuirle una mejora de duración concreta.
