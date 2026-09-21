import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(new URL("..", import.meta.url).pathname);

function readWorkspaceFile(relativePath) {
  return readFileSync(resolve(rootDir, relativePath), "utf8");
}

function toDataModule(relativePath) {
  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(readWorkspaceFile(relativePath))}`);
}

test("prompt de edición localizada distingue original, mapa y zona preservada", async () => {
  const { buildLocalizedEditPrompt } = await toDataModule("public/imagecreator/region-editor.js");
  const prompt = buildLocalizedEditPrompt("agrega una ventana circular", "pencil");

  assert.match(prompt, /Referencia 1 es la imagen original limpia/i);
  assert.match(prompt, /Referencia 2 es únicamente un mapa visual/i);
  assert.match(prompt, /agrega una ventana circular/i);
  assert.match(prompt, /Modifica exclusivamente la región señalada/i);
  assert.match(prompt, /No incluyas el trazo/i);
});

test("edición de texto ofrece modo integrado y limpieza para composición exacta", async () => {
  const { buildLocalizedTextEditPrompt, buildTextRemovalPrompt } = await toDataModule("public/imagecreator/region-editor.js");
  const integrated = buildLocalizedTextEditPrompt({
    currentText: "OFERTA",
    newText: "NUEVA COLECCIÓN",
    fontStyle: "display",
    tool: "marker"
  });
  assert.match(integrated, /Texto actual: "OFERTA"/);
  assert.match(integrated, /Texto nuevo exacto: "NUEVA COLECCIÓN"/);
  assert.match(integrated, /verifica letra por letra/i);
  const cleanup = buildTextRemovalPrompt({ currentText: "OFERTA" });
  assert.match(cleanup, /Elimina únicamente el texto "OFERTA"/);
  assert.match(cleanup, /No escribas texto nuevo/);
});

test("el renderer extrae la instrucción de sesiones localizadas anteriores", async () => {
  const domSource = readWorkspaceFile("public/imagecreator/dom.js")
    .replace(/export\s+/g, "");
  const rendererSource = readWorkspaceFile("public/imagecreator/chat-renderer.js")
    .replace(/import[^;]+;\s*/g, "")
    .replace(/export\s+/g, "");
  const moduleSource = `${domSource}\n${rendererSource}\nexport { getVisibleUserPrompt };`;
  const { getVisibleUserPrompt } = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(moduleSource)}`);
  const prompt = "Realiza una edición localizada. La Referencia 1 es la imagen original limpia. Cambio solicitado: agrega una ventana circular Modifica exclusivamente la región señalada. No incluyas el trazo.";
  assert.equal(getVisibleUserPrompt({ prompt }), "agrega una ventana circular");
  assert.equal(getVisibleUserPrompt({ prompt: "Crea una montaña" }), "Crea una montaña");
});

test("Image Creator conecta el editor regional con la imagen seleccionada", () => {
  const html = readWorkspaceFile("public/imageCreator.html");
  const app = readWorkspaceFile("public/imagecreator/app.js");
  const attachments = readWorkspaceFile("public/imagecreator/attachments.js");
  const renderer = readWorkspaceFile("public/imagecreator/chat-renderer.js");

  assert.doesNotMatch(html, /id="icQuickAnnotateBtn"/);
  assert.match(html, /id="icRegionCanvas"/);
  assert.match(html, /id="icRegionPromptPanel" class="ic-region-prompt-panel hidden"/);
  assert.match(html, /data-region-tool="pencil"/);
  assert.match(html, /data-region-tool="marker"/);
  assert.match(html, /value="integrated" checked/);
  assert.match(html, /value="exact"/);
  assert.match(html, /id="icRegionNewText"/);
  assert.match(renderer, /class="ic-result-quick-action"[\s\S]*data-result-action="annotate"/);
  const resultMenuMarkup = renderer.match(/<div id="\$\{escapeHtml\(menuId\)\}"[\s\S]*?<\/div>/)?.[0] || "";
  assert.doesNotMatch(resultMenuMarkup, /data-result-action="annotate"/);
  assert.match(renderer, /data-result-action="regenerate"/);
  assert.match(renderer, /data-result-action="edit-text"/);
  assert.match(renderer, /data-result-action="info"/);
  assert.match(app, /buildLocalizedEditPrompt\(instruction, tool\)/);
  assert.match(app, /model: "gemini-3-pro-image"/);
  assert.match(app, /overlayExactTextOnImage/);
  assert.match(app, /submitPrompt\(\{ requestPrompt, displayPrompt: instruction \}\)/);
  assert.match(app, /hiddenInChat: true/);
  assert.match(renderer, /attachment\?\.hiddenInChat !== true/);
  assert.match(attachments, /export async function dataUrlToAttachment/);
  assert.match(app, /LOCALIZED_REFERENCE_MAX_DIMENSION = 3072/);
  assert.match(app, /LOCALIZED_REFERENCE_TARGET_BYTES = 3 \* 1024 \* 1024/);
  assert.match(app, /document\.body\.append\(elements\.regionEditor\)/);
});

test("la edición localizada conserva una referencia de alta resolución y un mapa ligero", () => {
  const app = readWorkspaceFile("public/imagecreator/app.js");
  const attachments = readWorkspaceFile("public/imagecreator/attachments.js");
  const constants = readWorkspaceFile("public/imagecreator/constants.js");
  const backend = readWorkspaceFile("functions/src/index.js");
  assert.match(app, /resultImageToAttachment\(\{[\s\S]*?imagen-original-sin-marcas[\s\S]*?maxDimension: LOCALIZED_REFERENCE_MAX_DIMENSION/);
  assert.match(attachments, /mimeType: compact\.mimeType/);
  assert.match(constants, /MAX_GEMINI_PAYLOAD_BYTES = 7 \* 1024 \* 1024/);
  assert.match(backend, /GEMINI_PROXY_JSON_LIMIT = "10mb"/);
  assert.match(backend, /GEMINI_PROXY_PAYLOAD_LIMIT_BYTES = 8 \* 1024 \* 1024/);
});

test("el historial conserva sólo la instrucción visible y separa el prompt técnico", () => {
  const app = readWorkspaceFile("public/imagecreator/app.js");
  assert.match(app, /const visiblePrompt = String\(displayPrompt \|\| typedPrompt \|\| requestPrompt\)/);
  assert.match(app, /buildUserMessage\(\{ prompt: visiblePrompt, requestPrompt: prompt/);
  assert.match(app, /generateImagesViaGemini\(\{[\s\S]*?prompt,[\s\S]*?attachments/);
  assert.match(app, /sourceMessage\.requestPrompt \|\| sourceMessage\.prompt/);
});
