# Enriquecimiento y apoyo pedagógico visible — v346

## Síntoma
El objetivo Silent Airport Code tenía un briefing de una frase y veinte preguntas cuyos conocimientos y datos aparecían principalmente en metadatos privados. Un JSON válido no demostraba que el alumno pudiera resolverlas.

## Reproducción
Prueba de aeropuerto: una pregunta exige comparar una distancia con una norma guardada sólo en case_data; el briefing visible contiene únicamente una introducción. El nuevo auditor rechaza esa configuración. Añadir evidence_expected privado no resuelve el fallo.

## Causa confirmada
La ruta copiaba application a reto y dejaba que el modelo redactara mission.contexto libremente. No existía una comprobación final que exigiera conservar en esos campos públicos los conocimientos y datos utilizados por los planes.

## Cambios
- Cada plan incluye teaching_example, un ejemplo trabajado distinto del caso evaluado. Se conserva al normalizar y al presentar el objetivo enriquecido.
- knowledge se solicita como explicación para el alumno, con criterios y vocabulario, y no sólo como etiqueta interna.
- PigPen construye el briefing visible con las explicaciones y ejemplos de las preguntas activas, sin incorporar evidence ni answer_target.
- Los datos públicos de case_data que falten en application se incorporan al enunciado. El prompt prohíbe guardar respuestas resueltas en case_data.
- El inventario curricular de la sala refleja las explicaciones y ejemplos efectivamente usados.
- La auditoría final comprueba el contenido después de la materialización: conocimientos y ejemplos en briefing; datos del caso en los campos visibles; ejemplos que no reutilicen el caso; ciertas formas explícitas de ayudas que seleccionan respuestas y analogías ya resueltas.
- Las instrucciones exigen definir públicamente condiciones de éxito, unidades, escalas, mapas y reglas ficticias. Prohíben presentar cifras inventadas como normas reales, generalizaciones culturales universales o aritmética sin relación curricular.
- Se mantiene la revisión existente de diversidad. El contrato de generación pasa a versión 2 y el checkpoint incluye la versión pedagógica para evitar reutilizar generaciones anteriores como ya revisadas.
- Continúan la plantilla JSON local, el relleno textual y una llamada secuencial por sala.

## Validación
148 pruebas aprobadas de pedagogía, contenido fijo, filtrado, contratos, motor de experiencias, solicitudes secuenciales, plazo del servidor, sala única, etiquetas de opciones y diversidad. Incluyen veinte preguntas cuyas explicaciones no se pierden aunque el resumen de datos clave se limite a ocho entradas.

Sintaxis JavaScript verificada. El servidor local entrega PigPenCreator v346.

## Alcance y límites
La presencia de apoyo visible se comprueba determinísticamente. Las comprobaciones de revelación de respuestas detectan patrones concretos, no todas las paráfrasis posibles. La adecuación curricular y la veracidad de cada afirmación aún dependen del contenido redactado: las instrucciones mejoran esa fase pero no equivalen a una revisión experta automatizada.

No se ejecutó una generación remota real ni se modificó directamente el objetivo ya guardado. Para aplicar las nuevas reglas a ese tema se debe volver a enriquecerlo. No hubo llamadas adicionales a Gemini durante esta verificación.
