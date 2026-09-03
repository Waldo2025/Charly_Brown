const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const editor = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/js/editor-app.js"), "utf8");
const geminiService = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/js/services/marcie-gemini-service.js"), "utf8");
const modal = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/js/components/modals.js"), "utf8");

test("las propuestas incluyen coordinadores como cuarta audiencia", () => {
  assert.match(geminiService, /genera EXACTAMENTE cuatro propuestas editoriales diferenciadas/);
  assert.match(geminiService, /"coordinators" \(Coordinadores académicos y directivos escolares\)/);
  assert.match(geminiService, /"id": "prop-coordinators"/);
  assert.match(modal, /value="coordinators" checked/);
});

test("el modal ofrece extensiones por cuartillas", () => {
  for (const count of ["1", "2", "3", "4", "5", "6"]) {
    assert.match(modal, new RegExp(`>${count} cuartilla(?:s)?<`));
  }
  assert.match(modal, /Una cuartilla, entre 250 y 300 palabras/);
  assert.match(modal, /Seis cuartillas, entre 1500 y 1800 palabras/);
});

test("cada acción visual genera solamente la portada de su propuesta", () => {
  const coverRenderer = editor.slice(
    editor.indexOf("function renderArticleFeaturedImage"),
    editor.indexOf("function updatePipelineStepIcons")
  );
  assert.match(coverRenderer, /article\.featuredImage = await generateArticleImageWithGemini/);
  assert.doesNotMatch(coverRenderer, /coverEntries|for \(let index = 0; index < .*\.length/);
  assert.match(editor, /data-generate-proposal-image/);
});

test("la automatización genera portadas secuenciales con protección de cuota", () => {
  const workflow = editor.slice(
    editor.indexOf("async function runAutomatedSessionWorkflow"),
    editor.indexOf("function setupEventListeners")
  );
  assert.match(workflow, /for \(let index = 0; index < audiences\.length; index \+= 1\)/);
  assert.match(workflow, /generateAutomatedCoverWithRetry/);
  assert.match(editor, /AUTOMATED_COVER_GAP_MS = 20_000/);
  assert.match(editor, /AUTOMATED_COVER_RETRY_DELAY_MS = 30_000/);
  assert.doesNotMatch(workflow, /Promise\.all/);
});
