import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { keyGreenScreenPixels } from "../public/podcaster/podcaster-image-chroma-key.mjs";

test("green screen removal creates real alpha and preserves foreground pixels", () => {
  const imageData = { data: new Uint8ClampedArray([
    0, 255, 0, 255,
    220, 35, 25, 255,
    20, 40, 220, 255
  ]) };
  const result = keyGreenScreenPixels(imageData);
  assert.ok(result.transparentPixels >= 1);
  assert.equal(imageData.data[3], 0);
  assert.equal(imageData.data[7], 255);
  assert.equal(imageData.data[11], 255);
});

test("scene image generation is exposed by the timeline action and uses the current image model", async () => {
  const [timeline, client, backend, html] = await Promise.all([
    readFile(new URL("../public/podcaster/podcaster-timeline-ui.js", import.meta.url), "utf8"),
    readFile(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8"),
    readFile(new URL("../backend/server.js", import.meta.url), "utf8"),
    readFile(new URL("../public/podcaster.html", import.meta.url), "utf8")
  ]);
  assert.match(timeline, /data-action="timeline-open-image-generation"/);
  assert.match(client, /const PODCASTER_IMAGE_MODEL_DEFAULT = "gemini-3\.1-flash-image"/);
  assert.match(backend, /const DEFAULT_PODCASTER_IMAGE_MODEL = "gemini-3\.1-flash-image"/);
  assert.match(backend, /taskProfile === "podcaster_scene_image_generation"\s*\? 9 \* 1024 \* 1024/);
  assert.match(html, /podcaster-scene-image-generation\.js/);
  assert.match(html, /podcaster-scene-image-generation\.css/);
});

test("generation request limits decompositions and stop motion to twelve images", async () => {
  const source = await readFile(new URL("../public/podcaster/podcaster-scene-image-generation.js", import.meta.url), "utf8");
  assert.match(source, /Math\.min\(12, Number\(root\.querySelector\("\[data-image-generation-count\]"\)\.value\)/);
  assert.match(source, /responseModalities: \["TEXT", "IMAGE"\]/);
  assert.match(source, /removeGreenScreenBackground\(rawDataUrl, \{ threshold \}\)/);
  assert.match(source, /Ajustar recorte y transparencia/);
  assert.match(source, /timingMode: "fit-scene", frames/);
});

test("generation presets change the plan and keep decomposition zones aligned to the original canvas", async () => {
  const source = await readFile(new URL("../public/podcaster/podcaster-scene-image-generation.js", import.meta.url), "utf8");
  for (const preset of ["elements", "layers", "depth", "zones", "foreground", "characters", "props", "nature", "architecture", "details", "story", "foreground-first", "right-left", "top-bottom", "bottom-top", "outside-in", "small-large", "large-small", "characters-first", "environment-first"]) {
    assert.match(source, new RegExp(`value: "${preset}"`));
  }
  assert.match(source, /presetConfig\.analysis/);
  assert.match(source, /presetConfig\.isolate/);
  assert.match(source, /presetConfig\.planning/);
  assert.match(source, /presetConfig\.step/);
  assert.match(source, /Ordena los elementos por la coordenada horizontal de su centro visual, estrictamente de izquierda a derecha/);
  assert.match(source, /encuadre completo en regiones con contenido/);
  assert.match(source, /mismo lienzo horizontal 16:9, encuadre, escala y posición de la referencia/);
  assert.match(source, /createAlignedTransparentLayer\(raw, reference, item\.cutoutThreshold\)/);
  assert.doesNotMatch(source, /const panelPrompt = `Crea un cuadro de detalle/);
});

test("the original scene reference is shown above the generated image grid", async () => {
  const source = await readFile(new URL("../public/podcaster/podcaster-scene-image-generation.js", import.meta.url), "utf8");
  const workspace = source.slice(source.indexOf("class=\"snoopy-image-generation-workspace\""), source.indexOf("</section></div>", source.indexOf("class=\"snoopy-image-generation-workspace\"")));
  assert.ok(workspace.indexOf("data-image-generation-reference-grid") < workspace.indexOf("data-image-generation-results"));
  assert.match(workspace, /data-image-generation-reference-image/);
  assert.match(source, /root\._referenceDataPromise = referenceDataUrl\(reference\)/);
  assert.match(source, /image\.src = dataUrl;\s*card\.hidden = false/);
});
