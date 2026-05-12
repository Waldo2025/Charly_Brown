# Fuentes destacadas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `Fuentes destacadas` module type that stores a web URL and bibliographic reference in `Instrucciones IA`, performs strict site extraction, and generates a full source card with Gemini.

**Architecture:** Extend the existing module-type catalog and instruction modal with structured metadata fields, then route `Generar con IA` for this type through a dedicated strict extraction step and prompt. Backend will expose a focused URL extraction endpoint so the frontend never fetches arbitrary sites directly.

**Tech Stack:** Vanilla JS frontend, Firebase/Firestore module persistence, Express backend, Gemini backend API, Node-based smoke tests.

---

### Task 1: Add failing tests for source extraction and strict validation

**Files:**
- Create: `scripts/moodle-course-featured-sources.test.mjs`
- Modify: `backend/server.js`
- Modify: `public/moodleCourse.js`

- [ ] **Step 1: Write the failing test**

Create a Node script that asserts:
- a helper for extracting readable text from HTML returns title + text;
- the helper removes scripts/styles/noise;
- strict validation for `Fuentes destacadas` rejects missing URL/reference.

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/moodle-course-featured-sources.test.mjs`
Expected: FAIL because the extraction helper and strict validation helpers do not exist yet.

- [ ] **Step 3: Implement minimal helper surface**

Add helper functions first with minimal output contracts, then wire the test script to them.

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/moodle-course-featured-sources.test.mjs`
Expected: PASS

### Task 2: Add `Fuentes destacadas` to the module catalog and persistence model

**Files:**
- Modify: `public/moodleCourse.js`
- Test: `scripts/moodle-course-featured-sources.test.mjs`

- [ ] **Step 1: Add failing assertions to the test**

Extend the test script to assert:
- `normalizarTipoModulo("Fuentes destacadas") === "fuentes_destacadas"`
- selector metadata exists
- default content and instructions are created

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/moodle-course-featured-sources.test.mjs`
Expected: FAIL on missing type normalization and defaults.

- [ ] **Step 3: Implement catalog support**

Update:
- `normalizarTipoModulo`
- `getModuloIcon`
- selector metadata/labels
- `mostrarSelectorModulo`
- `construirContenidoInicialModulo`
- `construirInstruccionesInicialesModulo`
- module creation payload with:
  - `fuenteDestacadaUrl`
  - `fuenteDestacadaReferencia`

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/moodle-course-featured-sources.test.mjs`
Expected: PASS

### Task 3: Add structured UI fields in `Instrucciones IA`

**Files:**
- Modify: `public/moodleCourse.html`
- Modify: `public/moodleCourse.css`
- Modify: `public/moodleCourse.js`
- Test: `scripts/moodle-course-featured-sources.test.mjs`

- [ ] **Step 1: Add failing assertions to the test**

Add assertions for helper behavior that serializes/deserializes source metadata independently from freeform instructions.

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/moodle-course-featured-sources.test.mjs`
Expected: FAIL on missing metadata helpers.

- [ ] **Step 3: Implement minimal UI and local sync**

Add a dedicated section in the Gemini instructions modal with:
- URL input
- bibliographic reference textarea

Wire it so:
- it only shows for `Fuentes destacadas`
- it loads from module metadata
- it syncs locally on input
- it saves through `guardarModulo`

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/moodle-course-featured-sources.test.mjs`
Expected: PASS

### Task 4: Add strict extraction backend endpoint

**Files:**
- Modify: `backend/server.js`
- Test: `scripts/moodle-course-featured-sources.test.mjs`

- [ ] **Step 1: Add failing assertions to the test**

Add assertions for a backend-safe HTML extraction helper:
- title preserved
- scripts/styles removed
- body text condensed
- empty output rejected

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/moodle-course-featured-sources.test.mjs`
Expected: FAIL on missing backend helper behavior.

- [ ] **Step 3: Implement endpoint and helper**

Add a focused route such as `POST /api/moodle/extract-featured-source` that:
- validates `url`
- fetches the page
- extracts readable text
- returns `{ title, extractedText, finalUrl }`
- rejects inaccessible or empty extraction with non-2xx

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/moodle-course-featured-sources.test.mjs`
Expected: PASS

### Task 5: Add strict Gemini generation flow for `Fuentes destacadas`

**Files:**
- Modify: `public/moodleCourse.js`
- Modify: `public/moodlecourse-geminiOperations.js`
- Test: `scripts/moodle-course-featured-sources.test.mjs`

- [ ] **Step 1: Add failing assertions to the test**

Add assertions for:
- strict validation blocks missing fields
- prompt builder includes URL, reference, and extraction text
- module type selects the dedicated prompt path

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/moodle-course-featured-sources.test.mjs`
Expected: FAIL on missing dedicated prompt/flow.

- [ ] **Step 3: Implement generation**

Update frontend generation flow so that for `Fuentes destacadas`:
- it validates metadata first;
- calls the new backend extraction endpoint;
- aborts on any extraction failure;
- builds a dedicated `ficha completa` prompt;
- renders structured output into the module.

Add prompt rules in `moodlecourse-geminiOperations.js` for:
- `Resumen ejecutivo`
- `Ideas clave`
- `Análisis crítico`
- `Confiabilidad y sesgos`
- `Citas o fragmentos relevantes`
- `Aplicación pedagógica`
- `Referencia bibliográfica`

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/moodle-course-featured-sources.test.mjs`
Expected: PASS

### Task 6: Verify end-to-end safety and regressions

**Files:**
- Modify: `public/moodleCourse.js`
- Modify: `public/moodlecourse-geminiOperations.js`
- Modify: `backend/server.js`
- Test: `scripts/moodle-course-featured-sources.test.mjs`

- [ ] **Step 1: Run focused verification**

Run:
- `node --check public/moodleCourse.js`
- `node --check public/moodlecourse-geminiOperations.js`
- `node --check backend/server.js`
- `node scripts/moodle-course-featured-sources.test.mjs`

Expected: all commands succeed.

- [ ] **Step 2: Sanity check no unrelated paths broke**

Run:
- `node scripts/moodle-course-save-order.test.mjs`

Expected: PASS

- [ ] **Step 3: Review changed files**

Inspect diff for only:
- module catalog additions
- instruction modal fields
- strict extraction route
- dedicated Gemini prompt/flow

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-05-10-fuentes-destacadas.md scripts/moodle-course-featured-sources.test.mjs public/moodleCourse.html public/moodleCourse.css public/moodleCourse.js public/moodlecourse-geminiOperations.js backend/server.js
git commit -m "feat: add fuentes destacadas module type"
```
