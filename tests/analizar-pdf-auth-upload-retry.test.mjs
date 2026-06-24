import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const apiClientSource = readFileSync(new URL("../public/js/api-client.js", import.meta.url), "utf8");
const analizarPdfApiSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-api.js", import.meta.url), "utf8");

test("authFetch retries authenticated binary requests after backend auth failures", () => {
  assert.match(apiClientSource, /export async function authFetch\(url, options = \{\}\)/);
  assert.match(apiClientSource, /const detail = await parseResponseDetailSafe\(response\);/);
  assert.match(apiClientSource, /if \(isBackendAuthError\(response, detail\)\) \{/);
  assert.match(apiClientSource, /requestInit = await buildRequestInit\(true\);/);
});

test("analizar pdf upload and export routes use authFetch", () => {
  assert.match(analizarPdfApiSource, /import \{ authFetch, authFetchJson, buildApiUrl, hasAvailableApiBase \} from "\.\.\/js\/api-client\.js";/);
  assert.match(analizarPdfApiSource, /const response = await authFetch\("\/api\/analizar-pdf\/analyze", \{[\s\S]*preferRemote: false,/);
  assert.match(analizarPdfApiSource, /const response = await authFetch\("\/api\/analizar-pdf\/export-corrected-idml", \{[\s\S]*preferRemote: false,/);
  assert.match(analizarPdfApiSource, /const downloadResponse = await authFetch\(buildApiUrl\(downloadPath\), \{[\s\S]*preferRemote: false/);
});

test("api client supports opting out of remote preference for authenticated requests", () => {
  assert.match(apiClientSource, /const \{ auth = true, preferRemote = auth, \.\.\.requestOptions \} = options \|\| \{\};/);
  assert.match(apiClientSource, /const finalUrl = auth \? \(preferRemote \? buildApiUrlPreferRemote\(url\) : buildApiUrl\(url\)\) : buildApiUrl\(url\);/);
});
