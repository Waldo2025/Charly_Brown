# Sally: control manual y lectura de pestañas

## Síntoma

El control manual acumulaba retraso. El análisis omitía recursos que solo
aparecían al abrir pestañas o subpestañas.

## Reproducción

- Entrada: ráfaga de 50 eventos de rueda y escritura secuencial.
- Curso: fixture con siete vistas, donde las últimas dos se descubren al abrir
  otras pestañas; fixture adicional con botones y contenido AJAX.
- La prueba AJAX detectó que `networkidle` de una vista anterior no garantiza
  que la pestaña recién activada haya terminado de cargar.

## Hallazgos

1. Una petición autenticada y una captura por cada evento, en una cola serial.
2. Sondeo visual cada tres segundos y respuestas de captura sin orden temporal.
3. Extracción de la página inicial, sin recorrer enlaces de sección ni controles
   de pestaña. Los recursos ausentes de ese DOM nunca entraban en el inventario.

## Hipótesis probadas

- Exceso de viajes HTTP: confirmado mediante coalescencia de una ráfaga de 50
  eventos en una sola petición, manteniendo desplazamiento y orden.
- Falta de navegación: confirmado al recuperar siete vistas y sus siete recursos.
- Carrera con AJAX: confirmada y corregida esperando solicitudes actuales y
  estabilidad del contenido después de cada activación.

## Causa raíz

El transporte trataba cada evento como una operación independiente con captura,
y el analizador trataba la vista inicial como la estructura completa del curso.

## Fix

- Lotes ordenados de entrada, combinación de texto/scroll adyacente y una captura
  por lote; cadencia activa de captura de 300 ms y sondeo de 250 ms, sin garantía
  de latencia final. Autorización Firebase y participación por petición intactas.
- Rechazo de capturas antiguas, atajos Ctrl/Cmd y reactivación del sondeo al volver
  a la ventana. No se crean miniaturas de evidencia por cada tecla.
- Adaptador de enlaces de sección y pestañas, controles dinámicos y padres,
  detección del formato, resúmenes de sección y deduplicación de actividades.
- Cobertura explícita; restricciones, límites y errores dejan lectura parcial.

Las clases del adaptador Onetopic se contrastaron con las
[plantillas originales del plugin](https://github.com/davidherney/moodle-format_onetopic/tree/master/templates/courseformat).

## Validación

Pasaron `test-sally-tabs.mjs`, `test-sally-lazy-tabs.mjs`,
`test-sally-manual-input.mjs`, `test-sally-remote.mjs`,
`test-sally-analysis-flow.mjs`, `test-sally-content-edit.mjs`,
`test-sally-session-reuse.mjs`, `test-sally-redesign.mjs`,
`test-sally-report.mjs`, `test-sally-history.mjs`, `test-sally-chat-routing.mjs`,
`test-sally-session-selection.mjs`, `test-sally-brown-editor.mjs` y pruebas HTTP
del backend. El lote manual local medido estuvo entre 114 y 384 ms en ejecuciones
de prueba; no es una medición de la conexión del usuario.

Cloud Run publicado: `sally-browser-00010-r5m`, 100 % del tráfico. El preflight
desde `http://127.0.0.1:5010` respondió 204.

## Riesgos / regresiones

Falta certificar el tema/plugin real del Moodle privado. Máximo 250 vistas por
análisis; una vista desconocida, inaccesible o que no termina de cargar se informa
como pendiente, sin eludir permisos. Los formatos personalizados sin enlaces o
semántica de pestaña reconocible pueden necesitar otro adaptador. Los inventarios
anteriores requieren un nuevo análisis. Publicar el servidor puede cerrar la
sesión Moodle. No se modifican estilos globales ni reglas de Firebase.
