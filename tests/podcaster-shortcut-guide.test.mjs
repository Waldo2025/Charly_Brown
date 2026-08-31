import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SNOOPY_SHORTCUT_GUIDE_AUTO_STEP_MS,
  SNOOPY_SHORTCUT_GUIDE_ITEMS,
  SNOOPY_SHORTCUT_GUIDE_STORAGE_KEY,
  handleSnoopyReorderTimelineTracksShortcut,
  resolveSnoopyShortcutKeyLabel,
  resolveSnoopyShortcutModifier
} from "../public/podcaster/podcaster-shortcut-guide.js";

const htmlSource = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const guideSource = readFileSync(new URL("../public/podcaster/podcaster-shortcut-guide.js", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");

test("shortcut guide exposes exactly the nine supported editor actions", () => {
  assert.equal(SNOOPY_SHORTCUT_GUIDE_ITEMS.length, 9);
  assert.deepEqual(SNOOPY_SHORTCUT_GUIDE_ITEMS.map(({ id }) => id), [
    "jump", "replace", "regenerate", "export", "music", "playback", "navigate", "delete", "reorder"
  ]);
  assert.deepEqual(SNOOPY_SHORTCUT_GUIDE_ITEMS.at(-1)?.combos, [["mod", "Shift", "O"]]);
  assert.equal(SNOOPY_SHORTCUT_GUIDE_AUTO_STEP_MS, 4500);
  assert.equal(SNOOPY_SHORTCUT_GUIDE_STORAGE_KEY, "cb_snoopy_shortcut_guide_seen_v1");
  assert.doesNotMatch(JSON.stringify(SNOOPY_SHORTCUT_GUIDE_ITEMS), /undo|redo|deshacer|rehacer/i);
});

function createShortcutEvent(overrides = {}) {
  const calls = { preventDefault: 0, stopPropagation: 0 };
  return {
    event: {
      code: "KeyO",
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      altKey: false,
      defaultPrevented: false,
      target: {},
      preventDefault() { calls.preventDefault += 1; },
      stopPropagation() { calls.stopPropagation += 1; },
      ...overrides
    },
    calls
  };
}

test("Cmd/Ctrl+Shift+O delegates exactly once to the real reorder button", () => {
  for (const modifiers of [
    { metaKey: true, ctrlKey: false },
    { metaKey: false, ctrlKey: true }
  ]) {
    const { event, calls } = createShortcutEvent(modifiers);
    let clickCount = 0;
    const handled = handleSnoopyReorderTimelineTracksShortcut(event, {
      editorEnabled: true,
      isEditingTextField: () => false,
      button: { disabled: false, click() { clickCount += 1; } }
    });

    assert.equal(handled, true);
    assert.equal(clickCount, 1);
    assert.deepEqual(calls, { preventDefault: 1, stopPropagation: 1 });
  }
});

test("reorder shortcut ignores invalid modifiers and unavailable editor states", () => {
  const scenarios = [
    { event: { shiftKey: false } },
    { event: { altKey: true } },
    { event: { code: "KeyP" } },
    { event: { defaultPrevented: true } },
    { options: { editorEnabled: false } },
    { options: { isEditingTextField: () => true } },
    { options: { button: null } },
    { options: { button: { disabled: true, click() {} } } }
  ];

  for (const scenario of scenarios) {
    const { event, calls } = createShortcutEvent(scenario.event);
    let clickCount = 0;
    const defaults = {
      editorEnabled: true,
      isEditingTextField: () => false,
      button: { disabled: false, click() { clickCount += 1; } }
    };
    const handled = handleSnoopyReorderTimelineTracksShortcut(event, {
      ...defaults,
      ...(scenario.options || {})
    });

    assert.equal(handled, false);
    assert.equal(clickCount, 0);
    assert.deepEqual(calls, { preventDefault: 0, stopPropagation: 0 });
  }
});

test("Snoopy wires the reorder shortcut to the existing button and exposes it accessibly", () => {
  assert.match(appSource, /handleSnoopyReorderTimelineTracksShortcut\(event, \{[\s\S]*?editorEnabled: podcastVideoState\.enabled[\s\S]*?isEditingTextField: isPodcasterEditingTextField[\s\S]*?button: els\.reorderTimelineTracksBtn/);
  assert.match(appSource, /reorderTimelineTracksBtn\.setAttribute\("aria-keyshortcuts", "Meta\+Shift\+O Control\+Shift\+O"\)/);
  assert.match(appSource, /reorderTimelineTracksBtn\.addEventListener\("click"[\s\S]*?reorderTimelineClipsByTracks\(\)/);
});

test("Cmd/Ctrl+M opens the music modal through the shared action outside text editors", () => {
  assert.match(appSource, /function openMusicConfigModal\(\) \{[\s\S]*?syncMusicControls\(\);[\s\S]*?fetchGlobalPanelMusicLibrary\(\)[\s\S]*?setMusicConfigOpen\(true\)/);
  assert.match(appSource, /isMusicConfigShortcut[\s\S]*?event\.metaKey \|\| event\.ctrlKey[\s\S]*?event\.code === "KeyM"/);
  assert.match(appSource, /if \(isMusicConfigShortcut\) \{[\s\S]*?isPodcasterEditingTextField\(event\.target\)[\s\S]*?event\.preventDefault\(\);[\s\S]*?openMusicConfigModal\(\)/);
  assert.match(appSource, /open-music-config-modal'[\s\S]*?openMusicConfigModal\(\)/);
});

test("shortcut labels adapt to Apple and non-Apple platforms", () => {
  assert.equal(resolveSnoopyShortcutModifier("MacIntel"), "⌘");
  assert.equal(resolveSnoopyShortcutModifier("iPad"), "⌘");
  assert.equal(resolveSnoopyShortcutModifier("Win32"), "Ctrl");
  assert.equal(resolveSnoopyShortcutKeyLabel("ArrowLeft"), "←");
  assert.equal(resolveSnoopyShortcutKeyLabel("Space"), "Espacio");
});

test("header exposes the accessible shortcut trigger before fullscreen", () => {
  const triggerIndex = htmlSource.indexOf('id="podcastShortcutGuideBtn"');
  const fullscreenIndex = htmlSource.indexOf('id="podcastVideoModalFullscreenBtn"');
  assert.ok(triggerIndex > 0 && fullscreenIndex > triggerIndex);
  const triggerHtml = htmlSource.slice(triggerIndex, fullscreenIndex);
  assert.match(triggerHtml, /title="Ver atajos"/);
  assert.match(triggerHtml, /aria-haspopup="dialog"/);
  assert.match(triggerHtml, /aria-controls="snoopyShortcutGuide"/);
});

test("guide waits for the editor loader and is cancelled when Snoopy closes", () => {
  assert.match(appSource, /createSnoopyShortcutGuide\(\{[\s\S]*?els\.podcastVideoLoader\?\.hidden !== false/);
  assert.match(appSource, /setPodcastVideoLoaderOpen\(false, \(\) => \{[\s\S]*?animatePodcastMontagePreviewEntrance\(\);[\s\S]*?scheduleAutoOpen\(900\)/);
  assert.match(appSource, /function closePodcastVideoModal\(\) \{[\s\S]*?cancelPending\(\);[\s\S]*?restoreFocus: false, animate: false/);
});

test("guide supports autoplay pauses, dismissal paths and Anime.js fallback", () => {
  assert.match(guideSource, /mouseenter[\s\S]*?pauseAuto/);
  assert.match(guideSource, /focusin[\s\S]*?pauseAuto/);
  assert.match(guideSource, /visibilitychange/);
  assert.match(guideSource, /handleOutsideClick/);
  assert.match(guideSource, /event\.key !== "Escape"/);
  assert.match(guideSource, /state\.anime\.stagger\(55\)/);
  assert.match(guideSource, /runFallbackTimer\(\)/);
  assert.match(guideSource, /localStorage\.setItem\(SNOOPY_SHORTCUT_GUIDE_STORAGE_KEY, "1"\)/);
});

test("guide has mobile safe-area and reduced-motion styling without ID-coupled CSS", () => {
  const marker = cssSource.indexOf("Snoopy shortcut guide — non-modal");
  assert.ok(marker >= 0);
  const guideCss = cssSource.slice(marker);
  assert.match(guideCss, /@media \(max-width: 768px\)[\s\S]*?env\(safe-area-inset-bottom\)/);
  assert.match(guideCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none !important/);
  assert.match(guideCss, /is-snoopy-editor-light-theme \.snoopy-shortcut-guide/);
  assert.match(guideCss, /is-snoopy-editor-mid-theme \.snoopy-shortcut-guide/);
  assert.doesNotMatch(guideCss, /#snoopyShortcutGuide|#podcastShortcutGuideBtn/);
});
