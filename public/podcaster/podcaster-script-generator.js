/**
 * podcaster-script-generator.js
 * Extracted Gemini Script Generation Engine.
 */
import { authFetchJson } from "../js/api-client.js";
import {
  registerPodcasterScriptGeneratorApi,
  requirePodcasterScriptGeneratorApiFunction
} from "./podcaster-script-generator-registry.js";
import { buildSpeakerMapsForHosts as buildSpeakerMapsForHostsShared } from "./podcaster-speaker-maps.js";
import { toMarkdownTableCell } from "./podcaster-markdown-table.js";
import { normalizeSimpleText, normalizeCreativeFieldText } from "./podcaster-creative-text.js";
import {
  generateReelPodcastScript,
  buildReelPodcastScriptFromPromptTable
} from "./podcaster-reel-podcast-generator.js";


// === INJECTED GLOBALS (For compatibility) ===
const {
  els, state, SHORT_SCENE_MIN_SEC, SHORT_SCENE_MAX_SEC, VIDEO_SCENE_MAX_SEC, VIDEO_DIALOGUE_MAX_SEC,
  VOICES, DEFAULT_HOSTS, DEFAULT_DISFLUENCY_CONFIG, DEFAULT_TTS_DIRECTION_CONFIG, SPEECH_WORDS_PER_SEC, SPEAKER_ROLE_DESCRIPTIONS, EXPRESSIONS, MEDIA_CUES,
  logVideoCreateDebug: windowLogVideoCreateDebug, logPodcasterLiveDebug, resolveCurrentUid, firestoreDb,
  setSidepanelOpen: windowSetSidepanelOpen,
  addScriptAssistantMessage, addChatMessage, setGenerationStatus,
  getActiveSession, upsertActiveSession, normalizeGenerationConstraints,
  normalizeVideoContentType, normalizeVideoPreset, isCurrentModeVideo, getSpeakerOptions, normalizeSpeakerLabel,
  getSpeakerNameMap, getSpeakerVoiceMap, resolveSpeakerVoiceName, normalizeLiveVoiceName,
  normalizeVoiceNameSource,
  normalizeTtsDirectionConfig, getDefaultSpeakerNameMap, hostsForCount, buildSpeakerAliasMap, buildSpeakerNameMap, resolveSpeakerFromAliases,
  // splitDialogueTextIntoSegments, forceHostsAndAlternation, createDefaultRows, sanitizeSpeakerMentionsInDialogue
  splitDialogueTextIntoSegments, createDefaultRows, sanitizeSpeakerMentionsInDialogue,
  makeId, nowIso, buildApiUrl, hasAvailableApiBase,
  stopPodcastPlayback, stopRowAudio, stopGeminiLiveSession, normalizeDisfluencyConfig,
  secondsToClock, trimWords, escapeHtml: windowEscapeHtml, normalizeCreativeRow, buildShortSessionTitle
} = window;

const escapeHtml = typeof windowEscapeHtml === "function" ? windowEscapeHtml : ((text) => String(text || '')
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;"));

const logVideoCreateDebug = typeof windowLogVideoCreateDebug === "function" ? windowLogVideoCreateDebug : ((stage = "", payload = {}) => {
  console.log(`[logVideoCreateDebug] stage: ${stage}`, payload);
});

const setSidepanelOpen = (isOpen) => {
  if (typeof windowSetSidepanelOpen === "function") {
    return windowSetSidepanelOpen(isOpen);
  }
  if (typeof window.setSidepanelOpen === "function") {
    return window.setSidepanelOpen(isOpen);
  }
  console.log(`[setSidepanelOpen] fallback called with: ${isOpen}`);
};

// Hack: we define a proxy for missing variables to avoid undefined errors during extraction
const w = window;
const normalizeCreativeVideoConfig = (...args) => window.normalizeCreativeVideoConfig(...args);
const getCreativeVideoConfig = (...args) => window.getCreativeVideoConfig(...args);
const normalizeCreativeVideoScriptForDisplay = (...args) => window.normalizeCreativeVideoScriptForDisplay(...args);
const renderPodcastVideoShell = (...args) => window.renderPodcastVideoShell?.(...args);
const syncPodcastStudioInspector = (...args) => window.syncPodcastStudioInspector?.(...args);
const resetPodcastStudioSessionUiState = (...args) => window.resetPodcastStudioSessionUiState?.(...args);
const resolveVideoContentType = (session, options) => {
  if (typeof window.resolveVideoContentType === "function") {
    return window.resolveVideoContentType(session, options);
  }
  // Fallback: derive from session properties when the function is not yet available
  const videoMode = options?.videoMode;
  if (videoMode === false) return "none";
  const type = session?.script?.videoContentType || session?.videoContentType || "";
  if (type === "creative" || type === "videopodcast") return type;
  if (session?.script?.videoMode === true || session?.videoMode === true) return "creative";
  return "none";
};
const buildSpeakerMapsForHosts = (hosts = [], session = null, snapshots = {}) => buildSpeakerMapsForHostsShared(hosts, session, snapshots, {
  getSpeakerVoiceMap,
  getSpeakerExpressionMap: window.getSpeakerExpressionMap,
  getSpeakerNameMap,
  getSpeakerScenarioMap: window.getSpeakerScenarioMap,
  normalizeLiveVoiceName,
  resolveSpeakerVoiceName,
  EXPRESSIONS,
  DEFAULT_SPEAKER_NAME_MAP: window.DEFAULT_SPEAKER_NAME_MAP,
  DEFAULT_SPEAKER_SCENARIO_MAP: window.DEFAULT_SPEAKER_SCENARIO_MAP,
  rewriteScenarioPromptForEducationalVideo: requirePodcasterScriptGeneratorApiFunction("rewriteScenarioPromptForEducationalVideo")
});

function requirePodcastScriptDomainApi() {
  const api = globalThis.PodcasterPodcastScriptDomain;
  if (!api || typeof api !== "object") {
    throw new Error("PodcasterPodcastScriptDomain no está disponible. Revisa la carga de podcaster-podcast-script-domain.js.");
  }
  return api;
}

function requirePodcastScriptDomainApiFunction(name = "") {
  const fn = requirePodcastScriptDomainApi()?.[name];
  if (typeof fn !== "function") {
    throw new Error(`PodcasterPodcastScriptDomain.${name} no está disponible.`);
  }
  return fn;
}

function requireVideoScriptDomainApi() {
  const api = globalThis.PodcasterVideoScriptDomain;
  if (!api || typeof api !== "object") {
    throw new Error("PodcasterVideoScriptDomain no está disponible. Revisa la carga de podcaster-video-script-domain.js.");
  }
  return api;
}

function requireVideoScriptDomainApiFunction(name = "") {
  const fn = requireVideoScriptDomainApi()?.[name];
  if (typeof fn !== "function") {
    throw new Error(`PodcasterVideoScriptDomain.${name} no está disponible.`);
  }
  return fn;
}

// === EXTRACTED CODE ===
function estimateSpeechDurationSec(text = "") {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  if (!words) return SHORT_SCENE_MIN_SEC;
  return words / SPEECH_WORDS_PER_SEC;
}

function countWords(text = "") {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function splitByMaxWords(text = "", maxWords = 20) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const chunks = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
  }
  return chunks;
}

function splitTextIntoSentences(text = "") {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return sentences.map((part) => String(part || "").trim()).filter(Boolean);
}

function enforceVideoSceneRows(rows = [], options = {}) {
  const targetDialogueSec = Math.max(1, Number(options?.targetDialogueSec) || VIDEO_DIALOGUE_MAX_SEC);
  const splitLongSentenceSec = Math.max(targetDialogueSec + 0.8, Number(options?.splitLongSentenceSec) || (targetDialogueSec + 0.8));
  const maxWordsPerChunk = Math.max(6, Math.round(targetDialogueSec * SPEECH_WORDS_PER_SEC));
  const output = [];
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const speaker = String(row?.speaker || "").trim() || "Host A";
    const expression = EXPRESSIONS.includes(row?.expression) ? row.expression : "Neutral";
    const mediaCue = MEDIA_CUES.includes(row?.mediaCue) ? row.mediaCue : "Sin media";
    const notes = String(row?.notes || "").trim();
    const sentences = splitTextIntoSentences(row?.text || "");
    if (!sentences.length) return;
    let firstChunkForRow = true;
    const pushScene = (text = "", keepMedia = false) => {
      const cleanText = ensureCompleteSentence(text);
      if (!cleanText) return;
      output.push({
        id: makeId("row"),
        speaker,
        expression,
        durationSec: VIDEO_SCENE_MAX_SEC,
        mediaCue: keepMedia ? mediaCue : "Sin media",
        text: cleanText,
        notes,
        disfluencyConfig: normalizeDisfluencyConfig(row?.disfluencyConfig || {})
      });
      firstChunkForRow = false;
    };
    sentences.forEach((sentence) => {
      const cleanSentence = ensureCompleteSentence(sentence);
      if (!cleanSentence) return;
      const sentenceSec = estimateSpeechDurationSec(cleanSentence);
      if (sentenceSec <= splitLongSentenceSec) {
        pushScene(cleanSentence, firstChunkForRow);
        return;
      }
      const chunks = splitLongSentenceIntoChunks(cleanSentence, maxWordsPerChunk);
      if (!chunks.length) {
        pushScene(cleanSentence, firstChunkForRow);
        return;
      }
      chunks.forEach((chunk, chunkIndex) => {
        pushScene(chunk, firstChunkForRow && chunkIndex === 0);
      });
    });
  });
  return output;
}

function enforceSceneWordBounds(rows = [], options = {}) {
  const minWords = Math.max(1, Math.min(200, Number(options?.minWords) || 0));
  const maxWords = Math.max(minWords, Math.min(260, Number(options?.maxWords) || 0));
  if (!minWords || !maxWords) return rows;
  const expanded = [];
  rows.forEach((row) => {
    const text = String(row?.text || "").trim();
    if (!text) return;
    const sentences = splitTextIntoSentences(text);
    const atomicSegments = (sentences.length ? sentences : [text])
      .flatMap((sentence) => {
        const cleanSentence = ensureCompleteSentence(sentence);
        if (!cleanSentence) return [];
        if (countWords(cleanSentence) <= maxWords) return [cleanSentence];
        return splitLongSentenceIntoChunks(cleanSentence, maxWords)
          .map((chunk) => ensureCompleteSentence(chunk))
          .filter(Boolean);
      })
      .filter(Boolean);
    const chunks = [];
    let bucket = "";
    atomicSegments.forEach((segment) => {
      const cleanSegment = ensureCompleteSentence(segment);
      if (!cleanSegment) return;
      if (!bucket) {
        bucket = cleanSegment;
        return;
      }
      const candidate = `${bucket} ${cleanSegment}`.replace(/\s+/g, " ").trim();
      if (countWords(candidate) <= maxWords) {
        bucket = candidate;
        return;
      }
      chunks.push(ensureCompleteSentence(bucket));
      bucket = cleanSegment;
    });
    if (bucket) chunks.push(ensureCompleteSentence(bucket));
    if (chunks.length > 1) {
      const last = chunks[chunks.length - 1];
      const prev = chunks[chunks.length - 2];
      if (countWords(last) < minWords) {
        const mergedTail = `${prev} ${last}`.replace(/\s+/g, " ").trim();
        if (countWords(mergedTail) <= maxWords) {
          chunks.splice(chunks.length - 2, 2, ensureCompleteSentence(mergedTail));
        }
      }
    }
    if (!chunks.length) return;
    chunks.forEach((chunk, index) => {
      expanded.push({
        ...row,
        id: makeId("row"),
        text: ensureCompleteSentence(chunk),
        mediaCue: index === 0 ? row.mediaCue : "Sin media"
      });
    });
  });

  const merged = [];
  expanded.forEach((row) => {
    const text = String(row?.text || "").trim();
    if (!text) return;
    const words = countWords(text);
    const prev = merged[merged.length - 1];
    if (words < minWords && prev) {
      const prevWords = countWords(prev.text);
      const combinedWords = prevWords + words;
      if (combinedWords <= maxWords && String(prev.speaker || "") === String(row.speaker || "")) {
        prev.text = `${String(prev.text || "").trim()} ${text}`.trim();
        return;
      }
    }
    merged.push({
      ...row,
      durationSec: Math.max(4, Math.round(estimateSpeechDurationSec(text)))
    });
  });
  return merged;
}

function splitRowTextForSceneCount(row = {}, options = {}) {
  const text = String(row?.text || "").trim();
  if (!text) return [row];
  const minWords = Math.max(1, Math.min(200, Number(options?.minWords) || 1));
  const maxWords = Math.max(minWords, Math.min(260, Number(options?.maxWords) || 260));
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [row];
  const sourceSentences = splitTextIntoSentences(text)
    .map((sentence) => ensureCompleteSentence(sentence))
    .filter(Boolean);
  let leftText = "";
  let rightText = "";
  if (sourceSentences.length >= 2) {
    let bestIndex = 1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 1; i < sourceSentences.length; i += 1) {
      const leftCandidate = sourceSentences.slice(0, i).join(" ").trim();
      const rightCandidate = sourceSentences.slice(i).join(" ").trim();
      const leftCount = countWords(leftCandidate);
      const rightCount = countWords(rightCandidate);
      const penalty = Math.abs(leftCount - rightCount)
        + (leftCount < minWords ? (minWords - leftCount) * 10 : 0)
        + (rightCount < minWords ? (minWords - rightCount) * 10 : 0)
        + (leftCount > maxWords ? (leftCount - maxWords) * 10 : 0)
        + (rightCount > maxWords ? (rightCount - maxWords) * 10 : 0);
      if (penalty < bestScore) {
        bestScore = penalty;
        bestIndex = i;
      }
    }
    leftText = sourceSentences.slice(0, bestIndex).join(" ").trim();
    rightText = sourceSentences.slice(bestIndex).join(" ").trim();
  } else {
    const atomicSegments = splitLongSentenceIntoChunks(text, maxWords).filter(Boolean);
    if (atomicSegments.length >= 2) {
      const mid = Math.max(1, Math.floor(atomicSegments.length / 2));
      leftText = atomicSegments.slice(0, mid).join(" ").trim();
      rightText = atomicSegments.slice(mid).join(" ").trim();
    } else {
      const splitAt = Math.max(1, Math.min(words.length - 1, Math.floor(words.length / 2)));
      leftText = words.slice(0, splitAt).join(" ").trim();
      rightText = words.slice(splitAt).join(" ").trim();
    }
  }
  if (!leftText || !rightText) return [row];
  const makePart = (partText, keepMedia = false) => ({
    ...row,
    id: makeId("row"),
    text: ensureCompleteSentence(partText),
    mediaCue: keepMedia ? row.mediaCue : "Sin media",
    durationSec: Math.max(4, Math.round(estimateSpeechDurationSec(partText)))
  });
  const parts = [makePart(leftText, true), makePart(rightText, false)];
  const bounded = enforceSceneWordBounds(parts, { minWords, maxWords });
  return bounded.length ? bounded : parts;
}

function enforceExactSceneCount(rows = [], targetCount = 0, options = {}) {
  const safeTarget = Math.max(0, Math.min(220, Number(targetCount) || 0));
  if (!safeTarget) return rows;
  let working = Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
  if (!working.length) return working;

  while (working.length < safeTarget) {
    let splitIndex = -1;
    let splitScore = -1;
    for (let i = 0; i < working.length; i += 1) {
      const score = countWords(working[i]?.text || "");
      if (score > splitScore) {
        splitScore = score;
        splitIndex = i;
      }
    }
    if (splitIndex < 0) break;
    const candidate = working[splitIndex];
    const parts = splitRowTextForSceneCount(candidate, options);
    if (parts.length < 2) {
      working.push({
        ...candidate,
        id: makeId("row"),
        mediaCue: "Sin media",
        notes: `${String(candidate.notes || "").trim()} · Continuación.`.trim()
      });
    } else {
      working.splice(splitIndex, 1, ...parts);
    }
    if (working.length > 420) break;
  }

  while (working.length > safeTarget) {
    let mergeIndex = -1;
    for (let i = 1; i < working.length; i += 1) {
      const prev = working[i - 1];
      const curr = working[i];
      if (String(prev?.speaker || "") === String(curr?.speaker || "")) {
        mergeIndex = i;
        break;
      }
    }
    if (mergeIndex < 0) mergeIndex = working.length - 1;
    const leftIdx = Math.max(0, mergeIndex - 1);
    const left = working[leftIdx] || {};
    const right = working[mergeIndex] || {};
    const mergedText = [String(left.text || "").trim(), String(right.text || "").trim()].filter(Boolean).join(" ").trim();
    working.splice(leftIdx, 2, {
      ...left,
      id: makeId("row"),
      text: mergedText || String(left.text || right.text || "").trim(),
      durationSec: Math.max(SHORT_SCENE_MIN_SEC, Math.min(SHORT_SCENE_MAX_SEC, Math.round(estimateSpeechDurationSec(mergedText)))),
      notes: [String(left.notes || "").trim(), String(right.notes || "").trim()].filter(Boolean).join(" · ")
    });
    if (!working.length) break;
  }
  return working;
}

function polishPodcastDialogueRows(rows = [], options = {}) {
  const hosts = Array.isArray(options?.hosts) ? options.hosts.filter(Boolean) : [];
  return normalizeRows(rows).map((row, index) => {
    const fallbackSpeaker = hosts[index % Math.max(1, hosts.length)] || hosts[0] || "Host A";
    const rawText = sanitizeSpeakerMentionsInDialogue(String(row?.text || "").trim(), options?.session || null, hosts);
    const polishedText = splitTextIntoSentences(rawText)
      .map((part) => ensureCompleteSentence(part))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim() || ensureCompleteSentence(rawText);
    return {
      ...row,
      speaker: normalizeSpeakerLabel(String(row?.speaker || "").trim(), fallbackSpeaker),
      text: polishedText,
      notes: sanitizeSpeakerMentionsInDialogue(String(row?.notes || "").trim(), options?.session || null, hosts)
    };
  });
}

function coerceRowsToHosts(rows = [], hosts = []) {
  const allowedHosts = Array.isArray(hosts) && hosts.length ? hosts : [...DEFAULT_HOSTS];
  const aliasMap = buildSpeakerAliasMap(allowedHosts, { nameMap: getDefaultSpeakerNameMap() });
  let previous = allowedHosts[0] || "Host A";
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const resolved = resolveSpeakerFromAliases(row?.speaker, {
      hosts: allowedHosts,
      fallback: previous,
      aliasMap
    });
    previous = resolved;
    return {
      ...row,
      speaker: resolved
    };
  });
}

function applyScriptGenerationConstraints(script = {}, constraints = {}, session = null) {
  const videoMode = constraints?.videoMode === true;
  const hasHostCount = Number.isFinite(Number(constraints?.hostCount)) && Number(constraints.hostCount) > 0;
  const hasSceneCount = Number.isFinite(Number(constraints?.sceneCount)) && Number(constraints.sceneCount) > 0;
  const hasWordBounds = Number.isFinite(Number(constraints?.minWords)) || Number.isFinite(Number(constraints?.maxWords));
  if (!hasHostCount && !hasSceneCount && !hasWordBounds) return script;
  const explicitHosts = Array.isArray(constraints?.hosts) && constraints.hosts.length
    ? constraints.hosts.map((host) => normalizeSpeakerLabel(host, "")).filter(Boolean)
    : [];
  const forcedHosts = explicitHosts.length
    ? explicitHosts
    : hasHostCount
      ? hostsForCount(constraints.hostCount)
      : (Array.isArray(script?.hosts) && script.hosts.length ? script.hosts : getSpeakerOptions(session));
  let rows = normalizeRows(script?.rows).map((row) => ({ ...row }));
  rows = coerceRowsToHosts(rows, forcedHosts);
  if (hasWordBounds) {
    rows = videoMode
      ? enforceVideoSceneRows(rows, {
        minWords: Number(constraints?.minWords) || 12,
        maxWords: Number(constraints?.maxWords) || 15
      })
      : enforceSceneWordBounds(rows, {
        minWords: Number(constraints?.minWords) || 1,
        maxWords: Number(constraints?.maxWords) || 260
      });
  }
  if (hasSceneCount) {
    rows = videoMode
      ? rows.slice(0, Math.max(1, Number(constraints.sceneCount) || rows.length))
      : enforceExactSceneCount(rows, Number(constraints.sceneCount), {
        minWords: Number(constraints?.minWords) || 1,
        maxWords: Number(constraints?.maxWords) || 260
      });
  }
  rows = coerceRowsToHosts(rows, forcedHosts);
  return normalizeScriptPayload({
    ...(script || {}),
    hosts: forcedHosts,
    rows
  }, {
    session,
    skipOptimize: Boolean(hasSceneCount || hasWordBounds)
  });
}

function validateScriptConstraints(script = {}, constraints = {}) {
  const issues = [];
  const rows = normalizeRows(script?.rows);
  const hosts = Array.isArray(script?.hosts) ? script.hosts : [];
  const hostCount = Number(constraints?.hostCount) || 0;
  const sceneCount = Number(constraints?.sceneCount) || 0;
  const minWords = Number(constraints?.minWords) || 0;
  const maxWords = Number(constraints?.maxWords) || 0;
  const forcedHosts = Array.isArray(constraints?.hosts) ? constraints.hosts : [];

  if (hostCount > 0 && hosts.length !== hostCount) {
    issues.push(`hosts=${hosts.length} (esperado ${hostCount})`);
  }
  if (forcedHosts.length) {
    const normalizedCurrentHosts = hosts.map((host) => normalizeSpeakerLabel(host, "")).filter(Boolean);
    const same = forcedHosts.length === normalizedCurrentHosts.length
      && forcedHosts.every((host, index) => host === normalizedCurrentHosts[index]);
    if (!same) {
      issues.push(`hosts=[${normalizedCurrentHosts.join(", ")}] (esperado [${forcedHosts.join(", ")}])`);
    }
  }
  if (sceneCount > 0 && rows.length !== sceneCount) {
    issues.push(`escenas=${rows.length} (esperado ${sceneCount})`);
  }
  if (minWords > 0 || maxWords > 0) {
    rows.forEach((row, index) => {
      const text = String(row?.text || "").replace(/\s+/g, " ").trim();
      const count = countWords(text);
      if (minWords > 0 && count < minWords) {
        issues.push(`escena ${index + 1}: ${count} palabras (<${minWords})`);
      }
      if (maxWords > 0 && count > maxWords) {
        issues.push(`escena ${index + 1}: ${count} palabras (>${maxWords})`);
      }
      if (text && !/[.!?…]$/.test(text)) {
        issues.push(`escena ${index + 1}: no cierra con puntuación final`);
      }
      if (/^[a-záéíóúñü]/.test(text)) {
        issues.push(`escena ${index + 1}: empieza como continuación en minúscula`);
      }
      if (/^continuaci[oó]n\b/i.test(String(row?.notes || "").trim())) {
        issues.push(`escena ${index + 1}: notes indica continuación de la escena anterior`);
      }
    });
  }
  return issues;
}

function forceHostsAndAlternation(script = {}, constraints = {}, session = null) {
  let rows = normalizeRows(script?.rows).map((row) => ({ ...row }));
  const explicitHosts = Array.isArray(constraints?.hosts) && constraints.hosts.length
    ? constraints.hosts.map((host) => normalizeSpeakerLabel(host, "")).filter(Boolean)
    : [];
  const hosts = explicitHosts.length
    ? explicitHosts
    : Number(constraints?.hostCount) > 0
      ? hostsForCount(constraints.hostCount)
      : (Array.isArray(script?.hosts) && script.hosts.length ? script.hosts : getSpeakerOptions(session));
  const sceneCount = Number(constraints?.sceneCount) || 0;
  if (sceneCount > 0 && rows.length > sceneCount) {
    rows = rows.slice(0, sceneCount);
  }
  const aliasMap = buildSpeakerAliasMap(hosts, {
    nameMap: buildSpeakerNameMap(hosts, session?.speakerNameMap || {})
  });
  const videoMode = constraints?.videoMode === true;
  const baseRows = videoMode
    ? enforceVideoSceneRows(rows, { targetDialogueSec: VIDEO_DIALOGUE_MAX_SEC })
    : rows;
  const forcedRows = baseRows.map((row, index) => {
    const expected = hosts[index % Math.max(1, hosts.length)] || hosts[0] || "Host A";
    const resolved = resolveSpeakerFromAliases(row?.speaker, {
      hosts,
      fallback: expected,
      aliasMap
    });
    const text = String(row?.text || "").trim();
    return {
      ...row,
      speaker: videoMode
        ? resolved
        : (hosts.length > 1 ? expected : resolved),
      text
    };
  });
  return normalizeScriptPayload({
    ...(script || {}),
    hosts,
    rows: forcedRows
  }, { session, skipOptimize: true });
}

