import test from "node:test";
import assert from "node:assert/strict";

const { buildKaraokeSubtitleMarkup, normalizeKaraokeWordTimings, resolveActiveKaraokeWordIndex } = await import("../public/podcaster/podcaster-karaoke.js");
const { PodcasterPlaybackController } = await import("../public/podcaster/podcaster-playback-controller.js");

function createOverlay() {
  return {
    hidden: true,
    style: { display: "" },
    attributes: {},
    classList: {
      values: new Set(),
      add(...tokens) { tokens.forEach((token) => this.values.add(token)); },
      remove(...tokens) { tokens.forEach((token) => this.values.delete(token)); }
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    _html: "",
    _contentNode: null,
    set innerHTML(value) {
      this._html = String(value || "");
      const match = this._html.match(/<div class="([^"]*)" data-row-id="([^"]*)">([\s\S]*)<\/div>/);
      if (!match) {
        this._contentNode = null;
        return;
      }
      this._contentNode = {
        className: match[1],
        dataset: { rowId: match[2] },
        innerHTML: match[3],
        textContent: match[3].replace(/<[^>]+>/g, ""),
        style: {
          setProperty() {}
        }
      };
    },
    get innerHTML() {
      return this._html;
    },
    querySelector(selector) {
      if (selector === ".podcast-on-screen-text-content") return this._contentNode;
      return null;
    },
    parentElement: {
      clientWidth: 1280,
      clientHeight: 720
    }
  };
}

test("karaoke helper resolves the active word for current playback time", () => {
  const wordTimings = normalizeKaraokeWordTimings({
    wordTimings: [
      { text: "Hola", startMs: 0, endMs: 180 },
      { text: "mundo", startMs: 181, endMs: 420 }
    ]
  }, "Hola mundo");

  assert.equal(resolveActiveKaraokeWordIndex(wordTimings, 20), 0);
  assert.equal(resolveActiveKaraokeWordIndex(wordTimings, 260), 1);
  assert.equal(resolveActiveKaraokeWordIndex(wordTimings, 600), -1);
});

test("buildKaraokeSubtitleMarkup wraps each word and marks the active token", () => {
  const html = buildKaraokeSubtitleMarkup("Hola mundo", [
    { text: "Hola", startMs: 0, endMs: 180, tokenIndex: 0 },
    { text: "mundo", startMs: 181, endMs: 420, tokenIndex: 1 }
  ], 1);

  assert.match(html, /podcast-karaoke-word/);
  assert.match(html, /podcast-karaoke-word is-active[^>]*>mundo</);
});

test("syncOverlay renders karaoke spans when the selected row has word timings", () => {
  globalThis.window = globalThis.window || {};
  const controller = new PodcasterPlaybackController();
  const overlay = createOverlay();
  controller.els = {
    podcastOnScreenTextOverlay: overlay
  };
  controller.state.session = {
    script: {
      rows: [{ id: "row-1", onScreenText: "Hola mundo" }]
    }
  };
  controller.state.activeRowId = "row-1";
  controller.deps = {
    getActiveSession: () => controller.state.session,
    getPodcastVideoConfig: () => ({
      onScreenTextTrack: { enabled: true, showTrack: true },
      timelineOnScreenTextClipsByRowId: {
        "row-1": { rowId: "row-1", startMs: 0, trimInMs: 0, trimOutMs: 1000 }
      }
    }),
    normalizeOnScreenTextTrackSettings: (value) => value,
    ensureOnScreenTextClipsByRowId: () => ({
      "row-1": { rowId: "row-1", startMs: 0, trimInMs: 0, trimOutMs: 1000 }
    }),
    getOnScreenTextClipEffectiveDurationMs: () => 1000,
    getOnScreenTextClipText: (row) => row.onScreenText,
    getOnScreenTextLayoutForRow: () => ({ rowId: "row-1", widthPct: 0.58, heightPct: 0.14, xPct: 0.2, yPct: 0.7 }),
    resolveOnScreenTextPreviewLayoutSpec: () => ({
      presetClass: "is-style-3d",
      bgClass: "is-bg-glass",
      inlineStyle: "--pod-onscreen-text-x:20%;--pod-onscreen-text-y:70%;"
    }),
    buildOnScreenTextBubbleInlineStyle: () => "",
    getOnScreenTextStylePresetClass: () => "is-style-3d",
    getOnScreenTextBgPresetClass: () => "is-bg-glass",
    escapeHtml: (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
    podcastVideoState: { montageActive: false },
    resolveDialogueAudioForRow: () => ({
      rowId: "row-1",
      targetSpeechLine: "Hola mundo",
      wordTimings: [
        { text: "Hola", startMs: 0, endMs: 180, tokenIndex: 0 },
        { text: "mundo", startMs: 181, endMs: 420, tokenIndex: 1 }
      ]
    })
  };

  controller.syncOverlay(240, { rowId: "row-1", forceRow: true });

  assert.match(overlay.innerHTML, /podcast-karaoke-word/);
  assert.match(overlay.innerHTML, /podcast-karaoke-word is-active[^>]*>mundo</);
});

test("syncOverlay treats editor-preview local time as scene-local when the clip starts later in the timeline", () => {
  globalThis.window = globalThis.window || {};
  const controller = new PodcasterPlaybackController();
  const overlay = createOverlay();
  controller.els = {
    podcastOnScreenTextOverlay: overlay
  };
  controller.state.session = {
    script: {
      rows: [{ id: "row-2", onScreenText: "Hola mundo" }]
    }
  };
  controller.state.activeRowId = "row-2";
  controller.deps = {
    getActiveSession: () => controller.state.session,
    getPodcastVideoConfig: () => ({
      onScreenTextTrack: { enabled: true, showTrack: true },
      timelineOnScreenTextClipsByRowId: {
        "row-2": { rowId: "row-2", startMs: 30000, trimInMs: 0, trimOutMs: 1000 }
      }
    }),
    normalizeOnScreenTextTrackSettings: (value) => value,
    ensureOnScreenTextClipsByRowId: () => ({
      "row-2": { rowId: "row-2", startMs: 30000, trimInMs: 0, trimOutMs: 1000 }
    }),
    getOnScreenTextClipEffectiveDurationMs: () => 1000,
    getOnScreenTextClipText: (row) => row.onScreenText,
    getOnScreenTextLayoutForRow: () => ({ rowId: "row-2", widthPct: 0.58, heightPct: 0.14, xPct: 0.2, yPct: 0.7 }),
    resolveOnScreenTextPreviewLayoutSpec: () => ({
      presetClass: "is-style-3d",
      bgClass: "is-bg-glass",
      inlineStyle: "--pod-onscreen-text-x:20%;--pod-onscreen-text-y:70%;"
    }),
    buildOnScreenTextBubbleInlineStyle: () => "",
    getOnScreenTextStylePresetClass: () => "is-style-3d",
    getOnScreenTextBgPresetClass: () => "is-bg-glass",
    escapeHtml: (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
    podcastVideoState: { montageActive: false },
    resolveDialogueAudioForRow: () => ({
      rowId: "row-2",
      targetSpeechLine: "Hola mundo",
      wordTimings: [
        { text: "Hola", startMs: 0, endMs: 180, tokenIndex: 0 },
        { text: "mundo", startMs: 181, endMs: 420, tokenIndex: 1 }
      ]
    })
  };

  controller.syncOverlay(240, { rowId: "row-2", forceRow: true });

  assert.match(overlay.innerHTML, /podcast-karaoke-word is-active[^>]*>mundo</);
});

test("syncOverlay falls back to plain subtitle text when the audio clip lacks word timings", () => {
  globalThis.window = globalThis.window || {};
  const controller = new PodcasterPlaybackController();
  const overlay = createOverlay();
  controller.els = {
    podcastOnScreenTextOverlay: overlay
  };
  controller.state.session = {
    script: {
      rows: [{ id: "row-1", onScreenText: "Hola mundo" }]
    }
  };
  controller.state.activeRowId = "row-1";
  controller.deps = {
    getActiveSession: () => controller.state.session,
    getPodcastVideoConfig: () => ({
      onScreenTextTrack: { enabled: true, showTrack: true },
      timelineOnScreenTextClipsByRowId: {
        "row-1": { rowId: "row-1", startMs: 0, trimInMs: 0, trimOutMs: 1000 }
      }
    }),
    normalizeOnScreenTextTrackSettings: (value) => value,
    ensureOnScreenTextClipsByRowId: () => ({
      "row-1": { rowId: "row-1", startMs: 0, trimInMs: 0, trimOutMs: 1000 }
    }),
    getOnScreenTextClipEffectiveDurationMs: () => 1000,
    getOnScreenTextClipText: (row) => row.onScreenText,
    getOnScreenTextLayoutForRow: () => ({ rowId: "row-1", widthPct: 0.58, heightPct: 0.14, xPct: 0.2, yPct: 0.7 }),
    resolveOnScreenTextPreviewLayoutSpec: () => ({
      presetClass: "is-style-3d",
      bgClass: "is-bg-glass",
      inlineStyle: "--pod-onscreen-text-x:20%;--pod-onscreen-text-y:70%;"
    }),
    buildOnScreenTextBubbleInlineStyle: () => "",
    getOnScreenTextStylePresetClass: () => "is-style-3d",
    getOnScreenTextBgPresetClass: () => "is-bg-glass",
    escapeHtml: (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
    podcastVideoState: { montageActive: false },
    resolveDialogueAudioForRow: () => ({
      rowId: "row-1",
      targetSpeechLine: "Hola mundo"
    })
  };

  controller.syncOverlay(240, { rowId: "row-1", forceRow: true });

  assert.doesNotMatch(overlay.innerHTML, /podcast-karaoke-word/);
  assert.match(overlay.innerHTML, />Hola mundo</);
});
