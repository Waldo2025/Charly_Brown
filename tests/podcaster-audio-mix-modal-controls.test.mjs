import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

test('podcaster.html initializes Master fader at 0 dB (100%) and VU meter at 100%', () => {
  const html = readFileSync(new URL('../public/podcaster.html', import.meta.url), 'utf8');
  assert.match(html, /id="audioTrackMontageVolume"[^>]*value="100"/);
  assert.match(html, /id="audioTrackMontageVolumeNumber"[^>]*value="100"/);
  assert.match(html, /id="dawVuMaster"[^>]*style="height:\s*100%;"/);
});

test('podcaster.css positions Master channel strip separated to the right edge', () => {
  const css = readFileSync(new URL('../public/podcaster.css', import.meta.url), 'utf8');
  assert.match(css, /\.daw-channel-strip\.is-master\s*\{[^}]*margin-left:\s*auto;/);
  assert.match(css, /\.podcast-timeline-audio-mix-button/);
});

test('podcaster-timeline-ui.js contains audio mix shortcut button right next to add-track button', () => {
  const timelineUi = readFileSync(new URL('../public/podcaster/podcaster-timeline-ui.js', import.meta.url), 'utf8');
  assert.match(
    timelineUi,
    /<button class="row-icon-btn podcast-timeline-add-track-button"[^>]*>[\s\S]*?<\/button>\s*<button class="row-icon-btn podcast-timeline-audio-mix-button"[^>]*data-action="open-montage-scene-mix"/
  );
});

test('podcaster-playback-controller.js implements syncFreeVoiceVolume with _freeVoiceTrackVolumePct caching', () => {
  const controller = readFileSync(new URL('../public/podcaster/podcaster-playback-controller.js', import.meta.url), 'utf8');
  assert.match(controller, /syncFreeVoiceVolume\s*\(\s*volumePct\s*=\s*null\s*\)/);
  assert.match(controller, /this\._freeVoiceTrackVolumePct\s*=\s*effectivePct/);
  assert.match(controller, /const effectiveTrackPct = this\._freeVoiceTrackVolumePct != null/);
  assert.match(controller, /const session = this\.deps\?\.getActiveSession\?\.\(\) \|\| this\.state\.session;/);
});

test('podcaster.js syncs free voice live volume and saves mix settings to Firebase per session', () => {
  const podcasterJs = readFileSync(new URL('../public/podcaster/podcaster.js', import.meta.url), 'utf8');
  assert.match(podcasterJs, /function previewFreeVoiceVolume\s*\(/);
  assert.match(podcasterJs, /playbackController\.syncFreeVoiceVolume\?\.\(freeVoicePct\)/);
  assert.match(podcasterJs, /async function applyMontageSceneMixToAllScenes\s*\(/);
  assert.match(podcasterJs, /await saveSessionToCloud\(sessionId,\s*\{/);
  assert.match(podcasterJs, /els\.freeVoiceTrackVolumeRange\.addEventListener\("input",/);
  assert.match(podcasterJs, /els\.freeVoiceTrackVolumeRange\.addEventListener\("change",/);
});

test('defaultMontageSceneMixBtn sets master and free voice to 0 dB (100%), ducking slide to 46% and saves to storage and Firebase', () => {
  const podcasterJs = readFileSync(new URL('../public/podcaster/podcaster.js', import.meta.url), 'utf8');
  assert.match(podcasterJs, /async function setMontageSceneMixDefaultValues\s*\(/);
  assert.match(podcasterJs, /\[els\.audioTrackMontageVolume,\s*100\]/);
  assert.match(podcasterJs, /\[els\.freeVoiceTrackVolumeRange,\s*100\]/);
  assert.match(podcasterJs, /\[duckRange,\s*46\]/);
  assert.match(podcasterJs, /setPanelMontageDuckingWhenGeminiPct\(46\)/);
  assert.match(podcasterJs, /source === "duckRange"/);
  assert.match(podcasterJs, /source === "duckNumber"/);
  assert.match(podcasterJs, /autosaveReason:\s*"montage-scene-mix-default"/);
  assert.match(podcasterJs, /flushSessionLocalPersistNow\(sessionId,\s*"montage-scene-mix-default"\)/);
});

test('podcaster-session-store uses transaction.set merge and fallback against failed-precondition', () => {
  const storeJs = readFileSync(new URL('../public/podcaster/podcaster-session-store.js', import.meta.url), 'utf8');
  assert.match(storeJs, /transaction\.set\(sessionRef,\s*writeSession\(existing\),\s*\{\s*merge:\s*true\s*\}\)/);
  assert.match(storeJs, /isRetryableError\s*=\s*code\.includes\("failed-precondition"\)/);
  assert.match(storeJs, /await deps\.setDoc\(sessionRef,\s*writeSession\(existing\),\s*\{\s*merge:\s*true\s*\}\)/);
});

test('timeline chips have differentiated colors matching corresponding mix modal track lines', () => {
  const css = readFileSync(new URL('../public/podcaster.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../public/podcaster.html', import.meta.url), 'utf8');

  // Free voice chips have emerald green color (#10b981)
  assert.match(css, /\.podcast-free-voice-chip\.is-stored[^}]*#10b981/);
  // Free video chips have fuchsia pink color (#ec4899)
  assert.match(css, /#podcastVideoShell \.podcast-free-video-chip\s*\{[^}]*#ec4899/);
  // Background audio chips have warm orange color (#f97316)
  assert.match(css, /\.podcast-audio-timeline-chip\.has-audio\s*\{[^}]*#f97316/);
  // Gemini voice chips have blue color (#3b82f6)
  assert.match(css, /\.podcast-montage-audio-chip\.is-stored:not\(\.podcast-free-voice-chip\)\s*\{[^}]*#3b82f6/);

  // Mixer channels have matching --ch-accent and top border line
  assert.match(html, /data-channel="veo"\s+style="--ch-accent:\s*#06b6d4;"/);
  assert.match(html, /data-channel="gemini"\s+style="--ch-accent:\s*#3b82f6;"/);
  assert.match(html, /data-channel="background"\s+style="--ch-accent:\s*#f97316;"/);
  assert.match(html, /data-channel="free-voice"\s+style="--ch-accent:\s*#10b981;"/);
  assert.match(html, /data-channel="free-video"\s+style="--ch-accent:\s*#ec4899;"/);
  assert.match(html, /data-channel="master"\s+style="--ch-accent:\s*#eab308;"/);
  assert.match(css, /\.daw-channel-strip\s*\{[^}]*border-top:\s*3px solid var\(--ch-accent,\s*#38bdf8\);/);
});
