# Analizar IDML Rol Recortables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer explícito el rol de la ficha `Recortables`, usarlo para resolver destinos en análisis individual y masivo, y renderizar `Pendiente` sin bloquear análisis ni duplicar grupos en el rail.

**Architecture:** El cambio se apoya en el modelo actual de sesión y revisiones. El frontend agrega y persiste `recortableRole` solo en revisiones `Recortables`, el resolvedor de targets prioriza una ficha destino aplicable antes de la unidad activa, y el pipeline Python filtra revisiones destino y emite estado `Pendiente` cuando no hay una ficha recortables utilizable.

**Tech Stack:** HTML, CSS, JavaScript modular en `public/analizarPDF`, Node.js backend, pipeline Python `analizar_idml`, tests Node `.mjs`.

---

### Task 1: Modelar `recortableRole` en la sesión frontend

**Files:**
- Modify: `public/analizarPDF/analizar-pdf-app.js`
- Modify: `public/PeppermintPattyAnalizer.html`
- Test: `scripts/test-analizar-pdf-multi-revision-regression.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import { createEmptySession, upsertRevisionIntoSession } from "../public/analizarPDF/analizar-pdf-session-logic.js";

const session = createEmptySession();
const first = upsertRevisionIntoSession(session, {
  id: "rev-rec",
  unidad: "Recortables",
  revisionNumero: "F1",
  recortableRole: "destination",
});

assert.equal(first.revisions[0].recortableRole, "destination");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-analizar-pdf-multi-revision-regression.mjs`
Expected: FAIL because `recortableRole` is not preserved in reconciliation or fixtures.

- [ ] **Step 3: Write minimal implementation**

```js
const normalizedRecortableRole = normalizeRecortableRole(revision.recortableRole);
if (normalizedRecortableRole) {
  targetRevision.recortableRole = normalizedRecortableRole;
} else if (normalizeUnidad(targetRevision.unidad) !== "recortables") {
  delete targetRevision.recortableRole;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-analizar-pdf-multi-revision-regression.mjs`
Expected: PASS and no regression in existing session merge assertions.

- [ ] **Step 5: Commit**

```bash
git add public/analizarPDF/analizar-pdf-app.js public/PeppermintPattyAnalizer.html scripts/test-analizar-pdf-multi-revision-regression.mjs
git commit -m "feat: persist recortables role in revisions"
```

### Task 2: Mostrar selector de rol solo en unidad `Recortables`

**Files:**
- Modify: `public/PeppermintPattyAnalizer.html`
- Modify: `public/analizarPDF/analizar-pdf-app.js`
- Modify: `public/analizarPDF/analizar-pdf.css`
- Test: `scripts/test-analizar-pdf-multi-revision-regression.mjs`

- [ ] **Step 1: Write the failing test**

```js
assert.equal(getVisibleRecortableRole("Recortables"), true);
assert.equal(getVisibleRecortableRole("Unidad 3"), false);
assert.equal(getDefaultRecortableRole("Recortables", ""), "destination");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-analizar-pdf-multi-revision-regression.mjs`
Expected: FAIL because visibility/default helpers do not exist.

- [ ] **Step 3: Write minimal implementation**

```js
function shouldShowRecortableRole(unidad = "") {
  return normalizeUnidad(unidad) === "recortables";
}

function getEffectiveRecortableRole(revision = {}) {
  if (normalizeUnidad(revision?.unidad) !== "recortables") return "";
  return normalizeRecortableRole(revision?.recortableRole) || "destination";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-analizar-pdf-multi-revision-regression.mjs`
Expected: PASS and UI helpers export stable values.

- [ ] **Step 5: Commit**

```bash
git add public/PeppermintPattyAnalizer.html public/analizarPDF/analizar-pdf-app.js public/analizarPDF/analizar-pdf.css scripts/test-analizar-pdf-multi-revision-regression.mjs
git commit -m "feat: add recortables role selector"
```

### Task 3: Priorizar ficha `Recortables` destino en target resolution

**Files:**
- Modify: `public/analizarPDF/analizar-pdf-app.js`
- Modify: `public/analizarPDF/analizar-pdf-session-logic.js`
- Test: `scripts/test-analizar-pdf-multi-revision-regression.mjs`

- [ ] **Step 1: Write the failing test**

```js
const targets = await buildAnalysisTargetsForAllPure({
  session,
  activeRevisionId: "unidad-3",
  selectedFiles: [],
  resolveCachedFileForEntry: async (file) => ({ name: file.documentName }),
  buildFileKey: (value) => value,
});

assert.deepEqual(
  targets.map((target) => target.revision.id),
  ["rev-rec", "unidad-3"]
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-analizar-pdf-multi-revision-regression.mjs`
Expected: FAIL because target ordering does not inject recortables destination first.

- [ ] **Step 3: Write minimal implementation**

```js
const recortablesRevision = findDestinationRecortablesRevision(session);
if (recortablesRevision && recortablesRevision.id !== revision.id) {
  const recortablesTargets = await resolveRevisionTargets(recortablesRevision);
  targets.push(...recortablesTargets);
}
targets.push(...activeRevisionTargets);
return dedupeTargetsByRevisionFile(targets);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-analizar-pdf-multi-revision-regression.mjs`
Expected: PASS with deterministic order and no duplicate `revision/file`.

