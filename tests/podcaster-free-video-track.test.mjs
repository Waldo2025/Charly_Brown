import assert from 'node:assert/strict';
import test from 'node:test';
import { appendFreeVideoClip, freeVideoExportAudioSegments, freeVideoExportEntries, normalizeFreeVideoTrack } from '../public/podcaster/podcaster-free-video-track.js';

const media = (name, storagePath) => ({ name, storagePath, downloadUrl: `https://example.test/${name}.mp4`, mimeType: 'video/mp4' });

test('independent video track starts hidden and appends clips to the right', () => {
  assert.equal(normalizeFreeVideoTrack().added, false);
  const first = appendFreeVideoClip({}, media('one', 'sessions/one.mp4'), 3000, 'one');
  const second = appendFreeVideoClip(first, media('two', 'sessions/two.mp4'), 2200, 'two');
  assert.equal(second.added, true);
  assert.equal(second.clips[0].startMs, 0);
  assert.equal(second.clips[1].startMs, 3000);
  assert.equal(second.clips[1].rowId, undefined);
});

test('trim, position and motion survive hydration and reach export as visual-only overlay', () => {
  const track = normalizeFreeVideoTrack({ clips: [{ id: 'one', name: 'Toma', storagePath: 'sessions/one.mp4',
    sourceDurationMs: 8000, startMs: 9200, trimInMs: 1000, trimOutMs: 6000,
    mediaMotionPreset: 'pan-left-right' }] });
  const [entry] = freeVideoExportEntries(track);
  assert.equal(entry.timelineStartMs, 9200);
  assert.equal(entry.timelineEndMs, 14200);
  assert.equal(entry.trimInMs, 1000);
  assert.equal(entry.mediaMotionPreset, 'pan-left-right');
  assert.equal(entry.freeVideoOverlay, true);
  assert.equal(entry.useNativeVideoAudio, false);
  assert.equal(entry.audio, null);
});

test('local video clips without storagePath survive normalization and get local fallback path', () => {
  const localClip = {
    id: 'local-video-1',
    name: 'video_captura.mp4',
    downloadUrl: 'blob:http://localhost:3000/abcd-efgh',
    mimeType: 'video/mp4',
    sourceDurationMs: 6000,
    startMs: 1000,
    trimInMs: 0,
    trimOutMs: 6000
  };
  const normalized = normalizeFreeVideoTrack({ added: true, clips: [localClip] });
  assert.equal(normalized.added, true);
  assert.equal(normalized.clips.length, 1);
  assert.equal(normalized.clips[0].id, 'local-video-1');
  assert.equal(normalized.clips[0].downloadUrl, 'blob:http://localhost:3000/abcd-efgh');
  assert.equal(normalized.clips[0].storagePath, 'local://free-video/local-video-1');
});

test('positive volume on free video track activates native audio in MP4 and generates MP3 segments', () => {
  const track = {
    added: true,
    enabled: true,
    volumePct: 80,
    clips: [{
      id: 'audible-vid',
      name: 'clip.mp4',
      storagePath: 'sessions/audible.mp4',
      downloadUrl: 'https://example.test/audible.mp4',
      mimeType: 'video/mp4',
      sourceDurationMs: 5000,
      startMs: 2000,
      trimInMs: 500,
      trimOutMs: 4500,
      isLoading: true
    }]
  };
  const normalized = normalizeFreeVideoTrack(track);
  assert.equal(normalized.volumePct, 80);
  assert.equal(normalized.clips[0].isLoading, true);

  const [mp4Entry] = freeVideoExportEntries(normalized);
  assert.equal(mp4Entry.useNativeVideoAudio, true);
  assert.equal(mp4Entry.veoVolumeOverridePct, 80);

  const [mp3Segment] = freeVideoExportAudioSegments(normalized);
  assert.equal(mp3Segment.kind, 'free-video-audio');
  assert.equal(mp3Segment.id, 'free-video-audio-audible-vid');
  assert.equal(mp3Segment.startMs, 2000);
  assert.equal(mp3Segment.durationMs, 4000);
  assert.equal(mp3Segment.volumePct, 80);
});

test('muted free video track (volume 0) produces no audio segments for MP3 export', () => {
  const track = {
    added: true,
    enabled: true,
    volumePct: 0,
    clips: [{ id: 'silent', name: 's.mp4', storagePath: 'sessions/s.mp4', sourceDurationMs: 3000, startMs: 0, trimInMs: 0, trimOutMs: 3000 }]
  };
  const segments = freeVideoExportAudioSegments(track);
  assert.equal(segments.length, 0);
});