async function generateWithGeminiStrictConstraints(prompt, sessionSnapshot, constraints = {}) {
  const strict = normalizeGenerationConstraints(constraints);
  let lastScript = null;
  let lastIssues = [];
  const maxAttempts = strict.videoMode === true ? 1 : 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const fixInstruction = attempt > 1
      ? [
        "Corrección obligatoria del intento anterior.",
        `Incumplimientos detectados: ${lastIssues.join(" | ")}`,
        "Reescribe el guión completo desde cero cumpliendo exactamente todas las reglas."
      ].join("\n")
      : "";
    const composedPrompt = [prompt, fixInstruction].filter(Boolean).join("\n\n");
    const generated = strict.videoMode === true
      ? await generateVideoScript(composedPrompt, sessionSnapshot, {
        ...strict,
        forceNewScript: true
      })
      : await generatePodcastScript(composedPrompt, sessionSnapshot, {
        ...strict,
        forceNewScript: true
      });
    let normalized = applyScriptGenerationConstraints(generated, strict, sessionSnapshot);
    normalized = forceHostsAndAlternation(normalized, strict, sessionSnapshot);
    normalized = applyScriptGenerationConstraints(normalized, strict, sessionSnapshot);
    normalized = forceHostsAndAlternation(normalized, strict, sessionSnapshot);
    const issues = validateScriptConstraints(normalized, strict);
    lastScript = normalized;
    lastIssues = issues;
    if (!issues.length) return { script: normalized, issues: [] };
  }
  return { script: lastScript, issues: lastIssues };
}

function optimizeRowsForShortScenes(rows = [], options = {}) {
  const maxSec = Math.max(SHORT_SCENE_MIN_SEC, Math.min(SHORT_SCENE_MAX_SEC, Number(options.maxSec) || SHORT_SCENE_MAX_SEC));
  const minSec = Math.max(1, Math.min(maxSec, Number(options.minSec) || SHORT_SCENE_MIN_SEC));
  const mergeMaxSec = Math.max(minSec, Math.min(maxSec, Number(options.mergeMaxSec) || maxSec));
  const hosts = Array.isArray(options.hosts) && options.hosts.length ? options.hosts : [];
  const output = [];
  rows.forEach((row) => {
    const baseSpeaker = normalizeSpeakerLabel(
      row?.speaker,
      output[output.length - 1]?.speaker || hosts[0] || "Host A"
    );
    const text = String(row?.text || row?.voiceOverText || row?.guion || row?.script || "").trim();
    if (!text) return;
    const readingSec = Math.max(minSec, estimateSpeechDurationSec(text));
    const splitThresholdSec = maxSec * 1.22;
    const segmentCount = Math.max(1, Math.ceil(readingSec / splitThresholdSec));
    const textSegments = splitDialogueTextIntoSegments(text, segmentCount).filter(Boolean);
    const effectiveCount = Math.max(1, textSegments.length);
    const defaultSegmentSec = Math.max(minSec, Math.min(maxSec, Math.round(readingSec / effectiveCount)));
    textSegments.forEach((segmentText, segmentIndex) => {
      const isFirst = segmentIndex === 0;
      const continuationNote = !isFirst ? "Continuación de escena anterior." : "";
      const notesBase = String(row?.notes || "").trim();
      output.push({
        id: makeId("row"),
        speaker: baseSpeaker,
        expression: EXPRESSIONS.includes(row?.expression) ? row.expression : "Neutral",
        durationSec: defaultSegmentSec,
        mediaCue: isFirst
          ? (MEDIA_CUES.includes(row?.mediaCue) ? row.mediaCue : "Sin media")
          : "Sin media",
        text: String(segmentText || "").trim(),
        voiceOverText: String(row?.voiceOverText || row?.text || row?.guion || row?.script || segmentText || "").trim(),
        notes: [notesBase, continuationNote].filter(Boolean).join(" · "),
        disfluencyConfig: normalizeDisfluencyConfig(row?.disfluencyConfig || {}),
        ttsDirectionConfig: normalizeTtsDirectionConfig(row?.ttsDirectionConfig || {})
      });
    });
    if (!textSegments.length) {
      output.push({
        id: makeId("row"),
        speaker: baseSpeaker,
        expression: EXPRESSIONS.includes(row?.expression) ? row.expression : "Neutral",
        durationSec: Math.max(minSec, Math.min(maxSec, Math.round(readingSec))),
        mediaCue: MEDIA_CUES.includes(row?.mediaCue) ? row.mediaCue : "Sin media",
        text,
        voiceOverText: String(row?.voiceOverText || row?.text || row?.guion || row?.script || text || "").trim(),
        notes: String(row?.notes || "").trim(),
        disfluencyConfig: normalizeDisfluencyConfig(row?.disfluencyConfig || {}),
        ttsDirectionConfig: normalizeTtsDirectionConfig(row?.ttsDirectionConfig || {})
      });
    }
  });
  const merged = [];
  output.forEach((row) => {
    const current = { ...row };
    const prev = merged[merged.length - 1];
    if (!prev) {
      merged.push(current);
      return;
    }
    const sameSpeaker = String(prev.speaker || "") === String(current.speaker || "");
    const sameExpression = String(prev.expression || "") === String(current.expression || "");
    const prevDur = Math.max(minSec, Number(prev.durationSec) || minSec);
    const currDur = Math.max(minSec, Number(current.durationSec) || minSec);
    const prevText = String(prev.text || prev.voiceOverText || "").trim();
    const currentText = String(current.text || current.voiceOverText || "").trim();
    const mergedText = `${prevText} ${currentText}`.replace(/\s+/g, " ").trim();
    const mergedReadingSec = Math.max(minSec, estimateSpeechDurationSec(mergedText));
    if (!sameSpeaker || !sameExpression || mergedReadingSec > mergeMaxSec || (prevDur + currDur) > mergeMaxSec * 1.15) {
      merged.push(current);
      return;
    }
    const notes = [String(prev.notes || "").trim(), String(current.notes || "").trim()]
      .filter(Boolean)
      .join(" · ");
    merged[merged.length - 1] = {
      ...prev,
      text: mergedText,
      voiceOverText: `${String(prev.voiceOverText || prev.text || "").trim()} ${String(current.voiceOverText || current.text || "").trim()}`.replace(/\s+/g, " ").trim(),
      durationSec: Math.max(minSec, Math.min(mergeMaxSec, Math.round(mergedReadingSec))),
      notes
    };
  });
  return merged.slice(0, 400);
}

function rowNeedsCompaction(row = {}) {
  const text = String(row?.text || "").trim();
  if (!text) return true;
  const estimatedSec = estimateSpeechDurationSec(text);
  if (estimatedSec > SHORT_SCENE_MAX_SEC * 1.15) return true;
  if (estimatedSec < SHORT_SCENE_MIN_SEC * 0.9 || text.length < 26) return true;
  return false;
}

function scriptNeedsCompaction(script = {}) {
  const rows = normalizeRows(script?.rows);
  if (!rows.length) return false;
  return rows.some((row) => rowNeedsCompaction(row));
}

function compactScriptForPanelConnection(script = {}, session = null) {
  const videoMode = isCurrentModeVideo();
  return normalizeCreativeVideoScriptForDisplay(script, session, {
    preserveExactRows: true,
    videoMode: videoMode
  });
}

function applyDisfluencyDefaultsToScriptRows(script = {}, disfluencyDefaults = DEFAULT_DISFLUENCY_CONFIG) {
  const normalizedDefaults = normalizeDisfluencyConfig(disfluencyDefaults || DEFAULT_DISFLUENCY_CONFIG);
  const rows = normalizeRows(script?.rows);
  return {
    ...(script || {}),
    rows: rows.map((row) => ({
      ...row,
      disfluencyConfig: normalizeDisfluencyConfig(normalizedDefaults)
    }))
  };
}

function setButtonLoadingState(button = null, busy = false, options = {}) {
  if (!button) return;
  const spinnerHtml = `<i class="fas fa-spinner spinner-icon" aria-hidden="true"></i>`;
  if (busy) {
    if (!button.dataset.prevHtml) button.dataset.prevHtml = button.innerHTML;
    if (!button.dataset.prevTooltip) {
      button.dataset.prevTooltip = String(button.getAttribute("data-tooltip") || button.getAttribute("title") || "");
    }
    button.disabled = true;
    button.classList.add("is-loading");
    const label = String(options.loadingLabel || "").trim();
    if (label) {
      button.innerHTML = `${spinnerHtml}${label}`;
    } else {
      button.innerHTML = spinnerHtml;
    }
    if (options.loadingTitle) {
      const tooltip = String(options.loadingTitle);
      button.setAttribute("data-tooltip", tooltip);
      if (!button.getAttribute("aria-label")) {
        button.setAttribute("aria-label", tooltip);
      }
    }
    if (button.hasAttribute("title")) {
      button.removeAttribute("title");
    }
    return;
  }
  button.disabled = false;
  button.classList.remove("is-loading");
  if (button.dataset.prevHtml) {
    button.innerHTML = button.dataset.prevHtml;
    delete button.dataset.prevHtml;
  }
  if (button.dataset.prevTooltip !== undefined) {
    const tooltip = String(button.dataset.prevTooltip || "").trim();
    if (tooltip) {
      button.setAttribute("data-tooltip", tooltip);
      if (!button.getAttribute("aria-label")) {
        button.setAttribute("aria-label", tooltip);
      }
    } else {
      button.removeAttribute("data-tooltip");
    }
    delete button.dataset.prevTooltip;
  }
  if (button.hasAttribute("title")) {
    button.removeAttribute("title");
  }
}

function normalizeScriptPayload(raw = {}, options = {}) {
  const optionHosts = Array.isArray(options?.hosts) ? options.hosts : [];
  const sourceSession = options?.session || null;
  const resolvedVideoContentType = (() => {
    const explicitType = normalizeVideoContentType(
      options?.videoContentType
      || raw?.videoContentType
      || sourceSession?.script?.videoContentType
      || sourceSession?.videoContentType
    );
    if (explicitType !== "none") return explicitType;
    if (options?.videoMode === true) return "creative";
    if (options?.videoMode === false) return "none";
    if (raw?.videoMode === true) return "creative";
    return "none";
  })();
  const videoMode = resolvedVideoContentType === "creative";
  const videoPreset = videoMode
    ? normalizeVideoPreset(
      options?.videoPreset
      || raw?.videoPreset
      || sourceSession?.script?.videoPreset
      || sourceSession?.videoPreset
      || "creative"
    )
    : null;
  const defaultDisfluencyConfig = normalizeDisfluencyConfig(
    options?.disfluencyDefaults || raw?.disfluencyDefaults || sourceSession?.disfluencyDefaults || DEFAULT_DISFLUENCY_CONFIG
  );
  const sourceNameMap = {
    ...(sourceSession?.speakerNameMap || {}),
    ...(options?.speakerNameMap || {})
  };
  const hosts = Array.isArray(raw.hosts) && raw.hosts.length
    ? Array.from(new Set(raw.hosts
      .map((host) => normalizeSpeakerLabel(host, ""))
      .filter(Boolean)))
    : optionHosts
      .map((host) => normalizeSpeakerLabel(host, ""))
      .filter(Boolean);
  const normalizedHosts = videoMode
    ? ["Narrador"]
    : (hosts.length ? hosts : ["Host A", "Host B"]);
  const strictVideoValidation = videoMode && options?.strictVideoValidation === true;
  const validationStage = String(options?.validationStage || (videoMode ? "video creativo" : "podcast")).trim() || "video creativo";
  const fallbackRows = strictVideoValidation
    ? []
    : createDefaultRows(videoMode, options?.prompt || raw?.prompt || raw?.episodeTitle || raw?.summary || "");
  const normalizedNameMap = buildSpeakerNameMap(normalizedHosts, sourceNameMap);
  const aliasMap = buildSpeakerAliasMap(normalizedHosts, { nameMap: normalizedNameMap });
  const hasExplicitRows = Array.isArray(raw.rows);
  if (strictVideoValidation && (!hasExplicitRows || !raw.rows.length)) {
    throw buildCreativeVideoValidationError(validationStage, "Gemini no devolvió filas válidas.");
  }
  const baseRows = hasExplicitRows
    ? (raw.rows.length
      ? raw.rows.map((row, index) => {
        const rawText = String(row?.text || "").trim();
        const prefixMatch = rawText.match(/^([^:\n]{1,40})\s*:\s*(.+)$/);
        const prefixedSpeaker = String(prefixMatch?.[1] || "").trim();
        const previousSpeaker = normalizeSpeakerLabel(raw?.rows?.[Math.max(0, index - 1)]?.speaker, normalizedHosts[0] || "Host A");
        const normalizedSpeaker = resolveSpeakerFromAliases(row?.speaker || prefixedSpeaker, {
          hosts: normalizedHosts,
          fallback: previousSpeaker,
          aliasMap,
          nameMap: normalizedNameMap
        });
        const normalizedText = prefixMatch && resolveSpeakerFromAliases(prefixedSpeaker, {
          hosts: normalizedHosts,
          fallback: "",
          aliasMap,
          nameMap: normalizedNameMap
        })
          ? String(prefixMatch[2] || "").trim()
          : rawText;
        return {
          id: makeId("row"),
          speaker: videoMode ? "Narrador" : normalizedSpeaker,
          expression: EXPRESSIONS.includes(row?.expression) ? row.expression : "Neutral",
          durationSec: videoMode
            ? Math.max(SHORT_SCENE_MIN_SEC, Math.min(180, Number(row?.durationSec) || SHORT_SCENE_MAX_SEC))
            : Math.max(4, Math.min(180, Number(row?.durationSec) || Math.round(estimateSpeechDurationSec(normalizedText || String(row?.voiceOverText || row?.text || "").trim()) || SHORT_SCENE_MAX_SEC))),
          mediaCue: MEDIA_CUES.includes(row?.mediaCue) ? row.mediaCue : "Sin media",
          voiceOverText: String(row?.voiceOverText || row?.text || "").replace(/\s+/g, " ").trim(),
          text: sanitizeSpeakerMentionsInDialogue(
            strictVideoValidation
              ? (normalizedText || String(row?.voiceOverText || row?.text || "").trim())
              : (normalizedText || fallbackRows[index % Math.max(1, fallbackRows.length)].text),
            sourceSession,
            normalizedHosts
          ),
          notes: sanitizeSpeakerMentionsInDialogue(String(row?.notes || "").trim(), sourceSession, normalizedHosts),
          voiceOverText: videoMode
            ? String(row?.voiceOverText || row?.text || "").replace(/\s+/g, " ").trim()
            : "",
          voiceOverOriginalText: String(row?.voiceOverOriginalText || "").replace(/\s+/g, " ").trim(),
          sceneDescription: String(row?.sceneDescription || row?.scenePrompt || row?.descripcionEscena || row?.descripcionDeEscena || row?.scene || "").replace(/\s+/g, " ").trim(),
          onScreenText: String(row?.onScreenText || row?.textoPantalla || row?.textoEnPantalla || "").replace(/\s+/g, " ").trim(),
          transition: String(row?.transition || row?.visualNotes || row?.visual || row?.notes || "").replace(/\s+/g, " ").trim(),
          visualNotes: String(row?.visualNotes || row?.visual || row?.elementoVisual || row?.elemento_visual || row?.visualElement || row?.["Elemento visual"] || row?.["Elemento Visual"] || "").replace(/\s+/g, " ").trim(),
          videoDirective: String(row?.videoDirective || row?.visualNotes || row?.visual || row?.elementoVisual || row?.elemento_visual || row?.direccionVideo || row?.direcciónVideo || "").replace(/\s+/g, " ").trim(),
          scenePrompt: String(row?.scenePrompt || row?.sceneDescription || "").replace(/\s+/g, " ").trim(),
          imagePrompts: normalizeVideoImagePrompts(row?.imagePrompts || []),
          disfluencyConfig: normalizeDisfluencyConfig(
            row?.disfluencyConfig
            || defaultDisfluencyConfig
            || fallbackRows[index % Math.max(1, fallbackRows.length)]?.disfluencyConfig
            || {}
          ),
          ttsDirectionConfig: normalizeTtsDirectionConfig(
            row?.ttsDirectionConfig || raw?.ttsDirectionDefaults || sourceSession?.ttsDirectionDefaults || DEFAULT_TTS_DIRECTION_CONFIG
          )
        };
      })
      : [])
    : fallbackRows;
  const rows = options?.skipOptimize
    ? baseRows
    : optimizeRowsForShortScenes(baseRows, {
      maxSec: SHORT_SCENE_MAX_SEC,
      minSec: SHORT_SCENE_MIN_SEC,
      hosts: normalizedHosts
    });
  const normalizedRows = videoMode
    ? rows.map((row, index) => {
      if (validationStage === "video/create") {
        logVideoCreateDebug("normalize-row-input", {
          index,
          keys: Object.keys(row || {}).slice(0, 20),
          voiceOverText: String(row?.voiceOverText || row?.text || "").slice(0, 120),
          sceneDescription: String(row?.sceneDescription || row?.scenePrompt || "").slice(0, 120),
          visualNotes: String(row?.visualNotes || row?.visual || "").slice(0, 120),
          videoDirective: String(row?.videoDirective || "").slice(0, 120)
        });
      }
      try {
        return normalizeCreativeRow(row, index, {
          videoPreset,
          prompt: options?.prompt || raw?.prompt || sourceSession?.prompt || "",
          strictVideoValidation,
          validationStage
        });
      } catch (error) {
        if (validationStage === "video/create") {
          logVideoCreateDebug("normalize-row-error", {
            index,
            message: String(error?.message || error || ""),
            keys: Object.keys(row || {}).slice(0, 20),
            voiceOverText: String(row?.voiceOverText || row?.text || "").slice(0, 120),
            sceneDescription: String(row?.sceneDescription || row?.scenePrompt || "").slice(0, 120),
            visualNotes: String(row?.visualNotes || row?.visual || "").slice(0, 120),
            videoDirective: String(row?.videoDirective || "").slice(0, 120)
          });
        }
        throw error;
      }
    })
    : rows;
  const normalizedRowsWithVoiceConfig = normalizedRows.map((row) => {
    const speaker = String(row?.speaker || (videoMode ? "Narrador" : (normalizedHosts[0] || "Host A"))).trim() || (videoMode ? "Narrador" : (normalizedHosts[0] || "Host A"));
    const fallbackVoice = resolveSpeakerVoiceName(speaker, sourceSession);
    const voiceNameSource = String(row?.voiceNameSource || "").trim().toLowerCase() === "row" ? "row" : "host";
    const explicitVoice = voiceNameSource === "row"
      ? normalizeLiveVoiceName(String(row?.voiceName || "").trim(), "")
      : "";
    return {
      ...row,
      speaker,
      voiceName: explicitVoice || fallbackVoice,
      voiceNameSource: explicitVoice ? "row" : "host"
    };
  });
  const isReelModeActive = !!(sourceSession?.podcastVideoConfig?.reelModeEnabled);
  const distinctVideoRows = videoMode
    ? normalizedRowsWithVoiceConfig.map((row, index, array) => {
      const previousVisualNotes = index > 0 ? String(array[index - 1]?.visualNotes || array[index - 1]?.videoDirective || "") : "";
      const visualNotes = buildDistinctCreativeVisualNotes(
        row,
        index,
        previousVisualNotes,
        options?.prompt || raw?.prompt || sourceSession?.prompt || "",
        isReelModeActive
      );
      const resolvedVisualNotes = normalizeSimpleText(visualNotes);
      return {
        ...row,
        visualNotes: resolvedVisualNotes,
        notes: resolvedVisualNotes || row?.notes || "",
        videoDirective: row?.videoDirective || resolvedVisualNotes,
        imagePrompts: Array.isArray(row?.imagePrompts) && row.imagePrompts.length
          ? row.imagePrompts
          : [resolvedVisualNotes || row?.sceneDescription || row?.scenePrompt || ""].filter(Boolean)
      };
    })
    : normalizedRowsWithVoiceConfig;
  const finalRows = videoMode
    ? distinctVideoRows
    : finalizePodcastRows(distinctVideoRows, {
      hosts: normalizedHosts,
      session: sourceSession,
      scenario: PODCAST_DEFAULT_SCENARIO
    });

  return {
    episodeTitle: String(raw.episodeTitle || (videoMode
      ? "Video creativo desde una idea"
      : "Podcast desde una idea"
    )).trim(),
    summary: String(raw.summary || "").trim(),
    videoPreset,
    videoContentType: resolvedVideoContentType === "none" ? null : resolvedVideoContentType,
    videoMode,
    hosts: normalizedHosts,
    rows: finalRows,
    creativeVideoConfig: normalizeCreativeVideoConfig(raw?.creativeVideoConfig || sourceSession?.creativeVideoConfig || {})
  };
}

function buildChatContext(session = {}) {
  return (session.chat || [])
    .filter((message, index, arr) => !(index === 0 && message.role === "assistant" && arr.length === 1))
    .slice(-6)
    .map((message) => `${message.role === "user" ? "Usuario" : message.role === "system" ? "Sistema" : "Asistente"}: ${String(message.text || "").trim()}`)
    .join("\n");
}

function buildScriptContext(script = {}) {
  const rows = normalizeRows(script.rows);
  const videoType = resolveVideoContentType({ script });
  const videoMode = videoType === "creative";
  return [
    `Tipo de contenido: ${videoMode ? "Video creativo" : (videoType === "videopodcast" ? "Video podcast" : "Podcast")}`,
    `Titulo actual: ${String(script.episodeTitle || "Sin titulo").trim()}`,
    `Resumen actual: ${String(script.summary || "Sin resumen").trim()}`,
    videoMode
      ? `Voz en off global actual: ${String(script?.creativeVideoConfig?.globalVoiceName || getCreativeVideoConfig()?.globalVoiceName || "Kore")}`
      : `Hosts actuales: ${Array.isArray(script.hosts) && script.hosts.length ? script.hosts.join(", ") : "Host A, Host B"}`,
    "Guion actual:",
    rows.map((row, index) => (
      videoMode
        ? `${index + 1}. [${row.durationSec}s] VO: ${String(row?.voiceOverText || row?.text || "").trim()}${String(row?.sceneDescription || row?.scenePrompt || "").trim() ? `\n   Escena: ${String(row?.sceneDescription || row?.scenePrompt || "").trim()}` : ""}${String(row?.transition || "").trim() ? `\n   Transición: ${String(row?.transition || "").trim()}` : ""}${String(row?.onScreenText || "").trim() ? `\n   Texto en pantalla: ${String(row?.onScreenText || "").trim()}` : ""}${String(row?.visualNotes || row?.notes || "").trim() ? `\n   Notas visuales: ${String(row?.visualNotes || row?.notes || "").trim()}` : ""}`
        : `${index + 1}. [${row.speaker} | ${row.expression} | ${row.durationSec}s | ${row.mediaCue}] ${row.text}${row.notes ? ` (${row.notes})` : ""}${row.scenePrompt ? `\n   Escena visual: ${row.scenePrompt}` : ""}${row.videoDirective ? `\n   Dirección manual: ${row.videoDirective}` : ""}${normalizeVideoImagePrompts(row.imagePrompts || []).length ? `\n   Prompts de imagen: ${normalizeVideoImagePrompts(row.imagePrompts || []).join(" || ")}` : ""}`
    )).join("\n")
  ].join("\n");
}

function hasMeaningfulScript(session = {}) {
  return normalizeRows(session.script?.rows).length > 0;
}

function isShortenRequest(prompt = "") {
  const clean = String(prompt || "").toLowerCase();
  return /acorta|resum|más corto|mas corto|reduce|recorta|sintetiza/.test(clean);
}

function isRebuildRequest(prompt = "") {
  const clean = String(prompt || "").toLowerCase();
  return /desde cero|nuevo guion|nuevo guión|rehaz|reinicia|reescribe completo|crear uno nuevo|crea el guion|crea el guión|crea un guion|crea un guión|genera el guion|genera el guión|haz el guion|haz el guión|escribe el guion|escribe el guión|escribe un guion|escribe un guión/.test(clean);
}

function extractRequestedMinDurationSec(prompt = "") {
  const text = String(prompt || "").toLowerCase();
  let target = 0;

  const minutesMatches = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(minuto|minutos|min)\b/g)];
  minutesMatches.forEach((match) => {
    const value = Number(String(match[1] || "0").replace(",", "."));
    if (Number.isFinite(value) && value > 0) {
      target = Math.max(target, Math.round(value * 60));
    }
  });

  const secondsMatches = [...text.matchAll(/(\d+)\s*(segundo|segundos|sec|s)\b/g)];
  secondsMatches.forEach((match) => {
    const value = Number(match[1] || 0);
    if (Number.isFinite(value) && value > 0) {
      target = Math.max(target, value);
    }
  });

  return target;
}

