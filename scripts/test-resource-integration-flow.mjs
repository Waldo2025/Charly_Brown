import assert from "node:assert/strict";
import { integrateResourceUsageIntoActivityHtml } from "../public/charly-brown/unit-contracts.js";

// 1. Probar integración de Recortable
const originalActivityHtml = `
<div class="activity">
  <p><strong>Clasifica las palabras según su acentuación.</strong> [IC. T. IND]</p>
  <ol class="steps steps-numbered">
    <li>Lee el banco de palabras con atención.</li>
  </ol>
</div>
`;

const cutoutResource = {
  type: "cutout",
  code: "Recortable 1a",
  title: "Piezas de palabras con hiato"
};

const updatedWithCutout = integrateResourceUsageIntoActivityHtml(originalActivityHtml, cutoutResource);
assert.ok(updatedWithCutout.includes("Recorta las piezas de Recortable 1a"), "Debe insertar el paso para recortar las piezas");
assert.ok(updatedWithCutout.includes("cb-cutout-paste-area"), "Debe insertar la zona de pegado para el recortable");
assert.ok(updatedWithCutout.includes("Pega aquí las piezas de Recortable 1a"), "Debe incluir la etiqueta de pegado");

// 2. Verificar que no se duplique si ya existe la mención
const secondRun = integrateResourceUsageIntoActivityHtml(updatedWithCutout, cutoutResource);
assert.equal(secondRun, updatedWithCutout, "No debe duplicar el paso si el recurso ya está mencionado");

// 3. Probar integración de Anexo
const annexResource = {
  type: "annex",
  code: "Anexo 1a",
  title: "Lámina visual de animales"
};

const updatedWithAnnex = integrateResourceUsageIntoActivityHtml(originalActivityHtml, annexResource);
assert.ok(updatedWithAnnex.includes("Consulta el Anexo 1a"), "Debe insertar el paso para consultar el anexo");

// 4. Probar integración de Ficha
const worksheetResource = {
  type: "worksheet",
  code: "Ficha 1a",
  title: "Ficha de refuerzo ortográfico"
};

const updatedWithWorksheet = integrateResourceUsageIntoActivityHtml(originalActivityHtml, worksheetResource);
assert.ok(updatedWithWorksheet.includes("Resuelve la Ficha 1a"), "Debe insertar el paso para resolver la ficha");

console.log("Resource integration flow tests passed successfully!");
