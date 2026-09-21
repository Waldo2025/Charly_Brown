import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function toDataModule(relativePath) {
  const absolutePath = resolve(new URL("..", import.meta.url).pathname, relativePath);
  const source = readFileSync(absolutePath, "utf8");
  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
}

test("payload builder usa imageSize para Gemini 3.1 y no para Gemini 2.5", async () => {
  const { buildGeminiImagePayload } = await toDataModule("public/imagecreator/payloads.js");

  const gemini25 = buildGeminiImagePayload({
    mode: "generate",
    prompt: "Bosque místico",
    options: {
      model: "gemini-2.5-flash-image",
      aspectRatio: "16:9",
      imageSize: "2K"
    },
    attachments: []
  });
  assert.deepEqual(gemini25.generationConfig.responseModalities, ["TEXT", "IMAGE"]);
  assert.equal(gemini25.generationConfig.imageConfig.aspectRatio, "16:9");
  assert.equal("imageSize" in gemini25.generationConfig.imageConfig, false, "Gemini 2.5 no debe enviar imageSize.");

  const gemini31 = buildGeminiImagePayload({
    mode: "generate",
    prompt: "Bosque místico",
    options: {
      model: "gemini-3.1-flash-image",
      aspectRatio: "16:9",
      imageSize: "2K"
    },
    attachments: []
  });
  assert.equal(gemini31.generationConfig.imageConfig.imageSize, "2K");
  assert.equal("responseFormat" in gemini31.generationConfig, false, "generateContent no debe enviar responseFormat en este payload.");
});

test("payload builder permite 4K para Gemini 3.1 y Pro", async () => {
  const { buildGeminiImagePayload } = await toDataModule("public/imagecreator/payloads.js");

  const payload = buildGeminiImagePayload({
    mode: "generate",
    prompt: "Poster editorial para impresión",
    options: {
      model: "gemini-3-pro-image",
      aspectRatio: "3:4",
      imageSize: "4K"
    },
    attachments: []
  });

  assert.equal(payload.generationConfig.imageConfig.imageSize, "4K");
  assert.equal("responseFormat" in payload.generationConfig, false);
});

test("payload builder inserta inlineData para edición y composición", async () => {
  const { buildGeminiImagePayload } = await toDataModule("public/imagecreator/payloads.js");

  const payload = buildGeminiImagePayload({
    mode: "compose",
    prompt: "Combina ambas referencias en una portada editorial",
    options: {
      model: "gemini-3-pro-image",
      aspectRatio: "1:1",
      imageSize: "1K"
    },
    attachments: [
      { mimeType: "image/png", base64: "AAA", name: "uno.png" },
      { mimeType: "image/jpeg", base64: "BBB", name: "dos.jpg" }
    ]
  });

  const parts = payload.contents[0].parts;
  const inlineCount = parts.filter((part) => part?.inlineData?.data).length;
  assert.equal(inlineCount, 2, "Compose debe enviar todas las referencias como inlineData.");
});

test("payload builder prefiere inlineBase64 cuando la UI conserva una versión de mayor calidad", async () => {
  const { buildGeminiImagePayload } = await toDataModule("public/imagecreator/payloads.js");

  const payload = buildGeminiImagePayload({
    mode: "edit",
    prompt: "Corrige color y mantén detalle fino",
    options: {
      model: "gemini-3.1-flash-image",
      aspectRatio: "1:1",
      imageSize: "2K"
    },
    attachments: [
      {
        mimeType: "image/png",
        base64: "FULL_QUALITY_BASE64",
        inlineBase64: "COMPACT_INLINE_BASE64",
        name: "referencia.png"
      }
    ]
  });

  const inlinePart = payload.contents[0].parts.find((part) => part?.inlineData?.data);
  assert.equal(
    inlinePart?.inlineData?.data,
    "COMPACT_INLINE_BASE64",
    "El payload debe usar inlineBase64 para Gemini cuando exista una versión compacta separada."
  );
});

test("payload builder puede estimar bytes serializados del request Gemini", async () => {
  const { buildGeminiImagePayload, estimateGeminiPayloadBytes } = await toDataModule("public/imagecreator/payloads.js");

  const payload = buildGeminiImagePayload({
    mode: "generate",
    prompt: "Paisaje editorial limpio",
    options: {
      model: "gemini-3.1-flash-image",
      aspectRatio: "1:1",
      imageSize: "1K"
    },
    attachments: []
  });

  const bytes = estimateGeminiPayloadBytes(payload);
  assert.equal(typeof bytes, "number");
  assert.ok(bytes > 0);
});

test("editar conserva el formato de referencias horizontales, verticales e irregulares", async () => {
  const { buildGeminiImagePayload } = await toDataModule("public/imagecreator/payloads.js");
  for (const [width, height] of [[1600, 900], [900, 1600], [1379, 811]]) {
    const payload = buildGeminiImagePayload({
      mode: "edit", prompt: "Añade un texto", options: { aspectRatio: "1:1", model: "gemini-3-pro-image", imageSize: "2K" },
      attachments: [{ width, height, mimeType: "image/png", base64: "REFERENCE" }, { mimeType: "image/png", base64: "REGION_MAP" }]
    });
    assert.equal("aspectRatio" in payload.generationConfig.imageConfig, false);
    assert.equal(payload.generationConfig.imageConfig.imageSize, "2K");
    assert.match(payload.contents[0].parts[0].text, /Conserva la proporción, el encuadre y la geometría de la primera referencia/);
  }
});

test("generación, composición y variación respetan la proporción seleccionada", async () => {
  const { buildGeminiImagePayload } = await toDataModule("public/imagecreator/payloads.js");
  for (const mode of ["generate", "compose", "variation"]) {
    const payload = buildGeminiImagePayload({ mode, prompt: "Una imagen", options: { aspectRatio: "9:16" },
      attachments: mode === "generate" ? [] : [{ base64: "ONE" }, { base64: "TWO" }] });
    assert.equal(payload.generationConfig.imageConfig.aspectRatio, "9:16");
  }
});


test("adjuntar referencias en Texto a imagen genera una imagen nueva respetando la proporción", async () => {
  const { buildGeminiImagePayload, resolveImageCreatorMode } = await toDataModule("public/imagecreator/payloads.js");
  const attachments = [{ mimeType: "image/png", base64: "SOURCE", width: 1600, height: 900 }];
  assert.equal(resolveImageCreatorMode("generate", attachments), "generate");
  assert.equal(resolveImageCreatorMode("generate", []), "generate");
  for (const mode of ["edit", "compose", "variation"]) assert.equal(resolveImageCreatorMode(mode, attachments), mode);
  const payload = buildGeminiImagePayload({ mode: "generate", prompt: "Un nuevo concepto inspirado en la referencia", options: { aspectRatio: "1:1" }, attachments });
  assert.equal(payload.generationConfig.imageConfig.aspectRatio, "1:1");
  assert.match(payload.contents[0].parts[0].text, /Genera una imagen original/);
  assert.equal(payload.contents[0].parts.some((part) => part?.inlineData?.data === "SOURCE"), true);
});
