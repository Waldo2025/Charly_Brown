import test from "node:test";
import assert from "node:assert/strict";

import { createPodcasterPanelMusicApi } from "../public/podcaster/podcaster-panel-music.js";

class FakeAudio {
  constructor(src = "") {
    this.src = src;
    this.paused = true;
    this.volume = 1;
    this.crossOrigin = "";
    this.loop = false;
    this.onended = null;
    this.onerror = null;
  }

  async play() {
    this.paused = false;
  }

  pause() {
    this.paused = true;
  }
}

function readRenderedTrackNames(listEl) {
  return Array.from(String(listEl.innerHTML || "").matchAll(/<strong>([^<]+)<\/strong>/g), (match) => match[1]);
}

test("moves the active global music track to the top without mutating library order", async () => {
  const originalAudio = globalThis.Audio;
  globalThis.Audio = FakeAudio;

  try {
    const globalListEl = { innerHTML: "" };
    const api = createPodcasterPanelMusicApi({
      getElements: () => ({ panelMusicGlobalLibraryList: globalListEl }),
      getPodcastVideoConfig: () => ({}),
      resolveStorageAudioUrl: (downloadUrl) => downloadUrl,
      escapeHtml: (value) => String(value ?? "")
    });
    const libraryItems = [
      { libraryId: "a", name: "A", downloadUrl: "https://example.test/a.mp3", durationSec: 10 },
      { libraryId: "b", name: "B", downloadUrl: "https://example.test/b.mp3", durationSec: 20 },
      { libraryId: "c", name: "C", downloadUrl: "https://example.test/c.mp3", durationSec: 30 }
    ];

    api.panelMusicGlobalLibraryState.items = libraryItems;
    api.syncMusicControls();
    assert.deepEqual(readRenderedTrackNames(globalListEl), ["A", "B", "C"]);

    await api.togglePanelMusicTrackPreview(libraryItems[2], "global-c");
    assert.deepEqual(readRenderedTrackNames(globalListEl), ["C", "A", "B"]);
    assert.strictEqual(api.panelMusicGlobalLibraryState.items, libraryItems);
    assert.deepEqual(api.panelMusicGlobalLibraryState.items.map((track) => track.libraryId), ["a", "b", "c"]);

    await api.togglePanelMusicTrackPreview(libraryItems[2], "global-c");
    assert.deepEqual(readRenderedTrackNames(globalListEl), ["A", "B", "C"]);
    assert.strictEqual(api.panelMusicGlobalLibraryState.items, libraryItems);
    assert.deepEqual(api.panelMusicGlobalLibraryState.items.map((track) => track.libraryId), ["a", "b", "c"]);

    api.panelMusicState.sourceType = "track";
    api.panelMusicState.track = libraryItems[1];
    await api.startPanelMusic();
    assert.deepEqual(readRenderedTrackNames(globalListEl), ["B", "A", "C"]);
    assert.deepEqual(api.panelMusicGlobalLibraryState.items.map((track) => track.libraryId), ["a", "b", "c"]);

    api.stopPanelMusic();
    assert.deepEqual(readRenderedTrackNames(globalListEl), ["A", "B", "C"]);
  } finally {
    if (originalAudio === undefined) {
      delete globalThis.Audio;
    } else {
      globalThis.Audio = originalAudio;
    }
  }
});
