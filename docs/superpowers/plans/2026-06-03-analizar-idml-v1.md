# Analizar PDF / IDML v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extender `analizarPDF` para soportar sesiones `PDF` e `IDML`, con metadatos editoriales, paleta configurable por sesión y reporte unificado de paginación, secciones, ortografía, ortotipografía y color.

**Architecture:** La UI mantiene un solo flujo de sesiones y agrega `sourceType`, `bibliographicInfo` y `colorConfig`. El backend conserva un endpoint común de análisis y despacha a un pipeline `PDF` o `IDML`. El pipeline `IDML` parsea el paquete estructuralmente y usa Gemini solo como verificador semántico sobre texto limpio.

**Tech Stack:** Vanilla JS modular, Firestore, Express/Node, Python 3, zip/XML parsing, PyMuPDF, pyenchant, Gemini API.

---

## File Structure

### Existing files to modify

- `public/analizarPDF.html`
- `public/analizarPDF/analizar-pdf.css`
- `public/analizarPDF/analizar-pdf-app.js`
- `public/analizarPDF/analizar-pdf-session-store.js`
- `public/analizarPDF/analizar-pdf-results.js`
- `public/analizarPDF/analizar-pdf-api.js`
- `backend/analizar-pdf.js`
- `backend/server.js`
- `backend/python/analyze_pdf.py`
- `backend/python/analizar_pdf/pipeline.py`
- `firestore.rules`
- `scripts/test-analizar-pdf-backend-contract.mjs`
- `scripts/test-analizar-pdf-session-store.mjs`
- `scripts/test-analizar-pdf-shell.mjs`

### New files to create

- `backend/python/analyze_idml.py`
- `backend/python/analizar_idml/__init__.py`
- `backend/python/analizar_idml/package.py`
- `backend/python/analizar_idml/document.py`
- `backend/python/analizar_idml/pages.py`
- `backend/python/analizar_idml/stories.py`
- `backend/python/analizar_idml/styles.py`
- `backend/python/analizar_idml/swatches.py`
- `backend/python/analizar_idml/pagination.py`
- `backend/python/analizar_idml/sections.py`
- `backend/python/analizar_idml/spelling.py`
- `backend/python/analizar_idml/orthotypography.py`
- `backend/python/analizar_idml/colors.py`
- `backend/python/analizar_idml/gemini_verifier.py`
- `backend/python/analizar_idml/pipeline.py`
- `scripts/test-analizar-idml-backend-contract.mjs`
- `scripts/test-analizar-idml-sample.mjs`

### Responsibility boundaries

- `public/analizarPDF/*`: UI, estado de sesión, render de resultados y subida de archivo.
- `backend/analizar-pdf.js`: shape de sesión, resumen, dispatch de tipo y utilidades del job runner.
- `backend/server.js`: rutas Express y orquestación del job.
- `backend/python/analizar_pdf/*`: pipeline `PDF`.
- `backend/python/analizar_idml/*`: pipeline `IDML`.
- `scripts/test-*`: contratos y smoke checks locales sin depender del despliegue remoto.

### Task 1: Extender el modelo de sesión y reglas

**Files:**
- Modify: `public/analizarPDF/analizar-pdf-session-store.js`
- Modify: `backend/analizar-pdf.js`
- Modify: `firestore.rules`
- Test: `scripts/test-analizar-pdf-session-store.mjs`

- [ ] **Step 1: Write the failing session-store test**

