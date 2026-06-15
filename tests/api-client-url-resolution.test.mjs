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
      remoteApiBaseUrl: "https://charly-brown-gemini-backend.onrender.com/api",
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
  extractFunction("resolveApiBase"),
  extractFunction("buildApiUrl"),
  extractFunction("buildApiUrlFromBase"),
  extractFunction("buildApiUrlPreferRemote")
].join("\n\n"), context);

test("authenticated podcaster requests prefer the remote backend instead of the /api redirect", () => {
  const resolved = context.buildApiUrlPreferRemote("/api/podcaster/montage/export");
  assert.equal(
    resolved,
    "https://charly-brown-gemini-backend.onrender.com/api/podcaster/montage/export"
  );
});
