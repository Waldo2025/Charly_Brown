# Diseño: Exportación corregida con selección fina y limpieza de IDML

Fecha: 2026-06-06
Área: `Peppermint Patty Analizer` / análisis IDML

## Objetivo

Extender `Corregir y exportar IDML` para que el usuario pueda:

- seleccionar páginas desde el rail derecho
- seleccionar hallazgos individuales corregibles dentro de cada página
- decidir, antes de exportar, qué procesos de limpieza estructural aplicar al IDML
- generar un IDML corregido sin tocar texto, páginas u objetos fuera de la selección

El sistema debe ser seguro para flujo editorial: si una corrección textual no puede ubicarse con precisión suficiente, no debe modificar el texto; debe convertirse en nota editorial dentro del IDML.

## Alcance funcional

### Selección fina de correcciones

La exportación corregida trabaja con dos niveles de selección:

1. Selección de páginas en el rail derecho.
2. Selección manual de hallazgos individuales dentro de cada página.

Reglas:

- Marcar una página no selecciona hallazgos automáticamente.
- Los checkboxes de hallazgos solo aparecen en `Ortografía` y `Ortotipografía`.
- No se pueden seleccionar hallazgos si la página no está marcada en el rail.
- La selección vive por `sesión + revisión + archivo`.
- Si no hay hallazgos seleccionados, no se ejecuta corrección textual.

### Modal previo a exportación

Al pulsar `#analizarPdfExportCorrectedBtn`, no se exporta directamente. Se abre un modal de configuración previo.

Título:

`Antes de corregir y exportar el documento, ¿deseas que pase por uno de los siguientes procesos de limpieza?`

Sección `Eliminar`:

- eliminar notas viejas
- eliminar estilos de párrafo no usados
- eliminar estilos de carácter no usados
- eliminar colores swatches no usados
- eliminar objetos no visibles en la hoja
- eliminar texto fuera de pantalla

Sección `Correcciones`:

- corregir errores ortotipográficos seleccionados

Reglas del modal:

- Todas las opciones inician desactivadas.
- Excepción: `corregir errores ortotipográficos seleccionados` inicia activada si ya existen hallazgos seleccionados en el reporte.
- El botón final `Corregir y exportar IDML` solo se habilita si hay al menos una acción activa.
- El modal muestra un resumen vivo:
  - páginas seleccionadas
  - hallazgos seleccionados
  - limpiezas activas

## Definición exacta de cada acción

### Eliminar notas viejas

Elimina historial antiguo de control de cambios del IDML, especialmente entradas heredadas de `Change` como `DeletedText` y notas viejas equivalentes detectadas en el análisis.

No debe eliminar:

- notas editoriales activas visibles
- notas nuevas creadas como fallback durante la misma exportación

### Eliminar estilos de párrafo no usados

Elimina definiciones de `ParagraphStyle` que no tengan referencias activas en el documento final exportado.

No debe eliminar:

- estilos base del documento aún referenciados indirectamente
- estilos necesarios para notas nuevas insertadas durante la exportación

### Eliminar estilos de carácter no usados

Elimina definiciones de `CharacterStyle` sin referencias activas.

Debe preservar:

- estilos en uso real
- estilo de marcado de corrección si la exportación lo necesita

### Eliminar colores swatches no usados

Elimina swatches sin uso efectivo en texto, trazos, rellenos u objetos activos del documento final.

### Eliminar objetos no visibles en la hoja

Elimina únicamente objetos completamente fuera del área visible de la página.

No debe tocar:

- objetos visibles de la maqueta
- objetos que intersectan la página aunque estén parcialmente desbordados
- elementos correctos del arte final ubicados en la hoja

### Eliminar texto fuera de pantalla

Elimina únicamente texto clasificado como `fuera de la página`.

No debe eliminar por esta opción:

- texto `desbordado`
- texto visible aunque tenga problemas tipográficos

### Corregir errores ortotipográficos seleccionados

Aplica correcciones solo a hallazgos seleccionados individualmente.

Reglas:

- solo afecta texto de hallazgos seleccionados
- no toca hallazgos no seleccionados
- no toca páginas no seleccionadas
- no corrige por bloque completo; corrige solo reemplazos concretos

Si un hallazgo no puede ubicarse con precisión suficiente en el IDML:

- no se autocorrige
- se convierte en `nota editorial` dentro del IDML

