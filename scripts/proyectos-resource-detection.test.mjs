import test from "node:test";
import assert from "node:assert/strict";
import { shouldSkipProyectoResourceNode } from "../public/unidadProyectoResourceDetection.js";

test("omite wrappers de fases del proyecto", () => {
  assert.equal(
    shouldSkipProyectoResourceNode({
      className: "project-phases",
      innerHtml: `<div class="phase"><div class="activity">Actividad</div></div>`
    }),
    true
  );
});

test("no omite recursos solo porque contienen actividades internas", () => {
  assert.equal(
    shouldSkipProyectoResourceNode({
      className: "resource-ficha",
      innerHtml: `
        <section data-resource-section="true" data-resource-type="ficha">
          <h4 class="unidad-ficha-heading">Ficha</h4>
          <div class="activity">Actividad de la ficha</div>
        </section>
      `
    }),
    false
  );
});
