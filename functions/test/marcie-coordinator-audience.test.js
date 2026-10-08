import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../../public/MarcieBlogEditor/js/", import.meta.url);

async function source(relativePath) {
  return readFile(new URL(relativePath, ROOT), "utf8");
}

test("la redacción Marcie contiene un contrato neuropedagógico exclusivo para coordinadores", async () => {
  const code = await source("services/marcie-gemini-service.js");
  assert.match(code, /densidad científica alta/);
  assert.match(code, /Integra el vocabulario editorial configurado sólo cuando el dossier lo respalde/);
  assert.match(code, /densidad científica moderada/);
  assert.match(code, /evita jerga ornamental y neuromitos/i);
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

test("todas las rutas de redacción exigen español neutro latinoamericano", async () => {
  const gemini = await source("services/marcie-gemini-service.js");
  const aida = await source("services/marcie-aida-service.js");
  const voice = await source("services/marcie-agent-voice.js");
  const backend = await readFile(new URL("../../functions/src/marcie-editorial-agent.js", import.meta.url), "utf8");
  assert.match(gemini, /LATAM_ARTICLE_LANGUAGE_POLICY = `VARIANTE REGIONAL OBLIGATORIA: redacta toda la prosa original en español neutro latinoamericano/);
  assert.match(gemini, /\$\{LATAM_ARTICLE_LANGUAGE_POLICY\}/);
  assert.match(aida, /\$\{LATAM_ARTICLE_LANGUAGE_POLICY\}/);
  assert.match(backend, /Redacta un artículo educativo original en español neutro latinoamericano/);
  assert.match(voice, /Lee en español neutro latinoamericano/);
  assert.doesNotMatch(gemini, /natural para lectores de México/);
  assert.doesNotMatch(backend, /español de México/);
});
