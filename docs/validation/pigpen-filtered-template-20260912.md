# Plantilla filtrada por pregunta — v343

## Síntoma
Gemini devuelve JSON que no se puede interpretar (posición 67010). El autor espera que la plantilla completa de PigPen se filtre por los tipos seleccionados y la IA genere sólo su contenido activo.

## Reproducción
- Inspección de la ruta `compileObjectiveBlueprintFromTemplate`: concatenaba dos prompts y varios formatos de salida, el catálogo completo y la orden de conservar campos inactivos vacíos.
- Reproducción determinista de construcción y reconstrucción mediante `tests/pigpen-filtered-template.test.mjs`.
- No se dispone del texto original de la respuesta fallida; no se reprodujo esa respuesta remota.

## Hallazgos
1. La plantilla de salida incluía propiedades opcionales de todos los contratos, aunque no fueran necesarias para la interacción.
2. La solicitud incluía formatos incompatibles para la raíz: planes, mission y finalmente ambos.
3. Se pedían campos públicos vacíos y otra copia de las parejas que ya se conservaban en el plan privado.

## Hipótesis probadas
1. La solicitud contiene estructuras innecesarias y formatos contradictorios: confirmada por inspección y prueba del prompt nuevo.
2. Esa redundancia causó exactamente el error sintáctico en la posición indicada: no confirmada sin la respuesta original.

## Causa raíz
Defecto confirmado en la construcción de la solicitud: se utilizaban plantillas internas completas como formato de transporte, concatenando instrucciones independientes. La causa exacta del carácter inválido de la respuesta remota sigue sin determinarse.

## Fix
- Un solo prompt y un esquema autoritativo por sala.
- Catálogo interno completo, instrucciones de autoría sólo de los tipos asignados.
- Preguntas de transporte identificadas por plan_id, cada una con su esquema particular.
- Contratos nuevos sólo en plans; se omiten reglas, geometría y magnitudes cuando no corresponden.
- Se conservan bancos allowed donde son necesarios para separar opciones por destino.
- Parejas privadas en solution_pairs; PigPen reconstruye parejas, identificadores, imágenes vacías y campos inactivos localmente.
- La pista extra de las preguntas nuevas se toma del contrato, sin pedirla dos veces.
- Validación del transporte antes de reconstruir; después se mantienen los validadores completos del plan y de la sala.
- Una llamada por sala, secuencial, con checkpoints y sin llamadas automáticas de reparación.

## Validación
117 pruebas aprobadas:
`node --test tests/pigpen-filtered-template.test.mjs tests/pigpen-contract-audit.test.mjs tests/pigpen-experience.test.mjs tests/pigpen-single-room-request.test.mjs tests/pigpen-rule-alias.test.mjs tests/pigpen-json-syntax.test.mjs tests/pigpen-one-room.test.mjs tests/pigpen-choice-bank-labels.test.mjs`

Incluyen contratos de los 18 tipos nuevos, sus 324 parejas ordenadas, conservación de campos activos de los 8 clásicos, rechazo de soluciones ausentes, validación de contratos reconstruidos y serialización de solicitudes por sala.

Sintaxis de ambos módulos verificada con `node --check`. El servidor local entrega la referencia a v343.

## Riesgos / regresiones
No se realizó una llamada real a Gemini en esta verificación. El filtrado no garantiza que el proveedor nunca produzca JSON inválido o contenido pedagógico insuficiente. No se aumentó la cuota consumida para ejecutar las pruebas. Esta revisión no constituye una prueba visual completa de todas las recompensas y comodines.
