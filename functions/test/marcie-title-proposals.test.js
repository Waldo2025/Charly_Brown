const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

function proposalContract() {
  const context = vm.createContext({});
  vm.runInContext(read("public/MarcieBlogEditor/js/services/marcie-title-proposals.js").replace(/\bexport /g, ""), context);
  return context;
}

test("title proposals remain isolated by audience and contain three items per category", () => {
  const contract = proposalContract();
  const byAudience = contract.normalizeTitleProposalsByAudience({
    byAudience: {
      educators: { topic: "Memoria", hooks: ["Docente 1", "Docente 2", "Docente 3"], contrahooks: ["Docente A", "Docente B", "Docente C"] },
      parents: { topic: "Memoria", hooks: ["Familia 1", "Familia 2", "Familia 3"], contrahooks: ["Familia A", "Familia B", "Familia C"] }
    }
  });
  const educators = contract.titleProposalsForAudience(byAudience, "educators");
  const parents = contract.titleProposalsForAudience(byAudience, "parents");
  assert.equal(educators.hooks.length, 3);
  assert.equal(educators.contrahooks.length, 3);
  assert.equal(parents.hooks.length, 3);
  assert.notEqual(educators.hooks[0].title, parents.hooks[0].title);
  assert.deepEqual(Object.keys(contract.serializeTitleProposals(byAudience).byAudience), ["parents", "educators"]);
});

test("legacy title proposals remain readable without contaminating the new stored shape", () => {
  const contract = proposalContract();
  const byAudience = contract.normalizeTitleProposalsByAudience({ hooks: ["Anterior"], contrahooks: ["Anterior crítica"] });
  assert.equal(contract.titleProposalsForAudience(byAudience, "students").hooks[0].title, "Anterior");
  assert.equal(contract.serializeTitleProposals(byAudience).schemaVersion, 2);
});

test("the editorial-session modal generates and renders proposals by active audience", () => {
  const modal = read("public/MarcieBlogEditor/js/components/modals.js");
  const service = read("public/MarcieBlogEditor/js/services/marcie-gemini-service.js");
  assert.match(modal, /titleProposalsByAudience\[audience\]/);
  assert.match(modal, /ALL_AUDIENCE_KEYS\.filter\(\(audience\) => selectedAudiences\.has\(audience\)\)/);
  assert.match(modal, /onRefineTopic\(audienceTopic,[\s\S]*?audience, readPreferredVocabulary\(\)\)/);
  assert.match(modal, /titleProposalsForAudience\(titleProposalsByAudience, activeAudienceScope\)/);
  assert.match(modal, /3 Títulos con Antihook/);
  assert.match(service, /Público objetivo exclusivo: \$\{audienceLabel\}/);
  assert.match(service, /No reutilices títulos genéricos pensados para otro público/);
});
