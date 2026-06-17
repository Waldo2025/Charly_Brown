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
  /podcaster\.css\?v=2026-1\.0\.10\.183/,
  "podcaster.html debe cargar el CSS con cache-buster nuevo."
);

assert.match(
  htmlSource,
  /podcaster\/podcaster\.js\?v=2026-06-17\.22/,
  "podcaster.html debe cargar podcaster.js con cache-buster nuevo."
);

assert.match(
  cssSource,
  /#togglePodcastStudioInspectorBtn\.podcast-studio-inspector-toggle[\s\S]*?position:\s*absolute;/,
  "El toggle externo debe tener estilo propio fuera del panel."
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
