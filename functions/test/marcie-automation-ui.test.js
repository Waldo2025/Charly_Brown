const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const editor = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/js/editor-app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/css/MarcieBlogEditor.css"), "utf8");
const html = fs.readFileSync(path.join(root, "public/MarcieBlogEditor.html"), "utf8");

test("las etiquetas orbitales contrarrotan y permanecen legibles", () => {
  assert.match(editor, /data-agent-orbit-label class="automation-agent-orbit-label">Idea/);
  assert.match(editor, /data-agent-orbit-label class="automation-agent-orbit-label">Imagen/);
  assert.match(editor, /\[data-agent-orbit\] > \[data-agent-orbit-label\][\s\S]*rotate: \[0, -360\][\s\S]*duration: 12000/);
  assert.match(editor, /\[data-agent-orbit-reverse\] > \[data-agent-orbit-label\][\s\S]*rotate: \[0, 360\][\s\S]*duration: 9000/);
  assert.match(editor, /class="automation-agent-orbit is-outer" aria-hidden="true"/);
  assert.match(editor, /class="automation-agent-orbit is-inner" aria-hidden="true"/);
});

test("los chips orbitales tienen tamaño compacto y texto horizontal", () => {
  assert.match(styles, /\.automation-agent-orbit-label \{[\s\S]*min-width: 48px;[\s\S]*min-height: 26px;/);
  assert.match(styles, /\.automation-agent-orbit-label \{[\s\S]*border-radius: 999px;/);
  assert.match(styles, /\.automation-agent-orbit-label \{[\s\S]*white-space: nowrap;/);
  assert.match(styles, /\.automation-agent-orbit-label \{[\s\S]*will-change: transform;/);
  assert.match(styles, /\.automation-agent-orbit-glyph \{[\s\S]*border-radius: 50%/);
  assert.match(styles, /\.automation-agent-orbit\.is-inner span:nth-child\(2\) \{ top: auto; right: 4px; bottom: 12px; left: auto; \}/);
});

test("la automatización muestra el estado de generación dentro de article-view", () => {
  assert.match(editor, /window\.__marcieShowArticleGenerationSpinner\?\.\(session, \{[\s\S]*current: index \+ 1,[\s\S]*total: audiences\.length/);
  assert.match(editor, /finally \{\s*window\.__marcieHideArticleGenerationSpinner\?\.\(\);\s*\}/);
  assert.match(editor, /spinnerHost\.setAttribute\("role", "status"\)/);
  assert.match(editor, /Artículo \$\{generationProgress\.current\} de \$\{generationProgress\.total\}/);
  assert.match(styles, /#article-generation-spinner \{[\s\S]*min-height:/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("las fuentes APA se presentan siempre en una sola columna", () => {
  assert.match(html, /id="article-sources-list" class="article-sources-list grid grid-cols-1 sm:grid-cols-2 gap-3"/);
  assert.match(editor, /classList\.toggle\("sm:grid-cols-2", !isApa\)/);
  assert.match(styles, /#article-sources-list\.is-apa \{\s*grid-template-columns: minmax\(0, 1fr\) !important;/);
  assert.match(editor, /data-source-citation-format="\$\{sourceMode\}"/);
});
