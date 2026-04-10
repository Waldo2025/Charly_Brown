import { firebaseWebConfig, assertFirebaseWebConfig } from "./firebase-web-config.js";
import { buildApiUrl } from "./api-client.js";
import { downloadStyledDocx, sanitizeFilename as sanitizeWordFilename, DEFAULT_STYLE_DEFINITIONS, normalizeStyleDefinitions } from "./word-export.js";
// lecturas-asc-unificado.js
// ------------------------------------------------------------
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, updateDoc, deleteDoc, doc, deleteField } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import { bootstrapFirebaseAppCheck } from "./firebase-app-check.js";

const firebaseConfig = assertFirebaseWebConfig(firebaseWebConfig);

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
void bootstrapFirebaseAppCheck(app);
const db   = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// Utils
const $ = (q, ctx=document)=>ctx.querySelector(q);
const $$= (q, ctx=document)=>Array.from(ctx.querySelectorAll(q));
const esc = s=>String(s??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));

function _ascStripHtmlToPlain(html = "") {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function _ascExtractMusicAssets(row = {}) {
  const music = row?.music || row?.musica || {};
  return {
    readingUrl: String(music?.readingUrl || music?.lecturaUrl || row?.musicReadingUrl || "").trim(),
    gameUrl: String(music?.gameUrl || music?.juegoUrl || row?.musicGameUrl || "").trim(),
    readingPath: String(music?.readingPath || music?.lecturaPath || row?.musicReadingPath || "").trim(),
    gamePath: String(music?.gamePath || music?.juegoPath || row?.musicGamePath || "").trim(),
    musicConfig: _ascNormalizeMusicProfile(music?.musicConfig || row?.musicConfig || {}),
    promptReading: String(music?.promptReading || "").trim(),
    promptGame: String(music?.promptGame || "").trim(),
  };
}

function _ascStoragePathFromDownloadUrl(url = "") {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const m = u.pathname.match(/\/o\/(.+)$/);
    if (!m?.[1]) return "";
    return decodeURIComponent(m[1]);
  } catch (_) {
    return "";
  }
}

function _ascCollectMusicStoragePaths(row = {}) {
  const assets = _ascExtractMusicAssets(row);
  const out = [
    String(assets.readingPath || "").trim(),
    String(assets.gamePath || "").trim(),
    _ascStoragePathFromDownloadUrl(assets.readingUrl),
    _ascStoragePathFromDownloadUrl(assets.gameUrl)
  ].filter(Boolean);
  return [...new Set(out)];
}

function _ascHasMusicAssets(row = {}) {
  const assets = _ascExtractMusicAssets(row);
  return !!(assets.readingUrl && assets.gameUrl);
}

function _ascExtractStoredMusicConfig(row = {}) {
  const m = row?.music || row?.musica || {};
  const cfg = m?.musicConfig || row?.musicConfig || {};
  return (cfg && typeof cfg === "object") ? cfg : {};
}

function _ascNormalizeMusicProfile(input = {}) {
  const src = (input && typeof input === "object") ? input : {};
  const build = (item = {}) => {
    const v = (item && typeof item === "object") ? item : {};
    return {
      prompt: String(v.prompt || "").trim(),
      genre: String(v.genre || "").trim(),
      vocalMode: String(v.vocalMode || "").trim(),
      tone: String(v.tone || "").trim(),
    };
  };
  return {
    reading: build(src.reading),
    game: build(src.game),
  };
}

function _ascBuildPromptFromMusicProfile(profile = {}, modeLabel = "") {
  const p = (profile && typeof profile === "object") ? profile : {};
  const out = [];
  if (modeLabel) out.push(`Mode: ${modeLabel}`);
  if (p.prompt) out.push(`Prompt: ${p.prompt}`);
  if (p.genre) out.push(`Genre: ${p.genre}`);
  if (p.vocalMode) out.push(`Voice mode: ${p.vocalMode}`);
  if (p.tone) out.push(`Tone: ${p.tone}`);
  return out.join("\n").trim();
}

function _ascResolveMusicPromptInputs(row = {}, options = {}) {
  const musicConfig = _ascNormalizeMusicProfile(options?.musicConfig || _ascExtractStoredMusicConfig(row));
  const promptReadingRaw = String(options?.promptReading || "").trim();
  const promptGameRaw = String(options?.promptGame || "").trim();
  const promptReading = promptReadingRaw || _ascBuildPromptFromMusicProfile(musicConfig.reading, "reading");
  const promptGame = promptGameRaw || _ascBuildPromptFromMusicProfile(musicConfig.game, "game");
  if (!promptReading || !promptGame) {
    throw new Error("Configura los campos de música en el modal (prompt, género, voz/instrumental y tono) antes de generar.");
  }
  return { promptReading, promptGame, musicConfig };
}

function _ascBuildLyriaRuntimeConfig(row = {}) {
  const modelPref = String(localStorage.getItem("cb_lyria_model") || "").trim();
  const model = (modelPref === "lyria-002" || modelPref === "lyria-realtime-exp") ? modelPref : "lyria-realtime-exp";
  const sampleRaw = Number(localStorage.getItem("cb_lyria_sample_count") || 2);
  const sampleCount = Math.max(1, Math.min(4, Number.isFinite(sampleRaw) ? Math.floor(sampleRaw) : 1));
  const seedTxt = String(localStorage.getItem("cb_lyria_seed") || "").trim();
  const seedRaw = seedTxt ? Number(seedTxt) : NaN;
  const useSeed = String(localStorage.getItem("cb_lyria_use_seed") || "").trim().toLowerCase() === "true";
  const seed = (useSeed && Number.isFinite(seedRaw)) ? Math.max(0, Math.floor(seedRaw)) : null;
  const negativePromptReading = String(
      localStorage.getItem("cb_lyria_negative_prompt") ||
      "Synth leads, EDM drums, electric guitar, trap beat, vocals, narration, choir, distortion, hiss, crackle, noisy texture.",
  ).trim();
  const negativePromptGame = String(
      localStorage.getItem("cb_lyria_negative_prompt_game") ||
      "Vocals, narration, choir, horror texture, harsh distortion, chaotic atonal noise, muddy mix, hiss, crackle.",
  ).trim();
  const guidanceRaw = Number(localStorage.getItem("cb_lyria_guidance") || 4);
  const guidance = Number.isFinite(guidanceRaw) ? Math.max(0, Math.min(6, guidanceRaw)) : 4;
  const bpmRaw = Number(localStorage.getItem("cb_lyria_bpm") || 76);
  const bpm = Number.isFinite(bpmRaw) ? Math.max(60, Math.min(200, Math.round(bpmRaw))) : 76;
  const gameBpmRaw = Number(localStorage.getItem("cb_lyria_game_bpm") || 156);
  const gameBpm = Number.isFinite(gameBpmRaw) ? Math.max(60, Math.min(200, Math.round(gameBpmRaw))) : 156;
  const densityRaw = Number(localStorage.getItem("cb_lyria_density") || 0.5);
  const density = Number.isFinite(densityRaw) ? Math.max(0, Math.min(1, densityRaw)) : 0.5;
  const brightnessRaw = Number(localStorage.getItem("cb_lyria_brightness") || 0.7);
  const brightness = Number.isFinite(brightnessRaw) ? Math.max(0, Math.min(1, brightnessRaw)) : 0.7;
  const temperatureRaw = Number(localStorage.getItem("cb_lyria_temperature") || 1.2);
  const temperature = Number.isFinite(temperatureRaw) ? Math.max(0, Math.min(2.5, temperatureRaw)) : 1.2;
  const durationRaw = Number(localStorage.getItem("cb_lyria_duration_ms") || 30000);
  const durationMs = Number.isFinite(durationRaw) ? Math.max(12000, Math.min(70000, Math.round(durationRaw))) : 30000;
  const scaleRaw = String(localStorage.getItem("cb_lyria_scale") || "C_MAJOR_A_MINOR").trim().toUpperCase();
  const scale = _ascNormalizeLyriaScale(scaleRaw) || "C_MAJOR_A_MINOR";
  return {
    model,
    sampleCount,
    seed: sampleCount > 1 ? null : seed,
    negativePrompt: negativePromptReading,
    negativePromptReading,
    negativePromptGame,
    guidance,
    bpm,
    gameBpm,
    density,
    brightness,
    temperature,
    durationMs,
    scale,
    title: String(row?.titulo || "").trim(),
  };
}

function _ascBuildSongSections(energetic = false, promptText = "", trackProfile = {}) {
  const basePrompt = String(promptText || "").replace(/\s+/g, " ").trim().slice(0, 260);
  const genre = String(trackProfile?.genre || "").trim();
  const tone = String(trackProfile?.tone || "").trim();
  const voice = String(trackProfile?.vocalMode || "").trim();
  const common = [
    genre ? `Genre: ${genre}` : "",
    tone ? `Tone: ${tone}` : "",
    voice ? `Voice mode: ${voice}` : "",
    basePrompt,
  ].filter(Boolean).join(" | ");
  if (energetic) {
    return [
      {
        atMs: 0,
        prompts: [
          { text: `${common} | Intro: drums+bass establish groove, lead restrained.`, weight: 1.2 },
          { text: "Instrument roles: drums tight, bass short pulse, lead sparse motifs.", weight: 1.1 },
        ]
      },
      {
        atMs: 6000,
        prompts: [
          { text: `${common} | Section A: hook enters, lead phrasing opens, chords support.`, weight: 1.25 },
          { text: "Instrument roles: lead gains articulation, drums keep steady backbeat.", weight: 1.12 },
        ]
      },
      {
        atMs: 12000,
        prompts: [
          { text: `${common} | Section B: chorus lift, brighter lead and wider harmony.`, weight: 1.28 },
          { text: "Instrument roles: bass broader motion, drums accent transitions, lead peaks.", weight: 1.12 },
        ]
      },
      {
        atMs: 17000,
        prompts: [
          { text: `${common} | Outro: reduce lead intensity, cadence with drums+bass release.`, weight: 1.1 },
        ]
      },
    ];
  }
  return [
    {
      atMs: 0,
      prompts: [
        { text: `${common} | Intro: strings set texture, winds answer softly, piano minimal guidance.`, weight: 1.2 },
      ]
    },
    {
      atMs: 7000,
      prompts: [
        { text: `${common} | Section A: melody in strings/piano, woodwinds counterline, brass restrained.`, weight: 1.24 },
      ]
    },
    {
      atMs: 14000,
      prompts: [
        { text: `${common} | Section B: brass and low strings intensify harmony, winds articulate transitions.`, weight: 1.22 },
      ]
    },
    {
      atMs: 19000,
      prompts: [
        { text: `${common} | Outro: reduce brass, strings and piano resolve with clear cadence.`, weight: 1.08 },
      ]
    },
  ];
}

function _ascBuildAdvancedStyleHints(trackProfile = {}, energetic = false) {
  const genre = String(trackProfile?.genre || "").toLowerCase();
  const prompt = String(trackProfile?.prompt || "").toLowerCase();
  const mix = `${genre} ${prompt}`;
  const wantsBaroque = /(barroc|baroque|bach|vivaldi|handel|haendel)/.test(mix);
  const wantsMozart = /(mozart|clasico|clasicismo|classical era|viennese)/.test(mix);
  const wantsOrchestra = /(orquest|orchestra|symphon|sinfon|ensemble|camerata)/.test(mix);
  const wantsInstrumental = String(trackProfile?.vocalMode || "").toLowerCase().includes("instrumental");
  if (energetic) {
    return [
      { text: "Song-like structure: intro, verse, chorus, bridge, outro.", weight: 1.18 },
      { text: "Strong rhythmic identity, memorable hook, layered arrangement (drums+bass+lead+counter-melody).", weight: 1.16 },
      { text: "Avoid static loops. Evolve harmony and instrumentation every section.", weight: 1.14 },
      { text: "High-fidelity production, punchy modern mix, avoid cheap toy timbre.", weight: 1.12 },
      { text: "No cheap GM MIDI/soundfont character, no thin toy keyboard lead.", weight: 1.15 },
      wantsInstrumental ? { text: "Instrumental only, no vocals.", weight: 1.1 } : null,
    ].filter(Boolean);
  }
  const hints = [
    { text: "Song-like composition with clear sections and thematic development.", weight: 1.18 },
    { text: "Avoid static ambient pad or solo sketch. Use multi-instrument arrangement.", weight: 1.16 },
    { text: "Realistic instrument timbre and human performance nuance.", weight: 1.2 },
    { text: "Natural room ambience, dynamic articulation, expressive phrasing.", weight: 1.15 },
    { text: "No cheap GM MIDI/soundfont or toy keyboard tone.", weight: 1.2 },
    wantsInstrumental ? { text: "Instrumental only, no vocals.", weight: 1.1 } : null,
  ];
  if (wantsBaroque) {
    hints.push(
      { text: "Baroque orchestral writing: strings choir + woodwinds + basso continuo + harpsichord.", weight: 1.24 },
      { text: "Counterpoint, sequence development, ornamental melodic turns, dance-like pulse.", weight: 1.2 },
      { text: "Not solo piano. Full ensemble texture is required.", weight: 1.22 }
    );
  } else if (wantsMozart) {
    hints.push(
      { text: "Classical-era orchestration in Mozart-like balance: strings, woodwinds, horns, basses.", weight: 1.24 },
      { text: "Elegant periodic phrasing, motivic development, transparent but rich orchestration.", weight: 1.2 },
      { text: "Not solo piano. Full orchestral support required.", weight: 1.22 }
    );
  } else if (wantsOrchestra) {
    hints.push(
      { text: "Full orchestral arrangement with layered strings, winds, brass and low-end support.", weight: 1.2 },
      { text: "Not solo piano. Ensemble texture required.", weight: 1.18 }
    );
  }
  return hints;
}

function _ascBuildExpressiveIntentHints(trackProfile = {}, energetic = false) {
  const tone = String(trackProfile?.tone || "").trim().toLowerCase();
  if (energetic) {
    const toneHint = tone ? `Emotional target: ${tone}.` : "Emotional target: energetic and uplifting.";
    return [
      { text: `${toneHint} Clear tension-release arc across sections.`, weight: 1.15 },
      { text: "Expressive groove: accent patterns, syncopation, velocity variation, dynamic contrasts.", weight: 1.12 },
      { text: "Phrase with intention, not static loop. Build, peak, and resolve.", weight: 1.14 },
    ];
  }
  const toneHint = tone ? `Emotional target: ${tone}.` : "Emotional target: lyrical and expressive.";
  return [
    { text: `${toneHint} Shape long melodic phrases with breath-like contour.`, weight: 1.18 },
    { text: "Dynamic arc: pianissimo to forte swells and intentional cadential release.", weight: 1.16 },
    { text: "Human interpretation: rubato nuance, articulation contrast (legato/staccato), expressive voicing.", weight: 1.15 },
  ];
}

function _ascBuildPerInstrumentIntentHints(trackProfile = {}, energetic = false) {
  const tone = String(trackProfile?.tone || "").trim().toLowerCase();
  if (energetic) {
    return [
      { text: `Drums: tight transient accents, controlled ghost notes, energetic backbeat (${tone || "upbeat"}).`, weight: 1.12 },
      { text: "Bass synth: sidechain pulse with short articulation and clear note separation.", weight: 1.12 },
      { text: "Lead synth: expressive phrasing with hook contour, not constant full-intensity.", weight: 1.1 },
      { text: "Chord layer/pads: support harmony with dynamic swells behind lead and rhythm.", weight: 1.06 },
      { text: "FX/percussion details: sparse fills at transitions, avoid clutter.", weight: 1.04 },
    ];
  }
  return [
    { text: `Strings: long legato lines with gradual cresc/decresc and expressive vibrato (${tone || "lyrical"}).`, weight: 1.14 },
    { text: "Woodwinds: lighter counterphrases, clearer articulation than strings, phrase-by-phrase breathing.", weight: 1.11 },
    { text: "Brass/horns: restrained support in A sections, stronger swells only at climactic points.", weight: 1.09 },
    { text: "Piano/continuo: melodic guidance with nuanced rubato, avoid dominating all sections.", weight: 1.1 },
    { text: "Low strings/timpani: structural tension-release cues at cadences and transitions only.", weight: 1.06 },
  ];
}

function _ascIsStaticLocalDev() {
  const host = String(window.location.hostname || "").toLowerCase();
  const port = String(window.location.port || "");
  const isLocalHost = host === "127.0.0.1" || host === "localhost";
  if (!isLocalHost) return false;
  return port !== "5000" && port !== "5001";
}

async function _ascGeminiGenerateViaBackend(model = "gemini-2.5-flash", payload = {}, signal = null) {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : "";
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(buildApiUrl("/api/gemini/generate"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: String(model || "gemini-2.5-flash"),
      payload: payload || {}
    }),
    ...(signal ? { signal } : {})
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function _ascDecodeBase64ToBytes(base64 = "") {
  const binary = atob(String(base64 || "").trim());
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function _ascHashSeedFromText(text = "") {
  const str = String(text || "");
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

function _ascPcm16ToWavBlob(pcmBytes, sampleRate = 24000, channels = 1) {
  const data = pcmBytes instanceof Uint8Array ? pcmBytes : new Uint8Array(0);
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  const wav = new ArrayBuffer(44 + data.length);
  const view = new DataView(wav);
  let off = 0;
  const write = (s) => { for (let i = 0; i < s.length; i += 1) view.setUint8(off + i, s.charCodeAt(i)); off += s.length; };
  write("RIFF");
  view.setUint32(off, 36 + data.length, true); off += 4;
  write("WAVE");
  write("fmt ");
  view.setUint32(off, 16, true); off += 4;
  view.setUint16(off, 1, true); off += 2;
  view.setUint16(off, channels, true); off += 2;
  view.setUint32(off, sampleRate, true); off += 4;
  view.setUint32(off, byteRate, true); off += 4;
  view.setUint16(off, blockAlign, true); off += 2;
  view.setUint16(off, 16, true); off += 2;
  write("data");
  view.setUint32(off, data.length, true); off += 4;
  new Uint8Array(wav, off).set(data);
  return new Blob([wav], { type: "audio/wav" });
}

function _ascPcm16BytesToMonoFloat(pcmBytes = new Uint8Array(0), channels = 2) {
  const bytes = (pcmBytes instanceof Uint8Array) ? pcmBytes : new Uint8Array(0);
  if (!bytes.length) return new Float32Array(0);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ch = Math.max(1, Math.min(2, Number(channels || 1)));
  const totalSamples = Math.floor(bytes.byteLength / 2);
  const frames = Math.floor(totalSamples / ch);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    let acc = 0;
    for (let c = 0; c < ch; c += 1) {
      const s = view.getInt16((i * ch + c) * 2, true) / 32768;
      acc += s;
    }
    out[i] = acc / ch;
  }
  return out;
}

function _ascScoreMusicalStructureFromPcm(pcmBytes = new Uint8Array(0), sampleRate = 48000, channels = 2) {
  const x = _ascPcm16BytesToMonoFloat(pcmBytes, channels);
  const n = x.length;
  if (!n || !Number.isFinite(sampleRate) || sampleRate < 8000) return -9999;
  const secSamples = Math.max(256, Math.floor(sampleRate)); // 1 second blocks
  const blocks = [];
  for (let i = 0; i < n; i += secSamples) {
    const end = Math.min(n, i + secSamples);
    let e = 0;
    let peak = 0;
    for (let j = i; j < end; j += 1) {
      const v = x[j];
      e += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    const len = Math.max(1, end - i);
    blocks.push({ rms: Math.sqrt(e / len), peak });
  }
  if (blocks.length < 6) return -9999;
  const rms = blocks.map((b) => b.rms);
  const peak = blocks.map((b) => b.peak);
  const meanRms = rms.reduce((a, b) => a + b, 0) / rms.length;
  const stdRms = Math.sqrt(rms.reduce((a, b) => a + ((b - meanRms) ** 2), 0) / Math.max(1, rms.length));
  const maxPeak = Math.max(...peak);
  const clipPenalty = maxPeak > 0.985 ? (maxPeak - 0.985) * 28 : 0;
  const flatPenalty = stdRms < 0.01 ? 3.5 : 0;
  // 4-part form contrast
  const q = Math.max(1, Math.floor(rms.length / 4));
  const secA = rms.slice(0, q);
  const secB = rms.slice(q, q * 2);
  const secC = rms.slice(q * 2, q * 3);
  const secD = rms.slice(q * 3);
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const a = avg(secA), b = avg(secB), c = avg(secC), d = avg(secD);
  const sectionContrast = Math.abs(a - b) + Math.abs(b - c) + Math.abs(c - d);
  // novelty between blocks
  let novelty = 0;
  for (let i = 1; i < rms.length; i += 1) novelty += Math.abs(rms[i] - rms[i - 1]);
  novelty /= Math.max(1, rms.length - 1);
  // target curve preference: evolve and resolve (B/C > A and D < C)
  const formBonus = ((b > a ? 0.6 : 0) + (c >= b ? 0.6 : 0) + (d < c ? 0.6 : 0));
  const score = (sectionContrast * 42) + (novelty * 30) + (stdRms * 40) + formBonus - clipPenalty - flatPenalty;
  return Number.isFinite(score) ? score : -9999;
}

function _ascAudioBufferToWavBlob(audioBuffer) {
  const channels = Math.max(1, Number(audioBuffer?.numberOfChannels || 1));
  const sampleRate = Math.max(8000, Number(audioBuffer?.sampleRate || 24000));
  const length = Math.max(0, Number(audioBuffer?.length || 0));
  const pcm = new Int16Array(length * channels);
  for (let i = 0; i < length; i += 1) {
    for (let ch = 0; ch < channels; ch += 1) {
      const data = audioBuffer.getChannelData(ch);
      const s = Math.max(-1, Math.min(1, Number(data?.[i] || 0)));
      pcm[i * channels + ch] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
  }
  return _ascPcm16ToWavBlob(new Uint8Array(pcm.buffer), sampleRate, channels);
}

async function _ascDecodeWavBlobToAudioBuffer(blob = null) {
  if (!(blob instanceof Blob)) return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (typeof Ctx !== "function") return null;
  const ctx = new Ctx();
  try {
    const ab = await blob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(ab.slice(0));
    return decoded || null;
  } catch (_) {
    return null;
  } finally {
    try { await ctx.close(); } catch (_) {}
  }
}

function _ascBuildLoopableAudioBuffer(buffer = null, options = {}) {
  if (!buffer) return null;
  const sampleRate = Math.max(8000, Number(buffer.sampleRate || 48000));
  const channels = Math.max(1, Number(buffer.numberOfChannels || 1));
  const length = Math.max(1, Number(buffer.length || 1));
  const fadeSecRaw = Number(options?.fadeSec || 1.1);
  const fadeSamples = Math.max(256, Math.min(Math.floor(length / 4), Math.floor(sampleRate * Math.max(0.18, fadeSecRaw))));
  if (fadeSamples * 2 >= length) return buffer;
  const outLen = length;
  const out = new AudioBuffer({
    length: outLen,
    numberOfChannels: channels,
    sampleRate
  });
  for (let ch = 0; ch < channels; ch += 1) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    dst.set(src);
    const seam = new Float32Array(fadeSamples);
    for (let i = 0; i < fadeSamples; i += 1) {
      const t = i / Math.max(1, fadeSamples - 1);
      const a = Math.cos(t * Math.PI * 0.5);
      const b = Math.sin(t * Math.PI * 0.5);
      const head = src[i] || 0;
      const tail = src[outLen - fadeSamples + i] || 0;
      seam[i] = (head * a) + (tail * b);
    }
    for (let i = 0; i < fadeSamples; i += 1) dst[i] = seam[i];
    for (let i = 0; i < fadeSamples; i += 1) dst[outLen - fadeSamples + i] = seam[(i + 1) % fadeSamples];
    dst[outLen - 1] = dst[0];
  }
  return out;
}

async function _ascMakeWavLoopable(blob = null, options = {}) {
  const buffer = await _ascDecodeWavBlobToAudioBuffer(blob);
  if (!buffer) return blob;
  const loopable = _ascBuildLoopableAudioBuffer(buffer, options);
  if (!loopable) return blob;
  return _ascAudioBufferToWavBlob(loopable);
}

function _ascSeededRandom(seedText = "") {
  let h = 2166136261 >>> 0;
  const txt = String(seedText || "");
  for (let i = 0; i < txt.length; i += 1) {
    h ^= txt.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6D2B79F5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function _ascMusicNonce(force = false) {
  const now = Date.now();
  const rnd = Math.floor(Math.random() * 1e9);
  if (force) return `force-${now}-${rnd}`;
  return `slot-${Math.floor(now / 45000)}-${rnd}`;
}

function _ascPickMusicVariant(energetic = false, nonce = "") {
  const variants = energetic ?
    ["arcade-synth", "electro-waltz", "orchestral-drive", "pulse-run"] :
    ["nocturne", "waltz", "concerto", "adagio"];
  let h = 0;
  const txt = String(nonce || "");
  for (let i = 0; i < txt.length; i += 1) h = ((h * 33) ^ txt.charCodeAt(i)) >>> 0;
  return variants[h % variants.length];
}

function _ascTryParseJson(raw = "") {
  const txt = String(raw || "").trim();
  if (!txt) return null;
  try { return JSON.parse(txt); } catch (_) {}
  const a = txt.indexOf("{");
  const b = txt.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try { return JSON.parse(txt.slice(a, b + 1)); } catch (_) {}
  }
  return null;
}

async function _ascAnalyzeMusicProfileWithGemini({ prompt = "", energetic = false } = {}) {
  const instruction = `
Eres compositor. Analiza el texto y devuelve SOLO JSON:
{
  "mood":"calm|hopeful|mysterious|dramatic|playful|heroic",
  "energy":0.0,
  "tempoBpm":80,
  "scale":"major|minor|dorian|mixolydian",
  "keyCenterMidi":60,
  "orchestration":{"strings":0.8,"piano":0.7,"cello":0.6,"woodwinds":0.3,"synth":0.2,"percussion":0.1}
}
Sin markdown.
`.trim();
  const { response, data } = await _ascGeminiGenerateViaBackend("gemini-2.5-flash", {
    contents: [{ role: "user", parts: [{ text: `${instruction}\n\nTexto:\n${String(prompt || "").slice(0, 7000)}` }] }],
    generationConfig: { temperature: energetic ? 0.65 : 0.4, responseMimeType: "application/json" }
  });
  if (!response.ok) return null;
  const raw = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  return _ascTryParseJson(raw);
}

async function _ascGenerateProceduralMusicBlob({ prompt = "", energetic = false, profile = null, nonce = "", variant = "" } = {}) {
  const sampleRate = 32000;
  const durationSec = energetic ? 26 : 24;
  const totalFrames = Math.floor(sampleRate * durationSec);
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (typeof OfflineCtx !== "function") {
    throw new Error("OfflineAudioContext no soportado en este navegador.");
  }
  const ctx = new OfflineCtx(2, totalFrames, sampleRate);
  const rand = _ascSeededRandom(`${prompt}|${energetic ? "game" : "reading"}|${JSON.stringify(profile || {})}|${nonce}|${variant}`);

  const master = ctx.createGain();
  master.gain.value = energetic ? 0.8 : 0.65;
  master.connect(ctx.destination);

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = energetic ? 6400 : 4600;
  lowpass.Q.value = 0.8;
  lowpass.connect(master);

  const reverb = ctx.createConvolver();
  const irLen = Math.floor(sampleRate * (energetic ? 1.2 : 1.8));
  const ir = ctx.createBuffer(2, irLen, sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < irLen; i += 1) {
      const n = (rand() * 2 - 1) * Math.pow(1 - (i / irLen), energetic ? 2.2 : 2.8);
      data[i] = n * (energetic ? 0.12 : 0.16);
    }
  }
  reverb.buffer = ir;
  const dry = ctx.createGain();
  dry.gain.value = energetic ? 0.8 : 0.72;
  const wet = ctx.createGain();
  wet.gain.value = energetic ? 0.2 : 0.28;
  lowpass.connect(dry).connect(master);
  lowpass.connect(reverb);
  reverb.connect(wet).connect(master);

  const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const p = (profile && typeof profile === "object") ? profile : {};
  const energy = Math.max(0, Math.min(1, Number(p.energy ?? (energetic ? 0.8 : 0.35))));
  const bpmVariantBoost = String(variant).includes("waltz") ? -8 :
    (String(variant).includes("concerto") ? 6 :
      (String(variant).includes("adagio") ? -14 :
        (String(variant).includes("pulse") ? 10 : 0)));
  const bpmBase = (energetic ? 124 : 82) + bpmVariantBoost;
  const bpm = Math.max(58, Math.min(158, Number(p.tempoBpm || (bpmBase + energy * 8))));
  const keyCenter = Math.max(42, Math.min(66, Number(p.keyCenterMidi || (energetic ? 50 : 54))));
  const scaleName = String(p.scale || (energetic ? "mixolydian" : "minor")).toLowerCase();
  const scaleMap = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10]
  };
  const scale = scaleMap[scaleName] || scaleMap.minor;
  const triad = (root) => [root, root + scale[2], root + scale[4]];
  const progression = String(variant).includes("waltz")
    ? [triad(keyCenter), triad(keyCenter - 3), triad(keyCenter - 5), triad(keyCenter + 2)]
    : String(variant).includes("adagio")
      ? [triad(keyCenter), triad(keyCenter - 2), triad(keyCenter - 5), triad(keyCenter - 7)]
      : [triad(keyCenter), triad(keyCenter - 5), triad(keyCenter + 2), triad(keyCenter - 2)];
  const beat = 60 / bpm;
  const bar = beat * 4;
  const bars = Math.floor(durationSec / bar);

  const scheduleStringPad = (time, len, note, detune = 0, gain = 0.055) => {
    const osc = ctx.createOscillator();
    osc.type = energetic ? "sawtooth" : "triangle";
    osc.frequency.setValueAtTime(midiToHz(note), time);
    osc.detune.setValueAtTime(detune, time);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.28);
    g.gain.exponentialRampToValueAtTime(gain * 0.66, time + len * 0.65);
    g.gain.exponentialRampToValueAtTime(0.0001, time + len);
    osc.connect(g).connect(lowpass);
    osc.start(time);
    osc.stop(time + len + 0.05);
  };

  const schedulePiano = (time, note, len = 0.45, gain = 0.09) => {
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = "triangle";
    o2.type = "sine";
    const hz = midiToHz(note);
    o1.frequency.setValueAtTime(hz, time);
    o2.frequency.setValueAtTime(hz * 2, time);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + len);
    o1.connect(g);
    o2.connect(g);
    g.connect(lowpass);
    o1.start(time);
    o2.start(time);
    o1.stop(time + len + 0.03);
    o2.stop(time + len + 0.03);
  };

  const scheduleCello = (time, note, len = beat * 0.95) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(midiToHz(note), time);
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(620, time);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.065, time + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, time + len);
    osc.connect(filt).connect(g).connect(lowpass);
    osc.start(time);
    osc.stop(time + len + 0.03);
  };

  const melodicScale = energetic ? [62, 65, 67, 69, 70, 72] : [62, 64, 65, 67, 69, 71, 72];
  for (let b = 0; b < bars; b += 1) {
    const t0 = b * bar;
    const chord = progression[b % progression.length];
    const orchestration = p.orchestration || {};
    const stringsMix = Math.max(0, Math.min(1, Number(orchestration.strings ?? 0.75)));
    const pianoMix = Math.max(0, Math.min(1, Number(orchestration.piano ?? 0.65)));
    const celloMix = Math.max(0, Math.min(1, Number(orchestration.cello ?? 0.7)));
    for (const note of chord) {
      scheduleStringPad(t0, bar * 0.98, note + 12, -4, energetic ? 0.03 : 0.05);
      scheduleStringPad(t0, bar * 0.98, note + 12, 4, energetic ? 0.03 : 0.05);
      if (stringsMix > 0.65) scheduleStringPad(t0, bar * 0.95, note + 19, 0, energetic ? 0.02 : 0.03);
    }

    // Cello pulse
    for (let k = 0; k < 4; k += 1) {
      if (celloMix > 0.2) scheduleCello(t0 + (k * beat), chord[0] - 12, energetic ? beat * 0.6 : beat * 0.92);
    }

    // Piano/arpeggio
    const arpCount = String(variant).includes("waltz") ? 6 : (energetic ? 8 : 6);
    for (let i = 0; i < arpCount; i += 1) {
      const st = t0 + (i * bar / arpCount);
      const n = chord[i % chord.length] + (energetic ? 24 : 19);
      if (pianoMix > 0.2) schedulePiano(st, n, energetic ? 0.18 : 0.32, energetic ? 0.06 : 0.08);
    }

    // Violin-like melody
    const melodyHits = String(variant).includes("adagio") ? 2 : (energetic ? 4 : 3);
    for (let m = 0; m < melodyHits; m += 1) {
      const mt = t0 + (m + 0.5) * (bar / melodyHits);
      const n = melodicScale[Math.floor(rand() * melodicScale.length)] + (energetic ? 0 : 12);
      scheduleStringPad(mt, energetic ? 0.28 : 0.55, n, 0, energetic ? 0.04 : 0.05);
    }
  }

  const rendered = await ctx.startRendering();
  return _ascAudioBufferToWavBlob(rendered);
}

