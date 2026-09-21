import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  normalizeObjectiveUnlockFragment,
  normalizeThematicFinalWord,
  partitionThematicFinalWord,
  resolveFixedThematicUnlock
} from "../public/js/escape-room-objective-unlock.mjs";
import {
  normalizeEscapeRoomProject,
  resolveFinalPasscode
} from "../public/js/escape-room-creator-model.mjs";

assert.equal(normalizeThematicFinalWord("482", 3), "");
assert.equal(normalizeThematicFinalWord("48A2", 3), "");
assert.equal(normalizeThematicFinalWord("SOL", 3), "SOL");
assert.equal(normalizeThematicFinalWord("bioma", 4), "BIOMA");
assert.equal(normalizeThematicFinalWord("órbita", 4), "ORBITA");
assert.equal(normalizeThematicFinalWord("MAR", 4), "", "La palabra no puede dejar salas sin fragmento.");
assert.equal(normalizeObjectiveUnlockFragment("Ñ"), "N");
assert.equal(normalizeObjectiveUnlockFragment("A2"), "");

assert.deepEqual(partitionThematicFinalWord("SOL", 3), ["S", "O", "L"]);
assert.deepEqual(partitionThematicFinalWord("BIOMA", 3), ["BI", "OM", "A"]);
assert.deepEqual(partitionThematicFinalWord("ORBITA", 4), ["OR", "BI", "T", "A"]);
assert.ok(partitionThematicFinalWord("ORBITA", 4).every((fragment) => /^[A-Z]+$/.test(fragment)));

assert.deepEqual(resolveFixedThematicUnlock({ finalCode: "482", fragments: ["4", "8", "2"], roomCount: 3 }), {
  fixedFinalCode: "",
  fixedCodeFragments: [],
  rejectedInvalidUnlock: true
});
assert.deepEqual(resolveFixedThematicUnlock({ finalCode: "SOL", fragments: ["S", "O", "L"], roomCount: 3 }), {
  fixedFinalCode: "SOL",
  fixedCodeFragments: ["S", "O", "L"],
  rejectedInvalidUnlock: false
});

const legacyProject = normalizeEscapeRoomProject({ titulo: "Legacy", clave_final: "AZ42", misiones: [] });
assert.equal(resolveFinalPasscode(legacyProject).code, "AZ42", "Los Escape Rooms antiguos deben conservar claves alfanuméricas.");

const source = await readFile(new URL("../public/js/PigPenCreator.js", import.meta.url), "utf8");
const numericFeedbackStart = source.indexOf("function objectiveFeedbackContainsNumericUnlock(");
const numericFeedbackEnd = source.indexOf("\nfunction extractObjectiveCodesAfterMarkers(", numericFeedbackStart);
const containsNumericUnlock = new Function(
  `${source.slice(numericFeedbackStart, numericFeedbackEnd)}\nreturn objectiveFeedbackContainsNumericUnlock;`
)();
assert.equal(containsNumericUnlock("Primera clave obtenida: 482."), true);
assert.equal(containsNumericUnlock("Has clasificado 3 datos. Toma S."), false);

const guardStart = source.indexOf("function inspectThematicObjectiveUnlockContract(");
const guardEnd = source.indexOf("\nfunction buildPrivateProjectShell(", guardStart);
const assertUnlockContract = new Function(
  "normalizeThematicFinalWord",
  "partitionThematicFinalWord",
  "normalizeObjectiveUnlockFragment",
  `${source.slice(guardStart, guardEnd)}\nreturn assertThematicObjectiveUnlockContract;`
)(normalizeThematicFinalWord, partitionThematicFinalWord, normalizeObjectiveUnlockFragment);
assert.equal(assertUnlockContract({ misiones: 3 }, {
  final_unlock: { code: "SOL" },
  rooms: ["S", "O", "L"].map((fixed_code_fragment) => ({ fixed_code_fragment }))
}), "SOL");
assert.throws(() => assertUnlockContract({ misiones: 3 }, {
  final_unlock: { code: "482" },
  rooms: ["4", "8", "2"].map((fixed_code_fragment) => ({ fixed_code_fragment }))
}), /palabra temática/);

