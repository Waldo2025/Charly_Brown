import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtime = await readFile(new URL("../public/js/science-game-runtime.mjs", import.meta.url), "utf8");
const exportCss = await readFile(new URL("../public/science-assessment-export.css", import.meta.url), "utf8");
const responsiveCss = await readFile(new URL("../public/science-timeline-responsive.css", import.meta.url), "utf8");
const page = await readFile(new URL("../public/scienceActivities.html", import.meta.url), "utf8");
const source = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");

test("el footer de acciones permanece fuera del tablero", () => {
  assert.match(runtime, /data-structured-board><\/div>\s*<footer>/);
  assert.doesNotMatch(runtime, /board\.append\(timelineFooter\)/);
  assert.match(responsiveCss, /is-timeline-order > footer \{/);
  assert.match(responsiveCss, /Actions are siblings of the board/);
});

test("el tablero crece según timeline y banco", () => {
  assert.match(responsiveCss, /science-structured-board \{[\s\S]*?height: auto !important;[\s\S]*?max-height: none !important;[\s\S]*?overflow: visible !important;/);
  assert.match(responsiveCss, /science-timeline-bank \{[\s\S]*?position: relative !important;[\s\S]*?height: auto !important;/);
});

test("los encabezados largos crecen y envuelven el texto", () => {
  assert.match(runtime, /<header class="science-structured-question-header">/);
  assert.match(runtime, /<section class="science-structured-question-copy"><small>/);
  assert.match(runtime, /<span class="science-rive-challenge-progress"/);
  assert.doesNotMatch(runtime, /<div class="science-rive-challenge-heading">\s*\$\{isMinimalRiveNumeric \? ""/);
  assert.match(responsiveCss, /science-structured-game:not\(\.is-rive-numeric-console\) > header \{[\s\S]*?height: auto !important;[\s\S]*?max-height: none !important;[\s\S]*?overflow: visible !important;/);
  assert.match(responsiveCss, /grid-template-columns: auto minmax\(0, 1fr\) auto !important/);
  assert.match(responsiveCss, /header\.science-structured-question-header \{[\s\S]*?grid-template-rows: max-content !important/);
  assert.match(responsiveCss, /header\.science-structured-question-header \{[\s\S]*?flex: 0 0 auto !important;[\s\S]*?block-size: max-content !important;[\s\S]*?min-block-size: max-content !important/);
  assert.match(responsiveCss, /is-timeline-order > header\.science-structured-question-header \{[\s\S]*?height: max-content !important;[\s\S]*?min-height: max-content !important/);
  assert.match(responsiveCss, /science-structured-game:not\(\.is-rive-numeric-console\) \{[\s\S]*?grid-template-rows: none !important;[\s\S]*?grid-auto-rows: max-content !important/);
  assert.match(responsiveCss, /> \.science-structured-question-copy \{[\s\S]*?min-width: 0 !important;[\s\S]*?overflow: visible !important;/);
  assert.match(responsiveCss, /science-structured-game:not\(\.is-rive-numeric-console\) > header h2 \{[\s\S]*?white-space: normal !important;[\s\S]*?overflow-wrap: break-word !important;/);
  assert.match(responsiveCss, /> \.science-structured-status \{[\s\S]*?position: relative !important;[\s\S]*?height: auto !important;/);
});

test("en horizontal el eje se centra y las tarjetas conservan anchura", () => {
  assert.match(responsiveCss, /science-timeline-track::before \{[\s\S]*?top: 50% !important;[\s\S]*?transform: translateY\(-50%\) !important;/);
  assert.match(responsiveCss, /grid-auto-columns: minmax\(220px, 1fr\) !important/);
  assert.match(responsiveCss, /min-width: 200px !important;[\s\S]*?max-width: 280px !important/);
  assert.match(responsiveCss, /grid-template-rows: minmax\(150px, 1fr\) 38px 62px minmax\(150px, 1fr\) 38px !important/);
});

test("las tarjetas construidas y sus controles participan en el flujo", () => {
  assert.match(responsiveCss, /science-timeline-event:nth-child\(n\) > article \{[\s\S]*?position: relative !important;[\s\S]*?height: auto !important;/);
  assert.match(responsiveCss, /science-timeline-event:nth-child\(n\) > div \{[\s\S]*?position: relative !important;/);
  assert.match(responsiveCss, /overflow-wrap: break-word !important/);
});

test("las tarjetas horizontales responden a mouse y touch sin duplicar selecciones", () => {
  assert.match(runtime, /timelineBank\?\.addEventListener\("pointerdown"/);
  assert.match(runtime, /timelineBank\?\.addEventListener\("pointerup"/);
  assert.match(runtime, /movement > 12/);
  assert.match(responsiveCss, /science-timeline-bank-card \{[\s\S]*?pointer-events: auto !important;[\s\S]*?touch-action: manipulation !important;/);
  assert.match(responsiveCss, /science-timeline-track::before \{[\s\S]*?pointer-events: none !important;/);
});

test("la línea del tiempo no revela el orden mediante Paso 1, Paso 2 o Paso 3", () => {
  assert.match(runtime, /const timelineDisplayLabel =/);
  assert.match(runtime, /revealsPosition/);
  assert.doesNotMatch(runtime, /timelineEvent\.label \|\| `Elemento \$\{index \+ 1\}`/);
  assert.match(runtime, /\$\{timelineLabelMarkup\(timelineEvent\)\}<strong>/);
});

test("la línea del tiempo generada tiene una solución reconocida por el validador", () => {
  const solutionStart = source.indexOf("function assessmentSolution(assessment)");
  const solutionEnd = source.indexOf("function generatedAssessmentIsComplete", solutionStart);
  const solution = source.slice(solutionStart, solutionEnd);
  assert.match(solution, /assessment\.type === "timeline-order"/);
  assert.match(solution, /titleById/);
  assert.match(solution, /assessment\.correctOrder \|\| \[\]/);
  assert.match(source, /assessment\.type === "number-line-placement"[\s\S]*?Number\.isFinite\(Number\(assessment\.targetValue\)\)/);
});

test("en compacto el banco queda a la izquierda del timeline", () => {
  assert.match(responsiveCss, /@container science-timeline-question \(max-width: 760px\)/);
  assert.match(responsiveCss, /grid-template-columns: minmax\(220px, 40%\) minmax\(360px, 60%\) !important/);
  assert.match(responsiveCss, /grid-template-areas: "bank-title timeline" "bank timeline" !important/);
  assert.match(responsiveCss, /grid-area: bank !important/);
  assert.match(responsiveCss, /grid-area: timeline !important/);
});

test("el timeline compacto tiene eje central y tarjetas a ambos lados", () => {
  const compact = responsiveCss.slice(responsiveCss.indexOf("@container science-timeline-question (max-width: 760px)"));
  assert.match(compact, /science-timeline-track::before \{[\s\S]*?left: 50% !important;[\s\S]*?transform: translateX\(-50%\) !important;/);
  assert.match(compact, /grid-template-columns: minmax\(142px, 1fr\) 76px minmax\(142px, 1fr\) !important/);
  assert.match(compact, /nth-child\(odd\) > article \{[\s\S]*?grid-column: 1 !important/);
  assert.match(compact, /nth-child\(even\) > article \{[\s\S]*?grid-column: 3 !important/);
  assert.match(compact, /> i \{[\s\S]*?grid-column: 2 !important/);
});

test("el CSS de exportación conserva el mismo contrato final", () => {
  const finalExport = exportCss.slice(exportCss.lastIndexOf("Timeline flow v5"));
  assert.match(finalExport, /science-structured-board\{height:auto!important/);
  assert.match(finalExport, /is-timeline-order>footer\{position:relative!important/);
  assert.match(finalExport, /science-timeline-track::before\{left:18px!important;right:18px!important;top:50%!important/);
  assert.match(finalExport, /grid-template-areas:"bank-title timeline" "bank timeline"!important/);
});

test("la página invalida caché para recibir el arreglo", () => {
  assert.doesNotMatch(page, /science-hud-themes\.css|science-timeline-responsive\.css/);
  assert.match(page, /scienceActivities\.bundle\.js\?v=20260816-optional-visual-question-v219/);
  assert.match(source, /loadOptionalStyle\("science-hud-themes\.css\?v=20260815-centered-gameplay-v44"/);
  assert.match(source, /loadOptionalStyle\("science-timeline-responsive\.css\?v=20260814-timeline-pointer-v11"/);
});

test("el briefing centra su contenido cuando sobra altura sin cortar el scroll", () => {
  assert.match(responsiveCss, /science-micro-content\s*\{[\s\S]*?justify-content:\s*safe center\s*!important/);
  assert.match(responsiveCss, /@media \(max-width:\s*780px\)[\s\S]*?science-micro-content\s*\{[\s\S]*?justify-content:\s*flex-start\s*!important/);
});
