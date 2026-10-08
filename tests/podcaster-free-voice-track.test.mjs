import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { appendFreeVoiceClip, freeVoiceExportSegments, normalizeFreeVoiceTrack, splitFreeVoiceClip, splitFreeVoiceClipAtSilences } from '../public/podcaster/podcaster-free-voice-track.js';

const media = (name, path) => ({ name, storagePath: path, downloadUrl: `https://example.test/${name}.mp3`, mimeType: 'audio/mpeg' });

test('uploaded free voices append after the previous clip without a scene anchor', () => {
  assert.equal(normalizeFreeVoiceTrack().added, false);
  const first = appendFreeVoiceClip({}, media('one', 'session/audio/one.mp3'), 3000, 'voice-1');
  const second = appendFreeVoiceClip(first, media('two', 'session/audio/two.mp3'), 2500, 'voice-2');
  assert.equal(second.clips[0].startMs, 0);
  assert.equal(second.clips[1].startMs, 3000);
  assert.equal(second.clips[1].rowId, undefined);
  assert.equal(second.clips[1].storagePath, 'session/audio/two.mp3');
  assert.equal(second.added, true);
});

test('saved voice positions and trims survive normalization and reach export', () => {
  const saved = normalizeFreeVoiceTrack({ enabled: true, volumePct: 75, clips: [{
    id: 'voice-1', name: 'Narración', storagePath: 'session/audio/voice.mp3',
    sourceDurationMs: 10000, startMs: 8300, trimInMs: 1200, trimOutMs: 6900
  }] });
  const [exported] = freeVoiceExportSegments(saved);
  assert.deepEqual({ startMs: exported.startMs, durationMs: exported.durationMs, trimInMs: exported.trimInMs, trimOutMs: exported.trimOutMs },
    { startMs: 8300, durationMs: 5700, trimInMs: 1200, trimOutMs: 6900 });
  assert.equal(exported.storagePath, 'session/audio/voice.mp3');
  assert.equal(exported.volumePct, 75);
  assert.equal(exported.kind, 'free-voice');
});

test('blade cuts one stored source into independently movable word fragments', () => {
  const original = appendFreeVoiceClip({}, media('speech', 'session/audio/speech.mp3'), 4000, 'original');
  const firstCut = splitFreeVoiceClip(original, 'original', 1250, 'middle');
  const secondCut = splitFreeVoiceClip(firstCut, 'middle', 380, 'last');
  assert.equal(secondCut.clips.length, 3);
  assert.deepEqual(secondCut.clips.map(({ startMs, trimInMs, trimOutMs }) => ({ startMs, trimInMs, trimOutMs })), [
    { startMs: 0, trimInMs: 0, trimOutMs: 1250 },
    { startMs: 1250, trimInMs: 1250, trimOutMs: 1630 },
    { startMs: 1630, trimInMs: 1630, trimOutMs: 4000 }
  ]);
  assert.equal(new Set(secondCut.clips.map((clip) => clip.storagePath)).size, 1);
  const moved = normalizeFreeVoiceTrack({ ...secondCut, clips: secondCut.clips.map((clip) => clip.id === 'middle'
    ? { ...clip, startMs: 5500 } : clip) });
  const kept = normalizeFreeVoiceTrack({ ...moved, clips: moved.clips.filter((clip) => clip.id !== 'last') });
  assert.deepEqual(freeVoiceExportSegments(kept).map(({ id, startMs, durationMs, trimInMs }) => ({ id, startMs, durationMs, trimInMs })), [
    { id: 'original', startMs: 0, durationMs: 1250, trimInMs: 0 },
    { id: 'middle', startMs: 5500, durationMs: 380, trimInMs: 1250 }
  ]);
});

test('blade ignores cuts too close to either edge', () => {
  const original = appendFreeVoiceClip({}, media('word', 'session/audio/word.mp3'), 300, 'word');
  assert.equal(splitFreeVoiceClip(original, 'word', 50, 'bad-left').clips.length, 1);
  assert.equal(splitFreeVoiceClip(original, 'word', 250, 'bad-right').clips.length, 1);
  assert.equal(splitFreeVoiceClip(original, 'word', 100, 'right').clips.length, 2);
});

