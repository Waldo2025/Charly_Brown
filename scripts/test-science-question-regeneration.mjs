import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../public/scienceActivities.css", import.meta.url), "utf8");
const page = await readFile(new URL("../public/scienceActivities.html", import.meta.url), "utf8");

test("el panel ofrece regeneración completa junto a la eliminación", () => {
  assert.match(source, /data-regenerate-assessment/);
  assert.match(source, /Regenerar pregunta/);
  assert.match(source, /Regenerar esta pregunta, sus respuestas y su imagen si aplica/);
  assert.match(styles, /\.sa-question-regenerate-button/);
  assert.match(styles, /\.sa-question-action-group/);
});

test("la fila tech-minimal es compacta y confirma antes de eliminar", () => {
  assert.match(source, /class="sa-question-position"><strong>Pregunta \$\{state\.contentQuestionIndex \+ 1\}<\/strong><small>de \$\{assessments\.length\}<\/small>/);
  assert.match(source, /class="sa-question-delete-button"[\s\S]*?title="Eliminar pregunta"/);
  assert.doesNotMatch(source, /class="sa-question-delete-button"[^>]*>[\s\S]*?<span>Eliminar pregunta<\/span>/);
  assert.match(styles, /\.sa-question-action-group>button\{height:34px/);
  assert.match(styles, /\.sa-question-delete-button\{width:34px/);
  const deleteStart = source.indexOf('const deleteAssessment = event.target.closest("[data-delete-assessment]")');
  const deleteEnd = source.indexOf('const timelineAction = event.target.closest("[data-timeline-action]")', deleteStart);
  const deletion = source.slice(deleteStart, deleteEnd);
  assert.match(deletion, /window\.confirm\(\[/);
  assert.match(deletion, /¿Eliminar la pregunta \$\{deletedIndex \+ 1\}\?/);
  assert.match(deletion, /Esta acción no se puede deshacer/);
  assert.ok(deletion.indexOf("if (!confirmed) return") < deletion.indexOf("state.activity.assessments.splice"));
});

test("la regeneración conserva el tipo y solicita una sola pregunta nueva a Gemini", () => {
  const start = source.indexOf("async function regenerateCompleteAssessment(activity, assessmentIndex)");
  const end = source.indexOf("function buildVisualQuestionFromAssessment", start);
  const regeneration = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(regeneration, /const scheduledType = previousAssessment\.type === "image-multiple" \? "image-multiple"/);
  assert.match(regeneration, /requestAssessmentLevel\([\s\S]*?activity,[\s\S]*?levelIndex,[\s\S]*?1,[\s\S]*?\[scheduledType\]/);
  assert.match(regeneration, /generatedAssessmentIsComplete\(activity, prepared\)/);
  assert.match(regeneration, /existingSignatures\.has\(signature\)/);
  assert.match(regeneration, /generationSource = "gemini"/);
});

test("una pregunta visual genera y analiza una imagen nueva antes de reemplazarse", () => {
  const helperStart = source.indexOf("async function regenerateCompleteAssessment(activity, assessmentIndex)");
  const helperEnd = source.indexOf("function buildVisualQuestionFromAssessment", helperStart);
  const regeneration = source.slice(helperStart, helperEnd);
  const handlerStart = source.indexOf('const regenerateAssessmentButton = event.target.closest("[data-regenerate-assessment]")');
  const handlerEnd = source.indexOf('const deleteAssessment = event.target.closest("[data-delete-assessment]")', handlerStart);
  const handler = source.slice(handlerStart, handlerEnd);
  assert.match(regeneration, /buildVisualQuestionFromAssessment\(activity, regenerated, assessmentIndex\)/);
  assert.match(regeneration, /await regenerateVisualQuestionImage\(activity, regenerated\)/);
  assert.match(regeneration, /visualQuestionImageSource\(regenerated\)/);
  assert.match(handler, /const regeneratedAssessment = await regenerateCompleteAssessment/);
  assert.match(handler, /state\.activity\.assessments\[regenerationIndex\] = regeneratedAssessment/);
  assert.ok(handler.indexOf("await regenerateCompleteAssessment") < handler.indexOf("state.activity.assessments[regenerationIndex] = regeneratedAssessment"));
  assert.match(handler, /La pregunta anterior se conservó/);
});

test("cada regeneración crea una sola imagen y realiza un solo análisis con opciones canónicas", () => {
  const visualStart = source.indexOf("async function regenerateVisualQuestionImage(activity, assessment)");
  const visualEnd = source.indexOf("async function ensureSingleVisualQuestion", visualStart);
  const visualRegeneration = source.slice(visualStart, visualEnd);
  assert.match(visualRegeneration, /Generando única imagen de la pregunta visual/);
  assert.equal((visualRegeneration.match(/generateVisualQuestionImage\(assessment\)/g) || []).length, 1);
  assert.doesNotMatch(visualRegeneration, /maximumVisualAttempts|visualAttempt|RETRY/);
  const analysisStart = source.indexOf("async function alignVisualQuestionToGeneratedImage(activity, assessment, imageDataUrl)");
  const analysisEnd = source.indexOf("async function regenerateVisualQuestionImage", analysisStart);
  const analysis = source.slice(analysisStart, analysisEnd);
  assert.match(analysis, /OPCIONES CANÓNICAS, EN ESTE ORDEN INMUTABLE/);
  assert.match(source, /const options = assessmentList\(assessment\.options\)/);
  assert.match(source, /const observedCorrect = Number\(analysis\.correct\)/);
  assert.match(source, /const correct = observedCorrect/);
  assert.match(source, /answerAlignedFromImage: correct !== plannedCorrect/);
  assert.match(source, /const analyzedTarget = conciseVisualAnswerLabel\(analysis\.target\)/);
  assert.match(source, /given = assessmentList\(analysis\.given\)/);
  assert.match(source, /goal = String\(analysis\.goal/);
  assert.doesNotMatch(source, /if \(observedCorrect !== correct\)/);
  assert.match(analysis, /manda únicamente la evidencia visible/);
  assert.match(analysis, /la imagen es usable aunque esa opción sea distinta/);
  assert.match(analysis, /Sólo DESPUÉS de elegir correct y target/);
  assert.match(analysis, /elimina cualquier dato heredado de otra pregunta/);
  assert.equal((analysis.match(/requestAssessmentGeminiWithRetry\(requestOptions\)/g) || []).length, 1);
  assert.doesNotMatch(analysis, /maximumAnalysisAttempts|Reintentando sólo el texto del análisis visual/);
  assert.match(source, /"visual_image_ambiguous", "visual_analysis_format"/);
});

test("preview, autosave y caché se actualizan después de regenerar", () => {
  assert.match(source, /await renderGame\(\{ resetProgress: true \}\)/);
  assert.match(source, /await autosaveProject\("question-regenerated"\)/);
  assert.match(page, /scienceActivities\.bundle\.js\?v=[^"']+/);
  assert.match(page, /scienceActivities\.css\?v=[^"']+/);
});