function _ascExtractInlineAudioPart(data = {}) {
  const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : [];
  for (const part of parts) {
    const inline = part?.inlineData || part?.inline_data;
    const mime = String(inline?.mimeType || inline?.mime_type || "").trim();
    const b64 = String(inline?.data || "").trim();
    if (b64 && /^audio\//i.test(mime)) return { mime, b64 };
  }
  return null;
}

let _ascGoogleGenAiModPromise = null;

async function _ascLoadGoogleGenAiModule() {
  throw new Error("Gemini directo en frontend está deshabilitado. Usa solo el backend.");
}

function _ascSleep(ms = 0) {
  const safe = Math.max(0, Number(ms || 0));
  return new Promise((resolve) => setTimeout(resolve, safe));
}

function _ascExtractLyriaAudioChunksFromMessage(message = {}) {
  const out = [];
  const serverContent = message?.serverContent || {};
  const chunks = Array.isArray(serverContent?.audioChunks) ? serverContent.audioChunks : [];
  for (const chunk of chunks) {
    const b64 = String(chunk?.data || "").trim();
    if (!b64) continue;
    try {
      out.push(_ascDecodeBase64ToBytes(b64));
    } catch (_) {}
  }
  return out;
}

function _ascExtractLyriaSampleRateFromMessage(message = {}, fallback = 48000) {
  const serverContent = message?.serverContent || {};
  const direct = Number(
    serverContent?.sampleRateHertz ||
    serverContent?.audioMetadata?.sampleRateHertz ||
    serverContent?.audioChunks?.[0]?.sampleRateHertz ||
    fallback
  );
  if (!Number.isFinite(direct)) return Number(fallback || 48000);
  return Math.max(8000, Math.min(96000, Math.round(direct)));
}

function _ascExtractLyriaChannelsFromMessage(message = {}, fallback = 2) {
  const serverContent = message?.serverContent || {};
  const direct = Number(
    serverContent?.audioMetadata?.channels ||
    serverContent?.audioMetadata?.channelCount ||
    serverContent?.audioChunks?.[0]?.channels ||
    serverContent?.audioChunks?.[0]?.channelCount ||
    fallback
  );
  if (!Number.isFinite(direct)) return Number(fallback || 2);
  return Math.max(1, Math.min(2, Math.round(direct)));
}

function _ascNormalizeLyriaLiveModel(model = "") {
  const raw = String(model || "").trim().toLowerCase().replace(/^models\//, "");
  const safe = (raw === "lyria-002" || raw === "lyria-realtime-exp") ? raw : "lyria-realtime-exp";
  return `models/${safe}`;
}

function _ascLogLyriaDebug(event = "", payload = {}) {
  const ts = new Date().toISOString();
  const entry = { ts, event: String(event || "").trim(), ...(payload || {}) };
  try {
    window.__CB_LYRIA_DEBUG__ = window.__CB_LYRIA_DEBUG__ || [];
    window.__CB_LYRIA_DEBUG__.push(entry);
    if (window.__CB_LYRIA_DEBUG__.length > 200) window.__CB_LYRIA_DEBUG__.splice(0, window.__CB_LYRIA_DEBUG__.length - 200);
  } catch (_) {}
  const debugOn = (
    String(localStorage.getItem("cb_lyria_debug") || "").trim().toLowerCase() === "true" &&
    window.__CB_SHOW_LYRIA_CONSOLE__ === true
  );
  if (debugOn) {
    try {
      console.log("[LyriaDebug]", entry);
    } catch (_) {}
  }
}

window.cbGetLyriaDebug = function cbGetLyriaDebug() {
  try {
    return Array.isArray(window.__CB_LYRIA_DEBUG__) ? [...window.__CB_LYRIA_DEBUG__] : [];
  } catch (_) {
    return [];
  }
};

function _ascCompactLyriaPrompt(prompt = "", options = {}) {
  const clean = String(prompt || "")
    .replace(/\s+/g, " ")
    .replace(/reading excerpt:[^\.]*\./gi, "")
    .trim();
  return clean.slice(0, 900);
}

const ASC_LYRIA_SCALE_MAP = Object.freeze({
  C_MAJOR: "C_MAJOR_A_MINOR",
  A_MINOR: "C_MAJOR_A_MINOR",
  D_FLAT_MAJOR: "D_FLAT_MAJOR_B_FLAT_MINOR",
  B_FLAT_MINOR: "D_FLAT_MAJOR_B_FLAT_MINOR",
  D_MAJOR: "D_MAJOR_B_MINOR",
  B_MINOR: "D_MAJOR_B_MINOR",
  E_FLAT_MAJOR: "E_FLAT_MAJOR_C_MINOR",
  C_MINOR: "E_FLAT_MAJOR_C_MINOR",
  E_MAJOR: "E_MAJOR_D_FLAT_MINOR",
  D_FLAT_MINOR: "E_MAJOR_D_FLAT_MINOR",
  F_MAJOR: "F_MAJOR_D_MINOR",
  D_MINOR: "F_MAJOR_D_MINOR",
  G_FLAT_MAJOR: "G_FLAT_MAJOR_E_FLAT_MINOR",
  E_FLAT_MINOR: "G_FLAT_MAJOR_E_FLAT_MINOR",
  G_MAJOR: "G_MAJOR_E_MINOR",
  E_MINOR: "G_MAJOR_E_MINOR",
  A_FLAT_MAJOR: "A_FLAT_MAJOR_F_MINOR",
  F_MINOR: "A_FLAT_MAJOR_F_MINOR",
  A_MAJOR: "A_MAJOR_G_FLAT_MINOR",
  G_FLAT_MINOR: "A_MAJOR_G_FLAT_MINOR",
  B_FLAT_MAJOR: "B_FLAT_MAJOR_G_MINOR",
  G_MINOR: "B_FLAT_MAJOR_G_MINOR",
  B_MAJOR: "B_MAJOR_A_FLAT_MINOR",
  A_FLAT_MINOR: "B_MAJOR_A_FLAT_MINOR",
  C_MAJOR_A_MINOR: "C_MAJOR_A_MINOR",
  D_FLAT_MAJOR_B_FLAT_MINOR: "D_FLAT_MAJOR_B_FLAT_MINOR",
  D_MAJOR_B_MINOR: "D_MAJOR_B_MINOR",
  E_FLAT_MAJOR_C_MINOR: "E_FLAT_MAJOR_C_MINOR",
  E_MAJOR_D_FLAT_MINOR: "E_MAJOR_D_FLAT_MINOR",
  F_MAJOR_D_MINOR: "F_MAJOR_D_MINOR",
  G_FLAT_MAJOR_E_FLAT_MINOR: "G_FLAT_MAJOR_E_FLAT_MINOR",
  G_MAJOR_E_MINOR: "G_MAJOR_E_MINOR",
  A_FLAT_MAJOR_F_MINOR: "A_FLAT_MAJOR_F_MINOR",
  A_MAJOR_G_FLAT_MINOR: "A_MAJOR_G_FLAT_MINOR",
  B_FLAT_MAJOR_G_MINOR: "B_FLAT_MAJOR_G_MINOR",
  B_MAJOR_A_FLAT_MINOR: "B_MAJOR_A_FLAT_MINOR",
});

const ASC_LYRIA_ALLOWED_SCALES = new Set(Object.values(ASC_LYRIA_SCALE_MAP));

function _ascNormalizeLyriaScale(value = "") {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  return String(ASC_LYRIA_SCALE_MAP[raw] || "");
}

async function _ascProbeLyriaModelAccess(model = "lyria-realtime-exp") {
  const name = String(model || "").trim().replace(/^models\//, "");
  try {
    const user = auth.currentUser;
    const token = user ? await user.getIdToken() : "";
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(buildApiUrl("/api/gemini/models"), { method: "GET", headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = String(data?.error?.message || data?.error || `HTTP ${res.status}`);
      return { ok: false, status: res.status, reason: "http_error", message: msg };
    }
    const models = Array.isArray(data?.models) ? data.models : [];
    const found = models.find((m) => String(m?.name || "").replace(/^models\//, "") === name);
    if (!found) {
      return { ok: false, status: 404, reason: "unknown_in_catalog", message: `Model ${name} no aparece en catálogo.` };
    }
    return { ok: true, modelName: String(found?.name || `models/${name}`) };
  } catch (err) {
    return { ok: false, reason: "network_error", message: String(err?.message || err || "") };
  }
}

async function _ascGenerateLyriaPcmTrack(prompt = "", options = {}) {
  void prompt;
  void options;
  throw new Error("La generación directa de Lyria en navegador fue deshabilitada por seguridad. Usa el endpoint backend /api/gemini/lyria/generate.");
}

async function _ascGenerateBestLyriaTrack(prompt = "", options = {}) {
  const sampleCount = Math.max(1, Math.min(4, Number(options?.sampleCount || 1)));
  const preferredModel = _ascNormalizeLyriaLiveModel(String(options?.model || "lyria-realtime-exp"));
  const allowModelFallback = options?.allowModelFallback === true;
  const modelOrder = allowModelFallback
    ? (preferredModel.includes("lyria-002")
      ? ["models/lyria-002", "models/lyria-realtime-exp"]
      : ["models/lyria-realtime-exp", "models/lyria-002"])
    : [preferredModel];
  let best = null;
  let bestScore = -9999;
  let lastErr = null;
  for (const model of modelOrder) {
    _ascLogLyriaDebug("best:try_model", { model, sampleCount });
    for (let i = 0; i < sampleCount; i += 1) {
      const seedBase = Number(options?.seed);
      const seed = Number.isFinite(seedBase) ? (seedBase + i) : null;
      try {
        _ascLogLyriaDebug("best:try_take", { model, take: i + 1, seed });
        const take = await _ascGenerateLyriaPcmTrack(prompt, { ...options, model, seed });
        const score = _ascScoreMusicalStructureFromPcm(
          take?.pcm || new Uint8Array(0),
          Number(take?.sampleRateHz || 48000),
          Number(take?.channels || 2)
        );
        if (!best || score > bestScore) {
          best = take;
          bestScore = score;
        }
        _ascLogLyriaDebug("best:take_ok", { model, take: i + 1, pcmBytes: Number(take?.pcm?.length || 0), score });
      } catch (err) {
        lastErr = err;
        _ascLogLyriaDebug("best:take_err", { model, take: i + 1, seed, message: String(err?.message || err || "") });
        try {
          // Retry once with compacted user prompt only (no hardcoded internal style prompt).
          const safePrompt = String(prompt || "").replace(/\s+/g, " ").trim().slice(0, 220);
          if (!safePrompt) throw err;
          _ascLogLyriaDebug("best:retry_safe_prompt", { model, take: i + 1, seed, safePrompt });
          const takeRetry = await _ascGenerateLyriaPcmTrack(safePrompt, { ...options, model, seed });
          const retryScore = _ascScoreMusicalStructureFromPcm(
            takeRetry?.pcm || new Uint8Array(0),
            Number(takeRetry?.sampleRateHz || 48000),
            Number(takeRetry?.channels || 2)
          );
          if (!best || retryScore > bestScore) {
            best = takeRetry;
            bestScore = retryScore;
          }
          _ascLogLyriaDebug("best:retry_ok", { model, take: i + 1, pcmBytes: Number(takeRetry?.pcm?.length || 0), score: retryScore });
        } catch (retryErr) {
          lastErr = retryErr;
          _ascLogLyriaDebug("best:retry_err", { model, take: i + 1, seed, message: String(retryErr?.message || retryErr || "") });
        }
      }
    }
    if (best) break;
  }
  if (!best) {
    const finalMessage = String(lastErr?.message || lastErr || "No se pudo obtener audio de Lyria en frontend.");
    _ascLogLyriaDebug("best:failed", { message: finalMessage });
    throw new Error(finalMessage);
  }
  const wavBlob = _ascPcm16ToWavBlob(
    best?.pcm || new Uint8Array(0),
    Number(best?.sampleRateHz || 48000),
    Number(best?.channels || 2)
  );
  return { wavBlob, model: String(best?.model || preferredModel) };
}

async function _ascGenerateAudioViaGeminiApi(prompt = "", tag = "", options = {}) {
  const model = String(localStorage.getItem("cb_frontend_audio_model") || "gemini-2.5-flash-preview-tts").trim();
  const nonce = String(options?.nonce || _ascMusicNonce(options?.forceVariation === true));
  const finalPrompt = [
    "Generate audio only. Instrumental only. No vocals.",
    tag ? `Style: ${tag}` : "",
    `Variation nonce: ${nonce}`,
    String(prompt || "").trim()
  ].filter(Boolean).join("\n");
  const { response, data } = await _ascGeminiGenerateViaBackend(model, {
    contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      temperature: Number.isFinite(Number(options?.temperature)) ? Number(options.temperature) : 1.2
    }
  });
  if (!response.ok) throw new Error(String(data?.error?.message || data?.error || `Gemini audio HTTP ${response.status}`));
  const inline = _ascExtractInlineAudioPart(data);
  if (!inline) throw new Error("Gemini no devolvió audio inline.");
  const sampleRateMatch = String(inline.mime || "").match(/rate=(\d+)/i);
  const sampleRate = Number(sampleRateMatch?.[1] || 24000);
  const pcm = _ascDecodeBase64ToBytes(inline.b64);
  const wavBlob = _ascPcm16ToWavBlob(pcm, Number.isFinite(sampleRate) ? sampleRate : 24000, 1);
  return { wavBlob, model };
}

async function _ascGenerateMusicTrackDirect(prompt = "", tag = "", options = {}) {
  if (_ascIsStaticLocalDev()) {
    const mode = String(options?.mode || "").trim().toLowerCase();
    const energetic = mode === "game";
    const forceVariation = options?.forceVariation === true;
    const nonce = String(options?.nonce || _ascMusicNonce(forceVariation));
    const variant = _ascPickMusicVariant(energetic, `${nonce}|${String(prompt || "").slice(0, 140)}`);
    const lyriaConfig = (options?.lyriaConfig && typeof options.lyriaConfig === "object") ? options.lyriaConfig : {};
    const trackProfile = (options?.trackProfile && typeof options.trackProfile === "object") ? options.trackProfile : {};
    const vocalModeNorm = String(trackProfile?.vocalMode || "").trim().toLowerCase();
    const styleMix = `${String(trackProfile?.genre || "").toLowerCase()} ${String(trackProfile?.prompt || "").toLowerCase()}`;
    const wantsBaroque = /(barroc|baroque|bach|vivaldi|handel|haendel)/.test(styleMix);
    const wantsMozart = /(mozart|clasico|clasicismo|classical era|viennese)/.test(styleMix);
    const wantsOrchestra = /(orquest|orchestra|symphon|sinfon|ensemble|camerata)/.test(styleMix);
    const wantsComplexClassical = !energetic && (wantsBaroque || wantsMozart || wantsOrchestra);
    const modelRaw = String(lyriaConfig?.model || localStorage.getItem("cb_lyria_model") || "lyria-realtime-exp").trim();
    const model = (modelRaw === "lyria-002" || modelRaw === "lyria-realtime-exp") ? modelRaw : "lyria-realtime-exp";
    const modeBpmRaw = energetic
      ? Number(lyriaConfig?.gameBpm || localStorage.getItem("cb_lyria_game_bpm") || 156)
      : Number(lyriaConfig?.bpm || localStorage.getItem("cb_lyria_bpm") || 76);
    let modeBpm = Number.isFinite(modeBpmRaw) ? Math.max(60, Math.min(200, Math.round(modeBpmRaw))) : (energetic ? 156 : 76);
    if (energetic) {
      const toneNorm = String(trackProfile?.tone || "").trim().toLowerCase();
      if (toneNorm === "alegre" || toneNorm === "epico") modeBpm = Math.max(modeBpm, 166);
      if (toneNorm === "tenso") modeBpm = Math.max(modeBpm, 172);
    }
    const modeNegativePrompt = energetic
      ? String(
          lyriaConfig?.negativePromptGame ||
          localStorage.getItem("cb_lyria_negative_prompt_game") ||
          "cheap GM midi, toy keyboard, thin soundfont, harsh aliasing, low fidelity, clipping, noisy crackle"
        )
      : String(
          lyriaConfig?.negativePromptReading ||
          lyriaConfig?.negativePrompt ||
          localStorage.getItem("cb_lyria_negative_prompt") ||
          "cheap GM midi, toy piano, thin soundfont, artificial plastic timbre, low fidelity, clipped mix, noisy crackle"
        );
    const modeGuidance = energetic
      ? Number(lyriaConfig?.guidanceGame || lyriaConfig?.guidance || 4)
      : Number(lyriaConfig?.guidanceReading || lyriaConfig?.guidance || 4);
    const modeDensity = energetic
      ? Number(lyriaConfig?.densityGame || lyriaConfig?.density || 0.5)
      : Number(lyriaConfig?.densityReading || lyriaConfig?.density || 0.5);
    const modeBrightness = energetic
      ? Number(lyriaConfig?.brightnessGame || lyriaConfig?.brightness || 0.7)
      : Number(lyriaConfig?.brightnessReading || lyriaConfig?.brightness || 0.7);
    const modeTemperature = energetic
      ? Number(lyriaConfig?.temperatureGame || lyriaConfig?.temperature || 1.2)
      : Number(lyriaConfig?.temperatureReading || lyriaConfig?.temperature || 1.2);
    const configuredDurationRaw = Number(lyriaConfig?.durationMs || localStorage.getItem("cb_lyria_duration_ms") || 30000);
    const configuredDuration = Number.isFinite(configuredDurationRaw)
      ? Math.max(12000, Math.min(70000, Math.round(configuredDurationRaw)))
      : 30000;
    const modeWeightedPrompts = [
      { text: String(prompt || "").trim(), weight: 1.2 },
      trackProfile?.genre ? { text: `Genre: ${String(trackProfile.genre || "").trim()}`, weight: 1.0 } : null,
      trackProfile?.tone ? { text: `Tone: ${String(trackProfile.tone || "").trim()}`, weight: 1.0 } : null,
      trackProfile?.vocalMode ? { text: `Voice mode: ${String(trackProfile.vocalMode || "").trim()}`, weight: 1.0 } : null,
      { text: "Production quality: realistic timbre, high fidelity, natural dynamics, no toy-midi character.", weight: 1.18 },
      { text: "Humanized performance with articulation and expressive micro-variation, avoid robotic quantization.", weight: 1.12 },
      ..._ascBuildAdvancedStyleHints(trackProfile, energetic),
      ..._ascBuildExpressiveIntentHints(trackProfile, energetic),
      ..._ascBuildPerInstrumentIntentHints(trackProfile, energetic),
    ].filter(Boolean);
    const timelineSections = _ascBuildSongSections(energetic, String(prompt || ""), trackProfile);
    const baseSeed = Number(lyriaConfig?.seed);
    const seed = Number.isFinite(baseSeed) ? (
      forceVariation ? (Math.max(0, Math.floor(baseSeed)) + (_ascHashSeedFromText(nonce) % 1000000)) : Math.max(0, Math.floor(baseSeed))
    ) : null;
    try {
      const tunedGuidance = wantsComplexClassical ? Math.max(modeGuidance, 5.9) : modeGuidance;
      const tunedDensity = wantsComplexClassical ? Math.max(modeDensity, 0.74) : modeDensity;
      const tunedBrightness = wantsComplexClassical ? Math.min(Math.max(modeBrightness, 0.56), 0.68) : modeBrightness;
      const tunedTemperature = wantsComplexClassical ? Math.min(modeTemperature, 0.86) : modeTemperature;
      return await _ascGenerateBestLyriaTrack(`${prompt}\nVariation nonce: ${nonce}\nVariation profile: ${variant}`, {
        model,
        sampleCount: Number(lyriaConfig?.sampleCount || 1),
        seed,
        negativePrompt: String(modeNegativePrompt || "").trim(),
        guidance: tunedGuidance,
        bpm: modeBpm,
        density: tunedDensity,
        brightness: tunedBrightness,
        temperature: tunedTemperature,
        scale: String(lyriaConfig?.scale || ""),
        durationMs: configuredDuration,
        energetic,
        weightedPrompts: modeWeightedPrompts,
        timelineSections,
        musicGenerationMode: vocalModeNorm.includes("voz") ? "VOCALIZATION" : (energetic ? "DIVERSITY" : "QUALITY"),
        muteDrums: energetic ? false : (String(trackProfile?.genre || "").toLowerCase().includes("orquest") || String(trackProfile?.genre || "").toLowerCase().includes("clas")),
        muteBass: energetic ? false : (String(trackProfile?.genre || "").toLowerCase().includes("orquest") || String(trackProfile?.genre || "").toLowerCase().includes("clas"))
      });
    } catch (lyriaErr) {
      const allowSynthFallback = false;
      if (!allowSynthFallback) {
        throw new Error(`Lyria frontend falló y el fallback synth está desactivado. ${String(lyriaErr?.message || lyriaErr || "").trim()}`);
      }
      const profile = await _ascAnalyzeMusicProfileWithGemini({ prompt, energetic }).catch(() => null);
      const wavBlob = await _ascGenerateProceduralMusicBlob({ prompt, energetic, profile, nonce, variant });
      return { wavBlob, model: `local-procedural-${energetic ? "game" : "classical"}-gemini-profile-${variant}` };
    }
  }
  const model = "gemini-2.5-flash-preview-tts";
  const finalPrompt = [
    "Generate audio only.",
    "No spoken words, no lyrics, no narration.",
    "Keep it musical and atmospheric.",
    tag ? `Style target: ${tag}.` : "",
    String(prompt || "").trim()
  ].filter(Boolean).join("\n");
  const { response, data } = await _ascGeminiGenerateViaBackend(model, {
    contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      temperature: 0.75,
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } }
      }
    }
  });
  if (!response.ok) {
    throw new Error(String(data?.error?.message || data?.error || `Gemini audio HTTP ${response.status}`));
  }
  const inline = _ascExtractInlineAudioPart(data);
  if (!inline) {
    const energetic = /energetic|electronic|game/i.test(String(tag || ""));
    const forceVariation = options?.forceVariation === true;
    const nonce = String(options?.nonce || _ascMusicNonce(forceVariation));
    const variant = _ascPickMusicVariant(energetic, `${nonce}|${tag}`);
    const wavBlob = await _ascGenerateProceduralMusicBlob({ prompt: finalPrompt, energetic, nonce, variant });
    return { wavBlob, model: `${model}-fallback-procedural` };
  }
  const sampleRateMatch = String(inline.mime || "").match(/rate=(\d+)/i);
  const sampleRate = Number(sampleRateMatch?.[1] || 24000);
  const pcm = _ascDecodeBase64ToBytes(inline.b64);
  const wavBlob = _ascPcm16ToWavBlob(pcm, Number.isFinite(sampleRate) ? sampleRate : 24000, 1);
  return { wavBlob, model };
}

async function _ascUploadMusicLocalBlob({ sourceCollection = "lecturasASC", lecturaId = "", mode = "reading", blob = null, versionTag = "" } = {}) {
  const safeMode = mode === "game" ? "game" : "reading";
  const safeTag = String(versionTag || `${Date.now()}-${Math.floor(Math.random() * 1e6)}`)
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 48) || `${Date.now()}`;
  const path = `lecturas_music/${sourceCollection}/${lecturaId}/${safeMode}-local-${safeTag}.wav`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, blob, {
    contentType: "audio/wav",
    cacheControl: "no-cache, max-age=0"
  });
  const url = await getDownloadURL(ref);
  return { path, url };
}

