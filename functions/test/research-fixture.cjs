// Simulate the independent free-search connector with the existing documentary fixtures.
const actual = require('../src/marcie-editorial-research.js');
function clientWithSearch(client) {
  if (!client) return client;
  return { ...client, researchSearch: async ({ prompt, model }) => {
    const preparedGeneration = await actual.generateResearchContent({ client, model, payload: { contents: [{ role: 'user', parts: [{ text: prompt }] }] } });
    return { sources: actual.parseJsonResponse(preparedGeneration.response).sources || [], results: [], preparedGeneration };
  } };
}
module.exports = { ...actual, ...Object.fromEntries(['researchArticleEvidenceServer', 'researchArticleEvidenceBundleServer'].map(name => [name, options => actual[name]({ ...options, dependencies: { ...options.dependencies, client: clientWithSearch(options.dependencies?.client) } })])) };
