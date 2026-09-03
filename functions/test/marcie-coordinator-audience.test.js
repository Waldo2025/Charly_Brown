import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../../public/MarcieBlogEditor/js/", import.meta.url);

async function source(relativePath) {
  return readFile(new URL(relativePath, ROOT), "utf8");
}

test("la redacción Marcie contiene un contrato neuropedagógico exclusivo para coordinadores", async () => {
  const code = await source("services/marcie-gemini-service.js");
  assert.match(code, /coordinators = Coordinadores académicos, directores y líderes escolares/);
  assert.match(code, /memoria de trabajo, carga cognitiva, funciones ejecutivas, autorregulación, metacognición y neuroplasticidad/);
  assert.match(code, /PROHIBIDO dirigirse a madres o padres, hablar de "tus hijos"/);
  assert.match(code, /indicadores observables de implementación/);
});

test("el normalizador no recicla por posición la propuesta de otra audiencia", async () => {
  const code = await source("services/marcie-mode-service.js");
  assert.match(code, /AUDIENCE_PROPOSAL_FALLBACKS/);
  assert.match(code, /Liderazgo neuropedagógico: convertir la evidencia en decisiones escolares/);
  assert.doesNotMatch(code, /source\[index %/);
});

test("Aida aplica el mismo contrato diferenciado a propuesta y artículo", async () => {
  const code = await source("services/marcie-aida-service.js");
  assert.match(code, /function audienceEditorialDirection/);
  assert.match(code, /coordinadores académicos, directores, subdirectores, jefes de estudio y líderes pedagógicos/);
  assert.match(code, /Contrato específico de audiencia: \$\{audienceEditorialDirection\(audience\)\}/);
  assert.doesNotMatch(code, /generated\[index\]/);
});
