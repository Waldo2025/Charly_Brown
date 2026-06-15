import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("/Users/waldolopez/Documents/CharlyBrown/public/js/api-client.js", "utf8");

assert.ok(
  source.includes("getAuthHeadersWithRefresh(extra = {}, forceRefresh = false)"),
  "El helper de auth debe permitir refrescar el token."
);

assert.ok(
  source.includes("const backendAuthError = response.status === 401 || (response.status === 403 && /^AUTH_/i.test(String(data?.error || data?.code || \"\").trim()));"),
  "authFetchJson debe detectar fallos de auth para reintentar."
);

assert.ok(
  source.includes("const retryResponse = await fetch(finalUrl, requestInit);"),
  "authFetchJson debe reintentar una vez con token refrescado."
);

assert.ok(
  source.includes("const token = await user.getIdToken(forceRefresh);"),
  "El helper de auth debe pedir token fresco cuando se le indica."
);

console.log("api-client auth retry OK.");