function _ascGuessAudioExtension(file = null) {
  const name = String(file?.name || "").trim().toLowerCase();
  const mime = String(file?.type || "").trim().toLowerCase();
  const extFromName = name.includes(".") ? name.split(".").pop() : "";
  const allow = new Set(["wav", "mp3", "ogg", "m4a", "aac", "flac", "webm"]);
  if (allow.has(extFromName)) return extFromName;
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("flac")) return "flac";
  if (mime.includes("webm")) return "webm";
  return "wav";
}

function _ascValidateManualAudioFile(file = null, label = "archivo") {
  if (!(file instanceof File)) throw new Error(`No se recibió ${label}.`);
  const size = Number(file.size || 0);
  if (!size) throw new Error(`${label} está vacío.`);
  const maxBytes = 30 * 1024 * 1024;
  if (size > maxBytes) throw new Error(`${label} supera 30MB.`);
  const mime = String(file.type || "").toLowerCase();
  const ext = _ascGuessAudioExtension(file);
  const allowedExt = new Set(["wav", "mp3", "ogg", "m4a", "aac", "flac", "webm"]);
  if (!mime.startsWith("audio/") && !allowedExt.has(ext)) {
    throw new Error(`${label} debe ser audio (wav, mp3, ogg, m4a, aac, flac o webm).`);
  }
}

async function _ascUploadMusicUserFile({ sourceCollection = "lecturasASC", lecturaId = "", mode = "reading", file = null, versionTag = "" } = {}) {
  const safeMode = mode === "game" ? "game" : "reading";
  const ext = _ascGuessAudioExtension(file);
  const safeTag = String(versionTag || `${Date.now()}-${Math.floor(Math.random() * 1e6)}`)
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 48) || `${Date.now()}`;
  const path = `lecturas_music/${sourceCollection}/${lecturaId}/${safeMode}-manual-${safeTag}.${ext}`;
  const ref = storageRef(storage, path);
  const contentType = String(file?.type || "").trim() || `audio/${ext === "mp3" ? "mpeg" : ext}`;
  await uploadBytes(ref, file, {
    contentType,
    cacheControl: "no-cache, max-age=0"
  });
  const url = await getDownloadURL(ref);
  return { path, url, contentType };
}

async function _ascUploadManualMusicForLectura(row = {}, options = {}) {
  const lecturaId = String(row?.id || "").trim();
  if (!lecturaId) throw new Error("No se pudo identificar la lectura.");
  const sourceCollection = String(options?.sourceCollection || row?.sourceCollection || "lecturasASC").trim() || "lecturasASC";
  const readingFile = options?.readingFile || null;
  const gameFile = options?.gameFile || null;
  if (!readingFile && !gameFile) throw new Error("Debes subir al menos un archivo (lectura o game).");
  const musicConfig = _ascNormalizeMusicProfile(options?.musicConfig || _ascExtractStoredMusicConfig(row));
  const currentAssets = _ascExtractMusicAssets(row);
  if (readingFile) _ascValidateManualAudioFile(readingFile, "audio de lectura");
  if (gameFile) _ascValidateManualAudioFile(gameFile, "audio de game");
  const nonceBase = `manual-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [readingUpload, gameUpload] = await Promise.all([
    readingFile
      ? _ascUploadMusicUserFile({ sourceCollection, lecturaId, mode: "reading", file: readingFile, versionTag: `${nonceBase}-r` })
      : Promise.resolve(null),
    gameFile
      ? _ascUploadMusicUserFile({ sourceCollection, lecturaId, mode: "game", file: gameFile, versionTag: `${nonceBase}-g` })
      : Promise.resolve(null)
  ]);
  if (readingFile && currentAssets.readingPath && currentAssets.readingPath !== readingUpload?.path) {
    deleteObject(storageRef(storage, currentAssets.readingPath)).catch(() => {});
  }
  if (gameFile && currentAssets.gamePath && currentAssets.gamePath !== gameUpload?.path) {
    deleteObject(storageRef(storage, currentAssets.gamePath)).catch(() => {});
  }
  const generatedAt = new Date().toISOString();
  const nextReadingUrl = String(readingUpload?.url || currentAssets.readingUrl || "").trim();
  const nextGameUrl = String(gameUpload?.url || currentAssets.gameUrl || "").trim();
  const nextReadingPath = String(readingUpload?.path || currentAssets.readingPath || "").trim();
  const nextGamePath = String(gameUpload?.path || currentAssets.gamePath || "").trim();
  await updateDoc(doc(db, sourceCollection, lecturaId), {
    music: {
      model: "manual-upload",
      generatedAt,
      generatedBy: String(auth.currentUser?.uid || ""),
      readingUrl: nextReadingUrl,
      gameUrl: nextGameUrl,
      readingPath: nextReadingPath,
      gamePath: nextGamePath,
      readingContentType: String(readingUpload?.contentType || row?.music?.readingContentType || "").trim(),
      gameContentType: String(gameUpload?.contentType || row?.music?.gameContentType || "").trim(),
      variationNonce: nonceBase,
      musicConfig,
      source: "manual-upload"
    }
  });
  const idx = cache.findIndex((x) => String(x?.id || "") === lecturaId);
  if (idx >= 0) {
    const rowCache = cache[idx] || {};
    rowCache.music = {
      ...(rowCache.music || {}),
      readingUrl: nextReadingUrl,
      gameUrl: nextGameUrl,
      readingPath: nextReadingPath,
      gamePath: nextGamePath,
      generatedAt,
      variationNonce: nonceBase,
      musicConfig,
      source: "manual-upload",
      model: "manual-upload"
    };
    cache[idx] = rowCache;
  }
  return {
    ok: true,
    source: "manual-upload",
    model: "manual-upload",
    generatedAt,
    variationNonce: nonceBase,
    readingUrl: nextReadingUrl,
    gameUrl: nextGameUrl,
    readingPath: nextReadingPath,
    gamePath: nextGamePath,
    musicConfig
  };
}

async function _ascDeleteMusicAssetsForLectura(row = {}, sourceCollection = "lecturasASC") {
  const lecturaId = String(row?.id || "").trim();
  if (!lecturaId) throw new Error("No se pudo identificar la lectura.");
  const paths = _ascCollectMusicStoragePaths(row);
  await Promise.all(paths.map(async (p) => {
    try {
      await deleteObject(storageRef(storage, p));
    } catch (_) {
      // ignore not-found or permission edge cases; continue cleanup
    }
  }));
  await updateDoc(doc(db, sourceCollection, lecturaId), {
    music: deleteField()
  });
  const idx = cache.findIndex((x) => String(x?.id || "") === lecturaId);
  if (idx >= 0) {
    const next = {...(cache[idx] || {})};
    delete next.music;
    cache[idx] = next;
  }
  return { ok: true, deletedPaths: paths.length };
}

async function _ascGenerateMusicForLecturaDirectLocal(row = {}, options = {}) {
  const lecturaId = String(row?.id || "").trim();
  const sourceCollection = String(options?.sourceCollection || row?.sourceCollection || "lecturasASC").trim() || "lecturasASC";
  const force = options?.force === true;
  const resolved = _ascResolveMusicPromptInputs(row, options);
  const promptReading = resolved.promptReading;
  const promptGame = resolved.promptGame;
  const musicConfig = resolved.musicConfig;
  const lyriaConfig = options?.lyriaConfig || _ascBuildLyriaRuntimeConfig(row);
  const nonceBase = _ascMusicNonce(force);
  if (force) {
    await _ascDeleteMusicAssetsForLectura(row, sourceCollection).catch(() => {});
  }
  const [readingTrack, gameTrack] = await Promise.all([
    _ascGenerateMusicTrackDirect(`${promptReading}\nVariation nonce: ${nonceBase}-reading`, "reading", {
      mode: "reading",
      trackProfile: musicConfig?.reading || {},
      nonce: `${nonceBase}-reading`,
      forceVariation: force,
      lyriaConfig
    }),
    _ascGenerateMusicTrackDirect(`${promptGame}\nVariation nonce: ${nonceBase}-game`, "game", {
      mode: "game",
      trackProfile: musicConfig?.game || {},
      nonce: `${nonceBase}-game`,
      forceVariation: force,
      lyriaConfig
    })
  ]);
  const [readingLoopableBlob, gameLoopableBlob] = await Promise.all([
    _ascMakeWavLoopable(readingTrack.wavBlob, { fadeSec: 1.3 }),
    _ascMakeWavLoopable(gameTrack.wavBlob, { fadeSec: 0.95 })
  ]);
  const [readingUpload, gameUpload] = await Promise.all([
    _ascUploadMusicLocalBlob({ sourceCollection, lecturaId, mode: "reading", blob: readingLoopableBlob, versionTag: `${nonceBase}-r` }),
    _ascUploadMusicLocalBlob({ sourceCollection, lecturaId, mode: "game", blob: gameLoopableBlob, versionTag: `${nonceBase}-g` })
  ]);
  const generatedAt = new Date().toISOString();
  await updateDoc(doc(db, sourceCollection, lecturaId), {
    music: {
      model: "gemini-2.5-flash-preview-tts",
      generatedAt,
      generatedBy: String(auth.currentUser?.uid || ""),
      readingUrl: readingUpload.url,
      gameUrl: gameUpload.url,
      readingPath: readingUpload.path,
      gamePath: gameUpload.path,
      promptReading,
      promptGame,
      musicConfig,
      variationNonce: nonceBase,
      lyriaConfig,
      durationMs: Number(lyriaConfig?.durationMs || 30000),
      source: "frontend-direct-local"
    }
  });
  return {
    ok: true,
    source: "frontend-direct-local",
    model: "gemini-2.5-flash-preview-tts",
    generatedAt,
    variationNonce: nonceBase,
    durationMs: Number(lyriaConfig?.durationMs || 30000),
    readingUrl: readingUpload.url,
    gameUrl: gameUpload.url,
    readingPath: readingUpload.path,
    gamePath: gameUpload.path,
    musicConfig
  };
}

function _ascBuildLyriaApiCandidates() {
  const path = "/api/gemini/lyria/generate";
  if (_ascIsStaticLocalDev()) {
    const candidates = [];
    const preferred = Number(localStorage.getItem("cb_functions_port") || "5001");
    const ports = [preferred, 5001, 5002, 5003, 5004, 5005, 4400];
    const uniquePorts = [...new Set(ports.filter((p) => Number.isFinite(p) && p > 0))];
    for (const p of uniquePorts) {
      candidates.push(`http://127.0.0.1:${p}/charly-brown/us-central1/api/gemini/lyria/generate`);
      candidates.push(`http://localhost:${p}/charly-brown/us-central1/api/gemini/lyria/generate`);
    }
    return candidates;
  }
  return [buildApiUrl(path)];
}

async function _ascGenerateMusicForLectura(row = {}, options = {}) {
  const lecturaId = String(row?.id || "").trim();
  if (!lecturaId) throw new Error("No se pudo identificar la lectura.");
  const sourceCollection = String(options?.sourceCollection || row?.sourceCollection || "lecturasASC").trim() || "lecturasASC";
  const force = options?.force === true;
  const resolved = _ascResolveMusicPromptInputs(row, options);
  const promptReading = resolved.promptReading;
  const promptGame = resolved.promptGame;
  const musicConfig = resolved.musicConfig;
  const lyriaConfig = options?.lyriaConfig || _ascBuildLyriaRuntimeConfig(row);
  const isLocal = _ascIsStaticLocalDev();
  if (isLocal) {
    return _ascGenerateMusicForLecturaDirectLocal(row, { sourceCollection, force, promptReading, promptGame, musicConfig, lyriaConfig });
  }
  const user = auth.currentUser;
  if (!user) throw new Error("Debes iniciar sesión.");
  const token = await user.getIdToken();
  let response = null;
  let data = {};
  let lastNetworkErr = null;
  const endpoints = _ascBuildLyriaApiCandidates();
  for (const endpoint of endpoints) {
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          lecturaId,
          sourceCollection,
          title: row?.titulo || "",
          level: row?.nivel || "",
          grade: row?.grado || "",
          html: row?.textoLectura || row?.contenidoHTML || row?.htmlLectura || "",
          promptReading,
          promptGame,
          musicConfig,
          lyriaConfig,
          force
        })
      });
      data = await response.json().catch(() => ({}));
      try {
        const parsed = new URL(endpoint);
        const port = Number(parsed.port || "0");
        if (port > 0) localStorage.setItem("cb_functions_port", String(port));
      } catch (_) {}
      break;
    } catch (err) {
      lastNetworkErr = err;
    }
  }
  if (!response) {
    throw (lastNetworkErr || new Error("No se pudo conectar al backend de música."));
  }
  if (!response.ok || data?.error) {
    if (response.status === 404 || response.status === 405) {
      throw new Error("La ruta de música no está disponible en este entorno. Para música se necesita backend `api`.");
    }
    throw new Error(String(data?.error || `No se pudo generar música (HTTP ${response.status}).`));
  }
  const readingUrl = String(data?.readingUrl || "").trim();
  const gameUrl = String(data?.gameUrl || "").trim();
  const readingPath = String(data?.readingPath || "").trim();
  const gamePath = String(data?.gamePath || "").trim();
  if (!readingUrl || !gameUrl) {
    throw new Error("No se recibieron ambos audios (lectura y game).");
  }
  const idx = cache.findIndex((x) => String(x?.id || "") === lecturaId);
  if (idx >= 0) {
    const rowCache = cache[idx] || {};
    rowCache.music = {
      ...(rowCache.music || {}),
      readingUrl,
      gameUrl,
      readingPath,
      gamePath,
      model: "lyria-realtime-exp",
      generatedAt: new Date().toISOString(),
      musicConfig
    };
    cache[idx] = rowCache;
  }
  return {readingUrl, gameUrl, readingPath, gamePath, musicConfig, source: String(data?.source || "generated")};
}
async function ensureXLSX(){
  if (window.XLSX) return;
  await new Promise((res, rej)=>{
    const s=document.createElement("script");
    s.src="vendor/xlsx/xlsx.full.min.js";
    s.onload=res; s.onerror=rej; document.head.appendChild(s);
  });
}

// Estado/refs
let ascModal, ascBackdrop, ascBtnCerrar, ascBtnNuevo, ascBtnImport, ascInputImport, ascBtnExport, ascBuscador;
let ascFiltroNivel, ascFiltroGrado, ascFiltroTrimestre, ascFiltroUnidad;
let ascTbody, ascVacio;

// ⤵️ Modal del editor (nuevo)
let ascEditorModal, ascEditorBackdrop, ascEditorClose, ascBtnCancelar, ascForm;
let ascEditorShell;
let ascId, ascSerie, ascNivel, ascGrado, ascTrimestre, ascUnidad, ascTitulo, ascTexto;
let ascTextoSingle, ascTextoAlumno, ascTextoMaestro, ascUnitDualCanvas;
let ascBtnGuardar, ascBtnDescargarWord;
let ascWordParagraphStyle, ascWordCharacterStyle;
let ascEditorFontFamily, ascEditorFontSize, ascEditorSheetSize, ascEditorFontColor, ascEditorHighlightColor;
let ascEditorZoomRange, ascEditorZoomLabel;
let ascQuestionModal, ascQuestionModalClose, ascQuestionModalDone, ascQuestionModalTitle;
let ascToggleMeta, ascToggleQuestions, ascToggleStyles;
let ascOpenSynonymsPanel, ascSynonymsPanel, ascSynonymsClose, ascSynonymsDone, ascSynonymsBody;
let ascAiAssistBtn, ascAiEditorModal, ascAiClose, ascAiPrompt, ascAiSend, ascAiChatList, ascAiScopePreview, ascAiRefreshScope, ascAiStatus;
let ascQuestionAiBtn, ascQuestionAiPanel, ascQuestionAiPreview, ascQuestionAiChat, ascQuestionAiPrompt, ascQuestionAiSend, ascQuestionAiStatus;
let ascUnitSubthemeList;
let ascWordExportModal, ascWordExportClose, ascExportAlumnoWord, ascExportMaestroWord;
let ascWordStylesList, ascWordStyleModifyBtn, ascWordStyleSelectAllBtn;
let ascWordStyleManagerModal, ascWordStyleManagerClose, ascWordStyleManagerApply, ascWordStyleManagerReset, ascWordStyleManagerSubtitle;
let ascWordStyleManagerName, ascWordStyleManagerSize, ascWordStyleManagerColor, ascWordStyleManagerAlign, ascWordStyleManagerBefore, ascWordStyleManagerAfter, ascWordStyleManagerIndent;
let ascWordStyleManagerBold, ascWordStyleManagerItalic, ascWordStyleManagerUnderline, ascWordStyleManagerHighlight;

let cache = [];
let MODO = "new";
let ascQuestionActiva = 0;
let ascEditorSheetSizeActual = "carta";
let ascEditorFontSizeActual = 18;
let ascEditorZoomActual = 100;
let ascAiScopeMode = "paragraph";
let ascAiScopeSnapshot = null;
let ascAiBusy = false;
let ascQuestionAiScope = "texto";
let ascQuestionAiBusy = false;
let ascSharedEditorContext = null;
let ascUnitEditorState = null;
let ascWordStyleDefinitions = normalizeStyleDefinitions(DEFAULT_STYLE_DEFINITIONS);
let ascWordSelectedStyleKey = "";
let ascWordSelectedStyleGroup = "paragraph";

