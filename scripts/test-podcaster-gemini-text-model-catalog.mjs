import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const generatorSource = readFileSync(new URL("../public/podcaster/podcaster-script-generator.js", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const rootPackage = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const backendPackage = JSON.parse(readFileSync(new URL("../backend/package.json", import.meta.url), "utf8"));

const selectMarkup = html.match(/<select[^>]*id="scriptModelSelect"[^>]*>([\s\S]*?)<\/select>/)?.[1] || "";
const textModels = Array.from(selectMarkup.matchAll(/<option value="([^"]+)"/g), (item) => item[1]);
assert.deepEqual(textModels, [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.1-pro-preview"
]);

assert.match(generatorSource, /return String\(select\?\.value \|\| ""\)\.trim\(\) \|\| "gemini-3\.5-flash";/);
assert.match(backendSource, /const DEFAULT_GEMINI_TEXT_MODEL = "gemini-3\.5-flash";/);
assert.match(backendSource, /"gemini-2\.5-flash": DEFAULT_GEMINI_TEXT_MODEL/);
assert.match(backendSource, /"gemini-2\.5-flash-lite": "gemini-3\.1-flash-lite"/);
assert.match(backendSource, /"gemini-2\.5-pro": "gemini-3\.1-pro-preview"/);
assert.match(backendSource, /return GEMINI_TEXT_MODEL_ALIASES\[raw\] \|\| raw \|\| DEFAULT_GEMINI_TEXT_MODEL;/);

assert.equal(rootPackage.dependencies?.["@google/genai"], "2.12.0");
assert.equal(backendPackage.dependencies?.["@google/genai"], "2.12.0");

console.log("Podcaster Gemini text catalog and SDK pin OK.");
