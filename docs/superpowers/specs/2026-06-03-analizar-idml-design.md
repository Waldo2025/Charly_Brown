# Analizar PDF / IDML v1 Design

## Summary

Extender el sitio actual de análisis documental para aceptar dos tipos de fuente en una sola experiencia:

- `PDF`
- `IDML`

La UI seguirá centrada en sesiones guardadas en Firestore, pero cada sesión incluirá ahora el tipo de archivo, metadatos editoriales del libro y una paleta configurable por sesión. El backend mantendrá un endpoint de análisis común y elegirá el pipeline correcto según el tipo de fuente.

Para `PDF`, se conserva el pipeline actual basado en `PyMuPDF`, reglas deterministas y verificación semántica con Gemini.

Para `IDML`, se agregará un pipeline nuevo `IDML-first`, donde el backend descomprime y parsea la estructura real del documento (`designmap.xml`, `Spreads`, `Stories`, `Styles`, `Graphic`, `MasterSpreads`) y construye un modelo editorial estructurado. Sobre ese modelo se ejecutarán:

- validaciones de paginación
- detección de secciones
- análisis ortográfico y ortotipográfico
- análisis de inconsistencias editoriales
- validación de color por `swatchName`, `CMYK` y `HEX`

En `v1`, el sistema solo analizará y reportará errores. No propondrá cambios ni escribirá un `IDML` modificado.

## Goals

- Unificar en una sola pantalla el análisis de `PDF` y `IDML`.
- Mantener una colección única de sesiones `analizarPDF`.
- Añadir metadatos editoriales persistentes por sesión:
  - `nivel`
  - `grado`
  - `trimestre`
  - `edicionNumero`
  - `revisionNumero`
- Añadir una paleta configurable por sesión para validar color en `IDML`.
- Mantener un contrato común de resultados entre `PDF` e `IDML`.
- Usar Gemini como segunda capa semántica, no como parser base del documento.

## Non-Goals

- No escribir cambios de vuelta al `IDML`.
- No generar propuestas automáticas de maquetación.
- No comparar todavía `F1 vs F2`; solo dejar los metadatos necesarios para esa fase.
- No reemplazar el parser `PDF` actual por Gemini.
- No montar integración con InDesign Desktop o InDesign Server en esta fase.

## User Experience

### Main flow

1. El usuario crea o abre una sesión.
2. Elige el tipo de archivo:
   - `PDF`
   - `IDML`
3. Captura metadatos editoriales del archivo/libro.
4. Configura:
   - índice y secciones esperadas
   - paleta esperada por sesión
5. Adjunta el archivo.
6. Lanza el análisis.
7. Revisa el reporte consolidado.

### UI changes

#### Composer

En el composer principal se añadirá:

- selector de tipo de archivo `PDF / IDML`
- adaptación de `accept` del input
- texto contextual del archivo seleccionado

Reglas:

- si `sourceType = pdf`, el input aceptará `.pdf`
- si `sourceType = idml`, el input aceptará `.idml`

#### Session workspace

Encima del panel de secciones se añadirá un formulario editorial con estos campos:

- `Nivel`
- `Grado`
- `Trimestre`
- `Número de edición`
- `Número de revisión`

Debajo del formulario editorial se añadirá un panel de paleta configurable por sesión. Cada fila de color tendrá:

- `Swatch name`
- `CMYK`
- `HEX`

#### Results

El reporte actual crecerá con dos bloques nuevos:

- `Ortotipografía`
- `Colores`

El contrato visual de resultados quedará así:

- `Resumen`
- `Numeración`
- `Secciones`
- `Ortografía`
- `Ortotipografía`
- `Colores`

## Data Model

### Firestore collection

Se mantiene la colección:

- `analizarPDF`

### Session document shape

Cada sesión incluirá estos campos principales:

```json
{
  "id": "session_id",
  "title": "Sesión sin título",
  "ownerId": "uid",
  "createdAt": "ISO",
  "updatedAt": "ISO",
  "sourceType": "pdf",
  "analysisStatus": "idle",
  "analysisJobId": "",
  "bibliographicInfo": {
    "nivel": "",
    "grado": "",
    "trimestre": "",
    "edicionNumero": "",
    "revisionNumero": ""
  },
  "indexConfig": {
    "indexPageNumber": 0,
    "sections": [
      {
        "id": "section_1",
        "title": "",
        "expectedPageNumber": 0
      }
    ]
  },
  "colorConfig": {
    "palette": [
      {
        "id": "color_1",
        "swatchName": "",
        "cmyk": "",
        "hex": ""
      }
    ]
  },
  "resultSummary": {},
  "result": {
    "paginationIssues": [],
    "sectionIssues": [],
    "spellingIssues": [],
    "orthotypographyIssues": [],
    "colorIssues": [],
    "stats": {}
  }
}
```