// INIT
document.addEventListener("DOMContentLoaded", () => {
  // MODAL LISTA
  ascModal       = $("#ascModal");
  ascBackdrop    = $("#ascBackdrop");
  ascBtnCerrar   = $("#ascBtnCerrar");
  ascBtnNuevo    = $("#ascBtnNuevo");
  ascBtnImport   = $("#ascBtnImport");
  ascInputImport = $("#ascInputImport");
  ascBtnExport   = $("#ascBtnExport");
  ascBuscador    = $("#ascBuscador");
  ascFiltroNivel = $("#ascFiltroNivel");
  ascFiltroGrado = $("#ascFiltroGrado");
  ascFiltroTrimestre = $("#ascFiltroTrimestre");
  ascFiltroUnidad = $("#ascFiltroUnidad");
  ascTbody       = $("#ascTbody");
  ascVacio       = $("#ascVacio");

  // MODAL EDITOR (asegúrate de tener este HTML con estos IDs)
  ascEditorModal    = $("#ascEditorModal");
  ascEditorShell    = ascEditorModal?.querySelector(".asc-editor-shell") || null;
  ascEditorBackdrop = $("#ascEditorBackdrop");
  ascEditorClose    = $("#ascEditorClose");
  ascBtnCancelar    = $("#ascBtnCancelar");
  ascForm           = $("#ascForm");
  ascBtnGuardar     = $("#ascBtnGuardar");
  ascBtnDescargarWord = $("#ascBtnDescargarWord");
  ascWordParagraphStyle = $("#ascWordParagraphStyle");
  ascWordCharacterStyle = $("#ascWordCharacterStyle");
  ascWordStylesList = $("#ascWordStylesList");
  ascWordStyleModifyBtn = $("#ascWordStyleModifyBtn");
  ascWordStyleSelectAllBtn = $("#ascWordStyleSelectAllBtn");

  ascId        = $("#ascId");
  ascSerie     = $("#ascSerie");
  ascNivel     = $("#ascNivel");
  ascGrado     = $("#ascGrado");
  ascTrimestre = $("#ascTrimestre");
  ascUnidad    = $("#ascUnidad");
  ascTitulo    = $("#ascTitulo");
  ascTextoSingle = $("#ascTexto");
  ascTextoAlumno = $("#ascTextoAlumno");
  ascTextoMaestro = $("#ascTextoMaestro");
  ascUnitDualCanvas = $("#ascUnitDualCanvas");
  ascTexto     = ascTextoSingle;
  ascEditorFontFamily = $("#ascEditorFontFamily");
  ascEditorFontSize = $("#ascEditorFontSize");
  ascEditorSheetSize = $("#ascEditorSheetSize");
  ascEditorFontColor = $("#ascEditorFontColor");
  ascEditorHighlightColor = $("#ascEditorHighlightColor");
  ascEditorZoomRange = $("#ascEditorZoomRange");
  ascEditorZoomLabel = $("#ascEditorZoomLabel");
  ascQuestionModal = $("#ascQuestionModal");
  ascQuestionModalClose = $("#ascQuestionModalClose");
  ascQuestionModalDone = $("#ascQuestionModalDone");
  ascQuestionModalTitle = $("#ascQuestionModalTitle");
  ascToggleMeta = $("#ascToggleMeta");
  ascToggleQuestions = $("#ascToggleQuestions");
  ascToggleStyles = $("#ascToggleStyles");
  ascOpenSynonymsPanel = $("#ascOpenSynonymsPanel");
  ascSynonymsPanel = $("#ascSynonymsPanel");
  ascSynonymsClose = $("#ascSynonymsClose");
  ascSynonymsDone = $("#ascSynonymsDone");
  ascSynonymsBody = $("#ascSynonymsBody");
  ascAiAssistBtn = $("#ascAiAssistBtn");
  ascAiEditorModal = $("#ascAiEditorModal");
  ascAiClose = $("#ascAiClose");
  ascAiPrompt = $("#ascAiPrompt");
  ascAiSend = $("#ascAiSend");
  ascAiChatList = $("#ascAiChatList");
  ascAiScopePreview = $("#ascAiScopePreview");
  ascAiRefreshScope = $("#ascAiRefreshScope");
  ascAiStatus = $("#ascAiStatus");
  ascQuestionAiBtn = $("#ascQuestionAiBtn");
  ascQuestionAiPanel = $("#ascQuestionAiPanel");
  ascQuestionAiPreview = $("#ascQuestionAiPreview");
  ascQuestionAiChat = $("#ascQuestionAiChat");
  ascQuestionAiPrompt = $("#ascQuestionAiPrompt");
  ascQuestionAiSend = $("#ascQuestionAiSend");
  ascQuestionAiStatus = $("#ascQuestionAiStatus");
  ascUnitSubthemeList = $("#ascUnitSubthemeList");
  ascWordExportModal = $("#ascWordExportModal");
  ascWordExportClose = $("#ascWordExportClose");
  ascExportAlumnoWord = $("#ascExportAlumnoWord");
  ascExportMaestroWord = $("#ascExportMaestroWord");
  ascWordStyleManagerModal = $("#ascWordStyleManagerModal");
  ascWordStyleManagerClose = $("#ascWordStyleManagerClose");
  ascWordStyleManagerApply = $("#ascWordStyleManagerApply");
  ascWordStyleManagerReset = $("#ascWordStyleManagerReset");
  ascWordStyleManagerSubtitle = $("#ascWordStyleManagerSubtitle");
  ascWordStyleManagerName = $("#ascWordStyleManagerName");
  ascWordStyleManagerSize = $("#ascWordStyleManagerSize");
  ascWordStyleManagerColor = $("#ascWordStyleManagerColor");
  ascWordStyleManagerAlign = $("#ascWordStyleManagerAlign");
  ascWordStyleManagerBefore = $("#ascWordStyleManagerBefore");
  ascWordStyleManagerAfter = $("#ascWordStyleManagerAfter");
  ascWordStyleManagerIndent = $("#ascWordStyleManagerIndent");
  ascWordStyleManagerBold = $("#ascWordStyleManagerBold");
  ascWordStyleManagerItalic = $("#ascWordStyleManagerItalic");
  ascWordStyleManagerUnderline = $("#ascWordStyleManagerUnderline");
  ascWordStyleManagerHighlight = $("#ascWordStyleManagerHighlight");

  // Botón externo que abre el modal lista
  document.getElementById("btnLecturasAsc")?.addEventListener("click", openAscModal);

  // Eventos LISTA
  ascBtnCerrar?.addEventListener("click", closeAscModal);
  ascBackdrop?.addEventListener("click", closeAscModal);
  document.addEventListener("keydown", (e)=>{
    if (e.key !== "Escape") return;
    if (ascSynonymsPanel && !ascSynonymsPanel.classList.contains("hidden")) {
      closeAscSynonymsPanel();
      return;
    }
    if (ascQuestionModal && !ascQuestionModal.classList.contains("hidden")) {
      closePreguntaModalAsc();
      return;
    }
    if (ascWordExportModal && !ascWordExportModal.classList.contains("hidden")) {
      closeAscWordExportModal();
      return;
    }
    if (ascWordStyleManagerModal && !ascWordStyleManagerModal.classList.contains("hidden")) {
      closeAscWordStyleManagerModal();
      return;
    }
    closeAscModal();
    closeEditorModal();
  });

  ascBtnNuevo?.addEventListener("click", openEditorNew);
  ascBtnImport?.addEventListener("click", ()=> ascInputImport?.click());
  ascInputImport?.addEventListener("change", async (ev)=>{
    const file = ev.target.files?.[0]; if(!file) return;
    await importarXlsx(file);
    ev.target.value="";
  });
  ascBtnExport?.addEventListener("click", exportarXlsx);
  ascBuscador?.addEventListener("input", aplicarFiltrosAsc);
  ascFiltroNivel?.addEventListener("change", aplicarFiltrosAsc);
  ascFiltroGrado?.addEventListener("change", aplicarFiltrosAsc);
  ascFiltroTrimestre?.addEventListener("change", aplicarFiltrosAsc);
  ascFiltroUnidad?.addEventListener("change", aplicarFiltrosAsc);

  // Eventos EDITOR
  ascEditorClose?.addEventListener("click", closeEditorModal);
  ascEditorBackdrop?.addEventListener("click", closeEditorModal);
  ascBtnCancelar?.addEventListener("click", closeEditorModal);
  ascBtnDescargarWord?.addEventListener("click", onAscDescargarWordEditor);
  ascWordStyleModifyBtn?.addEventListener("click", openAscWordStyleManagerModal);
  ascWordStyleSelectAllBtn?.addEventListener("click", seleccionarTodoEstiloWordActual);
  ascQuestionModalClose?.addEventListener("click", closePreguntaModalAsc);
  ascQuestionModalDone?.addEventListener("click", closePreguntaModalAsc);
  ascWordExportClose?.addEventListener("click", closeAscWordExportModal);
  ascExportAlumnoWord?.addEventListener("click", () => {
    closeAscWordExportModal();
    exportarAscUnidadWord("alumno");
  });
  ascExportMaestroWord?.addEventListener("click", () => {
    closeAscWordExportModal();
    exportarAscUnidadWord("maestro");
  });
  ascWordExportModal?.addEventListener("click", (e) => {
    if (e.target === ascWordExportModal) closeAscWordExportModal();
  });
  ascWordStyleManagerClose?.addEventListener("click", closeAscWordStyleManagerModal);
  ascWordStyleManagerApply?.addEventListener("click", aplicarCambiosAscWordStyleManager);
  ascWordStyleManagerReset?.addEventListener("click", restablecerAscWordStyleSeleccionado);
  ascWordStyleManagerModal?.addEventListener("click", (e) => {
    if (e.target === ascWordStyleManagerModal) closeAscWordStyleManagerModal();
  });
  ascQuestionAiBtn?.addEventListener("click", toggleAscQuestionAiPanel);
  ascQuestionAiSend?.addEventListener("click", enviarAscQuestionAiPrompt);
  ascToggleMeta?.addEventListener("click", () => toggleMetaAsc());
  ascToggleQuestions?.addEventListener("click", () => togglePreguntasAsc());
  ascToggleStyles?.addEventListener("click", () => toggleStylesAsc());
  ascOpenSynonymsPanel?.addEventListener("click", openAscSynonymsPanel);
  ascSynonymsClose?.addEventListener("click", closeAscSynonymsPanel);
  ascSynonymsDone?.addEventListener("click", closeAscSynonymsPanel);
  ascSynonymsBody?.addEventListener("input", (e) => {
    const table = e.target?.closest?.("table.lectura-tabla-sinonimos");
    if (!table) return;
    const wrap = table.closest("[data-synonym-table-index]");
    const idx = Number(wrap?.getAttribute("data-synonym-table-index") || 0);
    syncAscSynonymsTableToEditor(idx, table.outerHTML);
  });
  ascEditorModal?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("[data-unit-section-open]");
    if (!btn) return;
    e.preventDefault();
    cambiarAscUnidadSeccion(btn.getAttribute("data-unit-section-open") || "alumno");
  });
  ascEditorModal?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("[data-unit-subtheme-index]");
    if (!btn) return;
    e.preventDefault();
    cambiarAscUnidadSubtema(Number(btn.getAttribute("data-unit-subtheme-index") || 0));
  });
  ascEditorModal?.addEventListener("click", (e) => {
    const pane = e.target?.closest?.("[data-unit-dual-pane]");
    if (!pane || !ascUnidadVistaDualActiva()) return;
    const key = pane.getAttribute("data-unit-dual-pane") === "maestro" ? "maestro" : "alumno";
    if (ascUnitEditorState?.primaryView !== key) {
      persistirAscUnidadSeccionActual();
      ascUnitEditorState.primaryView = key;
      ascUnitEditorState.active = key;
      renderAscUnidadCanvas();
      actualizarBotonesAscUnidadSeccion();
      requestAnimationFrame(() => {
        try { ascTexto?.focus(); } catch (_) {}
      });
    }
  });
  ascAiAssistBtn?.addEventListener("click", toggleAscAiEditor);
  ascAiClose?.addEventListener("click", closeAscAiEditor);
  ascAiSend?.addEventListener("click", enviarAscAiPrompt);
  ascAiRefreshScope?.addEventListener("click", () => refrescarAscAiScope(true));
  ascForm?.addEventListener("submit", onSubmit);
  bindAscEditorToolbar();
  bindPreguntasAsc();
  bindAscAiEditor();
  bindAscStyleLiveRefresh();
  aplicarTamanoHojaEditor(ascEditorSheetSize?.value || "carta");
  renderResumenPreguntasAsc();
  actualizarBotonesPanelesAsc();

  // Auto-carga si ya visible
  if (!ascModal.classList.contains("hidden")) boot();
});

// API UI (lista)
function openAscModal(){
  ascModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  boot();
}
function closeAscModal(){
  ascModal.classList.add("hidden");
  document.body.style.overflow = "auto";
}

function getResultadoLecturaRefs() {
  return {
    modal: document.getElementById("modalResultadoLectura"),
    contenido: document.getElementById("resultadoContenido")
  };
}

// API UI (editor)
function openEditorModal(){
  if (!ascEditorModal) return;
  ascEditorModal.classList.remove("hidden");
  // body scroll permitido DENTRO del modal del editor
  document.body.style.overflow = "hidden";
  const formScroll = ascForm;
  const stage = ascEditorModal.querySelector(".asc-editor-stage");
  const canvas = ascEditorModal.querySelector(".asc-editor-canvas");
  if (formScroll) formScroll.scrollTop = 0;
  if (stage) stage.scrollTop = 0;
  if (canvas) canvas.scrollTop = 0;
  requestAnimationFrame(() => {
    if (formScroll) formScroll.scrollTop = 0;
    if (stage) stage.scrollTop = 0;
    if (canvas) canvas.scrollTop = 0;
  });
}
function closeEditorModal(){
  if (!ascEditorModal) return;
  ascEditorModal.classList.add("hidden");
  closeAscWordExportModal();
  closeAscSynonymsPanel();
  closePreguntaModalAsc();
  closeAscAiEditor();
  configureAscSharedEditor(null);
  document.body.style.overflow = "auto";
}

function setAscFieldLabel(inputEl, label = "") {
  const field = inputEl?.closest(".asc-editor-field");
  const labelEl = field?.querySelector("span");
  if (labelEl) labelEl.textContent = label;
}

function applyAscEditorSchema(schema = {}) {
  if (!ascEditorModal) return;
  setAscFieldLabel(ascSerie, schema.serieLabel || "Serie");
  setAscFieldLabel(ascNivel, schema.nivelLabel || "Nivel");
  setAscFieldLabel(ascGrado, schema.gradoLabel || "Grado");
  setAscFieldLabel(ascTrimestre, schema.trimestreLabel || "Trimestre");
  setAscFieldLabel(ascUnidad, schema.unidadLabel || "Unidad");
  if (ascTitulo) {
    ascTitulo.placeholder = schema.titlePlaceholder || "Escribe un título editorial";
  }
  if (ascBtnGuardar) {
    ascBtnGuardar.textContent = schema.saveLabel || "Guardar lectura";
  }
  ascEditorModal.dataset.editorMode = schema.mode || "asc";
}

function configureAscSharedEditor(context = null) {
  ascSharedEditorContext = context || null;
  if (!ascEditorModal) return;
  ascUnitEditorState = null;
  ascTexto = ascTextoSingle;
  ascEditorShell?.classList.remove("is-unit-editor");
  if (!ascSharedEditorContext) {
    applyAscEditorSchema({
      mode: "asc",
      serieLabel: "Serie",
      nivelLabel: "Nivel",
      gradoLabel: "Grado",
      trimestreLabel: "Trimestre",
      unidadLabel: "Unidad",
      titlePlaceholder: "Escribe un título editorial",
      saveLabel: "Guardar lectura"
    });
    ascEditorModal.classList.remove("is-shared-editor");
    togglePreguntasAsc(false);
    toggleMetaAsc(false);
    return;
  }
  applyAscEditorSchema({
    mode: ascSharedEditorContext.mode || "shared",
    serieLabel: ascSharedEditorContext.serieLabel || "Sinopsis",
    nivelLabel: ascSharedEditorContext.nivelLabel || "Nivel",
    gradoLabel: ascSharedEditorContext.gradoLabel || "Grado",
    trimestreLabel: ascSharedEditorContext.trimestreLabel || "Trimestre",
    unidadLabel: ascSharedEditorContext.unidadLabel || "Unidad",
    titlePlaceholder: ascSharedEditorContext.titlePlaceholder || "Escribe el título de la lectura",
    saveLabel: ascSharedEditorContext.saveLabel || (ascSharedEditorContext.mode === "unidad-generada" ? "Guardar unidad" : "Guardar lectura")
  });
  ascEditorModal.classList.add("is-shared-editor");
  ascEditorShell?.classList.toggle("is-unit-editor", ascSharedEditorContext.mode === "unidad-generada");
  togglePreguntasAsc(true);
}

function collectSharedEditorPayload() {
  const html = String(ascTexto?.innerHTML || "").trim();
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  if (ascSharedEditorContext?.mode === "unidad-generada") {
    persistirAscUnidadSeccionActual();
    const contenidoHTML = reconstruirAscUnidadHtml();
    tmp.innerHTML = contenidoHTML;
    return {
      id: String(ascId?.value || "").trim(),
      titulo: String(ascTitulo?.value || "").trim(),
      tema: String(ascSerie?.value || "").trim(),
      nivel: String(ascNivel?.value || "").trim(),
      grado: String(ascGrado?.value || "").trim(),
      trimestre: String(ascTrimestre?.value || "").trim(),
      unidad: String(ascUnidad?.value || "").trim(),
      contenidoHTML,
      contenidoPlano: String(tmp.textContent || tmp.innerText || "").trim()
    };
  }
  return {
    id: String(ascId?.value || "").trim(),
    titulo: String(ascTitulo?.value || "").trim(),
    tema: String(ascSerie?.value || "").trim(),
    nivel: String(ascNivel?.value || "").trim(),
    grado: String(ascGrado?.value || "").trim(),
    trimestre: String(ascTrimestre?.value || "").trim(),
    unidad: String(ascUnidad?.value || "").trim(),
    contenidoHTML: html,
    contenidoPlano: String(tmp.textContent || tmp.innerText || "").trim()
  };
}

function ascExtraerTituloSubtemaDesdeNodo(node) {
  if (!node) return "";
  const candidates = [
    Array.from(node.querySelectorAll("p")).find((p) => /subcategor/i.test(String(p.textContent || ""))),
    node.querySelector("h3"),
    node.querySelector("h4"),
    node.querySelector("h5")
  ].filter(Boolean);
  for (const candidate of candidates) {
    const text = String(candidate.textContent || "")
      .replace(/subcategor[ií]a\s*:\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text) return text;
  }
  return "";
}

function ascConstruirPaginaUnidad(node, index = 0, fallbackPrefix = "Subtema") {
  const html = String(node?.outerHTML || "").trim();
  const titulo = ascExtraerTituloSubtemaDesdeNodo(node) || `${fallbackPrefix} ${index + 1}`;
  return {
    html,
    titulo,
    numero: index + 1
  };
}

function extraerAscUnidadSecciones(html = "") {
  const wrap = document.createElement("div");
  wrap.innerHTML = String(html || "");
  const bloques = Array.from(wrap.querySelectorAll(".bloque-subtema"));
  const pages = {
    alumno: [],
    maestro: []
  };
  if (bloques.length) {
    bloques.forEach((bloque, index) => {
      const alumnoNode = bloque.querySelector(".col-alumno");
      const maestroNode = bloque.querySelector(".col-maestro");
      if (alumnoNode) pages.alumno.push(ascConstruirPaginaUnidad(alumnoNode, index, "Alumno"));
      if (maestroNode) pages.maestro.push(ascConstruirPaginaUnidad(maestroNode, index, "Maestro"));
    });
  }
  const alumnos = Array.from(wrap.querySelectorAll(".col-alumno"));
  const maestros = Array.from(wrap.querySelectorAll(".col-maestro"));
  if (!alumnos.length && !maestros.length) {
    return {
      alumno: String(html || "").trim() || "<p></p>",
      maestro: "",
      hasColumns: false,
      pages: {
        alumno: [{ html: String(html || "").trim() || "<p></p>", titulo: "Contenido completo", numero: 1 }],
        maestro: []
      }
    };
  }
  if (!pages.alumno.length && alumnos.length) {
    pages.alumno = alumnos.map((node, index) => ascConstruirPaginaUnidad(node, index, "Alumno"));
  }
  if (!pages.maestro.length && maestros.length) {
    pages.maestro = maestros.map((node, index) => ascConstruirPaginaUnidad(node, index, "Maestro"));
  }
  return {
    alumno: alumnos.map((node) => node.outerHTML).join("\n"),
    maestro: maestros.map((node) => node.outerHTML).join("\n"),
    hasColumns: true,
    pages
  };
}

function inicializarAscUnidadEditor(html = "") {
  const sections = extraerAscUnidadSecciones(html);
  ascUnitEditorState = {
    originalHtml: String(html || ""),
    sections,
    active: "alumno",
    primaryView: "alumno",
    visibleViews: {
      alumno: true,
      maestro: false
    },
    pageIndexBySection: {
      alumno: 0,
      maestro: 0
    }
  };
}

function persistirAscUnidadSeccionActual() {
  if (!ascUnitEditorState) return;
  const persistKey = (key, node) => {
    if (!node) return;
    const html = String(node.innerHTML || "").trim();
    ascUnitEditorState.sections[key] = html;
    const pages = ascUnitEditorState.sections?.pages?.[key];
    const pageIndex = Number(ascUnitEditorState.pageIndexBySection?.[key] || 0);
    if (Array.isArray(pages) && pages[pageIndex]) {
      pages[pageIndex].html = html;
      ascUnitEditorState.sections[key] = pages.map((page) => page.html).filter(Boolean).join("\n");
    }
  };
  if (ascUnidadVistaDualActiva()) {
    persistKey("alumno", ascTextoAlumno);
    persistKey("maestro", ascTextoMaestro);
    return;
  }
  const key = ascUnitEditorState.active === "maestro" ? "maestro" : "alumno";
  persistKey(key, ascTextoSingle || ascTexto);
}

function actualizarBotonesAscUnidadSeccion() {
  if (!ascEditorModal || !ascUnitEditorState) return;
  ascEditorModal.querySelectorAll("[data-unit-section-open]").forEach((btn) => {
    const key = btn.getAttribute("data-unit-section-open") === "maestro" ? "maestro" : "alumno";
    btn.classList.toggle("is-active", !!ascUnitEditorState.visibleViews?.[key]);
    btn.classList.toggle("is-primary-view", ascUnitEditorState.primaryView === key);
  });
}

function ascUnidadVistaDualActiva() {
  return !!(ascUnitEditorState?.visibleViews?.alumno && ascUnitEditorState?.visibleViews?.maestro);
}

function ascActualizarNodoEditableActivo() {
  if (!ascUnitEditorState) {
    ascTexto = ascTextoSingle;
    return;
  }
  if (!ascUnidadVistaDualActiva()) {
    ascTexto = ascTextoSingle;
    return;
  }
  const primary = ascUnitEditorState.primaryView === "maestro" ? "maestro" : "alumno";
  if (ascTextoAlumno) {
    ascTextoAlumno.setAttribute("contenteditable", primary === "alumno" ? "true" : "false");
    ascTextoAlumno.classList.toggle("is-readonly", primary !== "alumno");
  }
  if (ascTextoMaestro) {
    ascTextoMaestro.setAttribute("contenteditable", primary === "maestro" ? "true" : "false");
    ascTextoMaestro.classList.toggle("is-readonly", primary !== "maestro");
  }
  ascTexto = primary === "maestro" ? ascTextoMaestro : ascTextoAlumno;
}

function renderAscUnidadCanvas() {
  if (!ascUnitEditorState) return;
  const dual = ascUnidadVistaDualActiva();
  const alumnoIndex = Number(ascUnitEditorState.pageIndexBySection?.alumno || 0);
  const maestroIndex = Number(ascUnitEditorState.pageIndexBySection?.maestro || 0);
  const alumnoHtml = ascUnitEditorState.sections?.pages?.alumno?.[alumnoIndex]?.html || ascUnitEditorState.sections?.alumno || "<p></p>";
  const maestroHtml = ascUnitEditorState.sections?.pages?.maestro?.[maestroIndex]?.html || ascUnitEditorState.sections?.maestro || "<p></p>";
  if (ascUnitDualCanvas) {
    ascUnitDualCanvas.classList.toggle("hidden", !dual);
    ascUnitDualCanvas.setAttribute("aria-hidden", dual ? "false" : "true");
  }
  if (ascTextoSingle) ascTextoSingle.classList.toggle("hidden", dual);
  if (dual) {
    if (ascTextoAlumno) ascTextoAlumno.innerHTML = normalizarContenidoAscEditor(alumnoHtml || "<p></p>");
    if (ascTextoMaestro) ascTextoMaestro.innerHTML = normalizarContenidoAscEditor(maestroHtml || "<p></p>");
  } else if (ascTextoSingle) {
    const key = ascUnitEditorState.active === "maestro" ? "maestro" : "alumno";
    const pageIndex = Number(ascUnitEditorState.pageIndexBySection?.[key] || 0);
    const page = ascUnitEditorState.sections?.pages?.[key]?.[pageIndex];
    ascTextoSingle.innerHTML = normalizarContenidoAscEditor(page?.html || ascUnitEditorState.sections[key] || "<p></p>");
  }
  normalizarEtiquetasEstiloWordAsc();
  ascActualizarNodoEditableActivo();
}

function renderAscUnidadSubtemas() {
  if (!ascUnitSubthemeList) return;
  if (!ascUnitEditorState) {
    ascUnitSubthemeList.innerHTML = "";
    return;
  }
  const key = ascUnitEditorState.active === "maestro" ? "maestro" : "alumno";
  const pages = Array.isArray(ascUnitEditorState.sections?.pages?.[key]) ? ascUnitEditorState.sections.pages[key] : [];
  const activeIndex = Number(ascUnitEditorState.pageIndexBySection?.[key] || 0);
  ascUnitSubthemeList.innerHTML = pages.map((page, index) => `
    <button
      type="button"
      class="asc-question-summary asc-unit-subtheme-btn ${index === activeIndex ? "is-active" : ""}"
      data-unit-subtheme-index="${index}"
      title="${esc(page.titulo || `Subtema ${index + 1}`)}"
    >
      <span class="asc-question-summary-num">${String(index + 1).padStart(2, "0")}</span>
      <span class="asc-question-summary-copy">
        <strong>${esc(page.titulo || `Subtema ${index + 1}`)}</strong>
        <small>${ascUnidadVistaDualActiva() ? "Alumno y maestro" : (key === "maestro" ? "Notas del maestro" : "Página del alumno")}</small>
      </span>
    </button>
  `).join("");
}

function cambiarAscUnidadSeccion(section = "alumno") {
  if (!ascUnitEditorState || !ascTexto) return;
  persistirAscUnidadSeccionActual();
  const key = section === "maestro" ? "maestro" : "alumno";
  if (ascUnidadVistaDualActiva()) {
    if (ascUnitEditorState.primaryView === key) {
      ascUnitEditorState.visibleViews = {
        alumno: key === "alumno",
        maestro: key === "maestro"
      };
    } else {
      ascUnitEditorState.primaryView = key;
    }
  } else if (ascUnitEditorState.visibleViews?.[key]) {
    ascUnitEditorState.primaryView = key;
  } else {
    ascUnitEditorState.visibleViews[key] = true;
    ascUnitEditorState.primaryView = key;
  }
  ascUnitEditorState.active = key;
  renderAscUnidadCanvas();
  actualizarBotonesAscUnidadSeccion();
  renderAscUnidadSubtemas();
  renderAscWordStylesPanel();
  requestAnimationFrame(() => {
    try { ascTexto?.focus(); } catch (_) {}
  });
}

function cambiarAscUnidadSubtema(index = 0) {
  if (!ascUnitEditorState || !ascTexto) return;
  persistirAscUnidadSeccionActual();
  const keys = ascUnidadVistaDualActiva()
    ? ["alumno", "maestro"]
    : [ascUnitEditorState.active === "maestro" ? "maestro" : "alumno"];
  keys.forEach((key) => {
    const pages = Array.isArray(ascUnitEditorState.sections?.pages?.[key]) ? ascUnitEditorState.sections.pages[key] : [];
    const nextIndex = Math.max(0, Math.min(pages.length - 1, Number(index) || 0));
    ascUnitEditorState.pageIndexBySection[key] = nextIndex;
  });
  renderAscUnidadCanvas();
  renderAscUnidadSubtemas();
  renderAscWordStylesPanel();
  requestAnimationFrame(() => {
    try { ascTexto?.focus(); } catch (_) {}
  });
}

function reconstruirAscUnidadHtml() {
  if (!ascUnitEditorState) return String(ascTexto?.innerHTML || "").trim();
  const original = document.createElement("div");
  original.innerHTML = ascUnitEditorState.originalHtml || "";
  const bloques = Array.from(original.querySelectorAll(".bloque-subtema"));
  if (bloques.length) {
    bloques.forEach((bloque, index) => {
      const alumnoNode = bloque.querySelector(".col-alumno");
      const maestroNode = bloque.querySelector(".col-maestro");
      const alumnoPage = ascUnitEditorState.sections?.pages?.alumno?.[index];
      const maestroPage = ascUnitEditorState.sections?.pages?.maestro?.[index];
      if (alumnoNode && alumnoPage?.html) {
        const parsed = document.createElement("div");
        parsed.innerHTML = alumnoPage.html;
        const replacement = parsed.querySelector(".col-alumno");
        if (replacement) alumnoNode.replaceWith(replacement.cloneNode(true));
      }
      if (maestroNode && maestroPage?.html) {
        const parsed = document.createElement("div");
        parsed.innerHTML = maestroPage.html;
        const replacement = parsed.querySelector(".col-maestro");
        if (replacement) maestroNode.replaceWith(replacement.cloneNode(true));
      }
    });
    return original.innerHTML.trim();
  }
  const reemplazarSeccion = (selector, html) => {
    const nodes = Array.from(original.querySelectorAll(selector));
    if (!nodes.length) return false;
    const parsed = document.createElement("div");
    parsed.innerHTML = String(html || "").trim();
    const replacements = Array.from(parsed.querySelectorAll(selector));
    if (!replacements.length && parsed.innerHTML.trim()) {
      nodes[0].innerHTML = parsed.innerHTML;
      nodes.slice(1).forEach((node) => node.remove());
      return true;
    }
    nodes.forEach((node, index) => {
      const next = replacements[index];
      if (next) node.replaceWith(next.cloneNode(true));
      else node.remove();
    });
    return true;
  };
  const replacedAlumno = reemplazarSeccion(".col-alumno", ascUnitEditorState.sections.alumno);
  const replacedMaestro = reemplazarSeccion(".col-maestro", ascUnitEditorState.sections.maestro);
  if (replacedAlumno || replacedMaestro) return original.innerHTML.trim();
  return [ascUnitEditorState.sections.alumno, ascUnitEditorState.sections.maestro].filter(Boolean).join("\n").trim();
}

function actualizarBotonesPanelesAsc() {
  const metaCollapsed = !!ascEditorShell?.classList.contains("is-meta-collapsed");
  const stylesCollapsed = !!ascEditorShell?.classList.contains("is-styles-collapsed");
  const preguntasCollapsed = !!ascEditorShell?.classList.contains("is-questions-collapsed");
  if (ascToggleMeta) {
    ascToggleMeta.title = metaCollapsed ? "Expandir metadatos" : "Colapsar metadatos";
    ascToggleMeta.setAttribute("aria-label", ascToggleMeta.title);
  }
  if (ascToggleStyles) {
    ascToggleStyles.title = stylesCollapsed ? "Expandir estilos" : "Colapsar estilos";
    ascToggleStyles.setAttribute("aria-label", ascToggleStyles.title);
  }
  if (ascToggleQuestions) {
    ascToggleQuestions.title = preguntasCollapsed ? "Expandir preguntas" : "Colapsar preguntas";
    ascToggleQuestions.setAttribute("aria-label", ascToggleQuestions.title);
  }
}

