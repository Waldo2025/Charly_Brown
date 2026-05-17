const fs = require('fs');
const jsPath = 'public/podcaster/podcaster.js';
const newModPath = 'public/podcaster/podcaster-script-generator.js';

const lines = fs.readFileSync(jsPath, 'utf8').split('\n');

// 1. Identify start and end lines of the Gemini block
// We want to extract functions related to Gemini script generation.
// Let's find "function estimateSpeechDurationSec" and go all the way down to the end of "async function handleGenerate".

let startIdx = lines.findIndex(l => l.startsWith('function estimateSpeechDurationSec('));
let endIdx = -1;

let inHandleGenerate = false;
let braces = 0;
for (let i = startIdx; i < lines.length; i++) {
  if (lines[i].startsWith('async function handleGenerate(')) {
    inHandleGenerate = true;
  }
  if (inHandleGenerate) {
    braces += (lines[i].match(/\{/g) || []).length;
    braces -= (lines[i].match(/\}/g) || []).length;
    if (braces === 0) {
      endIdx = i;
      break;
    }
  }
}

if (startIdx !== -1 && endIdx !== -1) {
  const extractedLines = lines.slice(startIdx, endIdx + 1);
  
  // Find all function names defined in the extracted block
  const exportedNames = [];
  extractedLines.forEach(l => {
    const m = l.match(/^(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(/);
    if (m) exportedNames.push(m[1]);
  });

  // Create the new module content
  let newModContent = `/**
 * podcaster-script-generator.js
 * Extracted Gemini Script Generation Engine.
 */
import { authFetchJson } from "../js/api-client.js";

// === INJECTED GLOBALS (For compatibility) ===
const {
  els, state, SHORT_SCENE_MIN_SEC, SHORT_SCENE_MAX_SEC, VIDEO_SCENE_MAX_SEC, VIDEO_DIALOGUE_MAX_SEC,
  VOICES, DEFAULT_HOSTS, DEFAULT_DISFLUENCY_CONFIG, SPEAKER_ROLE_DESCRIPTIONS, EXPRESSIONS, MEDIA_CUES,
  logVideoCreateDebug, logPodcasterLiveDebug, resolveCurrentUid, firestoreDb,
  setSidepanelOpen, renderPodcastVideoShell, syncPodcastStudioInspector, resetPodcastStudioSessionUiState,
  addScriptAssistantMessage, addChatMessage, setGenerationStatus,
  hasMeaningfulScript, getActiveSession, upsertActiveSession, normalizeGenerationConstraints,
  resolveVideoContentType, isCurrentModeVideo, getSpeakerOptions, normalizeSpeakerLabel,
  getSpeakerNameMap, getSpeakerVoiceMap, resolveSpeakerVoiceName, normalizeLiveVoiceName,
  makeId, nowIso, buildApiUrl, hasAvailableApiBase,
  stopPodcastPlayback, stopRowAudio, stopGeminiLiveSession, normalizeDisfluencyConfig, buildSpeakerMapsForHosts
} = window;

// Hack: we define a proxy for missing variables to avoid undefined errors during extraction
const w = window;

// === EXTRACTED CODE ===
${extractedLines.join('\n')}

// === EXPORTS ===
`;

  exportedNames.forEach(name => {
    newModContent += `window.${name} = ${name};\n`;
  });

  fs.writeFileSync(newModPath, newModContent);

  // Remove extracted lines from original file
  const remainingLines = [
    ...lines.slice(0, startIdx),
    `// [Gemini Script Generator Code Extracted to podcaster-script-generator.js]`,
    ...lines.slice(endIdx + 1)
  ];
  fs.writeFileSync(jsPath, remainingLines.join('\n'));
  
  console.log(`Extracted ${extractedLines.length} lines from podcaster.js`);
  console.log(`Created new module with ${exportedNames.length} functions.`);
} else {
  console.error('Could not find start or end bounds for extraction.', { startIdx, endIdx });
}
