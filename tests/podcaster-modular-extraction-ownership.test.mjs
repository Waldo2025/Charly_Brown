import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const scriptGeneratorSource = readFileSync(new URL("../public/podcaster/podcaster-script-generator.js", import.meta.url), "utf8");
const promptComposerSource = readFileSync(new URL("../public/podcaster/podcaster-prompt-composer.js", import.meta.url), "utf8");
const sessionRailSource = readFileSync(new URL("../public/podcaster/podcaster-session-rail.js", import.meta.url), "utf8");
const onScreenTextEditorSource = readFileSync(new URL("../public/podcaster/podcaster-on-screen-text-track-editor.js", import.meta.url), "utf8");

function readDependencyNames(source, factoryName) {
  const match = source.match(new RegExp(`export function ${factoryName}\\(deps = \\{\\}\\) \\{[\\s\\S]*?const \\{([\\s\\S]*?)\\n  \\} = deps;`));
  assert.ok(match, `expected ${factoryName} to destructure deps`);
  return [...match[1].matchAll(/\n\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/g)].map((item) => item[1]);
}

function readPassedDependencyNames(source, variableName, factoryName) {
  const match = source.match(new RegExp(`${variableName} = ${factoryName}\\(\\{([\\s\\S]*?)\\n\\}\\);|const ${variableName} = ${factoryName}\\(\\{([\\s\\S]*?)\\n\\}\\);`));
  assert.ok(match, `expected podcaster.js to instantiate ${factoryName}`);
  const body = match[1] || match[2] || "";
  return [...body.matchAll(/\n\s*([A-Za-z_$][\w$]*)\s*(?::|,|$)/g)].map((item) => item[1]);
}

test("prompt composer owns prompt DOM editing helpers", () => {
  assert.match(promptComposerSource, /export function createPodcasterPromptComposerApi/);
  assert.match(promptComposerSource, /return \{[\s\S]*autoResize[\s\S]*updateLayoutOffset[\s\S]*getPlainText[\s\S]*getHtml[\s\S]*setContent[\s\S]*insertText[\s\S]*insertHtml[\s\S]*handlePaste[\s\S]*\};/m);
  for (const name of [
    "autoResizePrompt",
    "normalizePromptClipboardText",
    "getPromptInputPlainText",
    "getPromptInputHtml",
    "setPromptInputContent",
    "insertPromptInputText",
    "insertPromptInputHtml",
    "handlePromptInputPaste"
  ]) {
    assert.doesNotMatch(podcasterSource, new RegExp(`function ${name}\\(`));
    assert.doesNotMatch(scriptGeneratorSource, new RegExp(`function ${name}\\(`));
    assert.doesNotMatch(scriptGeneratorSource, new RegExp(`window\\.${name}\\s*=`));
  }
});

test("session rail owns session rail UI actions", () => {
  assert.match(sessionRailSource, /export function createPodcasterSessionRailApi/);
  assert.match(sessionRailSource, /return \{[\s\S]*render: renderSessions[\s\S]*closeMenus[\s\S]*toggleOrOpenSession[\s\S]*createSessionChat[\s\S]*openSessionThread[\s\S]*renameSession[\s\S]*archiveSession[\s\S]*restoreSession[\s\S]*deleteSession[\s\S]*setAcademicDataModalOpen[\s\S]*saveAcademicData[\s\S]*\};/m);
  for (const name of [
    "renderSessions",
    "closeSessionMenus",
    "createSessionChat",
    "openSessionThread",
    "toggleOrOpenSession",
    "renameSession",
    "archiveSession",
    "restoreSession",
    "deleteSession",
    "setSessionAcademicDataModalOpen",
    "saveSessionAcademicData"
  ]) {
    assert.doesNotMatch(podcasterSource, new RegExp(`function ${name}\\(`));
  }
});

test("on-screen text track editor owns modal and overlay editing functions", () => {
  assert.match(onScreenTextEditorSource, /export function createPodcasterOnScreenTextTrackEditorApi/);
  assert.match(onScreenTextEditorSource, /return \{[\s\S]*setTrackSetting[\s\S]*syncAnchorAcrossLayouts[\s\S]*toggleTrackVisibility[\s\S]*setAllClipsHidden[\s\S]*renderModal[\s\S]*setModalOpen[\s\S]*beginModalDrag[\s\S]*applyModalDrag[\s\S]*endModalDrag[\s\S]*beginOverlayDrag[\s\S]*applyOverlayDragMove[\s\S]*endOverlayDrag[\s\S]*applyOverlayResizeMove[\s\S]*endOverlayResize[\s\S]*\};/m);
  for (const name of [
    "setOnScreenTextTrackSetting",
    "syncOnScreenTextTrackAnchorAcrossLayouts",
    "syncOnScreenTextTrackWidthAcrossLayouts",
    "syncOnScreenTextTrackToggleBtn",
    "toggleOnScreenTextTrackVisibility",
    "setAllOnScreenTextClipsHidden",
    "renderOnScreenTextTrackModal",
    "setOnScreenTextTrackModalOpen",
    "beginOnScreenTextTrackModalDrag",
    "applyOnScreenTextTrackModalDrag",
    "endOnScreenTextTrackModalDrag",
    "beginOnScreenTextOverlayDrag",
    "applyOnScreenTextOverlayDragMove",
    "endOnScreenTextOverlayDrag",
    "applyOnScreenTextOverlayResizeMove",
    "endOnScreenTextOverlayResize"
  ]) {
    assert.doesNotMatch(podcasterSource, new RegExp(`function ${name}\\(`));
  }
});

test("new modules receive every declared dependency explicitly from podcaster.js", () => {
  const modules = [
    ["podcasterPromptComposerApi", "createPodcasterPromptComposerApi", promptComposerSource],
    ["podcasterSessionRailApi", "createPodcasterSessionRailApi", sessionRailSource],
    ["podcasterOnScreenTextTrackEditorApi", "createPodcasterOnScreenTextTrackEditorApi", onScreenTextEditorSource]
  ];
  for (const [variableName, factoryName, source] of modules) {
    const required = readDependencyNames(source, factoryName);
    const passed = readPassedDependencyNames(podcasterSource, variableName, factoryName);
    assert.deepEqual(
      required.filter((name) => !passed.includes(name)),
      [],
      `${factoryName} missing explicit dependencies`
    );
  }
});