function toggleMetaAsc(force = null) {
  if (!ascEditorShell) return;
  const next = typeof force === "boolean" ? force : !ascEditorShell.classList.contains("is-meta-collapsed");
  ascEditorShell.classList.toggle("is-meta-collapsed", next);
  aplicarTamanoHojaEditor(ascEditorSheetSizeActual);
  actualizarBotonesPanelesAsc();
}

function togglePreguntasAsc(force = null) {
  if (!ascEditorShell) return;
  const next = typeof force === "boolean" ? force : !ascEditorShell.classList.contains("is-questions-collapsed");
  ascEditorShell.classList.toggle("is-questions-collapsed", next);
  aplicarTamanoHojaEditor(ascEditorSheetSizeActual);
  actualizarBotonesPanelesAsc();
}

function toggleStylesAsc(force = null) {
  if (!ascEditorShell) return;
  const next = typeof force === "boolean" ? force : !ascEditorShell.classList.contains("is-styles-collapsed");
  ascEditorShell.classList.toggle("is-styles-collapsed", next);
  aplicarTamanoHojaEditor(ascEditorSheetSizeActual);
  actualizarBotonesPanelesAsc();
}

function focusAscTexto() {
  if (!ascTexto) return;
  try { ascTexto.focus(); } catch (_) {}
}

function ejecutarComandoEditor(command = "", value = null) {
  if (!command) return;
  focusAscTexto();
  try {
    document.execCommand(command, false, value);
  } catch (_) {
    // noop
  }
}

function aplicarBloqueEditor(tagName = "P") {
  const tag = String(tagName || "P").toUpperCase();
  const htmlTag = tag === "P" ? "<p>" : `<${tag.toLowerCase()}>`;
  ejecutarComandoEditor("formatBlock", htmlTag);
}

function _ascCurrentEditorRoot() {
  return ascTexto || ascTextoSingle || null;
}

function _ascCurrentBlockElement() {
  const root = _ascCurrentEditorRoot();
  if (!root) return null;
  const sel = window.getSelection?.();
  const baseNode = sel?.rangeCount ? sel.getRangeAt(0).startContainer : root.firstChild;
  const base = baseNode?.nodeType === Node.TEXT_NODE ? baseNode.parentElement : baseNode;
  if (!(base instanceof Element)) return root.querySelector("p, h1, h2, h3, h4, h5, h6, li, blockquote, div");
  return base.closest("p, h1, h2, h3, h4, h5, h6, li, blockquote, div") || root;
}

function _ascCurrentCharacterElement() {
  const root = _ascCurrentEditorRoot();
  if (!root) return null;
  const sel = window.getSelection?.();
  if (!sel?.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const baseNode = range.commonAncestorContainer || range.startContainer;
  const base = baseNode?.nodeType === Node.TEXT_NODE ? baseNode.parentElement : baseNode;
  if (!(base instanceof Element)) return null;
  return base.closest("[data-word-char-style], strong, b, em, i, u, mark, span") || base;
}

function aplicarEstiloWordParrafo(styleId = "") {
  const style = String(styleId || "").trim();
  if (!style) return;
  const block = _ascCurrentBlockElement();
  if (!(block instanceof HTMLElement)) return;
  block.setAttribute("data-word-style", style);
}

function aplicarEstiloWordCaracter(styleId = "") {
  const style = String(styleId || "").trim();
  if (!style) return;
  const root = _ascCurrentEditorRoot();
  const sel = window.getSelection?.();
  if (!root || !sel || !sel.rangeCount || sel.isCollapsed || !root.contains(sel.anchorNode)) return;
  if (style === "CBTextNormal") {
    const container = sel.getRangeAt(0).commonAncestorContainer;
    const base = container?.nodeType === Node.TEXT_NODE ? container.parentElement : container;
    base?.closest?.("[data-word-char-style]")?.removeAttribute("data-word-char-style");
    return;
  }
  const range = sel.getRangeAt(0);
  const span = document.createElement("span");
  span.setAttribute("data-word-char-style", style);
  try {
    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    sel.addRange(newRange);
  } catch (_) {
    // noop
  }
}

function syncAscWordStyleControls() {
  if (!ascEditorModal || ascEditorModal.classList.contains("hidden")) return;
  const root = _ascCurrentEditorRoot();
  const sel = window.getSelection?.();
  const insideEditor = !!(root && sel?.rangeCount && root.contains(sel.anchorNode));
  if (!insideEditor) {
    if (ascWordParagraphStyle) ascWordParagraphStyle.value = "";
    if (ascWordCharacterStyle) ascWordCharacterStyle.value = "";
    return;
  }
  const block = _ascCurrentBlockElement();
  const charNode = _ascCurrentCharacterElement();
  const paragraphStyle = block ? (_ascInferParagraphStyle(block) || "CBBody") : "";
  const characterStyle = charNode ? (_ascInferCharacterStyle(charNode) || "CBTextNormal") : "CBTextNormal";
  if (ascWordParagraphStyle) {
    ascWordParagraphStyle.value = paragraphStyle && ascWordParagraphStyle.querySelector(`option[value="${paragraphStyle}"]`)
      ? paragraphStyle
      : "";
  }
  if (ascWordCharacterStyle) {
    ascWordCharacterStyle.value = characterStyle && ascWordCharacterStyle.querySelector(`option[value="${characterStyle}"]`)
      ? characterStyle
      : "";
  }
}

function _ascActiveEditorBodies() {
  return [ascTextoSingle, ascTextoAlumno, ascTextoMaestro].filter(Boolean);
}

function _ascStyleBlockSelector() {
  return "p, h1, h2, h3, h4, h5, h6, li, blockquote, div, td, th";
}

function _ascIsStylableBlock(node) {
  if (!(node instanceof Element)) return false;
  const tag = String(node.tagName || "").toLowerCase();
  if (["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "td", "th"].includes(tag)) return true;
  if (tag !== "div") return false;
  if (node.matches(".col-alumno, .col-maestro, .bloque-subtema, .asc-editor-page, .asc-editor-sheet, .asc-editor-text, .asc-editor-text-dual, .asc-editor-body, [data-unit-dual-pane], [data-unit-dual-root]")) return false;
  return !node.querySelector(_ascStyleBlockSelector());
}

function _ascInferParagraphStyle(el) {
  if (!(el instanceof Element)) return "";
  const declared = String(el.getAttribute("data-word-style") || "").trim();
  if (declared) return declared;
  const tag = String(el.tagName || "").toLowerCase();
  
  if (tag === "h1") return "CBTitle";
  if (tag === "h2") return "CBHeading1";
  if (tag === "h3") return "CBHeading2";
  if (tag === "h4") return "CBHeading3";
  if (tag === "h6") return "CBSubtopic";
  
  return ""; // Regresar vacío si no hay estilo explícito ni es encabezado
}

function _ascGuessParagraphStyle(el) {
  if (!(el instanceof Element)) return null;
  const cls = String(el.className || "");
  const text = String(el.textContent || "").replace(/\s+/g, " ").trim();
  const ownText = Array.from(el.childNodes || [])
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent || "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  // Detección mejorada de Instrucciones y Subinstrucciones (basada en requerimientos de usuario)
  const isLi = el.tagName === "LI";
  const parent = el.parentElement;
  const isInsideActivity = !!(el.closest(".activity") || el.classList.contains("activity"));
  
  if (isLi && parent && parent.tagName === "OL") {
    const listType = parent.getAttribute("type") || window.getComputedStyle(parent).listStyleType || "";
    const isAlpha = /alpha|lower-a|a\b/i.test(listType);
    const hasBold = !!(el.querySelector("strong, b") || (el.style.fontWeight && parseInt(el.style.fontWeight) > 400));
    
    if (isAlpha) return "CBSubinstructions";
    if (hasBold || isInsideActivity) return "CBInstructions";
  }

  // REQUERIMIENTO: Las instrucciones están dentro de .activity, a veces como párrafo con strong
  if (isInsideActivity && (el.tagName === "P" || el.tagName === "DIV")) {
    const hasStrong = !!el.querySelector("strong, b");
    if (hasStrong) return "CBInstructions";
  }

  if (/^subcategor/i.test(text) || /^subtema\b/i.test(ownText)) return "CBSubtopic";
  if (/^pregunta detonante/i.test(text) || /^lectura generadora/i.test(text) || /^titulo de la lectura relacionada/i.test(text)) return "CBHeading2";
  if (/^bibliograf/i.test(text) || /^sin[oó]nimos/i.test(text) || /^notas del maestro/i.test(text)) return "CBHeading3";
  
  // Respuestas / Solucionarios
  if (el.classList.contains("answer") || /^respuesta|^solucionario|^soluci[oó]n|^answer/i.test(text)) return "CBAnswer";
  
  if (/^instrucciones\b/i.test(text) || /instrucci[oó]n\b/i.test(text)) return "CBInstructions";
  if (/^subinstrucci[oó]n/i.test(text)) return "CBSubinstructions";
  if (/^actividad\b/i.test(text) || /^consigna\b/i.test(text)) return "CBActivity";
  if (/^nota\b/i.test(text) || /^orientaci[oó]n docente/i.test(text)) return "CBTeacherNote";
  if (/col-maestro/i.test(cls) || el.closest(".col-maestro")) return "CBTeacherNote";
  
  return null;
}

function _ascInferCharacterStyle(el) {
  if (!(el instanceof Element)) return "";
  const declared = String(el.getAttribute("data-word-char-style") || "").trim();
  if (declared) return declared;
  const tag = String(el.tagName || "").toLowerCase();
  if (tag === "strong" || tag === "b") return "CBStrong";
  if (tag === "em" || tag === "i") return "CBEmphasis";
  if (tag === "u") return "CBUnderline";
  if (tag === "mark") return "CBHighlight";
  return "";
}

function normalizarEtiquetasEstiloWordAsc(root = null) {
  const targets = root ? [root] : _ascActiveEditorBodies();
  targets.forEach((body) => {
    if (!(body instanceof Element)) return;
    Array.from(body.querySelectorAll(_ascStyleBlockSelector())).forEach((node) => {
      if (!_ascIsStylableBlock(node)) return;
      
      const declared = node.getAttribute("data-word-style");
      if (declared) return; // Si ya tiene estilo, no sobrescribir con guesses
      
      const guess = _ascGuessParagraphStyle(node);
      const tagMap = _ascInferParagraphStyle(node);
      
      // Solo etiquetar explícitamente si es algo distinto a "Normal" o si es un encabezado mapeado
      if (guess) node.setAttribute("data-word-style", guess);
      else if (tagMap && tagMap !== "CBBody") node.setAttribute("data-word-style", tagMap);
    });
    // ... estilos de caracter se quedan como están (inferred live)
  });
}

function _ascCollectDocumentStyleUsage() {
  const wrap = document.createElement("div");
  wrap.innerHTML = ascSharedEditorContext?.mode === "unidad-generada"
    ? reconstruirAscUnidadHtml()
    : String(_ascCurrentEditorRoot()?.innerHTML || ascTextoSingle?.innerHTML || "");

  const paragraphCounts = new Map();
  const characterCounts = new Map();

  Array.from(wrap.querySelectorAll(_ascStyleBlockSelector())).forEach((node) => {
    const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
    if (!text && !node.querySelector("img, table, ul, ol")) return;
    const key = _ascInferParagraphStyle(node);
    if (!key) return;
    paragraphCounts.set(key, (paragraphCounts.get(key) || 0) + 1);
  });

  Array.from(wrap.querySelectorAll("*")).forEach((node) => {
    const key = _ascInferCharacterStyle(node);
    if (!key) return;
    const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return;
    characterCounts.set(key, (characterCounts.get(key) || 0) + 1);
  });

  return { paragraphCounts, characterCounts };
}

function _ascClearStyleMatches() {
  _ascActiveEditorBodies().forEach((root) => {
    root.querySelectorAll(".asc-word-style-match").forEach((node) => node.classList.remove("asc-word-style-match"));
    root.querySelectorAll(".asc-word-char-style-match").forEach((node) => node.classList.remove("asc-word-char-style-match"));
  });
}

function aplicarResaltadoEstiloWordAsc() {
  _ascClearStyleMatches();
  const key = String(ascWordSelectedStyleKey || "").trim();
  const group = String(ascWordSelectedStyleGroup || "paragraph").trim();
  if (!key) return;
  let firstMatch = null;
  _ascActiveEditorBodies().forEach((root) => {
    if (!root || root.classList.contains("hidden")) return;
    if (group === "character") {
      Array.from(root.querySelectorAll("*")).forEach((node) => {
        if (_ascInferCharacterStyle(node) === key) {
          node.classList.add("asc-word-char-style-match");
          if (!firstMatch) firstMatch = node;
        }
      });
      return;
    }
    Array.from(root.querySelectorAll(_ascStyleBlockSelector())).forEach((node) => {
      const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
      if (!text && !node.querySelector("img, table, ul, ol")) return;
      if (_ascInferParagraphStyle(node) === key) {
        node.classList.add("asc-word-style-match");
        if (!firstMatch) firstMatch = node;
      }
    });
  });
  if (firstMatch && typeof firstMatch.scrollIntoView === "function") {
    firstMatch.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

function _ascBuildStyleDefinitionsCss() {
  const defs = ascWordStyleDefinitions || normalizeStyleDefinitions(DEFAULT_STYLE_DEFINITIONS);
  const rules = [];
  Object.entries(defs.paragraph || {}).forEach(([key, def]) => {
    const parts = [];
    if (def.fontSize) parts.push(`font-size:${Number(def.fontSize)}px`);
    if (def.color) parts.push(`color:#${String(def.color).replace(/^#/, "")} !important`);
    if (def.bold) parts.push("font-weight:700");
    else parts.push("font-weight:400");
    if (def.italic) parts.push("font-style:italic");
    else parts.push("font-style:normal");
    if (def.align) parts.push(`text-align:${def.align === "both" ? "justify" : def.align}`);
    if (Number(def.spacingBefore || 0)) parts.push(`margin-top:${Math.max(0, Number(def.spacingBefore)) / 10}px`);
    if (Number(def.spacingAfter || 0) || key === "CBBody") parts.push(`margin-bottom:${Math.max(0, Number(def.spacingAfter || 160)) / 10}px`);
    if (Number(def.indentLeft || 0)) parts.push(`padding-left:${Math.max(0, Number(def.indentLeft)) / 20}px`);
    rules.push(`.asc-editor-body [data-word-style="${key}"]{${parts.join(";")}}`);
  });
  Object.entries(defs.character || {}).forEach(([key, def]) => {
    const parts = [];
    if (def.fontSize) parts.push(`font-size:${Number(def.fontSize)}px`);
    if (def.bold) parts.push("font-weight:700");
    else parts.push("font-weight:400");
    if (def.italic) parts.push("font-style:italic");
    else parts.push("font-style:normal");
    if (def.underline) parts.push("text-decoration:underline");
    else parts.push("text-decoration:none");
    if (def.highlight) parts.push("background:rgba(254,240,138,0.9) !important");
    if (def.color) parts.push(`color:#${String(def.color).replace(/^#/, "")} !important`);
    rules.push(`.asc-editor-body [data-word-char-style="${key}"]{${parts.join(";")}}`);
  });
  return rules.join("\n");
}

function aplicarPreviewEstilosWordAsc() {
  if (!ascEditorModal) return;
  normalizarEtiquetasEstiloWordAsc();
  let styleEl = ascEditorModal.querySelector("#ascWordStylePreview");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "ascWordStylePreview";
    ascEditorModal.appendChild(styleEl);
  }
  styleEl.textContent = _ascBuildStyleDefinitionsCss();
}

function recolectarEstilosWordEnUsoAsc() {
  const entries = [];
  const { paragraphCounts, characterCounts } = _ascCollectDocumentStyleUsage();
  
  // Incluimos todos los estilos para que la lista lateral coincida con el selector de la barra de herramientas
  Object.entries(ascWordStyleDefinitions.paragraph || {}).forEach(([key, def]) => {
    let count = paragraphCounts.get(key) || 0;
    // Si buscamos Normal (CBBody), sumamos los que no tienen estilo asignado
    if (key === "CBBody") count += (paragraphCounts.get("") || 0);
    entries.push({ group: "paragraph", key, label: def.label || key, count });
  });

  Object.entries(ascWordStyleDefinitions.character || {}).forEach(([key, def]) => {
    let count = characterCounts.get(key) || 0;
    if (key === "CBTextNormal") count += (characterCounts.get("") || 0);
    entries.push({ group: "character", key, label: def.label || key, count });
  });

  return entries;
}

function renderAscWordStylesPanel() {
  if (!ascWordStylesList) return;
  const entries = recolectarEstilosWordEnUsoAsc();
  const paragraphs = entries.filter(e => e.group === "paragraph");
  const characters = entries.filter(e => e.group === "character");

  const buildItem = (entry, index) => `
    <button type="button" class="asc-word-style-item ${entry.key === ascWordSelectedStyleKey && entry.group === ascWordSelectedStyleGroup ? "is-active" : ""} ${entry.count ? "" : "is-empty"}" data-word-style-item="${entry.key}" data-word-style-group="${entry.group}">
      <span class="asc-word-style-badge">${String(index + 1)}</span>
      <span class="asc-word-style-copy">
        <strong>${esc(entry.label)}</strong>
        <small>${entry.group === "paragraph" ? "Párrafo" : "Carácter"} · ${entry.count} uso(s)</small>
      </span>
      <span class="asc-word-style-copy"><small>${esc(entry.key)}</small></span>
    </button>
  `;

  let html = "";
  if (paragraphs.length) {
    html += `<div class="asc-word-style-group-title">Párrafo</div>`;
    html += paragraphs.map((e, i) => buildItem(e, i)).join("");
  }
  if (characters.length) {
    html += `<div class="asc-word-style-group-title">Carácter</div>`;
    html += characters.map((e, i) => buildItem(e, i + paragraphs.length)).join("");
  }

  ascWordStylesList.innerHTML = html;
}

function openAscWordStyleManagerModal() {
  let group = ascWordSelectedStyleGroup || "paragraph";
  let key = ascWordSelectedStyleKey;

  // Si no hay selección explicita en la lista, inferir según el cursor
  if (!key) {
    const block = _ascCurrentBlockElement();
    const charNode = _ascCurrentCharacterElement();
    key = block ? (_ascInferParagraphStyle(block) || "CBBody") : "CBBody";
    group = "paragraph"; 
    // Si hay un estilo de caracter bajo el cursor y estamos en modo caracter (o por defecto), podrías priorizarlo. 
    // Pero por simplicidad, si no hay selección de lista, usamos el bloque actual.
  }

  const def = ascWordStyleDefinitions?.[group]?.[key];
  if (!def || !ascWordStyleManagerModal) return;
  if (ascWordStyleManagerName) ascWordStyleManagerName.value = def.label || key;
  if (ascWordStyleManagerSubtitle) ascWordStyleManagerSubtitle.textContent = `Editando ${group === "paragraph" ? "estilo de párrafo" : "estilo de carácter"}: ${def.label || key}`;
  if (ascWordStyleManagerSize) ascWordStyleManagerSize.value = String(def.fontSize || 22);
  if (ascWordStyleManagerColor) ascWordStyleManagerColor.value = `#${String(def.color || "1F2937").replace(/^#/, "")}`;
  if (ascWordStyleManagerAlign) ascWordStyleManagerAlign.value = def.align || "left";
  if (ascWordStyleManagerBefore) ascWordStyleManagerBefore.value = String(def.spacingBefore || 0);
  if (ascWordStyleManagerAfter) ascWordStyleManagerAfter.value = String(def.spacingAfter || 0);
  if (ascWordStyleManagerIndent) ascWordStyleManagerIndent.value = String(def.indentLeft || 0);
  if (ascWordStyleManagerBold) ascWordStyleManagerBold.checked = !!def.bold;
  if (ascWordStyleManagerItalic) ascWordStyleManagerItalic.checked = !!def.italic;
  if (ascWordStyleManagerUnderline) ascWordStyleManagerUnderline.checked = !!def.underline;
  if (ascWordStyleManagerHighlight) ascWordStyleManagerHighlight.checked = !!def.highlight;
  const isParagraph = group === "paragraph";
  [ascWordStyleManagerAlign, ascWordStyleManagerBefore, ascWordStyleManagerAfter, ascWordStyleManagerIndent].forEach((el) => {
    if (el?.closest) el.closest(".asc-editor-field")?.classList.toggle("hidden", !isParagraph);
  });
  ascWordStyleManagerModal.classList.remove("hidden");
  ascWordStyleManagerModal.setAttribute("aria-hidden", "false");
}

function closeAscWordStyleManagerModal() {
  if (!ascWordStyleManagerModal) return;
  ascWordStyleManagerModal.classList.add("hidden");
  ascWordStyleManagerModal.setAttribute("aria-hidden", "true");
}

function aplicarCambiosAscWordStyleManager() {
  const group = ascWordSelectedStyleGroup || "paragraph";
  const key = ascWordSelectedStyleKey || "CBBody";
  const current = ascWordStyleDefinitions?.[group]?.[key];
  if (!current) return;
  ascWordStyleDefinitions[group][key] = {
    ...current,
    fontSize: Number(ascWordStyleManagerSize?.value || current.fontSize || 22),
    color: String(ascWordStyleManagerColor?.value || `#${current.color || "1F2937"}`).replace(/^#/, "").toUpperCase(),
    align: String(ascWordStyleManagerAlign?.value || current.align || "left"),
    spacingBefore: Number(ascWordStyleManagerBefore?.value || current.spacingBefore || 0),
    spacingAfter: Number(ascWordStyleManagerAfter?.value || current.spacingAfter || 0),
    indentLeft: Number(ascWordStyleManagerIndent?.value || current.indentLeft || 0),
    bold: !!ascWordStyleManagerBold?.checked,
    italic: !!ascWordStyleManagerItalic?.checked,
    underline: !!ascWordStyleManagerUnderline?.checked,
    highlight: !!ascWordStyleManagerHighlight?.checked
  };
  aplicarPreviewEstilosWordAsc();
  renderAscWordStylesPanel();
  aplicarResaltadoEstiloWordAsc();
  closeAscWordStyleManagerModal();
}

function restablecerAscWordStyleSeleccionado() {
  ascWordStyleDefinitions = normalizeStyleDefinitions(DEFAULT_STYLE_DEFINITIONS);
  aplicarPreviewEstilosWordAsc();
  renderAscWordStylesPanel();
  aplicarResaltadoEstiloWordAsc();
  openAscWordStyleManagerModal();
}

function seleccionarTodoEstiloWordActual() {
  let key = ascWordSelectedStyleKey;
  let group = ascWordSelectedStyleGroup || "paragraph";

  if (!key) {
    const block = _ascCurrentBlockElement();
    key = block ? (_ascInferParagraphStyle(block) || "CBBody") : "CBBody";
    group = "paragraph";
  }

  const roots = _ascActiveEditorBodies().filter((root) => root && !root.classList.contains("hidden"));
  const nodes = [];
  roots.forEach((root) => {
    if (ascWordSelectedStyleGroup === "character") {
      Array.from(root.querySelectorAll("*")).forEach((node) => {
        if (_ascInferCharacterStyle(node) === ascWordSelectedStyleKey) nodes.push(node);
      });
      return;
    }
    Array.from(root.querySelectorAll(_ascStyleBlockSelector())).forEach((node) => {
      const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
      if (!text && !node.querySelector("img, table, ul, ol")) return;
      
      const nodeKey = _ascInferParagraphStyle(node) || "CBBody";
      if (nodeKey === key) nodes.push(node);
    });
  });
  if (!nodes.length) return;

  // Para evitar seleccionar "todo" cuando los elementos están lejos, 
  // buscamos el primer bloque contiguo de coincidencias.
  const sel = window.getSelection?.();
  if (!sel) return;
  sel.removeAllRanges();

  // Seleccionamos el PRIMER nodo encontrado para llevar el foco allí
  const range = document.createRange();
  range.setStartBefore(nodes[0]);
  range.setEndAfter(nodes[0]);
  sel.addRange(range);
  
  // Desplazamos a la vista
  nodes[0].scrollIntoView({ block: "center", behavior: "smooth" });

  aplicarResaltadoEstiloWordAsc();
}

function bindAscStyleLiveRefresh() {
  _ascActiveEditorBodies().forEach((node) => {
    if (!node || node.dataset.styleRefreshBound === "1") return;
    node.addEventListener("input", () => {
      normalizarEtiquetasEstiloWordAsc(node);
      aplicarPreviewEstilosWordAsc();
      renderAscWordStylesPanel();
    });
    node.dataset.styleRefreshBound = "1";
  });
}

function aplicarFuenteEditor(fontFamily = "") {
  const family = String(fontFamily || "").trim();
  if (!family || !ascTexto) return;
  focusAscTexto();
  const sel = window.getSelection?.();
  if (sel && sel.rangeCount && !sel.isCollapsed && ascTexto.contains(sel.anchorNode)) {
    try {
      document.execCommand("styleWithCSS", false, true);
      document.execCommand("fontName", false, family);
      return;
    } catch (_) {
      // noop
    }
  }
  ascTexto.style.fontFamily = family;
}

function limpiarEstilosTipograficosAsc(root) {
  if (!root) return;
  root.querySelectorAll("*").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    node.style.removeProperty("font-size");
    node.style.removeProperty("font-family");
    node.style.removeProperty("line-height");
    if (node.tagName === "FONT") {
      node.removeAttribute("size");
      node.removeAttribute("face");
    }
  });
}

function aplicarTamanoEditor(fontSize = "") {
  const size = Number(fontSize || 0);
  if (!Number.isFinite(size) || size <= 0 || !ascTexto) return;
  ascEditorFontSizeActual = size;
  limpiarEstilosTipograficosAsc(ascTexto);
  if (ascEditorFontSize) ascEditorFontSize.value = String(Math.round(size));
  aplicarTamanoHojaEditor(ascEditorSheetSize?.value || ascEditorSheetSizeActual || "carta");
  focusAscTexto();
}

function aplicarColorEditor(command = "", color = "") {
  const value = String(color || "").trim();
  if (!command || !ascTexto) return;
  focusAscTexto();
  try {
    document.execCommand("styleWithCSS", false, true);
  } catch (_) {}
  if (!value) {
    if (command === "hiliteColor") {
      try { document.execCommand("backColor", false, "transparent"); } catch (_) {}
    }
    return;
  }
  try {
    document.execCommand(command, false, value);
  } catch (_) {
    if (command === "hiliteColor") {
      try { document.execCommand("backColor", false, value); } catch (_) {}
    }
  }
}

function _refrescarPaletasColorAsc() {
  const map = [
    { input: ascEditorFontColor, kind: "text", fallback: "#111827" },
    { input: ascEditorHighlightColor, kind: "highlight", fallback: "#fef08a" }
  ];
  map.forEach(({ input, kind, fallback }) => {
    const value = String(input?.value || "").trim();
    const preview = ascEditorModal?.querySelector(`[data-swatch-preview="${kind}"]`);
    if (preview) {
      preview.style.setProperty("--swatch-color", value || fallback);
    }
    $$(`[data-palette-popover="${kind}"] .asc-editor-color-swatch`, ascEditorModal).forEach((btn) => {
      btn.classList.toggle("is-active", String(btn.dataset.colorValue || "") === value);
    });
  });
}

function aplicarTamanoHojaEditor(sheetSize = "") {
  const size = String(sheetSize || "carta").trim().toLowerCase();
  const styleTarget = ascEditorShell || ascEditorModal;
  if (!styleTarget) return;
  const mapa = {
    compacta: { width: 720, minHeight: 360, fontSize: 17, titleSize: 22, paddingX: 34, paddingTop: 28, paddingBottom: 32 },
    carta: { width: 860, minHeight: 420, fontSize: 18, titleSize: 24, paddingX: 42, paddingTop: 34, paddingBottom: 40 },
    oficio: { width: 920, minHeight: 560, fontSize: 18.5, titleSize: 25, paddingX: 46, paddingTop: 36, paddingBottom: 42 },
    ancha: { width: 1040, minHeight: 460, fontSize: 19, titleSize: 26, paddingX: 52, paddingTop: 36, paddingBottom: 42 }
  };
  const conf = mapa[size] || mapa.carta;
  const selectSize = Number(ascEditorFontSize?.value || 0);
  const baseFontSize = Number.isFinite(selectSize) && selectSize > 0 ? selectSize : (Number(ascEditorFontSizeActual || 0) || conf.fontSize);
  const zoomPct = Number(ascEditorZoomRange?.value || ascEditorZoomActual || 100);
  const zoomFactor = Number.isFinite(zoomPct) && zoomPct > 0 ? (zoomPct / 100) : 1;
  ascEditorZoomActual = zoomPct;
  ascEditorSheetSizeActual = size;
  const panelesColapsados = Number(!!ascEditorShell?.classList.contains("is-meta-collapsed")) + Number(!!ascEditorShell?.classList.contains("is-questions-collapsed"));
  const widthExtra = panelesColapsados === 2 ? 280 : panelesColapsados === 1 ? 150 : 0;
  const heightExtra = panelesColapsados === 2 ? 140 : panelesColapsados === 1 ? 72 : 0;
  const paddingExtra = panelesColapsados === 2 ? 14 : panelesColapsados === 1 ? 7 : 0;
  const anchoFinal = conf.width + widthExtra;
  const proporcionAncho = anchoFinal / conf.width;
  const fontSizeFinal = Number((baseFontSize * proporcionAncho * zoomFactor).toFixed(2));
  const titleSizeFinal = Number((Math.max(conf.titleSize, baseFontSize * 1.22) * proporcionAncho * zoomFactor).toFixed(2));
  const lineHeight = panelesColapsados === 2 ? 1.95 : panelesColapsados === 1 ? 1.88 : 1.8;
  styleTarget.style.setProperty("--asc-editor-page-width", `${Math.round(anchoFinal * zoomFactor)}px`);
  styleTarget.style.setProperty("--asc-editor-page-min-height", `${Math.round((conf.minHeight + heightExtra) * zoomFactor)}px`);
  styleTarget.style.setProperty("--asc-editor-page-font-size", `${fontSizeFinal}px`);
  styleTarget.style.setProperty("--asc-editor-page-title-size", `${titleSizeFinal}px`);
  styleTarget.style.setProperty("--asc-editor-page-line-height", `${lineHeight}`);
  styleTarget.style.setProperty("--asc-editor-page-padding-x", `${Math.round((conf.paddingX + paddingExtra) * zoomFactor)}px`);
  styleTarget.style.setProperty("--asc-editor-page-padding-top", `${Math.round((conf.paddingTop + paddingExtra) * zoomFactor)}px`);
  styleTarget.style.setProperty("--asc-editor-page-padding-bottom", `${Math.round((conf.paddingBottom + paddingExtra) * zoomFactor)}px`);
  styleTarget.style.setProperty("--asc-editor-page-zoom", `${zoomFactor}`);
  const extraSpace = zoomFactor > 1 ? Math.round((conf.minHeight + heightExtra) * (zoomFactor - 1) * 0.9) : 0;
  styleTarget.style.setProperty("--asc-editor-stage-extra-space", `${extraSpace}px`);
  ascEditorModal.dataset.sheetSize = size;
  if (ascEditorZoomLabel) ascEditorZoomLabel.textContent = `Zoom ${zoomPct}%`;
}

function _ascExtraerJson(raw = "") {
  const cleaned = String(raw || "").replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  if (!cleaned) return null;
  try { return JSON.parse(cleaned); } catch (_) {}
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try { return JSON.parse(cleaned.slice(first, last + 1)); } catch (_) {}
  }
  return null;
}

function _ascModeloGeminiActual() {
  return String(document.getElementById("selectGeminiEndpoint2")?.value || "gemini-2.5-flash-lite")
    .replace(":generateContent", "")
    .trim() || "gemini-2.5-flash-lite";
}

async function _ascEditarConGemini({ instruccion = "", scope = {} } = {}) {
  const modelo = _ascModeloGeminiActual();
  const prompt = `
Eres un editor experto de textos escolares en HTML.
Debes editar SOLO el alcance indicado. No resumas fuera del alcance. No expliques el proceso.
Devuelve estrictamente JSON válido con este formato:
{"replacement_html":"...","summary":"..."}

Reglas:
- Mantén el idioma y el tono del texto.
- Conserva etiquetas HTML válidas y simples.
- Si el alcance es "selection", devuelve solo el fragmento corregido o reemplazado.
- Si el alcance es "paragraph", devuelve solo el HTML del párrafo o bloque reemplazado.
- Si el alcance es "document", devuelve el HTML completo actualizado.
- No uses markdown ni fences.

Título del documento: ${ascTitulo?.value || "Sin título"}
Alcance: ${scope.mode}
Descripción del alcance: ${scope.label}
Texto actual del alcance:
${scope.text || ""}

HTML actual del alcance:
${scope.html || ""}

Contexto del documento completo:
${(ascTexto?.innerText || "").slice(0, 6000)}

Solicitud del usuario:
${instruccion}
`.trim();

  const { response, data } = await _ascGeminiGenerateViaBackend(modelo, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.55,
      topP: 0.9,
      topK: 30,
      maxOutputTokens: 4096
    }
  });
  if (!response.ok) throw new Error(data?.error?.message || "No se pudo editar con Gemini.");
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const parsed = _ascExtraerJson(text);
  if (!parsed?.replacement_html) throw new Error("Gemini no devolvió un HTML válido para aplicar.");
  return parsed;
}

