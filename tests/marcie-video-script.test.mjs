import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  SCENE_DURATION_SECONDS,
  MIN_VOICEOVER_WORDS,
  MAX_VOICEOVER_WORDS,
  VIDEO_AUDIENCE_OPTIONS,
  getVideoAudienceMeta,
  formatSceneTime,
  countWords,
  validateVoiceover,
  buildVideoScriptPrompt,
  normalizeVideoScene,
  normalizeVideoScript,
  getSessionVideoScripts,
  upsertVideoScriptInSession,
  removeVideoScriptFromSession,
  buildVideoScriptClipboardText
} from "../public/MarcieBlogEditor/js/services/marcie-video-script-service.js";

test("Marcie Video Script - SCENE_DURATION_SECONDS es exactamente 8 segundos", () => {
  assert.equal(SCENE_DURATION_SECONDS, 8);
  assert.equal(MIN_VOICEOVER_WORDS, 14);
  assert.equal(MAX_VOICEOVER_WORDS, 17);
});

test("Marcie Video Script - formatSceneTime calcula rangos de 8 segundos por escena", () => {
  assert.equal(formatSceneTime(1, 8), "0:00–0:08");
  assert.equal(formatSceneTime(2, 8), "0:08–0:16");
  assert.equal(formatSceneTime(3, 8), "0:16–0:24");
  assert.equal(formatSceneTime(4, 8), "0:24–0:32");
  assert.equal(formatSceneTime(5, 8), "0:32–0:40");
  assert.equal(formatSceneTime(6, 8), "0:40–0:48");
  assert.equal(formatSceneTime(7, 8), "0:48–0:56");
  assert.equal(formatSceneTime(8, 8), "0:56–1:04");
  assert.equal(formatSceneTime(9, 8), "1:04–1:12");
  assert.equal(formatSceneTime(10, 8), "1:12–1:20");
});

test("Marcie Video Script - countWords cuenta palabras correctamente", () => {
  assert.equal(countWords(""), 0);
  assert.equal(countWords("   "), 0);
  assert.equal(countWords("Una dos tres"), 3);
  assert.equal(countWords("  Palabra con múltiples   espacios   intermedios  "), 5);
});

test("Marcie Video Script - validateVoiceover valida el rango estricto de 14 a 17 palabras", () => {
  // 15 palabras (óptimo)
  const idealText = "Hoy descubriremos cómo la neuroeducación transforma la motivación de cada estudiante en el aula escolar.";
  const idealRes = validateVoiceover(idealText);
  assert.equal(idealRes.count, 15);
  assert.equal(idealRes.isIdeal, true);
  assert.equal(idealRes.isTooLong, false);
  assert.equal(idealRes.isTooShort, false);

  // 10 palabras (demasiado corto)
  const shortText = "Esta es una frase corta con muy pocas palabras totales.";
  const shortRes = validateVoiceover(shortText);
  assert.equal(shortRes.count, 10);
  assert.equal(shortRes.isIdeal, false);
  assert.equal(shortRes.isTooShort, true);

  // 20 palabras (demasiado largo)
  const longText = "Esta es una frase excesivamente larga que supera el límite máximo estipulado de diecisiete palabras para cada escena audiovisual producida.";
  const longRes = validateVoiceover(longText);
  assert.equal(longRes.count, 20);
  assert.equal(longRes.isIdeal, false);
  assert.equal(longRes.isTooLong, true);
});

