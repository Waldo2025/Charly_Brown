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
  "const DEFAULT_EXPORT_API_BASE = \"https://snoopy-export.onrender.com/api\";",
  extractFunction("getConfiguredApiBase"),
  extractFunction("getRemoteApiBase"),
  extractFunction("getExportApiBase"),
  extractFunction("isLocalHostRuntime"),
  extractFunction("canUseSameOriginApi"),
  extractFunction("hasAvailableApiBase"),
  extractFunction("resolveApiBase"),
  extractFunction("shouldUseExportApiPath"),
  extractFunction("buildApiUrl"),
  extractFunction("buildApiUrlFromBase"),
  extractFunction("buildApiUrlPreferRemote"),
  extractFunction("getVeoApiBase"),
  extractFunction("buildVeoApiUrl"),
  extractFunction("buildVeoApiUrlPreferRemote")
].join("\n\n"), context);

test("montage export requests resolve to the dedicated export backend", () => {
  const resolved = context.buildApiUrlPreferRemote("/api/podcaster/montage/export");
  assert.equal(
    resolved,
    "https://snoopy-export.onrender.com/api/podcaster/montage/export"
  );
});

test("proxy asset requests resolve to the dedicated export backend", () => {
  assert.equal(
    context.buildApiUrl("/api/assets/proxy-media?storagePath=podcaster%2Flibrary%2Fscene.mp4"),
    "https://snoopy-export.onrender.com/api/assets/proxy-media?storagePath=podcaster%2Flibrary%2Fscene.mp4"
  );
  assert.equal(
    context.buildApiUrlPreferRemote("/api/assets/proxy-image?storagePath=podcaster%2Flibrary%2Fthumb.jpg"),
    "https://snoopy-export.onrender.com/api/assets/proxy-image?storagePath=podcaster%2Flibrary%2Fthumb.jpg"
  );
});

test("podcaster session list resolves to the dedicated export backend", () => {
  assert.equal(
    context.buildApiUrl("/api/podcaster/sessions/list"),
    "https://snoopy-export.onrender.com/api/podcaster/sessions/list"
  );
});

test("podcaster active session get resolves to the dedicated export backend", () => {
  assert.equal(
    context.buildApiUrl("/api/podcaster/sessions/get?sessionId=session_1"),
    "https://snoopy-export.onrender.com/api/podcaster/sessions/get?sessionId=session_1"
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
