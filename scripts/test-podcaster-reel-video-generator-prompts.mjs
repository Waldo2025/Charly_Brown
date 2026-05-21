import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read podcaster-video-script-domain.js content to emulate browser environment
const scriptPath = path.resolve(__dirname, "../public/podcaster/podcaster-video-script-domain.js");
const scriptContent = fs.readFileSync(scriptPath, "utf8");

// Mock window/global objects required by the script
const mockWindow = {
  VOICES: ["Kore"],
  VIDEO_SCENE_MAX_SEC: 8,
  VIDEO_DIALOGUE_MAX_SEC: 6,
  trimWords: (str, num) => str.split(/\s+/).slice(0, num).join(" "),
  makeId: (prefix) => `${prefix}_${Math.random()}`,
  normalizeSimpleText: (str) => String(str || "").trim(),
  composeEducationalVideoTable: async () => ({ rows: [] }),
  buildCreativeVideoValidationError: (stage, message, index) => new Error(`[${stage}] ${message} at ${index}`),
  normalizeCreativeRow: (row) => row,
  buildCreativeOnScreenText: (str) => str,
  deriveMediaCueFromTransition: () => "Sin media",
  expandCreativeVideoRowsForTiming: (rows) => rows,
  validateCreativeVideoScriptOutput: (script) => script,
  normalizeScriptPayload: (script) => script,
  normalizeCreativeVideoConfig: (cfg) => cfg,
  getCreativeVideoConfig: () => ({ globalVoiceName: "Kore" }),
  rewritePromptForEducationalVideo: (prompt) => prompt
};

// Bind mocks to global
global.window = mockWindow;
global.globalThis = { PodcasterVideoScriptDomain: {} };

// Run the script in the context of node
const runContextCode = new Function("window", "globalThis", `
  const { VOICES, VIDEO_SCENE_MAX_SEC, VIDEO_DIALOGUE_MAX_SEC } = window;
  ${scriptContent.replace(/const\s*\{\s*VOICES,\s*VIDEO_SCENE_MAX_SEC,\s*VIDEO_DIALOGUE_MAX_SEC\s*\}\s*=\s*window;?/i, "")}
  return { buildVideoContextualInstructions, buildVideoSystemInstruction };
`);

const { buildVideoContextualInstructions, buildVideoSystemInstruction } = runContextCode(
  mockWindow,
  global.globalThis
);

console.log("Starting Reel Mode video prompt builders verification...");

// 1. Verify system instruction without Reel Mode
const sysInstructionNormal = buildVideoSystemInstruction(false);
assert.ok(sysInstructionNormal.includes("guionista y productor senior de videos cortos creativos"));
assert.ok(!sysInstructionNormal.includes("youtuber"));

// 2. Verify system instruction with Reel Mode
const sysInstructionReel = buildVideoSystemInstruction(true);
console.log("Sys instruction (Reel):", sysInstructionReel.slice(0, 100) + "...");
assert.ok(sysInstructionReel.includes("youtuber"));
assert.ok(sysInstructionReel.includes("de frente a la cámara"));
assert.ok(sysInstructionReel.includes("Elemento visual"));
assert.ok(sysInstructionReel.includes("ademanes enérgicos con las manos"));
assert.ok(sysInstructionReel.includes("diagramas didácticos flotando"));

// 3. Verify contextual instructions with Reel Mode
const contextReel = buildVideoContextualInstructions({ reelModeEnabled: true });
console.log("Contextual instructions (Reel) count:", contextReel.length);
const fullTextReel = contextReel.join("\n");
assert.ok(fullTextReel.includes("monólogo enérgico de un único presentador 'youtuber' centrado en la pantalla"));
assert.ok(fullTextReel.includes("REGLA OBLIGATORIA: En la columna de Descripción de escena (sceneDescription), sitúa de manera constante y explícita al presentador"));
assert.ok(fullTextReel.includes("ademanes enérgicos con las manos, gestos expresivos para dar énfasis"));

// 4. Verify contextual instructions without Reel Mode
const contextNormal = buildVideoContextualInstructions({ reelModeEnabled: false });
const fullTextNormal = contextNormal.join("\n");
assert.ok(!fullTextNormal.includes("youtuber"));
assert.ok(!fullTextNormal.includes("ademanes enérgicos con las manos"));

console.log("All Reel Mode video prompt tests PASSED successfully!");
