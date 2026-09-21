const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

function vocabularyContract() {
  const context = vm.createContext({});
  vm.runInContext(read("public/MarcieBlogEditor/js/services/marcie-vocabulary.js").replace(/\bexport /g, ""), context);
  return context;
}

test("the editable vocabulary library starts with the human editor terms", () => {
  const contract = vocabularyContract();
  const terms = contract.readEditorialVocabulary({ getItem: () => null });
  assert.ok(terms.length >= 65);
  for (const term of ["Neuroplasticidad", "Control inhibitorio", "Diseño Universal para el Aprendizaje", "Cerebro en desarrollo"]) {
    assert.ok(terms.includes(term), term);
  }
});

test("vocabulary normalization deduplicates terms and persists a growing library", () => {
  const contract = vocabularyContract();
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const saved = contract.saveEditorialVocabulary("Atención\natencion\nNueva expresión editorial", storage);
  assert.deepEqual(Array.from(saved), ["Atención", "Nueva expresión editorial"]);
  assert.deepEqual(Array.from(contract.readEditorialVocabulary(storage)), ["Atención", "Nueva expresión editorial"]);
});

test("vocabulary is preferred only when pertinent instead of being inserted by quota", () => {
  const contract = vocabularyContract();
  const instruction = contract.buildEditorialVocabularyInstruction(["Neuroplasticidad", "Memoria"]);
  assert.match(instruction, /naturales, pertinentes para el tema/);
  assert.match(instruction, /No insertes palabras por cuota/);

  const modal = read("public/MarcieBlogEditor/js/components/modals.js");
  const router = read("public/MarcieBlogEditor/js/services/marcie-mode-service.js");
  const gemini = read("public/MarcieBlogEditor/js/services/marcie-gemini-service.js");
  const sessionStore = read("public/MarcieBlogEditor/js/services/marcie-session-store.js");
  assert.match(modal, /id="editorial-vocabulary-section"/);
  assert.match(modal, /id="editorial-vocabulary-input" rows="14"[^>]*h-64[^>]*resize-y[^>]*overflow-y-auto/);
  assert.match(modal, /e\.target === backdrop && backdropPressStarted/);
  assert.match(modal, /preferredVocabulary: readPreferredVocabulary\(\)/);
  assert.match(router, /buildEditorialVocabularyInstruction\(session\.preferredVocabulary/);
  assert.match(sessionStore, /preferredVocabulary: normalizeFirestoreJson/);
  assert.doesNotMatch(gemini, /amígdala, hipocampo, corteza prefrontal/);
});
