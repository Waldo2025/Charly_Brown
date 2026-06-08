# Analizar IDML Sessions / Revisions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Refactor `analizarPDF` from a flat session model into `session -> revision -> file -> comparison`, support multiple files per revision, bulk analysis, grouped anchors by file, revision comparison `F1 vs F2`, and recortable verification for `IDML`.

**Architecture:**  
Frontend will maintain three active entities: `activeSession`, `activeRevision`, `activeFile`. Firestore will persist session documents with subcollections for revisions, files, and comparisons. Analysis jobs will write results at file level and roll summaries up to the revision level. The right rail and page report will regroup by file. `IDML` parsing will add a new deterministic validator for recortables.

**Tech Stack:** Vanilla JS modular frontend, Firestore, Express/Node backend, Python 3 IDML parser, existing Gemini verifier, incremental migration path.

---

## File Structure

### Existing files to modify

- `public/analizarPDF.html`
- `public/analizarPDF/analizar-pdf.css`
- `public/analizarPDF/analizar-pdf-app.js`
- `public/analizarPDF/analizar-pdf-session-store.js`
- `public/analizarPDF/analizar-pdf-results.js`
- `public/analizarPDF/analizar-pdf-sidepanel.js`
- `public/analizarPDF/analizar-pdf-api.js`
- `backend/analizar-pdf.js`
- `backend/server.js`
- `backend/python/analyze_idml.py`
- `backend/python/analizar_idml/pipeline.py`
- `backend/python/analizar_idml/stories.py`
- `backend/python/analizar_idml/pages.py`
- `scripts/test-analizar-pdf-shell.mjs`
- `scripts/test-analizar-pdf-session-store.mjs`
- `scripts/test-analizar-idml-sample.mjs`

### New files to create

- `backend/python/analizar_idml/recortables.py`
- `scripts/test-analizar-pdf-session-hierarchy.mjs`
- `scripts/test-analizar-idml-recortables.mjs`

---

## Phase 1: Data model and persistence

### Task 1: Introduce hierarchical entities

**Files:**
- Modify: `public/analizarPDF/analizar-pdf-session-store.js`
- Modify: `backend/analizar-pdf.js`
- Test: `scripts/test-analizar-pdf-session-store.mjs`

- [ ] Change the normalized model from a single flat session result to:
  - `session`
  - `activeRevisionId`
  - `revisions[]`
  - `files[]` per revision
  - `comparisons[]`
- [ ] Add helpers to derive:
  - `sessionKey = nivel|grado|trimestre|edicion`
  - `revisionKey = unidad|revision`
  - `fileKey = normalized filename`
- [ ] Extend session normalization examples with:
  - `bibliographicInfo` at session level
  - revision metadata
  - file metadata and result payload
- [ ] Keep backward-compatible normalization path for legacy flat sessions.

### Task 2: Backend save/load contract for hierarchy

**Files:**
- Modify: `backend/server.js`
- Modify: `backend/analizar-pdf.js`

- [ ] Add load/save helpers for:
  - session documents
  - revision subcollection
  - file subcollection
  - comparison subcollection
- [ ] Define overwrite rules:
  - same `sessionKey` => reuse session
  - same `revisionKey` inside session => update revision
  - same `fileKey` inside revision => update file
  - different `fileKey` => append file
- [ ] Return a frontend-friendly aggregate payload:
  - session
  - revisions
  - active revision files
  - comparisons

### Task 3: Migration compatibility layer

**Files:**
- Modify: `backend/analizar-pdf.js`
- Test: `scripts/test-analizar-pdf-session-hierarchy.mjs`

- [ ] Read legacy flat sessions and expose them as:
  - one derived session
  - one derived revision
  - one derived file
- [ ] Avoid destructive migration in this phase.

---

## Phase 2: Frontend session / revision / file UX

### Task 4: Session identity from editorial base only

**Files:**
- Modify: `public/analizarPDF/analizar-pdf-app.js`
- Modify: `public/analizarPDF.html`

- [ ] Keep session identity derived only from:
  - `Nivel`
  - `Grado`
  - `Trimestre`
  - `Edición`
- [ ] Keep `Unidad` and `Revisión` as revision identity fields, not session title fields.
- [ ] Update visible session title label accordingly.

### Task 5: Add revision selector and revision list

**Files:**
- Modify: `public/analizarPDF.html`
- Modify: `public/analizarPDF/analizar-pdf-app.js`
- Modify: `public/analizarPDF/analizar-pdf.css`

- [ ] Add a `Revisiones` panel inside the workspace.
- [ ] Allow selecting current revision.
- [ ] Show revision labels as `Unidad · Revisión`.
- [ ] Make revision creation/update respect overwrite-by-identity.

### Task 6: Add file list inside revision

**Files:**
- Modify: `public/analizarPDF.html`
- Modify: `public/analizarPDF/analizar-pdf-app.js`
- Modify: `public/analizarPDF/analizar-pdf.css`

- [ ] Show files belonging to the active revision.
- [ ] Allow adding one file or multiple files.
- [ ] If uploaded filename already exists inside revision, overwrite that file record.
- [ ] If filename differs, append a new file under the same revision.

### Task 7: Bulk analysis flow

