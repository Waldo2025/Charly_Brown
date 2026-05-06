import test from "node:test";
import assert from "node:assert/strict";
import { resolveProyectoMainHtml } from "../public/unidadProyectoHtmlGuard.js";

function compactHtml(html) {
  return String(html || "").replace(/\s+/g, " ").trim();
}

test("usa el html original cuando la separación deja solo la lectura generadora", () => {
  const originalHtml = `
    <h3>Lectura generadora</h3>
    <p>Texto base</p>
    <h3>Preguntas de comprensión</h3>
    <ol><li>Pregunta 1</li></ol>
    <div class="project-phases">
      <div class="phase"><h3>Fase 1</h3><div class="activity">Actividad completa</div></div>
      <div class="phase"><h3>Fase 2</h3><div class="activity">Actividad 2</div></div>
    </div>
  `;
  const candidateHtml = `
    <h3>Lectura generadora</h3>
    <p>Texto base</p>
  `;
  const resolved = resolveProyectoMainHtml({
    originalHtml,
    candidateHtml,
    resourcesByType: { ficha: "<section>Ficha</section>", anexo: "", recortable: "", video: "" }
  });
  assert.equal(compactHtml(resolved), compactHtml(originalHtml));
});

test("conserva el html separado cuando aún mantiene preguntas y fases del proyecto", () => {
  const originalHtml = `
    <h3>Lectura generadora</h3>
    <p>Texto base</p>
    <h3>Preguntas de comprensión</h3>
    <ol><li>Pregunta 1</li></ol>
    <div class="project-phases">
      <div class="phase"><h3>Fase 1</h3><div class="activity">Actividad completa</div></div>
    </div>
    <section data-resource-type="ficha">Ficha separada</section>
  `;
  const candidateHtml = `
    <h3>Lectura generadora</h3>
    <p>Texto base</p>
    <h3>Preguntas de comprensión</h3>
    <ol><li>Pregunta 1</li></ol>
    <div class="project-phases">
      <div class="phase"><h3>Fase 1</h3><div class="activity">Actividad completa</div></div>
    </div>
  `;
  const resolved = resolveProyectoMainHtml({
    originalHtml,
    candidateHtml,
    resourcesByType: { ficha: "<section>Ficha separada</section>", anexo: "", recortable: "", video: "" }
  });
  assert.equal(compactHtml(resolved), compactHtml(candidateHtml));
});
