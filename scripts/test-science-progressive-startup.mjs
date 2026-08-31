import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Science Activities no precarga runtimes ni dependencias opcionales", async () => {
  const [html, source] = await Promise.all([read("public/scienceActivities.html"), read("public/js/scienceActivities.js")]);
  assert.doesNotMatch(html, /bootstrap(?:\.bundle)?(?:\.min)?\.(?:css|js)/i);
  assert.doesNotMatch(html, /science-hud-themes\.css|science-timeline-responsive\.css|html-docx\.js/i);
  assert.doesNotMatch(source, /^import .*science-game-runtime/m);
  assert.doesNotMatch(source, /^import .*science-simulator-runtime/m);
  assert.doesNotMatch(source, /^import .*science-image-generator/m);
  assert.match(html, /js\/scienceActivities\.bundle\.js\?v=/);
  assert.match(html, /rel="modulepreload" href="js\/scienceActivities\.bundle\.js\?v=/);
  assert.match(source, /import\(GAME_RUNTIME_SPECIFIER\)/);
  assert.match(source, /import\(SIMULATOR_RUNTIME_SPECIFIER\)/);
  assert.match(source, /afterBrowserPaint\(\)/);
});

test("la sesión local se lee antes de esperar configuración remota", async () => {
  const source = await read("public/js/scienceActivities.js");
  const init = source.slice(source.indexOf("async function init()"));
  assert.ok(init.indexOf("await loadSessions()") < init.indexOf("notifyEditorInteractive()"));
  assert.ok(init.indexOf("notifyEditorInteractive()") < init.indexOf("syncRemoteSessionsInBackground({"));
  assert.ok(init.indexOf("mountPreview: false") < init.indexOf("mountPreviewProgressively()"));
  assert.match(init, /syncRemoteSessionsInBackground\(\{/);
});

test("Phaser minificado es reproducible y reemplaza al archivo de desarrollo", async () => {
  const [full, min, entryFull, entryBundle, curriculum, motion, characters, imageCutout, apiClient, gameRuntime, simulatorRuntime, packageJson] = await Promise.all([
    stat(new URL("../public/vendor/phaser/phaser.esm.js", import.meta.url)),
    stat(new URL("../public/vendor/phaser/phaser.esm.min.js", import.meta.url)),
    stat(new URL("../public/js/scienceActivities.js", import.meta.url)),
    stat(new URL("../public/js/scienceActivities.bundle.js", import.meta.url)),
    stat(new URL("../public/js/science-curriculum-profiles.mjs", import.meta.url)),
    stat(new URL("../public/js/science-activities-motion.mjs", import.meta.url)),
    stat(new URL("../public/js/science-character-library.mjs", import.meta.url)),
    stat(new URL("../public/js/science-image-cutout.mjs", import.meta.url)),
    stat(new URL("../public/js/api-client.js", import.meta.url)),
    read("public/js/science-game-runtime.mjs"),
    read("public/js/science-simulator-runtime.mjs"),
    read("package.json")
  ]);
  assert.ok(min.size < full.size * .25, `Phaser minificado pesa ${min.size} de ${full.size} bytes`);
  const staticGraphBytes = entryFull.size + curriculum.size + motion.size + characters.size + imageCutout.size + apiClient.size;
  assert.ok(entryBundle.size < staticGraphBytes * .8, `Bundle Science Activities pesa ${entryBundle.size} de ${staticGraphBytes} bytes fuente`);
  assert.match(gameRuntime, /phaser\.esm\.min\.js/);
  assert.match(simulatorRuntime, /phaser\.esm\.min\.js/);
  assert.match(JSON.parse(packageJson).scripts["build:science"], /build-science-entry\.mjs/);
});

test("sidebar difiere Firestore y cache loader no bloquea por version.json", async () => {
  const [sidebar, chrome, loader, bannerLoader, banner] = await Promise.all([
    read("public/js/sidebar.js"),
    read("public/js/chromeLayout.js"),
    read("public/js/cache-version-loader.js"),
    read("public/js/update-banner-loader.js"),
    read("public/js/updateBanner.js")
  ]);
  assert.doesNotMatch(sidebar, /^import .*firebase-firestore/m);
  assert.match(sidebar, /loadSidebarFirestore.*import\("https:\/\/www\.gstatic\.com\/firebasejs\/12\.7\.0\/firebase-firestore\.js"\)/s);
  assert.match(sidebar, /scienceactivities:interactive/);
  assert.doesNotMatch(sidebar, /^import .*firebase-auth/m);
  assert.doesNotMatch(chrome, /^import .*firebase-auth/m);
  assert.doesNotMatch(loader, /fetch\("version\.json/);
  assert.match(loader, /Promise\.resolve\(fallbackVersion\)/);
  assert.match(loader, /Promise\.all\(scripts\.map/);
  assert.match(bannerLoader, /__CHARLY_VERSION_INFO_PROMISE__/);
  assert.match(banner, /__CHARLY_VERSION_INFO_PROMISE__/);
});

test("el editor se vuelve interactivo antes de iniciar la sincronización remota", async () => {
  const source = await read("public/js/scienceActivities.js");
  const init = source.slice(source.indexOf("async function init()"));
  assert.ok(init.indexOf("notifyEditorInteractive()") < init.indexOf("syncRemoteSessionsInBackground({"));
  assert.match(init, /Sincronizando sesiones/);
  assert.match(source, /sessionInteractionRevision === interactionRevision/);
  assert.match(source, /userInitiated:\s*true/);
});
