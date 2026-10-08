import assert from "node:assert/strict";
import { COMPOSER_AGENT_TOOLS } from "../public/charly-brown/workflow.js";

// 1. COMPOSER_AGENT_TOOLS verification
const planTool = COMPOSER_AGENT_TOOLS.find((t) => t.id === "planning_mode");
assert.ok(planTool, "COMPOSER_AGENT_TOOLS debe incluir planning_mode");
assert.equal(planTool.name, "Modo plan");
assert.equal(planTool.icon, "fa-list-check");

// 2. Test regex for PLAN_OPTION
const testText = `
Aquí tienes algunas opciones para estructurar la actividad:
1. [[PLAN_OPTION: Mantener ejercicios del PDF original]]
2. [[PLAN_OPTION: Adaptar a dinámica lúdica 'Juego y practico']]
- [[PLAN_OPTION: Incluir caja caligráfica pautada]]
`;

const optionMatches = [...testText.matchAll(/(?:^|\n)\s*(?:[-*•]|\d+\.)?\s*\[\[PLAN_OPTION:\s*(.*?)\s*\]\]\s*(?=\n|$)/g)];
assert.equal(optionMatches.length, 3, "Debe detectar las 3 opciones de planificación");
assert.equal(optionMatches[0][1], "Mantener ejercicios del PDF original");
assert.equal(optionMatches[1][1], "Adaptar a dinámica lúdica 'Juego y practico'");
assert.equal(optionMatches[2][1], "Incluir caja caligráfica pautada");

// 3. Test explicit generation detection in planning mode
const isExplicitGen = (text) => {
  const norm = String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\b(genera(?:r)? ahora|crea(?:r)? ahora|diseña(?:r)? ahora|redacta(?:r)? ahora|produc(?:ir|e) ahora|aplica(?:r)? el plan|genera ya|listo genera|ejecuta(?:r)? el plan|terminamos de planificar)\b/.test(norm);
};

assert.equal(isExplicitGen("sigamos configurando la actividad"), false, "No debe activar generación prematura al decir 'sigamos configurando la actividad'");
assert.equal(isExplicitGen("ayúdame a rehacerla con modo plan"), false, "No debe activar generación prematura al decir 'ayúdame a rehacerla con modo plan'");
assert.equal(isExplicitGen("diseñemos juntos las preguntas"), false, "No debe activar generación con 'diseñemos juntos'");
assert.equal(isExplicitGen("¡Listo, genera ahora!"), true, "Debe activar generación al decir 'genera ahora'");
assert.equal(isExplicitGen("Aplica el plan"), true, "Debe activar generación al decir 'Aplica el plan'");

// 4. Test extraction of proposal text in message history
const mockProposalHtml = `
<div class="cb-proposal-card" data-proposal-id="prop_123">
  <style>.some-css { color: red; }</style>
  <h2 class="cb-activity-title">Fracciones equivalentes</h2>
  <div class="activity">
    <p><strong>Observa y resuelve.</strong></p>
    <ol class="steps"><li>Paso 1</li></ol>
  </div>
  <aside class="cb-card-toolbar"><button>Aceptar</button></aside>
</div>
`;

const cleanProposal = mockProposalHtml
  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
  .replace(/<button[^>]*>[\s\S]*?<\/button>/gi, "")
  .replace(/<aside class="cb-card-toolbar"[\s\S]*?<\/aside>/gi, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

assert.ok(cleanProposal.includes("Fracciones equivalentes"), "Debe conservar el título de la propuesta");
assert.ok(cleanProposal.includes("Observa y resuelve"), "Debe conservar la instrucción");
assert.ok(!cleanProposal.includes("Aceptar"), "Debe haber limpiado los botones de acción");

console.log("Planning mode contract tests passed successfully!");
