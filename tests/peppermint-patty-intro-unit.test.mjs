import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  documentNameMatchesRevision,
  inferUnidadFromDocumentName,
} from "../public/analizarPDF/analizar-pdf-session-logic.js";

const htmlSource = readFileSync(new URL("../public/PeppermintPattyAnalizer.html", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-app.js", import.meta.url), "utf8");

test("IDML filenames with the INTRO token route to the Intro editorial card", () => {
  assert.equal(inferUnidadFromDocumentName("4_LA_00_INTRO_F1.idml"), "Intro");
  assert.equal(inferUnidadFromDocumentName("INTRO-LM-Primaria.idml"), "Intro");
  assert.equal(inferUnidadFromDocumentName("coleccion_intro.idml"), "Intro");
  assert.equal(inferUnidadFromDocumentName("introduccion.idml"), "");
  assert.equal(documentNameMatchesRevision("4_LA_00_INTRO_F1.idml", { unidad: "Intro" }), true);
  assert.equal(documentNameMatchesRevision("4_LA_00_INTRO_F1.idml", { unidad: "Proyecto" }), false);
});

test("the default editorial template starts with Intro before Proyecto", () => {
  assert.match(
    appSource,
    /const units = \[\s*\{ unidad: "Intro", recortableRole: "source" \},\s*\{ unidad: "Proyecto", recortableRole: "source" \}/
  );
  assert.match(
    appSource,
    /Se crearán Intro \+ Proyecto \+ \$\{unitCount\} unidad\(es\) \+ Lecturas \+ Recortables\./
  );
});

test("every unit selector offers Intro before Proyecto", () => {
  const selectorIds = [
    "analizarPdfUnidadInput",
    "analizarPdfInsertRevisionUnit",
    "analizarPdfMappingsUnidadFilter",
    "analizarPdfMappingUnidadInput",
  ];
  for (const id of selectorIds) {
    const selectMarkup = htmlSource.match(new RegExp(`<select id="${id}"[\\s\\S]*?<\\/select>`))?.[0] || "";
    assert.match(selectMarkup, /<option value="Intro">Intro<\/option>[\s\S]*?<option value="Proyecto">Proyecto<\/option>/);
  }
});
