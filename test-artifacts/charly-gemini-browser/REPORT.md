# Auditoría de imágenes Gemini en Charly MCP Editor

Fecha: 2026-09-27

## Resultado real en navegador

- Sesión: `session_mujhqtj1_qcvtxa`
- Unidad: `unit_mujwfus1_yk113p` — **La promesa**
- Ejecución: `52ab17c6-5482-4cc7-a644-6cfd06f60a8c`
- Estado final: **completed**
- Checkpoints terminados: **52/52**
- Desglose: 16 actividades, 6 fichas, 6 anexos, 6 recortables, 2 guiones de video y 16 notas del maestro.
- El recortable regenerado fue revisado visualmente y aprobado desde Chrome.

## Causa raíz

1. Los contratos anteriores permitían que el resultado visual se resolviera con construcciones programáticas o composiciones demasiado simples.
2. La revisión visual aceptaba falsos positivos porque no exigía campos verificables para texto impreso, marcos geométricos, iconos genéricos, calidad editorial y contornos de silueta.
3. El cliente MCP conservaba el timeout predeterminado de 60 segundos, menor que el tiempo normal de una generación y revisión de imagen.
4. La recuperación local podía programar el mismo checkpoint más de una vez al consultar el estado.
5. Una tarea terminal podía dejar la ejecución sin transición clara a `needs_attention`.

## Correcciones verificadas

- Lecturas, anexos y recortables usan una imagen raster generada por Gemini.
- Los contratos rechazan anexos o recortables sin PNG, JPEG o WebP y rechazan HTML con SVG o canvas.
- Cadena de costo: `gemini-3.1-flash-lite-image` → `gemini-3.1-flash-image` → `gemini-3-pro-image`.
- Sólo se escala al modelo siguiente ante cuota o HTTP 429.
- Revisión editorial estructurada y obligatoria antes de aceptar la imagen.
- Hasta cuatro regeneraciones visuales para recortables rechazados.
- Timeout MCP ampliado para cubrir generación y revisión.
- Checkpoints idempotentes, recuperación de leases, reintentos acotados y estado `needs_attention`.

## Alineación con documentación oficial

- Los identificadores de modelo son versiones GA actuales.
- Flash Lite se limita a 1K, como especifica Google.
- Se usa `responseModalities: ["TEXT", "IMAGE"]` y `imageConfig` con relación de aspecto y resolución.
- Los errores transitorios tienen reintentos acotados; el cambio a un modelo más caro ocurre únicamente por cuota.
- La ruta interactiva usa `generateContent`, adecuada cuando el usuario espera el resultado en la sesión.
- Para lotes no urgentes y de gran tamaño, Google recomienda Batch API: 50% del costo estándar, mayor capacidad y hasta 24 horas de entrega. La ejecución interactiva de una unidad no debe migrarse automáticamente a Batch porque rompería la expectativa de resultado inmediato. Conviene ofrecer Batch como modo separado para producción editorial nocturna o masiva.

## Comparación con otros generadores del proyecto

- `imageCreator.html` usa Gemini raster y una configuración oficial, pero genera hasta cuatro imágenes en llamadas secuenciales y no usa Batch API.
- `podcaster.html` todavía prioriza `gemini-2.5-flash-image` y contiene modelos preview retirados en su cadena de retratos; no está alineado con el catálogo GA actual.
- Los agentes de recursos de Charly quedaron alineados con el catálogo actual y con la política solicitada de costo ascendente.

## Evidencia visual

- `unit2-reading-gemini.jpg`
- `unit2-annex-gemini.png`
- `unit2-cutout-gemini.jpg`

## Documentación oficial consultada

- https://ai.google.dev/gemini-api/docs/image-generation
- https://ai.google.dev/gemini-api/docs/batch-api
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/troubleshooting
- https://ai.google.dev/gemini-api/docs/changelog
