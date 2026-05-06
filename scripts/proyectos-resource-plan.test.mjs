import test from "node:test";
import assert from "node:assert/strict";
import { buildProyectoSeparatedResourcePlan } from "../public/unidadProyectoResourceSections.js";

test("incluye solo recursos solicitados con su html extraído", () => {
  const plan = buildProyectoSeparatedResourcePlan({
    splitResourcesByType: {
      ficha: "<section>Ficha P1</section>",
      anexo: "<section>Anexo P1</section>",
      recortable: "",
      video: ""
    },
    requestedResources: {
      fichas: { generado: true, clave: "Ficha P1" },
      anexos: { generado: true, clave: "Anexo P1" },
      recortables: { generado: false, clave: "" },
      videos: { generado: false, clave: "" }
    }
  });

  assert.deepEqual(
    plan.map((item) => ({ type: item.type, missing: item.missing, html: item.htmlAlumno })),
    [
      { type: "anexo", missing: false, html: "<section>Anexo P1</section>" },
      { type: "ficha", missing: false, html: "<section>Ficha P1</section>" }
    ]
  );
});

test("genera placeholder visible cuando el recurso fue solicitado pero no llegó en el html separado", () => {
  const plan = buildProyectoSeparatedResourcePlan({
    splitResourcesByType: {
      ficha: "",
      anexo: "",
      recortable: "",
      video: ""
    },
    requestedResources: {
      fichas: { generado: true, clave: "Ficha P2" },
      anexos: { generado: false, clave: "" },
      recortables: { generado: true, clave: "Recortable P2" },
      videos: { generado: true, clave: "Video P2" }
    }
  });

  assert.equal(plan.length, 3);
  assert.deepEqual(
    plan.map((item) => ({ type: item.type, missing: item.missing })),
    [
      { type: "recortable", missing: true },
      { type: "ficha", missing: true },
      { type: "video", missing: true }
    ]
  );
  assert.match(plan[0].htmlAlumno, /Recortable P2/i);
  assert.match(plan[1].htmlAlumno, /Ficha P2/i);
  assert.match(plan[2].htmlAlumno, /Video P2/i);
});

test("descarta html extraído inválido cuando el recurso arrastra fases del proyecto", () => {
  const plan = buildProyectoSeparatedResourcePlan({
    splitResourcesByType: {
      ficha: "",
      anexo: "",
      recortable: "",
      video: `
        <div data-resource-section="true" data-resource-type="video">
          <strong class="unidad-video-heading">Guion de video: "Video P3"</strong>
          <div class="project-phases">
            <div class="phase"><h3>1. Indagar</h3></div>
          </div>
        </div>
      `
    },
    requestedResources: {
      fichas: { generado: false, clave: "" },
      anexos: { generado: false, clave: "" },
      recortables: { generado: false, clave: "" },
      videos: { generado: true, clave: "Video P3" }
    },
    fallbackHtmlByType: {
      video: `<section data-resource-type="video"><table><tr><th>Tiempo</th></tr></table></section>`
    }
  });

  assert.equal(plan.length, 1);
  assert.equal(plan[0].type, "video");
  assert.equal(plan[0].missing, true);
  assert.match(plan[0].htmlAlumno, /<table>/i);
  assert.doesNotMatch(plan[0].htmlAlumno, /project-phases/i);
});

test("descarta un guion de video genérico aunque llegue separado", () => {
  const plan = buildProyectoSeparatedResourcePlan({
    splitResourcesByType: {
      video: `
        <section data-resource-section="true" data-resource-type="video">
          <h3 class="unidad-video-heading">Guion de video: "Video p1a"</h3>
          <p><strong>Propósito del video:</strong> ampliar la comprensión del proyecto.</p>
          <table>
            <tbody>
              <tr><td>0:00-0:20</td><td>Explica una idea clave, retoma la lectura base y vincúlala con la actividad posterior inmediata.</td></tr>
            </tbody>
          </table>
        </section>
      `
    },
    requestedResources: {
      fichas: { generado: false, clave: "" },
      anexos: { generado: false, clave: "" },
      recortables: { generado: false, clave: "" },
      videos: { generado: true, clave: "Cómo presentar mi cartel" }
    },
    videoContext: {
      activityTitle: "Practica cómo presentar tu cartel",
      activityText: "Di tu nombre y explica tu dibujo en el cartel.",
      readingTitle: "Lucas aprende a leer el mundo",
      readingSummary: "Lucas observa nombres y sonidos en su entorno"
    },
    fallbackHtmlByType: {
      video: `<section data-resource-type="video"><h3>Guion de video: "Cómo presentar mi cartel"</h3><table><tr><th>Tiempo</th></tr></table></section>`
    }
  });

  assert.equal(plan.length, 1);
  assert.equal(plan[0].type, "video");
  assert.equal(plan[0].missing, true);
  assert.match(plan[0].htmlAlumno, /Cómo presentar mi cartel/i);
  assert.doesNotMatch(plan[0].htmlAlumno, /retoma la lectura base/i);
});
