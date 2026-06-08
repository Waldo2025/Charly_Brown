# Analizar IDML Sessions / Revisions Design

## Summary

El modelo actual de `analizarPDF` trata cada combinación de ficha editorial como una sesión independiente. Eso no encaja con el flujo editorial real:

- diseñadores entregan `F1`
- editores revisan `F1`
- diseñadores corrigen y entregan `F2`
- luego `F3`, etc.

Además, una misma sesión editorial debe poder contener varias unidades y varios archivos por revisión.

La solución es separar cuatro niveles:

1. `Sesión editorial`
2. `Revisión`
3. `Archivo`
4. `Comparación`

Con esto, la app podrá:

- conservar una sesión editorial única por contexto base
- agrupar múltiples revisiones por unidad
- guardar varios archivos dentro de una misma revisión
- sobreescribir revisiones o archivos existentes cuando la identidad coincida
- comparar reportes entre `F1 vs F2`, `F2 vs F3`, etc.
- verificar recortables entre páginas origen y destino

## Goals

- Modelar la persistencia de acuerdo con el flujo editorial real.
- Evitar crear una sesión nueva cuando solo cambia `Unidad` o `Revisión`.
- Permitir múltiples archivos dentro de una misma revisión.
- Permitir análisis bulk de varios archivos.
- Permitir comparación entre revisiones de una misma unidad.
- Reagrupar anclas y navegación por archivo.
- Añadir verificación editorial de `recortables`.

## Non-Goals

- No cambiar en esta fase la lógica profunda del pipeline `PDF` o `IDML`.
- No generar cambios automáticos sobre el documento fuente.
- No introducir todavía diff visual de maquetación página contra página.

## Editorial Identity Model

### Session

Una `Sesión editorial` representa el contexto común de trabajo.

Identidad:

- `Nivel`
- `Grado`
- `Trimestre`
- `Edición`

Clave derivada:

- `sessionKey = nivel|grado|trimestre|edicion`

Título visible:

- `Nivel · Grado · Trimestre · Edición`

Ejemplo:

- `Primaria · Quinto · Trimestre 1 · 10ma`

### Revision

Una `Revisión` representa una unidad concreta y un estado editorial como `F1`, `F2`, `Dummy 1`, etc.

Identidad:

- `Unidad`
- `Revisión`

Clave derivada dentro de la sesión:

- `revisionKey = unidad|revision`

Título visible:

- `Unidad · Revisión`

Ejemplos:

- `Unidad 1 · F1`
- `Unidad 1 · F2`
- `Unidad 2 · F1`

### File

Cada revisión puede contener uno o varios archivos.

Identidad dentro de la revisión:

- nombre de archivo normalizado

Regla:

- mismo nombre de archivo => se sobreescribe
- nombre distinto => se agrega como otro archivo en esa revisión

### Comparison

Una comparación une dos revisiones de la misma unidad dentro de una sesión.

Ejemplos:

- `Unidad 1: F1 vs F2`
- `Unidad 1: F2 vs F3`

La comparación genera un reporte de diferencias, no reemplaza los reportes individuales.

## Recortables Verification Model

La verificación de `recortables` es un bloque nuevo del checklist editorial.

### Origin detection

Una página entra al flujo de recortables cuando contiene un bloque con estilo de párrafo:

- `08_01_COMPETENCIA`

y ese bloque dice:

- `Recortable`

Eso convierte a la página en `posible origen`.

### Mandatory reference in origin

Si una página tiene ese indicador de origen, debe contener además una referencia completa dentro del texto, por ejemplo:

- `recortable PcT1`
- `recortable PaT1`
- `recortable 1a`
- `recortable 1b`

Si existe el encabezado `Recortable` pero no existe código de referencia, eso es error.

### Destination detection

La página destino real es aquella donde aparezca el mismo código de recortable con estilo de párrafo:

- `01_00_TITULO LITERATURAS y EJERCICIOS`

Puede haber varias páginas origen para un mismo código, pero el destino correcto debe ser único.

### Destination footer validation

En la página destino, dentro del estilo:

- `12_01 PIE DE PAGINA DERCHO`

debe existir texto que diga:

- `recortable`

Si el destino existe pero no tiene esa marca en el pie, eso es error.

### Expected output

Ejemplo de salida correcta:

- `Recortable PcT1`
- `Origen: pág. 11, pág. 18`
- `Destino: pág. 27`