### Rationale

- `sourceType` permite un endpoint común con dispatch interno.
- `bibliographicInfo` deja preparada la comparación futura entre revisiones.
- `colorConfig.palette` permite validar no solo nombre de swatch, sino también que el valor real no haya sido alterado.

## Frontend Design

### Files to change

- `/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF.html`
- `/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf.css`
- `/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-app.js`
- `/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-session-store.js`
- `/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-results.js`
- `/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-api.js`

### State additions

El estado de sesión normalizado crecerá con:

- `sourceType`
- `bibliographicInfo`
- `colorConfig`
- `result.orthotypographyIssues`
- `result.colorIssues`

### UI behavior

- Cambiar `sourceType` actualizará el `accept` del input y el copy del composer.
- Los metadatos editoriales se podrán editar y guardar igual que el resto de la sesión.
- La paleta se manejará como lista dinámica, similar a las secciones.
- El render de resultados debe soportar vacíos y errores por categoría sin colapsar la UI.

## Backend Design

### API

Se conserva:

- `POST /api/analizar-pdf/analyze`

Este endpoint ya no asumirá siempre `PDF`; leerá `sourceType` de la sesión y hará dispatch al analizador correspondiente.

También se conservan:

- `GET /api/analizar-pdf/sessions/list`
- `POST /api/analizar-pdf/sessions/save`
- `POST /api/analizar-pdf/sessions/delete`
- `GET /api/analizar-pdf/analyze-status`

### Upload contract

La UI seguirá subiendo binario puro con headers:

- `X-Session-Id`
- `X-File-Name`

El backend validará:

- extensión esperada según `sourceType`
- MIME razonable cuando exista
- ownership de la sesión

### Analyzer dispatch

Se creará dispatch por tipo:

- `pdf` → analizador actual
- `idml` → analizador nuevo

El backend persistirá el resultado final en el mismo formato para ambos.

## Python Design

### PDF pipeline

Se conserva la estructura modular actual en:

- `/Users/waldolopez/Documents/CharlyBrown/backend/python/analizar_pdf`

Su salida deberá extenderse para incluir:

- `orthotypographyIssues`
- `colorIssues` vacío por ahora o con capacidad limitada

### IDML pipeline

Se creará un módulo nuevo:

- `/Users/waldolopez/Documents/CharlyBrown/backend/python/analyze_idml.py`
- `/Users/waldolopez/Documents/CharlyBrown/backend/python/analizar_idml/`

Módulos previstos:

- `package.py`
  - abre y valida el zip IDML
- `document.py`
  - lee `designmap.xml`
- `pages.py`
  - modela spreads y páginas
- `stories.py`
  - resuelve textos y stories
- `styles.py`
  - resuelve estilos y su relación con colores
- `swatches.py`
  - resuelve colores y conversiones `CMYK -> HEX`
- `sections.py`
  - detecta encabezados y secciones por contenido estructurado
- `pagination.py`
  - valida secuencia lógica de páginas usando `Page Name` y `Descriptor`
- `spelling.py`
  - prepara fragmentos textuales y candidatos para Gemini
- `orthotypography.py`
  - detecta inconsistencias de signos, espacios, capitalización editorial y patrones de composición
- `colors.py`
  - compara colores usados vs `colorConfig.palette`
- `gemini_verifier.py`
  - revisa ortografía, ortotipografía e inconsistencias sobre texto limpio
- `pipeline.py`
  - orquesta el análisis

### IDML parsing strategy

#### Source files

El parser leerá al menos:

- `designmap.xml`
- `Spreads/*.xml`
- `Stories/*.xml`
- `Resources/Styles.xml`
- `Resources/Graphic.xml`
- `MasterSpreads/*.xml`

#### Page model

Cada página deberá incluir:

- `pageId`
- `pageName`
- `spreadId`
- `logicalPageNumber`
- `textBlocks`
- `headings`
- `appliedStyles`
- `usedSwatches`

#### Text model

El texto vendrá de `Story` y `CharacterStyleRange` / `ParagraphStyleRange`, no de render visual. Esto reduce:

- duplicados falsos
- texto cortado por extracción visual
- mezcla de capas o arte incrustado

### Gemini role

Gemini no parseará el documento completo ni el `IDML` crudo.

Gemini recibirá fragmentos ya estructurados por el backend local para:

