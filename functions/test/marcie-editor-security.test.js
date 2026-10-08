const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const editorSource = fs.readFileSync(path.join(__dirname, "../../public/MarcieBlogEditor/js/editor-app.js"), "utf8");

test("Marcie escapa los valores de tendencia antes de interpolarlos en HTML", () => {
  assert.match(editorSource, /escapeHtml\(trendGrowth\)/);
  assert.match(editorSource, /escapeHtml\(trendFreshness\)/);
  assert.match(editorSource, /escapeHtml\(trendSourceDiversity\)/);
  assert.match(editorSource, /trendScore = clampPercent\(trend\.trendScore, null\)/);
});

test("Marcie limita progreso y valida la URL de portada antes del sink HTML", () => {
  assert.match(editorSource, /<progress class="marcie-progress-fill"/);
  assert.doesNotMatch(editorSource, /style="width: \$\{automationProgress\}%"/);
  assert.match(editorSource, /const safeImageUrl = getSafeImageUrl\(image\?\.url\)/);
  assert.match(editorSource, /return new URL\(clean, window\.location\.origin\)\.protocol === "https:"/);
});
