import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const frontendSource = readFileSync(new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url), "utf8");

assert.match(
  backendSource,
  /app\.post\("\/api\/podcaster\/dialogue-videos\/generate"/,
  "Debe conservarse el endpoint público de generación."
);
assert.match(
  backendSource,
  /app\.post\("\/api\/podcaster\/dialogue-videos\/generate-sync"[\s\S]*const resolvedGenerator = resolveVideoGenerator\(/,
  "La ruta síncrona interna debe resolver un único proveedor mediante el contrato v2."
);
assert.match(
  backendSource,
  /const videoModels = \[requestedModel\];/,
  "Una operación aceptada debe usar exactamente un modelo."
);
assert.match(
  backendSource,
  /const client = new GoogleGenAI\(\{ apiKey: GEMINI_API_KEY \}\);[\s\S]*createOmniVideo\([\s\S]*createVeoVideo\(/,
  "Omni y Veo deben usar los adaptadores del SDK oficial."
);

assert.match(
  backendSource,
  /dialogueAudioUrl \|\| req\.body\?\.audioUrl \|\| req\.body\?\.audioDownloadUrl/,
  "El backend debe aceptar dialogueAudioUrl y aliases durante la transición."
);
assert.match(
  backendSource,
  /dialogueAudioStoragePath \|\| req\.body\?\.audioStoragePath/,
  "El backend debe aceptar dialogueAudioStoragePath y su alias legacy."
);

assert.match(
  backendSource,
  /console\.info\(`\[backend\]\[\$\{requestDebugTag\}\] video-provider-complete`[\s\S]*generator:\s*resolvedGenerator,[\s\S]*promptVersion:\s*PODCASTER_VIDEO_PROMPT_VERSION,[\s\S]*promptHash,[\s\S]*textPolicy:\s*requestedTextPolicy,[\s\S]*aspectRatio:\s*requestedAspectRatio,[\s\S]*requestedDurationSec:[\s\S]*effectiveDurationSec,[\s\S]*resolution:[\s\S]*removedDirectiveFields:/,
  "La observabilidad debe registrar metadatos y hashes, no el copy completo."
);

assert.match(
  backendSource,
  /dialogueVideo:\s*\{[\s\S]*generator:\s*resolvedGenerator,[\s\S]*provider:\s*"gemini",[\s\S]*promptVersion:\s*PODCASTER_VIDEO_PROMPT_VERSION,[\s\S]*promptHash,[\s\S]*textPolicy:\s*requestedTextPolicy,[\s\S]*aspectRatio:\s*requestedAspectRatio,[\s\S]*resolution:\s*effectiveResolution,[\s\S]*interactionId:\s*resolvedInteractionId \|\| null,[\s\S]*operationName:\s*resolvedOperationName \|\| null,[\s\S]*durationSec:\s*effectiveDurationSec,[\s\S]*requestedDurationSec:\s*inferredTargetDurationSec/,
  "La respuesta debe incluir proveedor, política, duración efectiva, resolución e interacción/operación."
);

assert.match(
  backendSource,
  /const endpoint = `\$\{GEMINI_BASE\}\/models\/\$\{encodeURIComponent\(model\)\}:generateContent`;[\s\S]*"x-goog-api-key": GEMINI_API_KEY/,
  "La clave de generateContent debe viajar en header, nunca en la URL."
);

assert.match(
  frontendSource,
  /const DIALOGUE_VIDEO_POLL_TIMEOUT_MS = 11 \* 60 \* 1000;/,
  "El polling frontend debe esperar once minutos para cubrir proveedor y procesamiento."
);

console.log("Podcaster Gemini video backend v2 contract OK.");