test("Marcie Video Script - buildVideoScriptPrompt incluye las 7 columnas y las restricciones", () => {
  const prompt = buildVideoScriptPrompt({
    topic: "Evaluación Formativa",
    articleTitle: "Estrategias de Evaluación Formativa en el Aula",
    articleSummary: "Metodologías para retroalimentar en tiempo real a los alumnos.",
    audience: "educators",
    audienceLabel: "Docentes y directivos",
    sceneCount: 8
  });

  // Verificar especificaciones
  assert.ok(prompt.includes("8 segundos"), "Debe mencionar la duración de 8 segundos");
  assert.ok(prompt.includes("14 a 17 palabras"), "Debe exigir entre 14 y 17 palabras");
  assert.ok(prompt.includes("NUNCA cortes una frase a la mitad"), "Debe instruir el no cortar frases");
  assert.ok(prompt.includes("0:00–0:08"), "Debe incluir el formato de tiempo inicial");

  // Verificar las 7 columnas en las instrucciones
  assert.ok(prompt.includes("sceneNumber") || prompt.includes("Escena"), "Columna 1: Escena");
  assert.ok(prompt.includes("time") || prompt.includes("Tiempo"), "Columna 2: Tiempo");
  assert.ok(prompt.includes("voiceover") || prompt.includes("Guion"), "Columna 3: Guion");
  assert.ok(prompt.includes("sceneDescription") || prompt.includes("Descripción de escena"), "Columna 4: Descripción");
  assert.ok(prompt.includes("onScreenText") || prompt.includes("Texto en pantalla"), "Columna 5: Texto en pantalla");
  assert.ok(prompt.includes("transition") || prompt.includes("Transición"), "Columna 6: Transición");
  assert.ok(prompt.includes("visualElement") || prompt.includes("Elemento visual"), "Columna 7: Elemento visual");
});

test("Marcie Video Script - buildVideoScriptPrompt adapta el tono por público", () => {
  const promptEducators = buildVideoScriptPrompt({ audience: "educators", audienceLabel: "Docentes" });
  assert.ok(promptEducators.includes("Docentes y directivos"));
  assert.ok(promptEducators.includes("pedagógico"));

  const promptParents = buildVideoScriptPrompt({ audience: "parents", audienceLabel: "Padres" });
  assert.ok(promptParents.includes("Padres y familias"));
  assert.ok(promptParents.includes("hogar"));

  const promptStudents = buildVideoScriptPrompt({ audience: "students", audienceLabel: "Estudiantes" });
  assert.ok(promptStudents.includes("Estudiantes"));
  assert.ok(promptStudents.includes("dinámico"));

  const promptCoordinators = buildVideoScriptPrompt({ audience: "coordinators", audienceLabel: "Coordinadores" });
  assert.ok(promptCoordinators.includes("Coordinadores académicos"));
  assert.ok(promptCoordinators.includes("institucional"));
});

test("Marcie Video Script - buildVideoScriptPrompt exige estilo formal, científico y pregunta detonante", () => {
  const prompt = buildVideoScriptPrompt({
    topic: "Neurociencia Educativa",
    audience: "educators",
    audienceLabel: "Docentes"
  });

  assert.ok(prompt.includes("FORMAL, CIENTÍFICO Y EDUCATIVO"), "Debe exigir registro formal y científico");
  assert.ok(prompt.includes("PROHIBICIÓN TOTAL DE INFORMALIDAD"), "Debe prohibir informalidad");
  assert.ok(prompt.includes("PREGUNTA DETONANTE"), "Debe exigir pregunta detonante en la escena 1");
  assert.ok(prompt.includes("Escena 1: 0:00–0:08 (Pregunta detonante obligatoria)"), "Debe marcar la escena 1 con pregunta detonante");
});

test("Marcie Video Script - normalizeVideoScene asegura las 7 columnas y tiempo", () => {
  const scene = normalizeVideoScene({
    voiceover: "Texto de la locución que dura exactamente ocho segundos completos en pantalla.",
    descripcion_de_escena: "Plano medio del docente en el aula.",
    texto_en_pantalla: "Evaluación activa",
    elemento_visual: "El docente señala la pizarra digital interactiva."
  }, 0);

  assert.equal(scene.sceneNumber, 1);
  assert.equal(scene.time, "0:00–0:08");
  assert.equal(scene.voiceover, "Texto de la locución que dura exactamente ocho segundos completos en pantalla.");
  assert.equal(scene.sceneDescription, "Plano medio del docente en el aula.");
  assert.equal(scene.onScreenText, "Evaluación activa");
  assert.equal(scene.transition, "Corte directo");
  assert.equal(scene.visualElement, "El docente señala la pizarra digital interactiva.");
});