## Arquitectura propuesta

### Frontend

Archivos principales:

- `public/analizarPDF/analizar-pdf-results.js`
- `public/analizarPDF/analizar-pdf-app.js`
- `public/analizarPDF/analizar-pdf-api.js`
- `public/analizarPDF/analizar-pdf.css`
- `public/PeppermintPattyAnalizer.html`

Responsabilidades:

- El renderer controla:
  - modo selección en el rail
  - selección de páginas
  - selección de hallazgos individuales
- El app controller controla:
  - estado persistente por `sesión/revisión/archivo`
  - resumen de selección
  - apertura/cierre del modal
  - construcción del payload de exportación
- El API client envía al backend:
  - `correctionSelection`
  - `cleanupOptions`

### Backend

Archivos principales:

- `backend/server.js`
- `backend/python/correct_idml.py`

Responsabilidades:

- `server.js` valida la exportación y transmite selección + limpiezas al corrector.
- `correct_idml.py` ejecuta en orden:
  1. limpiezas estructurales seleccionadas
  2. correcciones textuales seleccionadas
  3. fallback a nota editorial cuando no haya localización confiable

## Contrato de datos

### correctionSelection

El payload debe incluir:

- `selectedPages`
- `selectedIssueIds`
- `selectedIssues`

Cada `selectedIssue` debe incluir al menos:

- `id`
- `kind`
- `pageName`
- `storyId`
- `storyTitle`
- `storySource`
- `source`
- `target`
- `context`
- `message`

### cleanupOptions

El payload debe incluir un objeto booleano con estas claves:

- `removeOldNotes`
- `removeUnusedParagraphStyles`
- `removeUnusedCharacterStyles`
- `removeUnusedSwatches`
- `removeOffPageObjects`
- `removeOffPageText`
- `applySelectedCorrections`

## Orden de ejecución

La exportación debe seguir este orden:

1. cargar el IDML original local
2. aplicar limpiezas estructurales seleccionadas
3. aplicar correcciones textuales seleccionadas
4. insertar notas editoriales fallback necesarias
5. recalcular el documento exportado
6. ofrecer descarga del IDML final

Este orden evita que correcciones se apliquen sobre contenido que luego iba a eliminarse.

## Manejo de errores

Casos esperados:

- sin archivo IDML activo
- sin acciones seleccionadas en el modal
- selección de hallazgos vacía
- hallazgo sin localización precisa
- error al reempaquetar el IDML

Comportamiento:

- si no hay acciones activas, bloquear exportación
- si un hallazgo es ambiguo, convertirlo en nota editorial y continuar
- si una limpieza falla en un archivo, devolver error claro y no descargar un zip incompleto
- reportar resumen final:
  - correcciones aplicadas
  - notas editoriales creadas
  - elementos limpiados por categoría
  - omitidos

## Verificación

Se debe validar con:

- chequeo sintáctico de frontend
- compilación Python del corrector
- prueba de humo sobre un IDML real del repo
- validación del flujo con:
  - selección de una página sin hallazgos
  - selección de hallazgos múltiples en la misma página
  - exportación con solo limpieza
  - exportación con solo corrección
  - exportación mixta
  - fallback a nota editorial
  - limpieza de `DeletedText`

## Riesgos y decisiones

### Riesgo 1: borrado excesivo

Las opciones de limpieza pueden ser destructivas si se interpretan de forma amplia.

Decisión:

- restringir cada limpieza a criterios estructurales exactos
- no usar heurísticas blandas para borrar contenido

### Riesgo 2: corrección ambigua

Un mismo texto puede repetirse varias veces dentro de un `Story`.

Decisión:

- intentar resolver por `storyId + context + coincidencia única`
- si sigue ambiguo, crear nota editorial

### Riesgo 3: mezclar historial con notas activas

No debe limpiarse una nota activa junto con historial viejo.

Decisión:

- separar explícitamente `notes` y `noteHistory`
- la limpieza de notas viejas solo afecta historial

## Fuera de alcance

No entra en esta fase:

- seleccionar hallazgos de `Control de cambios` uno por uno desde el reporte
- limpiar `desbordado` mediante la opción de texto fuera de pantalla
- reescritura semántica de copy
- edición visual de objetos visibles
- limpieza automática de cualquier contenido “sospechoso” sin clasificación estructural
