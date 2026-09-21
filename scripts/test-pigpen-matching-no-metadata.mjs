import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { normalizePairList } from "../public/js/escape-room-creator-model.mjs";

const source = fs.readFileSync(new URL("../public/js/PigPenCreator.js", import.meta.url), "utf8");
const context = vm.createContext({ normalizePairList, normalizeObjectiveFixedText: (v) => String(v || "").trim().toLowerCase() });
vm.runInContext(source.slice(source.indexOf("function parseQuestionPlanPairStatements("), source.indexOf("function materializeGeneratedQuestionTemplate(")), context);
const pairs = [
  { izquierda: "System base: capital", derecha: "capitalism (economic system)", pista: "" },
  { izquierda: "Belief base: individual", derecha: "individualism (belief principle)", pista: "" }
];
const plan = {
  case_data: ["System base: capital", "Belief base: individual"],
  knowledge: "The suffix -ism forms nouns denoting systems.",
  evidence: "Matching bases capital and individual",
  answer_target: "capital → capitalism | individual → individualism"
};
const plain = (v) => JSON.parse(JSON.stringify(v));
assert.deepEqual(plain(context.mergeGeneratedQuestionPairs(pairs, plan, "en-US")), pairs);
assert.equal(context.mergeGeneratedQuestionPairs([], { ...plan, answer_target: "" }).length, 0);
assert.equal(context.mergeGeneratedQuestionPairs([], plan).length, 2);
assert.equal(context.mergeGeneratedQuestionPairs([...pairs, pairs[0]], plan).length, 2);
const drag = Array.from({ length: 4 }, (_, i) => ({ izquierda: `Destination ${i}`, derecha: `Tile ${i}`, pista: "" }));
assert.deepEqual(plain(context.mergeGeneratedQuestionPairs(drag, plan)), drag);
assert.equal(context.mergeGeneratedQuestionPairs([{ izquierda: "", derecha: "" }], plan).length, 2);
console.log("Matching regression OK: no duplicated cases or metadata pairs; authored drag pairs preserved.");
