import test from "node:test";
import assert from "node:assert/strict";
import { createPodcasterSceneSelectionApi } from "../public/podcaster/podcaster-scene-selection.js";

test("pointerdown plus click selects a scene only once", () => {
  const state = { activeRowId: "row-1", timelineLastInteractedRowId: "" };
  const session = { script: { rows: [{ id: "row-1", speaker: "A" }, { id: "row-2", speaker: "B" }] } };
  let inspectorSyncs = 0;
  let uiStateWrites = 0;
  let speakerSyncs = 0;
  const api = createPodcasterSceneSelectionApi({
    els: {},
    podcastVideoState: state,
    getActiveSession: () => session,
    getTransitionTimelineRowOrder: () => ["row-1", "row-2"],
    renderPodcastVideoTimeline() {},
    syncPodcastStudioInspector() { inspectorSyncs += 1; },
    syncPodcastTimelineSelectionUi() {},
    syncPodcastTimelinePlayhead() {},
    syncPodcastSceneZoomControls() {},
    ensureTimelineClipsByRowId: () => ({}),
    syncPodcastVideoStageMedia() {},
    syncPodcastOnScreenTextOverlay() {},
    resolveTargetVideoRowId: () => "row-1",
    setPodcastVideoSpeaker() { speakerSyncs += 1; },
    upsertPodcastStudioUiState() { uiStateWrites += 1; }
  });

  api.selectTimelineSceneRow("row-2", { syncStage: false });
  api.selectTimelineSceneRow("row-2", { syncStage: false });

  assert.equal(state.activeRowId, "row-2");
  assert.equal(inspectorSyncs, 1);
  assert.equal(uiStateWrites, 1);
  assert.equal(speakerSyncs, 1);
});