```js
import assert from "node:assert/strict";
import {
  normalizeAnalizarPdfSession,
  createEmptyAnalizarPdfSession
} from "../public/analizarPDF/analizar-pdf-session-store.js";

const empty = createEmptyAnalizarPdfSession();
assert.equal(empty.sourceType, "pdf");
assert.deepEqual(empty.bibliographicInfo, {
  nivel: "",
  grado: "",
  trimestre: "",
  edicionNumero: "",
  revisionNumero: ""
});
assert.deepEqual(empty.colorConfig, { palette: [] });
assert.deepEqual(empty.result.orthotypographyIssues, []);
assert.deepEqual(empty.result.colorIssues, []);

const normalized = normalizeAnalizarPdfSession({
  sourceType: "idml",
  bibliographicInfo: { nivel: "P5", grado: "10", trimestre: "1", edicionNumero: "10", revisionNumero: "F2" },
  colorConfig: {
    palette: [{ id: "c1", swatchName: "A_COLOR UNIDAD", cmyk: "64,39,0,0", hex: "#6f9eff" }]
  },
  result: {
    orthotypographyIssues: ["spacing"],
    colorIssues: ["swatch mismatch"]
  }
});

assert.equal(normalized.sourceType, "idml");
assert.equal(normalized.bibliographicInfo.revisionNumero, "F2");
assert.equal(normalized.colorConfig.palette[0].swatchName, "A_COLOR UNIDAD");
assert.deepEqual(normalized.result.orthotypographyIssues, ["spacing"]);
assert.deepEqual(normalized.result.colorIssues, ["swatch mismatch"]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-analizar-pdf-session-store.mjs`
Expected: FAIL because `sourceType`, `bibliographicInfo`, `colorConfig`, `orthotypographyIssues` and `colorIssues` are not normalized yet.

- [ ] **Step 3: Implement minimal frontend and backend session shape**

```js
// public/analizarPDF/analizar-pdf-session-store.js
sourceType: source.sourceType === "idml" ? "idml" : "pdf",
bibliographicInfo: {
  nivel: String(source?.bibliographicInfo?.nivel || "").trim(),
  grado: String(source?.bibliographicInfo?.grado || "").trim(),
  trimestre: String(source?.bibliographicInfo?.trimestre || "").trim(),
  edicionNumero: String(source?.bibliographicInfo?.edicionNumero || "").trim(),
  revisionNumero: String(source?.bibliographicInfo?.revisionNumero || "").trim()
},
colorConfig: {
  palette: Array.isArray(source?.colorConfig?.palette)
    ? source.colorConfig.palette.map((entry, index) => ({
        id: String(entry?.id || `color_${index + 1}`).trim() || `color_${index + 1}`,
        swatchName: String(entry?.swatchName || "").trim(),
        cmyk: String(entry?.cmyk || "").trim(),
        hex: String(entry?.hex || "").trim()
      }))
    : []
}
```

```js
// backend/analizar-pdf.js
sourceType: String(source.sourceType || "pdf").trim() === "idml" ? "idml" : "pdf",
bibliographicInfo: {
  nivel: clampText(source?.bibliographicInfo?.nivel || "", 80),
  grado: clampText(source?.bibliographicInfo?.grado || "", 80),
  trimestre: clampText(source?.bibliographicInfo?.trimestre || "", 80),
  edicionNumero: clampText(source?.bibliographicInfo?.edicionNumero || "", 80),
  revisionNumero: clampText(source?.bibliographicInfo?.revisionNumero || "", 80)
},
colorConfig: {
  palette: Array.isArray(source?.colorConfig?.palette)
    ? source.colorConfig.palette.map((entry, index) => ({
        id: clampText(entry?.id || `color_${index + 1}`, 120) || `color_${index + 1}`,
        swatchName: clampText(entry?.swatchName || "", 240),
        cmyk: clampText(entry?.cmyk || "", 80),
        hex: clampText(entry?.hex || "", 32)
      }))
    : []
}
```

```rules
// firestore.rules
match /analizarPDF/{sessionId} {
  allow create, update: if isSignedIn()
    && request.resource.data.ownerId == request.auth.uid
    && request.resource.data.sourceType in ['pdf', 'idml'];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-analizar-pdf-session-store.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/analizarPDF/analizar-pdf-session-store.js backend/analizar-pdf.js firestore.rules scripts/test-analizar-pdf-session-store.mjs
git commit -m "feat: extend analizar session model for idml metadata"
```

### Task 2: Añadir selector PDF/IDML, formulario editorial y paleta en la UI

