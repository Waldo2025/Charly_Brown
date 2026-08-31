import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");
const generationStart = source.indexOf("async function generateAssessmentsWithGemini(activity)");
const generationEnd = source.indexOf("async function enforceExactlyOneVisualQuestion", generationStart);
const generation = source.slice(generationStart, generationEnd);

test("la generación de preguntas no inserta fallbacks curriculares", () => {
  assert.ok(generationStart >= 0 && generationEnd > generationStart);
  assert.doesNotMatch(generation, /buildScheduledFallbackAssessment/);
  assert.doesNotMatch(generation, /curriculum-fallback/);
  assert.match(generation, /finalized\.generationSource = "gemini"/);
  assert.match(generation, /assessment\?\.generationSource !== "gemini"/);
  assert.match(generation, /No se añadieron preguntas fallback/);
  assert.match(source, /assessmentHash\(String\(activity\.experiencePrompt \|\| ""\)\)/);
});

test("los lotes incompletos reintentan, omiten la posición inválida y conservan lo generado", () => {
  assert.match(generation, /while \(levelDrafts\[levelIndex\]\.length < questionsPerLevel && attempts < maxAttempts\)/);
  assert.match(generation, /requestAssessmentLevel\([\s\S]*?retryFeedback\)/);
  assert.match(generation, /Nivel completado omitiendo preguntas inválidas/);
  assert.match(generation, /const effectiveQuestionsPerLevel = Math\.min/);
  assert.match(generation, /activity\.questionsPerLevel = effectiveQuestionsPerLevel/);
  assert.match(generation, /Cantidad de preguntas ajustada a las respuestas válidas/);
  assert.match(generation, /assessment\.generationSource !== "gemini"/);
  assert.match(generation, /isTransientAssessmentGenerationError\(error\)/);
  assert.match(generation, /attempts -= 1/);
  assert.match(generation, /Se conservaron \$\{levelDrafts\[levelIndex\]\.length\} de \$\{questionsPerLevel\} preguntas/);
  assert.match(generation, /const storedPlannedType = String\(assessment\.plannedType \|\| ""\)/);
  assert.match(generation, /const storedPlannedTypeAllowed = storedPlannedType/);
  assert.match(generation, /typeSchedule\[globalIndex\] = scheduledType/);
  assert.match(generation, /Último rechazo:/);
  assert.match(generation, /const maxRejectedAttemptsPerType = 2/);
  assert.match(generation, /nextQuestionTypeAfterRejection\(activity, failedType, slotIndex, skippedTypes\)/);
  assert.match(generation, /Tipo de pregunta omitido tras varios rechazos/);
  assert.doesNotMatch(generation, /await deleteGenerationDraft\(draftKey\)/);
  assert.match(source, /await renderGame\(\);[\s\S]*?if \(completedAssessmentDraftKey\) \{[\s\S]*?await deleteGenerationDraft\(completedAssessmentDraftKey\)/);
});

test("una pregunta para imagen no bloquea el lote y se adapta en la fase visual", () => {
  assert.match(generation, /const deferVisualRepair = scheduledType === "image-multiple"/);
  assert.match(generation, /visualCompatible \|\| deferVisualRepair/);
  assert.match(generation, /Pregunta visual aceptada para adaptación posterior/);
  const visualStart = source.indexOf("async function ensureSingleVisualQuestion(activity, assessments = [])");
  const visualEnd = source.indexOf("async function generateAssessmentsWithGemini(activity)", visualStart);
  const visualPreparation = source.slice(visualStart, visualEnd);
  assert.match(visualPreparation, /buildConcreteVisualAssessment\(activity, source, selectedIndex\)/);
});

test("cada petición exige a Gemini exactamente el tamaño del lote", () => {
  assert.match(source, /function buildCompactAssessmentGenerationSchema\(activity, scheduledTypes = \[\], questionsNeeded = 1\)/);
  assert.match(source, /const responseSchema = buildCompactAssessmentGenerationSchema\(activity, scheduledTypes, questionsNeeded\)/);
  assert.match(source, /minItems: questionsNeeded/);
  assert.match(source, /maxItems: questionsNeeded/);
  assert.match(source, /responseMimeType: "application\/json",\s*responseSchema,/);
  assert.match(source, /delete requestOptions\.body\.payload\.generationConfig\.responseSchema/);
  assert.match(source, /const batchSize = 1/);
  assert.match(source, /reintentando la misma pregunta como JSON sin esquema/);
  assert.match(source, /for \(let jsonAttempt = 1; jsonAttempt <= 3; jsonAttempt \+= 1\)/);
  assert.match(source, /La respuesta anterior fue JSON inválido o quedó incompleta/);
  assert.match(source, /Gemini no devolvió JSON completo después de 3 intentos/);
  assert.match(source, /async function requestAssessmentGeminiWithRetry\(requestOptions\)/);
  assert.match(source, /networkAttempt < 3/);
  assert.match(source, /properties\.correctValue = \{ type: "integer", minimum: 0, maximum: 30 \}/);
  assert.match(source, /properties\.tolerance = \{ type: "number", minimum: 0, maximum: 0 \}/);
  assert.doesNotMatch(source, /properties\.tolerance = \{ type: "number", enum: \[0\] \}/);
  assert.match(source, /REGLA NUMÉRICA OBLIGATORIA/);
  assert.match(source, /numeric-answer debe ser un conteo directo/);
  assert.match(source, /\[429, 500, 502, 503, 504\]\.includes\(status\)/);
  assert.match(source, /const generationDraftMemoryCache = new Map\(\)/);
  assert.doesNotMatch(source.slice(source.indexOf("function shuffledQuestionTypes"), source.indexOf("const STEM_MODEL_REGISTRY")), /Math\.random/);
  assert.match(source, /REQUISITO DE IMAGEN: devuelve type multiple/);
  assert.match(source, /Cada opción debe tener máximo 8 palabras/);
});

test("la cantidad configurada se captura al iniciar y gobierna el total final", () => {
  assert.match(source, /const requestedLevelCount = positiveInteger\(\$\("#gameLevelCount"\)\.value, 1\)/);
  assert.match(source, /const MAX_QUESTIONS_PER_LEVEL = 15/);
  assert.match(source, /function configuredQuestionsPerLevel\(value, fallback = 3\)/);
  assert.match(source, /const requestedQuestionsPerLevel = configuredQuestionsPerLevel\(\$\("#questionsPerLevel"\)\.value, 1\)/);
  assert.match(source, /\$\("#questionsPerLevel"\)\.value = String\(requestedQuestionsPerLevel\)/);
  assert.match(source, /state\.activity\.levelCount = requestedLevelCount/);
  assert.match(source, /state\.activity\.questionsPerLevel = requestedQuestionsPerLevel/);
  assert.match(source, /questionSourcePolicy: isSimulator \? "simulator" : "gemini-only-v1"/);
});

test("la validación posterior tampoco reemplaza duplicados Gemini con contenido local", () => {
  assert.match(source, /const geminiOnly = activity\.generation\?\.questionSourcePolicy === "gemini-only-v1"/);
  assert.match(source, /if \(geminiOnly\) throw new Error\(`Gemini repitió la pregunta/);
  assert.match(source, /if \(geminiOnly && assessment\.generationSource !== "gemini"\)/);
});

test("una respuesta Gemini sin opción múltiple se normaliza para la imagen sin cancelar la actividad", () => {
  const visualStart = source.indexOf("async function ensureSingleVisualQuestion(activity, assessments = [])");
  const visualEnd = source.indexOf("async function generateAssessmentsWithGemini(activity)", visualStart);
  const visualPreparation = source.slice(visualStart, visualEnd);
  assert.match(visualPreparation, /selectedIndex = Math\.max\(0, Math\.min\(assessments\.length - 1, preferredIndex\)\)/);
  assert.match(visualPreparation, /buildConcreteVisualAssessment\(activity, source, selectedIndex\)/);
  assert.match(visualPreparation, /repaired\.generationSource = source\?\.generationSource \|\| "gemini"/);
  assert.doesNotMatch(visualPreparation, /No se insertó una pregunta fallback/);
  assert.match(source, /compatible\.push\(\{ assessment: repaired, index: repairIndex \}\)/);
  const enforcementStart = source.indexOf("async function enforceExactlyOneVisualQuestion(activity, assessments = [])");
  const enforcementEnd = source.indexOf("async function generateWithGemini", enforcementStart);
  const enforcement = source.slice(enforcementStart, enforcementEnd);
  assert.doesNotMatch(enforcement, /throw new Error\(`No se pudo generar la imagen obligatoria/);
  assert.match(enforcement, /visualQuestion\.type = "multiple"/);
  assert.match(enforcement, /delete visualQuestion\.visual/);
  assert.match(enforcement, /Pregunta visual omitida sin cancelar el videojuego/);
});

test("la generación registra cada etapa y el progreso por pregunta sin exponer el prompt", () => {
  assert.match(source, /function beginScienceGenerationTrace\(details = \{\}\)/);
  assert.match(source, /function logScienceGenerationStep\(label, details = \{\}, level = "info"\)/);
  assert.match(source, /Paso \$\{String\(scienceGenerationTrace\.step\)\.padStart\(2, "0"\)\}/);
  assert.match(source, /"Solicitando diseño base del videojuego"/);
  assert.match(source, /"Guía pedagógica y personaje preparados"/);
  assert.match(source, /"Pregunta aceptada"/);
  assert.match(source, /"Pregunta rechazada por validación"/);
  assert.match(source, /"Borrador parcial actualizado"/);
  assert.match(source, /"Preview interactivo renderizado"/);
  assert.match(source, /finishScienceGenerationTrace\("success"/);
  assert.match(source, /finishScienceGenerationTrace\("error"/);
  assert.doesNotMatch(source, /logScienceGenerationStep\([^\n]+experiencePrompt/);
});
