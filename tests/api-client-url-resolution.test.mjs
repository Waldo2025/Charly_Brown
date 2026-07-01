import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(
  new URL("../public/js/api-client.js", import.meta.url),
  "utf8"
);

function extractFunction(name) {
  const signature = `function ${name}`;
  const start = source.indexOf(signature);
  if (start === -1) throw new Error(`No se encontró ${name} en public/js/api-client.js`);
  let parenDepth = 0;
  let braceStart = -1;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (char === "{" && parenDepth === 0) {
      braceStart = index;
      break;
    }
  }
  if (braceStart === -1) throw new Error(`No se encontró el cuerpo de ${name}`);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`No se pudo extraer ${name}`);
}

const context = {
  DEFAULT_LOCAL_API_BASE: "http://127.0.0.1:8787/api",
  DEFAULT_REMOTE_API_BASE_SAFE: "/api",
  DEFAULT_GEMINI_API_BASE: "https://charly-brown-gemini-backend.onrender.com/api",
  DEFAULT_VEO_API_BASE: "https://gemini-veo.onrender.com/api",
  DEFAULT_EXPORT_API_BASE: "https://snoopy-export.onrender.com/api",
  window: {
    location: {
      hostname: "charly-brown.web.app",
      port: "",
      origin: "https://charly-brown.web.app"
    },
    __CHARLY_CONFIG__: {
      apiBaseUrl: "/api",
      geminiApiBaseUrl: "https://charly-brown-gemini-backend.onrender.com/api",
      remoteApiBaseUrl: "https://charly-brown-gemini-backend.onrender.com/api",
      veoApiBaseUrl: "https://gemini-veo.onrender.com/api",
      allowSameOriginApi: true
    }
  },
  console
};

vm.createContext(context);
vm.runInContext([
  extractFunction("getConfiguredApiBase"),
  extractFunction("getRemoteApiBase"),
  extractFunction("isLocalHostRuntime"),
  extractFunction("canUseSameOriginApi"),
  extractFunction("hasAvailableApiBase"),
  extractFunction("shouldForceSameOriginApiPath"),
  extractFunction("shouldForceRemotePodcasterAudioApiPath"),
  extractFunction("shouldUseExportApiPath"),
  extractFunction("resolveApiBase"),
  extractFunction("buildApiUrl"),
  extractFunction("buildApiUrlFromBase"),
  extractFunction("buildApiUrlPreferRemote"),
  extractFunction("getExportApiBase"),
  extractFunction("getVeoApiBase"),
  extractFunction("buildExportApiUrl"),
  extractFunction("buildVeoApiUrl"),
  extractFunction("buildVeoApiUrlPreferRemote")
].join("\n\n"), context);

test("podcaster export requests resolve to the export backend", () => {
  const resolved = context.buildApiUrlPreferRemote("/api/podcaster/montage/export");
  assert.equal(
    resolved,
    "https://snoopy-export.onrender.com/api/podcaster/montage/export"
  );
});

test("podcaster session requests stay on same-origin /api in production", () => {
  assert.equal(
    context.buildApiUrl("/api/podcaster/sessions/list"),
    "/api/podcaster/sessions/list"
  );
  assert.equal(
    context.buildApiUrl("/api/podcaster/sessions/save"),
    "/api/podcaster/sessions/save"
  );
  assert.equal(
    context.buildApiUrlPreferRemote("/api/podcaster/sessions/list"),
    "/api/podcaster/sessions/list"
  );
});

test("podcaster asset proxy requests stay on same-origin /api in production", () => {
  assert.equal(
    context.buildApiUrlPreferRemote("/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fsession-a%2Fvideos%2Fclip.mp4"),
    "/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fsession-a%2Fvideos%2Fclip.mp4"
  );
  assert.equal(
    context.buildApiUrlPreferRemote("/api/assets/proxy-image?storagePath=podcaster%2Fsessions%2Fsession-a%2Fimages%2Fthumb.png"),
    "/api/assets/proxy-image?storagePath=podcaster%2Fsessions%2Fsession-a%2Fimages%2Fthumb.png"
  );
});

test("veo requests resolve to the dedicated gemini-veo backend", () => {
  assert.equal(context.getVeoApiBase(), "https://gemini-veo.onrender.com/api");
  assert.equal(
    context.buildVeoApiUrl("/api/podcaster/dialogue-videos/generate"),
    "https://gemini-veo.onrender.com/api/podcaster/dialogue-videos/generate"
  );
  assert.equal(
    context.buildVeoApiUrlPreferRemote("/api/gemini/generate"),
    "https://gemini-veo.onrender.com/api/gemini/generate"
  );
});
