import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");
const exportRuntime = fs.readFileSync(new URL("../public/js/science-assessment-export.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../public/scienceActivities.css", import.meta.url), "utf8");

function extractedFunction(name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  assert.ok(start >= 0 && end > start, `No se encontró ${name}`);
  return source.slice(start, end);
}

const scoringHelpers = [
  "const DEFAULT_ACTIVITY = { maxPoints: 1000 };",
  extractedFunction("normalizeActivityMaxPoints", "distributeActivityAssessmentPoints"),
  extractedFunction("distributeActivityAssessmentPoints", "ensureActivityAssessments")
].join("\n");
const context = {};
vm.runInNewContext(`${scoringHelpers}\nthis.distribute = distributeActivityAssessmentPoints;`, context);

test("reparte el máximo exactamente entre todas las preguntas", () => {
  const activity = { maxPoints: 1000, assessments: Array.from({ length: 9 }, () => ({})) };
  context.distribute(activity, { force: true });
  assert.equal(activity.assessments.reduce((sum, question) => sum + question.points, 0), 1000);
  assert.deepEqual([...new Set(activity.assessments.map((question) => question.points))].sort(), [111, 112]);
});

test("conserva la edición de una pregunta y redistribuye el resto", () => {
  const activity = { maxPoints: 1000, assessments: Array.from({ length: 4 }, () => ({})) };
  context.distribute(activity, { anchorIndex: 2, anchorPoints: 400 });
  assert.equal(activity.assessments[2].points, 400);
  assert.equal(activity.assessments.reduce((sum, question) => sum + question.points, 0), 1000);
  assert.deepEqual(activity.assessments.map((question) => question.points), [200, 200, 400, 200]);
});

test("el editor, preview y ZIP usan la puntuación configurada", () => {
  assert.match(source, /id="activityMaxPoints"/);
  assert.match(source, /id="assessmentPoints"/);
  assert.match(source, /data-redistribute-assessment-points/);
  assert.match(source, /session\.assessment\?\.points/);
  assert.match(source, /function commitPendingAssessmentPoints/);
  assert.match(source, /commitPendingAssessmentPoints\(\{ updatePreview: true \}\)[\s\S]*copyScienceAnswers\(state\.activity\)/);
  assert.match(source, /async function exportPreviewProjectZip\(\) \{\s*commitPendingAssessmentPoints\(\{ updatePreview: true \}\)/);
  assert.match(source, /distributeActivityAssessmentPoints\(state\.activity, \{ force: true \}\)/);
  assert.match(exportRuntime, /currentQuestion\(\)\.points/);
  assert.match(styles, /\.sa-question-points-grid/);
});