function extractRequestedSceneRange(prompt = "") {
  const text = String(prompt || "").toLowerCase();
  let minRows = 0;
  let maxRows = 0;

  const rangeMatch = text.match(/(\d{1,3})\s*(?:a|-|hasta)\s*(\d{1,3})\s*(?:escena|escenas|segmento|segmentos|bloque|bloques)\b/);
  if (rangeMatch) {
    const left = Number(rangeMatch[1] || 0);
    const right = Number(rangeMatch[2] || 0);
    if (Number.isFinite(left) && Number.isFinite(right) && left > 0 && right > 0) {
      minRows = Math.min(left, right);
      maxRows = Math.max(left, right);
    }
  }

  const minMatch = text.match(/(?:mínimo|minimo|al menos|cuando menos)\s*(\d{1,3})\s*(?:escena|escenas|segmento|segmentos|bloque|bloques)\b/);
  if (minMatch) {
    const value = Number(minMatch[1] || 0);
    if (Number.isFinite(value) && value > 0) {
      minRows = Math.max(minRows, value);
      if (!maxRows) maxRows = Math.max(value, 220);
    }
  }

  const exactMatch = text.match(/(?:de|con|en)\s*(\d{1,3})\s*(?:escena|escenas|segmento|segmentos|bloque|bloques)\b/);
  if (exactMatch && !rangeMatch) {
    const value = Number(exactMatch[1] || 0);
    if (Number.isFinite(value) && value > 0) {
      minRows = Math.max(minRows, value);
      maxRows = maxRows ? Math.max(maxRows, value) : value;
    }
  }
  const exactForcedMatch = text.match(/exactamente\s*(\d{1,3})\s*(?:escena|escenas|segmento|segmentos|bloque|bloques)\b/);
  if (exactForcedMatch) {
    const value = Number(exactForcedMatch[1] || 0);
    if (Number.isFinite(value) && value > 0) {
      minRows = value;
      maxRows = value;
    }
  }

  if (!minRows && !maxRows) return null;
  const boundedMin = Math.max(1, Math.min(220, Number(minRows) || 1));
  const boundedMax = Math.max(boundedMin, Math.min(220, Number(maxRows) || boundedMin));
  return { minRows: boundedMin, maxRows: boundedMax };
}

function extractRequestedSceneWordRange(prompt = "") {
  const text = String(prompt || "").toLowerCase();
  let minWords = 0;
  let maxWords = 0;
  const betweenMatch = text.match(/entre\s*(\d{1,3})\s*y\s*(\d{1,3})\s*palabras/);
  if (betweenMatch) {
    const left = Number(betweenMatch[1] || 0);
    const right = Number(betweenMatch[2] || 0);
    if (Number.isFinite(left) && Number.isFinite(right) && left > 0 && right > 0) {
      minWords = Math.min(left, right);
      maxWords = Math.max(left, right);
    }
  }
  const minMatch = text.match(/(?:mínimo|minimo|al menos)\s*(\d{1,3})\s*palabras/);
  if (minMatch) {
    const value = Number(minMatch[1] || 0);
    if (Number.isFinite(value) && value > 0) {
      minWords = Math.max(minWords, value);
      if (!maxWords) maxWords = Math.max(value, 200);
    }
  }
  const maxMatch = text.match(/(?:máximo|maximo|hasta)\s*(\d{1,3})\s*palabras/);
  if (maxMatch) {
    const value = Number(maxMatch[1] || 0);
    if (Number.isFinite(value) && value > 0) {
      maxWords = maxWords ? Math.min(maxWords, value) : value;
      if (!minWords) minWords = 1;
    }
  }
  if (!minWords && !maxWords) return null;
  const boundedMin = Math.max(1, Math.min(200, minWords || 1));
  const boundedMax = Math.max(boundedMin, Math.min(260, maxWords || boundedMin));
  return { minWords: boundedMin, maxWords: boundedMax };
}

function parseSecondsToken(value = "") {
  const token = String(value || "").trim().toLowerCase().replace(/[^\d:.,]/g, "");
  if (!token) return 0;
  const normalized = token.replace(",", ".");
  if (normalized.includes(":")) {
    const parts = normalized.split(":").map((part) => Number(part) || 0);
    if (parts.some((part) => !Number.isFinite(part))) return 0;
    if (parts.length === 3) return Math.max(0, (parts[0] * 3600) + (parts[1] * 60) + parts[2]);
    if (parts.length === 2) return Math.max(0, (parts[0] * 60) + parts[1]);
  }
  return Math.max(0, Number(normalized) || 0);
}

function parseDurationSecFromRangeLabel(value = "", fallback = SHORT_SCENE_MAX_SEC) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return Math.max(SHORT_SCENE_MIN_SEC, Math.min(180, Number(fallback) || SHORT_SCENE_MAX_SEC));
  const rangeMatch = text.match(/(\d[\d:.,]*)\s*(?:-|–|—|a|hasta)\s*(\d[\d:.,]*)/i);
  if (rangeMatch) {
    const start = parseSecondsToken(rangeMatch[1]);
    const end = parseSecondsToken(rangeMatch[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return Math.max(SHORT_SCENE_MIN_SEC, Math.min(180, Math.round(end - start)));
    }
  }
  const singleMatch = text.match(/(\d[\d:.,]*)\s*(?:s|seg|secs|segundos?)?/i);
  if (singleMatch) {
    const duration = parseSecondsToken(singleMatch[1]);
    if (Number.isFinite(duration) && duration > 0) {
      return Math.max(SHORT_SCENE_MIN_SEC, Math.min(180, Math.round(duration)));
    }
  }
  return Math.max(SHORT_SCENE_MIN_SEC, Math.min(180, Number(fallback) || SHORT_SCENE_MAX_SEC));
}

function isLikelyCreativeVideoTableHeader(header = []) {
  const labels = (Array.isArray(header) ? header : []).map((cell) => String(cell || "").toLowerCase());
  const hasTime = labels.some((label) => /tiempo|duraci[oó]n|time/.test(label));
  const hasScript = labels.some((label) => /gui[oó]n|voz en off|narraci[oó]n|guion|voice.?over/.test(label));
  const hasVisual = labels.some((label) => /elemento visual|visual|escena|descripci[oó]n|imagen/.test(label));
  return hasTime && hasScript && hasVisual;
}

function extractCreativeVideoTableColumns(header = []) {
  const labels = (Array.isArray(header) ? header : []).map((cell) => String(cell || "").toLowerCase());
  const findIndex = (regexp) => labels.findIndex((label) => regexp.test(label));
  return {
    time: findIndex(/tiempo|duraci[oó]n|time/),
    script: findIndex(/gui[oó]n|voz en off|narraci[oó]n|guion|voice.?over/),
    transition: findIndex(/transici[oó]n|transicion|transition/),
    visual: findIndex(/elemento visual|escena|visual|descripci[oó]n|imagen/),
    onScreenText: findIndex(/texto en pantalla|on.?screen|subt[ií]tulo|caption/)
  };
}

function deriveMediaCueFromTransition(transition = "") {
  const clean = String(transition || "").toLowerCase();
  if (!clean) return "Sin media";
  if (clean.includes("cta") || clean.includes("final")) return "CTA final";
  if (clean.includes("trans")) return "Transición";
  if (clean.includes("intro")) return "Intro musical";
  if (clean.includes("efecto")) return "Efecto sutil";
  return "Sin media";
}

function normalizeMediaCueValue(value = "", options = {}) {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  if (!raw) return String(options?.fallback || "Sin media").trim() || "Sin media";
  if (MEDIA_CUES.includes(raw)) return raw;
  const clean = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!clean || /^(sin|none|no)\s+(media|audio|sfx|efecto|musica)$/.test(clean) || /silencio|ninguna/.test(clean)) {
    return "Sin media";
  }
  if (/cta|call.?to.?action|cierre|despedida|outro|final|suscrib|segu(i|í)nos|compart/.test(clean)) {
    return "CTA final";
  }
  if (/trans|puente|interludio|interlude|cambio|cortinilla|bumper|paso/.test(clean)) {
    return "Transición";
  }
  if (/efecto|sfx|fx|ambien|sonido|golpe|whoosh|risas|aplaus|eco|reverb/.test(clean)) {
    return "Efecto sutil";
  }
  if (/intro|apertura|entrada|jingle|tema|music|musica|musical|bed/.test(clean)) {
    return "Intro musical";
  }
  return String(options?.fallback || "Sin media").trim() || "Sin media";
}

function enrichPodcastMediaCues(rows = []) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const normalizedRows = sourceRows.map((row, index) => {
    const fallback = index === 0 ? "Intro musical" : "Sin media";
    return {
      ...row,
      mediaCue: normalizeMediaCueValue(
        row?.mediaCue || row?.media || row?.audio || row?.["Media"] || row?.["Audio"] || "",
        { fallback }
      )
    };
  });
  const hasMeaningfulCue = normalizedRows.some((row) => String(row?.mediaCue || "").trim() && String(row.mediaCue).trim() !== "Sin media");
  if (hasMeaningfulCue) return normalizedRows;
  return normalizedRows.map((row, index) => {
    if (index === 0) {
      return { ...row, mediaCue: "Intro musical" };
    }
    if (index === normalizedRows.length - 1 && normalizedRows.length > 1) {
      return { ...row, mediaCue: "CTA final" };
    }
    if (normalizedRows.length > 4 && index > 0 && index % 5 === 0) {
      return { ...row, mediaCue: "Transición" };
    }
    return { ...row, mediaCue: "Sin media" };
  });
}

const PODCAST_DEFAULT_SCENARIO = "Cabina de radio premium con consola profesional, micrófonos de estudio, luz cálida, paneles acústicos, audífonos y un ambiente editorial consistente.";

function buildPodcastDefaultVisualNotes(row = {}, index = 0) {
  const speaker = String(row?.speaker || "Host A").trim() || "Host A";
  const expression = String(row?.expression || "Neutral").trim() || "Neutral";
  const text = String(row?.text || "").replace(/\s+/g, " ").trim();
  const textPreview = trimWords(text, 12);
  const gestureByExpression = {
    "Enérgico": "proyecta la voz inclinado hacia el micrófono, abre las manos para enfatizar, eleva las cejas y marca el ritmo con ademanes ágiles",
    "Curioso": "inclina ligeramente la cabeza, levanta una mano al preguntar, entrecierra los ojos con interés y deja una media sonrisa de descubrimiento",
    "Analítico": "mantiene postura firme, mira con concentración, usa movimientos medidos de manos y subraya ideas con expresión precisa y reflexiva",
    "Inspirador": "sonríe con calidez, abre las palmas hacia arriba, sostiene la mirada con energía positiva y acompaña cada frase con gestos amplios pero elegantes",
    "Neutral": "mantiene postura cómoda frente al micrófono, alterna la mirada entre consola y compañero, asiente de forma sutil y usa gestos naturales de conversación"
  };
  const gesture = gestureByExpression[expression] || gestureByExpression.Neutral;
  const topicLead = textPreview
    ? `Mientras desarrolla la idea sobre "${textPreview}", `
    : "Mientras habla, ";
  return `${topicLead}${speaker} ${gesture}. El encuadre debe resaltar labios en dicción clara, respiración controlada, microgestos faciales y reacción orgánica de cabina sin cambiar de locación.`;
}

function enrichPodcastVisualRows(rows = [], options = {}) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const scenario = String(options?.scenario || PODCAST_DEFAULT_SCENARIO).replace(/\s+/g, " ").trim() || PODCAST_DEFAULT_SCENARIO;
  return sourceRows.map((row, index) => {
    const explicitVisual = normalizeSimpleText(
      row?.visualNotes
      || row?.visual
      || row?.elementoVisual
      || row?.elemento_visual
      || row?.visualElement
      || row?.["Elemento visual"]
      || row?.["Elemento Visual"]
      || ""
    );
    const needsVisualFallback = !explicitVisual || /^(definir elemento visual|visual gen[eé]rico|sin visual|pendiente)$/i.test(explicitVisual);
    return {
      ...row,
      scenePrompt: scenario,
      sceneDescription: scenario,
      visualNotes: needsVisualFallback ? buildPodcastDefaultVisualNotes(row, index) : explicitVisual,
      videoDirective: normalizeSimpleText(row?.videoDirective || explicitVisual || buildPodcastDefaultVisualNotes(row, index))
    };
  });
}

function finalizePodcastRows(rows = [], options = {}) {
  const hosts = Array.isArray(options?.hosts) && options.hosts.length ? options.hosts : [];
  const session = options?.session || null;
  return enrichPodcastVisualRows(
    enrichPodcastMediaCues(
      requirePodcastScriptDomainApiFunction("polishPodcastDialogueRows")(rows, {
        hosts,
        session
      })
    ),
    {
      session,
      scenario: options?.scenario || PODCAST_DEFAULT_SCENARIO
    }
  );
}

function resolveCreativeVisualNotesText(row = {}) {
  return normalizeCreativeFieldText(
    row?.visualNotes,
    row?.["Elemento visual"],
    row?.["Elemento Visual"],
    row?.visual,
    row?.elementoVisual,
    row?.elemento_visual,
    row?.visualElement,
    row?.visualElemento,
    row?.videoDirective,
    row?.notes
  );
}

function normalizeComparableCreativeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeOnScreenTextFromVoiceOver(text = "", options = {}) {
  const maxWords = Math.max(4, Number(options?.maxWords) || 8);
  const source = normalizeSimpleText(text)
    .replace(/\([^)]*\)/g, " ")
    .replace(/[¡!¿?"“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!source) return "";
  const firstSentence = String((source.match(/[^.!?]+/) || [source])[0] || source).trim();
  const words = firstSentence.split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const picked = words.slice(0, maxWords);
  const danglingWords = new Set([
    "de", "del", "la", "las", "el", "los", "y", "o", "u", "que", "a", "en", "con", "por", "para", "al"
  ]);
  const leadingConnectors = new Set(["pero", "y", "o", "aunque", "sin", "entonces", "ademas", "además"]);
  while (picked.length > 4 && leadingConnectors.has(String(picked[0] || "").toLowerCase())) {
    picked.shift();
  }
  while (picked.length > 4 && danglingWords.has(String(picked[picked.length - 1] || "").toLowerCase())) {
    picked.pop();
  }
  const summary = picked.join(" ").replace(/[.,;:!?]+$/g, "").trim();
  return summary;
}

function isWeakOnScreenText(value = "") {
  const text = normalizeSimpleText(value);
  if (!text) return true;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 3) return true;
  const trailing = String(words[words.length - 1] || "").toLowerCase();
  const danglingWords = new Set([
    "de", "del", "la", "las", "el", "los", "y", "o", "u", "que", "a", "en", "con", "por", "para", "al"
  ]);
  if (danglingWords.has(trailing)) return true;
  if (/[,;:]\s*$/.test(text)) return true;
  return false;
}

async function enhanceEducationalVideoOnScreenTextWithGemini(rows = [], sessionSnapshot = null) {
  const normalizedRows = normalizeEducationalVideoTableRows(
    (Array.isArray(rows) ? rows : []).map((row) => [row.time, row.script, row.sceneDescription, row.onScreenText, row.transition, row.visual])
  );
  if (!normalizedRows.length) return normalizedRows;
  const responseSchema = {
    type: "object",
    properties: {
      rows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "number" },
            onScreenText: { type: "string" }
          },
          required: ["index", "onScreenText"]
        }
      }
    },
    required: ["rows"]
  };
  const compactRows = normalizedRows.map((row, index) => ({
    index,
    guion: row.script,
    descripcionEscena: row.sceneDescription,
    transicion: row.transition,
    elementoVisual: row.visual,
    textoPantallaActual: row.onScreenText
  }));
  const conversationContext = sessionSnapshot ? buildChatContext(sessionSnapshot) : "";
  const payload = {
    systemInstruction: {
      parts: [{
        text: "Eres editor de guion técnico de video creativo. Reescribe SOLO texto en pantalla por fila con estilo claro y coherente. Debe ser una frase breve de 4 a 9 palabras, completa, y NO debe duplicar literalmente la descripción de escena, transición ni elemento visual. Responde solo JSON válido."
      }]
    },
    contents: [{
      role: "user",
      parts: [{
        text: [
          conversationContext ? `Conversación reciente:\n${conversationContext}` : "",
          `Filas a corregir:\n${JSON.stringify(compactRows)}`
        ].filter(Boolean).join("\n\n")
      }]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: responseSchema
    }
  };
  const data = await authFetchJson("/api/gemini/generate", {
    method: "POST",
    body: JSON.stringify({
      model: els.scriptModelSelect.value,
      payload
    })
  });
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const parsed = JSON.parse(rawText);
  const mapped = new Map();
  (Array.isArray(parsed?.rows) ? parsed.rows : []).forEach((item) => {
    const index = Number(item?.index);
    if (!Number.isFinite(index) || index < 0) return;
    mapped.set(index, String(item?.onScreenText || "").trim());
  });
  return normalizedRows.map((row, index) => ({
    ...row,
    onScreenText: buildOnScreenText(mapped.get(index) || row.onScreenText || "", {
      voiceOver: row.script || "",
      sceneDescription: row.sceneDescription || "",
      visual: row.visual || ""
    })
  }));
}

function buildOnScreenText(value = "", options = {}) {
  const explicit = normalizeSimpleText(value);
  const voiceOver = normalizeSimpleText(options?.voiceOver || options?.voiceOverText || "");
  const sceneDescription = normalizeSimpleText(options?.sceneDescription || "");
  const visual = normalizeSimpleText(options?.visual || options?.visualNotes || "");
  const fallback = summarizeOnScreenTextFromVoiceOver(voiceOver || sceneDescription || visual);
  if (!explicit) return fallback;
  if (looksLikeTransitionOnly(explicit)) return fallback;
  if (isWeakOnScreenText(explicit)) return fallback || explicit;
  const explicitNorm = normalizeComparableCreativeText(explicit);
  const visualNorm = normalizeComparableCreativeText(visual);
  const sceneNorm = normalizeComparableCreativeText(sceneDescription);
  if (explicitNorm && (explicitNorm === visualNorm || explicitNorm === sceneNorm)) {
    return fallback || explicit;
  }
  if (countWords(explicit) > 12) {
    return summarizeOnScreenTextFromVoiceOver(explicit) || fallback || explicit;
  }
  return explicit;
}

function looksLikeTransitionOnly(text = "") {
  const clean = normalizeSimpleText(text).toLowerCase();
  if (!clean) return true;
  if (clean.length <= 24) {
    if (/^(corte|corte rápido|corte rapido|disolvencia|fundido|barrido|zoom|paneo|fade|match cut|jump cut)/.test(clean)) {
      return true;
    }
  }
  return /\b(corte|disolvencia|fundido|barrido|zoom|paneo|fade|transici[oó]n)\b/.test(clean) && clean.length <= 36;
}

function ensureCompleteSentence(text = "") {
  const clean = normalizeSimpleText(text);
  if (!clean) return "";
  if (/[.!?]$/.test(clean)) return clean;
  return `${clean}.`;
}

function splitLongSentenceIntoChunks(sentence = "", maxWords = 14) {
  const source = normalizeSimpleText(sentence);
  if (!source) return [];
  const safeMaxWords = Math.max(4, Number(maxWords) || 14);
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length <= safeMaxWords) {
    return [ensureCompleteSentence(source)];
  }
  const clauses = source.split(/(?<=[,;:])\s+/).map((item) => normalizeSimpleText(item)).filter(Boolean);
  if (clauses.length > 1) {
    const output = [];
    let bucket = "";
    let bucketWords = 0;
    clauses.forEach((clause) => {
      const clauseWords = countWords(clause);
      if (!bucket) {
        bucket = clause;
        bucketWords = clauseWords;
        return;
      }
      if ((bucketWords + clauseWords) <= safeMaxWords) {
        bucket = `${bucket} ${clause}`.replace(/\s+/g, " ").trim();
        bucketWords += clauseWords;
        return;
      }
      output.push(ensureCompleteSentence(bucket));
      bucket = clause;
      bucketWords = clauseWords;
    });
    if (bucket) output.push(ensureCompleteSentence(bucket));
    if (output.length) return output;
  }
  return [buildCompactEducationalSentence(source, safeMaxWords)].filter(Boolean);
}

function splitNarrationIntoCompleteScenes(text = "", options = {}) {
  const source = normalizeSimpleText(text);
  if (!source) return [];
  const targetDialogueSec = Math.max(1, Number(options?.targetDialogueSec) || VIDEO_DIALOGUE_MAX_SEC);
  const splitLongSentenceSec = Math.max(targetDialogueSec + 0.8, Number(options?.splitLongSentenceSec) || (targetDialogueSec + 0.8));
  const maxWordsPerChunk = Math.max(6, Math.round(targetDialogueSec * SPEECH_WORDS_PER_SEC));
  const sentences = splitTextIntoSentences(source);
  if (!sentences.length) {
    return splitLongSentenceIntoChunks(source, maxWordsPerChunk);
  }
  const output = [];
  sentences.forEach((sentence) => {
    const cleanSentence = ensureCompleteSentence(sentence);
    if (!cleanSentence) return;
    if (estimateSpeechDurationSec(cleanSentence) <= splitLongSentenceSec) {
      output.push(cleanSentence);
      return;
    }
    const chunks = splitLongSentenceIntoChunks(cleanSentence, maxWordsPerChunk);
    if (!chunks.length) {
      output.push(cleanSentence);
      return;
    }
    output.push(...chunks.map((chunk) => ensureCompleteSentence(chunk)).filter(Boolean));
  });
  return output.length ? output : [ensureCompleteSentence(source)];
}

function splitCreativeVideoVoiceOverIntoChunks(text = "") {
  const source = normalizeSimpleText(text);
  if (!source) return [];
  return splitNarrationIntoCompleteScenes(source, {
    targetDialogueSec: 7,
    splitLongSentenceSec: 7
  })
    .map((chunk) => ensureCompleteSentence(chunk))
    .filter(Boolean);
}

function expandCreativeVideoRowsForTiming(rows = [], options = {}) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const expanded = [];
  sourceRows.forEach((row, rowIndex) => {
    const voiceOverText = normalizeSimpleText(row?.voiceOverText || row?.text || "");
    const chunks = splitCreativeVideoVoiceOverIntoChunks(voiceOverText);
    if (chunks.length <= 1 && countWords(voiceOverText) <= 17) {
      expanded.push(row);
      return;
    }
    const sourceVisualNotes = resolveCreativeVisualNotesText(row);
    const sourceSceneDescription = normalizeSimpleText(row?.sceneDescription || row?.scenePrompt || "");
    chunks.forEach((chunk, chunkIndex) => {
      const nextRow = {
        ...row,
        id: makeId("row"),
        durationSec: VIDEO_SCENE_MAX_SEC,
        voiceOverText: chunk,
        text: chunk,
        sceneDescription: sourceSceneDescription || String(row?.sceneDescription || row?.scenePrompt || "").trim(),
        scenePrompt: sourceSceneDescription || String(row?.scenePrompt || row?.sceneDescription || "").trim(),
        onScreenText: chunkIndex === 0
          ? String(row?.onScreenText || "").trim()
          : buildCreativeOnScreenText(chunk, {
            voiceOver: chunk,
            sceneDescription: sourceSceneDescription,
            visual: sourceVisualNotes,
            prompt: options?.prompt || ""
          }),
        visualNotes: sourceVisualNotes,
        videoDirective: String(row?.videoDirective || sourceVisualNotes || "").trim(),
        notes: chunkIndex === 0
          ? String(row?.notes || "").trim()
          : String(row?.notes || "").trim(),
        imagePrompts: normalizeVideoImagePrompts(row?.imagePrompts || [])
      };
      expanded.push(normalizeCreativeRow(nextRow, expanded.length, {
        videoPreset: "creative",
        strictVideoValidation: true,
        validationStage: options?.validationStage || "video/create",
        prompt: options?.prompt || ""
      }));
    });
  });
  return expanded;
}

function buildFallbackSceneDescriptionFromVoiceOver(voiceOver = "", transition = "", index = 0) {
  return buildFallbackCreativeSceneDescriptionFromVoiceOver(voiceOver, transition, index);
}

function buildFallbackCreativeSceneDescriptionFromVoiceOver(voiceOver = "", transition = "", index = 0) {
  const narration = normalizeSimpleText(voiceOver);
  const transitionHint = normalizeSimpleText(transition);
  const topic = trimWords(narration || `secuencia ${index + 1}`, 14);
  const parts = [
    `Escena cinematográfica en 16:9 que muestra: ${topic}.`,
    "Priorizar atmósfera, acción clara y un beat visual memorable (sin estilo didáctico).",
    transitionHint ? `Transición sugerida: ${transitionHint}.` : ""
  ].filter(Boolean);
  return parts.join(" ");
}

function buildFallbackCreativeVoiceOverFromSceneDescription(sceneDescription = "", transition = "", index = 0) {
  const scene = trimWords(normalizeSimpleText(sceneDescription) || `una secuencia creativa ${index + 1}`, 16);
  const transitionHint = trimWords(normalizeSimpleText(transition), 10);
  const sentence = transitionHint
    ? `La secuencia ${index + 1} muestra ${scene} y avanza con ${transitionHint}.`
    : `La secuencia ${index + 1} muestra ${scene} con ritmo cinematográfico.`;
  return ensureCompleteSentence(sentence);
}

