import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPodcasterPanelMusicApi } from "../public/podcaster/podcaster-panel-music.js";
import { buildCloudSessionPayload, compactCloudSessionPayload } from "../public/podcaster/podcaster-session-payload.js";

const appJs = readFileSync(new URL("../public/schroeder-sound-lab/app.js", import.meta.url), "utf8");
const sessionsJs = readFileSync(new URL("../public/schroeder-sound-lab/sessions.js", import.meta.url), "utf8");
const backendServerJs = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const aiJobsJs = readFileSync(new URL("../functions/src/ai-jobs.js", import.meta.url), "utf8");

const memoryStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
  setItem: (k, v) => memoryStore.set(k, String(v)),
  removeItem: (k) => memoryStore.delete(k)
};

test("Schroeder Sound Lab genera y envía metadatos completos y durationSec a Podcaster", () => {
  // En app.js se asegura la metadata antes de enviar a Podcaster
  assert.match(appJs, /ensureTrackMetadata/);
  assert.match(appJs, /resolveAudioDurationFromUrl/);
  assert.match(appJs, /ensureLibraryItemDurations/);
  assert.match(appJs, /await ensureTrackMetadata\(item\)/);

  // En sessions.js se envían durationSec, mimeType, size, model, prompt, bpm, key, genre
  assert.match(sessionsJs, /durationSec:\s*Number\(item\.durationSec/);
  assert.match(sessionsJs, /model:\s*item\.model/);
  assert.match(sessionsJs, /prompt:\s*item\.prompt/);
  assert.match(sessionsJs, /genre:\s*item\.genre/);

  // En backend/server.js y ai-jobs.js se guarda en podcaster_music_library con durationSec y trimOutMs
  assert.match(backendServerJs, /schroederTrackFromStorage[\s\S]*?durationSec:\s*Math\.max\(0,\s*Number\(custom\.durationSec/);
  assert.match(backendServerJs, /\/api\/schroeder\/library\/add-to-podcaster[\s\S]*?trimOutMs:\s*Math\.round\(durationSec\s*\*\s*1000\)/);
  assert.match(aiJobsJs, /soundLabTrack[\s\S]*?durationSec:\s*Math\.max\(0,\s*Number\(custom\.durationSec/);
  assert.match(aiJobsJs, /\/api\/schroeder\/library\/add-to-podcaster[\s\S]*?trimOutMs:\s*Math\.round\(durationSec\s*\*\s*1000\)/);
});

test("Podcaster asigna duración y añade canción transferida de Schroeder al track de timeline", () => {
  const globalListEl = { innerHTML: "" };
  let timelineRendered = false;

  const mockSession = {
    id: "session_test_1",
    timeline: {
      entries: [
        { id: "e1", startMs: 0, endMs: 5000, durationMs: 5000 }
      ]
    },
    panelMusicConfig: {}
  };

  const api = createPodcasterPanelMusicApi({
    getElements: () => ({ panelMusicGlobalLibraryList: globalListEl }),
    getActiveSession: () => mockSession,
    upsertActiveSession: (updater) => {
      const updated = updater(mockSession);
      Object.assign(mockSession, updated);
      return updated;
    },
    getPodcastVideoConfig: () => ({}),
    renderPodcastVideoTimeline: () => {
      timelineRendered = true;
    },
    resolveStorageAudioUrl: (downloadUrl) => downloadUrl,
    escapeHtml: (value) => String(value ?? "")
  });

  // Simular canción llegada desde Schroeder Sound Lab con durationSec de 120s
  const schroederTrack = {
    libraryId: "schroeder-user1-audio1",
    name: "Balada Schroeder",
    mimeType: "audio/mpeg",
    size: 2880000,
    durationSec: 120,
    downloadUrl: "https://example.test/schroeder.mp3",
    storagePath: "podcaster/library/music/schroeder-user1-audio1.mp3"
  };

  const added = api.addGlobalMusicTrackToSession(schroederTrack);
  assert.strictEqual(added, true);
  assert.strictEqual(timelineRendered, true);

  // Verificar que la canción está en uploadedTracks y su duración es 120s
  const uploaded = api.getPanelMusicUploadedTracks();
  assert.strictEqual(uploaded.length, 1);
  assert.strictEqual(uploaded[0].libraryId, "schroeder-user1-audio1");
  assert.strictEqual(uploaded[0].durationSec, 120);
  assert.strictEqual(uploaded[0].trimOutMs, 120000);

  // Verificar que getPanelMusicTrackDurationSec retorna 120
  const duration = api.getPanelMusicTrackDurationSec(uploaded[0]);
  assert.strictEqual(duration, 120);

  // Verificar que buildUploadedPanelMusicSegments genera segmentos para el timeline
  const segments = api.buildUploadedPanelMusicSegments(mockSession);
  assert.ok(segments.length > 0, "Debe generar segmentos para el timeline");
  assert.strictEqual(segments[0].durationSec, 120);
  assert.strictEqual(segments[0].slotLabel, "Audio 1");
});

test("Podcaster estima duración por tamaño cuando un track de biblioteca global no trae durationSec", () => {
  memoryStore.clear();
  const globalListEl = { innerHTML: "" };
  const mockSession = {
    id: "session_test_2",
    timeline: { entries: [{ id: "e1", startMs: 0, endMs: 4000, durationMs: 4000 }] },
    panelMusicConfig: {}
  };

  const api = createPodcasterPanelMusicApi({
    getElements: () => ({ panelMusicGlobalLibraryList: globalListEl }),
    getActiveSession: () => mockSession,
    upsertActiveSession: (updater) => updater(mockSession),
    getPodcastVideoConfig: () => ({}),
    renderPodcastVideoTimeline: () => {},
    resolveStorageAudioUrl: (downloadUrl) => downloadUrl,
    escapeHtml: (value) => String(value ?? "")
  });

  // Track MP3 sin durationSec pero con tamaño (~192 kbps: 2.4 MB = ~100s)
  const legacyTrack = {
    libraryId: "legacy-schroeder-track",
    name: "Canción Antigua",
    mimeType: "audio/mpeg",
    size: 2400000,
    durationSec: 0,
    downloadUrl: "https://example.test/legacy.mp3"
  };

  const estimatedDuration = api.getPanelMusicTrackDurationSec(legacyTrack);
  assert.ok(estimatedDuration > 50, "Debe estimar duración a partir del tamaño");

  api.addGlobalMusicTrackToSession(legacyTrack);
  const uploaded = api.getPanelMusicUploadedTracks();
  assert.strictEqual(uploaded.length, 1);
  assert.ok(uploaded[0].durationSec > 0, "durationSec debe ser mayor a 0 para no filtrarse del timeline");
  assert.ok(uploaded[0].trimOutMs > 0, "trimOutMs debe ser mayor a 0");

  const segments = api.buildUploadedPanelMusicSegments(mockSession);
  assert.ok(segments.length > 0, "Los segmentos del timeline no deben estar vacíos");
});

test("Snoopy guarda y rehidrata la canción Lyria como pista de biblioteca seleccionada", () => {
  memoryStore.clear();
  let session = {
    id: "session_snoopy_music",
    title: "Proyecto Snoopy",
    script: { rows: [] },
    timeline: { entries: [{ id: "scene", startMs: 0, endMs: 5000, durationMs: 5000 }] },
    panelMusicConfig: {}
  };
  let localPersists = 0;
  const deps = {
    getActiveSession: () => session,
    upsertActiveSession: (updater) => { session = updater(session); return session; },
    scheduleSessionLocalPersist: () => { localPersists += 1; },
    getPodcastVideoConfig: () => ({}),
    renderPodcastVideoTimeline: () => {},
    resolveStorageAudioUrl: (url) => url
  };
  const api = createPodcasterPanelMusicApi(deps);
  const source = (id) => ({
    libraryId: `schroeder-${id}`,
    name: `Canción ${id}`,
    model: "lyria-3.5",
    prompt: "Música botánica con bambú",
    mimeType: "audio/mpeg",
    size: 2880000,
    durationSec: 120,
    downloadUrl: `https://example.test/${id}.mp3`,
    storagePath: `podcaster/library/music/schroeder-${id}.mp3`
  });
  assert.equal(api.addGlobalMusicTrackToSession(source("uno")), true);
  assert.equal(api.addGlobalMusicTrackToSession(source("dos")), true);
  assert.equal(localPersists, 2);
  assert.equal(api.panelMusicState.track.libraryId, "schroeder-dos");

  const cloudPayload = buildCloudSessionPayload(session, api.panelMusicState, [], {
    getPanelMusicUploadedTracks: api.getPanelMusicUploadedTracks,
    resolvePanelMusicTrackKind: api.resolvePanelMusicTrackKind,
    normalizePanelMusicLoopSettings: api.normalizePanelMusicLoopSettings,
    normalizePanelMusicMutedLoopIndexes: api.normalizePanelMusicMutedLoopIndexes
  });
  const saved = JSON.parse(JSON.stringify(compactCloudSessionPayload(cloudPayload).payload));
  assert.equal(saved.panelMusicConfig.trackLibrary.uploadedTracks.length, 2);
  assert.equal(saved.panelMusicConfig.trackLibrary.uploadedTracks[1].model, "lyria-3.5");
  assert.equal(saved.panelMusicConfig.trackLibrary.uploadedTracks[1].storagePath, source("dos").storagePath);

  session = saved;
  const reloaded = createPodcasterPanelMusicApi(deps);
  reloaded.syncPanelMusicStateFromSession(session);
  assert.equal(reloaded.panelMusicState.selectedTrackKind, "uploaded");
  assert.equal(reloaded.panelMusicState.track.libraryId, "schroeder-dos");
  assert.deepEqual(reloaded.getAvailablePanelMusicTrackKinds(), ["uploaded"]);
  assert.equal(reloaded.getPanelMusicUploadedTracks().length, 2);
  assert.equal(reloaded.buildUploadedPanelMusicSegments(session).length > 0, true);

  const legacySaved = JSON.parse(JSON.stringify(saved));
  legacySaved.panelMusicConfig.selectedTrackKind = "ai";
  legacySaved.panelMusicConfig.trackLibrary.ai = legacySaved.panelMusicConfig.track;
  const repaired = createPodcasterPanelMusicApi(deps);
  repaired.syncPanelMusicStateFromSession(legacySaved);
  assert.equal(repaired.panelMusicState.selectedTrackKind, "uploaded");
  assert.deepEqual(repaired.getAvailablePanelMusicTrackKinds(), ["uploaded"]);
});
