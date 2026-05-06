import test from "node:test";
import assert from "node:assert/strict";
import {
  buildUnidadLengthGuidance,
  buildUnidadActivityStructureContract,
  buildUnidadPrimerIconographyPrompt,
  buildUnidadResourceExtraBlocks
} from "../public/unidadPromptContracts.js";

test("primero usa el mismo contrato compartido de longitud e iconografía", () => {
  const length = buildUnidadLengthGuidance({ grado: "Primero", nivel: "Primaria" });
  const structure = buildUnidadActivityStructureContract({ isTrazosDeLetras: false, hasExplicitFormatContract: false });
  const iconography = buildUnidadPrimerIconographyPrompt("Primero");
  assert.match(length, /4 a 8 palabras/i);
  assert.match(structure, /<ol class="steps steps-numbered">/i);
  assert.match(iconography, /\[IC OBSERVA\]/);
});

test("los complementos separados comparten el mismo contrato en cualquier contexto", () => {
  const html = buildUnidadResourceExtraBlocks({
    separarSeccionesRecursos: true,
    recursos: {
      fichas: { generado: true, clave: "Ficha P1" },
      anexos: { generado: true, clave: "Anexo P1" },
      recortables: { generado: true, clave: "Recortable P1" },
      videos: { generado: true, clave: "Video P1" }
    }
  });
  assert.match(html, /data-resource-type="ficha"/i);
  assert.match(html, /data-resource-type="anexo"/i);
  assert.match(html, /data-resource-type="recortable"/i);
  assert.match(html, /data-resource-type="video"/i);
});
