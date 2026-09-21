import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window ||= { location: { origin: 'http://localhost', href: 'http://localhost/podcaster.html' } };
globalThis.HTMLMediaElement ||= { HAVE_CURRENT_DATA: 2 };
const { PodcasterPlaybackController } = await import('../public/podcaster/podcaster-playback-controller.js');

test('concurrent hydration shares IndexedDB lookup and the same object URL', async () => {
  const c = new PodcasterPlaybackController();
  let finish; let reads = 0;
  c.loadMediaSource = async () => { reads++; return new Promise(resolve => { finish = resolve; }); };
  const a = c.getBlobUrl('https://example.test/video.mp4', { persistent: true });
  const b = c.getBlobUrl('https://example.test/video.mp4', { persistent: true });
  assert.equal(a, b);
  assert.equal(reads, 1);
  finish('blob:shared');
  assert.deepEqual(await Promise.all([a, b]), ['blob:shared', 'blob:shared']);
});

test('dragging the playhead updates the cursor without global preparation or media sync', async () => {
  const c = new PodcasterPlaybackController();
  c.state.session = { id: 'seek-cache' };
  c.state.totalDurationMs = 90000;
  c.getEntryAtMs = () => null;
  c.syncOverlay = () => {};
  c.syncStylizedText = () => {};
  c.syncOverlayCards = () => {};
  c.prewarmTimelineStageVideos = () => assert.fail('seek must not prewarm all videos');
  c.prepareSessionMedia = () => assert.fail('seek must not prepare all media');
  c.syncVideo = async () => assert.fail('dragging must defer video preparation until release');
  for (const ms of [1, 1000, 23917, 85000, 4000]) {
    await c.seek(ms, { deferPreview: true, navigationOnly: true });
    assert.equal(c.state.currentMs, ms);
  }
  let synced;
  c.syncVideo = async ms => { synced = ms; };
  await c.seek(4000, { deferPreview: false, navigationOnly: true });
  assert.equal(synced, 4000);
});

test('an audio boundary waits for the previous video tick to release the slot', async () => {
  const c = new PodcasterPlaybackController();
  c.state.isPlaying = true;
  c.state.session = { id: 'boundary' };
  let finish; let started = false;
  c.tickCompletionPromise = new Promise(resolve => { finish = resolve; });
  c.pauseMediaForStageBuffering = () => {};
  c.getEntryAtMs = () => ({ rowId: 'first' });
  c.syncAudio = async ms => { assert.equal(ms, 1590); started = true; };
  c.syncStageSwitching = async () => true;
  c.startClock = () => {};
  c.syncStageMediaMotionPlaybackState = () => {};
  const pending = c.startMediaAtBoundary(1590);
  await Promise.resolve();
  assert.equal(started, false);
  finish();
  await pending;
  assert.equal(started, true);
  assert.equal(c.state.isBuffering, false);
});

test('canplay during an audio boundary cannot start a second recovery', async () => {
  const c = new PodcasterPlaybackController();
  c.state.isPlaying = true;
  c.state.isBuffering = true;
  c.state.bufferOwner = 'audio-boundary';
  c.syncAudio = () => assert.fail('the boundary owns audio start');
  c.syncStageSwitching = () => assert.fail('canplay must not claim the video slot');
  assert.equal(await c.resumeStageAfterShortBuffer({}), false);
});

test('a previous frame callback during seek does not reject a loaded video', async () => {
  const c = new PodcasterPlaybackController();
  const v = new EventTarget();
  Object.assign(v, { seeking: true, readyState: 4, dataset: { src: 'video', mediaSourceGeneration: '0' } });
  let frame;
  v.requestVideoFrameCallback = callback => { frame = callback; return 1; };
  v.cancelVideoFrameCallback = () => {};
  const pending = c.waitForStageVideoFrame(v, 'video', 1000);
  let settled = false;
  pending.then(() => { settled = true; });
  frame();
  await Promise.resolve();
  assert.equal(settled, false);
  v.seeking = false;
  v.dispatchEvent(new Event('seeked'));
  assert.equal(await pending, true);
});

test('preload and playback share a single in-flight preparation of the same surface', async () => {
  const c = new PodcasterPlaybackController();
  const v = {};
  let finish; let loads = 0;
  c.prepareStageVideoSourceElement = async () => { loads++; return new Promise(resolve => { finish = resolve; }); };
  const a = c.setStageVideoSourceForElement(v, 'video', { entryKey: 'scene-4', keepHidden: true });
  const b = c.setStageVideoSourceForElement(v, 'video', { entryKey: 'scene-4' });
  assert.equal(a, b);
  assert.equal(loads, 1);
  finish(true);
  assert.equal(await b, true);
});