function _ascNodoBloqueDesde(node) {
  if (!node || !ascTexto) return null;
  const base = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  if (!(base instanceof Element)) return null;
  return base.closest("p, h1, h2, h3, h4, h5, h6, li, blockquote, div");
}

function _ascHtmlDesdeRange(range) {
  const wrap = document.createElement("div");
  wrap.appendChild(range.cloneContents());
  return wrap.innerHTML;
}

function _ascTextoRecortado(text = "", max = 220) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
}

function _ascConstruirScope(mode = "paragraph") {
  const sel = window.getSelection?.();
  const hasSelection = sel && sel.rangeCount && !sel.isCollapsed && ascTexto?.contains(sel.anchorNode);
  if (mode === "selection" && hasSelection) {
    const range = sel.getRangeAt(0).cloneRange();
    return {
      mode,
      label: "Selección actual",
      text: String(range.toString() || "").trim(),
      html: _ascHtmlDesdeRange(range),
      range
    };
  }
  if (mode === "selection") {
    mode = "paragraph";
  }
  if (mode === "paragraph") {
    const baseNode = sel?.rangeCount ? sel.getRangeAt(0).startContainer : ascTexto?.firstChild;
    const block = _ascNodoBloqueDesde(baseNode) || ascTexto?.querySelector("p, h2, h3, li, blockquote, div");
    return {
      mode: "paragraph",
      label: block ? "Párrafo actual" : "Bloque principal",
      text: String(block?.textContent || ascTexto?.innerText || "").trim(),
      html: block?.outerHTML || "<p></p>",
      blockEl: block || null
    };
  }
  return {
    mode: "document",
    label: "Documento completo",
    text: String(ascTexto?.innerText || "").trim(),
    html: String(ascTexto?.innerHTML || "<p></p>").trim()
  };
}

function refrescarAscAiScope(forceRender = false) {
  const snapshot = _ascConstruirScope(ascAiScopeMode);
  ascAiScopeSnapshot = snapshot;
  if (!ascAiScopePreview) return;
  ascAiScopePreview.textContent = `${snapshot.label}: ${_ascTextoRecortado(snapshot.text || "(Sin contenido)")}`;
  $$(".asc-ai-scope-btn[data-asc-ai-scope]", ascEditorModal).forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.ascAiScope === snapshot.mode);
  });
  if (forceRender && ascAiChatList && !ascAiChatList.children.length) {
    _ascAgregarMensajeChat("system", "La IA puede trabajar sobre la selección actual, el párrafo activo o el documento completo. Los cambios se quedan sólo en el editor hasta guardar.");
  }
}

function _ascAgregarMensajeChat(tipo = "ai", texto = "") {
  if (!ascAiChatList) return;
  const bubble = document.createElement("div");
  bubble.className = `asc-ai-chat-bubble ${tipo}`;
  bubble.textContent = String(texto || "").trim();
  ascAiChatList.appendChild(bubble);
  ascAiChatList.scrollTop = ascAiChatList.scrollHeight;
}

function openAscAiEditor() {
  if (!ascAiEditorModal) return;
  ascAiEditorModal.classList.remove("hidden");
  ascAiEditorModal.setAttribute("aria-hidden", "false");
  refrescarAscAiScope(true);
  requestAnimationFrame(() => {
    try { ascAiPrompt?.focus(); } catch (_) {}
  });
}

function closeAscAiEditor() {
  if (!ascAiEditorModal) return;
  ascAiEditorModal.classList.add("hidden");
  ascAiEditorModal.setAttribute("aria-hidden", "true");
  ascAiBusy = false;
  if (ascAiStatus) ascAiStatus.textContent = "Los cambios se aplican sólo en el editor hasta guardar.";
}

function toggleAscAiEditor() {
  if (!ascAiEditorModal) return;
  if (ascAiEditorModal.classList.contains("hidden")) openAscAiEditor();
  else closeAscAiEditor();
}

function bindAscAiEditor() {
  if (!ascEditorModal || ascEditorModal.dataset.aiBound === "1") return;
  ascEditorModal.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-asc-ai-scope]");
    if (!btn) return;
    e.preventDefault();
    ascAiScopeMode = String(btn.dataset.ascAiScope || "paragraph");
    refrescarAscAiScope();
  });
  ascAiPrompt?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      enviarAscAiPrompt();
    }
  });
  ascQuestionAiPrompt?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      enviarAscQuestionAiPrompt();
    }
  });
  ascEditorModal.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-asc-question-scope]");
    if (!btn) return;
    e.preventDefault();
    ascQuestionAiScope = String(btn.dataset.ascQuestionScope || "texto");
    refrescarAscQuestionAiScope();
  });
  ascEditorModal.dataset.aiBound = "1";
}

function _ascAplicarRespuestaIA(scope = {}, replacementHtml = "") {
  const html = normalizarContenidoAscEditor(replacementHtml || "<p></p>");
  if (scope.mode === "selection" && scope.range) {
    const range = scope.range;
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    const frag = document.createDocumentFragment();
    while (wrap.firstChild) frag.appendChild(wrap.firstChild);
    range.deleteContents();
    range.insertNode(frag);
    ascTexto.normalize();
    return true;
  }
  if (scope.mode === "paragraph" && scope.blockEl?.parentNode) {
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    const frag = document.createDocumentFragment();
    while (wrap.firstChild) frag.appendChild(wrap.firstChild);
    scope.blockEl.replaceWith(frag);
    return true;
  }
  if (scope.mode === "document") {
    ascTexto.innerHTML = html;
    return true;
  }
  return false;
}

async function enviarAscAiPrompt() {
  const texto = String(ascAiPrompt?.value || "").trim();
  if (!texto || ascAiBusy) return;
  const scope = (ascAiScopeMode === "selection" && ascAiScopeSnapshot?.mode === "selection")
    ? ascAiScopeSnapshot
    : _ascConstruirScope(ascAiScopeMode);
  ascAiScopeSnapshot = scope;
  ascAiBusy = true;
  if (ascAiStatus) ascAiStatus.textContent = "Editando con Gemini...";
  _ascAgregarMensajeChat("user", texto);
  if (ascAiPrompt) ascAiPrompt.value = "";
  try {
    const result = await _ascEditarConGemini({ instruccion: texto, scope });
    const ok = _ascAplicarRespuestaIA(scope, result.replacement_html || "");
    if (!ok) throw new Error("No pude aplicar la edición sobre el alcance actual.");
    _ascAgregarMensajeChat("ai", result.summary || "Cambio aplicado en el editor. Guarda la lectura cuando quieras conservarlo.");
    refrescarAscAiScope();
  } catch (err) {
    _ascAgregarMensajeChat("system", err?.message || "No se pudo editar la lectura con IA.");
  } finally {
    ascAiBusy = false;
    if (ascAiStatus) ascAiStatus.textContent = "Los cambios se aplican sólo en el editor hasta guardar.";
  }
}

function bindAscEditorToolbar() {
  if (!ascEditorModal || ascEditorModal.dataset.toolbarBound === "1") return;
  ascEditorModal.addEventListener("click", (e) => {
    const paletteToggle = e.target.closest("[data-palette-toggle]");
    if (paletteToggle) {
      e.preventDefault();
      const kind = String(paletteToggle.dataset.paletteToggle || "").trim();
      $$(".asc-editor-palette", ascEditorModal).forEach((wrap) => {
        wrap.classList.toggle("is-open", wrap.dataset.paletteKind === kind && !wrap.classList.contains("is-open"));
      });
      return;
    }
    const colorSwatch = e.target.closest("[data-color-target]");
    if (colorSwatch) {
      e.preventDefault();
      const targetId = String(colorSwatch.dataset.colorTarget || "").trim();
      const value = String(colorSwatch.dataset.colorValue || "");
      const input = targetId ? document.getElementById(targetId) : null;
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      $$(".asc-editor-palette", ascEditorModal).forEach((wrap) => wrap.classList.remove("is-open"));
      return;
    }
    const btn = e.target.closest("[data-editor-cmd], [data-editor-block]");
    if (!btn) return;
    e.preventDefault();
    const cmd = btn.getAttribute("data-editor-cmd");
    const block = btn.getAttribute("data-editor-block");
    if (cmd) ejecutarComandoEditor(cmd);
    if (block) aplicarBloqueEditor(block);
  });
  document.addEventListener("click", (e) => {
    if (!ascEditorModal || ascEditorModal.classList.contains("hidden")) return;
    if (e.target.closest(".asc-editor-palette")) return;
    $$(".asc-editor-palette", ascEditorModal).forEach((wrap) => wrap.classList.remove("is-open"));
  });
  ascEditorFontFamily?.addEventListener("change", (e) => {
    aplicarFuenteEditor(e.currentTarget?.value || "");
  });
  ascEditorFontSize?.addEventListener("change", (e) => {
    aplicarTamanoEditor(e.currentTarget?.value || "");
  });
  ascWordParagraphStyle?.addEventListener("change", (e) => {
    const val = e.currentTarget?.value || "";
    if (val) {
      ascWordSelectedStyleKey = val;
      ascWordSelectedStyleGroup = "paragraph";
    }
    aplicarEstiloWordParrafo(val);
    renderAscWordStylesPanel();
    aplicarPreviewEstilosWordAsc();
    syncAscWordStyleControls();
  });
  ascWordCharacterStyle?.addEventListener("change", (e) => {
    const val = e.currentTarget?.value || "";
    if (val) {
      ascWordSelectedStyleKey = val;
      ascWordSelectedStyleGroup = "character";
    }
    aplicarEstiloWordCaracter(val);
    renderAscWordStylesPanel();
    aplicarPreviewEstilosWordAsc();
    syncAscWordStyleControls();
  });
  ascWordStylesList?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-word-style-item]");
    if (!btn) return;
    ascWordSelectedStyleKey = String(btn.getAttribute("data-word-style-item") || "CBBody");
    ascWordSelectedStyleGroup = String(btn.getAttribute("data-word-style-group") || "paragraph");
    renderAscWordStylesPanel();
    aplicarResaltadoEstiloWordAsc();
    seleccionarTodoEstiloWordActual();
  });
  ascEditorSheetSize?.addEventListener("change", (e) => {
    aplicarTamanoHojaEditor(e.currentTarget?.value || "");
  });
  ascEditorZoomRange?.addEventListener("input", (e) => {
    ascEditorZoomActual = Number(e.currentTarget?.value || 100) || 100;
    aplicarTamanoHojaEditor(ascEditorSheetSize?.value || ascEditorSheetSizeActual || "carta");
  });
  ascEditorFontColor?.addEventListener("change", (e) => {
    aplicarColorEditor("foreColor", e.currentTarget?.value || "");
    _refrescarPaletasColorAsc();
  });
  ascEditorHighlightColor?.addEventListener("change", (e) => {
    aplicarColorEditor("hiliteColor", e.currentTarget?.value || "");
    _refrescarPaletasColorAsc();
  });
  _refrescarPaletasColorAsc();
  aplicarPreviewEstilosWordAsc();
  document.addEventListener("selectionchange", syncAscWordStyleControls);
  ascEditorModal.addEventListener("mouseup", syncAscWordStyleControls);
  ascEditorModal.addEventListener("keyup", syncAscWordStyleControls);
  ascEditorModal.addEventListener("click", syncAscWordStyleControls);
  ascEditorModal.dataset.toolbarBound = "1";
}

function bindPreguntasAsc() {
  if (!ascEditorModal || ascEditorModal.dataset.questionsBound === "1") return;
  ascEditorModal.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-question-open]");
    if (!trigger) return;
    e.preventDefault();
    openPreguntaModalAsc(Number(trigger.getAttribute("data-question-open") || 0));
  });
  getPRefs().forEach((ref) => {
    [ref.t, ref.n, ref.r, ref.c].forEach((input) => {
      input?.addEventListener("input", renderResumenPreguntasAsc);
    });
  });
  ascQuestionModal?.addEventListener("click", (e) => {
    if (e.target === ascQuestionModal) closePreguntaModalAsc();
  });
  ascSynonymsPanel?.addEventListener("click", (e) => {
    if (e.target === ascSynonymsPanel) closeAscSynonymsPanel();
  });
  ascEditorModal.dataset.questionsBound = "1";
}

function renderResumenPreguntasAsc() {
  const refs = getPRefs();
  $$("[data-question-open].asc-question-summary", ascEditorModal).forEach((btn, index) => {
    const ref = refs[index];
    const titulo = btn.querySelector("strong");
    const subtitulo = btn.querySelector("small");
    const numero = btn.querySelector(".asc-question-summary-num");
    const texto = String(ref?.t?.value || "").trim();
    const nivel = String(ref?.n?.value || "").trim();
    const criterio = String(ref?.c?.value || "").trim();
    if (titulo) titulo.textContent = texto ? `Pregunta ${index + 1}` : `Pregunta ${index + 1}`;
    if (subtitulo) {
      subtitulo.textContent = texto
        ? `${texto.slice(0, 64)}${texto.length > 64 ? "..." : ""}`
        : "Vacía";
    }
    if (numero) numero.textContent = String(index + 1).padStart(2, "0");
    btn.classList.toggle("is-active", index === ascQuestionActiva && !ascQuestionModal?.classList.contains("hidden"));
    btn.classList.toggle("is-filled", !!texto);
    if (nivel || criterio) {
      btn.title = [nivel ? `Nivel: ${nivel}` : "", criterio ? `Criterio: ${criterio}` : ""].filter(Boolean).join(" · ");
    } else {
      btn.removeAttribute("title");
    }
  });
  $$(".asc-question-index.is-compact", ascEditorModal).forEach((btn, index) => {
    const ref = refs[index];
    btn.classList.toggle("is-active", index === ascQuestionActiva && !ascQuestionModal?.classList.contains("hidden"));
    btn.classList.toggle("is-filled", !!String(ref?.t?.value || "").trim());
  });
}

function openPreguntaModalAsc(index = 0) {
  const idx = Math.max(0, Math.min(4, Number(index) || 0));
  ascQuestionActiva = idx;
  if (ascQuestionModalTitle) ascQuestionModalTitle.textContent = `Pregunta ${idx + 1}`;
  $$("[data-question-edit]", ascQuestionModal).forEach((block) => {
    block.classList.toggle("is-active", Number(block.getAttribute("data-question-edit")) === idx);
  });
  ascQuestionModal?.classList.remove("hidden");
  ascQuestionModal?.setAttribute("aria-hidden", "false");
  refrescarAscQuestionAiScope();
  renderResumenPreguntasAsc();
  const ref = getPRefs()[idx];
  requestAnimationFrame(() => {
    try { ref?.t?.focus(); } catch (_) {}
  });
}

function closePreguntaModalAsc() {
  ascQuestionModal?.classList.add("hidden");
  ascQuestionModal?.setAttribute("aria-hidden", "true");
  closeAscQuestionAiPanel();
  renderResumenPreguntasAsc();
}

function extraerTablasSinonimosAsc(html = "") {
  const wrap = document.createElement("div");
  wrap.innerHTML = String(html || "");
  const tablas = Array.from(wrap.querySelectorAll("table"));
  return tablas.filter((table) => {
    const contenido = String(table.textContent || "").toLowerCase();
    if (/\bsin[oó]nim/.test(contenido)) return true;
    let prev = table.previousElementSibling;
    while (prev) {
      const tag = String(prev.tagName || "").toUpperCase();
      const txt = String(prev.textContent || "").trim().toLowerCase();
      if (/\bsin[oó]nim/.test(txt)) return true;
      if (/^H[1-6]$/.test(tag) || tag === "P") break;
      prev = prev.previousElementSibling;
    }
    return false;
  }).map((table) => table.outerHTML);
}

function renderAscSynonymsPanel() {
  if (!ascSynonymsBody) return;
  const tablas = extraerTablasSinonimosAsc(ascTexto?.innerHTML || "");
  if (!tablas.length) {
    ascSynonymsBody.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "asc-synonyms-empty";
    empty.textContent = "No se detectaron tablas de sinónimos en esta lectura.";
    ascSynonymsBody.appendChild(empty);
    return;
  }
  ascSynonymsBody.replaceChildren();
  const fragment = document.createDocumentFragment();
  tablas.forEach((tabla, idx) => {
    const section = document.createElement("section");
    section.className = "asc-synonyms-block";

    const title = document.createElement("h4");
    title.textContent = `Tabla ${idx + 1}`;

    const tableWrap = document.createElement("div");
    tableWrap.className = "asc-synonyms-table-wrap";
    tableWrap.dataset.synonymTableIndex = String(idx);

    const parsed = new DOMParser().parseFromString(String(tabla || ""), "text/html");
    const tableEl = parsed.querySelector("table");
    if (tableEl) {
      tableWrap.appendChild(tableEl.cloneNode(true));
    }

    section.append(title, tableWrap);
    fragment.appendChild(section);
  });
  ascSynonymsBody.appendChild(fragment);
  $$("table.lectura-tabla-sinonimos", ascSynonymsBody).forEach((tableEl) => {
    tableEl.setAttribute("contenteditable", "true");
    tableEl.setAttribute("spellcheck", "false");
  });
}

function syncAscSynonymsTableToEditor(tableIndex = 0, tableHtml = "") {
  const idx = Math.max(0, Number(tableIndex || 0));
  const html = String(tableHtml || "").trim();
  if (!html || !ascTexto) return;
  const parsedEditor = new DOMParser().parseFromString(String(ascTexto.innerHTML || ""), "text/html");
  const wrap = document.createElement("div");
  Array.from(parsedEditor.body.childNodes).forEach((node) => {
    wrap.appendChild(node.cloneNode(true));
  });
  const tables = extraerTablasSinonimosAsc(wrap.innerHTML);
  if (!tables.length || !tables[idx]) return;
  const globalTables = Array.from(wrap.querySelectorAll("table")).filter((table) => {
    const contenido = String(table.textContent || "").toLowerCase();
    if (/\bsin[oó]nim/.test(contenido)) return true;
    let prev = table.previousElementSibling;
    while (prev) {
      const tag = String(prev.tagName || "").toUpperCase();
      const txt = String(prev.textContent || "").trim().toLowerCase();
      if (/\bsin[oó]nim/.test(txt)) return true;
      if (/^H[1-6]$/.test(tag) || tag === "P") break;
      prev = prev.previousElementSibling;
    }
    return false;
  });
  const target = globalTables[idx];
  if (!target) return;
  const parsedIncoming = new DOMParser().parseFromString(html, "text/html");
  const incoming = parsedIncoming.querySelector("table");
  if (!incoming) return;
  target.replaceWith(incoming.cloneNode(true));
  const fragment = document.createDocumentFragment();
  Array.from(wrap.childNodes).forEach((node) => {
    fragment.appendChild(node.cloneNode(true));
  });
  ascTexto.replaceChildren(fragment);
}

function openAscSynonymsPanel() {
  if (!ascSynonymsPanel) return;
  renderAscSynonymsPanel();
  ascSynonymsPanel.classList.remove("hidden");
  ascSynonymsPanel.setAttribute("aria-hidden", "false");
}

function closeAscSynonymsPanel() {
  ascSynonymsPanel?.classList.add("hidden");
  ascSynonymsPanel?.setAttribute("aria-hidden", "true");
}

function _ascQuestionScopeSnapshot() {
  const ref = getPRefs()[ascQuestionActiva] || {};
  const texto = String(ref.t?.value || "").trim();
  const nivel = String(ref.n?.value || "").trim();
  const criterio = String(ref.c?.value || "").trim();
  const respuesta = String(ref.r?.value || "").trim();
  if (ascQuestionAiScope === "criterio") {
    return { field: "criterio", label: "Criterio", text: criterio, payload: { criterio } };
  }
  if (ascQuestionAiScope === "respuesta") {
    return { field: "respuesta", label: "Respuesta esperada", text: respuesta, payload: { respuesta } };
  }
  if (ascQuestionAiScope === "bloque") {
    return {
      field: "bloque",
      label: "Pregunta completa",
      text: [texto, nivel, criterio, respuesta].filter(Boolean).join(" | "),
      payload: { texto, nivel, criterio, respuesta }
    };
  }
  return { field: "texto", label: "Pregunta", text: texto, payload: { texto } };
}

