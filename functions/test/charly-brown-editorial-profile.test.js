const test = require("node:test");
const assert = require("node:assert/strict");
const { buildActivityPrompt, buildActivityReadingContext, buildResourcePrompt, validateEmbeddedActivityResources, validateResourceArtifact, REFERENCE_EDITORIAL_ACTIVITY_PROFILE } = require("../src/charly-brown-agent-tools.js");

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
