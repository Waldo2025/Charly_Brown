import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/cors.json",
  "utf8"
);
const corsConfig = JSON.parse(source);
const firstRule = corsConfig[0] || {};

assert.ok(Array.isArray(corsConfig) && corsConfig.length > 0, "cors.json debe contener al menos una regla.");
assert.ok(firstRule.origin.includes("https://charly-brown.web.app"), "cors.json debe permitir el origen web de producción.");
assert.ok(firstRule.origin.includes("https://charly-brown-gemini-backend.onrender.com"), "cors.json debe permitir el origen del backend.");
assert.ok(firstRule.origin.includes("https://gemini-veo.onrender.com"), "cors.json debe permitir el origen del backend de Veo.");
assert.ok(firstRule.origin.includes("http://127.0.0.1:8787"), "cors.json debe permitir el backend local.");
assert.ok(firstRule.responseHeader.includes("Content-Range"), "cors.json debe exponer Content-Range para streaming parcial.");
assert.ok(firstRule.responseHeader.includes("Accept-Ranges"), "cors.json debe exponer Accept-Ranges para streaming parcial.");
assert.ok(firstRule.responseHeader.includes("Cache-Control"), "cors.json debe exponer Cache-Control para assets cacheados.");

console.log("public cors.json OK.");