test('a prepared voice starts at its arbitrary boundary without stopping video, music or clock', async () => {
  const c = new PodcasterPlaybackController();
  c.state.isPlaying = true;
  c.state.currentMs = 16145;
  const revision = c.playheadRevision;
  c.pauseMediaForStageBuffering = () => assert.fail('prepared media must continue');
  c.startClock = () => assert.fail('the existing clock must continue');
  c.syncStageSwitching = () => assert.fail('a voice start must not claim the stage');
  c.syncAudio = async ms => assert.equal(ms, 16132);
  await c.startMediaAtBoundary(16132, { prepared: true });
  assert.equal(c.state.currentMs, 16145);
  assert.equal(c.playheadRevision, revision);
  assert.equal(c.state.isBuffering, false);
});

test('a queued tick cannot move a playing clock backwards but an explicit seek can', async () => {
  const c = new PodcasterPlaybackController();
  c.state.isPlaying = true;
  c.state.currentMs = 24070;
  c.getEntryAtMs = () => null;
  c.ensureDialogueReadyAtMs = async () => {};
  c.syncAudio = async () => {};
  c.syncVideo = async () => {};
  c.syncOverlay = c.syncStylizedText = c.syncOverlayCards = () => {};
  await c.tick(24001);
  assert.equal(c.state.currentMs, 24070);
  await c.tick(5500, { explicitSeek: true });
  assert.equal(c.state.currentMs, 5500);
});

test('queued waiting on a recovered or intentionally paused video never interrupts playback', () => {
  const c = new PodcasterPlaybackController();
  c.state.isPlaying = true;
  c.pauseMediaForStageBuffering = () => assert.fail('no underrun exists');
  assert.equal(c.scheduleStageBufferRecovery({ readyState: 4, paused: false }), false);
  assert.equal(c.scheduleStageBufferRecovery({ readyState: 1, paused: true }), false);
  assert.equal(c.scheduleStageBufferRecovery({ readyState: 2, paused: false, ended: true }), false);
});

test('scene layout is reused until visual settings, surface, seek or size changes', () => {
  const previousObserver = globalThis.ResizeObserver;
  let onResize;
  globalThis.ResizeObserver = class { constructor(callback) { onResize = callback; } observe() {} };
  try {
    const c = new PodcasterPlaybackController();
    const container = {};
    let calls = 0;
    c.resolveStageMediaScaleContainer = () => container;
    c.deps = { applySceneMediaScaleToStage: () => { calls++; } };
    c.state.isPlaying = true;
    const entry = { rowId: 'a', startMs: 0, endMs: 8000, clip: { mediaScale: 1 } };
    for (let time = 0; time < 4000; time += 16) { c.state.currentMs = time; c.applySceneMediaScale(entry); }
    assert.equal(calls, 1);
    c.applySceneMediaScale({ ...entry, clip: { mediaScale: 1.5 } });
    assert.equal(calls, 2);
    onResize();
    c.applySceneMediaScale({ ...entry, clip: { mediaScale: 1.5 } });
    assert.equal(calls, 3);
    c.sceneMotionSyncRevision = 1;
    c.applySceneMediaScale({ ...entry, clip: { mediaScale: 1.5 } });
    assert.equal(calls, 4);
    c.stageMachine.activeSlot = 1;
    c.applySceneMediaScale({ ...entry, clip: { mediaScale: 1.5 } });
    assert.equal(calls, 5);
  } finally { globalThis.ResizeObserver = previousObserver; }
});

test('scene inspector work happens after the new video starts', async () => {
  const c = new PodcasterPlaybackController();
  c.state.session = { id: 'scene-cut' };
  c.state.isPlaying = true;
  const events = [];
  let release;
  c.getEntryAtMs = () => ({ rowId: 'next' });
  c.deps = { syncPodcastStudioRuntimeUi: () => events.push('inspector') };
  c.ensureDialogueReadyAtMs = async () => {};
  c.syncAudio = async () => {};
  c.syncOverlay = c.syncStylizedText = c.syncOverlayCards = () => {};
  c.syncVideo = async () => { events.push('prepare'); await new Promise(resolve => { release = resolve; }); events.push('playing'); };
  const tick = c.tick(8000);
  await Promise.resolve();
  assert.deepEqual(events, ['prepare']);
  release();
  await tick;
  assert.deepEqual(events, ['prepare', 'playing', 'inspector']);
});
