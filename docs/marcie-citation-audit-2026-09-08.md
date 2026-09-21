# Citas y correspondencia bibliográfica

## Síntoma

La captura muestra identificadores internos como `[reference-1]` dentro del artículo y el usuario informa de una única fuente en la bibliografía. Además, el aviso de investigación incompleta aparece dentro del cuerpo editorial.

## Reproducción

Pruebas: `node --test functions/test/marcie-citation-links.test.js`.

Los casos controlados reproducen tres identificadores vinculados a documentos diferentes, tres citas de un mismo documento y referencias cuyo documento no está disponible. La captura no permite establecer qué documento respalda las citas de la sesión real.

## Hallazgos e hipótesis probadas

1. Los identificadores de atribuciones no se resolvían hacia los identificadores documentales antes de renderizar. Confirmado por inspección y probado con enlaces numéricos a los documentos correctos.
2. La lista bibliográfica no recuperaba documentos del expediente señalados por las citas en el texto. Confirmado con un artículo que contiene una fuente y otras dos en el expediente.
3. El normalizador podía ignorar identificadores desconocidos y añadir atribuciones a párrafos por posición. Se eliminó esa inserción automática: no es una correspondencia documental fiable.

## Causa raíz

El identificador de una atribución y el identificador de un documento se trataban como si fueran equivalentes. Renderizado, edición y bibliografía no compartían una resolución única.

## Corrección

- Resolución explícita `referenceId → sourceId`; nunca por número de posición ni por parecido de nombres.
- Marcadores pequeños en superíndice `[1]`, con enlace y descripción accesible. Numeración consistente con las referencias ordenadas alfabéticamente en APA 7.
- Inclusión de los documentos citados disponibles en el expediente, además de todas las fuentes registradas como utilizadas. Libros, artículos y páginas conservan sus metadatos reales.
- Si varias citas proceden de un mismo documento, comparten número. No se inventan tres documentos porque haya tres atribuciones.
- Marcadores `[?]` y aviso en revisión cuando falta la correspondencia. La generación y publicación no pueden dar por resuelta una cita sin documento.
- Los identificadores originales se conservan al editar los superíndices; no se guardan como números desvinculados.
- HTML, Markdown y WordPress usan la misma resolución. La bibliografía mantiene formato APA; los números son ayudas de navegación, no un cambio a otro estilo bibliográfico.
- Se eliminó el aviso amarillo inyectado en el cuerpo. Las insuficiencias siguen visibles en el panel de revisión y no se consideran evidencia completada.
- Los prompts indican cómo tratar citas secundarias: citar el documento realmente consultado, sin inventar metadatos del original.

## Validación

Pruebas unitarias de correspondencia, referencias ausentes, varios identificadores para un mismo documento, generación y exportación; prueba de navegador de enlace al destino, tamaño del superíndice y conservación de posición al editar. Suite editorial completa y revisión de sintaxis.

## Riesgos y límites

Cambios locales, no desplegados. No se editó la sesión remota del usuario. Si su expediente no contiene el documento de una cita, es necesario localizarlo/verificarlo o volver a investigar: no puede reconstruirse su referencia APA de manera fiable a partir del número o de la captura.