const repairElements = { objectiveIdeaTextarea: { value: "" } };
const repairState = { pendingGenerationDraft: { stale: true }, pendingGenerationDraftKey: "stale" };
const ensureUnlockContract = new Function(
  "normalizeThematicFinalWord",
  "partitionThematicFinalWord",
  "normalizeObjectiveUnlockFragment",
  "updatePreviewGenerationProgress",
  "setStatus",
  "requestThematicObjectiveUnlockWord",
  "buildDeterministicFinalUnlockFeedback",
  "buildDeterministicRoomCompletionFeedback",
  "formatObjectiveBrief",
  "activateObjectiveBrief",
  "elements",
  "state",
  `${source.slice(guardStart, guardEnd)}\nreturn ensureThematicObjectiveUnlockContract;`
)(
  normalizeThematicFinalWord,
  partitionThematicFinalWord,
  normalizeObjectiveUnlockFragment,
  () => {},
  () => {},
  async () => "BIOMA",
  () => "Misión completada.",
  (_room, fragment) => `Toma ${fragment}.`,
  (blueprint) => `FINAL_CODE: ${blueprint.final_unlock.code}`,
  (blueprint) => blueprint,
  repairElements,
  repairState
);
const autoRepair = await ensureUnlockContract({ misiones: 3, idioma: "es-419" }, {
  final_unlock: { code: "482", feedback: "Clave 482 aceptada." },
  source_contract: {},
  rooms: [1, 2, 3].map((room_number) => ({ room_number, narrative_beat: {} }))
});
assert.equal(autoRepair.repaired, true);
assert.equal(autoRepair.blueprint.final_unlock.code, "BIOMA");
assert.deepEqual(autoRepair.blueprint.rooms.map((room) => room.fixed_code_fragment), ["BI", "OM", "A"]);
assert.equal(repairState.pendingGenerationDraft, null);
assert.equal(repairElements.objectiveIdeaTextarea.value, "FINAL_CODE: BIOMA");

assert.match(source, /const CONTENT_GENERATION_CONTRACT_VERSION = 28;/);
assert.match(source, /PigPenCreator\.objectiveBlueprint\.v28/);
assert.match(source, /final_unlock\.code debe ser una sola palabra temática natural/);
assert.match(source, /await requestThematicObjectiveUnlockWord\(context, foundation, roomCount, initialCode\)/);
assert.match(source, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)[\s\S]*REJECTED_CODES[\s\S]*Devuelve una palabra nueva/);
assert.match(source, /function assertThematicObjectiveUnlockContract[\s\S]*normalizeThematicFinalWord[\s\S]*fixed_code_fragment/);
assert.match(source, /async function ensureThematicObjectiveUnlockContract[\s\S]*await requestThematicObjectiveUnlockWord[\s\S]*partitionThematicFinalWord[\s\S]*activateObjectiveBrief/);
assert.match(source, /await ensureThematicObjectiveUnlockContract\(formData, objectiveBlueprint\)/);
assert.match(source, /rejected_invalid_unlock[\s\S]*repairedUnlockCode[\s\S]*objectiveFeedbackContainsNumericUnlock[\s\S]*buildDeterministicRoomCompletionFeedback/);
assert.match(source, /rejectedInvalidUnlock \? "" : extractedFinalFeedback/);
assert.match(source, /objectiveFeedbackContainsNumericUnlock\(foundation\.final_unlock\.feedback\)[\s\S]*buildDeterministicFinalUnlockFeedback/);
assert.doesNotMatch(source, /ABCDEFGHJKLMNPQRSTUVWXYZ23456789/);
assert.match(source, /payload: compatibilityMode\s*\?\s*\{[\s\S]*?contents:[\s\S]*?\}\s*:\s*\{[\s\S]*?generationConfig:/);
assert.match(source, /if \(!isGeminiInvalidArgument\(error\)\) throw error;[\s\S]*?buildRequest\(null, temperature, \{ compatibilityMode: true \}\)/);
assert.match(source, /buildRepairRequest\(\{ compatibilityMode: true \}\)/);

console.log("PigPen thematic final word OK.");
