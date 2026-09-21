import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/js/PigPenCreator.js", import.meta.url), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `No se encontró ${name}.`);
  const endings = [
    source.indexOf("\n}\n\nfunction ", start),
    source.indexOf("\n}\n\nasync function ", start)
  ].filter((index) => index >= 0);
  assert.ok(endings.length, `No se pudo extraer ${name}.`);
  return source.slice(start, Math.min(...endings) + 2);
}

function normalizeBaseText(value = "") {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function createContext(functionNames) {
  const context = vm.createContext({
    assert,
    structuredClone,
    normalizeBaseText,
    normalizeString: (value = "", fallback = "") => String(value ?? "").trim() || fallback,
    normalizeGameLocale: (locale = "es-419") => locale,
    extractQuestionHintKeywords: (value = "") => [...new Set(String(value).toLowerCase().match(/[a-z]{4,}/g) || [])].slice(0, 3)
  });
  vm.runInContext(functionNames.map(extractFunction).join("\n"), context);
  return context;
}

test("hint issues are delegated to the localized AI patch without local classifiers", () => {
  assert.doesNotMatch(source, /isQuestionHintAuditIssue|isQuestionHintAnswerLeakIssue|applyTargetedHintPatches/);
  assert.match(
    source,
    /async function repairContentFromAudit[\s\S]*const modelPatchIssues = patchIssues[\s\S]*applyEditorialRepairPatch\(project, patch, modelPatchIssues\)/
  );
});

test("the editorial patch changes only the field authorized by the audit issue", () => {
  const context = createContext(["buildEditorialRepairPermissions", "applyEditorialRepairPatch"]);
  const sourceProject = {
    titulo: "Original project",
    misiones: [{
      titulo: "Original room",
      preguntas: [{
        titulo: "Original question",
        reto: "Original challenge",
        pista: "Generic hint",
        tipo_interaccion: "opcion_multiple"
      }]
    }]
  };
  const repaired = context.applyEditorialRepairPatch(sourceProject, {
    globalChanges: { titulo: "Unauthorized project title" },
    rooms: [{
      roomIndex: 0,
      changes: { titulo: "Unauthorized room title" },
      questions: [{
        questionIndex: 0,
        changes: {
          pista: "Compare the two real academic conditions in the briefing.",
          reto: "Unauthorized challenge",
          tipo_interaccion: "texto"
        }
      }]
    }]
  }, [{
    code: "generic_hint",
    message: "Generic boilerplate",
    roomIndex: 0,
    questionIndex: 0,
    field: "pista"
  }]);

  assert.equal(repaired.titulo, "Original project");
  assert.equal(repaired.misiones[0].titulo, "Original room");
  assert.equal(repaired.misiones[0].preguntas[0].reto, "Original challenge");
  assert.equal(repaired.misiones[0].preguntas[0].tipo_interaccion, "opcion_multiple");
  assert.equal(repaired.misiones[0].preguntas[0].pista, "Compare the two real academic conditions in the briefing.");
  assert.equal(sourceProject.misiones[0].preguntas[0].pista, "Generic hint");
});

test("an AI patch for an incomplete true-false challenge updates only reto", () => {
  const context = createContext(["buildEditorialRepairPermissions", "applyEditorialRepairPatch"]);
  const sourceProject = {
    idioma: "en-US",
    misiones: [{
      contexto: "The briefing establishes several facts about the water cycle for this activity.",
      datos_clave: ["Evaporation changes liquid water into water vapor using heat energy."],
      preguntas: [{
        titulo: "Evaporation check",
        reto: "Choose true or false.",
        pista: "Look at the phase change.",
        tipo_interaccion: "verdadero_falso",
        respuesta_correcta: false
      }]
    }]
  };
  const issues = [{
    code: "missing_assertion",
    message: "The true/false prompt does not state the assertion to be evaluated.",
    roomIndex: 0,
    questionIndex: 0,
    field: "reto"
  }];
  const repaired = context.applyEditorialRepairPatch(sourceProject, {
    rooms: [{
      roomIndex: 0,
      questions: [{
        questionIndex: 0,
        changes: {
          reto: "Water evaporation changes liquid water into water vapor using heat energy.",
          pista: "Unauthorized local-looking hint",
          respuesta_correcta: true
        }
      }]
    }]
  }, issues);

  assert.equal(
    repaired.misiones[0].preguntas[0].reto,
    "Water evaporation changes liquid water into water vapor using heat energy."
  );
  assert.equal(repaired.misiones[0].preguntas[0].pista, sourceProject.misiones[0].preguntas[0].pista);
  assert.equal(repaired.misiones[0].preguntas[0].respuesta_correcta, false);
  assert.equal(sourceProject.misiones[0].preguntas[0].reto, "Choose true or false.");
  assert.doesNotMatch(source, /getBooleanChallengeEvidence|buildConcreteBooleanChallenge|applyTargetedBooleanChallengePatches/);
});