test("Marcie Video Script - gestión de sesión (upsert, get, remove)", () => {
  const session = {
    id: "sess-1",
    title: "Innovación en el Aula"
  };

  assert.equal(getSessionVideoScripts(session).length, 0);

  const script1 = normalizeVideoScript({
    id: "script-edu-1",
    audience: "educators",
    title: "Guión Docentes",
    scenes: [
      { voiceover: "Frase 1" },
      { voiceover: "Frase 2" }
    ]
  });

  upsertVideoScriptInSession(session, script1);
  assert.equal(getSessionVideoScripts(session).length, 1);
  assert.equal(session.videoScriptsByAudience.educators.id, "script-edu-1");

  const script2 = normalizeVideoScript({
    id: "script-parents-1",
    audience: "parents",
    title: "Guión Padres",
    scenes: [
      { voiceover: "Padres frase 1" }
    ]
  });

  upsertVideoScriptInSession(session, script2);
  assert.equal(getSessionVideoScripts(session).length, 2);

  // Clipboard export
  const tsv = buildVideoScriptClipboardText(script1);
  assert.ok(tsv.includes("Escena\tTiempo\tGuion"));

  // Remove
  removeVideoScriptFromSession(session, "script-edu-1");
  assert.equal(getSessionVideoScripts(session).length, 1);
  assert.equal(session.videoScriptsByAudience.educators, undefined);
  assert.equal(session.videoScriptsByAudience.parents.id, "script-parents-1");
});

test("Marcie Video Script - buildVideoScriptHtmlTable genera una tabla compatible con Excel", async () => {
  const { buildVideoScriptHtmlTable } = await import("../public/MarcieBlogEditor/js/services/marcie-video-script-service.js");
  const script = normalizeVideoScript({
    title: "Video Prueba",
    scenes: [
      {
        voiceover: "Bienvenidos al curso de innovación pedagógica.",
        sceneDescription: "Plano general del aula.",
        onScreenText: "Innovación 2026",
        transition: "Corte directo",
        visualElement: "Logo en animación."
      }
    ]
  });

  const html = buildVideoScriptHtmlTable(script);
  assert.ok(html.includes("<table"), "Debe generar una etiqueta <table>");
  assert.ok(html.includes("border=\"1\""), "Debe tener borde para Excel");
  assert.ok(html.includes("Guion (Voz en off)"), "Debe contener el encabezado de guion");
  assert.ok(html.includes("0:00–0:08"), "Debe incluir el tiempo de la escena");
  assert.ok(html.includes("Bienvenidos al curso de innovación pedagógica."), "Debe incluir el texto de la locución");
});

test("MarcieBlogEditor.html contiene los botones de guión de video y retira el del header", async () => {
  const html = await readFile(new URL("../public/MarcieBlogEditor.html", import.meta.url), "utf8");

  // Botón Crear Guión en editorial-actions-grid
  assert.ok(html.includes('id="btn-create-video-script"'), "Debe contener id='btn-create-video-script'");
  assert.ok(html.includes('Crear Guión'), "Debe tener texto 'Crear Guión'");

  // Botón con icono de video para ver guiones cuando ya existan en el grid
  assert.ok(html.includes('id="btn-view-video-scripts-grid"'), "Debe contener id='btn-view-video-scripts-grid'");

  // El botón del header fue removido por solicitud de diseño
  assert.ok(!html.includes('id="btn-view-video-scripts-header"'), "NO debe contener id='btn-view-video-scripts-header'");

  // Opciones en el menú desplegable del artículo
  assert.ok(html.includes('id="opt-create-video-script"'), "Debe contener id='opt-create-video-script'");
  assert.ok(html.includes('id="opt-view-video-scripts"'), "Debe contener id='opt-view-video-scripts'");

  // Subheader responsivo con grid de públicos en dos filas
  assert.ok(html.includes('class="audience-buttons-grid'), "Debe contener audience-buttons-grid");
  assert.ok(!html.includes('id="editorial-mode-badge"'), "editorial-mode-badge fue retirado");
});

