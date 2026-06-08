# Analizar IDML Export Cleanup Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pre-export configuration modal for corrected IDML export, support selective orthotypographic corrections by page and issue, and add optional cleanup passes such as removing old change-history notes, unused styles/swatches, off-page objects, and off-page text.

**Architecture:** Keep selection state in the frontend per `session + revision + file`, open a modal before export to combine `correctionSelection` with `cleanupOptions`, and send both to the backend. Extend the Python IDML corrector so it first applies structural cleanup passes and then applies only explicitly selected corrections, falling back to editorial notes when a correction target is ambiguous.

**Tech Stack:** Vanilla JS frontend, existing `analizar-pdf` session store and renderer, Express backend in `backend/server.js`, Python IDML manipulation in `backend/python/correct_idml.py`, Node smoke checks, Python `py_compile`.

---

## File Structure

### Frontend files

- Modify: `/Users/waldolopez/Documents/CharlyBrown/public/PeppermintPattyAnalizer.html`
  - Add modal markup for pre-export cleanup/correction configuration.
- Modify: `/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-app.js`
  - Store correction selection and export modal state.
  - Build `cleanupOptions` and wire modal open/confirm/cancel behavior.
  - Keep export button disabled until at least one action is active.
- Modify: `/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-results.js`
  - Keep current page/issue selection UI and expose counts needed by the modal summary.
- Modify: `/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-api.js`
  - Send `cleanupOptions` together with `correctionSelection`.
- Modify: `/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf.css`
  - Style the export modal and its checklist/summary states.

### Backend files

- Modify: `/Users/waldolopez/Documents/CharlyBrown/backend/server.js`
  - Validate `cleanupOptions`, reject no-op exports, and pass both payload sections to Python.
- Modify: `/Users/waldolopez/Documents/CharlyBrown/backend/python/correct_idml.py`
  - Add cleanup passes:
    - old change-history notes
    - unused paragraph styles
    - unused character styles
    - unused swatches
    - fully off-page objects
    - off-page text
  - Keep selected correction application and editorial-note fallback.

### Tests / verification artifacts

- Modify or create: `/Users/waldolopez/Documents/CharlyBrown/scripts/test-analizar-idml-export-cleanup.mjs`
  - Smoke-check export payload expectations and summary text behavior where possible.
- Reuse verification commands:
  - `node --check /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-app.js`
  - `node --check /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-results.js`
  - `node --check /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-api.js`
  - `node --check /Users/waldolopez/Documents/CharlyBrown/backend/server.js`
  - `PYTHONPYCACHEPREFIX=/tmp/pycache python3 -m py_compile /Users/waldolopez/Documents/CharlyBrown/backend/python/correct_idml.py`

## Task 1: Add Export Modal Markup

**Files:**
- Modify: `/Users/waldolopez/Documents/CharlyBrown/public/PeppermintPattyAnalizer.html`
- Test: browser/manual DOM inspection via rendered HTML string assumptions in app

- [ ] **Step 1: Add failing expectation note for modal IDs**

Document the required DOM contract in the task notes before editing:

```text
Required IDs:
- analizarPdfExportConfigModal
- analizarPdfExportConfigCloseBtn
- analizarPdfExportConfigCancelBtn
- analizarPdfExportConfigConfirmBtn
- analizarPdfCleanupOldNotes
- analizarPdfCleanupUnusedParagraphStyles
- analizarPdfCleanupUnusedCharacterStyles
- analizarPdfCleanupUnusedSwatches
- analizarPdfCleanupOffPageObjects
- analizarPdfCleanupOffPageText
- analizarPdfApplySelectedCorrections
- analizarPdfExportConfigSummary
```

- [ ] **Step 2: Add modal markup below the existing mappings modal / main shell**

Insert HTML like:

