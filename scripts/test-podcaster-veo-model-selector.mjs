import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const timelineModel = readFileSync(new URL("../public/podcaster/podcaster-timeline-model.js", import.meta.url), "utf8");
const podcasterJs = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const backend = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/const PODCASTER_VIDEO_MODEL_CANDIDATES = Object\.freeze\(\[\s*"veo-3\.1-generate-preview",\s*"veo-3\.1-fast-generate-preview",\s*"veo-3\.1-lite-generate-preview",\s*"veo-3\.0-generate-001",\s*"veo-3\.0-fast-generate-001",\s*"veo-2\.0-generate-001"\s*\]\);/m.test(backend)) {
  throw new Error("El backend debe exponer todos los modelos Veo compatibles con esta integración.");
}

if (!/const normalizedVideoModel = \(\(\) => \{[\s\S]*const requestedModel = String\(raw\?\.videoModel \|\| ""\)\.trim\(\);[\s\S]*if \(requestedModel && AVAILABLE_PODCASTER_VIDEO_MODELS\.includes\(requestedModel\)\) return requestedModel;[\s\S]*return raw\?\.cheapVideoMode === false \? "veo-3\.1-generate-preview" : "veo-3\.1-lite-generate-preview";[\s\S]*\}\)\(\);/m.test(timelineModel)) {
  throw new Error("La normalización del config debe persistir un videoModel explícito con fallback legacy.");
}

if (!/videoModel:\s*normalizedVideoModel/.test(timelineModel)) {
  throw new Error("normalizePodcastVideoConfig debe devolver videoModel.");
}

if (!/<select id="globalCheapVideoMode">[\s\S]*<option value="veo-3\.1-generate-preview">[\s\S]*<option value="veo-3\.1-fast-generate-preview">[\s\S]*<option value="veo-3\.1-lite-generate-preview">[\s\S]*<option value="veo-3\.0-generate-001">[\s\S]*<option value="veo-3\.0-fast-generate-001">[\s\S]*<option value="veo-2\.0-generate-001">/m.test(html)) {
  throw new Error("globalCheapVideoMode debe listar todos los modelos Veo disponibles.");
}

if (!/els\.globalCheapVideoMode\.value = String\(videoCfg\.videoModel \|\| ""\)\.trim\(\) \|\| "veo-3\.1-lite-generate-preview"/.test(podcasterJs)) {
  throw new Error("La UI debe reflejar videoModel en globalCheapVideoMode.");
}

if (!/videoModel:\s*selectedVideoModel,\s*[\s\S]*cheapVideoMode:\s*selectedVideoModel === "veo-3\.1-lite-generate-preview"/m.test(podcasterJs)) {
  throw new Error("Aplicar configuración global debe persistir videoModel y mantener compatibilidad con cheapVideoMode.");
}

console.log("Podcaster Veo model selector OK.");
