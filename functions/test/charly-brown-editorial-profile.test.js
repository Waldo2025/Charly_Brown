const test = require("node:test");
const assert = require("node:assert/strict");
const { buildActivityPrompt, buildActivityReadingContext, buildResourcePrompt, buildTeacherNotesPrompt, validateEmbeddedActivityResources, validateResourceArtifact, REFERENCE_EDITORIAL_ACTIVITY_PROFILE } = require("../src/charly-brown-agent-tools.js");

test("activity prompts include the reference editorial structure without source text", () => {
  const prompt = buildActivityPrompt({
    unit: { title: "El entorno", meta: { level: "Primaria", grade: "Tercero", trimester: "1", unit: "2" }, sya: { T: "Clasificación" } },
    activity: { section: "Ciencias" }
  });
  assert.match(REFERENCE_EDITORIAL_ACTIVITY_PROFILE, /consigna breve en modo imperativo/);
  assert.match(prompt, /Distingue con claridad título, instrucción principal, subinstrucciones/);
  assert.match(prompt, /Secuencia y alcance vigente/);
  assert.match(prompt, /<div class="activity">/);
});

test("activity prompts generate independently approvable resources and reference their use", () => {
  const unit = { meta: { level: "Primaria", grade: "Tercero", trimester: "1", unit: "2" }, accepted: { reading: { title: "Lectura", text: "Una niña observa las nubes." } } };
  const prompt = buildActivityPrompt({
    unit,
    activity: { section: "Ciencias experimentales · Conocimiento del medio" },
    resourceTypes: ["worksheet", "annex"]
  });
  assert.match(prompt, /data-resource-type="ficha"/);
  assert.match(prompt, /data-resource-type="anexo"/);
  assert.match(prompt, /momento exacto en que se utiliza/);

  const worksheet = '<section class="resource-ficha" data-resource-type="ficha"><h3>Ficha 2a</h3><div class="activity"><p><strong>Completa la ficha.</strong></p><ol class="steps steps-numbered"><li>Resuelve.<div class="answer">Respuesta: ejemplo.</div></li></ol></div></section>';
  const valid = validateEmbeddedActivityResources(`<div class="activity"><strong>Con ayuda de la Ficha 2a y el Anexo 2b, observa y registra.</strong></div>${worksheet}<section data-resource-type="anexo"><h3>Anexo 2b</h3></section>`, ["worksheet", "annex"]);
  assert.equal(valid.ok, true);
  assert.equal(validateEmbeddedActivityResources('<div class="activity">Observa.</div>', ["worksheet"]).ok, false);
  assert.equal(validateResourceArtifact({ title: "Ficha", activityId: "activity-1", html: worksheet }, "worksheet").ok, true);
  assert.equal(validateResourceArtifact({ title: "Ficha", activityId: "activity-1", html: "<p>Completa una tabla.</p>" }, "worksheet").ok, false);
  assert.match(buildResourcePrompt({ type: "worksheet", unit, activity: { id: "activity-1", section: "Lenguaje", title: "Actividad", html: "<div class=\"activity\"></div>" } }), /misma estructura editorial que una actividad/);
});

test("activity prompts prioritize the complete narrative over synonyms", () => {
  const unit = {
    title: "El bosque",
    meta: { level: "Primaria", grade: "Tercero", trimester: "1", unit: "2" },
    accepted: {
      reading: {
        title: "Una noche en el bosque",
        html: "<table class=\"lectura-tabla-sinonimos\"><tr><td>rápido</td><td>veloz</td></tr></table>",
        sections: {
          narrativeHtml: "<p>Lucía siguió las huellas y encontró el refugio antes de la lluvia.</p>",
          synonyms: [{ palabra: "rápido", sinonimo: "veloz" }],
          questions: [{ texto: "¿Qué encontró Lucía?" }]
        }
      }
    }
  };
  const context = buildActivityReadingContext(unit);
  const prompt = buildActivityPrompt({ unit, activity: { section: "Comprensión lectora" } });

  assert.match(context.narrative, /Lucía siguió las huellas/);
  assert.doesNotMatch(context.narrative, /rápido.*veloz/);
  assert.match(context.supportingMaterial, /Sinónimos: rápido: veloz/);
  assert.ok(prompt.indexOf("Lucía siguió las huellas") < prompt.indexOf("Sinónimos: rápido: veloz"));
  assert.match(prompt, /No conviertas la tabla de sinónimos.*fuente principal/);
});