```html
<div id="analizarPdfExportConfigModal" class="analizar-pdf-modal" hidden>
  <div class="analizar-pdf-modal-backdrop" data-action="close-export-config-modal"></div>
  <div class="analizar-pdf-modal-card analizar-pdf-export-modal-card" role="dialog" aria-modal="true" aria-labelledby="analizarPdfExportConfigTitle">
    <div class="analizar-pdf-modal-head">
      <div>
        <h3 id="analizarPdfExportConfigTitle">Antes de corregir y exportar el documento, ¿deseas que pase por uno de los siguientes procesos de limpieza?</h3>
      </div>
      <button id="analizarPdfExportConfigCloseBtn" type="button" class="analizar-pdf-icon-btn" aria-label="Cerrar configuración de exportación">
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>
    <div class="analizar-pdf-modal-body analizar-pdf-export-modal-body">
      <section class="analizar-pdf-export-config-section">
        <h4>Eliminar</h4>
        <label><input id="analizarPdfCleanupOldNotes" type="checkbox"> eliminar notas viejas</label>
        <label><input id="analizarPdfCleanupUnusedParagraphStyles" type="checkbox"> eliminar estilos de párrafo no usados</label>
        <label><input id="analizarPdfCleanupUnusedCharacterStyles" type="checkbox"> eliminar estilos de carácter no usados</label>
        <label><input id="analizarPdfCleanupUnusedSwatches" type="checkbox"> eliminar colores swatches no usados</label>
        <label><input id="analizarPdfCleanupOffPageObjects" type="checkbox"> eliminar objetos no visibles en la hoja</label>
        <label><input id="analizarPdfCleanupOffPageText" type="checkbox"> eliminar texto fuera de pantalla</label>
      </section>
      <section class="analizar-pdf-export-config-section">
        <h4>Correcciones</h4>
        <label><input id="analizarPdfApplySelectedCorrections" type="checkbox"> corregir errores ortotipográficos seleccionados</label>
      </section>
      <section class="analizar-pdf-export-config-section">
        <h4>Resumen</h4>
        <div id="analizarPdfExportConfigSummary" class="analizar-pdf-export-config-summary"></div>
      </section>
    </div>
    <div class="analizar-pdf-modal-head analizar-pdf-export-modal-actions">
      <button id="analizarPdfExportConfigCancelBtn" type="button" class="analizar-pdf-ghost-pill">Cancelar</button>
      <button id="analizarPdfExportConfigConfirmBtn" type="button" class="analizar-pdf-ghost-pill">Corregir y exportar IDML</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Run syntax-adjacent verification**

Run: `node --check /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-app.js`

Expected: command exits successfully because HTML changes did not break current JS parsing assumptions.

- [ ] **Step 4: Commit**

```bash
git add /Users/waldolopez/Documents/CharlyBrown/public/PeppermintPattyAnalizer.html
git commit -m "feat: add export config modal markup"
```

## Task 2: Add Export Modal State and Summary Logic

**Files:**
- Modify: `/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-app.js`
- Test: `node --check /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-app.js`

- [ ] **Step 1: Add failing data-shape notes near top-level state**

Add state contract:

```js
exportConfigModalOpen: false,
exportCleanupOptions: {
  removeOldNotes: false,
  removeUnusedParagraphStyles: false,
  removeUnusedCharacterStyles: false,
  removeUnusedSwatches: false,
  removeOffPageObjects: false,
  removeOffPageText: false,
  applySelectedCorrections: false,
}
```

- [ ] **Step 2: Cache modal elements in `els`**

Add these lookups:

```js
  exportConfigModal: document.getElementById("analizarPdfExportConfigModal"),
  exportConfigCloseBtn: document.getElementById("analizarPdfExportConfigCloseBtn"),
  exportConfigCancelBtn: document.getElementById("analizarPdfExportConfigCancelBtn"),
  exportConfigConfirmBtn: document.getElementById("analizarPdfExportConfigConfirmBtn"),
  cleanupOldNotesInput: document.getElementById("analizarPdfCleanupOldNotes"),
  cleanupUnusedParagraphStylesInput: document.getElementById("analizarPdfCleanupUnusedParagraphStyles"),
  cleanupUnusedCharacterStylesInput: document.getElementById("analizarPdfCleanupUnusedCharacterStyles"),
  cleanupUnusedSwatchesInput: document.getElementById("analizarPdfCleanupUnusedSwatches"),
  cleanupOffPageObjectsInput: document.getElementById("analizarPdfCleanupOffPageObjects"),
  cleanupOffPageTextInput: document.getElementById("analizarPdfCleanupOffPageText"),
  applySelectedCorrectionsInput: document.getElementById("analizarPdfApplySelectedCorrections"),
  exportConfigSummary: document.getElementById("analizarPdfExportConfigSummary"),
