const fs = require('fs');
const podcasterTimelineModel = fs.readFileSync('public/podcaster/podcaster-timeline-model.js', 'utf8');

// Mock environment
global.window = global;
global.STUDIO_TIMELINE_MIN_CLIP_MS = 500;
global.STUDIO_TIMELINE_SNAP_MS = 25;
global.STUDIO_TIMELINE_VERSION = 1;
global.STUDIO_TIMELINE_TRACK_VERSION = 1;

global.getActiveSession = () => ({
  id: "test",
  rows: [
    { id: "row1" },
    { id: "row2" }
  ],
  podcastVideoConfig: {
    timelineClipsByRowId: {
      "row1": { rowId: "row1", startMs: 0, trimInMs: 0, trimOutMs: 8000, sourceDurationMs: 8000 },
      "row2": { rowId: "row2", startMs: 0, trimInMs: 0, trimOutMs: 8000, sourceDurationMs: 8000 }
    }
  }
});
global.getSessionRows = (s) => s.rows;
global.getPodcastVideoConfig = (s) => s.podcastVideoConfig;
global.getRowSourceDurationMs = () => 8000;
global.buildEducationalSceneTrackIdRemap = () => ({});
global.normalizeTimelineTracks = () => [];
global.ensureTimelineTracks = () => [];
global.resolveTimelineDefaultTrackIdForSpeaker = () => "track1";

eval(podcasterTimelineModel);

const session = getActiveSession();
console.log("hasValid:", hasValidPersistedSceneTimelineMap(session));
console.log("shouldRepair:", shouldAutoRepairTimelineLayout(session));

