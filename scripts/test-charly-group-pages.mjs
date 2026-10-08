import test from "node:test";
import assert from "node:assert/strict";
import { createEmptySession, createStore } from "../public/charly-brown/state.js";
import charlyMcp from "../functions/src/charly-brown-mcp.js";

test("actividad, recurso y nota se aprueban en cualquier orden y se enlazan", () => {
  const store = createStore(createEmptySession({ id: "group-session" }));
  const unit = store.createUnit({ unit: "2", subtopic: "El agua" });
  const base = { targetUnitId: unit.id, baseRevision: unit.revision, action: "create", subtopic: "El agua" };
  const note = { ...base, id: "note-proposal", contentType: "teacher-note", title: "Explorar el agua", html: "<h3>Explorar el agua</h3><p>Guíe al grupo.</p>", artifact: { noteMode: "source", sourceActivityProposalId: "activity-proposal", pagePlacement: "add" } };
  const resource = { ...base, id: "resource-proposal", contentType: "worksheet", title: "Ficha del agua", html: "<p>Observa.</p>", artifact: { sourceActivityProposalId: "activity-proposal" } };
  const activity = { ...base, id: "activity-proposal", contentType: "activity", title: "Explorar el agua", html: "<div class=\"activity\">Observa</div>", artifact: { pagePlacement: "add" } };
  for (const proposal of [activity, resource, note]) store.addProposal(proposal);
  assert.equal(store.applyContentProposal(note).ok, true);
  assert.equal(store.applyContentProposal(resource).ok, true);
  assert.equal(store.getState().session.accepted.teacherNotes[0].activityId, "");
  assert.equal(store.applyContentProposal(activity).ok, true);
  const approved = store.getState().session.accepted;
  const approvedActivity = approved.activities.find((item) => item.sourceProposalId === activity.id);
  assert.equal(approved.resources[0].activityId, approvedActivity.id);
  assert.equal(approved.teacherNotes[0].activityId, approvedActivity.id);
});

test("añadir conserva páginas previas y la propuesta SyA conserva el original", () => {
  const store = createStore(createEmptySession({ id: "pages-session" }));
  const unit = store.createUnit({ unit: "2", subtopic: "El agua" });
  const original = { Agua_T: "Agua", Agua_AE: "Observa", Agua_C: "Estados", Agua_P: "Compara" };
  store.patchSession({ sya: original, syaOriginal: original, accepted: { ...store.getState().session.accepted, sya: original, syaOriginal: original } });
  const first = { id: "first", targetUnitId: unit.id, baseRevision: 0, action: "create", contentType: "activity", title: "Página 1", subtopic: "El agua", html: "<p>Uno</p>" };
  assert.equal(store.applyContentProposal(first).ok, true);
  const second = { ...first, id: "second", title: "Página 2", html: "<p>Dos</p>", artifact: { pagePlacement: "add" } };
  assert.equal(store.applyContentProposal(second).ok, true);
  assert.equal(store.getState().session.accepted.activities.filter((item) => item.sourceProposalId === "first" || item.sourceProposalId === "second").length, 2);
  const revised = { ...original, Agua_T: "El agua en mi comunidad", Rio_T: "Río", Rio_AE: "Explora", Rio_C: "Cauce", Rio_P: "Observa", __subtopics: { Rio: { name: "Río", category: "Conocimiento del medio" } } };
  const syaProposal = { id: "sya-change", targetUnitId: unit.id, action: "create", contentType: "sya", artifact: { sya: revised, previousSya: original } };
  assert.equal(store.applyContentProposal(syaProposal).ok, true);
  assert.deepEqual(store.getState().session.syaOriginal, original);
  assert.deepEqual(store.getState().session.sya, revised);
});

test("aprobar dos veces la misma propuesta no duplica la página", () => {
  const store = createStore(createEmptySession({ id: "idempotent-pages" }));
  const unit = store.createUnit({ unit: "1", subtopic: "Gramática" });
  const proposal = { id: "new-page", targetUnitId: unit.id, action: "create", contentType: "activity", title: "Cohesión", subtopic: "Gramática", html: "<p>Completa</p>", artifact: { pagePlacement: "add" } };
  store.addProposal(proposal);
  assert.equal(store.applyContentProposal(proposal).ok, true);
  assert.equal(store.applyContentProposal(proposal).ok, false);
  assert.equal(store.getState().session.accepted.activities.filter((item) => item.sourceProposalId === proposal.id).length, 1);
});

test("actividad aprobada primero recibe después recurso y nota vinculados", () => {
  const store = createStore(createEmptySession({ id: "activity-first" }));
  const unit = store.createUnit({ unit: "3", subtopic: "Ríos" });
  const activity = { id: "pending-river", targetUnitId: unit.id, action: "create", contentType: "activity", title: "Ríos", subtopic: "Ríos", html: "<p>Compara ríos</p>", artifact: { pagePlacement: "add" } };
  assert.equal(store.applyContentProposal(activity).ok, true);
  const linkedId = store.getState().session.accepted.activities.find((item) => item.sourceProposalId === activity.id).id;
  const note = { ...activity, id: "pending-river-note", contentType: "teacher-note", artifact: { noteMode: "source", sourceActivityProposalId: activity.id, pagePlacement: "add" } };
  const resource = { ...activity, id: "pending-river-resource", contentType: "annex", artifact: { sourceActivityProposalId: activity.id } };
  assert.equal(store.applyContentProposal(note).ok, true);
  assert.equal(store.applyContentProposal(resource).ok, true);
  assert.equal(store.getState().session.accepted.teacherNotes[0].activityId, linkedId);
  assert.equal(store.getState().session.accepted.resources[0].activityId, linkedId);
});

test("la elección de recursos conserva la ubicación confirmada en el turno anterior", () => {
  const messages = [
    { role: "user", text: "Crea una actividad y nota del maestro a partir de este texto" },
    { role: "assistant", text: "Para preparar la nota del maestro, indícame la unidad y el subtema" },
    { role: "user", text: "Unidad 2, subtema: El agua" },
    { role: "assistant", text: "Antes de crear el grupo de actividad, recursos y nota, recomiendo Ficha de refuerzo" }
  ];
  const setup = charlyMcp.groupCreationSetup("Ficha de refuerzo y añadir todas", {
    unit: { meta: { unit: "2", subtopic: "Otro tema" }, accepted: { activities: [], resources: [], teacherNotes: [] } }, messages
  });
  assert.match(setup.request, /subtema: El agua/);
  assert.deepEqual(setup.selected, ["worksheet"]);
});

test("una propuesta SyA antigua no pisa una edición aprobada después", () => {
  const store = createStore(createEmptySession({ id: "sya-conflict" }));
  const unit = store.createUnit({ unit: "1", subtopic: "Agua" });
  const original = { Agua_T: "Agua", Agua_AE: "Observa", Agua_C: "Estados", Agua_P: "Compara" };
  store.patchSession({ sya: original, accepted: { ...store.getState().session.accepted, sya: original } });
  const proposal = { targetUnitId: unit.id, action: "create", contentType: "sya", artifact: { previousSya: original, sya: { ...original, Agua_T: "Agua nueva" } } };
  assert.equal(store.applyContentProposal({ ...proposal, id: "first" }).ok, true);
  assert.equal(store.applyContentProposal({ ...proposal, id: "stale" }).ok, false);
  assert.equal(store.getState().session.sya.Agua_T, "Agua nueva");
});