test('split fragments store shared waveform and silence analysis once per source', () => {
  const original = normalizeFreeVoiceTrack({ clips: [{
    id: 'source', storagePath: 'session/audio/source.mp3', sourceDurationMs: 4000,
    trimInMs: 0, trimOutMs: 4000, waveform: [10, 80, 20], waveformAnalyzed: true,
    waveformVersion: 3, phraseRanges: [[0, 1000], [1200, 1900], [2100, 3000], [3200, 4000]]
  }] });
  const sliced = splitFreeVoiceClip(original, 'source', 2000, 'right');
  assert.equal(sliced.clips[0].waveform.length, 3);
  assert.equal(sliced.clips[1].waveform.length, 0);
  assert.equal(sliced.clips[1].phraseRanges.length, 0);
  const phrases = splitFreeVoiceClipAtSilences(sliced, 'right', () => 'last');
  assert.equal(phrases.track.clips.length, 3);
  assert.deepEqual(phrases.track.clips.map((clip) => clip.waveform.length), [3, 0, 0]);
  assert.equal(phrases.track.clips.reduce((sum, clip) => sum + clip.phraseRanges.length, 0), 4);
});

test('local audio clips without storagePath survive normalization and get local fallback path', () => {
  const localClip = {
    id: 'local-voice-1',
    name: 'audio_grabado.mp3',
    downloadUrl: 'blob:http://localhost:3000/1234-5678',
    mimeType: 'audio/mpeg',
    sourceDurationMs: 4500,
    startMs: 0,
    trimInMs: 0,
    trimOutMs: 4500
  };
  const normalized = normalizeFreeVoiceTrack({ added: true, clips: [localClip] });
  assert.equal(normalized.added, true);
  assert.equal(normalized.clips.length, 1);
  assert.equal(normalized.clips[0].id, 'local-voice-1');
  assert.equal(normalized.clips[0].downloadUrl, 'blob:http://localhost:3000/1234-5678');
  assert.equal(normalized.clips[0].storagePath, 'local://free-voice/local-voice-1');
});

test('free voice can be disabled from the track menu without waveform hydration', async () => {
  const [timeline, editor, css] = await Promise.all([
    readFile(new URL('../public/podcaster/podcaster-timeline-ui.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/podcaster/podcaster-free-voice-editor.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/podcaster.css', import.meta.url), 'utf8')
  ]);
  assert.match(timeline, /data-action="free-voice-toggle-track-enabled"/);
  assert.match(editor, /if \(!track\.enabled\) return;/);
  assert.match(editor, /free-voice-toggle-track-enabled/);
  assert.match(css, /podcast-free-voice-chip\.is-track-disabled[\s\S]*?background: transparent !important/);
});

test('track label menu calls the Gemini and free voice state toggles directly', async () => {
  const [podcaster, editor] = await Promise.all([
    readFile(new URL('../public/podcaster/podcaster.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/podcaster/podcaster-free-voice-editor.js', import.meta.url), 'utf8')
  ]);
  assert.match(podcaster, /action === "timeline-toggle-gemini-track-enabled"\)\s*\{\s*toggleGeminiDialogueTrackEnabled\(\);/);
  assert.match(podcaster, /action === "free-voice-toggle-track-enabled"\)[\s\S]*?toggleFreeVoice\(\)/);
  assert.match(editor, /timeline\.podcasterToggleFreeVoiceTrackEnabled = toggleFreeVoiceTrackEnabled/);
  assert.match(editor, /deps\.syncMontageSceneMixModalInputs\?\.\("freeVoiceTrackEnabled"\)/);
});

test('open track menu survives timeline replacement and track toggles avoid a full structure render', async () => {
  const [podcaster, editor] = await Promise.all([
    readFile(new URL('../public/podcaster/podcaster.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/podcaster/podcaster-free-voice-editor.js', import.meta.url), 'utf8')
  ]);
  assert.match(podcaster, /if \(menu\.classList\.contains\("is-open"\)\) return;[\s\S]*?menu\.remove\(\);/);
  assert.match(podcaster, /syncPodcastAudioTrackToggleUi\("timeline-toggle-gemini-track-enabled", enabled\)/);
  assert.match(editor, /if \(reason === "free-voice-toggle-track-enabled"\)[\s\S]*?syncAudioTrackToggleUi\?\.\(/);
  assert.match(editor, /else \{\s*renderPodcastVideoTimeline\(refreshedSession, \{ force: true, forceStructure: true \}\);/);
});