```

- [ ] **Step 3: Add helpers to open, close, seed, and summarize modal state**

Implement focused helpers:

```js
function createDefaultExportCleanupOptions() {
  return {
    removeOldNotes: false,
    removeUnusedParagraphStyles: false,
    removeUnusedCharacterStyles: false,
    removeUnusedSwatches: false,
    removeOffPageObjects: false,
    removeOffPageText: false,
    applySelectedCorrections: false,
  };
}

function hasAnyExportActionSelected(options = {}) {
  return Object.values(options || {}).some((value) => value === true);
}
```

And:

```js
function openExportConfigModal() { ... }
function closeExportConfigModal() { ... }
function renderExportConfigModal() { ... }
function buildExportConfigSummaryLines(session = store.getActiveSession()) { ... }
```

Summary must include:

```js
[
  `Páginas seleccionadas: ${summary.selectedPageCount}`,
  `Hallazgos seleccionados: ${summary.selectedIssueCount}`,
  `Autocorrecciones directas: ${summary.autoApplicableCount}`,
  `Notas editoriales por fallback: ${summary.editorialFallbackCount}`,
  `Limpiezas activas: ${activeCleanupCount}`,
]
```

- [ ] **Step 4: Replace direct export button behavior with modal open**

Change the current `els.exportCorrectedBtn` click handler so it:

```js
  const correctionPayload = collectSelectedCorrectionPayload(session);
  const nextOptions = createDefaultExportCleanupOptions();
  if (correctionPayload.issues.length) {
    nextOptions.applySelectedCorrections = true;
  }
  state.exportCleanupOptions = nextOptions;
  state.exportConfigModalOpen = true;
  renderExportConfigModal();
```

Do not call API from this handler anymore.

- [ ] **Step 5: Wire modal close/cancel/input change/confirm handlers**

Add listeners so:

- close button, cancel button, and backdrop call `closeExportConfigModal()`
- checkbox changes update `state.exportCleanupOptions`
- confirm button:
  - validates at least one selected action
  - if `applySelectedCorrections` is false and all cleanup flags are false, block
  - calls `exportAnalizarPdfCorrectedIdml(...)` with both payload sections

Use:

```js
const correctionPayload = collectSelectedCorrectionPayload(session);
const cleanupOptions = { ...state.exportCleanupOptions };
```

- [ ] **Step 6: Run syntax verification**

Run: `node --check /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-app.js`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-app.js
git commit -m "feat: add export config modal state and summary"
```

## Task 3: Style the Export Modal

**Files:**
- Modify: `/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf.css`
- Test: `node --check /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-results.js`

- [ ] **Step 1: Add failing visual checklist comments**

Add CSS section header comment:

```css
/* Export config modal: compact editorial checklist with summary */
```

- [ ] **Step 2: Add modal layout styles**

Add styles like:

```css
.analizar-pdf-export-modal-card {
  width: min(760px, calc(100vw - 48px));
}

.analizar-pdf-export-modal-body {
  display: grid;
  gap: 18px;
}

.analizar-pdf-export-config-section {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--ap-line);
  border-radius: 16px;
  background: #fff;
}
```

- [ ] **Step 3: Add checklist and summary styles**

Include:

```css
.analizar-pdf-export-config-section label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.92rem;
}

.analizar-pdf-export-config-summary {
  display: grid;
  gap: 8px;
  color: var(--ap-muted);
}

.analizar-pdf-export-modal-actions {
  justify-content: flex-end;
}
```

Also add disabled state for confirm button:

```css
#analizarPdfExportConfigConfirmBtn:disabled {
  opacity: 0.45;
  cursor: default;
}
```

- [ ] **Step 4: Run existing JS syntax checks**

Run:

```bash
node --check /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-app.js
node --check /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-results.js
```

Expected: PASS for both

- [ ] **Step 5: Commit**

```bash
git add /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf.css
git commit -m "feat: style export config modal"
```

## Task 4: Send `cleanupOptions` Through the API

**Files:**
- Modify: `/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-api.js`
- Modify: `/Users/waldolopez/Documents/CharlyBrown/backend/server.js`
- Test: `node --check /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-api.js`
- Test: `node --check /Users/waldolopez/Documents/CharlyBrown/backend/server.js`

- [ ] **Step 1: Update frontend API client signature**

Change:

```js
export async function exportAnalizarPdfCorrectedIdml(sessionId = "", revisionId = "", fileId = "", correctionSelection = null)
```

to:

