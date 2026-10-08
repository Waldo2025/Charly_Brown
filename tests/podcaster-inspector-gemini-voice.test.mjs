import assert from 'node:assert/strict';
import test from 'node:test';
import { applyNarratorDirectionToSession, extractGeminiPreviewAudio } from '../public/podcaster/podcaster-inspector-gemini-voice.js';

const normalize = (raw = {}) => Object.fromEntries(['stylePrompt', 'pacingPrompt', 'accentPrompt', 'scenePrompt', 'audioTags'].map(key => [key, String(raw[key] || '').trim()]));

test('narrator delivery changes reach inherited scene segments and preserve individual directions', () => {
  const session = { ttsDirectionDefaults: { stylePrompt: 'Cálida' }, script: { rows: [
    { id: 'one', speaker: 'Narrador' },
    { id: 'two', speaker: 'Narrador', ttsDirectionConfig: { stylePrompt: 'Cálida', pacingPrompt: 'Lenta' } },
    { id: 'three', speaker: 'Narrador', ttsDirectionConfig: { stylePrompt: 'Susurrada' } },
    { id: 'four', speaker: 'Invitado', ttsDirectionConfig: { stylePrompt: 'Cálida' } }
  ] } };
  const result = applyNarratorDirectionToSession(session, 'Narrador', 'stylePrompt', 'Clara', normalize);
  assert.equal(result.ttsDirectionDefaults.stylePrompt, 'Clara');
  assert.equal(result.script.rows[0].ttsDirectionConfig.stylePrompt, 'Clara');
  assert.equal(result.script.rows[1].ttsDirectionConfig.stylePrompt, 'Clara');
  assert.equal(result.script.rows[1].ttsDirectionConfig.pacingPrompt, 'Lenta');
  assert.equal(result.script.rows[2].ttsDirectionConfig.stylePrompt, 'Susurrada');
  assert.equal(result.script.rows[3].ttsDirectionConfig.stylePrompt, 'Cálida');
  assert.equal(session.ttsDirectionDefaults.stylePrompt, 'Cálida');
});

test('the inspector does not apply a visual scenario through the voice controls', () => {
  const session = { script: { rows: [] } };
  assert.equal(applyNarratorDirectionToSession(session, 'Narrador', 'scenePrompt', 'Escenario creativo', normalize), session);
});

test('Gemini PCM voice previews are wrapped as playable WAV audio', async () => {
  const pcm = Buffer.from([0, 0, 255, 127]);
  const audio = extractGeminiPreviewAudio({ candidates: [{ content: { parts: [{
    inlineData: { mimeType: 'audio/pcm;rate=24000', data: pcm.toString('base64') }
  }] } }] });
  assert.equal(audio.type, 'audio/wav');
  const bytes = new Uint8Array(await audio.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'RIFF');
  assert.equal(new DataView(bytes.buffer).getUint32(24, true), 24000);
  assert.deepEqual([...bytes.slice(44)], [...pcm]);
});

test('Gemini TTS preview accepts the same Interactions audio response used by generation', async () => {
  const audio = extractGeminiPreviewAudio({ audio: { mimeType: 'audio/wav', data: Buffer.from('wav').toString('base64') } });
  assert.equal(audio.type, 'audio/wav');
  assert.equal(await audio.text(), 'wav');
});

test('voice inspector exposes an on-demand Gemini sample action', async () => {
  const [html, module] = await Promise.all([
    (await import('node:fs/promises')).readFile(new URL('../public/podcaster.html', import.meta.url), 'utf8'),
    (await import('node:fs/promises')).readFile(new URL('../public/podcaster/podcaster-inspector-gemini-voice.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /data-gemini-voice-preview/);
  assert.match(module, /\/api\/podcaster\/tts\/preview/);
  assert.match(module, /speechLocale:\s*locale/);
  assert.match(module, /ttsDirection:\s*direction/);
  assert.match(module, /URL\.revokeObjectURL/);
});