- confirmar errores ortográficos reales
- detectar errores ortotipográficos
- detectar inconsistencias editoriales de encabezados, términos y convenciones

Gemini devolverá JSON estructurado por categoría.

### Color analysis

La validación de color en `IDML` usará tres ejes:

- `swatchName`
- `CMYK`
- `HEX`

Se reportará `colorIssue` cuando ocurra cualquiera de estos casos:

- el swatch usado no está en la paleta esperada
- el nombre coincide pero el valor `CMYK` difiere
- el nombre coincide pero el `HEX` derivado difiere
- se usa un color sin swatch esperado equivalente

### Result contract

La salida unificada para `PDF` e `IDML` será:

```json
{
  "paginationIssues": [],
  "sectionIssues": [],
  "spellingIssues": [],
  "orthotypographyIssues": [],
  "colorIssues": [],
  "stats": {
    "pageCount": 0,
    "spellProvider": "pyenchant",
    "geminiVerifierEnabled": true,
    "sourceType": "idml",
    "durationMs": 0
  }
}
```

## Rules and Validation

### Firestore rules

`firestore.rules` deberá extender el shape de `analizarPDF` para permitir:

- `sourceType`
- `bibliographicInfo`
- `colorConfig`
- `result.orthotypographyIssues`
- `result.colorIssues`

Y mantener:

- aislamiento por `ownerId`
- imposibilidad de cambiar `ownerId`
- validación básica de shape

## Error Handling

### Frontend

- Si el tipo de archivo no coincide con `sourceType`, mostrar error antes de subir.
- Si falta archivo, metadatos o sesión, no enviar request.

### Backend

Errores esperados:

- archivo no compatible con `sourceType`
- zip `IDML` inválido
- XML faltante o mal formado
- error de Gemini
- error de parser local

Si Gemini falla:

- el pipeline no debe caerse completo
- debe devolver resultados deterministas disponibles
- debe marcar en `stats` o advertencias que Gemini no validó ese bloque

## Testing Strategy

### Frontend

- crear sesión `PDF`
- crear sesión `IDML`
- cambiar `sourceType` y verificar `accept`
- persistir `bibliographicInfo`
- persistir `colorConfig`
- editar varias filas de paleta sin perder foco
- renderizar `orthotypographyIssues` y `colorIssues`

### Backend

- `sourceType=pdf` sigue funcionando con contrato actual extendido
- `sourceType=idml` enruta al analizador nuevo
- rechazo de `.pdf` en sesión `idml`
- rechazo de `.idml` en sesión `pdf`

### IDML parser

Con `EEFESPPRI_10REV_TRIM1_P5_LA_ABP_FORMACION copy.idml` validar:

- apertura correcta del paquete
- conteo de spreads y páginas
- extracción de stories y headings
- extracción de swatches desde `Resources/Graphic.xml`
- correlación entre estilos y colores

### Semantic analysis

- Gemini recibe fragmentos estructurados
- errores ortográficos reales llegan a `spellingIssues`
- errores ortotipográficos llegan a `orthotypographyIssues`
- diferencias de swatch/CMYK/HEX llegan a `colorIssues`

## Risks

- `IDML` puede tener estructuras complejas con overrides, masters y linked stories que requieran iteración.
- Algunas relaciones exactas entre frame y story pueden requerir varias pasadas para mapear bien el contenido por página.
- La validación de color puede requerir normalización fina de equivalencias `CMYK -> HEX`.
- Gemini puede introducir variabilidad si no se encapsula con prompts y JSON estrictos.

## Implementation Phasing

### Phase 1

- ampliar sesión y reglas
- añadir selector `PDF/IDML`
- añadir formulario editorial
- añadir paleta configurable
- extender UI de resultados

### Phase 2

- dispatch backend por `sourceType`
- bootstrap del pipeline `IDML`
- parsear paquete, spreads, stories y swatches

### Phase 3

- análisis de secciones, paginación y color para `IDML`
- integración Gemini para ortografía, ortotipografía e inconsistencias

### Phase 4

- pruebas con el archivo real `EEFESPPRI_10REV_TRIM1_P5_LA_ABP_FORMACION copy.idml`
- pulido de falsos positivos y contrato final de resultados

## Recommendation

Implementar `IDML v1` como `IDML-first + Gemini as verifier` es la mejor ruta porque:

- usa la estructura real del documento editorial
- reduce ruido frente al análisis visual de `PDF`
- prepara el terreno para comparación futura entre revisiones `F1`, `F2`, etc.
- deja una base estable para, más adelante, generar propuestas de cambios o `IDML` parchados sin rehacer la arquitectura