function extractCreativeLocationQualifier(rawText = "") {
  const source = normalizeSimpleText(rawText);
  if (!source) return "";
  const namedMatch = source.match(/\b(?:de|del)\s+(?:la|el|los|las)?\s*((?:doña|don)\s+[\p{L}\p{N}'’.-]+(?:\s+[\p{L}\p{N}'’.-]+){0,2})/iu)
    || source.match(/\b(?:de|del)\s+([\p{L}\p{N}'’.-]+(?:\s+[\p{L}\p{N}'’.-]+){0,2})\b/iu);
  if (namedMatch?.[1]) return normalizeSimpleText(namedMatch[1]);
  const adjectiveHints = [];
  if (/\b(desordenad[oa]|ca[oó]tic[oa]|suci[oa])\b/i.test(source)) adjectiveHints.push("desordenada");
  if (/\b(oscur[oa]|nocturn[oa])\b/i.test(source)) adjectiveHints.push("oscura");
  if (/\b(reluciente|brillante|impecable)\b/i.test(source)) adjectiveHints.push("reluciente");
  return adjectiveHints[0] || "";
}

function refineCreativeLocationLabel(baseLabel = "", qualifier = "") {
  const base = normalizeSimpleText(baseLabel);
  const extra = normalizeSimpleText(qualifier);
  if (!base || !extra) return base;
  if (/^(de|del|de la|de las|de los)\b/i.test(extra)) {
    return normalizeSimpleText(`${base} ${extra}`);
  }
  if (/\b(doña|don)\b/i.test(extra) || /^[A-ZÁÉÍÓÚÑ]/.test(extra)) {
    return normalizeSimpleText(`${base} de ${extra}`);
  }
  return normalizeSimpleText(`${base} ${extra}`);
}

function buildCreativeLocationDescription(source = "", index = 0, contextPrompt = "") {
  const rawCombined = [source, contextPrompt].filter(Boolean).join(" ");
  const text = normalizeComparableCreativeText(rawCombined);
  const qualifier = extractCreativeLocationQualifier(rawCombined);
  if (!text) return `Exterior cinematográfico ${index + 1}`;
  const keywordMap = [
    [/\b(apartamento|depto|departamento|piso)\b/, qualifier ? `Interior de un apartamento ${normalizeSimpleText(`de ${qualifier}`)}` : "Interior de un apartamento"],
    [/\b(cocina|comedor)\b/, qualifier ? `Interior de la cocina ${normalizeSimpleText(`de ${qualifier}`)}` : "Interior de una cocina"],
    [/\b(restaurante|restaurant|bar|cafeteria|cafetería)\b/, qualifier ? `Interior de un restaurante ${normalizeSimpleText(`de ${qualifier}`)}` : "Interior de un restaurante"],
    [/\b(casa|hogar|habitacion|habitación|sala|cuarto)\b/, qualifier ? `Interior de una casa ${normalizeSimpleText(`de ${qualifier}`)}` : "Interior de una casa"],
    [/\b(montana|sierra|cerro|roca|acantilado|pico|cima)\b/, qualifier ? `Exterior de una montaña ${normalizeSimpleText(`de ${qualifier}`)}` : "Exterior de una montaña"],
    [/\b(cueva|gruta|tunnel|tunel|pasadizo)\b/, qualifier ? `Interior de una cueva ${normalizeSimpleText(`de ${qualifier}`)}` : "Interior de una cueva"],
    [/\b(bosque|selva|jungle|jungla)\b/, qualifier ? `Exterior de un bosque ${normalizeSimpleText(`de ${qualifier}`)}` : "Exterior de un bosque"],
    [/\b(ciudad|calle|avenida|barrio|pueblo|aldea|mercado)\b/, qualifier ? `Exterior urbano ${normalizeSimpleText(`de ${qualifier}`)}` : "Exterior urbano"],
    [/\b(laboratorio|taller|fabrica|fábrica|almacen|almacén)\b/, qualifier ? `Interior de un taller ${normalizeSimpleText(`de ${qualifier}`)}` : "Interior de un taller"],
    [/\b(playa|mar|costa|puerto)\b/, qualifier ? `Exterior costero ${normalizeSimpleText(`de ${qualifier}`)}` : "Exterior costero"],
    [/\b(desierto|arena)\b/, qualifier ? `Exterior desértico ${normalizeSimpleText(`de ${qualifier}`)}` : "Exterior desértico"],
  ];
  const hasNightTone = /\b(noche|oscuro|oscuridad)\b/.test(text);
  for (const [pattern, label] of keywordMap) {
    if (pattern.test(text)) {
      let enriched = label;
      if (qualifier) enriched = refineCreativeLocationLabel(enriched, qualifier);
      if (hasNightTone && !/oscuro|nocturn/i.test(enriched)) {
        enriched = `${enriched} oscuro`;
      }
      return normalizeSimpleText(enriched);
    }
  }
  if (/\binterior\b/.test(text)) {
    const fallback = qualifier
      ? refineCreativeLocationLabel("Interior cinematográfico", qualifier)
      : (hasNightTone ? "Interior oscuro" : "Interior cinematográfico");
    return normalizeSimpleText(fallback);
  }
  if (/\bexterior\b/.test(text)) {
    const fallback = qualifier
      ? refineCreativeLocationLabel("Exterior cinematográfico", qualifier)
      : (hasNightTone ? "Exterior nocturno" : "Exterior cinematográfico");
    return normalizeSimpleText(fallback);
  }
  if (hasNightTone) return "Interior de un lugar oscuro";
  return normalizeSimpleText(qualifier ? refineCreativeLocationLabel(`Interior cinematográfico ${index + 1}`, qualifier) : `Interior cinematográfico ${index + 1}`);
}

function buildCreativeVisualElementDescription(source = "", sceneDescription = "", index = 0, contextPrompt = "") {
  const sourceText = normalizeComparableCreativeText([source, contextPrompt].filter(Boolean).join(" "));
  const sceneText = normalizeComparableCreativeText(sceneDescription);
  const joined = sourceText || sceneText;
  if (!joined) return `Elemento visual central de la secuencia ${index + 1}`;
  const subjectMap = [
    [/\bfumigador\b/, "fumigador con mochila fumigadora"],
    [/\bcucaracha\b/, "cucaracha gigante"],
    [/\bmonstruo\b/, "antagonista monstruoso"],
    [/\bprotagonista\b/, "protagonista en acción"],
    [/\benergia limpia|energia limpia|energía limpia\b/, "fuente de energía limpia"],
    [/\brobot\b/, "robot o dispositivo tecnológico"],
    [/\bcarretera|camino|sendero\b/, "camino en movimiento"],
    [/\btrampa\b/, "trampa improvisada"],
    [/\bhumo|humo\b/, "humo o neblina"],
  ];
  const actionMap = [
    [/\b(avanza|camina|corre|huye|entra|sale|sube|baja|apunta|rocia|rocía|ataca|se enfrenta|observa|esconde|negocia|traiciona|planea)\b/, "en movimiento"],
    [/\b(amenaza|conflicto|giro|revela|aparece|encuentra|descubre)\b/, "con tensión narrativa"],
    [/\b(dialogo|diálogo|habla|mira|reacciona)\b/, "con reacción visible"]
  ];
  const subject = subjectMap.find(([pattern]) => pattern.test(joined))?.[1] || "";
  const action = actionMap.find(([pattern]) => pattern.test(joined))?.[1] || "";
  const trimmed = trimWords(joined, 18);
  const base = [subject, action].filter(Boolean).join(" ").trim();
  if (base) return base;
  return trimmed && trimmed !== sceneText ? trimmed : `Detalle visual de la secuencia ${index + 1}`;
}

function buildCreativeOnScreenText(value = "", options = {}) {
  const explicit = normalizeSimpleText(value);
  const source = explicit || options?.voiceOver || options?.sceneDescription || options?.visual || options?.prompt || "";
  const summary = summarizeOnScreenTextFromVoiceOver(source, { maxWords: 5 });
  const clean = normalizeSimpleText(summary || explicit);
  if (!clean) return "";
  return trimWords(clean, 5);
}

function isGenericCreativeVisualText(text = "") {
  const normalized = normalizeSimpleText(text).toLowerCase();
  if (!normalized) return true;
  return [
    /^detalle visual de la secuencia\s+\d+$/i,
    /^elemento visual central de la secuencia\s+\d+$/i,
    /^definir elemento visual\.?$/i,
    /^visual\s+gen[eé]rico$/i,
    /^prompts?\s+visual(es)?$/i
  ].some((pattern) => pattern.test(normalized));
}

const CREATIVE_VISUAL_SHOT_HINTS = [
  "plano abierto",
  "primer plano",
  "plano medio",
  "contrapicado",
  "travelling lateral",
  "paneo lento",
  "cámara en mano",
  "zoom dramático"
];

// Gestures and body language descriptions for the YouTuber presenter in reel mode
const REEL_YOUTUBER_GESTURES = [
  "señalando con el índice hacia la cámara para dar énfasis, cejas levantadas con energía, boca abierta en expresión de sorpresa didáctica, manos activas al frente",
  "abriendo los brazos hacia los lados al explicar, inclinado levemente hacia la cámara, sonrisa amplia y cómplice con el espectador, gesto de enumeración con los dedos",
  "golpeando una palma con el puño cerrado para reforzar un punto clave, mirada fija e intensa al lente, postura enérgica centrada en encuadre vertical",
  "levantando ambas manos con palmas abiertas al nivel del pecho al plantear una pregunta retórica, cabeza ligeramente ladeada, expresión de curiosidad exagerada",
  "trazando una línea imaginaria en el aire con el dedo al explicar una secuencia, cuerpo firme de frente, voz intensa reflejada en tensión corporal visible",
  "aplaudiendo suavemente las manos una sola vez al dar la respuesta al gancho inicial, cara de celebración exagerada, hombros hacia atrás con confianza total",
  "cruzando los brazos un instante y luego abriéndolos de golpe para revelar la idea principal, zoom rápido a su cara, expresión de revelación dramática",
  "señalando hacia un lado de la pantalla donde aparece un ícono o diagrama flotante, explicándolo activamente con la mirada alternando entre el gráfico y el lente"
];

function buildReelYoutuberVisualNotes(row = {}, index = 0) {
  const voiceOverText = normalizeSimpleText(row?.voiceOverText || row?.text || row?.notes || "");
  const sceneDescription = normalizeSimpleText(row?.sceneDescription || row?.scenePrompt || "");
  const expression = String(row?.expression || "Enérgico").trim();
  const gesture = REEL_YOUTUBER_GESTURES[index % REEL_YOUTUBER_GESTURES.length];
  const topicPreview = trimWords(voiceOverText || sceneDescription, 10);
  const topicClause = topicPreview ? ` mientras explica: "${topicPreview}"` : "";
  const overlayHints = [
    "iconos didácticos animados",
    "diagrama explicativo flotante",
    "texto gigante colorido en pantalla",
    "gráfico sencillo de apoyo",
    "flecha animada señalando el concepto clave"
  ][index % 5];
  return `Youtuber educativo centrado en encuadre vertical 9:16, plano medio frontal exactamente en el centro de la pantalla, mirando directamente al lente de la cámara con expresión ${expression.toLowerCase()}${topicClause}. Gesto: ${gesture}. A sus costados aparece un overlay de ${overlayHints} que señala activamente con la mano. Energía alta, contacto visual constante con el espectador.`;
}

function buildDistinctCreativeVisualNotes(row = {}, index = 0, previousVisualNotes = "", prompt = "", isReel = false) {
  const sceneDescription = normalizeSimpleText(row?.sceneDescription || row?.scenePrompt || "");
  const voiceOverText = normalizeSimpleText(row?.voiceOverText || row?.text || row?.notes || "");
  const videoDirective = normalizeSimpleText(row?.videoDirective || "");
  const explicitVisualCandidates = [
    row?.videoDirective,
    row?.visualNotes,
    row?.visual,
    row?.elementoVisual,
    row?.elemento_visual,
    row?.visualElement,
    row?.visualElemento
  ]
    .map((value) => normalizeSimpleText(value))
    .filter(Boolean)
    .filter((value) => !isGenericCreativeVisualText(value));

  // In reel mode, if the explicit visual exists but doesn't mention the YouTuber presenter,
  // keep the content but always ensure it describes the YouTuber's gestures.
  if (isReel) {
    const reelVisual = explicitVisualCandidates.length ? explicitVisualCandidates[0] : null;
    const mentionsYoutuber = reelVisual && /youtuber|presentador|pantalla.*plano|plano.*pantalla|frente.*c[aá]mara|c[aá]mara.*frente|centro.*pantalla|pantalla.*centro|contacto visual|gesto|ademán|ademanes/i.test(reelVisual);
    if (mentionsYoutuber) {
      // Already describes the YouTuber correctly, just de-duplicate if needed
      const previousKey = normalizeComparableCreativeText(previousVisualNotes);
      const explicitKey = normalizeComparableCreativeText(reelVisual);
      if (explicitKey && previousKey && explicitKey === previousKey) {
        const shotHint = CREATIVE_VISUAL_SHOT_HINTS[index % CREATIVE_VISUAL_SHOT_HINTS.length];
        return normalizeSimpleText(`${reelVisual}, ${shotHint}`);
      }
      return reelVisual;
    }
    // No valid YouTuber description found — generate one from scratch
    return buildReelYoutuberVisualNotes(row, index);
  }

  if (explicitVisualCandidates.length) {
    const explicitVisual = explicitVisualCandidates[0];
    const previousKey = normalizeComparableCreativeText(previousVisualNotes);
    const explicitKey = normalizeComparableCreativeText(explicitVisual);
    if (explicitKey && previousKey && explicitKey === previousKey) {
      const shotHint = CREATIVE_VISUAL_SHOT_HINTS[index % CREATIVE_VISUAL_SHOT_HINTS.length];
      return normalizeSimpleText(`${explicitVisual}, ${shotHint}`);
    }
    return explicitVisual;
  }
  const source = [videoDirective, voiceOverText, sceneDescription, prompt].filter(Boolean).join(" ");
  return normalizeSimpleText(buildCreativeVisualElementDescription(
    source || voiceOverText || sceneDescription || `Detalle visual de la secuencia ${index + 1}`,
    sceneDescription,
    index,
    prompt
  ));
}

const CREATIVE_VIDEO_GENERIC_VOICEOVER_PATTERNS = [
  /video educativo/i,
  /escena did[aá]ctica/i,
  /conversaci[oó]n u[íi]til y accionable/i,
  /\bbienvenid[oa]s?\b.*\bvideo\b/i,
  /\bbienvenid[oa]s?\s+a\s+este\s+video\b/i,
  /\bvamos a tomar una idea\b/i,
  /\babrimos la historia\b/i,
  /\bel protagonista avanza\b/i,
  /\bla historia escala\b/i,
  /\bcerramos con una imagen\b/i,
  /describe lugar, acción y atmósfera/i,
  /describe lugar, accion y atmosfera/i,
  /\bsecuencia\s+\d+\s*:\s*describe lugar/i
];

function buildCreativeVideoValidationError(stage = "video creativo", message = "", rowIndex = null) {
  const label = String(stage || "video creativo").trim() || "video creativo";
  const rowSuffix = Number.isFinite(rowIndex) ? ` (fila ${rowIndex + 1})` : "";
  return new Error(`${label}: ${String(message || "salida inválida").trim()}${rowSuffix}`);
}

