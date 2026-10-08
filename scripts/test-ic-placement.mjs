import assert from "node:assert/strict";
import { normalizeIcTokensAndPlacement } from "../public/charly-brown/unit-contracts.js";

// 1. Caso de tabla con celda separada para [IC. T. IND]
const tableHtml = `
<table>
  <tr>
    <td>3. Localiza en la sopa de letras nueve palabras del banco que contengan las terminaciones -ía o -ían.</td>
    <td>[IC. T. IND]</td>
  </tr>
</table>
`;

const normalizedTable = normalizeIcTokensAndPlacement(tableHtml);
assert.ok(!normalizedTable.includes("<td>[IC. T. IND]</td>"), "No debe haber celda separada para [IC. T. IND]");
assert.ok(!normalizedTable.includes("<table"), "Debe desarmar la tabla si era solo un contenedor de 2 columnas");
assert.ok(normalizedTable.includes("Localiza en la sopa de letras"), "Debe conservar la instrucción");
assert.ok(normalizedTable.includes("[IC. T. IND]"), "Debe incluir el token [IC. T. IND] al final del texto");

// 2. Caso de flexbox / space-between
const flexHtml = `
<div style="display: flex; justify-content: space-between;">
  <span>3. Localiza en la sopa de letras nueve palabras.</span>
  <span>[IC. T. IND]</span>
</div>
`;

const normalizedFlex = normalizeIcTokensAndPlacement(flexHtml);
assert.ok(!normalizedFlex.includes("justify-content: space-between"), "Debe desarmar el flex space-between");
assert.ok(normalizedFlex.includes("3. Localiza en la sopa de letras nueve palabras. [IC. T. IND]"), "Debe concatenar el token inline al final");

// 3. Caso de salto de línea <br> antes de [IC]
const brHtml = `<p>3. Resuelve el crucigrama.<br>[IC. T. IND]</p>`;
const normalizedBr = normalizeIcTokensAndPlacement(brHtml);
assert.ok(!normalizedBr.includes("<br"), "Debe remover el <br> que separa el token IC");
assert.ok(normalizedBr.includes("Resuelve el crucigrama. [IC. T. IND]"), "Debe quedar continuo");

// 4. Test formateo inline
assert.ok(normalizedBr.endsWith("[IC. T. IND]</p>"), "El token IC debe quedar exactamente al final del párrafo de instrucción");

// 5. Test de punto y aparte tras el badge cuando le sigue texto
const textAfterHtml = `<p><strong>Lee el texto.</strong> [IC. T. IND] Subraya con rojo los verbos y con azul los adjetivos.</p>`;
const normalizedTextAfter = normalizeIcTokensAndPlacement(textAfterHtml);
assert.ok(normalizedTextAfter.includes("[IC. T. IND]<br class=\"cb-ic-break\">"), "Debe insertar punto y aparte con cb-ic-break tras el token cuando le sigue texto");
assert.ok(normalizedTextAfter.includes("Subraya con rojo los verbos"), "El texto siguiente debe preservarse tras el salto de fila");

// 6. Test de desanidamiento de badge dentro de badge
const nestedBadgeHtml = `<p><strong>Lee.</strong> <span class="cb-ic-badge cb-ic-badge--modality"><span class="cb-ic-badge cb-ic-badge--modality">[IC. T. IND]</span></span></p>`;
const unnested = normalizeIcTokensAndPlacement(nestedBadgeHtml);
assert.ok(!unnested.includes("<span class=\"cb-ic-badge cb-ic-badge--modality\"><span class=\"cb-ic-badge cb-ic-badge--modality\">"), "No debe contener badges anidados");
assert.ok(unnested.includes("<span class=\"cb-ic-badge cb-ic-badge--modality\">[IC. T. IND]</span>"), "Debe dejar un único badge limpio");

console.log("IC tokens placement and formatting tests passed successfully!");