test("Marcie Video Script - ensureTriggeringQuestion garantiza pregunta detonante en todas las audiencias", async () => {
  const { ensureTriggeringQuestion } = await import("../public/MarcieBlogEditor/js/services/marcie-video-script-service.js");

  const audiences = ["educators", "students", "coordinators", "parents"];
  const declarativeStatement = "La sobrecarga cognitiva en el aula reduce drásticamente la capacidad de retención en los estudiantes";

  for (const aud of audiences) {
    const question = ensureTriggeringQuestion(declarativeStatement, aud);
    assert.ok(question.startsWith("¿"), `Audiencia ${aud} debe empezar con '¿': ${question}`);
    assert.ok(question.endsWith("?"), `Audiencia ${aud} debe terminar con '?': ${question}`);
    const wordCount = question.replace(/^¿/, "").replace(/\?$/, "").trim().split(/\s+/).length;
    assert.ok(wordCount >= 14 && wordCount <= 17, `Audiencia ${aud} debe tener entre 14 y 17 palabras (tiene ${wordCount}): ${question}`);
  }

  // Vacío usa fallback correcto
  for (const aud of audiences) {
    const question = ensureTriggeringQuestion("", aud);
    assert.ok(question.startsWith("¿") && question.endsWith("?"));
    const wordCount = question.replace(/^¿/, "").replace(/\?$/, "").trim().split(/\s+/).length;
    assert.ok(wordCount >= 14 && wordCount <= 17);
  }
});

test("Marcie Video Script - buildVideoScriptPrompt integra vocabulario preferente y reglas de pregunta", async () => {
  const { buildVideoScriptPrompt } = await import("../public/MarcieBlogEditor/js/services/marcie-video-script-service.js");

  const prompt = buildVideoScriptPrompt({
    topic: "Neurociencia del aprendizaje",
    articleTitle: "Neurociencia en el aula",
    audience: "educators",
    audienceLabel: "Docentes",
    sceneCount: 8,
    preferredVocabulary: ["andamiaje didáctico", "metacognición", "neuroplasticidad"]
  });

  assert.ok(prompt.includes("PREGUNTA DETONANTE OBLIGATORIA EN LA ESCENA 1"), "Debe exigir pregunta detonante obligatoria");
  assert.ok(prompt.includes("Docentes, Estudiantes, Coordinadores y Padres por igual"), "Debe aplicar a todos los públicos");
  assert.ok(prompt.includes("VOCABULARIO EDITORIAL PREFERENTE"), "Debe incluir sección de vocabulario preferente");
  assert.ok(prompt.includes("andamiaje didáctico"), "Debe incluir los términos preferentes");
});

test("MarcieBlogEditor.css tiene los estilos compactos y el grid de 3 columnas", async () => {
  const css = await readFile(new URL("../public/MarcieBlogEditor/css/MarcieBlogEditor.css", import.meta.url), "utf8");

  // Grid a 3 columnas para acomodar los nuevos botones ordenadamente
  assert.ok(css.includes("grid-template-columns: repeat(3, minmax(0, 1fr));"), "Grid debe ser de 3 columnas");
  assert.ok(css.includes("min-height: 48px;"), "Botones deben ser más pequeños (min-height: 48px)");
  assert.ok(css.includes("font-size: 0.62rem;"), "Título de los tiles más compacto");

  // Estilos de celdas editables y modal footer
  assert.ok(css.includes(".video-cell-editable"), "Debe tener clase .video-cell-editable");
  assert.ok(css.includes(".video-cell-editor"), "Debe tener clase .video-cell-editor");
  assert.ok(css.includes(".video-audience-card"), "Debe tener clase .video-audience-card");
  assert.ok(css.includes("display: flex !important;"), "marcie-modal-footer debe tener display: flex !important");

  // Botones borderless en subheader
  assert.ok(css.includes(".audience-btn,"), "Debe tener regla borderless para .audience-btn");
  assert.ok(css.includes(".audience-buttons-grid"), "Debe tener regla responsiva para .audience-buttons-grid");
});
