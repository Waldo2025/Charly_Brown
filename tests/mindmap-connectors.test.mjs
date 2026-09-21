import test from "node:test";
import assert from "node:assert/strict";

import {
  calcularEsquinasFusion,
  generarConectoresSerpenteantes
} from "../public/js/mindmapConnectorGeometry.mjs";

const palette = (fill, stroke) => ({ fill, stroke });

function crearTransicion(sentenceIdArriba, sentenceIdAbajo, paletas = {}) {
  return [
    {
      row: 0,
      dir: "ltr",
      x: 50,
      y: 40,
      width: 260,
      height: 120,
      blockIndex: 10,
      sentenceId: sentenceIdArriba,
      palette: paletas.arriba || palette("#ead7eb", "#a85baa")
    },
    {
      row: 1,
      dir: "rtl",
      x: 130,
      y: 190,
      width: 180,
      height: 120,
      blockIndex: 11,
      sentenceId: sentenceIdAbajo,
      palette: paletas.abajo || palette("#ead7eb", "#a85baa")
    }
  ];
}

test("conecta dos filas cuando contienen la misma frase", () => {
  const bloques = crearTransicion(4, 4);
  const svg = generarConectoresSerpenteantes(bloques, 0);
  const esquinas = calcularEsquinasFusion(bloques);

  assert.match(svg, /<path/);
  assert.match(svg, /<line/);
  assert.equal(esquinas.get(10)?.bottom, "both");
  assert.equal(esquinas.get(11)?.top, "both");
});

test("deja un corte real cuando la fila siguiente inicia otra frase", () => {
  const bloques = crearTransicion(4, 5);

  assert.equal(generarConectoresSerpenteantes(bloques, 0), "");
  assert.equal(calcularEsquinasFusion(bloques).size, 0);
});

test("no crea gradiente entre frases distintas con colores diferentes", () => {
  const bloques = crearTransicion(4, 5, {
    arriba: palette("#ead7eb", "#a85baa"),
    abajo: palette("#ffe0c2", "#f07b37")
  });
  const svg = generarConectoresSerpenteantes(bloques, 1);

  assert.doesNotMatch(svg, /linearGradient|mcConnGrad|url\(#/);
  assert.equal(svg, "");
});