**Files:**
- Modify: `public/analizarPDF/analizar-pdf-api.js`
- Modify: `public/analizarPDF/analizar-pdf-app.js`

- [ ] Support queueing analysis for:
  - one active file
  - multiple newly attached files in a revision
- [ ] Display per-file status:
  - `idle`
  - `uploading`
  - `queued`
  - `processing`
  - `completed`
  - `failed`

---

## Phase 3: Results and navigation by file

### Task 8: Results panel regrouped by file

**Files:**
- Modify: `public/analizarPDF/analizar-pdf-results.js`

- [ ] Render revision-level summary first.
- [ ] Then render each file as its own analysis block.
- [ ] Keep page reports nested under the corresponding file only.

### Task 9: Right rail regrouped by file

**Files:**
- Modify: `public/analizarPDF/analizar-pdf-results.js`
- Modify: `public/analizarPDF/analizar-pdf.css`

- [ ] Group anchors as:
  - file
  - orthotypography
  - out-of-page / overflow
  - field profile
  - recortables
- [ ] Keep each file group collapsible.
- [ ] Preserve rail scroll behavior with long anchor lists.

---

## Phase 4: Revision comparison

### Task 10: Comparison data model

**Files:**
- Modify: `backend/analizar-pdf.js`
- Modify: `backend/server.js`

- [ ] Add comparison records under:
  - `analizarPDF/{sessionId}/comparisons/{comparisonId}`
- [ ] Comparison identity:
  - same unit
  - `fromRevisionKey`
  - `toRevisionKey`

### Task 11: Comparison engine v1

**Files:**
- Modify: `backend/python/analizar_idml/pipeline.py`
- Possibly create helper in backend JS for diff assembly

- [ ] Build comparison output between two revisions of the same unit:
  - pagination changes
  - section changes
  - spelling changes
  - orthotypography changes
  - color changes
  - field marker changes
  - recortable changes
- [ ] Report:
  - issues resolved
  - issues introduced
  - pages changed

### Task 12: Comparison UI

**Files:**
- Modify: `public/analizarPDF.html`
- Modify: `public/analizarPDF/analizar-pdf-app.js`
- Modify: `public/analizarPDF/analizar-pdf-results.js`

- [ ] Add UI to choose:
  - unit
  - from revision
  - to revision
- [ ] Render comparison report outside individual file reports.

---

## Phase 5: Recortables verification

### Task 13: Extract recortable signals

**Files:**
- Create: `backend/python/analizar_idml/recortables.py`
- Modify: `backend/python/analizar_idml/pipeline.py`
- Test: `scripts/test-analizar-idml-recortables.mjs`

- [ ] Detect origin pages where:
  - style `08_01_COMPETENCIA`
  - text `Recortable`
- [ ] From those origin pages, extract complete reference codes from body text:
  - `recortable PcT1`
  - `recortable PaT1`
  - `recortable 1a`
  - etc.
- [ ] Detect destination pages where the same code appears with paragraph style:
  - `01_00_TITULO LITERATURAS y EJERCICIOS`
- [ ] Validate destination footer:
  - style `12_01 PIE DE PAGINA DERCHO`
  - contains `recortable`

### Task 14: Build recortable issue model

**Files:**
- Modify: `backend/python/analizar_idml/recortables.py`
- Modify: `backend/python/analizar_idml/pipeline.py`

- [ ] Emit `recortableIssues` with cases:
  - origin without code
  - code without destination
  - multiple destinations
  - destination without recortable footer
  - destination without origin
- [ ] Emit successful recortable summaries:
  - code
  - origin pages
  - destination page

### Task 15: Recortables UI

**Files:**
- Modify: `public/analizarPDF/analizar-pdf-results.js`
- Modify: `public/analizarPDF/analizar-pdf.css`

- [ ] Add `Recortables` section per file.
- [ ] Add red badge on origin page when recortable validation fails.
- [ ] Add recortables anchors to the right rail grouped by file.

---

## Phase 6: Verification

### Task 16: Frontend and persistence verification

**Commands:**
- `node scripts/test-analizar-pdf-shell.mjs`
- `node scripts/test-analizar-pdf-session-store.mjs`
- `node scripts/test-analizar-pdf-session-hierarchy.mjs`

- [ ] Verify shell/UI contract still passes.
- [ ] Verify overwrite rules:
  - same session base => no new session
  - same revision identity => overwrite revision
  - same file name => overwrite file
  - different file name => add file

### Task 17: IDML parser verification

**Commands:**
- `PYTHONPYCACHEPREFIX=/Users/waldolopez/Documents/CharlyBrown/.pycache python3 -m py_compile backend/python/analyze_idml.py backend/python/analizar_idml/*.py`
- `node scripts/test-analizar-idml-sample.mjs`
- `node scripts/test-analizar-idml-recortables.mjs`

- [ ] Verify parser compiles.
- [ ] Verify grouped file reports still render.
- [ ] Verify recortables extraction and validation.

---

## Recommended execution order

1. Hierarchical persistence model
2. Session / revision / file frontend state
3. Bulk upload and per-file analysis
4. Results grouped by file
5. Recortables extraction and UI
6. Revision comparison
7. Final migration hardening and verification