function refrescarAscQuestionAiScope() {
  const snap = _ascQuestionScopeSnapshot();
  if (ascQuestionAiPreview) {
    ascQuestionAiPreview.textContent = `${snap.label}: ${_ascTextoRecortado(snap.text || "(Vacío)")}`;
  }
  $$(".asc-ai-scope-btn[data-asc-question-scope]", ascQuestionModal).forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.ascQuestionScope === ascQuestionAiScope);
  });
}

function _ascQuestionChat(tipo = "ai", texto = "") {
  if (!ascQuestionAiChat) return;
  const bubble = document.createElement("div");
  bubble.className = `asc-ai-chat-bubble ${tipo}`;
  bubble.textContent = String(texto || "").trim();
  ascQuestionAiChat.appendChild(bubble);
  ascQuestionAiChat.scrollTop = ascQuestionAiChat.scrollHeight;
}

function openAscQuestionAiPanel() {
  if (!ascQuestionAiPanel) return;
  ascQuestionAiPanel.classList.remove("hidden");
  ascQuestionAiPanel.setAttribute("aria-hidden", "false");
  if (ascQuestionAiChat && !ascQuestionAiChat.children.length) {
    _ascQuestionChat("system", "Gemini puede editar la pregunta activa por campo o como bloque completo. Los cambios sólo se conservan al guardar la lectura.");
  }
  refrescarAscQuestionAiScope();
}

function closeAscQuestionAiPanel() {
  if (!ascQuestionAiPanel) return;
  ascQuestionAiPanel.classList.add("hidden");
  ascQuestionAiPanel.setAttribute("aria-hidden", "true");
  ascQuestionAiBusy = false;
  if (ascQuestionAiStatus) ascQuestionAiStatus.textContent = "Los cambios sólo se aplican en el modal hasta guardar.";
}

function toggleAscQuestionAiPanel() {
  if (!ascQuestionAiPanel) return;
  if (ascQuestionAiPanel.classList.contains("hidden")) openAscQuestionAiPanel();
  else closeAscQuestionAiPanel();
}

async function _ascEditarPreguntaConGemini({ instruccion = "", scope = {} } = {}) {
  const modelo = _ascModeloGeminiActual();
  const prompt = `
Eres un editor experto de preguntas de comprensión escolar.
Debes devolver estrictamente JSON válido con este formato:
{"texto":"","criterio":"","respuesta":"","summary":""}

Reglas:
- Edita sólo el campo o bloque solicitado.
- Si el alcance es un campo individual, devuelve únicamente ese campo cambiado y deja los demás intactos con el mismo valor recibido.
- Si el alcance es "bloque", puedes mejorar pregunta, criterio y respuesta de forma coherente.
- No uses markdown ni fences.

Título de lectura: ${ascTitulo?.value || "Sin título"}
Pregunta activa: ${ascQuestionActiva + 1}
Alcance: ${scope.field}
Contenido actual:
${JSON.stringify(scope.payload || {}, null, 2)}

Solicitud del usuario:
${instruccion}
`.trim();
  const { response, data } = await _ascGeminiGenerateViaBackend(modelo, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.55, topP: 0.9, topK: 30, maxOutputTokens: 2048 }
  });
  if (!response.ok) throw new Error(data?.error?.message || "No se pudo editar la pregunta con Gemini.");
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const parsed = _ascExtraerJson(text);
  if (!parsed) throw new Error("Gemini no devolvió un JSON válido para la pregunta.");
  return parsed;
}

function _ascAplicarRespuestaPreguntaIA(payload = {}) {
  const ref = getPRefs()[ascQuestionActiva] || {};
  if (typeof payload.texto === "string" && ref.t) ref.t.value = payload.texto;
  if (typeof payload.criterio === "string" && ref.c) ref.c.value = payload.criterio;
  if (typeof payload.respuesta === "string" && ref.r) ref.r.value = payload.respuesta;
  renderResumenPreguntasAsc();
  refrescarAscQuestionAiScope();
}

async function enviarAscQuestionAiPrompt() {
  const texto = String(ascQuestionAiPrompt?.value || "").trim();
  if (!texto || ascQuestionAiBusy) return;
  const scope = _ascQuestionScopeSnapshot();
  ascQuestionAiBusy = true;
  if (ascQuestionAiStatus) ascQuestionAiStatus.textContent = "Editando pregunta con Gemini...";
  _ascQuestionChat("user", texto);
  if (ascQuestionAiPrompt) ascQuestionAiPrompt.value = "";
  try {
    const result = await _ascEditarPreguntaConGemini({ instruccion: texto, scope });
    _ascAplicarRespuestaPreguntaIA({
      texto: scope.field === "texto" ? (result.texto ?? scope.payload.texto ?? "") : (result.texto ?? getPRefs()[ascQuestionActiva]?.t?.value ?? ""),
      criterio: scope.field === "criterio" ? (result.criterio ?? scope.payload.criterio ?? "") : (result.criterio ?? getPRefs()[ascQuestionActiva]?.c?.value ?? ""),
      respuesta: scope.field === "respuesta" ? (result.respuesta ?? scope.payload.respuesta ?? "") : (result.respuesta ?? getPRefs()[ascQuestionActiva]?.r?.value ?? "")
    });
    _ascQuestionChat("ai", result.summary || "Cambios aplicados en la pregunta activa.");
  } catch (err) {
    _ascQuestionChat("system", err?.message || "No se pudo editar la pregunta con IA.");
  } finally {
    ascQuestionAiBusy = false;
    if (ascQuestionAiStatus) ascQuestionAiStatus.textContent = "Los cambios sólo se aplican en el modal hasta guardar.";
  }
}

function normalizarContenidoAscEditor(html = "") {
  const raw = String(html || "").trim();
  if (!raw) return "";
  const wrap = document.createElement("div");
  wrap.innerHTML = raw;
  if (!wrap.querySelector("*")) {
    return raw
      .split(/\n{2,}/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => `<p>${esc(chunk)}</p>`)
      .join("") || "<p></p>";
  }
  wrap.querySelectorAll("*").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    node.style.removeProperty("color");
    node.style.removeProperty("background");
    node.style.removeProperty("background-color");
    node.style.removeProperty("background-image");
    node.style.removeProperty("text-shadow");
    node.style.removeProperty("filter");
    node.style.removeProperty("opacity");
    node.style.removeProperty("mix-blend-mode");
    node.style.removeProperty("font-size");
    node.style.removeProperty("font-family");
    node.style.removeProperty("line-height");
    if (node.tagName === "FONT") {
      node.removeAttribute("color");
      node.removeAttribute("face");
      node.removeAttribute("size");
    }
  });
  return wrap.innerHTML || "<p></p>";
}

// Boot de datos
async function boot(){ await renderTabla(); }

// Render tabla
async function renderTabla(){
  ascTbody.innerHTML = `<tr><td colspan="7" class="px-3 py-6 text-center text-gray-500">Cargando lecturas…</td></tr>`;
  const snap = await getDocs(collection(db, "lecturasASC"));
  cache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  poblarFiltrosAsc(cache);

  if (!cache.length){
    ascTbody.innerHTML = "";
    ascVacio.classList.remove("hidden");
    return;
  } else {
    ascVacio.classList.add("hidden");
  }

  let html = "";
  for (const r of cache){
      const published = r?.published === true;
      const publishLabel = published ? "Despublicar lectura" : "Publicar lectura";
      const hasMusic = _ascHasMusicAssets(r);
      const musicLabel = hasMusic ? "Re-generar música" : "Generar música";
      html += `
      <tr data-id="${esc(r.id)}">
        <td>${esc(r.titulo||"—")}</td>
        <td>${esc(r.serie||"—")}</td>
        <td>${esc(r.nivel||"—")}</td>
        <td>${esc(r.grado||"—")}</td>
        <td>${esc(r.trimestre??"—")}</td>
        <td>${esc(r.unidad??"—")}</td>
        <td>
          <div class="lectura-row-actions">
            <label class="lectura-publish-switch" title="${publishLabel}" aria-label="${publishLabel}">
              <input type="checkbox" class="lectura-publish-switch-input ascPublishToggle" ${published ? "checked" : ""} aria-label="${publishLabel}">
              <span class="lectura-publish-switch-track" aria-hidden="true">
                <span class="lectura-publish-switch-thumb"></span>
              </span>
            </label>
            <button class="lectura-action-btn action-ver ascView" title="Ver lectura" aria-label="Ver lectura">
              <i class="far fa-eye"></i>
            </button>
            <button class="lectura-action-btn action-live ascReadLive" title="Leer con Gemini Flash Live" aria-label="Leer con Gemini Flash Live" data-coleccion="lecturasASC">
              <i class="fas fa-volume-up"></i>
            </button>
            <button class="lectura-action-btn action-music ascMusic" title="${musicLabel}" aria-label="${musicLabel}">
              <i class="fas ${hasMusic ? "fa-rotate-right" : "fa-music"}"></i>
            </button>
            <button class="lectura-action-btn action-editar ascEdit" title="Editar lectura" aria-label="Editar lectura">
              <i class="fas fa-pen"></i>
            </button>
            <button class="lectura-action-btn action-eliminar ascDel" title="Eliminar lectura" aria-label="Eliminar lectura">
              <i class="fas fa-trash"></i>
            </button>
            <button class="lectura-action-btn action-word ascWord" title="Descargar Word" aria-label="Descargar Word">
              <i class="fas fa-file-word"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }
  ascTbody.innerHTML = html;

  $$(".ascView", ascTbody).forEach(b => b.addEventListener("click", onViewRow));
  $$(".ascReadLive", ascTbody).forEach(b => b.addEventListener("click", onReadLiveRow));
  $$(".ascReadLive", ascTbody).forEach(b => b.addEventListener("dblclick", onStopLiveRow));
  $$(".ascMusic", ascTbody).forEach(b => b.addEventListener("click", onGenerateMusicRow));
  $$(".ascPublishToggle", ascTbody).forEach(b => b.addEventListener("change", onTogglePublishedRow));
  $$(".ascEdit", ascTbody).forEach(b => b.addEventListener("click", onEditRow));
  $$(".ascDel",  ascTbody).forEach(b => b.addEventListener("click", onDeleteRow));
  $$(".ascWord", ascTbody).forEach(b => b.addEventListener("click", onDownloadWordRow));
  actualizarEstadoBotonesAscLive();
}

function poblarSelectAsc(selectEl, values = [], placeholder = "") {
  if (!selectEl) return;
  const current = String(selectEl.value || "");
  const unique = Array.from(new Set((Array.isArray(values) ? values : [])
    .map((v) => String(v ?? "").trim())
    .filter((v) => v && v !== "—")))
    .sort((a, b) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" }));
  selectEl.innerHTML = `<option value="">${placeholder}</option>${unique.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}`;
  if (current && unique.includes(current)) selectEl.value = current;
}

function poblarFiltrosAsc(items = []) {
  const rows = Array.isArray(items) ? items : [];
  poblarSelectAsc(ascFiltroNivel, rows.map((r) => r?.nivel || ""), "Nivel");
  poblarSelectAsc(ascFiltroGrado, rows.map((r) => r?.grado || ""), "Grado");
  poblarSelectAsc(ascFiltroTrimestre, rows.map((r) => r?.trimestre ?? ""), "Trim.");
  poblarSelectAsc(ascFiltroUnidad, rows.map((r) => r?.unidad ?? ""), "Unidad");
}

function actualizarEstadoBotonesAscLive(){
  const getter = window.cbGetLecturaGeminiLiveState;
  $$(".ascReadLive", ascTbody).forEach((btn) => {
    const id = btn.closest("tr")?.dataset.id || "";
    const coleccion = btn.dataset.coleccion || "lecturasASC";
    const state = typeof getter === "function"
      ? String(getter({ id, coleccion })?.state || "idle")
      : "idle";
    btn.dataset.state = state;
    if (state === "starting") {
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      btn.title = "Iniciando lectura...";
      btn.setAttribute("aria-label", "Iniciando lectura");
    } else if (state === "playing") {
      btn.innerHTML = '<i class="fas fa-pause"></i>';
      btn.title = "Pausar lectura";
      btn.setAttribute("aria-label", "Pausar lectura");
    } else if (state === "paused") {
      btn.innerHTML = '<i class="fas fa-play"></i>';
      btn.title = "Reanudar lectura";
      btn.setAttribute("aria-label", "Reanudar lectura");
    } else {
      btn.innerHTML = '<i class="fas fa-volume-up"></i>';
      btn.title = "Leer con Gemini Flash Live";
      btn.setAttribute("aria-label", "Leer con Gemini Flash Live");
    }
  });
}

// Filtros
function aplicarFiltrosAsc(){
  const q = String(ascBuscador?.value || "").toLowerCase().trim();
  const nivel = String(ascFiltroNivel?.value || "").toLowerCase().trim();
  const grado = String(ascFiltroGrado?.value || "").toLowerCase().trim();
  const trimestre = String(ascFiltroTrimestre?.value || "").toLowerCase().trim();
  const unidad = String(ascFiltroUnidad?.value || "").toLowerCase().trim();

  const filtradas = cache.filter((r) => {
    const coincideTexto = !q || [
      r?.titulo,
      r?.serie,
      r?.nivel,
      r?.grado,
      r?.trimestre,
      r?.unidad
    ].some((v) => String(v ?? "").toLowerCase().includes(q));
    const coincideNivel = !nivel || String(r?.nivel || "").toLowerCase() === nivel;
    const coincideGrado = !grado || String(r?.grado || "").toLowerCase() === grado;
    const coincideTrimestre = !trimestre || String(r?.trimestre ?? "").toLowerCase() === trimestre;
    const coincideUnidad = !unidad || String(r?.unidad ?? "").toLowerCase() === unidad;
    return coincideTexto && coincideNivel && coincideGrado && coincideTrimestre && coincideUnidad;
  });

  if (!filtradas.length) {
    ascTbody.innerHTML = "";
    ascVacio.classList.remove("hidden");
    return;
  }
  ascVacio.classList.add("hidden");

  let html = "";
  for (const r of filtradas){
      const published = r?.published === true;
      const publishLabel = published ? "Despublicar lectura" : "Publicar lectura";
      const hasMusic = _ascHasMusicAssets(r);
      const musicLabel = hasMusic ? "Re-generar música" : "Generar música";
      html += `
      <tr data-id="${esc(r.id)}">
        <td>${esc(r.titulo||"—")}</td>
        <td>${esc(r.serie||"—")}</td>
        <td>${esc(r.nivel||"—")}</td>
        <td>${esc(r.grado||"—")}</td>
        <td>${esc(r.trimestre??"—")}</td>
        <td>${esc(r.unidad??"—")}</td>
        <td>
          <div class="lectura-row-actions">
            <label class="lectura-publish-switch" title="${publishLabel}" aria-label="${publishLabel}">
              <input type="checkbox" class="lectura-publish-switch-input ascPublishToggle" ${published ? "checked" : ""} aria-label="${publishLabel}">
              <span class="lectura-publish-switch-track" aria-hidden="true">
                <span class="lectura-publish-switch-thumb"></span>
              </span>
            </label>
            <button class="lectura-action-btn action-ver ascView" title="Ver lectura" aria-label="Ver lectura">
              <i class="far fa-eye"></i>
            </button>
            <button class="lectura-action-btn action-live ascReadLive" title="Leer con Gemini Flash Live" aria-label="Leer con Gemini Flash Live" data-coleccion="lecturasASC">
              <i class="fas fa-volume-up"></i>
            </button>
            <button class="lectura-action-btn action-music ascMusic" title="${musicLabel}" aria-label="${musicLabel}">
              <i class="fas ${hasMusic ? "fa-rotate-right" : "fa-music"}"></i>
            </button>
            <button class="lectura-action-btn action-editar ascEdit" title="Editar lectura" aria-label="Editar lectura">
              <i class="fas fa-pen"></i>
            </button>
            <button class="lectura-action-btn action-eliminar ascDel" title="Eliminar lectura" aria-label="Eliminar lectura">
              <i class="fas fa-trash"></i>
            </button>
            <button class="lectura-action-btn action-word ascWord" title="Descargar Word" aria-label="Descargar Word">
              <i class="fas fa-file-word"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }
  ascTbody.innerHTML = html;
  $$(".ascView", ascTbody).forEach(b => b.addEventListener("click", onViewRow));
  $$(".ascReadLive", ascTbody).forEach(b => b.addEventListener("click", onReadLiveRow));
  $$(".ascReadLive", ascTbody).forEach(b => b.addEventListener("dblclick", onStopLiveRow));
  $$(".ascMusic", ascTbody).forEach(b => b.addEventListener("click", onGenerateMusicRow));
  $$(".ascPublishToggle", ascTbody).forEach(b => b.addEventListener("change", onTogglePublishedRow));
  $$(".ascEdit", ascTbody).forEach(b => b.addEventListener("click", onEditRow));
  $$(".ascDel",  ascTbody).forEach(b => b.addEventListener("click", onDeleteRow));
  $$(".ascWord", ascTbody).forEach(b => b.addEventListener("click", onDownloadWordRow));
  actualizarEstadoBotonesAscLive();
}

// ---------- Refs del editor SIEMPRE scoped al modal del editor ----------
function getPRefs() {
  const w = ascEditorModal || document; // 🔧 reemplazo de ascEditorWrap
  return [
    { t: w.querySelector("#ascP1"), n: w.querySelector("#ascP1Nivel"), r: w.querySelector("#ascP1Resp"), c: w.querySelector("#ascP1Crit") },
    { t: w.querySelector("#ascP2"), n: w.querySelector("#ascP2Nivel"), r: w.querySelector("#ascP2Resp"), c: w.querySelector("#ascP2Crit") },
    { t: w.querySelector("#ascP3"), n: w.querySelector("#ascP3Nivel"), r: w.querySelector("#ascP3Resp"), c: w.querySelector("#ascP3Crit") },
    { t: w.querySelector("#ascP4"), n: w.querySelector("#ascP4Nivel"), r: w.querySelector("#ascP4Resp"), c: w.querySelector("#ascP4Crit") },
    { t: w.querySelector("#ascP5"), n: w.querySelector("#ascP5Nivel"), r: w.querySelector("#ascP5Resp"), c: w.querySelector("#ascP5Crit") },
  ];
}

// Editor: Nuevo / Editar
function openEditorNew(){
  configureAscSharedEditor(null);
  MODO = "new";
  ascId.value = "";
  ascForm.reset();
  ascSerie.value = "Primaria en Forma";
  ascTexto.innerHTML = "<p></p>";
  if (ascEditorFontColor) ascEditorFontColor.value = "";
  if (ascEditorHighlightColor) ascEditorHighlightColor.value = "";
  toggleMetaAsc(false);
  togglePreguntasAsc(false);
  ascEditorFontSizeActual = 18;
  if (ascEditorFontSize) ascEditorFontSize.value = "18";
  ascEditorZoomActual = 100;
  if (ascEditorZoomRange) ascEditorZoomRange.value = "100";
  if (ascEditorSheetSize) ascEditorSheetSize.value = "carta";
  aplicarTamanoHojaEditor("carta");

  // limpiar preguntas con scope
  getPRefs().forEach(ref=>{
    if (ref.t) ref.t.value = "";
    if (ref.n) ref.n.value = "";
    if (ref.r) ref.r.value = "";
    if (ref.c) ref.c.value = "";
  });

  renderResumenPreguntasAsc();
  _refrescarPaletasColorAsc();
  aplicarPreviewEstilosWordAsc();
  renderAscWordStylesPanel();
  openEditorModal(); // 🔁 en lugar de toggleEditor(true)
}

async function onEditRow(e){
  const id = e.currentTarget.closest("tr")?.dataset.id;
  if (!id) return;
  let x = cache.find(d => d.id === id) || null;
  if (!x) {
    const snap = await getDoc(doc(db, "lecturasASC", id));
    if (!snap.exists()) return;
    x = { id, ...snap.data() };
  }

  configureAscSharedEditor(null);
  MODO = "edit";
  ascId.value = id;

  ascSerie.value     = x.serie || "";
  ascNivel.value     = x.nivel || "";
  ascGrado.value     = x.grado || "";
  ascTrimestre.value = x.trimestre ?? "";
  ascUnidad.value    = x.unidad ?? "";
  ascTitulo.value    = x.titulo || "";
  const contenidoLectura = x.textoLectura || x.contenidoHTML || x.lecturaHTML || x.htmlLectura || "";
  ascTexto.innerHTML = normalizarContenidoAscEditor(contenidoLectura || "<p></p>");
  if (!String(ascTexto.innerHTML || "").trim()) {
    ascTexto.innerHTML = "<p></p>";
  }
  toggleMetaAsc(false);
  togglePreguntasAsc(false);
  ascEditorFontSizeActual = Number(ascEditorFontSize?.value || 18) || 18;
  if (ascEditorFontSize) ascEditorFontSize.value = String(Math.round(ascEditorFontSizeActual));
  ascEditorZoomActual = Number(ascEditorZoomRange?.value || 100) || 100;
  if (ascEditorZoomRange) ascEditorZoomRange.value = String(Math.round(ascEditorZoomActual));
  if (ascEditorSheetSize) ascEditorSheetSize.value = ascEditorModal?.dataset.sheetSize || "carta";
  aplicarTamanoHojaEditor(ascEditorSheetSize?.value || "carta");
  if (ascEditorFontColor) ascEditorFontColor.value = "";
  if (ascEditorHighlightColor) ascEditorHighlightColor.value = "";

const P = getPRefs();
const preguntas = Array.isArray(x.preguntas) ? x.preguntas : [];
P.forEach((ref, i) => {
  const p = preguntas[i] || {};
  if (ref.t) ref.t.value = p.texto || "";
  if (ref.n) ref.n.value = p.nivel || "";
  if (ref.r) ref.r.value = p.respuesta || "";
  if (ref.c) ref.c.value = p.criterio || "";
});
  renderResumenPreguntasAsc();
  _refrescarPaletasColorAsc();
  aplicarPreviewEstilosWordAsc();
  renderAscWordStylesPanel();
  openEditorModal();
  requestAnimationFrame(() => {
    try { ascTexto.scrollIntoView({ block: "start", inline: "nearest" }); } catch (_) {}
  });
}

async function onReadLiveRow(e){
  e.preventDefault();
  e.stopPropagation();
  const id = e.currentTarget.closest("tr")?.dataset.id;
  if (!id) return;
  const controller = window.cbControlLecturaGeminiLive;
  if (typeof controller !== "function") {
    alert("La lectura con Gemini Flash Live no está disponible en este momento.");
    return;
  }
  actualizarEstadoBotonesAscLive();
  const result = await controller({ id, coleccion: "lecturasASC" });
  actualizarEstadoBotonesAscLive();
  if (!result?.ok) {
    alert("No se pudo iniciar la lectura con Gemini Flash Live.");
  }
}

async function onStopLiveRow(e){
  e.preventDefault();
  e.stopPropagation();
  const id = e.currentTarget.closest("tr")?.dataset.id;
  if (!id) return;
  const controller = window.cbControlLecturaGeminiLive;
  if (typeof controller !== "function") return;
  await controller({ id, coleccion: "lecturasASC" }, { stop: true });
  actualizarEstadoBotonesAscLive();
}

async function onViewRow(e){
  e.preventDefault();
  e.stopPropagation();
  const id = e.currentTarget.closest("tr")?.dataset.id;
  if (!id) return;
  const snap = await getDoc(doc(db, "lecturasASC", id));
  if (!snap.exists()) {
    alert("Lectura no encontrada.");
    return;
  }
  const d = snap.data() || {};
  const musicAssets = _ascExtractMusicAssets(d);
  if (typeof window.cbOpenLecturasAgentViewer === "function") {
    window.cbOpenLecturasAgentViewer({
      id,
      coleccion: "lecturasASC",
      sourceCollection: "lecturasASC",
      titulo: d.titulo || "Lectura sin título",
      htmlLectura: d.textoLectura || "<p>(Sin contenido)</p>",
      musicAssets,
      musicConfig: musicAssets?.musicConfig || {},
      allowMusicGeneration: true,
      preguntas: Array.isArray(d.preguntas) ? d.preguntas : [],
      metadatos: {
        nivel: d.nivel || "",
        grado: d.grado || "",
        trimestre: d.trimestre || "",
        unidad: d.unidad || ""
      }
    });
    return;
  }
  const { modal, contenido } = getResultadoLecturaRefs();
  if (!modal || !contenido) {
    alert("No está disponible el visor de lectura.");
    return;
  }
  contenido.innerHTML = `
    <article class="lectura-vista-completa">
      <h2 style="margin-bottom:20px; color:#333;">${esc(d.titulo || "Lectura sin título")}</h2>
      <div class="lectura-vista-body">
        ${d.textoLectura || "<p>(Sin contenido)</p>"}
      </div>
    </article>
  `;
  const ascFilter = String(ascBuscador?.value || "").trim();
  try { window.cbUnidadDock?.openSection?.("modalResultadoLectura"); } catch (_) {}
  if (typeof window.cbOpenReadingResultPanel === "function") {
    window.cbOpenReadingResultPanel(modal, {
      returnToSection: "ascModal",
      ascFilter,
      ascRowId: id
    });
  } else {
    modal.style.display = "block";
    document.body.style.overflow = "hidden";
  }
}

async function onGenerateMusicRow(e){
  e.preventDefault();
  e.stopPropagation();
  const rowEl = e.currentTarget.closest("tr");
  const id = rowEl?.dataset.id || "";
  if (!id) return;
  const icon = e.currentTarget.querySelector("i");
  const prevClass = icon?.className || "";
  if (icon) icon.className = "fas fa-spinner fa-spin";
  e.currentTarget.disabled = true;
  try {
    let row = cache.find((item) => String(item?.id || "") === id) || null;
    if (!row) {
      const snap = await getDoc(doc(db, "lecturasASC", id));
      if (!snap.exists()) throw new Error("Lectura no encontrada.");
      row = {id, ...snap.data()};
    }
    const force = _ascHasMusicAssets(row);
    const result = await _ascGenerateMusicForLectura(row, {sourceCollection: "lecturasASC", force});
    const modeText = force ? "re-generada" : "generada";
    alert(`✅ Música ${modeText}. Lectura y game listas.\nFuente: ${result.source === "storage" ? "Storage" : "Lyria"}`);
    await renderTabla();
  } catch (err) {
    alert(`❌ ${err?.message || "No se pudo generar la música."}`);
    if (icon) icon.className = prevClass || "fas fa-music";
  } finally {
    e.currentTarget.disabled = false;
  }
}

