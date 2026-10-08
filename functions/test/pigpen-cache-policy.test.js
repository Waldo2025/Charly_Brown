const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const firebaseConfig = require(path.resolve(__dirname, "../../firebase.json"));

test("opening PigPen normally revalidates every mutable editor asset", () => {
  const noCacheSources = new Set(firebaseConfig.hosting.headers
    .filter((entry) => entry.headers?.some((header) => {
      if (header.key !== "Cache-Control") return false;
      const directives = new Set(header.value.toLowerCase().split(",").map((value) => value.trim()));
      return directives.has("no-store") || (directives.has("no-cache") && directives.has("must-revalidate"));
    }))
    .map((entry) => entry.source));

  for (const source of [
    "/PigPenCreator*",
    "/js/PigPenCreator.js",
    "/js/pigpen-*",
    "/js/escape-room-*",
    "/js/{api-client,firebase-default-app,firebase-app-check,html-docx}.js"
  ]) {
    assert.ok(noCacheSources.has(source), `PigPen must revalidate ${source}.`);
  }
});