test("activity prompts enforce rounded title, no detonating question, imperative verbs, resource codes and grade differentiation", () => {
  const promptGrade1 = buildActivityPrompt({
    unit: { title: "Mi comunidad", meta: { level: "Primaria", grade: "Primero", trimester: "1", unit: "1" } },
    activity: { section: "Expresión oral" },
    resourceTypes: ["worksheet", "annex", "cutout", "video-script"]
  });

  // Rounded title directly without negative prompt bloat
  assert.match(promptGrade1, /cb-activity-title/);
  assert.match(promptGrade1, /título temático creativo/);
  assert.match(promptGrade1, /tipografía rounded/);

  // Imperative verbs first
  assert.match(promptGrade1, /NUNCA comiences una actividad con una pregunta/);
  assert.match(promptGrade1, /pregunta va SIEMPRE DESPUÉS de la instrucción imperativa inicial/);

  // Official resource codes
  assert.match(promptGrade1, /Ficha 1a/);
  assert.match(promptGrade1, /Anexo 1a/);
  assert.match(promptGrade1, /Recortable 1a/);
  assert.match(promptGrade1, /Video/);

  // Grade 1 differentiation: much shorter
  assert.match(promptGrade1, /CRITERIO PEDAGÓGICO OBLIGATORIO PARA PRIMERO DE PRIMARIA/);
  assert.match(promptGrade1, /MUCHO MÁS CORTAS/);

  // Grade 6 differentiation: much longer
  const promptGrade6 = buildActivityPrompt({
    unit: { title: "Ecosistemas", meta: { level: "Primaria", grade: "Sexto", trimester: "2", unit: "3" } },
    activity: { section: "Ciencias" },
    resourceTypes: ["worksheet"]
  });
  assert.match(promptGrade6, /CRITERIO PEDAGÓGICO OBLIGATORIO PARA SEXTO DE PRIMARIA/);
  assert.match(promptGrade6, /MUCHO MÁS LARGAS/);
  assert.match(promptGrade6, /Ficha 3a/);
});

test("activity prompts prohibit emojis and require textual IC tags", () => {
  const prompt = buildActivityPrompt({
    unit: { title: "Mi comunidad", meta: { level: "Primaria", grade: "Primero", trimester: "1", unit: "1" } },
    activity: { section: "Expresión oral" },
    resourceTypes: ["worksheet"]
  });
  assert.match(prompt, /PROHIBIDO USAR EMOJIS/);
  assert.match(prompt, /\[IC\. T\. IND\]/);
  assert.match(prompt, /\[IC\. T\. PAR\]/);
  assert.match(prompt, /\[IC\. T\.EQ\]/);
});

test("teacher notes prompts enforce subtopic orientations and exclusive ficha notes section at the end", () => {
  const prompt = buildTeacherNotesPrompt({
    unit: {
      title: "Mi comunidad",
      meta: { level: "Primaria", grade: "Primero", trimester: "1", unit: "1" },
      accepted: {
        activities: [{ id: "act-1", title: "Actividad 1", section: "Lenguaje" }],
        resources: [{ id: "res-1", code: "Ficha 1a", title: "Vocales", type: "worksheet" }]
      }
    }
  });
  assert.match(prompt, /Actividad General/);
  assert.match(prompt, /Notas pedagógicas exclusivas para Fichas/);
  assert.match(prompt, /una ficha por página/);
  assert.match(prompt, /Propósito formativo/);
  assert.match(prompt, /Impacto cognitivo/);
});
