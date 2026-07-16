import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const provider = require("../backend/podcaster-video-provider.js");
const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const timelineModel = readFileSync(new URL("../public/podcaster/podcaster-timeline-model.js", import.meta.url), "utf8");
const podcasterJs = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const videoGenerator = readFileSync(new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url), "utf8");

const supportedModels = [
  "gemini-omni-flash-preview",
  "veo-3.1-generate-preview",
  "veo-3.1-fast-generate-preview",
  "veo-3.1-lite-generate-preview"
];

assert.deepEqual(provider.VIDEO_MODELS, supportedModels, "El catálogo backend debe contener sólo Omni y Veo 3.1.");

function readFrozenStringArray(source, constantName) {
  const match = source.match(new RegExp(`const ${constantName} = Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\);`));
  assert.ok(match, `No se encontró ${constantName}.`);
  return Array.from(match[1].matchAll(/"([^"]+)"/g), (item) => item[1]);
}

assert.deepEqual(
  readFrozenStringArray(timelineModel, "AVAILABLE_PODCASTER_VIDEO_MODELS"),
  ["auto", ...supportedModels],
  "El timeline debe persistir Automático, Omni y los tres modelos Veo 3.1."
);

assert.deepEqual(
  readFrozenStringArray(podcasterJs, "AVAILABLE_PODCASTER_VIDEO_MODELS"),
  ["auto", ...supportedModels],
  "El shell principal debe usar el mismo catálogo que el timeline."
);

const selectMarkup = html.match(/<select id="globalCheapVideoMode">([\s\S]*?)<\/select>/)?.[1] || "";
const optionValues = Array.from(selectMarkup.matchAll(/<option value="([^"]+)"/g), (item) => item[1]);
assert.deepEqual(optionValues, ["auto", ...supportedModels], "El selector debe listar Automático, Omni y Veo 3.1 sin modelos retirados.");
assert.match(selectMarkup, /Veo 3\.1 Lite — borrador/, "Lite debe etiquetarse explícitamente como borrador.");

assert.match(
  timelineModel,
  /if \(requestedModel === "veo-3\.1-lite-generate-preview" && !hasModernRouting\) return "auto";/,
  "Una configuración Lite heredada debe migrar a Automático y no conservarse como fallback silencioso."
);
assert.match(timelineModel, /if \(!requestedModel\) return "auto";/, "Una sesión sin selección debe migrar a Automático.");
assert.match(
  timelineModel,
  /if \(requestedModel === "veo-2\.0-generate-001"\) return "veo-3\.1-generate-preview";/,
  "El timeline debe migrar Veo 2.0 a Veo 3.1 Standard, sin cambiarlo a Automático."
);
assert.match(timelineModel, /videoRoutingVersion:\s*PODCASTER_VIDEO_ROUTING_VERSION/, "La selección moderna debe quedar versionada.");

assert.match(
  podcasterJs,
  /els\.globalCheapVideoMode\.value = buildPodcasterVideoModelChain\(String\(videoCfg\.videoModel \|\| ""\)\.trim\(\)\)\[0\] \|\| "auto"/,
  "La UI debe mostrar Automático cuando el proyecto no tenga una selección explícita."
);
assert.match(
  podcasterJs,
  /const selectedVideoModel = [^;]+ \|\| "auto";/,
  "Aplicar la configuración global debe usar Automático como fallback."
);
assert.match(
  podcasterJs,
  /videoModel:\s*selectedVideoModel,[\s\S]*videoGenerator,[\s\S]*videoRoutingVersion:\s*2/,
  "La configuración global debe persistir modelo, generador y versión del routing."
);
assert.match(
  podcasterJs,
  /"veo-2\.0-generate-001":\s*"veo-3\.1-generate-preview"/,
  "El shell debe mostrar Veo 3.1 Standard al cargar una preferencia Veo 2.0 heredada."
);

assert.match(
  videoGenerator,
  /model === PODCASTER_VIDEO_MODEL_VEO_LITE \? "draft" : "final"/,
  "Lite sólo debe convertir la calidad a draft cuando fue seleccionado explícitamente."
);
assert.match(
  videoGenerator,
  /"veo-2\.0-generate-001":\s*PODCASTER_VIDEO_MODEL_VEO_STANDARD/,
  "El routing de generación debe conservar Veo como proveedor al migrar Veo 2.0."
);
assert.equal(
  provider.normalizeVideoModel("veo-2.0-generate-001", "auto", "final"),
  "veo-3.1-generate-preview",
  "Frontend y backend deben coincidir en la migración Veo 2.0 → Veo 3.1 Standard."
);
assert.equal(
  supportedModels.some((model) => /veo-(?:2\.0|3\.0)/.test(model)),
  false,
  "Ninguna ruta moderna puede seleccionar Veo 2 o Veo 3.0."
);

console.log("Podcaster Gemini video model selector v2 OK.");