function isCreativeVoiceOverGeneric(text = "") {
  const normalized = normalizeSimpleText(text).toLowerCase();
  if (!normalized) return true;
  return CREATIVE_VIDEO_GENERIC_VOICEOVER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function validateCreativeVideoScriptOutput(script = {}, options = {}) {
  const stage = String(options?.stage || "video creativo").trim() || "video creativo";
  const rows = normalizeRows(script?.rows);
  if (stage === "video/create") {
    logVideoCreateDebug("validate", {
      rows: rows.length,
      genericTemplate: isLikelyEducationalTemplateForCreativeVideo(script),
      sampleVoiceOver: String(rows[0]?.voiceOverText || rows[0]?.text || "").slice(0, 180),
      sampleSceneDescription: String(rows[0]?.sceneDescription || rows[0]?.scenePrompt || rows[0]?.descripcionEscena || "").slice(0, 180),
      sampleVisualNotes: String(rows[0]?.visualNotes || rows[0]?.visual || rows[0]?.elementoVisual || "").slice(0, 180),
      sampleVideoDirective: String(rows[0]?.videoDirective || rows[0]?.direccionVideo || rows[0]?.direcciónVideo || "").slice(0, 180)
    });
  }
  if (!rows.length) {
    throw buildCreativeVideoValidationError(stage, "Gemini no devolvió filas válidas.");
  }
  if (isLikelyEducationalTemplateForCreativeVideo(script)) {
    throw buildCreativeVideoValidationError(stage, "Gemini devolvió una plantilla genérica en lugar de un guion creativo.");
  }
  rows.forEach((row, index) => {
    const voiceOverText = normalizeSimpleText(row?.voiceOverText || row?.text || "");
    const sceneDescription = normalizeSimpleText(row?.sceneDescription || row?.scenePrompt || "");
    const visualNotes = normalizeSimpleText(row?.visualNotes || row?.visual || "");
    const videoDirective = normalizeSimpleText(row?.videoDirective || "");
    const onScreenText = normalizeSimpleText(row?.onScreenText || "");

    if (!voiceOverText) {
      throw buildCreativeVideoValidationError(stage, "la columna Guion/voz en off está vacía.", index);
    }
    if (isCreativeVoiceOverGeneric(voiceOverText)) {
      throw buildCreativeVideoValidationError(stage, "la columna Guion parece una plantilla genérica y no una voz en off real.", index);
    }
    if (countWords(voiceOverText) > 17 || estimateSpeechDurationSec(voiceOverText) > VIDEO_SCENE_MAX_SEC) {
      throw buildCreativeVideoValidationError(stage, "la voz en off es demasiado larga y debe dividirse en escenas más cortas.", index);
    }
    if (!sceneDescription) {
      throw buildCreativeVideoValidationError(stage, "falta la descripción de escena.", index);
    }
    if (/^escenario(?:\s+creativo)?\s+\d+$/i.test(sceneDescription) || /^(interior|exterior)\s+cinematogr[aá]fico(?:\s+\d+)?$/i.test(sceneDescription)) {
      throw buildCreativeVideoValidationError(stage, "la descripción de escena es genérica.", index);
    }
    if (!visualNotes) {
      throw buildCreativeVideoValidationError(stage, "falta el elemento visual.", index);
    }
    if (/^(detalle visual de la secuencia|elemento visual central de la secuencia)\s+\d+$/i.test(visualNotes)) {
      throw buildCreativeVideoValidationError(stage, "el elemento visual es demasiado genérico.", index);
    }
    if (!videoDirective) {
      throw buildCreativeVideoValidationError(stage, "falta la dirección de video.", index);
    }
    if (sceneDescription.toLowerCase() === voiceOverText.toLowerCase()) {
      throw buildCreativeVideoValidationError(stage, "la descripción de escena repite la voz en off.", index);
    }
    if (onScreenText && onScreenText.length > 60) {
      throw buildCreativeVideoValidationError(stage, "el texto en pantalla es demasiado largo.", index);
    }
    if (onScreenText && countWords(onScreenText) < 1) {
      throw buildCreativeVideoValidationError(stage, "el texto en pantalla es demasiado corto.", index);
    }
  });
  return script;
}

async function buildCreativeVideoScriptFromPromptTable(prompt = "", session = null) {
  return requireVideoScriptDomainApiFunction("buildCreativeVideoScriptFromPromptTable")(prompt, session);
}

function parseGeminiResponseJson(data) {
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  try {
    return JSON.parse(rawText.replace(/```json\n?|```/g, "").trim());
  } catch (_) {
    return {};
  }
}

async function buildPodcastScriptFromPromptTable(prompt = "", session = null, constraints = null) {
  return requirePodcastScriptDomainApiFunction("buildPodcastScriptFromPromptTable")(prompt, session, constraints);
}

function applyAuthoritativeCreativeTableToScript(script = {}, tableScript = null, session = null) {
  const baseScript = normalizeScriptPayload(script || {}, {
    session,
    videoMode: true,
    skipOptimize: true,
    strictVideoValidation: true,
    validationStage: "video/compose"
  });
  const videoPreset = normalizeVideoPreset(tableScript?.videoPreset || baseScript?.videoPreset || "creative");
  const authoritativeRows = Array.isArray(tableScript?.rows) ? tableScript.rows : [];
  if (!authoritativeRows.length) return baseScript;
  const mergedRows = authoritativeRows.map((tableRow, index) => {
    const voiceOverText = normalizeSimpleText(tableRow?.voiceOverText || tableRow?.text || "");
    const sceneDescription = normalizeSimpleText(tableRow?.sceneDescription || tableRow?.scenePrompt || "");
    const visualNotes = normalizeSimpleText(tableRow?.visualNotes || tableRow?.visual || tableRow?.elementoVisual || "");
    const videoDirective = normalizeSimpleText(tableRow?.videoDirective || "");
    const onScreenText = normalizeSimpleText(tableRow?.onScreenText || "");
    if (!voiceOverText) {
      throw buildCreativeVideoValidationError("video/compose", "la columna Guion/voz en off está vacía.", index);
    }
    if (!sceneDescription) {
      throw buildCreativeVideoValidationError("video/compose", "falta la descripción de escena.", index);
    }
    if (!visualNotes) {
      throw buildCreativeVideoValidationError("video/compose", "falta el elemento visual.", index);
    }
    if (!videoDirective) {
      throw buildCreativeVideoValidationError("video/compose", "falta la dirección de video.", index);
    }
    const merged = normalizeCreativeRow({
      ...tableRow,
      durationSec: Number(tableRow?.durationSec || SHORT_SCENE_MAX_SEC),
      voiceOverText,
      sceneDescription,
      transition: String(tableRow?.transition || tableRow?.visualNotes || tableRow?.notes || "").trim(),
      onScreenText,
      visualNotes,
      scenePrompt: String(tableRow?.sceneDescription || tableRow?.scenePrompt || "").trim(),
      imagePrompts: Array.isArray(tableRow?.imagePrompts) ? tableRow.imagePrompts : []
    }, index, { videoPreset, strictVideoValidation: true, validationStage: "video/compose" });
    merged.durationSec = VIDEO_SCENE_MAX_SEC;
    return merged;
  });
  return validateCreativeVideoScriptOutput(normalizeScriptPayload({
    ...baseScript,
    videoMode: true,
    hosts: ["Narrador"],
    rows: mergedRows,
    summary: String(baseScript?.summary || "Guion técnico ajustado desde tabla proporcionada por el usuario.").trim(),
    creativeVideoConfig: normalizeCreativeVideoConfig({
      ...(baseScript?.creativeVideoConfig || {}),
      ...(tableScript?.creativeVideoConfig || {})
    })
  }, {
    session,
    videoMode: true,
    skipOptimize: true,
    strictVideoValidation: true,
    validationStage: "video/compose"
  }), { stage: "video/compose" });
}

function rewritePromptForEducationalVideo(prompt = "") {
  const text = String(prompt || "").trim();
  if (!text) return "";
  return text
    .replace(/\bpodcast\b/gi, "video creativo")
    .replace(/\bpodcasts\b/gi, "videos creativos")
    .replace(/\bepisodio\b/gi, "escena")
    .replace(/\bepisodios\b/gi, "escenas")
    .replace(/\bhost\b/gi, "narrador")
    .replace(/\bhosts\b/gi, "narradores")
    .replace(/\bconversacional\b/gi, "cinematográfico");
}

function rewriteScenarioPromptForEducationalVideo(prompt = "") {
  const text = String(prompt || "").trim();
  if (!text) return "";
  return rewritePromptForEducationalVideo(text)
    .replace(/\bcabina premium de podcast\b/gi, "set cinematográfico premium")
    .replace(/\bcabina de radio premium\b/gi, "set cinematográfico premium")
    .replace(/\bcabina de radio\b/gi, "set cinematográfico")
    .replace(/\bcabina de podcast\b/gi, "set cinematográfico")
    .replace(/\bestudio (?:premium )?de radio\b/gi, "entorno visual creativo premium")
    .replace(/\bestudio (?:premium )?de podcast\b/gi, "entorno visual creativo premium")
    .replace(/\bestudio editorial premium para podcast\/video podcast\b/gi, "entorno editorial creativo premium")
    .replace(/\bpodcast\/video podcast\b/gi, "video creativo")
    .replace(/\bpodcast\b/gi, "video creativo");
}

function enforceScriptMinimums(baseScript = {}, options = {}) {
  const minRows = Math.max(0, Number(options.minRows || 0));
  const minDurationSec = Math.max(0, Number(options.minDurationSec || 0));
  const hosts = Array.isArray(baseScript?.hosts) && baseScript.hosts.length
    ? baseScript.hosts
    : ["Host A", "Host B"];
  const rows = Array.isArray(baseScript?.rows) ? baseScript.rows.map((row) => ({ ...row })) : [];
  if (!rows.length) return baseScript;
  const seedRows = rows.map((row) => ({ ...row }));

  while (rows.length < minRows) {
    const source = seedRows[rows.length % seedRows.length] || rows[0];
    rows.push({
      ...source,
      id: makeId("row"),
      speaker: source.speaker || hosts[0] || "Host A",
      durationSec: Math.max(SHORT_SCENE_MIN_SEC, Math.min(SHORT_SCENE_MAX_SEC, Number(source.durationSec) || SHORT_SCENE_MAX_SEC)),
      notes: `${String(source.notes || "").trim()} ${String(source.notes || "").trim() ? "· " : ""}Expandir con ejemplo adicional.`.trim()
    });
  }

  let total = countTotalDuration(rows);
  if (minDurationSec > total) {
    let guard = 0;
    while (total < minDurationSec && guard < 3000) {
      let progressed = false;
      for (let i = 0; i < rows.length && total < minDurationSec; i += 1) {
        const current = Math.max(SHORT_SCENE_MIN_SEC, Math.min(SHORT_SCENE_MAX_SEC, Number(rows[i].durationSec) || SHORT_SCENE_MAX_SEC));
        if (current >= SHORT_SCENE_MAX_SEC) continue;
        const delta = Math.min(1, SHORT_SCENE_MAX_SEC - current, minDurationSec - total);
        rows[i].durationSec = current + delta;
        total += delta;
        progressed = true;
      }
      if (!progressed && total < minDurationSec) {
        const seed = rows[rows.length - 1] || rows[0];
        rows.push({
          ...seed,
          id: makeId("row"),
          speaker: seed.speaker || hosts[0] || "Host A",
          durationSec: Math.max(SHORT_SCENE_MIN_SEC, Math.min(SHORT_SCENE_MAX_SEC, minDurationSec - total)),
          mediaCue: "Sin media",
          notes: `${String(seed.notes || "").trim()} ${String(seed.notes || "").trim() ? "· " : ""}Bloque extra para alcanzar duración objetivo.`.trim()
        });
        total = countTotalDuration(rows);
      }
      guard += 1;
    }
  }

  return {
    ...baseScript,
    rows: optimizeRowsForShortScenes(rows, {
      maxSec: SHORT_SCENE_MAX_SEC,
      minSec: SHORT_SCENE_MIN_SEC,
      hosts
    })
  };
}

function mergeWithPreviousScript(generated = {}, previous = {}, options = {}) {
  const preserveStructure = options?.preserveStructure === true;
  const videoMode = options?.videoMode === true || generated?.videoMode === true || previous?.videoMode === true;
  const generatedRows = Array.isArray(generated?.rows) ? generated.rows : [];
  const previousRows = Array.isArray(previous?.rows) ? previous.rows : [];
  if (!previousRows.length) return generated;
  if (!preserveStructure) return generated;

  const targetCount = previousRows.length;
  const mergedRows = [];
  for (let i = 0; i < targetCount; i += 1) {
    const prev = previousRows[i] || previousRows[previousRows.length - 1] || {};
    const next = generatedRows[i] || null;
    if (!next) {
      mergedRows.push({
        ...prev,
        id: makeId("row"),
        text: String(prev.text || "").trim(),
        notes: String(prev.notes || "").trim()
      });
      continue;
    }
    mergedRows.push({
      ...prev,
      ...next,
      id: makeId("row"),
      speaker: normalizeSpeakerLabel(next.speaker || prev.speaker || "Host A", prev.speaker || "Host A"),
      expression: EXPRESSIONS.includes(next.expression) ? next.expression : (prev.expression || "Neutral"),
      durationSec: Math.max(SHORT_SCENE_MIN_SEC, Math.min(180, Number(next.durationSec) || Number(prev.durationSec) || SHORT_SCENE_MAX_SEC)),
      mediaCue: MEDIA_CUES.includes(next.mediaCue) ? next.mediaCue : (prev.mediaCue || "Sin media"),
      text: String(next.text || prev.text || "").trim() || String(prev.text || "").trim(),
      notes: String(next.notes || prev.notes || "").trim()
    });
  }

  return {
    ...generated,
    episodeTitle: String(generated?.episodeTitle || previous?.episodeTitle || (videoMode ? "Video creativo" : "Podcast")).trim(),
    summary: String(generated?.summary || previous?.summary || "").trim(),
    hosts: Array.isArray(generated?.hosts) && generated.hosts.length ? generated.hosts : (previous.hosts || ["Host A", "Host B"]),
    rows: optimizeRowsForShortScenes(mergedRows, {
      maxSec: SHORT_SCENE_MAX_SEC,
      minSec: SHORT_SCENE_MIN_SEC,
      hosts: Array.isArray(generated?.hosts) && generated.hosts.length ? generated.hosts : (previous.hosts || ["Host A", "Host B"])
    })
  };
}

function buildScriptGenerationResponseSchema(options = {}) {
  const videoMode = options?.videoMode === true;
  const rowProperties = {
    speaker: { type: "string" },
    expression: { type: "string" },
    durationSec: { type: "number" },
    mediaCue: { type: "string" },
    text: { type: "string" },
    notes: { type: "string" },
    voiceOverText: { type: "string" },
    sceneDescription: { type: "string" },
    onScreenText: { type: "string" },
    transition: { type: "string" },
    visualNotes: { type: "string" },
    videoDirective: { type: "string" },
    scenePrompt: { type: "string" },
    imagePrompts: {
      type: "array",
      items: { type: "string" }
    }
  };
  const rowRequired = videoMode
    ? ["durationSec", "voiceOverText", "sceneDescription", "onScreenText", "transition", "visualNotes", "videoDirective", "scenePrompt", "imagePrompts"]
    : ["speaker", "text", "durationSec"];
  return {
    type: "object",
    properties: {
      episodeTitle: { type: "string" },
      summary: { type: "string" },
      hosts: {
        type: "array",
        items: { type: "string" }
      },
      rows: {
        type: "array",
        minItems: videoMode ? 1 : undefined,
        items: {
          type: "object",
          properties: rowProperties,
          ...(rowRequired.length ? { required: rowRequired } : {})
        }
      }
    }
  };
}

function enforceEducationalVideoSemantics(script = {}, sessionSnapshot = null) {
  const base = normalizeScriptPayload(script || {}, {
    session: sessionSnapshot,
    videoMode: true,
    skipOptimize: true
  });
  const rows = Array.isArray(base?.rows) ? base.rows : [];
  const normalizedRows = [];
  rows.forEach((row, index) => {
    const narration = normalizeSimpleText(row?.voiceOverText || row?.text || "");
    const notes = String(row?.visualNotes || row?.notes || "").replace(/\s+/g, " ").trim();
    const transition = String(row?.transition || "").replace(/\s+/g, " ").trim()
      || (String(row?.mediaCue || "").trim() && String(row?.mediaCue || "").trim() !== "Sin media"
        ? String(row?.mediaCue || "").trim()
        : "Corte limpio");
    const objective = notes || `Desarrollar la idea principal de la secuencia ${index + 1}.`;
    const sourceDescription = String(row?.sceneDescription || row?.scenePrompt || "").replace(/\s+/g, " ").trim();
    const sceneDescription = !sourceDescription || looksLikeTransitionOnly(sourceDescription)
      ? buildFallbackSceneDescriptionFromVoiceOver(narration, notes || row?.videoDirective || "", index)
      : sourceDescription;
    const scenePrompt = rewriteScenarioPromptForEducationalVideo(
      String(row?.scenePrompt || sceneDescription).replace(/\s+/g, " ").trim()
    );
    const directiveBase = String(row?.videoDirective || "").replace(/\s+/g, " ").trim();
    const videoDirective = rewriteScenarioPromptForEducationalVideo(
      directiveBase || `Objetivo creativo: ${objective}.`
    );
    const imagePrompts = normalizeVideoImagePrompts(
      row?.imagePrompts?.length ? row.imagePrompts : buildVideoSceneImagePrompts({ ...row, scenePrompt }, sessionSnapshot)
    ).map((prompt) => rewriteScenarioPromptForEducationalVideo(prompt));
    const sceneSegments = splitNarrationIntoCompleteScenes(
      narration || `Explica la idea clave de la secuencia ${index + 1} con lenguaje claro.`,
      { targetDialogueSec: VIDEO_DIALOGUE_MAX_SEC }
    );
    sceneSegments.forEach((segment, segmentIndex) => {
      const resolvedText = ensureCompleteSentence(segment) || `Explica la idea clave de la secuencia ${index + 1}.`;
      const segmentObjective = segmentIndex === 0
        ? objective
        : `${objective} Continuación de la secuencia ${index + 1}.`;
      normalizedRows.push({
        ...row,
        id: makeId("row"),
        speaker: (Array.isArray(sessionSnapshot?.script?.hosts) && sessionSnapshot.script.hosts.length)
          ? sessionSnapshot.script.hosts[0]
          : "Narrador",
        expression: "Neutral",
        durationSec: VIDEO_SCENE_MAX_SEC,
        voiceOverText: resolvedText,
        sceneDescription: sceneDescription || scenePrompt,
        onScreenText: buildOnScreenText(row?.onScreenText || "", {
          voiceOver: resolvedText,
          sceneDescription: sceneDescription || scenePrompt,
          visual: String(row?.visualNotes || row?.visual || "").replace(/\s+/g, " ").trim()
        }),
        transition: segmentIndex === 0 ? transition : "Corte limpio",
        visualNotes: segmentObjective,
        notes: segmentObjective,
        text: resolvedText,
        scenePrompt,
        videoDirective,
        imagePrompts
      });
    });
  });
  return normalizeScriptPayload({
    ...base,
    videoMode: true,
    hosts: ["Narrador"],
    rows: normalizedRows
  }, {
    session: sessionSnapshot,
    videoMode: true,
    skipOptimize: true
  });
}

function isLikelyEducationalTemplateForCreativeVideo(script = {}) {
  const rows = normalizeRows(script?.rows);
  const sample = rows.slice(0, 6).map((row) => String(row?.voiceOverText || row?.text || "").toLowerCase()).join("\n");
  if (!sample) return false;
  return (
    sample.includes("video educativo") ||
    sample.includes("escena didáctica") ||
    sample.includes("escena didactica") ||
    sample.includes("conversación útil y accionable") ||
    sample.includes("conversacion util y accionable") ||
    sample.includes("módulo claro") ||
    sample.includes("modulo claro") ||
    sample.includes("bienvenidos a este video educativo") ||
    sample.includes("bienvenidos a este video") ||
    sample.includes("vamos a tomar una idea y convertirla") ||
    sample.includes("describe lugar, acción y atmósfera") ||
    sample.includes("describe lugar, accion y atmosfera") ||
    /secuencia\s+\d+\s*:\s*describe lugar/.test(sample)
  );
}

async function generateScriptWithGeminiCore(prompt, sessionSnapshot = null, constraints = null, pipeline = "podcast") {
  const videoMode = pipeline === "video";
  const videoPreset = videoMode ? "creative" : null;
  const forceNewScript = constraints?.forceNewScript === true;
  const constrainedHosts = Array.isArray(constraints?.hosts) && constraints.hosts.length
    ? constraints.hosts.map((host) => normalizeSpeakerLabel(host, "")).filter(Boolean)
    : [];
  const preferredSpeakers = constrainedHosts.length
    ? constrainedHosts
    : Array.from(new Set([
      ...getSpeakerOptions(sessionSnapshot || {}),
      ...DEFAULT_HOSTS
    ])).slice(0, Math.min(VOICES.length, 10));
  const hasExistingScript = hasMeaningfulScript(sessionSnapshot || {});
  const existingRowsCount = Math.max(0, Number(sessionSnapshot?.script?.rows?.length || 0));
  const requestedMinDurationSec = extractRequestedMinDurationSec(prompt);
  const requestedSceneRange = extractRequestedSceneRange(prompt);
  const forcedSceneCount = Number(constraints?.sceneCount) || 0;
  const forcedHostCount = Number(constraints?.hostCount) || constrainedHosts.length || 0;
  const forcedMinWords = Number(constraints?.minWords) || 0;
  const forcedMaxWords = Number(constraints?.maxWords) || 0;
  const isVideoPodcast = !videoMode && resolveVideoContentType(sessionSnapshot) === "videopodcast";
  const isCreativePodcast = !videoMode && resolveVideoContentType(sessionSnapshot) === "creative";
  const contentModeLabel = videoMode
    ? "video creativo"
    : (resolveVideoContentType(sessionSnapshot, { videoMode: false }) === "videopodcast" ? "video podcast" : "podcast");
  const effectivePrompt = prompt;
  const strictAlternationRule = videoMode
    ? (videoPreset === "creative"
      ? "Puedes repetir el mismo locutor en escenas consecutivas cuando ayude al ritmo narrativo."
      : "Puedes repetir el mismo locutor en escenas consecutivas cuando ayude a la progresión pedagógica.")
    : (forcedHostCount > 1
      ? "Balancea la conversación alternando locutores (Host A, Host B, Host A, Host B...). Solo repite el mismo locutor en escenas consecutivas si es estrictamente necesario para la explicación."
      : "La secuencia de locutores NO tiene que alternar de forma fija; puede repetirse el mismo locutor en escenas consecutivas cuando el contenido lo requiera.");
  const shortenRequested = isShortenRequest(prompt);
  const rebuildRequested = isRebuildRequest(prompt);
  const isRefinement = hasExistingScript && !rebuildRequested && !forceNewScript;
  const speakerNameMap = getSpeakerNameMap(sessionSnapshot || {});
  const speakerVoiceMap = getSpeakerVoiceMap(sessionSnapshot || {});
  const speakerVoiceLines = preferredSpeakers.map((host) => `${host} = ${normalizeLiveVoiceName(speakerVoiceMap[host], resolveSpeakerVoiceName(host, sessionSnapshot))}`);
  const dynamicMinRows = isRefinement && !shortenRequested
    ? Math.max(4, Math.min(120, existingRowsCount))
    : 4;
  const dynamicMaxRowsBase = isRefinement && !shortenRequested && !rebuildRequested && existingRowsCount > 0
    ? Math.max(dynamicMinRows, existingRowsCount)
    : Math.min(220, Math.max(dynamicMinRows, existingRowsCount || 40));
  const requestedMinRows = requestedSceneRange?.minRows || 0;
  const requestedMaxRows = requestedSceneRange?.maxRows || 0;
  const dynamicMinRowsFinal = requestedMinRows
    ? Math.max(dynamicMinRows, requestedMinRows)
    : dynamicMinRows;
  const dynamicMaxRowsFinal = requestedMaxRows
    ? Math.max(dynamicMinRowsFinal, requestedMaxRows)
    : Math.max(dynamicMinRowsFinal, dynamicMaxRowsBase);
  const responseSchema = buildScriptGenerationResponseSchema({ videoMode });
  const validationStage = String(constraints?.validationStage || (videoMode ? "video creativo" : "podcast")).trim() || "video creativo";
  if (videoMode) {
    logVideoCreateDebug("start", {
      pipeline,
      preset: String(videoPreset || ""),
      stage: validationStage,
      prompt: String(prompt || "").slice(0, 260),
      sessionId: String(sessionSnapshot?.id || "").trim(),
      existingRows: Number(sessionSnapshot?.script?.rows?.length || 0),
      responseSchemaRowsRequired: true
    });
  }
  const contextualInstructions = (
    videoMode
      ? requireVideoScriptDomainApiFunction("buildVideoContextualInstructions")({
        isRefinement,
        constrainedHosts,
        videoPreset,
        reelModeEnabled: sessionSnapshot?.podcastVideoConfig?.reelModeEnabled === true,
        videoSceneMaxSec: VIDEO_SCENE_MAX_SEC,
        videoDialogueMaxSec: VIDEO_DIALOGUE_MAX_SEC,
        forcedSceneCountText: forcedSceneCount > 0 ? `Regla obligatoria: devuelve exactamente ${forcedSceneCount} escenas.` : "",
        requestedMinDurationText: requestedMinDurationSec > 0 ? `La duración total debe ser como mínimo ${secondsToClock(requestedMinDurationSec)}.` : ""
      })
      : requirePodcastScriptDomainApiFunction("buildPodcastContextualInstructions")({
        isRefinement,
        constrainedHosts,
        preferredSpeakers,
        roleDescriptions: preferredSpeakers.map((h) => {
          const roleId = String(h || "").trim();
          const roleBase = roleId.replace(/\s+\d+$/, "").trim();
          const desc = SPEAKER_ROLE_DESCRIPTIONS[roleBase];
          return desc ? `Personalidad de ${roleId}: ${desc}` : "";
        }).filter(Boolean),
        speakerVoiceLines,
        isCreativePodcast,
        strictAlternationRule,
        shortSceneMinSec: SHORT_SCENE_MIN_SEC,
        shortSceneMaxSec: SHORT_SCENE_MAX_SEC,
        sceneLengthInstruction: forcedMinWords > 0 || forcedMaxWords > 0
          ? `Objetivo operativo: cada escena debe respetar entre ${Math.max(1, forcedMinWords || 1)} y ${Math.max(Math.max(1, forcedMinWords || 1), forcedMaxWords || Math.max(1, forcedMinWords || 1))} palabras, usando frases completas y autosuficientes. No priorices escenas de 6-7 segundos en este caso.`
          : "",
        preserveMinRowsText: isRefinement && !shortenRequested ? `No reduzcas número de escenas por debajo de ${dynamicMinRowsFinal}, a menos que el usuario pida resumir.` : "",
        preserveStructureText: isRefinement && !shortenRequested && !rebuildRequested && existingRowsCount > 0 && !requestedSceneRange && forcedSceneCount <= 0
          ? `Mantén exactamente ${existingRowsCount} escenas y preserva la estructura/base del guion actual, mejorando claridad y profundidad sin reiniciarlo desde cero.`
          : "",
        requestedSceneRangeText: requestedSceneRange
          ? `El usuario pidió un rango de escenas entre ${requestedSceneRange.minRows} y ${requestedSceneRange.maxRows}. Devuelve una cantidad dentro de ese rango.`
          : "",
        forcedSceneCountText: forcedSceneCount > 0 ? `Regla obligatoria: devuelve exactamente ${forcedSceneCount} escenas.` : "",
        forcedHostCountText: forcedHostCount > 0 ? `Regla obligatoria: usa exactamente ${Math.max(1, Math.min(VOICES.length, forcedHostCount))} locutores del catálogo permitido.` : "",
        forcedWordRangeText: forcedMinWords > 0 || forcedMaxWords > 0
          ? `Regla obligatoria: cada escena debe tener entre ${Math.max(1, forcedMinWords || 1)} y ${Math.max(Math.max(1, forcedMinWords || 1), forcedMaxWords || Math.max(1, forcedMinWords || 1))} palabras.`
          : "",
        requestedMinDurationText: requestedMinDurationSec > 0 ? `La duración total debe ser como mínimo ${secondsToClock(requestedMinDurationSec)}.` : ""
      })
  ).join("\n");

  const conversationContext = (sessionSnapshot && isRefinement) ? buildChatContext(sessionSnapshot) : "";
  const scriptContext = (sessionSnapshot && isRefinement) ? buildScriptContext(sessionSnapshot.script || {}) : "";

  const payload = {
    systemInstruction: {
      parts: [{
        text: videoMode
          ? requireVideoScriptDomainApiFunction("buildVideoSystemInstruction")(sessionSnapshot?.podcastVideoConfig?.reelModeEnabled === true)
          : requirePodcastScriptDomainApiFunction("buildPodcastSystemInstruction")()
      }]
    },
    contents: [{
      role: "user",
      parts: [{
        text: [
          contextualInstructions,
          conversationContext ? `Conversacion reciente:\n${conversationContext}` : "",
          scriptContext ? `Guion actual editable:\n${scriptContext}` : "",
          `Nueva instruccion del usuario (${contentModeLabel}): ${effectivePrompt}`
        ].join("\n")
      }]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: responseSchema,
      ...(videoMode && videoPreset === "creative" ? { temperature: 0.85 } : {})
    }
  };

  let data = null;
  try {
    data = await authFetchJson("/api/gemini/generate", {
      method: "POST",
      body: JSON.stringify({
        model: els.scriptModelSelect.value,
        payload
      })
    });
    if (videoMode) {
      logVideoCreateDebug("gemini-response", {
        hasCandidates: Array.isArray(data?.candidates),
        candidateCount: Array.isArray(data?.candidates) ? data.candidates.length : 0,
        promptFeedback: data?.promptFeedback ? {
          blockReason: String(data?.promptFeedback?.blockReason || ""),
          blockReasonMessage: String(data?.promptFeedback?.blockReasonMessage || ""),
          safetyRatings: Array.isArray(data?.promptFeedback?.safetyRatings) ? data.promptFeedback.safetyRatings.length : 0
        } : null
      });
    }
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    const schemaStateOverflow = message.includes("too many states")
      || message.includes("schema produces a constraint");
    if (!schemaStateOverflow) throw error;
    const fallbackPayload = {
      ...payload,
      generationConfig: {
        ...(payload.generationConfig || {}),
        responseMimeType: "application/json"
      }
    };
    delete fallbackPayload.generationConfig.responseJsonSchema;
    data = await authFetchJson("/api/gemini/generate", {
      method: "POST",
      body: JSON.stringify({
        model: els.scriptModelSelect.value,
        payload: fallbackPayload
      })
    });
    if (videoMode) {
      logVideoCreateDebug("gemini-response-fallback", {
        hasCandidates: Array.isArray(data?.candidates),
        candidateCount: Array.isArray(data?.candidates) ? data.candidates.length : 0
      });
    }
  }

  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  if (videoMode) {
    logVideoCreateDebug("raw-text", {
      length: String(rawText || "").length,
      preview: String(rawText || "").slice(0, 260)
    });
  }
  let parsed = null;
  try {
    parsed = JSON.parse(rawText);
  } catch (parseError) {
    if (videoMode) {
      logVideoCreateDebug("parse-error", {
        message: String(parseError?.message || parseError || ""),
        rawTextPreview: String(rawText || "").slice(0, 260)
      });
    }
    throw parseError;
  }
  if (videoMode) {
    logVideoCreateDebug("parsed", {
      topLevelKeys: Object.keys(parsed || {}).slice(0, 20),
      rowsLength: Array.isArray(parsed?.rows) ? parsed.rows.length : 0
    });
  }
  let normalized = null;
  try {
    normalized = normalizeScriptPayload(parsed, {
      session: sessionSnapshot,
      skipOptimize: videoMode || Number(constraints?.sceneCount) > 0,
      videoMode,
      videoPreset,
      prompt,
      strictVideoValidation: videoMode,
      validationStage
    });
  } catch (normalizeError) {
    if (videoMode) {
      logVideoCreateDebug("normalize-error", {
        message: String(normalizeError?.message || normalizeError || ""),
        topLevelKeys: Object.keys(parsed || {}).slice(0, 20),
        rowsLength: Array.isArray(parsed?.rows) ? parsed.rows.length : 0,
        firstRowKeys: Array.isArray(parsed?.rows) && parsed.rows[0] && typeof parsed.rows[0] === "object"
          ? Object.keys(parsed.rows[0]).slice(0, 20)
          : [],
        firstRowVoiceOver: String(parsed?.rows?.[0]?.voiceOverText || parsed?.rows?.[0]?.text || parsed?.rows?.[0]?.guion || parsed?.rows?.[0]?.script || "").slice(0, 180),
        firstRowScene: String(parsed?.rows?.[0]?.sceneDescription || parsed?.rows?.[0]?.scenePrompt || parsed?.rows?.[0]?.descripcionEscena || "").slice(0, 180),
        firstRowVisual: String(parsed?.rows?.[0]?.visualNotes || parsed?.rows?.[0]?.visual || parsed?.rows?.[0]?.elementoVisual || "").slice(0, 180),
        firstRowDirective: String(parsed?.rows?.[0]?.videoDirective || parsed?.rows?.[0]?.direccionVideo || parsed?.rows?.[0]?.direcciónVideo || "").slice(0, 180)
      });
    }
    throw normalizeError;
  }
  if (videoMode) {
    logVideoCreateDebug("normalized", {
      rows: Array.isArray(normalized?.rows) ? normalized.rows.length : 0,
      firstVoiceOver: String(normalized?.rows?.[0]?.voiceOverText || normalized?.rows?.[0]?.text || "").slice(0, 180),
      firstSceneDescription: String(normalized?.rows?.[0]?.sceneDescription || normalized?.rows?.[0]?.scenePrompt || "").slice(0, 180)
    });
  }
  if (videoMode && videoPreset === "creative" && Array.isArray(normalized?.rows)) {
    normalized = {
      ...normalized,
      rows: expandCreativeVideoRowsForTiming(normalized.rows, {
        prompt,
        validationStage
      })
    };
  }
  if (videoMode) {
    validateCreativeVideoScriptOutput(normalized, { stage: validationStage });
  }
  if (videoMode) {
    logVideoCreateDebug("validated", {
      rows: Array.isArray(normalized?.rows) ? normalized.rows.length : 0
    });
  }
  if (videoMode && Array.isArray(normalized?.rows)) {
    // console.log("[podcaster-video] normalize-result", {
    //   rows: normalized.rows.length,
    //   firstText: String(normalized.rows[0]?.voiceOverText || normalized.rows[0]?.text || "").slice(0, 120),
    //   firstScene: String(normalized.rows[0]?.sceneDescription || normalized.rows[0]?.scenePrompt || "").slice(0, 120)
    // });
  }
  if (Array.isArray(normalized?.rows)) {
    normalized.rows = normalized.rows.map((row) => ({
      ...row,
      text: sanitizeSpeakerMentionsInDialogue(row.text, sessionSnapshot, normalized.hosts),
      notes: sanitizeSpeakerMentionsInDialogue(row.notes, sessionSnapshot, normalized.hosts),
      videoDirective: String(row?.videoDirective || "").replace(/\s+/g, " ").trim(),
      scenePrompt: normalizeVideoScenePrompt(row?.scenePrompt || "", row, sessionSnapshot),
      imagePrompts: normalizeVideoImagePrompts(row?.imagePrompts || [])
    }));
  }
  return normalized;
}

async function generatePodcastScript(prompt, sessionSnapshot = null, constraints = null) {
  if (sessionSnapshot?.podcastVideoConfig?.reelModeEnabled === true) {
    return generateReelPodcastScript(prompt, sessionSnapshot, constraints);
  }
  const safeConstraints = {
    ...(constraints && typeof constraints === "object" ? constraints : {}),
    videoMode: false
  };
  return generateScriptWithGeminiCore(prompt, sessionSnapshot, safeConstraints, "podcast");
}

async function generateVideoScript(prompt, sessionSnapshot = null, constraints = null) {
  const effectivePrompt = requireVideoScriptDomainApiFunction("prepareVideoPrompt")(prompt);
  const safeConstraints = {
    ...(constraints && typeof constraints === "object" ? constraints : {}),
    videoMode: true,
    videoPreset: "creative",
    validationStage: "video/create"
  };
  logVideoCreateDebug("generateVideoScript", {
    prompt: String(effectivePrompt || "").slice(0, 220),
    sessionId: String(sessionSnapshot?.id || "").trim()
  });
  const generated = await generateScriptWithGeminiCore(effectivePrompt, sessionSnapshot, safeConstraints, "video");
  return {
    ...generated,
    videoMode: true,
    videoPreset: "creative"
  };
}

async function generateEducationalVideoScript(prompt, sessionSnapshot = null, constraints = null) {
  return generateVideoScript(prompt, sessionSnapshot, {
    ...(constraints && typeof constraints === "object" ? constraints : {}),
    videoMode: true,
    videoPreset: "creative"
  });
}

function generateFallbackScript(prompt, options = {}) {
  const videoMode = options?.videoMode === true;
  if (videoMode) {
    throw new Error("Video creativo sin fallback: Gemini falló y la tabla demo está deshabilitada.");
  }
  return requirePodcastScriptDomainApiFunction("generatePodcastFallbackScript")(prompt, options);
}

function isNetworkFetchFailure(error = null) {
  const text = String(error?.message || error || "").toLowerCase();
  return text.includes("failed to fetch")
    || text.includes("networkerror")
    || text.includes("load failed")
    || text.includes("network request failed");
}

async function isLocalApiReachable() {
  if (!hasAvailableApiBase()) return false;
  let timeout = 0;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 2600);
    const response = await fetch(buildApiUrl("/api/health"), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });
    return response.ok;
  } catch (_) {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function connectScriptSnapshotToPanel(scriptSnapshot = {}, options = {}) {
  const session = options?.session || getActiveSession();
  if (!session) return null;
  const reason = String(options?.reason || "auto-connect").trim() || "auto-connect";
  try {
    stopPodcastPlayback();
    stopRowAudio();
    stopGeminiLiveSession().catch(() => { });
  } catch (_) {
    // best-effort
  }
  window.backgroundDialogueAudioWarmupToken = 0;

  const activeDisfluencyDefaults = normalizeDisfluencyConfig(session?.disfluencyDefaults || DEFAULT_DISFLUENCY_CONFIG);
  const connectedScript = compactScriptForPanelConnection(scriptSnapshot || {}, session);
  const nextScriptWithDisfluency = applyDisfluencyDefaultsToScriptRows(connectedScript, activeDisfluencyDefaults);
  const updatedSession = upsertActiveSession((current) => {
    const hosts = Array.isArray(nextScriptWithDisfluency.hosts) && nextScriptWithDisfluency.hosts.length ? nextScriptWithDisfluency.hosts : getSpeakerOptions(current);
    const maps = buildSpeakerMapsForHosts(hosts, current, {
      ...(options?.snapshots || {}),
      videoMode: options?.videoMode === true,
      videoPreset: nextScriptWithDisfluency?.videoPreset
    });
    const aliasMap = buildSpeakerAliasMap(hosts, { nameMap: maps.nameMap });
    const connectedRows = normalizeRows(nextScriptWithDisfluency.rows).map((row, index) => {
      const expectedSpeaker = hosts[index % Math.max(1, hosts.length)] || hosts[0] || "Host A";
      const speaker = resolveSpeakerFromAliases(String(row?.speaker || "").trim(), {
        hosts,
        fallback: expectedSpeaker,
        aliasMap,
        nameMap: maps.nameMap
      });
      if (normalizeVoiceNameSource(row?.voiceNameSource) === "row") {
        return normalizeRowVoiceConfig(row, current, {
          speaker,
          hostVoiceName: maps.voiceMap[speaker],
          voiceName: row?.voiceName,
          voiceNameSource: "row"
        });
      }
      return normalizeRowVoiceConfig({
        ...row,
        voiceName: "",
        voiceNameSource: "host"
      }, current, {
        speaker,
        hostVoiceName: maps.voiceMap[speaker],
        voiceName: "",
        voiceNameSource: "host"
      });
    });
    const nextScript = {
      ...nextScriptWithDisfluency,
      hosts,
      rows: connectedRows
    };
    const nextPodcastVideoConfig = typeof window.normalizePodcastVideoConfig === "function"
      ? window.normalizePodcastVideoConfig({
        ...(window.getPodcastVideoConfig?.(current) || current?.podcastVideoConfig || {}),
        enabled: true,
        timelineVersion: 0,
        timelineTrackVersion: 0,
        timelineTracks: [],
        timelineClipsByRowId: {},
        timelineActiveClipId: "",
        timelineOnScreenTextClipsByRowId: {},
        timelineOnScreenTextLayoutByRowId: {},
        geminiDialogueTrackIndex: 0,
        geminiDialogueTrack: {
          enabled: false,
          segments: [],
          missingRowIds: [],
          excludedRowIds: []
        },
        transitionsByEdge: {},
        timelineSceneAudioMixByRowId: {}
      })
      : (current?.podcastVideoConfig || {});
    return {
      ...current,
      videoMode: options?.videoMode === true,
      videoContentType: options?.videoMode === true ? "creative" : "none",
      script: nextScript,
      speakerVoiceMap: maps.voiceMap,
      speakerExpressionMap: maps.expressionMap,
      speakerNameMap: maps.nameMap,
      speakerScenarioMap: maps.scenarioMap,
      disfluencyDefaults: normalizeDisfluencyConfig(activeDisfluencyDefaults),
      dialogueVideoMap: {},
      dialogueAudioMap: {},
      podcastVideoConfig: nextPodcastVideoConfig
    };
  });

  logPodcasterLiveDebug("script-connected", {
    reason,
    videoMode: options?.videoMode === true,
    preset: String(updatedSession?.script?.videoPreset || ""),
    rows: Number(updatedSession?.script?.rows?.length || 0)
  });

  try {
    window.reflowTimelineClipsByScriptOrder?.(updatedSession, { persist: true, render: false });
    window.syncGeminiDialogueTrackWithRuntime?.({ render: false, preserveStartMs: true });
  } catch (_) {
    // best-effort
  }
  resetPodcastStudioSessionUiState(updatedSession);
  renderPodcastVideoShell(getActiveSession());
  syncPodcastStudioInspector(getActiveSession());
  if (options?.openSidepanel === true) {
    setSidepanelOpen(true);
  }
  return updatedSession;
}

async function handleGenerate(prompt, options = {}) {
  const displayPrompt = String(options?.displayPrompt || prompt || "").trim();
  const generationPrompt = String(options?.generationPrompt || prompt || "").trim();
  const userMessageText = String(options?.userMessageText || displayPrompt || generationPrompt).trim();
  const userMessageHtml = String(options?.userMessageHtml || "").trim();
  if (!generationPrompt) return;
  const sessionBeforeUpdate = getActiveSession();
  const generationSessionId = String(sessionBeforeUpdate?.id || state.activeSessionId || "").trim();
  const explicitConstraints = normalizeGenerationConstraints(options?.constraints || {
    videoMode: isCurrentModeVideo()
  });
  const tableMode = String(options?.tableMode || "").trim().toLowerCase();
  explicitConstraints.validationStage = explicitConstraints.videoMode === true
    ? (tableMode === "compose" ? "video/compose" : "video/create")
    : (tableMode === "compose" ? "podcast/compose" : "podcast");
  const shortenRequested = isShortenRequest(generationPrompt);
  const rebuildRequested = isRebuildRequest(generationPrompt);
  const wantsNewCreativeVideoScript = explicitConstraints.videoMode === true
    && explicitConstraints.videoPreset === "creative"
    && (tableMode === "create" || tableMode === "create-from-table");
  if (wantsNewCreativeVideoScript && !shortenRequested && !rebuildRequested) {
    explicitConstraints.forceNewScript = true;
  }

  const isSessionVideo = Boolean(
    sessionBeforeUpdate?.script?.videoContentType === "creative"
    || sessionBeforeUpdate?.videoContentType === "creative"
    || sessionBeforeUpdate?.script?.videoMode === true
    || sessionBeforeUpdate?.videoMode === true
  );
  if (explicitConstraints.videoMode !== isSessionVideo && !shortenRequested && !rebuildRequested) {
    explicitConstraints.forceNewScript = true;
  }
  if ((tableMode === "create" || tableMode === "create-from-table") && !shortenRequested && !rebuildRequested) {
    explicitConstraints.forceNewScript = true;
  }
  const effectiveGenerationPrompt = (explicitConstraints.videoMode === true && explicitConstraints.videoPreset !== "creative")
    ? rewritePromptForEducationalVideo(generationPrompt)
    : generationPrompt;
  const chatDisplayPrompt = String(userMessageText || displayPrompt || generationPrompt)
    .replace(/--- CONFIGURACIÓN TÉCNICA OBLIGATORIA[\s\S]*?--- FIN DE CONFIGURACIÓN ---/gi, "")
    .replace(/INSTRUCCIÓN DEL USUARIO:\s*/gi, "")
    .trim();
  addChatMessage("user", chatDisplayPrompt, userMessageHtml ? { html: userMessageHtml } : {});
  setGenerationStatus("Paso 3/3: Generando contenido...", "is-busy", { sessionId: generationSessionId });

  try {
    let script = null;
    const strictConfigMode = explicitConstraints.sceneCount > 0;
    const isRefinement = hasMeaningfulScript(sessionBeforeUpdate || {});
    const requestedMinDurationSec = extractRequestedMinDurationSec(effectiveGenerationPrompt);
    const requestedSceneRange = extractRequestedSceneRange(effectiveGenerationPrompt);
    const requestedSceneWordRange = extractRequestedSceneWordRange(effectiveGenerationPrompt);
    const effectiveSceneRange = explicitConstraints.sceneCount > 0
      ? { minRows: explicitConstraints.sceneCount, maxRows: explicitConstraints.sceneCount }
      : requestedSceneRange;
    const effectiveWordRange = explicitConstraints.videoMode === true
      ? null
      : (explicitConstraints.minWords > 0 || explicitConstraints.maxWords > 0)
        ? { minWords: explicitConstraints.minWords || 1, maxWords: explicitConstraints.maxWords || Math.max(1, explicitConstraints.minWords || 1) }
        : requestedSceneWordRange;
    const preserveStructure = isRefinement
      && !strictConfigMode
      && !shortenRequested
      && !rebuildRequested
      && !effectiveSceneRange
      && explicitConstraints.forceNewScript !== true;
    const previousRowsCount = Number(sessionBeforeUpdate?.script?.rows?.length || 0);
    const previousDuration = countTotalDuration(sessionBeforeUpdate?.script?.rows || []);
    const fallbackMinRows = !shortenRequested
      ? Math.max(4, previousRowsCount || 0, Number(effectiveSceneRange?.minRows || 0))
      : Math.max(4, Number(effectiveSceneRange?.minRows || 0));
    const fallbackMaxRows = Math.max(fallbackMinRows, Number(effectiveSceneRange?.maxRows || 220));
    const fallbackMinDuration = shortenRequested ? requestedMinDurationSec : Math.max(requestedMinDurationSec, previousDuration || 0);
    try {
      if (tableMode === "compose") {
        if (explicitConstraints.videoMode === true) {
          script = await buildCreativeVideoScriptFromPromptTable(effectiveGenerationPrompt, sessionBeforeUpdate);
        } else {
          if (sessionBeforeUpdate?.podcastVideoConfig?.reelModeEnabled === true) {
            script = await buildReelPodcastScriptFromPromptTable(effectiveGenerationPrompt, sessionBeforeUpdate, explicitConstraints);
          } else {
            script = await buildPodcastScriptFromPromptTable(effectiveGenerationPrompt, sessionBeforeUpdate, explicitConstraints);
          }
        }
      } else if (strictConfigMode) {
        setGenerationStatus("Paso 2/3: Analizando configuración + chat...", "is-busy", { sessionId: generationSessionId });
        const strictResult = await generateWithGeminiStrictConstraints(effectiveGenerationPrompt, sessionBeforeUpdate, explicitConstraints);
        script = strictResult.script;
        if (strictResult.issues?.length) {
          addChatMessage("system", `No se pudo cumplir al 100% la configuración tras 3 intentos: ${strictResult.issues.join(" | ")}`);
        }
      } else {
        if (explicitConstraints.videoMode === true) {
          script = await generateVideoScript(effectiveGenerationPrompt, sessionBeforeUpdate, explicitConstraints);
        } else {
          script = await generatePodcastScript(effectiveGenerationPrompt, sessionBeforeUpdate, explicitConstraints);
          script = mergeWithPreviousScript(script, sessionBeforeUpdate?.script || {}, {
            preserveStructure,
            videoMode: explicitConstraints.videoMode === true
          });
          if (Array.isArray(script?.rows) && script.rows.length > fallbackMaxRows) {
            script = {
              ...script,
              rows: script.rows.slice(0, fallbackMaxRows)
            };
          }
          script = enforceScriptMinimums(script, {
            minRows: fallbackMinRows,
            minDurationSec: fallbackMinDuration
          });
          script = {
            ...script,
            rows: optimizeRowsForShortScenes(script?.rows || [], {
              maxSec: SHORT_SCENE_MAX_SEC,
              minSec: SHORT_SCENE_MIN_SEC,
              hosts: script?.hosts || getSpeakerOptions(sessionBeforeUpdate || {})
            })
          };
          if (effectiveWordRange) {
            script = {
              ...script,
              rows: enforceSceneWordBounds(script?.rows || [], effectiveWordRange)
            };
          }
        }
      }
      if (explicitConstraints.videoMode === true) {
        validateCreativeVideoScriptOutput(script, { stage: explicitConstraints.validationStage });
      } else {
        script = normalizeScriptPayload(script || {}, {
          session: sessionBeforeUpdate,
          videoMode: false,
          hosts: Array.isArray(script?.hosts) && script.hosts.length ? script.hosts : getSpeakerOptions(sessionBeforeUpdate || {}),
          skipOptimize: true
        });
      }
      addScriptAssistantMessage(script, {
        isRefinement: isRefinement && !rebuildRequested && explicitConstraints.forceNewScript !== true,
        session: sessionBeforeUpdate,
        preserveExactRows: strictConfigMode || explicitConstraints.videoMode === true,
        videoMode: explicitConstraints.videoMode === true,
        originalPrompt: prompt,
        originalOptions: options
      });
      if (options?.connectToPanel !== false) {
        connectScriptSnapshotToPanel(script, {
          session: sessionBeforeUpdate,
          reason: "generate-success",
          videoMode: explicitConstraints.videoMode === true,
          openSidepanel: explicitConstraints.videoMode === true
        });
      }
    } catch (error) {
      if (explicitConstraints.videoMode === true) {
        throw error;
      }
      if (sessionBeforeUpdate?.script?.rows?.length) {
        if (strictConfigMode) {
          script = applyScriptGenerationConstraints(sessionBeforeUpdate.script, explicitConstraints, sessionBeforeUpdate);
          script = forceHostsAndAlternation(script, explicitConstraints, sessionBeforeUpdate);
        } else {
          script = enforceScriptMinimums(sessionBeforeUpdate.script, {
            minRows: fallbackMinRows,
            minDurationSec: fallbackMinDuration
          });
          script = {
            ...script,
            rows: optimizeRowsForShortScenes(script?.rows || [], {
              maxSec: SHORT_SCENE_MAX_SEC,
              minSec: SHORT_SCENE_MIN_SEC,
              hosts: script?.hosts || getSpeakerOptions(sessionBeforeUpdate || {})
            })
          };
          if (effectiveWordRange) {
            script = {
              ...script,
              rows: enforceSceneWordBounds(script?.rows || [], effectiveWordRange)
            };
          }
        }
        if (explicitConstraints.videoMode === true && hasMeaningfulScript(sessionBeforeUpdate)) {
          validateCreativeVideoScriptOutput(script, { stage: explicitConstraints.validationStage });
        } else if (explicitConstraints.videoMode !== true) {
          script = normalizeScriptPayload(script || {}, {
            session: sessionBeforeUpdate,
            videoMode: false,
            hosts: Array.isArray(script?.hosts) && script.hosts.length ? script.hosts : getSpeakerOptions(sessionBeforeUpdate || {}),
            skipOptimize: true
          });
        }
        let detail = `Gemini falló (${error.message}). Conservé tu guion actual y apliqué ajuste de duración/escenas en lugar de reemplazarlo por un demo corto.`;
        if (isNetworkFetchFailure(error)) {
          const apiUp = await isLocalApiReachable();
          detail = apiUp
            ? "Gemini falló por un problema de red/CORS temporal. Conservé tu guion actual y apliqué ajuste de duración/escenas."
            : "Gemini falló porque el backend local no responde (API 8787 caída). Conservé tu guion actual. Reinicia con `npm run dev:local`.";
        }
        addChatMessage(
          "system",
          detail
        );
      } else {
        if (explicitConstraints.videoMode === true) {
          throw error;
        }
        script = generateFallbackScript(effectiveGenerationPrompt, {
          videoMode: explicitConstraints.videoMode === true,
          videoPreset: explicitConstraints.videoPreset
        });
        if (strictConfigMode) {
          script = applyScriptGenerationConstraints(script, explicitConstraints, sessionBeforeUpdate);
          script = forceHostsAndAlternation(script, explicitConstraints, sessionBeforeUpdate);
        } else {
          script = enforceScriptMinimums(script, {
            minRows: Math.max(6, fallbackMinRows),
            minDurationSec: Math.max(240, fallbackMinDuration)
          });
          script = {
            ...script,
            rows: optimizeRowsForShortScenes(script?.rows || [], {
              maxSec: SHORT_SCENE_MAX_SEC,
              minSec: SHORT_SCENE_MIN_SEC,
              hosts: script?.hosts || getSpeakerOptions(sessionBeforeUpdate || {})
            })
          };
          if (effectiveWordRange) {
            script = {
              ...script,
              rows: enforceSceneWordBounds(script?.rows || [], effectiveWordRange)
            };
          }
        }
        if (explicitConstraints.videoMode === true) {
          validateCreativeVideoScriptOutput(script, { stage: explicitConstraints.validationStage });
        } else {
          script = normalizeScriptPayload(script || {}, {
            session: sessionBeforeUpdate,
            videoMode: false,
            hosts: Array.isArray(script?.hosts) && script.hosts.length ? script.hosts : getSpeakerOptions(sessionBeforeUpdate || {}),
            skipOptimize: true
          });
        }
        addChatMessage("system", explicitConstraints.videoMode === true
          ? `No se pudo usar Gemini (${error.message}).`
          : `No se pudo usar Gemini (${error.message}). Generé un borrador extendido para que sigas editando.`);
      }
      addScriptAssistantMessage(script, {
        isRefinement: Boolean(sessionBeforeUpdate?.script?.rows?.length),
        session: sessionBeforeUpdate,
        preserveExactRows: true,
        videoMode: explicitConstraints.videoMode === true
      });
      if (options?.connectToPanel !== false) {
        connectScriptSnapshotToPanel(script, {
          session: sessionBeforeUpdate,
          reason: "generate-fallback",
          videoMode: explicitConstraints.videoMode === true,
          openSidepanel: explicitConstraints.videoMode === true
        });
      }
    }

    upsertActiveSession((session) => ({
      ...session,
      prompt: displayPrompt || generationPrompt,
      title: buildShortSessionTitle(script?.episodeTitle || displayPrompt || generationPrompt)
    }));

    const connected = options?.connectToPanel !== false;
    setGenerationStatus(
      explicitConstraints.videoMode === true
        ? (connected ? "Guión creativo de video conectado al panel" : "Guión creativo de video listo en el chat")
        : (connected ? "Guion conectado al panel" : "Guion listo en el chat"),
      "is-live",
      { sessionId: generationSessionId }
    );
  } catch (error) {
    addChatMessage("system", `Fallo al generar el guion: ${error.message}`);
    setGenerationStatus("Error", "", { sessionId: generationSessionId });
  }
}

// === MIGRATED PROMPTING & EDUCATIONAL VIDEO FORMATTING FUNCTIONS ===

function normalizeTableClipboardText(text = "") {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ");
}

function buildMarkdownTableFromRows(rows = []) {
  const normalizedRows = (Array.isArray(rows) ? rows : [])
    .map((row) => (Array.isArray(row) ? row : []).map((cell) => String(cell || "").replace(/\s+/g, " ").trim()))
    .filter((row) => row.some(Boolean));
  if (!normalizedRows.length) return "";
  const columnCount = Math.max(2, ...normalizedRows.map((row) => row.length));
  const paddedRows = normalizedRows.map((row) => {
    const next = row.slice(0, columnCount);
    while (next.length < columnCount) next.push("");
    return next;
  });
  const escapeCell = (value = "") => String(value || "").replace(/\|/g, "\\|").trim();
  const header = paddedRows[0].map(escapeCell);
  const divider = header.map(() => "---");
  const body = paddedRows.slice(1).map((row) => row.map(escapeCell));
  if (!body.length) {
    body.push(Array.from({ length: columnCount }, () => ""));
  }
  return [
    `| ${header.join(" | ")} |`,
    `| ${divider.join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`)
  ].join("\n");
}

