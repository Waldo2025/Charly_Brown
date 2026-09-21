## Síntoma
Correos de cuota Vertex por un solo HTTP 429; el proxy descartaba el diagnóstico original del proveedor.

## Reproducción
Consulta de Cloud Logging y de las APIs de Monitoring/Logging en charly-brown. La revisión geminiapi-00085-bog registró dos HTTP 429 el 11 de septiembre, a las 22:15 y 22:17 UTC, seguidos por siete respuestas 200. La métrica incluía cualquier HTTP 429 de Cloud Run y la condición era suma mayor que cero en 300 segundos.

## Hallazgos
La política no tenía gravedad. El filtro no identificaba al proveedor. El backend devolvía un mensaje fijo de cuota agotada sin registrar los detalles originales.

## Hipótesis probadas
El aviso por fallos aislados quedó confirmado por el filtro y el umbral efectivos. No se pudo determinar si los errores originales fueron cuota específica o capacidad compartida porque no se conservaba el detalle de Vertex.

## Causa raíz
Configuración demasiado amplia de la alerta y pérdida de información en el manejo de errores del proxy. No hay evidencia suficiente para atribuir el 429 original a un límite concreto.

## Fix
- Registro estructurado terminal vertex_resource_exhausted con modelo efectivo, requestId, estado, mensaje, violaciones de cuota y retryDelay cuando el proveedor los entrega. No incluye cuerpos de solicitudes ni encabezados; sanea y limita los mensajes.
- El mensaje HTTP diferencia cuota o capacidad temporal; mantiene el código de error compatible con clientes.
- Métrica restringida al evento estructurado o mensajes explícitos de Vertex/RESOURCE_EXHAUSTED. Excluye HTTP 429 genéricos y no cuenta dos veces el registro de acceso.
- Política renombrada Google Cloud - fallos reiterados de Vertex, gravedad WARNING, umbral >=3 en 300 segundos, agrupada por servicio/proyecto/ubicación. Conserva canales, estado y estrategia de cierre.
- Script reproducible: node scripts/configure-google-cloud-alerts.mjs --execute --vertex-only. Actualiza la política existente sin duplicarla.
- Desplegado únicamente geminiApi a partir de la fuente previamente desplegada más el parche del endpoint y el nuevo módulo. Revisión geminiapi-00086-row, ACTIVE, 100% del tráfico. No se desplegaron otros cambios locales.

## Validación
9 pruebas aprobadas: node --test tests/vertex-alerts.test.mjs functions/test/vertex-diagnostics.test.js tests/pigpen-single-room-request.test.mjs.
Cubren conservación/saneamiento del diagnóstico, ausencia de reintentos singleAttempt, secuencia y checkpoint por sala, umbral, y un solo evento por fallo terminal. Fallback exitoso no genera evento de fallo.
Lectura posterior de las APIs confirmó umbral, gravedad, filtro y conservación exacta de canales y estrategia. Endpoint /api/health devolvió HTTP 200 tras el despliegue.
Copias de configuración previa en /private/tmp/pigpen-vertex-alert-before-policy.json y /private/tmp/pigpen-vertex-alert-before-metric.json.

## Riesgos / Regresiones
Esto corrige diagnóstico y alertas; no aumenta cuotas ni garantiza capacidad de Vertex. No se forzó un 429 real ni se enviaron solicitudes de generación para probar el correo. El siguiente fallo real aportará el detalle disponible del proveedor. Si Vertex sólo entrega un mensaje genérico, la causa seguirá indeterminada. La nueva métrica no reconstruye retroactivamente eventos anteriores y requiere que errores de otros servicios identifiquen explícitamente a Vertex.
