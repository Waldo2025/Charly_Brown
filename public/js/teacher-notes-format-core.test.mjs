import test from "node:test";
import assert from "node:assert/strict";

import {
  TEACHER_NOTES_FORMATS,
  formatTeacherGeneralParagraph,
  matchesTeacherNotesTemplate,
  getTeacherGeneralHeading
} from "./teacher-notes-format-core.mjs";

test("formats ingesta teacher notes as numbered general activities without narrative prefix", () => {
  const result = formatTeacherGeneralParagraph({
    index: 1,
    format: TEACHER_NOTES_FORMATS.INGESTA_NUMBERED_GENERAL,
    paragraph: "En la actividad 2, solicite que comparen los resultados y expliquen su criterio."
  });

  assert.match(result, /^2\.\s/);
  assert.doesNotMatch(result, /En la actividad/i);
  assert.match(result, /solicite que comparen/i);
});

test("formats ingesta teacher notes by removing connector openings and forcing an imperative verb", () => {
  const result = formatTeacherGeneralParagraph({
    index: 0,
    format: TEACHER_NOTES_FORMATS.INGESTA_NUMBERED_GENERAL,
    paragraph: "Con el recortable 1a, convierta la consigna en una acción manipulativa y cierre con verificación breve."
  });

  assert.match(result, /^1\.\s+Convierta\b/);
  assert.doesNotMatch(result, /^1\.\s+Con\b/);
});

test("accepts the new ingesta template with numbered general activities and preserved extras", () => {
  const html = `
    <div class="unidad-teacher-notes asc-teacher-layout">
      <h3>Actividades generales</h3>
      <div class="unidad-teacher-general-item"><p>1. Dirija la atención del grupo hacia el modelo inicial.</p></div>
      <div class="unidad-teacher-general-item"><p>2. Solicite que expliquen su procedimiento.</p></div>
      <section><h3>Actividad de ampliación</h3><p>Amplíe el reto desde la actividad base.</p></section>
      <section><h3>Actividad de refuerzo</h3><p>Refuerce el contenido con una variante guiada.</p></section>
      <section><h3>Neurología aplicada</h3><p>Cierre con recuperación activa.</p></section>
      <section><h3>Atención a la diversidad y accesibilidad</h3><p>Ajuste tiempos, apoyos visuales y vías de respuesta.</p></section>
      <div><strong>Reflexión global:</strong> Ajuste el acompañamiento.</div>
      <h4>Candelarización de actividades recomendada</h4>
    </div>
  `;

  assert.equal(matchesTeacherNotesTemplate(html, TEACHER_NOTES_FORMATS.INGESTA_NUMBERED_GENERAL), true);
  assert.equal(getTeacherGeneralHeading(TEACHER_NOTES_FORMATS.INGESTA_NUMBERED_GENERAL), "Actividades generales");
});

test("rejects ingesta teacher notes when ampliacion or refuerzo sections are missing", () => {
  const html = `
    <div class="unidad-teacher-notes asc-teacher-layout">
      <h3>Actividades generales</h3>
      <div class="unidad-teacher-general-item"><p>1. Dirija la atención del grupo hacia el modelo inicial.</p></div>
      <section><h3>Neurología aplicada</h3><p>Cierre con recuperación activa.</p></section>
    </div>
  `;

  assert.equal(matchesTeacherNotesTemplate(html, TEACHER_NOTES_FORMATS.INGESTA_NUMBERED_GENERAL), false);
});

test("rejects ingesta teacher notes when a numbered activity does not start with an imperative verb", () => {
  const html = `
    <div class="unidad-teacher-notes asc-teacher-layout">
      <h3>Actividades generales</h3>
      <div class="unidad-teacher-general-item"><p>1. Con el recortable 1a, convierta la consigna en una acción manipulativa.</p></div>
      <section><h3>Neurología aplicada</h3><p>Cierre con recuperación activa.</p></section>
    </div>
  `;

  assert.equal(matchesTeacherNotesTemplate(html, TEACHER_NOTES_FORMATS.INGESTA_NUMBERED_GENERAL), false);
});

test("keeps the default teacher notes template unchanged", () => {
  const html = `
    <div class="unidad-teacher-notes asc-teacher-layout">
      <h3>Actividad General</h3>
      <div class="unidad-teacher-general-item"><p>En la actividad 1, modele el procedimiento.</p></div>
      <section><h3>Actividad de ampliación</h3><p>Amplíe el reto.</p></section>
      <section><h3>Actividad de refuerzo</h3><p>Refuerce el contenido.</p></section>
      <section><h3>Neurología aplicada</h3><p>Cierre con recuperación activa.</p></section>
      <section><h3>Atención a la diversidad y accesibilidad</h3><p>Ajuste tiempos, apoyos visuales y vías de respuesta.</p></section>
    </div>
  `;

  assert.equal(matchesTeacherNotesTemplate(html, TEACHER_NOTES_FORMATS.DEFAULT), true);
  assert.equal(getTeacherGeneralHeading(TEACHER_NOTES_FORMATS.DEFAULT), "Actividad General");
});
