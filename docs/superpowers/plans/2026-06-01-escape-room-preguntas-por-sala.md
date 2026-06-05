# Preguntas internas por sala Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow each sala/mission to contain multiple internal questions that can be solved in any order, while keeping room unlocks and export packaging intact.

**Architecture:** Extend the creator model so each mission normalizes a `preguntas[]` array. The editor prompt will request a fixed number of questions per room, and the export runtime will render each room as a container with independent question cards and per-question verification state. Media assets inside nested questions will also be extracted into the ZIP package.

**Tech Stack:** Vanilla JavaScript modules, HTML, CSS, Node-based smoke tests, JSZip export packaging.

---

### Task 1: Add form input and generator prompt support

**Files:**
- Modify: `public/escapeRoomCreator.html`
- Modify: `public/js/escapeRoomCreator.js`
- Test: `scripts/test-escape-room-creator-shell.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
assert.match(html, /id="preguntasPorSalaInput"/, "El formulario debe permitir definir preguntas por sala.");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-escape-room-creator-shell.mjs`
Expected: FAIL because the input does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add a numeric field labeled `Preguntas por sala` and include `preguntasPorSala` in `getFormData()` and the prompt schema.

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-escape-room-creator-shell.mjs`
Expected: PASS.

### Task 2: Normalize nested questions in the data model

**Files:**
- Modify: `public/js/escape-room-creator-model.mjs`
- Test: `scripts/test-escape-room-creator-model.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
const project = normalizeEscapeRoomProject({
  misiones: [{
    titulo: "Sala 1",
    preguntas: [{
      id: "q1",
      titulo: "Pregunta 1",
      tipo_interaccion: "texto",
      subtipo_respuesta: "palabra",
      respuesta_correcta: "llave"
    }]
  }]
});

assert.equal(project.misiones[0].preguntas.length, 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-escape-room-creator-model.mjs`
Expected: FAIL because `preguntas` is not normalized yet.

- [ ] **Step 3: Write minimal implementation**

Add `normalizeQuestion`, `normalizeQuestionList`, and `validateQuestionAnswer`, and have missions normalize nested questions while preserving legacy single-question rooms.

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-escape-room-creator-model.mjs`
Expected: PASS.

### Task 3: Render and validate multiple questions per room in the export package

**Files:**
- Modify: `public/js/escape-room-package-builder.mjs`
- Test: `scripts/test-escape-room-package-builder.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
assert.match(pkg.files["index.html"], /data-question-card/, "La vista exportada debe renderizar tarjetas de preguntas internas.");
assert.ok(pkg.files["assets/media/q1-question-media.png"], "Las medias anidadas deben extraerse al paquete.");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-escape-room-package-builder.mjs`
Expected: FAIL because the runtime still only renders una pregunta por sala.

- [ ] **Step 3: Write minimal implementation**

Build a room-level renderer that iterates over `mission.preguntas`, tracks completed questions independently, and completes the room only when every question is solved. Extract nested data URLs from question media and reference images.

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-escape-room-package-builder.mjs`
Expected: PASS.

### Task 4: Regenerate and smoke-test a real ZIP export

**Files:**
- Generated artifact under `/Users/waldolopez/Documents/CharlyBrown/_regen_codigo_estelar`
- Generated ZIP under `/Users/waldolopez/Documents/CharlyBrown/EscapeRoom_Operacion_Codigo_Estelar_El_Colapso_del_Sistema_fixed.zip`

- [ ] **Step 1: Run export regeneration and syntax checks**

Run: `node --check public/js/escape-room-package-builder.mjs && node --check public/js/escapeRoomCreator.js`
Expected: PASS.

- [ ] **Step 2: Regenerate the real ZIP from the desktop project JSON and smoke-test it**

Run the package regeneration script and unzip the result, then run `node --check` on the emitted `assets/game.js`.
Expected: PASS and no missing assets.

- [ ] **Step 3: Commit**

```bash
git add public/escapeRoomCreator.html public/js/escapeRoomCreator.js public/js/escape-room-creator-model.mjs public/js/escape-room-package-builder.mjs scripts/test-escape-room-creator-shell.mjs scripts/test-escape-room-creator-model.mjs scripts/test-escape-room-package-builder.mjs docs/superpowers/plans/2026-06-01-escape-room-preguntas-por-sala.md
git commit -m "feat: allow multiple questions per room"
```