function parseHtmlTableToRows(html = "") {
  const source = String(html || "").trim();
  const lower = source.toLowerCase();
  if (!source || (!lower.includes("<table") && !lower.includes("<tr"))) return [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(source, "text/html");
    const rowNodes = Array.from(doc.querySelectorAll("table tr, tr"));
    if (!rowNodes.length) return [];
    const rows = rowNodes
      .map((tr) => Array.from(tr.querySelectorAll("th,td")).map((cell) => String(cell.textContent || "").trim()))
      .filter((row) => row.some(Boolean));
    return rows;
  } catch (_) {
    return [];
  }
}

function parsePlainTextTableToRows(text = "") {
  const source = normalizeTableClipboardText(text);
  if (!source) return [];
  const lines = source
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  if (!lines.length) return [];

  // 1. Detectar tabla por tabulación (copiado de Excel / Google Sheets)
  const tabRows = lines
    .map((line) => line.split("\t").map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));
  
  if (tabRows.length >= 2) {
    const colCount = tabRows[0].length;
    // Una tabla tabulada debe tener al menos 2 columnas consistentes en todas las filas
    if (colCount >= 2 && tabRows.every((row) => row.length === colCount)) {
      return tabRows;
    }
  }

  // 2. Detectar tabla de Markdown con tuberías (|) y divisor (---)
  const pipeLines = lines.filter((line) => line.includes("|"));
  if (pipeLines.length >= 3) { // Encabezado, Divisor, Fila 1
    const secondLineClean = pipeLines[1].replace(/^\|/, "").replace(/\|$/, "").trim();
    const dividerCells = secondLineClean.split("|").map((c) => c.trim());
    const isMarkdownDivider = dividerCells.length >= 2 && dividerCells.every((c) => /^:?-{2,}:?$/.test(c));
    
    if (isMarkdownDivider) {
      const rows = pipeLines
        .map((line) => line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()))
        .filter((row) => row.some(Boolean));
      // Retornar las filas de datos excluyendo la línea del divisor de formato
      return [rows[0], ...rows.slice(2)];
    }
  }

  return [];
}