### Error cases

Errores que deben detectarse:

- origen con `08_01_COMPETENCIA = Recortable` pero sin código
- código detectado en origen sin destino
- múltiples destinos válidos para el mismo código
- destino encontrado sin footer `recortable`
- destino huérfano sin páginas origen

### UI behavior

Cuando una página origen falle cualquier validación de recortables:

- debe mostrarse un `badge rojo`
- debe generarse hallazgo en el reporte del archivo
- debe aparecer en el panel derecho dentro de un grupo nuevo `Recortables`

## Persistence Model

La estructura recomendada en Firestore es:

- `analizarPDF/{sessionId}`
- `analizarPDF/{sessionId}/revisions/{revisionId}`
- `analizarPDF/{sessionId}/revisions/{revisionId}/files/{fileId}`
- `analizarPDF/{sessionId}/comparisons/{comparisonId}`

### Session document

```json
{
  "id": "session_id",
  "sessionKey": "primaria|quinto|trimestre-1|10ma",
  "title": "Primaria · Quinto · Trimestre 1 · 10ma",
  "ownerId": "uid",
  "createdAt": "ISO",
  "updatedAt": "ISO",
  "bibliographicInfo": {
    "nivel": "Primaria",
    "grado": "Quinto",
    "trimestre": "Trimestre 1",
    "edicionNumero": "10ma"
  }
}
```

### Revision document

```json
{
  "id": "revision_id",
  "revisionKey": "unidad-1|f1",
  "title": "Unidad 1 · F1",
  "unidad": "Unidad 1",
  "revisionNumero": "F1",
  "createdAt": "ISO",
  "updatedAt": "ISO",
  "latestAnalysisAt": "ISO",
  "fileCount": 2,
  "summary": {
    "paginationIssueCount": 0,
    "sectionIssueCount": 1,
    "spellingIssueCount": 3,
    "orthotypographyIssueCount": 2,
    "colorIssueCount": 0
  }
}
```

### File document

```json
{
  "id": "file_id",
  "fileKey": "u1_f1_maqueta.idml",
  "documentName": "U1_F1_Maqueta.idml",
  "sourceType": "idml",
  "analysisStatus": "completed",
  "analysisJobId": "job_x",
  "createdAt": "ISO",
  "updatedAt": "ISO",
  "resultSummary": {},
  "result": {
    "paginationIssues": [],
    "sectionIssues": [],
    "spellingIssues": [],
    "orthotypographyIssues": [],
    "colorIssues": [],
    "recortableIssues": [],
    "stats": {},
    "pageReports": []
  }
}
```

### Comparison document

```json
{
  "id": "comparison_id",
  "unidad": "Unidad 1",
  "fromRevisionKey": "unidad-1|f1",
  "toRevisionKey": "unidad-1|f2",
  "createdAt": "ISO",
  "summary": {
    "pagesChanged": 8,
    "issuesResolved": 5,
    "issuesIntroduced": 2
  },
  "diff": {
    "pagination": [],
    "sections": [],
    "spelling": [],
    "orthotypography": [],
    "color": [],
    "recortables": [],
    "fieldMarkers": [],
    "pageStructure": []
  }
}
```

## Overwrite Rules

### Session overwrite

Si ya existe una sesión con la misma identidad:

- `Nivel + Grado + Trimestre + Edición`

entonces se reutiliza esa sesión.

No se crea una nueva sesión.

### Revision overwrite

Dentro de la sesión activa:

- si ya existe una revisión con la misma identidad `Unidad + Revisión`, se sobreescribe esa revisión
- si no existe, se crea una revisión nueva

### File overwrite

Dentro de la revisión activa:

- mismo nombre de archivo => se actualiza el archivo existente
- nombre distinto => se agrega como otro archivo

## User Experience

## Left sidebar

El panel izquierdo mostrará solo sesiones editoriales:

- `Primaria · Quinto · Trimestre 1 · 10ma`
- `Primaria · Quinto · Trimestre 2 · 10ma`

No mostrará revisiones ni archivos en este nivel.

## Main workspace

Dentro de una sesión se mostrarán:

1. `Ficha editorial` de la sesión
2. `Revisiones` de esa sesión
3. `Archivos` dentro de la revisión activa
4. `Resultados` por archivo
5. `Comparaciones` entre revisiones de la misma unidad

## Ficha editorial