**Files:**
- Modify: `public/analizarPDF.html`
- Modify: `public/analizarPDF/analizar-pdf.css`
- Modify: `public/analizarPDF/analizar-pdf-app.js`
- Test: `scripts/test-analizar-pdf-shell.mjs`

- [ ] **Step 1: Write the failing shell test**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/analizarPDF.html", import.meta.url), "utf8");
assert.match(html, /id="analizarPdfSourceType"/);
assert.match(html, /id="analizarPdfNivelInput"/);
assert.match(html, /id="analizarPdfRevisionNumeroInput"/);
assert.match(html, /id="analizarPdfPaletteList"/);
assert.match(html, /id="analizarPdfAddPaletteColorBtn"/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-analizar-pdf-shell.mjs`
Expected: FAIL because the new UI controls are not present yet.

- [ ] **Step 3: Implement the new UI controls**

```html
<!-- public/analizarPDF.html -->
<label class="analizar-pdf-inline-field is-compact">
  <span>Tipo</span>
  <select id="analizarPdfSourceType">
    <option value="pdf">PDF</option>
    <option value="idml">IDML</option>
  </select>
</label>
```

```html
<article class="analizar-pdf-panel">
  <div class="analizar-pdf-panel-head">
    <div>
      <h3>Ficha editorial</h3>
      <p>Datos del libro o archivo para trazabilidad entre revisiones.</p>
    </div>
  </div>
  <div class="analizar-pdf-biblio-grid">
    <input id="analizarPdfNivelInput" type="text" placeholder="Nivel">
    <input id="analizarPdfGradoInput" type="text" placeholder="Grado">
    <input id="analizarPdfTrimestreInput" type="text" placeholder="Trimestre">
    <input id="analizarPdfEdicionNumeroInput" type="text" placeholder="Número de edición">
    <input id="analizarPdfRevisionNumeroInput" type="text" placeholder="Revisión (F1, F2...)">
  </div>
</article>
```

```html
<article class="analizar-pdf-panel">
  <div class="analizar-pdf-panel-head">
    <div>
      <h3>Paleta esperada</h3>
      <p>Swatch, CMYK y HEX para validación de color en IDML.</p>
    </div>
    <button id="analizarPdfAddPaletteColorBtn" type="button" class="analizar-pdf-ghost-pill">Nuevo color</button>
  </div>
  <div id="analizarPdfPaletteList" class="analizar-pdf-palette-list"></div>
</article>
```

```js
// public/analizarPDF/analizar-pdf-app.js
els.sourceType = document.getElementById("analizarPdfSourceType");
els.nivelInput = document.getElementById("analizarPdfNivelInput");
els.gradoInput = document.getElementById("analizarPdfGradoInput");
els.trimestreInput = document.getElementById("analizarPdfTrimestreInput");
els.edicionNumeroInput = document.getElementById("analizarPdfEdicionNumeroInput");
els.revisionNumeroInput = document.getElementById("analizarPdfRevisionNumeroInput");
els.paletteList = document.getElementById("analizarPdfPaletteList");
els.addPaletteColorBtn = document.getElementById("analizarPdfAddPaletteColorBtn");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-analizar-pdf-shell.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/analizarPDF.html public/analizarPDF/analizar-pdf.css public/analizarPDF/analizar-pdf-app.js scripts/test-analizar-pdf-shell.mjs
git commit -m "feat: add source type and editorial metadata ui"
```

### Task 3: Conectar la UI al nuevo estado y validar tipo de archivo

**Files:**
- Modify: `public/analizarPDF/analizar-pdf-app.js`
- Modify: `public/analizarPDF/analizar-pdf-api.js`
- Test: `scripts/test-analizar-pdf-session-store.mjs`

- [ ] **Step 1: Write the failing behavior test**

```js
import assert from "node:assert/strict";
import { normalizeAnalizarPdfSession } from "../public/analizarPDF/analizar-pdf-session-store.js";

const session = normalizeAnalizarPdfSession({ sourceType: "idml" });
assert.equal(session.sourceType, "idml");
assert.equal(session.colorConfig.palette.length, 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-analizar-pdf-session-store.mjs`
Expected: FAIL if the UI helpers still assume every upload is `PDF`.

- [ ] **Step 3: Implement sourceType-aware upload logic**

```js
// public/analizarPDF/analizar-pdf-api.js
export async function queueAnalizarPdfUpload(sessionId = "", file = null, sourceType = "pdf") {
  const expectedExt = sourceType === "idml" ? ".idml" : ".pdf";
  if (!(file instanceof File)) throw new Error(`Selecciona un archivo ${expectedExt}.`);
  if (!String(file.name || "").toLowerCase().endsWith(expectedExt)) {
    throw new Error(`El archivo debe ser ${expectedExt}.`);
  }
  const headers = await getAuthHeaders({
    "Content-Type": file.type || "application/octet-stream",
    "X-Session-Id": cleanSessionId,
    "X-File-Name": file.name || `documento${expectedExt}`
  });
}
```

```js
// public/analizarPDF/analizar-pdf-app.js
els.sourceType.addEventListener("change", () => {
  mutateActiveSession((session) => {
    session.sourceType = els.sourceType.value === "idml" ? "idml" : "pdf";
    return session;
  });
  els.fileInput.accept = els.sourceType.value === "idml" ? ".idml" : "application/pdf,.pdf";
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-analizar-pdf-session-store.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/analizarPDF/analizar-pdf-app.js public/analizarPDF/analizar-pdf-api.js scripts/test-analizar-pdf-session-store.mjs
git commit -m "feat: validate uploads by source type"
```

### Task 4: Extender el renderer de resultados para ortotipografía y color

**Files:**
- Modify: `public/analizarPDF/analizar-pdf-results.js`
- Test: `scripts/test-analizar-pdf-shell.mjs`

- [ ] **Step 1: Write the failing renderer test**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/analizarPDF/analizar-pdf-results.js", import.meta.url), "utf8");
assert.match(source, /Ortotipografía/);
assert.match(source, /Colores/);
assert.match(source, /orthotypographyIssues/);
assert.match(source, /colorIssues/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-analizar-pdf-shell.mjs`
Expected: FAIL because the new categories are not rendered yet.

- [ ] **Step 3: Implement the new result cards**

```js
<article class="analizar-pdf-result-card">
  <h3>Ortotipografía</h3>
  ${renderIssues(result.orthotypographyIssues, "Sin hallazgos ortotipográficos.")}
</article>
<article class="analizar-pdf-result-card">
  <h3>Colores</h3>
  ${renderIssues(result.colorIssues, "Sin hallazgos de color.")}
</article>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-analizar-pdf-shell.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/analizarPDF/analizar-pdf-results.js scripts/test-analizar-pdf-shell.mjs
git commit -m "feat: render orthotypography and color results"
```

### Task 5: Despachar análisis por `sourceType` en el backend

**Files:**
- Modify: `backend/analizar-pdf.js`
- Modify: `backend/server.js`
- Test: `scripts/test-analizar-pdf-backend-contract.mjs`

- [ ] **Step 1: Write the failing backend contract test**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../backend/analizar-pdf.js", import.meta.url), "utf8");
assert.match(source, /sourceType/);
assert.match(source, /analyze_idml\.py/);
assert.match(source, /analyze_pdf\.py/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-analizar-pdf-backend-contract.mjs`
Expected: FAIL because only the PDF script is dispatched today.

- [ ] **Step 3: Implement the dispatch**

```js
// backend/analizar-pdf.js
function resolveAnalyzerScript(session = {}) {
  const sourceType = String(session?.sourceType || "pdf").trim();
  if (sourceType === "idml") {
    return path.join(__dirname, "python", "analyze_idml.py");
  }
  return path.join(__dirname, "python", "analyze_pdf.py");
}
```

```js
// backend/server.js
const expectedExt = session.sourceType === "idml" ? ".idml" : ".pdf";
if (!String(fileName || "").toLowerCase().endsWith(expectedExt)) {
  return res.status(400).json({ error: `El archivo debe ser ${expectedExt}.` });
}
const scriptPath = resolveAnalyzerScript(session);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-analizar-pdf-backend-contract.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/analizar-pdf.js backend/server.js scripts/test-analizar-pdf-backend-contract.mjs
git commit -m "feat: dispatch document analysis by source type"
```

### Task 6: Crear el esqueleto del pipeline `IDML`

**Files:**
- Create: `backend/python/analyze_idml.py`
- Create: `backend/python/analizar_idml/__init__.py`
- Create: `backend/python/analizar_idml/package.py`
- Create: `backend/python/analizar_idml/document.py`
- Create: `backend/python/analizar_idml/pipeline.py`
- Test: `scripts/test-analizar-idml-backend-contract.mjs`

- [ ] **Step 1: Write the failing backend contract test**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const entry = readFileSync(new URL("../backend/python/analyze_idml.py", import.meta.url), "utf8");
assert.match(entry, /from analizar_idml\.pipeline import analyze_idml_document/);
assert.match(entry, /--input/);
assert.match(entry, /--session-json/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-analizar-idml-backend-contract.mjs`
Expected: FAIL because the files do not exist yet.

- [ ] **Step 3: Implement the minimal entrypoint and package loader**

```py
# backend/python/analyze_idml.py
import argparse
import json
from analizar_idml.pipeline import analyze_idml_document

parser = argparse.ArgumentParser()
parser.add_argument("--input", required=True)
parser.add_argument("--session-json", required=True)
args = parser.parse_args()

session = json.loads(args.session_json)
result = analyze_idml_document(args.input, session)
print(json.dumps(result, ensure_ascii=False))
```

```py
# backend/python/analizar_idml/package.py
import zipfile

def open_idml(path):
    archive = zipfile.ZipFile(path)
    if "designmap.xml" not in archive.namelist():
        raise ValueError("IDML_INVALID: missing designmap.xml")
    return archive
```

```py
# backend/python/analizar_idml/pipeline.py
from .package import open_idml

def analyze_idml_document(input_path, session):
    with open_idml(input_path) as archive:
        return {
            "paginationIssues": [],
            "sectionIssues": [],
            "spellingIssues": [],
            "orthotypographyIssues": [],
            "colorIssues": [],
            "stats": {
                "pageCount": 0,
                "sourceType": "idml",
                "geminiVerifierEnabled": False,
                "durationMs": 0
            }
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-analizar-idml-backend-contract.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/python/analyze_idml.py backend/python/analizar_idml scripts/test-analizar-idml-backend-contract.mjs
git commit -m "feat: scaffold idml analyzer pipeline"
```

### Task 7: Parsear `designmap`, `Graphic`, `Styles`, `Spreads` y `Stories`

**Files:**
- Create: `backend/python/analizar_idml/pages.py`
- Create: `backend/python/analizar_idml/stories.py`
- Create: `backend/python/analizar_idml/styles.py`
- Create: `backend/python/analizar_idml/swatches.py`
- Modify: `backend/python/analizar_idml/pipeline.py`
- Test: `scripts/test-analizar-idml-sample.mjs`

- [ ] **Step 1: Write the failing sample smoke test**

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const sample = "public/analizarPDF/EEFESPPRI_10REV_TRIM1_P5_LA_ABP_FORMACION copy.idml";
const session = JSON.stringify({ id: "sample", sourceType: "idml", indexConfig: { sections: [] }, colorConfig: { palette: [] } });
const run = spawnSync("python3", ["backend/python/analyze_idml.py", "--input", sample, "--session-json", session], { encoding: "utf8" });
assert.equal(run.status, 0, run.stderr);
const result = JSON.parse(run.stdout);
assert.equal(result.stats.sourceType, "idml");
assert.ok(result.stats.pageCount > 0);
assert.ok(Array.isArray(result.stats.usedSwatches));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-analizar-idml-sample.mjs`
Expected: FAIL because the skeleton pipeline does not parse pages or swatches yet.

- [ ] **Step 3: Implement structural parsing**

```py
# backend/python/analizar_idml/swatches.py
def parse_swatches(archive):
    root = parse_xml(archive, "Resources/Graphic.xml")
    return [
        {
            "self": node.get("Self", ""),
            "name": node.get("Name", ""),
            "space": node.get("Space", ""),
            "colorValue": node.get("ColorValue", "")
        }
        for node in root.findall(".//Color")
    ]
```

```py
# backend/python/analizar_idml/pages.py
def parse_pages(archive):
    pages = []
    for name in archive.namelist():
        if not name.startswith("Spreads/Spread_") or not name.endswith(".xml"):
            continue
        root = parse_xml(archive, name)
        for page in root.findall(".//Page"):
            pages.append({
                "pageId": page.get("Self", ""),
                "pageName": page.get("Name", ""),
                "spreadSource": name
            })
    return pages
```

```py
# backend/python/analizar_idml/pipeline.py
swatches = parse_swatches(archive)
pages = parse_pages(archive)
return {
    ...
    "stats": {
        "pageCount": len(pages),
        "sourceType": "idml",
        "usedSwatches": [entry["name"] for entry in swatches[:20]],
        ...
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-analizar-idml-sample.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/python/analizar_idml scripts/test-analizar-idml-sample.mjs
git commit -m "feat: parse idml pages stories and swatches"
```

### Task 8: Implementar análisis de paginación, secciones y color para `IDML`

**Files:**
- Create: `backend/python/analizar_idml/pagination.py`
- Create: `backend/python/analizar_idml/sections.py`
- Create: `backend/python/analizar_idml/colors.py`
- Modify: `backend/python/analizar_idml/pipeline.py`
- Test: `scripts/test-analizar-idml-sample.mjs`

- [ ] **Step 1: Write the failing assertions**

```js
assert.ok("paginationIssues" in result);
assert.ok("sectionIssues" in result);
assert.ok("colorIssues" in result);
assert.ok(Array.isArray(result.colorIssues));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-analizar-idml-sample.mjs`
Expected: FAIL because only empty skeleton categories exist without real computation.

- [ ] **Step 3: Implement deterministic validators**

```py
# backend/python/analizar_idml/pagination.py
def find_pagination_issues(pages):
    issues = []
    expected = None
    for page in pages:
        label = safe_int(page.get("pageName"))
        if label is None:
            continue
        if expected is None:
            expected = label
        elif label != expected:
            issues.append(f"Página {page['pageId']} esperaba {expected} y encontró {label}")
            expected = label
        expected += 1
    return issues
```

```py
# backend/python/analizar_idml/colors.py
def find_color_issues(used_swatches, palette):
    expected_names = {entry["swatchName"] for entry in palette if entry.get("swatchName")}
    issues = []
    for swatch in used_swatches:
      if expected_names and swatch["name"] not in expected_names:
          issues.append(f"Swatch no esperado: {swatch['name']}")
    return issues
```

```py
# backend/python/analizar_idml/pipeline.py
pagination_issues = find_pagination_issues(pages)
section_issues = find_section_issues(pages, stories, session)
color_issues = find_color_issues(swatches, session.get("colorConfig", {}).get("palette", []))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-analizar-idml-sample.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/python/analizar_idml scripts/test-analizar-idml-sample.mjs
git commit -m "feat: add idml pagination section and color analysis"
```

### Task 9: Integrar Gemini para ortografía y ortotipografía en `IDML`

**Files:**
- Create: `backend/python/analizar_idml/spelling.py`
- Create: `backend/python/analizar_idml/orthotypography.py`
- Create: `backend/python/analizar_idml/gemini_verifier.py`
- Modify: `backend/python/analizar_idml/pipeline.py`
- Test: `scripts/test-analizar-idml-backend-contract.mjs`

- [ ] **Step 1: Write the failing contract assertions**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pipeline = readFileSync(new URL("../backend/python/analizar_idml/pipeline.py", import.meta.url), "utf8");
assert.match(pipeline, /orthotypographyIssues/);
assert.match(pipeline, /GeminiVerifier/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-analizar-idml-backend-contract.mjs`
Expected: FAIL because Gemini is not wired into the IDML pipeline yet.

- [ ] **Step 3: Implement semantic verification**

```py
# backend/python/analizar_idml/gemini_verifier.py
class GeminiVerifier:
    def __init__(self):
        self.enabled = bool(load_api_key())

    def verify_text_block(self, block, category):
        return []
```

```py
# backend/python/analizar_idml/pipeline.py
gemini_verifier = GeminiVerifier()
spelling_issues = find_spelling_issues(text_blocks, gemini_verifier=gemini_verifier)
orthotypography_issues = find_orthotypography_issues(text_blocks, gemini_verifier=gemini_verifier)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-analizar-idml-backend-contract.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/python/analizar_idml scripts/test-analizar-idml-backend-contract.mjs
git commit -m "feat: add gemini-backed idml semantics"
```

### Task 10: Extender el pipeline `PDF` al contrato nuevo y correr verificación completa

**Files:**
- Modify: `backend/python/analizar_pdf/pipeline.py`
- Modify: `backend/python/analyze_pdf.py`
- Modify: `scripts/test-analizar-pdf-backend-contract.mjs`
- Modify: `scripts/test-analizar-idml-backend-contract.mjs`
- Test: `scripts/test-analizar-pdf-backend-contract.mjs`
- Test: `scripts/test-analizar-idml-backend-contract.mjs`
- Test: `scripts/test-analizar-idml-sample.mjs`
- Test: `node --check backend/server.js`

- [ ] **Step 1: Write the failing cross-contract assertions**

```js
assert.match(readFileSync(new URL("../backend/python/analizar_pdf/pipeline.py", import.meta.url), "utf8"), /orthotypographyIssues/);
assert.match(readFileSync(new URL("../backend/python/analizar_pdf/pipeline.py", import.meta.url), "utf8"), /colorIssues/);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node scripts/test-analizar-pdf-backend-contract.mjs`
Expected: FAIL because the PDF pipeline does not yet emit the fully extended contract.

- [ ] **Step 3: Implement minimal contract alignment**

```py
# backend/python/analizar_pdf/pipeline.py
return {
    "paginationIssues": pagination_issues,
    "sectionIssues": section_issues,
    "spellingIssues": spelling_issues,
    "orthotypographyIssues": [],
    "colorIssues": [],
    "stats": {
        "pageCount": len(pages),
        "spellProvider": "pyenchant",
        "geminiVerifierEnabled": bool(gemini_verifier.enabled),
        "sourceType": "pdf",
        "durationMs": round((time.time() - started) * 1000),
    },
}
```

- [ ] **Step 4: Run full verification**

Run: `node scripts/test-analizar-pdf-backend-contract.mjs`
Expected: PASS

Run: `node scripts/test-analizar-idml-backend-contract.mjs`
Expected: PASS

Run: `node scripts/test-analizar-idml-sample.mjs`
Expected: PASS

Run: `PYTHONPYCACHEPREFIX=/Users/waldolopez/Documents/CharlyBrown/.pycache python3 -m py_compile backend/python/analyze_pdf.py backend/python/analyze_idml.py backend/python/analizar_pdf/*.py backend/python/analizar_idml/*.py`
Expected: no output

Run: `node --check backend/server.js`
Expected: no output

- [ ] **Step 5: Commit**

```bash
git add backend/python/analyze_pdf.py backend/python/analizar_pdf/pipeline.py scripts/test-analizar-pdf-backend-contract.mjs scripts/test-analizar-idml-backend-contract.mjs scripts/test-analizar-idml-sample.mjs
git commit -m "feat: unify pdf and idml analysis contracts"
```