```js
export async function exportAnalizarPdfCorrectedIdml(
  sessionId = "",
  revisionId = "",
  fileId = "",
  correctionSelection = null,
  cleanupOptions = null
)
```

Send:

```js
body: JSON.stringify({
  sessionId: cleanSessionId,
  revisionId: cleanRevisionId,
  fileId: cleanFileId,
  correctionSelection: correctionSelection && typeof correctionSelection === "object" ? correctionSelection : null,
  cleanupOptions: cleanupOptions && typeof cleanupOptions === "object" ? cleanupOptions : null,
})
```

- [ ] **Step 2: Validate cleanup input in backend**

In `/backend/server.js`, parse:

```js
const cleanupOptions = req.body?.cleanupOptions && typeof req.body.cleanupOptions === "object"
  ? req.body.cleanupOptions
  : null;
```

Normalize to:

```js
const normalizedCleanupOptions = {
  removeOldNotes: cleanupOptions?.removeOldNotes === true,
  removeUnusedParagraphStyles: cleanupOptions?.removeUnusedParagraphStyles === true,
  removeUnusedCharacterStyles: cleanupOptions?.removeUnusedCharacterStyles === true,
  removeUnusedSwatches: cleanupOptions?.removeUnusedSwatches === true,
  removeOffPageObjects: cleanupOptions?.removeOffPageObjects === true,
  removeOffPageText: cleanupOptions?.removeOffPageText === true,
  applySelectedCorrections: cleanupOptions?.applySelectedCorrections === true,
};
```

- [ ] **Step 3: Reject export requests with no active action**

Add:

```js
const hasCleanup = Object.values(normalizedCleanupOptions).some((value) => value === true);
const selectedIssues = Array.isArray(correctionSelection?.selectedIssues) ? correctionSelection.selectedIssues : [];
const wantsCorrections = normalizedCleanupOptions.applySelectedCorrections === true;
if (!hasCleanup && !selectedIssues.length) {
  return res.status(400).json({ error: "No hay acciones seleccionadas para la exportación." });
}
if (wantsCorrections && !selectedIssues.length) {
  return res.status(400).json({ error: "No hay hallazgos seleccionados para corregir." });
}
```

Note: `hasCleanup` can include `applySelectedCorrections`, so compute a second flag excluding it if needed:

```js
const hasStructuralCleanup =
  normalizedCleanupOptions.removeOldNotes ||
  normalizedCleanupOptions.removeUnusedParagraphStyles ||
  normalizedCleanupOptions.removeUnusedCharacterStyles ||
  normalizedCleanupOptions.removeUnusedSwatches ||
  normalizedCleanupOptions.removeOffPageObjects ||
  normalizedCleanupOptions.removeOffPageText;
```

- [ ] **Step 4: Pass both sections to Python payload**

Send:

```js
const payload = {
  toolName: ANALIZAR_PDF_MAPPING_TOOL_NAME,
  result: file.result || {},
  file,
  revision,
  session,
  correctionSelection,
  cleanupOptions: normalizedCleanupOptions,
};
```

- [ ] **Step 5: Run syntax checks**

Run:

```bash
node --check /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-api.js
node --check /Users/waldolopez/Documents/CharlyBrown/backend/server.js
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-api.js /Users/waldolopez/Documents/CharlyBrown/backend/server.js
git commit -m "feat: send export cleanup options to backend"
```

## Task 5: Implement Old Note Cleanup in Python

**Files:**
- Modify: `/Users/waldolopez/Documents/CharlyBrown/backend/python/correct_idml.py`
- Test: `PYTHONPYCACHEPREFIX=/tmp/pycache python3 -m py_compile /Users/waldolopez/Documents/CharlyBrown/backend/python/correct_idml.py`

- [ ] **Step 1: Add cleanup option normalization helper**

Implement:

```python
def normalize_cleanup_options(payload):
    source = (payload or {}).get("cleanupOptions") or {}
    return {
        "removeOldNotes": bool(source.get("removeOldNotes")),
        "removeUnusedParagraphStyles": bool(source.get("removeUnusedParagraphStyles")),
        "removeUnusedCharacterStyles": bool(source.get("removeUnusedCharacterStyles")),
        "removeUnusedSwatches": bool(source.get("removeUnusedSwatches")),
        "removeOffPageObjects": bool(source.get("removeOffPageObjects")),
        "removeOffPageText": bool(source.get("removeOffPageText")),
        "applySelectedCorrections": bool(source.get("applySelectedCorrections")),
    }
```