- [ ] **Step 5: Commit**

```bash
git add public/analizarPDF/analizar-pdf-app.js public/analizarPDF/analizar-pdf-session-logic.js scripts/test-analizar-pdf-multi-revision-regression.mjs
git commit -m "feat: prioritize recortables destination targets"
```

### Task 4: Emitir estado `Pendiente` desde el pipeline

**Files:**
- Modify: `backend/python/analizar_idml/pipeline.py`
- Test: `scripts/test-analizar-pdf-multi-revision-regression.mjs`

- [ ] **Step 1: Write the failing test**

```js
assert.equal(summary.pendingDestinations[0].code, "PcT1");
assert.equal(issue.severity, "pending");
assert.match(issue.message, /destino pendiente/i);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-analizar-pdf-multi-revision-regression.mjs`
Expected: FAIL because recortables missing destinations are not represented as `pending`.

- [ ] **Step 3: Write minimal implementation**

```py
page["recortableSummary"]["pendingDestinations"] = []

if origins and not destinations and linked_kind == "recortable":
    pending_issue = {
        "severity": "pending",
        "message": f"{label}: destino pendiente.",
    }
    page["recortableIssues"].append(pending_issue)
    page["recortableSummary"]["pendingDestinations"].append({
        "code": code,
        "label": label,
    })
    continue
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-analizar-pdf-multi-revision-regression.mjs`
Expected: PASS with stable summary shape and no worker crash.

- [ ] **Step 5: Commit**

```bash
git add backend/python/analizar_idml/pipeline.py scripts/test-analizar-pdf-multi-revision-regression.mjs
git commit -m "feat: mark unresolved recortables as pending"
```

### Task 5: Renderizar `Pendiente` en reporte y rail

**Files:**
- Modify: `public/analizarPDF/analizar-pdf-recortables.js`
- Modify: `public/analizarPDF/analizar-pdf-results.js`
- Modify: `public/analizarPDF/analizar-pdf.css`
- Test: `scripts/test-analizar-pdf-multi-revision-regression.mjs`

- [ ] **Step 1: Write the failing test**

```js
const html = renderRecortableMetaList({
  pageName: "12",
  recortableSummary: {
    pendingDestinations: [{ code: "PcT1", destinationLabel: "pendiente" }],
  },
  recortableIssues: [{ severity: "pending", message: "Recortable PcT1: destino pendiente." }],
});

assert.match(html, /Pendiente/);
assert.match(html, /PcT1/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-analizar-pdf-multi-revision-regression.mjs`
Expected: FAIL because UI renderers only support `OK` and `Error`.

- [ ] **Step 3: Write minimal implementation**

```js
const pending = Array.isArray(summary.pendingDestinations) ? summary.pendingDestinations : [];
const hasPending = pending.length || issues.some((item) => item?.severity === "pending");
const statusBadge = issues.length && !hasPending
  ? errorBadge
  : hasPending
    ? pendingBadge
    : okBadge;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-analizar-pdf-multi-revision-regression.mjs`
Expected: PASS and rendered HTML contains badge/text for `Pendiente`.

- [ ] **Step 5: Commit**

```bash
git add public/analizarPDF/analizar-pdf-recortables.js public/analizarPDF/analizar-pdf-results.js public/analizarPDF/analizar-pdf.css scripts/test-analizar-pdf-multi-revision-regression.mjs
git commit -m "feat: render pending recortables state"
```

### Task 6: Verificación integrada y caché frontend

**Files:**
- Modify: `public/version.json`
- Modify: `public/analizarPDF/analizar-pdf-app.js`
- Modify: `public/analizarPDF/analizar-pdf-results.js`
- Test: `scripts/test-analizar-pdf-multi-revision-regression.mjs`

- [ ] **Step 1: Run focused checks**

Run: `node --check public/analizarPDF/analizar-pdf-app.js && node --check public/analizarPDF/analizar-pdf-results.js && node --check public/analizarPDF/analizar-pdf-recortables.js`
Expected: PASS without syntax errors.

- [ ] **Step 2: Run regression test**

Run: `node scripts/test-analizar-pdf-multi-revision-regression.mjs`
Expected: PASS.

- [ ] **Step 3: Bump cache version**

```json
{
  "version": "1.0.10.384",
  "build": "2026-1.0.10.384",
  "cache_version": "2026-1.0.10.384"
}
```

- [ ] **Step 4: Verify browser behavior manually**

Run:

```bash
open http://127.0.0.1:5010/PeppermintPattyAnalizer.html
```

Expected:

- selector visible solo en `Recortables`
- análisis de unidad normal deja recortables `Pendiente` si no hay destino aplicable
- si existe ficha `Recortables` destino, se resuelve sin duplicar grupo

- [ ] **Step 5: Commit**

```bash
git add public/version.json public/analizarPDF/analizar-pdf-app.js public/analizarPDF/analizar-pdf-results.js public/analizarPDF/analizar-pdf-recortables.js
git commit -m "chore: finalize recortables role flow"
```
