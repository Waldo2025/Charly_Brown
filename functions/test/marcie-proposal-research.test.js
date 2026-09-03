const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const mode = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/js/services/marcie-mode-service.js"), "utf8");
const store = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/js/services/marcie-session-store.js"), "utf8");
const gemini = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/js/services/marcie-gemini-service.js"), "utf8");
const pipeline = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/js/components/pipeline-stepper.js"), "utf8");

test("each proposal receives and persists an audience-specific dossier", () => {
  assert.match(mode, /session\.researchByAudience\[audience\] = dossier/);
  assert.match(mode, /topic: `\$\{proposal\.title[\s\S]*?audience,/);
  assert.match(mode, /proposal\.verifiedSourceCount = verifiedSourceCount/);
  assert.match(store, /researchByAudience: normalizeFirestoreJson/);
  assert.match(store, /data\.researchByAudience/);
});

test("drafting uses the audience dossier instead of the global trend dossier", () => {
  assert.match(mode, /const researchDossier = await ensureAudienceResearchForDraft/);
  assert.match(mode, /Object\.prototype\.hasOwnProperty\.call\(existingMap, normalizedAudience\)/);
  const draftSection = mode.slice(mode.indexOf("export async function draftArticleForMode"), mode.indexOf("const AUDIENCE_LABELS"));
  assert.doesNotMatch(draftSection, /session\.trends\?\.\[0\]/);
});

test("manual drafting creates the same researched proposal contract as automation", () => {
  assert.match(mode, /id: `manual-\$\{normalizedAudience\}`/);
  assert.match(mode, /origin: "manual"/);
  assert.match(mode, /Object\.assign\(proposal, \{ sourceIds:[\s\S]*?researchStatus:[\s\S]*?verifiedSourceCount[\s\S]*?targetSourceCount: 6/);
  assert.match(mode, /onResearchProgress/);
});

test("verified attributions and complete APA bibliographies are part of the article contract", () => {
  assert.match(gemini, /applyVerifiedAttributions/);
  assert.match(gemini, /entre 2 y 3 referencias atribuidas/);
  assert.match(gemini, /sourceIds/);
  assert.match(pipeline, /Ver bibliografía de esta propuesta/);
  assert.match(pipeline, /mergedSources/);
});
