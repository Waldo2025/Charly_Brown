# Sally: conversaciones separadas y reversión

## Síntoma

Consultar el curso modelo podía exigir URL destino. El historial no tenía
conversaciones separadas ni un flujo de reversión de cambios.

## Reproducción

La ruta anterior de `buildPlan` dependía de `isAnalysisOnly`: cualquier petición
fuera de su lista de verbos entraba en propuesta y exigía inventario destino.
El caso mínimo «muéstrame el módulo» en Modelo reproduce esa clasificación.

## Hallazgos

1. Un único brief y una lista de mensajes mezclaban ambos contextos.
2. La consulta terminaba en un reporte de inventario, sin responder la pregunta.
3. No había respaldo duradero del HTML y visibilidad anterior a la aprobación.

## Hipótesis probadas

La clasificación por palabras y la falta de contexto de pestaña causaban la
dependencia innecesaria de Destino. Confirmado mediante casos de consulta sin
URL destino, transferencia explícita y modificación en Destino.

## Causa raíz

Se compartía la ruta de planificación de cambios con la consulta del modelo.
No existía un contrato separado para lectura, conversaciones o reversión.

## Fix

- Pestañas Modelo/Destino, borradores y registros independientes.
- Lectura del modelo sin destino; cambios únicamente como planes de destino.
- Respuesta generada completa; aviso si el proveedor interrumpe la generación.
- Referencias explícitas entre chats, sin ejecutar cambios.
- Respaldo previo a aprobar ediciones HTML existentes, validación del hash antes
  de escribir y registro del contenido resultante en Storage privado.
- Reversión aprobable, con rechazo ante cambios posteriores en Moodle.

## Validación

Pasaron `test-sally-chat-routing.mjs`, `test-sally-redesign.mjs`,
`test-sally-history.mjs`, `test-sally-content-edit.mjs`,
`test-sally-analysis-flow.mjs`, `test-sally-session-reuse.mjs`,
`test-sally-remote.mjs`, `test-sally-report.mjs`,
`test-sally-session-selection.mjs`, `test-sally-brown-editor.mjs`
y `npm test --prefix backend/sally`.

Las pruebas de interfaz usan Chromium y las de edición un formulario Moodle
simulado. La reversión restaura HTML/visibilidad y rechaza un cambio posterior.
Cloud Run: `sally-browser-00009-qwr`, 100 % del tráfico; OPTIONS remoto: 204.

## Riesgos / regresiones

No se certificó el Moodle privado del usuario. Reversión automática limitada a
ediciones de recursos HTML compatibles cuyo original conserva el saneamiento.
Nuevos recursos, secciones, selecciones complejas y actividades sin adaptador
requieren restauración manual. Los respaldos quedan en el historial. No es un
backup integral de Moodle ni una transacción; una caída durante el guardado
puede requerir inspección manual. Reiniciar Cloud Run puede cerrar el login
Moodle. No se cambiaron estilos globales ni reglas de acceso.