async function onDownloadWordRow(e){
  e.preventDefault();
  e.stopPropagation();
  const id = e.currentTarget.closest("tr")?.dataset.id;
  if (!id) return;
  const snap = await getDoc(doc(db, "lecturasASC", id));
  if (!snap.exists()) {
    alert("No se pudo descargar. Lectura no encontrada.");
    return;
  }
  const d = snap.data() || {};
  if (!window.htmlDocx?.asBlob) {
    alert("La librería para descargar Word no está disponible.");
    return;
  }
  const titulo = d.titulo || "lectura-asc";
  const preguntas = Array.isArray(d.preguntas) && d.preguntas.length
    ? `
      <ol>
        ${d.preguntas.map((p) => `
          <li>
            <p><strong>${p?.texto || ""}</strong></p>
            <p><strong>Nivel PISA:</strong> Nivel ${p?.nivel || "?"} — <strong>Criterio:</strong> ${p?.criterio || "—"}</p>
            <p style="color:#c970d6;">${p?.respuesta || ""}</p>
          </li>
        `).join("")}
      </ol>
    `
    : "<p>(Sin preguntas guardadas)</p>";

  const fullHTML = `
    <h2 style="margin-bottom:10px;">${esc(titulo)}</h2>
    ${d.textoLectura || "<p>(Sin contenido)</p>"}
    <hr style="margin:30px 0;"/>
    <h2 style="margin-bottom:10px;">Preguntas de Comprensión</h2>
    ${preguntas}
  `.trim();

  await downloadStyledDocx({
    html: `${d.textoLectura || "<p>(Sin contenido)</p>"}<hr><h2>Preguntas de Comprensión</h2>${preguntas}`,
    title: titulo,
    subtitle: `${d.nivel || ""} · ${d.grado || ""}`.replace(/\s+/g, " ").trim(),
    filename: `${sanitizeWordFilename(titulo, "lectura")}-${id}.docx`,
    styleDefinitions: ascWordStyleDefinitions
  });
}

function _ascSanitizeFilenamePart(value = "", fallback = "archivo") {
  const cleaned = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
  return cleaned || fallback;
}

function _ascDescargarBlobWord(html = "", filename = "documento.docx") {
  if (!window.htmlDocx?.asBlob) {
    alert("La librería para descargar Word no está disponible.");
    return;
  }
  const documento = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
          h1, h2, h3, h4, h5 { color: #2c3e50; margin-top: 18px; margin-bottom: 10px; }
          table { border-collapse: collapse; width: 100%; margin: 14px 0; }
          table, th, td { border: 1px solid #d6d6d6; }
          th, td { padding: 8px; text-align: left; }
          hr { margin: 26px 0; border: none; border-top: 1px solid #cbd5e1; }
        </style>
      </head>
      <body>${html}</body>
    </html>
  `;
  Promise.resolve()
    .then(() => window.htmlDocx.asBlob(documento))
    .then((blob) => _ascInjectDocxThumbnail(blob, {
      title: ascTitulo?.value || "Documento",
      subtitle: ascSharedEditorContext?.mode === "unidad-generada"
        ? `${ascNivel?.value || ""} · Trim ${ascTrimestre?.value || ""} · Unidad ${ascUnidad?.value || ""}`.replace(/\s+/g, " ").trim()
        : `${ascNivel?.value || ""} · ${ascGrado?.value || ""}`.replace(/\s+/g, " ").trim()
    }))
    .catch(() => null)
    .then((finalBlob) => {
      const blob = finalBlob || window.htmlDocx.asBlob(documento);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
}

async function _ascInjectDocxThumbnail(blob, options = {}) {
  const JSZipCtor = window.htmlDocx?.JSZip || window.JSZip;
  if (!blob || !JSZipCtor) return blob;
  try {
    const thumbnailBlob = await _ascBuildDocxThumbnailBlob(options);
    if (!thumbnailBlob) return blob;
    const zip = new JSZipCtor(await blob.arrayBuffer());
    const relsPath = "_rels/.rels";
    const contentTypesPath = "[Content_Types].xml";
    const thumbnailPath = "docProps/thumbnail.jpeg";
    zip.file(thumbnailPath, await thumbnailBlob.arrayBuffer(), { binary: true });

    const relsXml = zip.file(relsPath)?.asText?.();
    if (relsXml) {
      const relsDoc = new DOMParser().parseFromString(relsXml, "application/xml");
      const root = relsDoc.documentElement;
      const relType = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail";
      Array.from(root.getElementsByTagName("Relationship")).forEach((node) => {
        if (node.getAttribute("Type") === relType) node.parentNode?.removeChild(node);
      });
      const ids = Array.from(root.getElementsByTagName("Relationship"))
        .map((node) => Number(String(node.getAttribute("Id") || "").replace(/^rId/i, "")))
        .filter((n) => Number.isFinite(n));
      const nextId = `rId${(ids.length ? Math.max(...ids) : 0) + 1}`;
      const rel = relsDoc.createElementNS(root.namespaceURI, "Relationship");
      rel.setAttribute("Id", nextId);
      rel.setAttribute("Type", relType);
      rel.setAttribute("Target", "docProps/thumbnail.jpeg");
      root.appendChild(rel);
      zip.file(relsPath, new XMLSerializer().serializeToString(relsDoc));
    }

    const contentTypesXml = zip.file(contentTypesPath)?.asText?.();
    if (contentTypesXml) {
      const ctDoc = new DOMParser().parseFromString(contentTypesXml, "application/xml");
      const root = ctDoc.documentElement;
      const defaults = Array.from(root.getElementsByTagName("Default"));
      const hasJpeg = defaults.some((node) => {
        const ext = String(node.getAttribute("Extension") || "").toLowerCase();
        return ext === "jpeg" || ext === "jpg";
      });
      if (!hasJpeg) {
        const def = ctDoc.createElementNS(root.namespaceURI, "Default");
        def.setAttribute("Extension", "jpeg");
        def.setAttribute("ContentType", "image/jpeg");
        root.appendChild(def);
      }
      zip.file(contentTypesPath, new XMLSerializer().serializeToString(ctDoc));
    }

    return zip.generate({ type: "blob" });
  } catch (_) {
    return blob;
  }
}

function _ascWrapTextLines(ctx, text = "", maxWidth = 320) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines;
}

async function _ascBuildDocxThumbnailBlob(options = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const title = String(options.title || "Documento").trim();
  const subtitle = String(options.subtitle || "").trim();

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#f8fbff");
  gradient.addColorStop(1, "#e8eefb");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#d8e1f2";
  ctx.lineWidth = 3;
  _ascRoundRect(ctx, 42, 36, 428, 440, 28);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#2b3a67";
  ctx.font = "700 20px Georgia";
  ctx.fillText("Charly Brown", 72, 88);

  ctx.fillStyle = "#1f2937";
  ctx.font = "700 30px Arial";
  const titleLines = _ascWrapTextLines(ctx, title, 360).slice(0, 5);
  titleLines.forEach((line, index) => {
    ctx.fillText(line, 72, 156 + index * 38);
  });

  if (subtitle) {
    ctx.fillStyle = "#5b6475";
    ctx.font = "500 18px Arial";
    const subtitleLines = _ascWrapTextLines(ctx, subtitle, 360).slice(0, 3);
    subtitleLines.forEach((line, index) => {
      ctx.fillText(line, 72, 352 + index * 28);
    });
  }

  ctx.fillStyle = "#7c8db5";
  ctx.fillRect(72, 392, 120, 8);
  ctx.fillRect(72, 416, 220, 8);
  ctx.fillRect(72, 440, 176, 8);

  return await new Promise((resolve) => {
    canvas.toBlob((out) => resolve(out || null), "image/jpeg", 0.92);
  });
}

function _ascRoundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function _ascBuildUnidadWordFilename(tipo = "alumno") {
  const nivel = _ascSanitizeFilenamePart(ascNivel?.value || "Nivel", "Nivel");
  const trimestre = _ascSanitizeFilenamePart(`trim${ascTrimestre?.value || "x"}`, "trimx");
  const unidad = _ascSanitizeFilenamePart(`unidad${ascUnidad?.value || "x"}`, "unidadx");
  const sufijo = tipo === "maestro" ? "maestro" : "alumno";
  return `${nivel}-${trimestre}-${unidad}-${sufijo}.docx`;
}

function _ascBuildLecturaWordFilename() {
  return `${_ascSanitizeFilenamePart(ascTitulo?.value || "lectura", "lectura")}.docx`;
}

function _ascPrepararHtmlUnidadPorTipo(tipo = "alumno") {
  persistirAscUnidadSeccionActual();
  const html = reconstruirAscUnidadHtml();
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  const selector = tipo === "maestro" ? ".col-maestro" : ".col-alumno";
  const bloques = Array.from(wrap.querySelectorAll(".bloque-subtema"));
  const partes = [];
  if (bloques.length) {
    bloques.forEach((bloque) => {
      const columna = bloque.querySelector(selector);
      if (columna) partes.push(columna.outerHTML);
    });
  } else {
    Array.from(wrap.querySelectorAll(selector)).forEach((columna) => {
      partes.push(columna.outerHTML);
    });
  }
  return partes.join("<hr>");
}

function _ascPrepararHtmlLecturaCompleta() {
  const payload = collectSharedEditorPayload();
  const refs = getPRefs();
  const preguntas = refs.some((ref) => String(ref?.t?.value || "").trim())
    ? `
      <hr>
      <h2>Preguntas de Comprensión</h2>
      <ol>
        ${refs.map((ref) => {
          const texto = String(ref?.t?.value || "").trim();
          if (!texto) return "";
          return `
            <li>
              <p><strong>${esc(texto)}</strong></p>
              <p><strong>Nivel:</strong> ${esc(ref?.n?.value || "—")} <strong>Criterio:</strong> ${esc(ref?.c?.value || "—")}</p>
              <p>${esc(ref?.r?.value || "")}</p>
            </li>
          `;
        }).join("")}
      </ol>
    `
    : "";
  return `
    <h1>${esc(payload.titulo || "Lectura")}</h1>
    ${payload.contenidoHTML || "<p>(Sin contenido)</p>"}
    ${preguntas}
  `;
}

function openAscWordExportModal() {
  if (!ascWordExportModal) return;
  ascWordExportModal.classList.remove("hidden");
  ascWordExportModal.setAttribute("aria-hidden", "false");
}

function closeAscWordExportModal() {
  if (!ascWordExportModal) return;
  ascWordExportModal.classList.add("hidden");
  ascWordExportModal.setAttribute("aria-hidden", "true");
}

function exportarAscUnidadWord(tipo = "alumno") {
  const html = _ascPrepararHtmlUnidadPorTipo(tipo);
  if (!String(html || "").trim()) {
    alert(`No hay contenido de ${tipo} para exportar.`);
    return;
  }
  downloadStyledDocx({
    html,
    title: ascTitulo?.value || "Unidad",
    subtitle: `${ascNivel?.value || ""} · Trim ${ascTrimestre?.value || ""} · Unidad ${ascUnidad?.value || ""}`.replace(/\s+/g, " ").trim(),
    filename: _ascBuildUnidadWordFilename(tipo),
    styleDefinitions: ascWordStyleDefinitions
  });
}

function onAscDescargarWordEditor(e) {
  e?.preventDefault?.();
  e?.stopPropagation?.();
  if (ascSharedEditorContext?.mode === "unidad-generada") {
    openAscWordExportModal();
    return;
  }
  downloadStyledDocx({
    html: _ascPrepararHtmlLecturaCompleta(),
    title: ascTitulo?.value || "Lectura",
    subtitle: `${ascNivel?.value || ""} · ${ascGrado?.value || ""}`.replace(/\s+/g, " ").trim(),
    filename: _ascBuildLecturaWordFilename(),
    styleDefinitions: ascWordStyleDefinitions
  });
}

window.addEventListener("cb:lectura-live-state", actualizarEstadoBotonesAscLive);


// Eliminar
async function onDeleteRow(e){
  const id = e.currentTarget.closest("tr")?.dataset.id; if (!id) return;
  if (!confirm("¿Eliminar esta lectura?")) return;
  try{
    await deleteDoc(doc(db,"lecturasASC", id));
    await renderTabla();
  }catch(err){
    alert("❌ No se pudo eliminar.");
  }
}

async function onTogglePublishedRow(e){
  const input = e.currentTarget;
  const id = input.closest("tr")?.dataset.id;
  if (!id) return;
  const nextPublished = input.checked === true;
  input.disabled = true;
  try {
    await updateDoc(doc(db, "lecturasASC", id), {
      published: nextPublished
    });
    const label = input.closest(".lectura-publish-switch");
    const nextLabel = nextPublished ? "Despublicar lectura" : "Publicar lectura";
    if (label) {
      label.setAttribute("title", nextLabel);
      label.setAttribute("aria-label", nextLabel);
    }
    input.setAttribute("aria-label", nextLabel);
    const idx = cache.findIndex((r) => r?.id === id);
    if (idx >= 0) cache[idx].published = nextPublished;
  } catch (_) {
    input.checked = !nextPublished;
    alert("❌ No se pudo actualizar el estado de publicación.");
  } finally {
    input.disabled = false;
  }
}

// Guardar
async function onSubmit(ev){
  ev.preventDefault();
  if (ascSharedEditorContext?.onSave) {
    const payload = collectSharedEditorPayload();
    if (!payload.titulo || !payload.contenidoHTML || (ascSharedEditorContext.mode !== "unidad-generada" && (!payload.nivel || !payload.grado))) {
      alert("Completa título, nivel, grado y texto de lectura.");
      return;
    }
    try {
      await ascSharedEditorContext.onSave(payload);
      closeEditorModal();
      alert("✅ Guardado.");
    } catch (_) {
      alert("❌ No se pudo guardar.");
    }
    return;
  }
  const payload = collectForm();
  if (!payload.titulo || !payload.nivel || !payload.grado || !payload.textoLectura){
    alert("Completa título, nivel, grado y texto de lectura.");
    return;
  }
  try{
    if (MODO==="edit" && ascId.value){
      await updateDoc(doc(db,"lecturasASC", ascId.value), payload);
    } else {
      await addDoc(collection(db,"lecturasASC"), { ...payload, published: false, createdAt:new Date(), userId: auth.currentUser?.uid || "anónimo" });
    }
    closeEditorModal();
    await renderTabla();
    alert("✅ Guardado.");
  }catch(err){
    alert("❌ No se pudo guardar.");
  }
}

function collectForm(){
  const preguntas = [];
  
  // Usar las referencias correctas del editor modal
  const P = getPRefs();
  
  P.forEach((ref, index) => {
    // Verificar que existe contenido en la pregunta antes de incluirla
    const textoPregunta = ref.t?.value?.trim() || "";
    const respuesta = ref.r?.value?.trim() || "";
    const criterio = ref.c?.value?.trim() || "";
    const nivel = ref.n?.value?.trim() || "";
    
    // Solo incluir pregunta si tiene texto
    if (textoPregunta) {
      preguntas.push({
        texto: textoPregunta,
        respuesta: respuesta,
        criterio: criterio,
        nivel: nivel
      });
    }
  });

  // 🔥 CONVERTIR GRADO A STRING
  const gradoRaw = ascGrado?.value || "";
  const gradoFinal = String(gradoRaw).trim();

  return {
    serie: (ascSerie?.value || "").trim(),
    nivel: (ascNivel?.value || "").trim(),
    grado: gradoFinal,
    trimestre: ascTrimestre?.value ? String(ascTrimestre.value).trim() : "",
    unidad: ascUnidad?.value ? String(ascUnidad.value).trim() : "",
    titulo: (ascTitulo?.value || "").trim(),
    textoLectura: (ascTexto?.innerHTML || "").trim(),
    preguntas: preguntas
  };
}

window.cbOpenLecturaEditorCompartido = async function cbOpenLecturaEditorCompartido(options = {}) {
  const context = {
    mode: options.mode || "lecturas-nuevas",
    serieLabel: options.serieLabel || "Sinopsis",
    nivelLabel: options.nivelLabel || "Nivel",
    gradoLabel: options.gradoLabel || "Grado",
    trimestreLabel: options.trimestreLabel || "Trimestre",
    unidadLabel: options.unidadLabel || "Unidad",
    titlePlaceholder: options.titlePlaceholder || "Escribe el título de la lectura",
    onSave: typeof options.onSave === "function" ? options.onSave : null
  };
  configureAscSharedEditor(context);
  MODO = "shared";
  if (ascId) ascId.value = String(options.id || "");
  if (ascSerie) ascSerie.value = String(options.tema || options.serie || "");
  if (ascNivel) ascNivel.value = String(options.nivel || "");
  if (ascGrado) ascGrado.value = String(options.grado || "");
  if (ascTrimestre) ascTrimestre.value = String(options.trimestre || "");
  if (ascUnidad) ascUnidad.value = String(options.unidad || "");
  if (ascTitulo) ascTitulo.value = String(options.titulo || "");
  if (context.mode === "unidad-generada") {
    inicializarAscUnidadEditor(options.contenidoHTML || options.textoLectura || options.contenidoPlano || "<p></p>");
  }
  if (ascTextoSingle) {
    const contenidoInicial = context.mode === "unidad-generada"
      ? (ascUnitEditorState?.sections?.pages?.alumno?.[0]?.html || ascUnitEditorState?.sections?.alumno || "<p></p>")
      : (options.contenidoHTML || options.textoLectura || options.contenidoPlano || "<p></p>");
    ascTextoSingle.innerHTML = normalizarContenidoAscEditor(contenidoInicial);
    if (!String(ascTextoSingle.innerHTML || "").trim()) ascTextoSingle.innerHTML = "<p></p>";
  }
  getPRefs().forEach((ref) => {
    if (ref.t) ref.t.value = "";
    if (ref.n) ref.n.value = "";
    if (ref.r) ref.r.value = "";
    if (ref.c) ref.c.value = "";
  });
  renderResumenPreguntasAsc();
  if (ascEditorFontColor) ascEditorFontColor.value = "";
  if (ascEditorHighlightColor) ascEditorHighlightColor.value = "";
  _refrescarPaletasColorAsc();
  ascEditorFontSizeActual = Number(ascEditorFontSize?.value || 18) || 18;
  ascEditorZoomActual = Number(ascEditorZoomRange?.value || 100) || 100;
  aplicarTamanoHojaEditor(ascEditorSheetSize?.value || "carta");
  toggleMetaAsc(false);
  togglePreguntasAsc(true);
  renderAscUnidadCanvas();
  actualizarBotonesAscUnidadSeccion();
  renderAscUnidadSubtemas();
  aplicarPreviewEstilosWordAsc();
  ascWordSelectedStyleKey = "";
  ascWordSelectedStyleGroup = "paragraph";
  if (ascWordParagraphStyle) ascWordParagraphStyle.value = "";
  if (ascWordCharacterStyle) ascWordCharacterStyle.value = "";
  renderAscWordStylesPanel();
  bindAscStyleLiveRefresh();
  openEditorModal();
  requestAnimationFrame(() => {
    try { ascTexto?.focus(); } catch (_) {}
  });
};



// Import / Export XLSX
async function importarXlsx(file){
  try{
    await ensureXLSX();
    const buf = await file.arrayBuffer();
    const wb  = XLSX.read(buf, {type:"array"});
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const rows= XLSX.utils.sheet_to_json(ws, {defval:""});

    let ok=0;
    for (const r of rows){
      const preguntas=[];
      for (let i=1;i<=5;i++){
        const t = r[`p${i}`]||"";
        if (!t) continue;
        preguntas.push({
          texto: t,
          nivel: r[`p${i}_nivel`]||"",
          criterio: r[`p${i}_criterio`]||"",
          respuesta: r[`p${i}_resp`]||""
        });
      }

      const textoImportado = r.textoLectura || "";
      const textoFormateado = procesarTextoLectura(textoImportado);

      // 🔥 CONVERTIR GRADO A STRING (por si viene como número del Excel)
      const gradoImportado = r.grado || "";
      const gradoFinal = String(gradoImportado).trim(); // "1", "2", "3", etc.

      const docu = {
        serie: r.serie||"",
        nivel: r.nivel||"",
        grado: gradoFinal, // 🔥 Siempre string
        trimestre: r.trimestre||"",
        unidad: r.unidad||"",
        titulo: r.titulo||"",
        textoLectura: textoFormateado,
        published: false,
        preguntas,
        createdAt: new Date()
      };

      if (!docu.titulo || !docu.nivel || !docu.grado) continue;
      await addDoc(collection(db,"lecturasASC"), docu);
      ok++;
    }
    await renderTabla();
    alert(`✅ Importación completada (${ok})`);
  }catch(err){
    alert("❌ No se pudo importar el XLSX.");
  }
}


async function exportarXlsx(){
  try{
    await ensureXLSX();
    const snap = await getDocs(collection(db,"lecturasASC"));
    const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    if (!rows.length){ alert("No hay lecturas para exportar."); return; }

    const headers = ["id","serie","nivel","grado","trimestre","unidad","titulo","textoLectura",
      "p1","p1_nivel","p1_criterio","p1_resp",
      "p2","p2_nivel","p2_criterio","p2_resp",
      "p3","p3_nivel","p3_criterio","p3_resp",
      "p4","p4_nivel","p4_criterio","p4_resp",
      "p5","p5_nivel","p5_criterio","p5_resp"
    ];
    const aoa = [headers];

    for (const r of rows){
      const p = (r.preguntas||[]);
      const flat = (i)=>[ p[i]?.texto||"", p[i]?.nivel||"", p[i]?.criterio||"", p[i]?.respuesta||"" ];
      
      // 🔥 ASEGURAR QUE EL GRADO SEA STRING AL EXPORTAR
      const gradoExportar = String(r.grado || "");
      
      aoa.push([
        r.id||"", 
        r.serie||"", 
        r.nivel||"", 
        gradoExportar, // 🔥 Siempre string al exportar
        r.trimestre||"", 
        r.unidad||"", 
        r.titulo||"", 
        extraerTextoPlano(r.textoLectura || ""),
        ...flat(0), ...flat(1), ...flat(2), ...flat(3), ...flat(4)
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = headers.map(h=>({ wch: Math.min(60, Math.max(10, String(h).length+2)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "LecturasASC");
    XLSX.writeFile(wb, `Lecturas_ASC_${new Date().toISOString().slice(0,10)}.xlsx`, {compression:true});
  }catch(err){
    alert("❌ Error al exportar.");
  }
}

function extraerTextoPlano(html){
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const texto = tmp.innerText || tmp.textContent || "";
  // Normaliza saltos dobles para separar párrafos de forma legible
  return texto.replace(/\n{2,}/g, '\n').trim();
}

function convertirTextoPlanoAHTML(textoPlano) {
  return textoPlano
    .split('\n')
    .map(linea => `<p>${linea.trim()}</p>`)
    .join('');
}

function convertirMarkdownBasicoAHTML(texto) {
  return texto
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')   // negrita
    .replace(/_(.*?)_/g, '<em>$1</em>');                 // cursiva
}

function procesarTextoLectura(textoPlano) {
  const conEstilo = convertirMarkdownBasicoAHTML(textoPlano);
  return convertirTextoPlanoAHTML(conEstilo);
}

window.cbGenerateLecturaMusicAssets = async function cbGenerateLecturaMusicAssets(payload = {}) {
  const lecturaId = String(payload?.id || "").trim();
  if (!lecturaId) throw new Error("No se recibió id de lectura.");
  const sourceCollection = String(payload?.sourceCollection || payload?.coleccion || "lecturasASC").trim() || "lecturasASC";
  let row = cache.find((item) => String(item?.id || "") === lecturaId) || null;
  if (!row) {
    const snap = await getDoc(doc(db, sourceCollection, lecturaId));
    if (!snap.exists()) throw new Error("Lectura no encontrada.");
    row = {id: lecturaId, ...snap.data()};
  }
  const mergedRow = {
    ...row,
    titulo: payload?.titulo || row?.titulo || "",
    textoLectura: payload?.htmlLectura || row?.textoLectura || row?.contenidoHTML || ""
  };
  const force = payload?.force === true || _ascHasMusicAssets(mergedRow);
  const musicConfig = _ascNormalizeMusicProfile(payload?.musicConfig || _ascExtractStoredMusicConfig(mergedRow));
  const promptReading = String(payload?.promptReading || "").trim();
  const promptGame = String(payload?.promptGame || "").trim();
  return _ascGenerateMusicForLectura(mergedRow, {
    sourceCollection,
    force,
    promptReading,
    promptGame,
    musicConfig
  });
};

window.cbDeleteLecturaMusicAssets = async function cbDeleteLecturaMusicAssets(payload = {}) {
  const lecturaId = String(payload?.id || "").trim();
  if (!lecturaId) throw new Error("No se recibió id de lectura.");
  const sourceCollection = String(payload?.sourceCollection || payload?.coleccion || "lecturasASC").trim() || "lecturasASC";
  let row = cache.find((item) => String(item?.id || "") === lecturaId) || null;
  if (!row) {
    const snap = await getDoc(doc(db, sourceCollection, lecturaId));
    if (!snap.exists()) throw new Error("Lectura no encontrada.");
    row = {id: lecturaId, ...snap.data()};
  }
  return _ascDeleteMusicAssetsForLectura(row, sourceCollection);
};

window.cbUploadLecturaMusicAssets = async function cbUploadLecturaMusicAssets(payload = {}) {
  const lecturaId = String(payload?.id || "").trim();
  if (!lecturaId) throw new Error("No se recibió id de lectura.");
  const sourceCollection = String(payload?.sourceCollection || payload?.coleccion || "lecturasASC").trim() || "lecturasASC";
  let row = cache.find((item) => String(item?.id || "") === lecturaId) || null;
  if (!row) {
    const snap = await getDoc(doc(db, sourceCollection, lecturaId));
    if (!snap.exists()) throw new Error("Lectura no encontrada.");
    row = {id: lecturaId, ...snap.data()};
  }
  return _ascUploadManualMusicForLectura(row, {
    sourceCollection,
    readingFile: payload?.readingFile || null,
    gameFile: payload?.gameFile || null,
    musicConfig: payload?.musicConfig || _ascExtractStoredMusicConfig(row)
  });
};

window.cbAgentLecturaAsc = {
  openLista() {
    openAscModal();
  },
  openNueva() {
    openEditorNew();
  }
};