function hasStructuredVideoTableInput(promptText = "", promptHtml = "") {
  const htmlRows = parseHtmlTableToRows(promptHtml);
  if (htmlRows.length) return true;
  const textRows = parsePlainTextTableToRows(promptText);
  return textRows.length > 0;
}

function stripMarkdownTableFromText(text = "") {
  const source = normalizeTableClipboardText(text);
  if (!source) return "";
  const lines = source.split("\n");
  const filtered = lines.filter((line) => {
    const trimmed = String(line || "").trim();
    if (!trimmed) return false;
    const isDivider = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(trimmed);
    if (isDivider) return false;
    const pipeCount = (trimmed.match(/\|/g) || []).length;
    if (pipeCount >= 3) return false;
    return true;
  });
  return filtered.join("\n").replace(/\s+/g, " ").trim();
}

function extractNonTableTextFromPromptHtml(promptHtml = "") {
  const source = String(promptHtml || "").trim();
  if (!source) return "";
  try {
    const doc = new DOMParser().parseFromString(`<div>${source}</div>`, "text/html");
    const root = doc.body.firstElementChild;
    if (!root) return "";
    root.querySelectorAll("table").forEach((node) => node.remove());
    return normalizeTableClipboardText(root.textContent || "").replace(/\s+/g, " ").trim();
  } catch (_) {
    return "";
  }
}

function extractStructuredVideoTableRows(promptText = "", promptHtml = "") {
  const htmlRows = parseHtmlTableToRows(promptHtml);
  if (htmlRows.length) return htmlRows;
  return parsePlainTextTableToRows(promptText);
}

