## Síntoma
Sala 1 pregunta 4 rechazada por compartir knowledge «Genuine smiles show visible eye wrinkles.» con r1_p1.

## Reproducción
Prueba local con dos conocimientos anteriores y una pregunta synthesis que los integra en un caso y una solución nuevos. La regla anterior rechazaba por igualdad literal de knowledge independientemente del rol.

## Hallazgos
La plantilla fija asigna a synthesis dos knowledge_ids anteriores. El detector anterior consideraba cualquier igualdad de knowledge una duplicación. El reporte del usuario sólo menciona knowledge, no colisión de caso ni solución; no se dispone del JSON rechazado original para comprobar sus demás campos.

## Hipótesis probadas
Confirmada: integración pedagógica válida rechazada por comparación aislada de knowledge. Pruebas negativas confirman que repetir caso o solución debe seguir rechazándose.

## Causa raíz
Incompatibilidad entre la exigencia de integrar conocimientos y la prohibición absoluta de repetir su descripción.

## Fix
Exención sólo para knowledge de los antecedentes declarados de synthesis: requiere al menos dos IDs existentes, dos conceptos distintos, dos datos distintos, tres pasos distintos, caso y respuesta no vacíos. Caso y solución siguen comprobándose por separado. Repeticiones ajenas a los antecedentes declarados siguen bloqueadas. Prompt pide redactar el aprendizaje integrado y crear caso y solución nuevos. Versión local v333; política v20. Sin nuevas llamadas de IA.

## Validación
12 pruebas node:test aprobadas (synthesis-diversity, single-room-request, answer-entry-repair). Script test-pigpen-closed-diverse-questions aprobado y sintaxis del creador correcta. No se generó otro escape room ni se consumieron solicitudes de Gemini en esta comprobación.

## Riesgos / Regresiones
Los metadatos no prueban por sí solos la calidad semántica de una síntesis; la generación debe aplicar realmente ambos conocimientos. Una pregunta que no cumple las condiciones o repite el caso o la solución sigue rechazada. Cambio aplicado en archivos locales, sin despliegue de Hosting.
