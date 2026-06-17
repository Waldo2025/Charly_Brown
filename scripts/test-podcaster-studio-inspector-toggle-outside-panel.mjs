import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const htmlSource = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");
const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

const toggleIndex = htmlSource.indexOf('id="togglePodcastStudioInspectorBtn"');
const inspectorIndex = htmlSource.indexOf('id="podcastStudioInspector"');
const inspectorCloseIndex = htmlSource.indexOf("</aside>", inspectorIndex);
const collapsedHandleIndex = htmlSource.indexOf('id="podcastStudioInspectorCollapsedHandle"');

assert.ok(toggleIndex > -1, "Debe existir togglePodcastStudioInspectorBtn.");
assert.ok(inspectorIndex > -1, "Debe existir podcastStudioInspector.");
assert.ok(inspectorCloseIndex > inspectorIndex, "El aside del inspector debe cerrar correctamente.");
assert.ok(
  toggleIndex < inspectorIndex || toggleIndex > inspectorCloseIndex,
  "togglePodcastStudioInspectorBtn debe estar fuera del aside podcastStudioInspector."
);
assert.ok(
  collapsedHandleIndex > inspectorCloseIndex,
  "podcastStudioInspectorCollapsedHandle debe seguir fuera del aside del inspector."
);

assert.match(
  htmlSource,
  /podcaster\.css\?v=2026-1\.0\.10\.184/,
  "podcaster.html debe cargar el CSS con cache-buster nuevo."
);

assert.match(
  htmlSource,
  /podcaster\/podcaster\.js\?v=2026-06-17\.22/,
  "podcaster.html debe cargar podcaster.js con cache-buster nuevo."
);

assert.match(
  cssSource,
  /#togglePodcastStudioInspectorBtn\.podcast-studio-inspector-toggle[\s\S]*?position:\s*absolute;[\s\S]*?right:\s*calc\(clamp\(var\(--pod-studio-inspector-min\), var\(--pod-studio-inspector-width\), var\(--pod-studio-inspector-max\)\) - 16px\);[\s\S]*?width:\s*32px;[\s\S]*?height:\s*64px;/,
  "El toggle externo debe usar el mismo tamaño vertical del handle y anclarse al borde del inspector, no sobre el preview."
);

assert.match(
  cssSource,
  /#togglePodcastStudioInspectorBtn\.podcast-studio-inspector-toggle[\s\S]*?border:\s*1px solid color-mix\(in srgb, var\(--pod-border\) 88%, transparent 12%\);[\s\S]*?border-radius:\s*999px;[\s\S]*?background:\s*color-mix\(in srgb, var\(--pod-surface\) 98%, #0f172a 2%\);[\s\S]*?box-shadow:\s*-4px 10px 25px rgba\(15, 23, 42, 0\.15\);/,
  "El toggle externo debe compartir el estilo visual base del handle colapsado."
);

assert.match(
  cssSource,
  /\.podcast-studio-layout\.is-inspector-collapsed #togglePodcastStudioInspectorBtn\.podcast-studio-inspector-toggle/,
  "El toggle externo debe ocultarse cuando el inspector está colapsado."
);

assert.match(
  podcasterSource,
  /els\.togglePodcastStudioInspectorBtn\.hidden = podcastStudioInspectorCollapsed;/,
  "El toggle debe mostrarse solo cuando el inspector está visible."
);

assert.match(
  podcasterSource,
  /els\.podcastStudioInspectorCollapsedHandle\.hidden = !podcastStudioInspectorCollapsed;/,
  "El handle colapsado debe mostrarse solo cuando el inspector está colapsado."
);

console.log("ok - podcast studio inspector toggle lives outside panel");
