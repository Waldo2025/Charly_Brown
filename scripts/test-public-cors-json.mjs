import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "public/cors.json"), "utf8");
const corsConfig = JSON.parse(source);
const firstRule = corsConfig[0] || {};

assert.ok(Array.isArray(corsConfig) && corsConfig.length > 0, "cors.json debe contener al menos una regla.");
assert.ok(firstRule.origin.includes("https://charly-brown.web.app"), "cors.json debe permitir el origen web de producción.");
assert.ok(firstRule.origin.includes("https://gemini-live-proxy-128488238449.us-central1.run.app"), "cors.json debe permitir el proxy Live de Google Cloud.");
assert.ok(firstRule.origin.every((origin) => !/onrender\.com/i.test(origin)), "cors.json no debe conservar orígenes de Render.");
assert.ok(firstRule.origin.includes("http://127.0.0.1:8787"), "cors.json debe permitir el backend local.");
assert.ok(firstRule.responseHeader.includes("Content-Range"), "cors.json debe exponer Content-Range para streaming parcial.");
assert.ok(firstRule.responseHeader.includes("Accept-Ranges"), "cors.json debe exponer Accept-Ranges para streaming parcial.");
assert.ok(firstRule.responseHeader.includes("Cache-Control"), "cors.json debe exponer Cache-Control para assets cacheados.");

console.log("public cors.json OK.");
