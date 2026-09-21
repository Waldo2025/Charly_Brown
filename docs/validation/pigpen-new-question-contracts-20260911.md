# Síntoma
La generación de Body Language (Secundaria, Segundo, trimestre 2, tema 1; fila 22 de Escape Rooms Inglés) se detenía por cantidades de elementos en los metadatos case_data y distractor_errors.

# Reproducción
- Errores suministrados: 6 observaciones rechazadas por un máximo de 4; una observación de reserva rechazada por mínimo 2; dos explicaciones de distractores rechazadas por mínimo 3.
- El esquema anterior imponía estos límites independientemente del contenido. Reproducción determinista en tests/pigpen-new-type-combinations.test.mjs.
- Se abrió la sesión autenticada y se adjuntó la fila 22 de la hoja correspondiente por la UI. Los dos intentos reales iniciales terminaron con HTTP 429 antes de generar el contenido, sin reintentos automáticos.

# Hallazgos
Los metadatos pedagógicos y las alternativas jugables son campos distintos. El número de oraciones que describen un caso no equivale al número de evidencias que contienen, ni el número de explicaciones equivale al número de distractores visibles.

# Hipótesis probadas
- Límites arbitrarios de metadatos: confirmados por el esquema y las pruebas de 1, 2, 4 y 6 observaciones.
- Fallo general de las interacciones nuevas: descartado para los datos de prueba; las 18 se completaron por clics en el navegador y mostraron Correcto y la recompensa de sala perfecta.
- Disponibilidad de Gemini: bloqueo confirmado mediante dos HTTP 429. No se identifica la cuota concreta con el mensaje genérico del servidor.

# Causa raíz
La validación confundía tamaño de listas auxiliares con calidad pedagógica. El prompt omitía parte de las restricciones y, al quitar el esquema remoto por INVALID_ARGUMENT, quedaron exigencias locales no explícitas.

# Fix
- case_data acepta una o más observaciones no vacías sin el tope arbitrario de cuatro.
- distractor_errors exige al menos una explicación no vacía para los tipos clásicos que la requieren; permite agrupar errores relacionados.
- Prompt explícito sobre estos campos. Se conservan las comprobaciones de respuestas, distractores visibles y pasos de razonamiento. No se fabrican ni duplican datos.
- Normalización de todos los tipos con destinos: si allowed oculta todos los distractores pero éstos existen en el banco, se recupera el banco completo, conservando opciones y soluciones. Un caso real de corregir_error en sala 3 confirmó el problema.
- Sin cambios al límite de una solicitud por sala ni al guardado secuencial.
- Prueba real adicional detectó QuotaExceededError al guardar el avance en localStorage. El avance pasa a IndexedDB, manteniendo lectura de los checkpoints antiguos y sin borrar caché ajena.
- Prueba de navegador de IndexedDB: 6 MiB guardados, recuperados y eliminados con un adaptador de localStorage que lanza error de cuota.

# Validación
57 pruebas pasan en la suite combinada.
- 262143 subconjuntos no vacíos de los 18 tipos nuevos, verificación del plan de dos salas con dos preguntas: sólo tipos autorizados y cantidades constantes.
- 324 parejas ordenadas de tipos nuevos: soluciones, render y configuración de 6 recompensas × 32 selecciones de extras (62208 combinaciones).
- Cada tipo nuevo combinado con cada clásico en planes de cuatro salas de cuatro preguntas.
- Navegador integrado: los 18 tipos con fixtures controlados se respondieron manualmente mediante locators; todos devolvieron Correcto. Sala perfecta y clave final SOL aceptada.
- Tests de normalización, preferencia local, Firestore undefined y disponibilidad de comodines incluidos.
- Comando: node --test tests/pigpen-objective-checkpoint.test.mjs tests/pigpen-new-type-combinations.test.mjs tests/pigpen-single-room-request.test.mjs tests/pigpen-experience.test.mjs tests/pigpen-bonus-visibility.test.mjs tests/pigpen-question-preferences.test.mjs tests/pigpen-firestore-undefined.test.mjs

# Riesgos / Regresiones
Las combinaciones exhaustivas son pruebas deterministas de configuración y contratos; no son 262143 generaciones de Gemini. Las pruebas jugables usan fixtures, no confirman la calidad de todo contenido producido por el modelo. No se desplegó producción.


## Resultado real final
Con v331, la sesión autenticada de Body Language completó sus cuatro salas y aplicó el objetivo. Estado visible: “Objetivo recreado, enriquecido y aplicado. Puedes revisarlo o editarlo. Las salas ya contienen el contenido final; al generar sólo faltará preparar las imágenes.” Sin errores en la consola de la pestaña final.
La reanudación comenzó directamente en sala 3, sin volver a generar las salas 1 y 2 guardadas en IndexedDB. Configuración real conservada: ocho clásicos más seleccion_multiple, respuesta_justificacion y corregir_error; cuatro salas, cuatro preguntas por sala, Desafiante, clave SIGN. Las pruebas de todos los demás tipos y combinaciones son deterministas y de fixtures jugables, no generaciones exhaustivas del modelo.
No se generaron imágenes ni se publicó el escape room. Se dejó abierta la pestaña de la sesión con el objetivo aplicado. Los archivos HTML temporales de QA fueron eliminados.