function buildHtmlTableFromRows(rows = []) {
  const normalizedRows = (Array.isArray(rows) ? rows : [])
    .map((row) => (Array.isArray(row) ? row : []).map((cell) => String(cell || "").trim()))
    .filter((row) => row.some(Boolean));
  if (!normalizedRows.length) return "";
  const head = normalizedRows[0];
  const body = normalizedRows.slice(1);
  return [
    "<table><thead><tr>",
    ...head.map((cell) => `<th>${escapeHtml(cell)}</th>`),
    "</tr></thead><tbody>",
    ...body.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`),
    "</tbody></table>"
  ].join("");
}

function normalizeVideoTableHeaderKey(label = "") {
  const clean = String(label || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  if (/(tiempo|duracion|duration|time)/.test(clean)) return "time";
  if (/(guion|gui[oó]n|voz en off|voice.?over|narracion|narration)/.test(clean)) return "script";
  if (/(descripcion de escena|descripci[oó]n de escena|scene description|descripcion escena)/.test(clean)) return "sceneDescription";
  if (/(texto en pantalla|on.?screen|caption|subt[ií]tulo)/.test(clean)) return "onScreenText";
  if (/(transicion|transition|corte|fade|barrido)/.test(clean)) return "transition";
  if (/(elemento visual|recurso visual|notas visuales|visual notes|visual|imagen|fondo)/.test(clean)) return "visual";
  return "";
}

function normalizeEducationalVideoTableRows(rows = []) {
  const sourceRows = (Array.isArray(rows) ? rows : [])
    .map((row) => (
      Array.isArray(row)
        ? row.map((cell) => String(cell || "").replace(/\s+/g, " ").trim())
        : [
          String(row?.time || "").replace(/\s+/g, " ").trim(),
          String(row?.script || "").replace(/\s+/g, " ").trim(),
          String(row?.sceneDescription || "").replace(/\s+/g, " ").trim(),
          String(row?.onScreenText || "").replace(/\s+/g, " ").trim(),
          String(row?.transition || "").replace(/\s+/g, " ").trim(),
          String(row?.visual || "").replace(/\s+/g, " ").trim()
        ]
    ))
    .filter((row) => row.some(Boolean));
  if (!sourceRows.length) return [];
  const firstRow = sourceRows[0] || [];
  const headerKeys = firstRow.map((cell) => normalizeVideoTableHeaderKey(cell));
  const recognizedHeaderCount = headerKeys.filter(Boolean).length;
  const shortCellCount = firstRow.filter((cell) => String(cell || "").trim().length <= 40).length;
  const hasLongNarrativeCell = firstRow.some((cell) => {
    const text = String(cell || "").trim();
    return text.length > 55 || /[.!?]/.test(text);
  });
  const hasCanonicalHeaderPair = headerKeys.includes("time") && headerKeys.includes("script");
  const hasKnownHeader = (
    recognizedHeaderCount >= 3
    && shortCellCount >= Math.max(3, Math.ceil(firstRow.length * 0.66))
    && !hasLongNarrativeCell
    && hasCanonicalHeaderPair
  );
  const dataRows = hasKnownHeader ? sourceRows.slice(1) : sourceRows;
  return dataRows
    .map((row) => {
      const byIndex = {
        time: row[0] || "",
        script: row[1] || "",
        sceneDescription: row[2] || "",
        onScreenText: row[3] || "",
        transition: row[4] || "",
        visual: row[5] || ""
      };
      if (row.length === 4) {
        byIndex.sceneDescription = "";
        byIndex.onScreenText = "";
        byIndex.transition = row[2] || "";
        byIndex.visual = row[3] || "";
      }
      if (hasKnownHeader) {
        headerKeys.forEach((key, index) => {
          if (!key) return;
          byIndex[key] = row[index] || byIndex[key] || "";
        });
      }
      const sceneDescription = String(byIndex.sceneDescription || "").trim();
      const visual = String(byIndex.visual || "").trim();
      return {
        time: String(byIndex.time || "").trim() || "00:00-00:08",
        script: String(byIndex.script || "").trim() || "Definir voz en off.",
        sceneDescription: sceneDescription || visual || "Definir descripción de escena.",
        onScreenText: String(byIndex.onScreenText || "").trim(),
        transition: String(byIndex.transition || "").trim() || "Corte limpio",
        visual: visual || sceneDescription || "Definir elemento visual."
      };
    })
    .filter((row) => row.script || row.sceneDescription || row.visual);
}

function buildEducationalVideoTableHtml(rows = []) {
  const normalizedRows = normalizeEducationalVideoTableRows(rows.map((row) => [row.time, row.script, row.sceneDescription, row.onScreenText, row.transition, row.visual]));
  if (!normalizedRows.length) return "";
  const body = normalizedRows
    .map((row) => `
      <tr>
        <td>${escapeHtml(row.time)}</td>
        <td>${escapeHtml(row.script)}</td>
        <td>${escapeHtml(row.sceneDescription)}</td>
        <td>${escapeHtml(row.onScreenText || "")}</td>
        <td>${escapeHtml(row.transition)}</td>
        <td>${escapeHtml(row.visual)}</td>
      </tr>
    `)
    .join("");
  return `
    <p><strong>Tabla base de guion de video creativo</strong></p>
    <table>
      <thead>
        <tr>
          <th>Tiempo</th>
          <th>Guion</th>
          <th>Descripción de escena</th>
          <th>Texto en pantalla</th>
          <th>Transición</th>
          <th>Elemento visual</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `.trim();
}

function buildEducationalVideoTableMarkdown(rows = []) {
  const normalizedRows = normalizeEducationalVideoTableRows(rows.map((row) => [row.time, row.script, row.sceneDescription, row.onScreenText, row.transition, row.visual]));
  if (!normalizedRows.length) return "";
  const head = "| Tiempo | Guion | Descripción de escena | Texto en pantalla | Transición | Elemento visual |\n| --- | --- | --- | --- | --- | --- |";
  const body = normalizedRows.map((row) => (
    `| ${toMarkdownTableCell(row.time)} | ${toMarkdownTableCell(row.script)} | ${toMarkdownTableCell(row.sceneDescription)} | ${toMarkdownTableCell(row.onScreenText || "")} | ${toMarkdownTableCell(row.transition)} | ${toMarkdownTableCell(row.visual)} |`
  )).join("\n");
  return `${head}\n${body}`;
}

async function structureEducationalVideoTableWithGemini(prompt = "", sessionSnapshot = null) {
  const cleanPrompt = String(prompt || "").trim();
  if (!cleanPrompt) return [];
  const conversationContext = sessionSnapshot ? buildChatContext(sessionSnapshot) : "";
  const responseSchema = {
    type: "object",
    properties: {
      rows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            tiempo: { type: "string" },
            guion: { type: "string" },
            descripcionEscena: { type: "string" },
            textoPantalla: { type: "string" },
            transicion: { type: "string" },
            elementoVisual: { type: "string" }
          },
          required: ["tiempo", "guion", "descripcionEscena", "textoPantalla", "transicion", "elementoVisual"]
        }
      }
    },
    required: ["rows"]
  };
  const payload = {
    systemInstruction: {
      parts: [{
        text: "Eres un editor técnico de guion de video creativo. Estructura la entrada del usuario en filas tabulares con columnas exactas: tiempo, guion, descripcionEscena, textoPantalla, transicion, elementoVisual. En textoPantalla escribe una frase clave corta (keywords entendibles), no repitas descripcionEscena ni elementoVisual y evita frases largas. No inventes narrativas largas; solo organiza y normaliza. Responde solo JSON válido."
      }]
    },
    contents: [{
      role: "user",
      parts: [{
        text: [
          conversationContext ? `Conversación reciente:\n${conversationContext}` : "",
          `Entrada del usuario para estructurar tabla:\n${cleanPrompt}`
        ].filter(Boolean).join("\n\n")
      }]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: responseSchema
    }
  };
  const data = await authFetchJson("/api/gemini/generate", {
    method: "POST",
    body: JSON.stringify({
      model: els.scriptModelSelect.value,
      payload
    })
  });
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const parsed = JSON.parse(rawText);
  const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
  return normalizeEducationalVideoTableRows(
    rows.map((row) => [row?.tiempo, row?.guion, row?.descripcionEscena, row?.textoPantalla, row?.transicion, row?.elementoVisual])
  );
}

function buildEducationalVideoSceneTimeRange(index = 0) {
  const safeIndex = Math.max(0, Math.floor(Number(index) || 0));
  const startSec = safeIndex * VIDEO_SCENE_MAX_SEC;
  const endSec = startSec + VIDEO_SCENE_MAX_SEC;
  return `${secondsToClock(startSec)}-${secondsToClock(endSec)}`;
}

function buildCompactEducationalSentence(source = "", maxWords = 16) {
  const topic = trimWords(normalizeSimpleText(source) || "la idea principal", Math.max(3, Math.min(8, maxWords - 6)));
  let sentence = ensureCompleteSentence(`Explicamos ${topic} con un ejemplo claro`);
  if (countWords(sentence) > maxWords) {
    sentence = ensureCompleteSentence(`Explicamos ${trimWords(topic, Math.max(2, maxWords - 2))}`);
  }
  return sentence;
}

function stripLeadingStageDirection(text = "") {
  return String(text || "").replace(/^\s*[\(\[][^\)\]]+[\)\]]\s*/u, "").trim();
}

function splitScriptIntoSceneChunks(text = "", options = {}) {
  const maxWords = Math.max(10, Number(options?.maxWords) || 24);
  const clean = normalizeSimpleText(stripLeadingStageDirection(text));
  if (!clean) return [];
  const sentences = splitTextIntoSentences(clean).map((part) => ensureCompleteSentence(part)).filter(Boolean);
  if (!sentences.length) return [ensureCompleteSentence(clean)];
  const chunks = [];
  let bucket = "";
  sentences.forEach((sentence) => {
    const candidate = bucket ? `${bucket} ${sentence}`.replace(/\s+/g, " ").trim() : sentence;
    if (!bucket) {
      bucket = candidate;
      return;
    }
    if (countWords(candidate) <= maxWords) {
      bucket = candidate;
      return;
    }
    chunks.push(ensureCompleteSentence(bucket));
    bucket = sentence;
  });
  if (bucket) chunks.push(ensureCompleteSentence(bucket));
  return chunks.filter(Boolean);
}

function normalizeSingleSentenceForVideoScene(text = "", options = {}) {
  const clean = normalizeSimpleText(stripLeadingStageDirection(text));
  const fallbackSeed = normalizeSimpleText(options?.fallbackSeed || options?.context || "");
  const maxWords = Math.max(10, Number(options?.maxWords) || 24);
  if (!clean) {
    return buildCompactEducationalSentence(fallbackSeed || "la idea principal", 16);
  }
  if (countWords(clean) <= maxWords) {
    return ensureCompleteSentence(clean);
  }
  const chunks = splitScriptIntoSceneChunks(clean, { maxWords });
  if (chunks.length) return chunks[0];
  return ensureCompleteSentence(trimWords(clean, maxWords));
}

function normalizeOnScreenTextStrict(value = "", options = {}) {
  const voiceOver = normalizeSimpleText(options?.voiceOver || "");
  const sceneDescription = normalizeSimpleText(options?.sceneDescription || "");
  const visual = normalizeSimpleText(options?.visual || "");
  const fallback = summarizeOnScreenTextFromVoiceOver(voiceOver || sceneDescription || visual, { maxWords: 8 });
  let text = buildOnScreenText(value, { voiceOver, sceneDescription, visual }) || fallback || "";
  text = normalizeSimpleText(text);
  if (countWords(text) > 12) text = normalizeSimpleText(trimWords(text, 12));
  const danglingWords = new Set(["de", "del", "la", "las", "el", "los", "y", "o", "u", "que", "a", "en", "con", "por", "para", "al"]);
  const tokens = text.split(/\s+/).filter(Boolean);
  while (tokens.length > 2 && danglingWords.has(String(tokens[tokens.length - 1] || "").toLowerCase())) {
    tokens.pop();
  }
  text = normalizeSimpleText(tokens.join(" "));
  if (isWeakOnScreenText(text)) {
    text = normalizeSimpleText(fallback || text);
  }
  return text || normalizeSimpleText(fallback || "Idea clave en pantalla");
}

function inferTransitionFromSceneContext(options = {}) {
  const script = normalizeSimpleText(options?.script || "").toLowerCase();
  const sceneDescription = normalizeSimpleText(options?.sceneDescription || "").toLowerCase();
  const visual = normalizeSimpleText(options?.visual || "").toLowerCase();
  const hay = `${script} ${sceneDescription} ${visual}`;
  if (/\bzoom|acercamiento|primer plano|close[- ]?up\b/.test(hay)) return "Zoom in suave";
  if (/\bfundido|desvanece|fade|disolvencia\b/.test(hay)) return "Fundido suave";
  if (/\bpaneo|barrido|travelling|recorrido\b/.test(hay)) return "Paneo lateral";
  if (/\bmontaje|rapido|rápido|dinamica|dinámica\b/.test(hay)) return "Montaje rápido";
  if (/\brevela|revelar|descubre|aparece\b/.test(hay)) return "Disolvencia";
  const partIndex = Math.max(0, Number(options?.partIndex) || 0);
  return partIndex === 0 ? "Corte inicial" : "Corte limpio";
}

function normalizeTransitionForScene(value = "", options = {}) {
  const raw = normalizeSimpleText(value);
  const isGeneric = !raw
    || /^sin transici[oó]n(?:\s+espec[ií]fica)?\.?$/i.test(raw)
    || /^sin transicion(?:\s+especifica)?\.?$/i.test(raw)
    || /^no transition\.?$/i.test(raw);
  if (!isGeneric) return raw;
  return inferTransitionFromSceneContext(options);
}

function validateEducationalVideoCanonicalRow(row = {}) {
  const issues = [];
  const durationSec = Math.round(Number(row?.durationSec) || 0);
  const script = normalizeSimpleText(row?.script || "");
  const sentenceCount = splitTextIntoSentences(script).length;
  if (durationSec !== VIDEO_SCENE_MAX_SEC) issues.push("duration_not_8s");
  if (!/[.!?]$/.test(script)) issues.push("script_sentence_incomplete");
  if (!sentenceCount) issues.push("script_empty");
  return {
    isValid: issues.length === 0,
    issues,
    speechSec: Number(estimateSpeechDurationSec(script).toFixed(2)),
    bufferSec: Number((VIDEO_SCENE_MAX_SEC - estimateSpeechDurationSec(script)).toFixed(2)),
    onScreenWords: countWords(normalizeSimpleText(row?.onScreenText || ""))
  };
}

function toEducationalVideoCanonicalRow(raw = {}, index = 0) {
  const timeSeed = String(raw?.timeRange || raw?.time || "").trim();
  const parsedDuration = parseDurationSecFromRangeLabel(timeSeed, VIDEO_SCENE_MAX_SEC);
  const sceneDescription = normalizeSimpleText(raw?.sceneDescription || raw?.descripcionEscena || raw?.scenePrompt || raw?.visual || "");
  const visual = normalizeSimpleText(raw?.visual || raw?.elementoVisual || raw?.visualNotes || sceneDescription || "");
  const scriptSeed = normalizeSimpleText(raw?.script || raw?.guion || raw?.voiceOverText || raw?.text || "");
  const transition = normalizeTransitionForScene(raw?.transition || raw?.transicion || "", {
    script: scriptSeed,
    sceneDescription,
    visual,
    partIndex: index
  });
  const script = normalizeSingleSentenceForVideoScene(scriptSeed, {
    fallbackSeed: sceneDescription || visual || scriptSeed,
    supportText: sceneDescription || visual
  });
  const onScreenText = normalizeOnScreenTextStrict(raw?.onScreenText || raw?.textoPantalla || "", {
    voiceOver: script,
    sceneDescription,
    visual
  });
  const timeRange = buildEducationalVideoSceneTimeRange(index);
  const row = {
    timeRange,
    durationSec: VIDEO_SCENE_MAX_SEC,
    script,
    sceneDescription: sceneDescription || buildFallbackSceneDescriptionFromVoiceOver(script, transition, index),
    onScreenText,
    transition,
    visual: visual || sceneDescription || "Definir elemento visual.",
    validation: {
      isValid: false,
      issues: ["not_validated"]
    }
  };
  if (Math.round(parsedDuration) !== VIDEO_SCENE_MAX_SEC) {
    row.validation = {
      isValid: false,
      issues: ["duration_not_8s"]
    };
  }
  row.validation = validateEducationalVideoCanonicalRow(row);
  return row;
}

function repairEducationalVideoCanonicalRowLocal(row = {}, index = 0) {
  const script = normalizeSingleSentenceForVideoScene(row?.script || "", {
    fallbackSeed: row?.sceneDescription || row?.visual || row?.script || "",
    supportText: row?.sceneDescription || row?.visual || ""
  });
  const repaired = {
    ...row,
    timeRange: buildEducationalVideoSceneTimeRange(index),
    durationSec: VIDEO_SCENE_MAX_SEC,
    script,
    sceneDescription: normalizeSimpleText(row?.sceneDescription || "") || buildFallbackSceneDescriptionFromVoiceOver(script, row?.transition || "", index),
    transition: normalizeTransitionForScene(row?.transition || "", {
      script,
      sceneDescription: row?.sceneDescription || "",
      visual: row?.visual || "",
      partIndex: index
    }),
    visual: normalizeSimpleText(row?.visual || row?.sceneDescription || "") || "Definir elemento visual."
  };
  repaired.onScreenText = normalizeOnScreenTextStrict(row?.onScreenText || "", {
    voiceOver: repaired.script,
    sceneDescription: repaired.sceneDescription,
    visual: repaired.visual
  });
  repaired.validation = validateEducationalVideoCanonicalRow(repaired);
  if (!repaired.validation.isValid) {
    const forcedScript = buildCompactEducationalSentence(repaired.script || repaired.sceneDescription || repaired.visual || "la idea principal", 16);
    repaired.script = normalizeSingleSentenceForVideoScene(forcedScript, {
      fallbackSeed: repaired.sceneDescription || repaired.visual || forcedScript
    });
    repaired.onScreenText = normalizeOnScreenTextStrict(repaired.onScreenText || "", {
      voiceOver: repaired.script,
      sceneDescription: repaired.sceneDescription,
      visual: repaired.visual
    });
    repaired.validation = validateEducationalVideoCanonicalRow(repaired);
  }
  return repaired;
}

function canonicalRowsToEducationalVideoTableRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => ({
    time: String(row?.timeRange || buildEducationalVideoSceneTimeRange(index)).trim(),
    script: normalizeSimpleText(row?.script || ""),
    sceneDescription: normalizeSimpleText(row?.sceneDescription || ""),
    onScreenText: normalizeSimpleText(row?.onScreenText || ""),
    transition: normalizeSimpleText(row?.transition || "") || "Corte limpio",
    visual: normalizeSimpleText(row?.visual || row?.sceneDescription || "") || "Definir elemento visual."
  }));
}

function mergeEducationalVideoRowsWithLocalPriority(localRows = [], geminiRows = []) {
  if (!Array.isArray(geminiRows) || !geminiRows.length) return localRows;
  if (!Array.isArray(localRows) || !localRows.length) return geminiRows;
  return geminiRows.map((row, index) => {
    const localRow = localRows[index] || null;
    if (!localRow) return row;
    return {
      time: String(localRow.time || row.time || "").trim() || "00:00-00:08",
      script: String(localRow.script || row.script || "").trim() || "Definir voz en off.",
      sceneDescription: String(localRow.sceneDescription || row.sceneDescription || row.visual || "").trim() || "Definir descripción de escena.",
      onScreenText: String(localRow.onScreenText || row.onScreenText || "").trim(),
      transition: String(localRow.transition || row.transition || "").trim() || "Corte limpio",
      visual: String(localRow.visual || row.visual || row.sceneDescription || "").trim() || "Definir elemento visual."
    };
  });
}

function expandEducationalVideoRowsByScript(rows = []) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const expanded = [];
  sourceRows.forEach((row) => {
    const scriptSource = String(row?.script || row?.guion || row?.voiceOverText || row?.text || "").trim();
    const chunks = splitScriptIntoSceneChunks(scriptSource, { maxWords: 24 });
    if (!chunks.length) {
      expanded.push(row);
      return;
    }
    chunks.forEach((chunk, index) => {
      const chunkSceneDescription = index === 0
        ? String(row?.sceneDescription || "").trim()
        : buildFallbackSceneDescriptionFromVoiceOver(chunk, String(row?.transition || "").trim(), index);
      const chunkVisual = index === 0
        ? String(row?.visual || row?.elementoVisual || "").trim()
        : buildFallbackSceneDescriptionFromVoiceOver(chunk, "", index);
      expanded.push({
        ...row,
        script: chunk,
        guion: chunk,
        voiceOverText: chunk,
        text: chunk,
        onScreenText: index === 0 ? String(row?.onScreenText || row?.textoPantalla || "").trim() : "",
        sceneDescription: chunkSceneDescription || String(row?.sceneDescription || "").trim(),
        visual: chunkVisual || String(row?.visual || row?.elementoVisual || "").trim(),
        transition: normalizeTransitionForScene(
          index === 0
            ? String(row?.transition || row?.transicion || "").trim()
            : "Corte limpio",
          {
            script: chunk,
            sceneDescription: chunkSceneDescription,
            visual: chunkVisual,
            partIndex: index
          }
        )
      });
    });
  });
  return expanded;
}

function normalizeSplitCoverageText(value = "") {
  return stripLeadingStageDirection(String(value || ""))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeCoverageText(value = "") {
  return normalizeSplitCoverageText(value)
    .split(/\s+/)
    .map((token) => String(token || "").trim())
    .filter((token) => token.length >= 3);
}

function computeTokenCoverageRatio(original = "", candidate = "") {
  const originalTokens = tokenizeCoverageText(original);
  if (!originalTokens.length) return 0;
  const candidateSet = new Set(tokenizeCoverageText(candidate));
  if (!candidateSet.size) return 0;
  const matched = originalTokens.filter((token) => candidateSet.has(token)).length;
  return matched / originalTokens.length;
}

function hasAcceptableSplitCoverage(original = "", candidate = "") {
  const base = normalizeSplitCoverageText(original);
  const test = normalizeSplitCoverageText(candidate);
  if (!base || !test) return false;
  if (test === base) return true;
  if (test.includes(base)) return true;
  const tokenCoverage = computeTokenCoverageRatio(base, test);
  const lengthRatio = test.length / Math.max(1, base.length);
  return tokenCoverage >= 0.82 && lengthRatio >= 0.74;
}

async function splitEducationalVideoRowsWithGemini(rows = [], sessionSnapshot = null, options = {}) {
  const strictMode = options?.strict === true;
  const attempt = Math.max(0, Number(options?.attempt) || 0);
  const sourceRows = (Array.isArray(rows) ? rows : []).map((row, index) => ({
    sourceIndex: index,
    script: String(row?.script || row?.guion || row?.voiceOverText || row?.text || "").trim(),
    sceneDescription: String(row?.sceneDescription || "").trim(),
    transition: String(row?.transition || "").trim(),
    visual: String(row?.visual || "").trim()
  })).filter((row) => row.script);
  if (!sourceRows.length) return rows;

  const responseSchema = {
    type: "object",
    properties: {
      rows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sourceIndex: { type: "number" },
            partIndex: { type: "number" },
            script: { type: "string" },
            sceneDescription: { type: "string" },
            visual: { type: "string" },
            transition: { type: "string" },
            onScreenText: { type: "string" }
          },
          required: ["sourceIndex", "partIndex", "script", "sceneDescription", "visual", "transition"]
        }
      }
    },
    required: ["rows"]
  };
  const conversationContext = sessionSnapshot ? buildChatContext(sessionSnapshot) : "";
  const payload = {
    systemInstruction: {
      parts: [{
        text: attempt > 0
          ? "Eres editor de guion y director visual. Divide cada escena original en sub-escenas coherentes por frases completas. REGLA CRÍTICA: al concatenar todas las sub-escenas de un sourceIndex debe conservarse TODO el contenido textual original en el mismo orden (sin recorte ni omisión), salvo limpieza de acotaciones iniciales entre paréntesis. Además, por cada sub-escena devuelve sceneDescription y visual específicos y distintos para secuencia progresiva (no repetir fondo), y transition cinematográfica coherente. Devuelve sourceIndex y partIndex consecutivo desde 0. Responde solo JSON valido."
          : "Eres editor de guion y director visual. Divide cada escena original en sub-escenas coherentes por frases completas. Reglas: 1) conservar TODO el contenido textual de cada escena original en el mismo orden, 2) no recortar ni omitir ideas, 3) no cortar frases a la mitad, 4) por cada sub-escena devolver sceneDescription y visual específicos y distintos para que la secuencia avance (no repetir el mismo fondo), 5) devolver sourceIndex y partIndex consecutivo desde 0 para cada sourceIndex, 6) transition debe indicar continuidad cinematográfica coherente (ej. corte limpio, paneo lateral, acercamiento). Responde solo JSON valido."
      }]
    },
    contents: [{
      role: "user",
      parts: [{
        text: [
          conversationContext ? `Conversación reciente:\n${conversationContext}` : "",
          `Escenas originales a dividir:\n${JSON.stringify(sourceRows)}`
        ].filter(Boolean).join("\n\n")
      }]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: responseSchema
    }
  };
  try {
    const data = await authFetchJson("/api/gemini/generate", {
      method: "POST",
      body: JSON.stringify({
        model: els.scriptModelSelect.value,
        payload
      })
    });
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const parsed = JSON.parse(rawText);
    const splitRows = Array.isArray(parsed?.rows) ? parsed.rows : [];
    if (!splitRows.length) {
      if (strictMode && attempt < 1) {
        return splitEducationalVideoRowsWithGemini(rows, sessionSnapshot, {
          ...options,
          strict: true,
          attempt: attempt + 1
        });
      }
      return rows;
    }

    const grouped = new Map();
    splitRows.forEach((item) => {
      const sourceIndex = Number(item?.sourceIndex);
      const partIndex = Number(item?.partIndex);
      const script = String(item?.script || "").trim();
      const sceneDescription = String(item?.sceneDescription || "").trim();
      const visual = String(item?.visual || "").trim();
      const transition = String(item?.transition || "").trim();
      const onScreenText = String(item?.onScreenText || "").trim();
      if (!Number.isFinite(sourceIndex) || sourceIndex < 0) return;
      if (!Number.isFinite(partIndex) || partIndex < 0) return;
      if (!script || !sceneDescription || !visual || !transition) return;
      if (!grouped.has(sourceIndex)) grouped.set(sourceIndex, []);
      grouped.get(sourceIndex).push({ partIndex, script, sceneDescription, visual, transition, onScreenText });
    });

    const result = [];
    const failedCoverageIndexes = [];
    for (let index = 0; index < rows.length; index += 1) {
      const originalRow = rows[index] || {};
      const originalScript = String(originalRow?.script || originalRow?.guion || originalRow?.voiceOverText || originalRow?.text || "").trim();
      if (!originalScript) continue;
      const parts = (grouped.get(index) || []).sort((a, b) => a.partIndex - b.partIndex);
      if (!parts.length) {
        result.push(originalRow);
        continue;
      }
      const mergedText = parts.map((part) => String(part.script || "").trim()).filter(Boolean).join(" ");
      if (!hasAcceptableSplitCoverage(originalScript, mergedText)) {
        if (strictMode) {
          failedCoverageIndexes.push(index);
          continue;
        }
        result.push(originalRow);
        continue;
      }
      parts.forEach((part, partIndex) => {
        const script = normalizeSimpleText(part.script || "");
        const sceneDescription = normalizeSimpleText(part.sceneDescription || "");
        const visual = normalizeSimpleText(part.visual || "");
        const transition = normalizeTransitionForScene(part.transition || "", {
          script,
          sceneDescription,
          visual,
          partIndex
        });
        if (!script) return;
        result.push({
          ...originalRow,
          script,
          guion: script,
          voiceOverText: script,
          text: script,
          sceneDescription: sceneDescription || String(originalRow?.sceneDescription || "").trim(),
          visual: visual || String(originalRow?.visual || "").trim(),
          onScreenText: String(part.onScreenText || "").trim() || (partIndex === 0 ? String(originalRow?.onScreenText || "").trim() : ""),
          transition
        });
      });
    }
    if (strictMode && failedCoverageIndexes.length) {
      if (attempt < 1) {
        return splitEducationalVideoRowsWithGemini(rows, sessionSnapshot, {
          ...options,
          strict: true,
          attempt: attempt + 1
        });
      }
      const first = failedCoverageIndexes[0];
      throw new Error(`Gemini devolvió una división inválida en la escena ${first + 1} (cobertura insuficiente del texto original).`);
    }
    if (!result.length) {
      if (strictMode) {
        throw new Error("Gemini no devolvió filas útiles para dividir escenas.");
      }
      return rows;
    }
    return result;
  } catch (error) {
    if (strictMode) {
      throw new Error(`Fallo al dividir escenas con Gemini: ${String(error?.message || "error desconocido")}`);
    }
    return rows;
  }
}

function buildEducationalVideoRowsFromNarrativeText(text = "") {
  const source = String(text || "").replace(/\r\n?/g, "\n");
  const blocks = source
    .split(/\n+/)
    .map((line) => normalizeSimpleText(line))
    .filter(Boolean);
  if (!blocks.length) return [];
  const chunks = [];
  blocks.forEach((block) => {
    const parsedChunks = splitScriptIntoSceneChunks(block, { maxWords: 24 });
    if (parsedChunks.length) {
      parsedChunks.forEach((chunk) => {
        const clean = ensureCompleteSentence(chunk);
        if (clean) chunks.push(clean);
      });
      return;
    }
    const clean = ensureCompleteSentence(block);
    if (clean) chunks.push(clean);
  });
  const uniqueChunks = chunks.filter(Boolean);
  if (!uniqueChunks.length) return [];
  return uniqueChunks.map((sentence, index) => {
    const sceneDescription = buildFallbackCreativeSceneDescriptionFromVoiceOver(sentence, "", index);
    return {
      time: buildEducationalVideoSceneTimeRange(index),
      script: sentence,
      sceneDescription,
      onScreenText: summarizeOnScreenTextFromVoiceOver(sentence, { maxWords: 8 }) || "",
      transition: normalizeTransitionForScene("", {
        script: sentence,
        sceneDescription,
        visual: sceneDescription,
        partIndex: index
      }),
      visual: sceneDescription
    };
  });
}

async function repairEducationalVideoCanonicalRowsWithGemini(canonicalRows = [], sessionSnapshot = null) {
  const rows = Array.isArray(canonicalRows) ? canonicalRows : [];
  const invalidRows = rows
    .map((row, index) => ({ row, index }))
    .filter((item) => item?.row?.validation?.isValid !== true);
  if (!invalidRows.length) return rows;
  const responseSchema = {
    type: "object",
    properties: {
      rows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "number" },
            script: { type: "string" },
            onScreenText: { type: "string" }
          },
          required: ["index", "script", "onScreenText"]
        }
      }
    },
    required: ["rows"]
  };
  const compactRows = invalidRows.map((item) => ({
    index: item.index,
    script: item.row.script,
    sceneDescription: item.row.sceneDescription,
    transition: item.row.transition,
    visual: item.row.visual,
    onScreenText: item.row.onScreenText,
    issues: item.row.validation?.issues || []
  }));
  const conversationContext = sessionSnapshot ? buildChatContext(sessionSnapshot) : "";
  const payload = {
    systemInstruction: {
      parts: [{
        text: `Corrige solo filas inválidas de guion técnico de video creativo.
Reglas obligatorias por fila: conservar el contenido textual sin recortar ideas, usar frases completas en "script" y duración total fija de ${VIDEO_SCENE_MAX_SEC}s por escena.
No repitas literalmente la descripcion de escena ni el elemento visual en onScreenText.
Responde solo JSON válido.`
      }]
    },
    contents: [{
      role: "user",
      parts: [{
        text: [
          conversationContext ? `Conversación reciente:\n${conversationContext}` : "",
          `Filas inválidas:\n${JSON.stringify(compactRows)}`
        ].filter(Boolean).join("\n\n")
      }]
    }],
    generationConfig: {
      role: "user",
      responseMimeType: "application/json",
      responseJsonSchema: responseSchema
    }
  };
  try {
    const data = await authFetchJson("/api/gemini/generate", {
      method: "POST",
      body: JSON.stringify({
        model: els.scriptModelSelect.value,
        payload
      })
    });
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const parsed = JSON.parse(rawText);
    const byIndex = new Map();
    (Array.isArray(parsed?.rows) ? parsed.rows : []).forEach((item) => {
      const index = Number(item?.index);
      if (!Number.isFinite(index) || index < 0) return;
      byIndex.set(index, {
        script: normalizeSimpleText(item?.script || ""),
        onScreenText: normalizeSimpleText(item?.onScreenText || "")
      });
    });
    return rows.map((row, index) => {
      const patch = byIndex.get(index);
      if (!patch) return row;
      return repairEducationalVideoCanonicalRowLocal({
        ...row,
        script: patch.script || row.script,
        onScreenText: patch.onScreenText || row.onScreenText
      }, index);
    });
  } catch (_) {
    return rows;
  }
}

async function composeEducationalVideoTable(input = {}, sessionSnapshot = null, options = {}) {
  const sourceText = String(input?.text || "").trim();
  const sourceHtml = String(input?.html || "").trim();
  const htmlRows = parseHtmlTableToRows(sourceHtml);
  const textRows = parsePlainTextTableToRows(sourceText);
  const localRows = normalizeEducationalVideoTableRows(htmlRows.length ? htmlRows : textRows);
  let normalizedRows = localRows;
  if (options?.useGeminiSceneSplit !== false && localRows.length) {
    normalizedRows = await splitEducationalVideoRowsWithGemini(localRows, sessionSnapshot, {
      strict: options?.failOnSplitError === true
    });
  }
  normalizedRows = expandEducationalVideoRowsByScript(normalizedRows);
  if (options?.useGeminiStructure !== false && (localRows.length || options?.forceStructureFromPrompt === true)) {
    try {
      const inputForGemini = localRows.length
        ? buildEducationalVideoTableMarkdown(localRows)
        : sourceText;
      const geminiRows = await structureEducationalVideoTableWithGemini(inputForGemini, sessionSnapshot);
      if (geminiRows.length) {
        const mergedRows = mergeEducationalVideoRowsWithLocalPriority(localRows, geminiRows);
        const splitRows = options?.useGeminiSceneSplit !== false
          ? await splitEducationalVideoRowsWithGemini(mergedRows, sessionSnapshot, {
            strict: options?.failOnSplitError === true
          })
          : mergedRows;
        normalizedRows = expandEducationalVideoRowsByScript(splitRows);
      }
    } catch (_) {
      // fallback local
    }
  }
  if (!normalizedRows.length) {
    const seedRows = buildEducationalVideoRowsFromNarrativeText(sourceText);
    const splitRows = options?.useGeminiSceneSplit !== false
      ? await splitEducationalVideoRowsWithGemini(seedRows, sessionSnapshot, {
        strict: options?.failOnSplitError === true
      })
      : seedRows;
    normalizedRows = expandEducationalVideoRowsByScript(splitRows);
  }
  if (!normalizedRows.length) {
    return {
      rows: [],
      tableRows: [],
      markdown: "",
      html: "",
      userMessageText: sourceText,
      userMessageHtml: sourceHtml,
      generationPrompt: sourceText
    };
  }
  let canonicalRows = normalizedRows.map((row, index) => repairEducationalVideoCanonicalRowLocal(toEducationalVideoCanonicalRow(row, index), index));
  canonicalRows = canonicalRows.map((row, index) => repairEducationalVideoCanonicalRowLocal(row, index));
  if (canonicalRows.some((row) => row?.validation?.isValid !== true)) {
    canonicalRows = await repairEducationalVideoCanonicalRowsWithGemini(canonicalRows, sessionSnapshot);
  }
  canonicalRows = canonicalRows.map((row, index) => repairEducationalVideoCanonicalRowLocal(row, index));
  canonicalRows = canonicalRows.map((row, index) => {
    if (row?.validation?.isValid === true) return row;
    return repairEducationalVideoCanonicalRowLocal({
      ...row,
      script: buildCompactEducationalSentence(row?.script || row?.sceneDescription || row?.visual || "la idea principal", 16),
      onScreenText: summarizeOnScreenTextFromVoiceOver(row?.script || row?.sceneDescription || "", { maxWords: 8 })
    }, index);
  });
  const tableRows = canonicalRowsToEducationalVideoTableRows(canonicalRows);
  let rowsForOnScreen = tableRows;
  if (options?.useGeminiOnScreen !== false) {
    try {
      const enhancedRows = await enhanceEducationalVideoOnScreenTextWithGemini(tableRows, sessionSnapshot);
      if (Array.isArray(enhancedRows) && enhancedRows.length === tableRows.length) {
        rowsForOnScreen = enhancedRows.map((row, index) => ({
          ...row,
          time: String(tableRows[index]?.time || row?.time || "").trim() || buildEducationalVideoSceneTimeRange(index)
        }));
      }
    } catch (_) {
      // fallback local
    }
  }
  canonicalRows = rowsForOnScreen.map((row, index) => repairEducationalVideoCanonicalRowLocal(toEducationalVideoCanonicalRow(row, index), index));
  const finalizedTableRows = canonicalRowsToEducationalVideoTableRows(canonicalRows);
  const markdown = buildEducationalVideoTableMarkdown(finalizedTableRows);
  const html = buildEducationalVideoTableHtml(finalizedTableRows);
  const generationPrompt = [
    sourceText,
    "Usa esta tabla base estructurada para construir el guion final creativo:",
    markdown
  ].filter(Boolean).join("\n\n");
  return {
    rows: canonicalRows,
    tableRows: finalizedTableRows,
    markdown,
    html,
    userMessageText: `Tabla base de guion de video creativo:\n${markdown}`,
    userMessageHtml: html,
    generationPrompt
  };
}

async function prepareVideoPromptPreviewForUser(promptText = "", promptHtml = "", sessionSnapshot = null) {
  const composed = await composeEducationalVideoTable({
    text: promptText,
    html: promptHtml
  }, sessionSnapshot, {
    useGeminiStructure: true,
    useGeminiSceneSplit: true,
    failOnSplitError: true,
    useGeminiOnScreen: false,
    forceStructureFromPrompt: false
  });
  if (!Array.isArray(composed?.rows) || !composed.rows.length) {
    return {
      userMessageText: promptText,
      userMessageHtml: promptHtml,
      generationPrompt: promptText
    };
  }
  return {
    userMessageText: composed.userMessageText,
    userMessageHtml: composed.userMessageHtml,
    generationPrompt: composed.generationPrompt
  };
}

async function composeVideoScriptFromUserInput(promptText = "", promptHtml = "", sessionSnapshot = null) {
  const composed = await composeEducationalVideoTable({
    text: promptText,
    html: promptHtml
  }, sessionSnapshot, {
    useGeminiStructure: true,
    useGeminiSceneSplit: true,
    failOnSplitError: false,
    useGeminiOnScreen: false,
    forceStructureFromPrompt: false
  });
  const canonicalRows = Array.isArray(composed?.rows) ? composed.rows : [];
  if (!canonicalRows.length) return null;
  const rows = canonicalRows.map((row, index) => normalizeCreativeRow({
    durationSec: VIDEO_SCENE_MAX_SEC,
    voiceOverText: row?.script || row?.voiceOverText || row?.text || "",
    sceneDescription: row?.sceneDescription || "",
    onScreenText: row?.onScreenText || "",
    transition: row?.transition || "",
    visualNotes: row?.visual || row?.visualNotes || ""
  }, index, { videoPreset: "creative" }));
  return {
    episodeTitle: "Video desde guion",
    summary: "Tabla compuesta a partir del texto del usuario en modo Componer.",
    videoMode: true,
    videoPreset: "creative",
    hosts: ["Narrador"],
    rows
  };
}

registerPodcasterScriptGeneratorApi({
  rewriteScenarioPromptForEducationalVideo,
  resolveCreativeVisualNotesText,
  buildOnScreenText,
  ensureCompleteSentence,
  buildMarkdownTableFromRows,
  parseHtmlTableToRows,
  parsePlainTextTableToRows,
  hasStructuredVideoTableInput,
  stripMarkdownTableFromText,
  extractNonTableTextFromPromptHtml,
  extractStructuredVideoTableRows,
  buildHtmlTableFromRows,
  normalizeVideoTableHeaderKey,
  normalizeEducationalVideoTableRows,
  buildEducationalVideoTableHtml,
  buildEducationalVideoTableMarkdown,
  structureEducationalVideoTableWithGemini,
  buildEducationalVideoSceneTimeRange,
  buildCompactEducationalSentence,
  stripLeadingStageDirection,
  splitScriptIntoSceneChunks,
  normalizeSingleSentenceForVideoScene,
  normalizeOnScreenTextStrict,
  inferTransitionFromSceneContext,
  normalizeTransitionForScene,
  validateEducationalVideoCanonicalRow,
  toEducationalVideoCanonicalRow,
  repairEducationalVideoCanonicalRowLocal,
  canonicalRowsToEducationalVideoTableRows,
  mergeEducationalVideoRowsWithLocalPriority,
  expandEducationalVideoRowsByScript,
  normalizeSplitCoverageText,
  tokenizeCoverageText,
  computeTokenCoverageRatio,
  hasAcceptableSplitCoverage,
  splitEducationalVideoRowsWithGemini,
  buildEducationalVideoRowsFromNarrativeText,
  repairEducationalVideoCanonicalRowsWithGemini,
  composeEducationalVideoTable,
  prepareVideoPromptPreviewForUser,
  composeVideoScriptFromUserInput,
  applyScriptGenerationConstraints,
  forceHostsAndAlternation,
  generateWithGeminiStrictConstraints,
  handleGenerate
});

// === EXPORTS ===
window.estimateSpeechDurationSec = estimateSpeechDurationSec;
window.countWords = countWords;
window.splitByMaxWords = splitByMaxWords;
window.splitTextIntoSentences = splitTextIntoSentences;
window.ensureCompleteSentence = ensureCompleteSentence;
window.enforceVideoSceneRows = enforceVideoSceneRows;
window.enforceSceneWordBounds = enforceSceneWordBounds;
window.splitRowTextForSceneCount = splitRowTextForSceneCount;
window.enforceExactSceneCount = enforceExactSceneCount;
window.coerceRowsToHosts = coerceRowsToHosts;
window.applyScriptGenerationConstraints = applyScriptGenerationConstraints;
window.optimizeRowsForShortScenes = optimizeRowsForShortScenes;
window.rowNeedsCompaction = rowNeedsCompaction;
window.scriptNeedsCompaction = scriptNeedsCompaction;
window.compactScriptForPanelConnection = compactScriptForPanelConnection;
window.applyDisfluencyDefaultsToScriptRows = applyDisfluencyDefaultsToScriptRows;
window.setButtonLoadingState = setButtonLoadingState;
window.normalizeScriptPayload = normalizeScriptPayload;
window.buildChatContext = buildChatContext;
window.buildScriptContext = buildScriptContext;
window.hasMeaningfulScript = hasMeaningfulScript;
window.isShortenRequest = isShortenRequest;
window.isRebuildRequest = isRebuildRequest;
window.extractRequestedMinDurationSec = extractRequestedMinDurationSec;
window.extractRequestedSceneRange = extractRequestedSceneRange;
window.extractRequestedSceneWordRange = extractRequestedSceneWordRange;
window.parseSecondsToken = parseSecondsToken;
window.parseDurationSecFromRangeLabel = parseDurationSecFromRangeLabel;
window.isLikelyCreativeVideoTableHeader = isLikelyCreativeVideoTableHeader;
window.extractCreativeVideoTableColumns = extractCreativeVideoTableColumns;
window.deriveMediaCueFromTransition = deriveMediaCueFromTransition;
window.normalizeMediaCueValue = normalizeMediaCueValue;
window.enrichPodcastMediaCues = enrichPodcastMediaCues;
window.finalizePodcastRows = finalizePodcastRows;
window.normalizeSimpleText = normalizeSimpleText;
window.normalizeCreativeFieldText = normalizeCreativeFieldText;
window.normalizeComparableCreativeText = normalizeComparableCreativeText;
window.summarizeOnScreenTextFromVoiceOver = summarizeOnScreenTextFromVoiceOver;
window.isWeakOnScreenText = isWeakOnScreenText;
window.enhanceEducationalVideoOnScreenTextWithGemini = enhanceEducationalVideoOnScreenTextWithGemini;
window.looksLikeTransitionOnly = looksLikeTransitionOnly;
window.splitLongSentenceIntoChunks = splitLongSentenceIntoChunks;
window.splitNarrationIntoCompleteScenes = splitNarrationIntoCompleteScenes;
window.splitCreativeVideoVoiceOverIntoChunks = splitCreativeVideoVoiceOverIntoChunks;
window.expandCreativeVideoRowsForTiming = expandCreativeVideoRowsForTiming;
window.buildFallbackSceneDescriptionFromVoiceOver = buildFallbackSceneDescriptionFromVoiceOver;
window.buildFallbackCreativeSceneDescriptionFromVoiceOver = buildFallbackCreativeSceneDescriptionFromVoiceOver;
window.buildFallbackCreativeVoiceOverFromSceneDescription = buildFallbackCreativeVoiceOverFromSceneDescription;
window.extractCreativeLocationQualifier = extractCreativeLocationQualifier;
window.refineCreativeLocationLabel = refineCreativeLocationLabel;
window.buildCreativeLocationDescription = buildCreativeLocationDescription;
window.buildCreativeVisualElementDescription = buildCreativeVisualElementDescription;
window.buildCreativeOnScreenText = buildCreativeOnScreenText;
window.isGenericCreativeVisualText = isGenericCreativeVisualText;
window.buildDistinctCreativeVisualNotes = buildDistinctCreativeVisualNotes;
window.buildCreativeVideoValidationError = buildCreativeVideoValidationError;
window.isCreativeVoiceOverGeneric = isCreativeVoiceOverGeneric;
window.validateCreativeVideoScriptOutput = validateCreativeVideoScriptOutput;
window.buildCreativeVideoScriptFromPromptTable = buildCreativeVideoScriptFromPromptTable;
window.parseGeminiResponseJson = parseGeminiResponseJson;
window.buildPodcastScriptFromPromptTable = buildPodcastScriptFromPromptTable;
window.applyAuthoritativeCreativeTableToScript = applyAuthoritativeCreativeTableToScript;
window.rewritePromptForEducationalVideo = rewritePromptForEducationalVideo;
window.enforceScriptMinimums = enforceScriptMinimums;
window.mergeWithPreviousScript = mergeWithPreviousScript;
window.buildScriptGenerationResponseSchema = buildScriptGenerationResponseSchema;
window.enforceEducationalVideoSemantics = enforceEducationalVideoSemantics;
window.isLikelyEducationalTemplateForCreativeVideo = isLikelyEducationalTemplateForCreativeVideo;
window.generateScriptWithGeminiCore = generateScriptWithGeminiCore;
window.generatePodcastScript = generatePodcastScript;
window.generateVideoScript = generateVideoScript;
window.generateEducationalVideoScript = generateEducationalVideoScript;
window.generateFallbackScript = generateFallbackScript;
window.isNetworkFetchFailure = isNetworkFetchFailure;
window.isLocalApiReachable = isLocalApiReachable;
window.connectScriptSnapshotToPanel = connectScriptSnapshotToPanel;

// Migrated window bindings