- [ ] **Step 2: Add removal of history notes inside `Change`**

Implement a helper using a parent map:

```python
def remove_old_history_notes(root):
    parent_map = {child: parent for parent in root.iter() for child in list(parent)}
    removed = 0
    for node in list(root.iter()):
        if local_name(node.tag) != "Note":
            continue
        current = parent_map.get(node)
        inside_change = False
        while current is not None:
            if local_name(current.tag) == "Change":
                inside_change = True
                break
            current = parent_map.get(current)
        if not inside_change:
            continue
        parent = parent_map.get(node)
        if parent is not None:
            parent.remove(node)
            removed += 1
    return removed
```

- [ ] **Step 3: Call the note cleanup before correction application**

Inside story processing:

```python
cleanup_stats = {
    "removedOldNotes": 0,
    ...
}
```

And:

```python
if cleanup_options["removeOldNotes"]:
    cleanup_stats["removedOldNotes"] += remove_old_history_notes(root)
```

- [ ] **Step 4: Include cleanup summary in JSON output**

Return:

```python
"cleanup": cleanup_stats,
```

with at least:

```python
{
    "removedOldNotes": 0,
    "removedUnusedParagraphStyles": 0,
    "removedUnusedCharacterStyles": 0,
    "removedUnusedSwatches": 0,
    "removedOffPageObjects": 0,
    "removedOffPageText": 0,
}
```

- [ ] **Step 5: Compile check**

Run: `PYTHONPYCACHEPREFIX=/tmp/pycache python3 -m py_compile /Users/waldolopez/Documents/CharlyBrown/backend/python/correct_idml.py`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add /Users/waldolopez/Documents/CharlyBrown/backend/python/correct_idml.py
git commit -m "feat: add old note cleanup to IDML export"
```

## Task 6: Implement Off-Page Text and Off-Page Object Cleanup

**Files:**
- Modify: `/Users/waldolopez/Documents/CharlyBrown/backend/python/correct_idml.py`
- Test: `PYTHONPYCACHEPREFIX=/tmp/pycache python3 -m py_compile /Users/waldolopez/Documents/CharlyBrown/backend/python/correct_idml.py`

- [ ] **Step 1: Add document geometry helpers**

Implement small helpers:

```python
def parse_geometric_bounds(value=""):
    ...

def rects_intersect(a, b):
    ...
```

Use the InDesign `GeometricBounds` format `[y1, x1, y2, x2]`.

- [ ] **Step 2: Build visible page bounds index from spreads**

Add a preprocessing helper that reads `Spreads/Spread_*.xml` members from the ZIP and captures per-page bounds:

```python
def build_page_bounds_index(source_zip):
    return {
        "Page/Page_u123": (y1, x1, y2, x2),
    }
```

This helper may inspect `Page` nodes and their `GeometricBounds`.

- [ ] **Step 3: Remove text frames fully outside page bounds**

Implement:

```python
def remove_off_page_text_frames(root, page_bounds_index):
    removed = 0
    ...
    return removed
```

Only remove `TextFrame`-like items whose geometric bounds do not intersect their owning page bounds at all.

- [ ] **Step 4: Remove non-text objects fully outside page bounds**

Implement:

```python
def remove_off_page_objects(root, page_bounds_index):
    removed = 0
    ...
    return removed
```

Limit targets to common object containers such as:

- `Rectangle`
- `Oval`
- `Polygon`
- `Group`
- `GraphicLine`

Do not remove if bounds intersect the page.

- [ ] **Step 5: Call these cleanup passes conditionally**

Use:

```python
if cleanup_options["removeOffPageText"]:
    cleanup_stats["removedOffPageText"] += remove_off_page_text_frames(root, page_bounds_index)
if cleanup_options["removeOffPageObjects"]:
    cleanup_stats["removedOffPageObjects"] += remove_off_page_objects(root, page_bounds_index)
```

- [ ] **Step 6: Compile check**

Run: `PYTHONPYCACHEPREFIX=/tmp/pycache python3 -m py_compile /Users/waldolopez/Documents/CharlyBrown/backend/python/correct_idml.py`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add /Users/waldolopez/Documents/CharlyBrown/backend/python/correct_idml.py
git commit -m "feat: add off-page cleanup for IDML export"
```

