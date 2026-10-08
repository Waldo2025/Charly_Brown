const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const editor = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/js/editor-app.js"), "utf8");
const geminiService = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/js/services/marcie-gemini-service.js"), "utf8");
const modal = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/js/components/modals.js"), "utf8");

test("las propuestas soportan coordinadores sin forzar cuatro audiencias", () => {
  assert.match(geminiService, /coordinators:\s*\{/);
  assert.match(geminiService, /label: "Coordinadores académicos y directivos escolares"/);
  assert.match(geminiService, /EXACTAMENTE \$\{proposalCount\}/);
  assert.doesNotMatch(geminiService, /EXACTAMENTE cuatro propuestas/i);
  assert.match(modal, /ALL_AUDIENCE_KEYS = \["students", "parents", "educators", "coordinators"\]/);
});

test("el modal ofrece extensiones por cuartillas", () => {
  for (const count of ["1", "2", "3", "4", "5", "6"]) {
    assert.match(modal, new RegExp(`>${count} cuartilla(?:s)? \\(${Number(count) * 1012} pal\\.\\)<`));
  }
  for (let count = 1; count <= 6; count++) {
    assert.ok(modal.includes(`${count * 1012} palabras de cuerpo del artículo, sin contar bibliografía`));
  }
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

test("la portada se limpia, adapta para web y sube a Storage sin persistir base64", () => {
  assert.match(geminiService, /import \{ getDownloadURL, ref, uploadBytes \} from "https:\/\/www\.gstatic\.com\/firebasejs\/12\.7\.0\/firebase-storage\.js"/);
  assert.match(geminiService, /const sourceBlob = new Blob/);
  assert.match(geminiService, /context\.drawImage\(bitmap, 0, 0, width, height\)/);
  assert.match(geminiService, /optimizedBlob\.size <= 512 \* 1024/);
  assert.match(geminiService, /await uploadBytes\(storageRef, image\.blob/);
  assert.match(geminiService, /customMetadata: \{\s*creator: "Asc",\s*copyright: "© Asc"/);
  const uploadFlow = geminiService.slice(geminiService.indexOf("async function optimizeImageForWeb"), geminiService.indexOf("/**\n * Limpia títulos"));
  assert.doesNotMatch(uploadFlow, /dataBase64:\s*image\.dataBase64|blobToBase64|support-graphics\/upload/);
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
