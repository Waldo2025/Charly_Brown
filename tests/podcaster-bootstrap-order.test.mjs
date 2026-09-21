import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const loader = readFileSync(new URL("../public/js/cache-version-loader.js", import.meta.url), "utf8");
const rail = readFileSync(new URL("../public/podcaster/podcaster-session-rail.js", import.meta.url), "utf8");
const chat = readFileSync(new URL("../public/podcaster/podcaster-chat-assistant.js", import.meta.url), "utf8");
const editor = readFileSync(new URL("../public/podcaster/podcaster-script-editor.js", import.meta.url), "utf8");

test("Podcaster declares app and deferred editor dependencies", () => {
  assert.match(html, /data-cache-src="podcaster\/podcaster\.js"[^>]+data-cache-role="app"/);
  assert.match(html, /podcaster\/podcaster-media-editor\.js"[^>]+data-cache-role="deferred"/);
});

test("runtime consumers initialize after their runtimes are registered", () => {
  const runtimeRegistration = app.indexOf("registerPodcasterGenerationRuntime(podcasterGenerationRuntimeApi)");
  const dependentImports = app.indexOf('import(`./podcaster-public-library.js${versionQuery}`)');
  const initCall = app.indexOf("init();", dependentImports);
  assert.ok(runtimeRegistration >= 0 && dependentImports > runtimeRegistration);
  assert.ok(initCall > dependentImports);
  assert.doesNotMatch(html, /data-cache-src="podcaster\/podcaster-(?:public-library|video-generator)\.js"/);
  assert.doesNotMatch(html, /data-cache-src="podcaster\/podcaster-timeline-model\.js"/);
});


test("cached sessions paint before cloud bootstrap completes", () => {
  const localRead = app.indexOf("sessionStore.loadSessionsFromLocalCache(nextUid)");
  const localRender = app.indexOf("render();", localRead);
  const cloudBootstrap = app.indexOf("await sessionStore.bootstrapSessions(nextUid)", localRead);
  assert.ok(localRead >= 0 && localRender > localRead && cloudBootstrap > localRender);
  assert.match(app, /showLoader: !workspaceRevealed/);
});

test("primary panels keep their DOM when generated markup is unchanged", () => {
  assert.match(rail, /nextMarkup !== lastSessionListMarkup/);
  assert.match(chat, /chatRenderMarkupCache\.get\(target\) !== nextMarkup/);
  assert.match(editor, /scriptRenderMarkupCache\.get\(els\.scriptTableBody\) !== nextScriptMarkup/);
});