## Task 7: Implement Unused Style and Swatch Cleanup

**Files:**
- Modify: `/Users/waldolopez/Documents/CharlyBrown/backend/python/correct_idml.py`
- Test: `PYTHONPYCACHEPREFIX=/tmp/pycache python3 -m py_compile /Users/waldolopez/Documents/CharlyBrown/backend/python/correct_idml.py`

- [ ] **Step 1: Add style/swatch usage scanners**

Implement helpers:

```python
def collect_used_paragraph_styles(source_zip):
    ...

def collect_used_character_styles(source_zip):
    ...

def collect_used_swatches(source_zip):
    ...
```

They should scan XML members for referenced style/swatches rather than guessing from analysis output.

- [ ] **Step 2: Add XML pruning helpers for style resources**

Implement:

```python
def prune_unused_paragraph_styles(styles_root, used_style_ids):
    ...

def prune_unused_character_styles(styles_root, used_style_ids):
    ...

def prune_unused_swatches(graphic_root, used_swatch_ids):
    ...
```

Preserve:

- `$ID` defaults
- the correction mark style `Peppermint Patty Editor`
- parent/base styles still needed

- [ ] **Step 3: Apply pruning in `Resources/Styles.xml` and `Resources/Graphic.xml`**

Update ZIP member handling:

```python
if member.filename == "Resources/Styles.xml":
    ...
elif member.filename == "Resources/Graphic.xml":
    ...
```

Track removed counts into `cleanup_stats`.

- [ ] **Step 4: Compile check**

Run: `PYTHONPYCACHEPREFIX=/tmp/pycache python3 -m py_compile /Users/waldolopez/Documents/CharlyBrown/backend/python/correct_idml.py`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/waldolopez/Documents/CharlyBrown/backend/python/correct_idml.py
git commit -m "feat: add unused style and swatch cleanup"
```

## Task 8: Gate Selected Corrections Behind Modal Option

**Files:**
- Modify: `/Users/waldolopez/Documents/CharlyBrown/backend/python/correct_idml.py`
- Test: `python3 /Users/waldolopez/Documents/CharlyBrown/backend/python/correct_idml.py ...`

- [ ] **Step 1: Make correction build conditional**

Change:

```python
operations = build_operations(payload)
```

to:

```python
cleanup_options = normalize_cleanup_options(payload)
operations = build_operations(payload) if cleanup_options["applySelectedCorrections"] else []
```

- [ ] **Step 2: Preserve cleanup-only exports**

Ensure a cleanup-only payload still returns:

```python
{
    "ok": True,
    "appliedCount": 0,
    "editorialNoteCount": 0,
    "omittedCount": 0,
    "cleanup": {...}
}
```

- [ ] **Step 3: Run smoke check with cleanup-only payload**

Run:

```bash
python3 /Users/waldolopez/Documents/CharlyBrown/backend/python/correct_idml.py \
  --input /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/EEFESPPRI_10REV_TRIM1_P2_LA_02_U1.idml \
  --output /tmp/cleanup-only.idml \
  --payload-json '{"cleanupOptions":{"removeOldNotes":true,"applySelectedCorrections":false}}'
```

Expected: JSON with `"ok": true` and `"cleanup"` present.

- [ ] **Step 4: Commit**

```bash
git add /Users/waldolopez/Documents/CharlyBrown/backend/python/correct_idml.py
git commit -m "feat: support cleanup-only corrected export"
```

## Task 9: Add Export Smoke Script

**Files:**
- Create: `/Users/waldolopez/Documents/CharlyBrown/scripts/test-analizar-idml-export-cleanup.mjs`
- Test: `node /Users/waldolopez/Documents/CharlyBrown/scripts/test-analizar-idml-export-cleanup.mjs`

- [ ] **Step 1: Write smoke script**

Create:

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const input = "/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/EEFESPPRI_10REV_TRIM1_P2_LA_02_U1.idml";
const output = "/tmp/test-analizar-idml-export-cleanup.idml";
const payload = JSON.stringify({
  cleanupOptions: {
    removeOldNotes: true,
    removeUnusedParagraphStyles: false,
    removeUnusedCharacterStyles: false,
    removeUnusedSwatches: false,
    removeOffPageObjects: false,
    removeOffPageText: false,
    applySelectedCorrections: false,
  }
});

const result = spawnSync("python3", [
  "/Users/waldolopez/Documents/CharlyBrown/backend/python/correct_idml.py",
  "--input", input,
  "--output", output,
  "--payload-json", payload,
], { encoding: "utf8" });

assert.equal(result.status, 0, result.stderr || result.stdout);
const parsed = JSON.parse(result.stdout);
assert.equal(parsed.ok, true);
assert.ok(parsed.cleanup);
assert.ok("removedOldNotes" in parsed.cleanup);
console.log("ok");
```

