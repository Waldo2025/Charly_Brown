import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AVAILABLE_PODCASTER_VIDEO_MODELS,
  VERTEX_VEO_MODEL_FALLBACKS,
  collectAvailablePodcasterVideoModels
} from "../public/podcaster/podcaster-video-model-catalog.js";

const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const timelineModel = readFileSync(new URL("../public/podcaster/podcaster-timeline-model.js", import.meta.url), "utf8");
const podcasterJs = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const videoGenerator = readFileSync(new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url), "utf8");

assert.deepEqual(AVAILABLE_PODCASTER_VIDEO_MODELS, [
  "auto",
  "gemini-omni-flash-preview",
  ...VERTEX_VEO_MODEL_FALLBACKS
]);

const selectMarkup = html.match(/<select id="globalCheapVideoMode">([\s\S]*?)<\/select>/)?.[1] || "";
const optionValues = Array.from(selectMarkup.matchAll(/<option value="([^"]+)"/g), (item) => item[1]);
assert.deepEqual(optionValues, AVAILABLE_PODCASTER_VIDEO_MODELS, "El HTML debe ofrecer el fallback completo aun sin red.");

assert.match(podcasterJs, /authFetchJson\("\/api\/gemini\/models"\)/, "El selector debe consultar el catálogo vigente de la API.");
assert.match(podcasterJs, /collectAvailablePodcasterVideoModels\(models\)/, "Los modelos de la API deben combinarse con el fallback.");
assert.match(podcasterJs, /isVertexVeoModelId\(normalized\)/, "El shell debe aceptar IDs Veo futuros con formato oficial.");
assert.match(timelineModel, /isVertexVeoModelId\(requestedModel\)/, "El timeline debe persistir modelos Veo descubiertos dinámicamente.");
assert.match(videoGenerator, /isVertexVeoModelId\(requested\)/, "El generador debe enviar el modelo dinámico seleccionado.");

const futureCatalog = collectAvailablePodcasterVideoModels([
  { name: "publishers/google/models/veo-4.0-generate-001" }
]);
assert.ok(futureCatalog.includes("veo-4.0-generate-001"));
assert.ok(VERTEX_VEO_MODEL_FALLBACKS.every((model) => futureCatalog.includes(model)));

console.log("Podcaster dynamic Vertex Veo model selector OK.");
