import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildInteractionPlan } from "../public/js/escape-room-interaction-plan.mjs";

const html = await readFile(new URL("../public/PigPenCreator.html", import.meta.url), "utf8");
const source = await readFile(new URL("../public/js/PigPenCreator.js", import.meta.url), "utf8");

test("question count has no artificial maximum", () => {
  assert.doesNotMatch(html, /id="preguntasPorSalaInput"[^>]*max=/);
  assert.doesNotMatch(source, /preguntasPorSala\s*>\s*6|Math\.min\(6,\s*questionCount\)/);
  const plan = buildInteractionPlan(2, 12, "unlimited-questions");
  assert.ok(plan.every((types) => types.length === 12));
  assert.ok(plan.every((types) => types.filter((type) => type === "drag_drop").length <= 1));
  assert.ok(plan.every((types) => types.every((type, index) => index === 0 || type !== types[index - 1])));
});

test("duration and briefing depth scale with the real question count", () => {
  assert.doesNotMatch(html, /id="duracionInput"[^>]*readonly/);
  assert.match(html, /id="duracionInput"[^>]*data-duration-mode="auto"/);
  assert.match(source, /calculateEstimatedDurationMinutes/);
  assert.match(source, /total \+ \(Array\.isArray\(mission\?\.preguntas\) \? mission\.preguntas\.length : 0\)/);
  assert.match(source, /evidenceCount \* 35/);
  assert.match(source, /evidenceCount \* 55/);
  assert.match(source, /al menos \$\{requiredEvidenceCount\} datos_clave distintos/);
});

test("manual duration reaches the preview and export materialization", () => {
  const materializeStart = source.indexOf("function materializeProjectForExport()");
  const materializeEnd = source.indexOf("function renderJsonPreview()", materializeStart);
  const materializeSource = source.slice(materializeStart, materializeEnd);
  assert.match(materializeSource, /durationInput\?\.dataset\.durationMode === "manual"/);
  assert.match(materializeSource, /duracion_minutos: durationMinutes/);
  assert.doesNotMatch(materializeSource, /duracion_minutos: estimatedDuration/);
  assert.match(
    source,
    /const markDurationAsManual = \(\) => \{[\s\S]*durationMode = "manual";[\s\S]*scheduleOutputRefresh\(\)/,
    "Editar la duración debe reconstruir inmediatamente el JSON y el contador del preview."
  );
});
