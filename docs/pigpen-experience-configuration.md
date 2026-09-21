# Preguntas y recompensas de PigPen

Implementación local, 10 de septiembre de 2026.

## Flujo

Al aplicar una fila de Sheets, se carga el brief y se cierra el importador. Después aparece «Configurar preguntas y recompensas». Sólo Guardar y continuar permite ejecutar las acciones automáticas de enriquecimiento y generación que estuvieran marcadas. Cancelar conserva el brief e impide continuar hasta configurar. El botón «Preguntas y recompensas» permite reabrirlo.

Los ocho clásicos y las letras están seleccionados inicialmente. Las preguntas escritas clásicas esperan palabras, números o códigos exactos. Los 18 tipos nuevos usan controles cerrados y validación local. Las selecciones definen un conjunto permitido, sin aumentar el número de preguntas. Se conserva la configuración en formulario, sesión, objetivo y proyecto.

## Catálogo nuevo

Selección múltiple de respuestas; respuesta y justificación; marcar evidencia; clasificar en grupos; matriz de deducción; completar patrones; construir expresiones; ubicar en una escala; localizar y sustituir errores; predecir resultados; completar analogías; seleccionar contraejemplos; comparar atributos; completar diagramas; resolver restricciones; seleccionar información suficiente; responder por coordenadas; balancear cantidades.

Las soluciones, fichas, destinos y reglas se almacenan en `interaction_data` versión 1. El compilador produce ese contrato y la materialización de preguntas lo conserva. Las expresiones usan un intérprete aritmético limitado, sin ejecutar código. Las respuestas de selección múltiple exigen el conjunto exacto; las alternativas se declaran explícitamente. Restricciones y operaciones admiten cualquier solución que satisfaga sus reglas.

## Recompensas

Una principal: letras, fragmentos de imagen, símbolos cifrados, coordenadas, pistas de posición o patrones visuales. El reto final cambia según la principal. La imagen puede cargarse como PNG/JPEG/WebP y se reduce antes de guardarla; en ausencia de imagen se crea un SVG con el código. La imagen personalizada revela el código después del montaje correcto. La imagen automática es procedural, no una ilustración generada por IA.

Extras opcionales: descarte, comprobación parcial, pista adicional, coleccionable y personalización. Se conceden una sola vez cuando todas las preguntas de una sala se resuelven al primer intento sin ayudas. Comprobar sin completar una respuesta no consume intento. La recompensa principal no depende de obtener los extras. Las ayudas incompatibles con una pregunta aparecen desactivadas. La comprobación parcial se desactiva para restricciones, expresiones y cantidades, para no rechazar soluciones alternativas válidas.

El progreso guarda respuestas, intentos, ayudas, descartes, inventario y reto final. Los juegos anteriores no reciben premios retroactivos.

## Edición y exportación

El editor y el XLSX muestran etiquetas, valores, soluciones numeradas y campos propios de cada interacción. Para cambiar la estructura o el número de fichas, se regenera la pregunta. El JSON conserva los contratos completos. Vista previa, paquete descargable y visor comparten el mismo motor. Las imágenes de recompensa se empaquetan junto con los demás recursos. La copia de respuestas muestra las soluciones en lenguaje legible.

## Validación

- `node --test tests/pigpen-experience.test.mjs`: contratos de los 18 tipos, selección permitida, respuestas alternativas, recompensas, paquetes, XLSX y esquema/materialización del objetivo.
- `node --test tests/pigpen-experience-browser.test.mjs`: resolución con clics de los 18 tipos en móvil/escritorio, seis retos finales, modal y recuperación del progreso/consumo de pistas.
- `node scripts/test-pigpen-final-passcode-browser.mjs`: regresión del reto clásico con arrastre y teclado.
- `node scripts/test-pigpen-sheets-modal-persistence.mjs`: persistencia de filtros y selección de Sheets.
- `node scripts/test-pigpen-fixed-objective-slots.mjs`: esquema de slots, recuperación y estabilidad de identificadores.
- `node scripts/test-pigpen-closed-diverse-questions.mjs`: respuestas cerradas y diagnóstico de colisiones.

Se probaron contratos y generación con fixtures locales. No se hizo una generación de pago contra Gemini ni una importación desde una cuenta real de Sheets. No se publicó ni desplegó.

Algunas pruebas históricas contienen expectativas ya incumplidas en el código anterior a esta implementación: posición CSS del temporizador (`test-escape-room-package-builder`), versión literal de mechanics (`test-pigpen-objective-compiler`), forma del guardado editorial (`test-pigpen-editorial-workbook`) y asignación literal de la regeneración (`test-pigpen-fixed-question-regeneration`). Se conservaron esas comprobaciones; no se alteró código ajeno para acomodarlas. Sus pruebas VM se actualizaron únicamente para proporcionar las nuevas dependencias importadas.

## Autofill editorial y recompensas

Autofill simula una sala resuelta correctamente al primer intento para probar todo el recorrido: limpia las marcas de ayuda, descartes e intentos de las preguntas de esa sala antes de rellenarlas. Al comprobarlas, se conceden los extras configurados a través de la misma lógica de recompensas del juego. Las ayudas usadas durante una partida normal siguen impidiendo el premio de sala perfecta. El botón y la activación editorial no se incluyen en el HTML del ZIP; la función exige explícitamente el modo editorial.