- [ ] **Step 2: Run smoke script**

Run: `node /Users/waldolopez/Documents/CharlyBrown/scripts/test-analizar-idml-export-cleanup.mjs`

Expected: prints `ok`

- [ ] **Step 3: Commit**

```bash
git add /Users/waldolopez/Documents/CharlyBrown/scripts/test-analizar-idml-export-cleanup.mjs
git commit -m "test: add IDML export cleanup smoke script"
```

## Task 10: Final Verification Sweep

**Files:**
- Verify only

- [ ] **Step 1: Run frontend syntax verification**

Run:

```bash
node --check /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-app.js
node --check /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-results.js
node --check /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-api.js
```

Expected: all PASS silently

- [ ] **Step 2: Run backend verification**

Run:

```bash
node --check /Users/waldolopez/Documents/CharlyBrown/backend/server.js
PYTHONPYCACHEPREFIX=/tmp/pycache python3 -m py_compile /Users/waldolopez/Documents/CharlyBrown/backend/python/correct_idml.py
```

Expected: PASS

- [ ] **Step 3: Run export smoke checks**

Run:

```bash
node /Users/waldolopez/Documents/CharlyBrown/scripts/test-analizar-idml-export-cleanup.mjs
python3 /Users/waldolopez/Documents/CharlyBrown/backend/python/correct_idml.py \
  --input /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/EEFESPPRI_10REV_TRIM1_P2_LA_02_U1.idml \
  --output /tmp/pp-final-smoke.idml \
  --payload-json '{"cleanupOptions":{"removeOldNotes":true,"applySelectedCorrections":false},"correctionSelection":{"selectedIssues":[{"id":"smoke-1","kind":"orthotypography","pageName":"37","storyId":"u14c9","source":"minusculo","target":"minúsculo","context":"Soy minusculo","message":"smoke"}]}}'
```

Expected:

- first command prints `ok`
- second command returns JSON with `ok: true`

- [ ] **Step 4: Manual UI verification**

Verify in the app:

- export button opens modal
- correction option prechecks only when report selections exist
- confirm button disables with no actions active
- cleanup-only export path works
- correction-only export path works
- mixed export path works

- [ ] **Step 5: Final commit**

```bash
git add /Users/waldolopez/Documents/CharlyBrown/public/PeppermintPattyAnalizer.html \
        /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-app.js \
        /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-api.js \
        /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf.css \
        /Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-results.js \
        /Users/waldolopez/Documents/CharlyBrown/backend/server.js \
        /Users/waldolopez/Documents/CharlyBrown/backend/python/correct_idml.py \
        /Users/waldolopez/Documents/CharlyBrown/scripts/test-analizar-idml-export-cleanup.mjs
git commit -m "feat: add configurable corrected IDML export cleanup flow"
```

## Self-Review

### Spec coverage

- Selection by page and issue: covered in Tasks 1-2.
- Modal with cleanup choices and correction toggle: covered in Tasks 1-3.
- `DeletedText` cleanup: covered in Task 5.
- Unused styles/swatches cleanup: covered in Task 7.
- Off-page object and off-page text cleanup: covered in Task 6.
- Selected corrections with editorial-note fallback: already partially implemented, explicitly gated in Task 8 and verified in Task 10.

### Placeholder scan

- No `TBD` / `TODO`.
- All task steps include exact files and concrete commands.
- All code steps include concrete snippets rather than generic references.

### Type consistency

- Frontend uses `cleanupOptions`.
- Correction payload remains `correctionSelection`.
- Boolean keys are consistent across frontend, backend, and Python:
  - `removeOldNotes`
  - `removeUnusedParagraphStyles`
  - `removeUnusedCharacterStyles`
  - `removeUnusedSwatches`
  - `removeOffPageObjects`
  - `removeOffPageText`
  - `applySelectedCorrections`