La ficha editorial debe dejar de ser “el título de una sesión aislada” y pasar a ser el editor de identidad de la sesión padre.

Campos:

- `Nivel`
- `Grado`
- `Trimestre`
- `Edición`

Campos de revisión:

- `Unidad`
- `Revisión`

Los primeros cuatro definen la sesión.
Los últimos dos definen la revisión.

## File upload

El usuario debe poder:

- añadir un archivo a la revisión activa
- añadir varios archivos a la misma revisión
- lanzar análisis bulk de varios archivos

La selección de archivo ya no debe asumirse como “el archivo único de la sesión”.

## Results

Los resultados deben reagruparse por archivo.

Orden sugerido:

1. `Resumen general de la revisión`
2. `Archivos`
3. `Resultado del archivo A`
4. `Reporte por página del archivo A`
5. `Resultado del archivo B`
6. `Reporte por página del archivo B`

Cada archivo debe incluir además una sección específica:

- `Recortables`

## Right rail / anchors

El panel derecho debe agrupar anclas por archivo:

- `Archivo: U1_F1_Maqueta.idml`
  - `Ortotipografía`
  - `Texto fuera / desbordado`
  - `Campo formativo`
  - `Recortables`
- `Archivo: U1_F1_Tablas.idml`
  - `Ortotipografía`
  - `Texto fuera / desbordado`
  - `Campo formativo`
  - `Recortables`

## Comparison UX

La comparación vive a nivel de revisión, no de archivo suelto.

Flujo:

1. abrir una sesión
2. elegir una unidad
3. elegir dos revisiones de la misma unidad
4. generar comparación

Reporte esperado:

- errores resueltos
- errores nuevos
- páginas afectadas
- cambios de campo formativo / folios / habilidad / sección
- cambios de recortables
- cambios textuales detectables en los reportes

## Frontend Changes

Archivos a modificar:

- `/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF.html`
- `/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf.css`
- `/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-app.js`
- `/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-session-store.js`
- `/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-results.js`
- `/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-sidepanel.js`
- `/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-api.js`

Cambios funcionales:

- reemplazar el modelo actual de “sesión única con un resultado” por:
  - sesión activa
  - revisión activa
  - archivo activo
- separar el selector de `Revisión`
- añadir lista de archivos de la revisión
- soportar selección múltiple o carga repetida de archivos
- reagrupar el rail de anclas por archivo
- mostrar badges y hallazgos de `recortables` por archivo y por página

## Backend Changes

Archivos a modificar:

- `/Users/waldolopez/Documents/CharlyBrown/backend/analizar-pdf.js`
- `/Users/waldolopez/Documents/CharlyBrown/backend/server.js`
- `/Users/waldolopez/Documents/CharlyBrown/backend/python/analyze_idml.py`
- `/Users/waldolopez/Documents/CharlyBrown/backend/python/analyze_pdf.py`

Cambios funcionales:

- separar persistencia de sesión, revisión y archivo
- actualizar jobs de análisis para escribir resultado a nivel archivo
- recomputar `summary` de revisión desde archivos hijos
- añadir endpoint o acción para generar comparación entre revisiones
- añadir extracción y validación de recortables en `IDML`

## Migration Strategy

Hay sesiones viejas en el esquema anterior. La migración debe ser incremental.

Estrategia:

1. leer sesión antigua
2. derivar `sessionKey` desde:
   - `nivel`
   - `grado`
   - `trimestre`
   - `edicionNumero`
3. derivar una revisión inicial desde:
   - `unidad`
   - `revisionNumero`
4. mover el resultado actual a un archivo hijo único
5. dejar compatibilidad de lectura temporal para sesiones no migradas

No se debe exigir migración destructiva inmediata.

## Risks

- aumento de complejidad en Firestore y en el estado frontend
- necesidad de migrar sesiones actuales
- posible duplicación de lógica entre resumen de revisión y resultado de archivo
- comparación entre revisiones puede crecer rápido si no se limita bien el primer alcance
- el matching de recortables depende de nombres consistentes y estilos correctos

## Recommendation

Implementar en este orden:

1. nuevo modelo persistente `session -> revisions -> files`
2. adaptación del frontend a sesión activa / revisión activa / archivo activo
3. análisis bulk dentro de una revisión
4. verificación de recortables
5. rail derecho agrupado por archivo
6. comparación `F1 vs F2`

Ese orden deja usable el sistema primero para carga y análisis real, y después para comparación editorial.
