import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore, createEmptySession } from "../public/charly-brown/state.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Crear sesión de prueba con una unidad
const store = createStore(createEmptySession({ id: "test_session_persist_1" }));
store.createUnit({ unit: "1", title: "Unidad 1" });

// 2. Simular propuesta generada en chat
const proposal = {
  id: "prop_act_123",
  status: "pending",
  action: "create",
  contentType: "activity",
  title: "Palabras terminadas en -ía, -ían",
  subtopic: "Ortografía",
  category: "Lenguaje y comunicación",
  html: '<div class="activity"><p><strong>Localiza en la sopa de letras.</strong> [IC. T. IND]</p></div>',
  createdBy: "charly-mcp"
};

store.addProposal(proposal);

// 3. Aplicar propuesta (simulando click en 'Aceptar')
const outcome = store.applyContentProposal(proposal);
assert.equal(outcome.ok, true, "applyContentProposal debe retornar ok: true");

const activeUnit = store.getState().session.units.find(u => u.id === store.getState().session.activeUnitId);
const approved = activeUnit.accepted.activities.find(a => a.sourceProposalId === proposal.id || a.subtopic === "Ortografía");

assert.ok(approved, "La actividad aprobada debe estar en activeUnit.accepted.activities");
assert.equal(approved.title, "Palabras terminadas en -ía, -ían");
assert.ok(approved.html.includes("Localiza en la sopa de letras"), "Debe conservar el HTML");

// 4. Verificar sessions-store.js y main.js para persistencia sin pérdida de actividades
const sessionsStoreCode = fs.readFileSync(path.join(dirname, "../public/charly-brown/sessions-store.js"), "utf8");
const mainCode = fs.readFileSync(path.join(dirname, "../public/charly-brown/main.js"), "utf8");

assert.match(sessionsStoreCode, /removeUndefinedRecursively/, "sessions-store.js debe sanitizar valores undefined");
assert.match(sessionsStoreCode, /cb_session_cache_/, "sessions-store.js debe persistir respaldo en localStorage");
assert.match(mainCode, /Preservar actividades y recursos recién aprobados/, "main.js debe reconciliar actividades aprobadas");
assert.match(mainCode, /activitySaved = await saveSession\(store\.getState\(\)\.session\)/, "main.js debe incluir respaldo directo de guardado tras aprobar actividad");

console.log("Accepted activity persistence test passed successfully!");
