const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createResearchPool, withAbortDeadline, requestDeadline } = require('../src/marcie-research-runtime.js');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('research pool overlaps ten calls and holds the eleventh until a slot is free', async () => {
  const pool = createResearchPool(10);
  let active = 0, peak = 0;
  const releases = [];
  const results = Array.from({ length: 12 }, (_, i) => pool(async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => releases.push(resolve));
    active--; return i;
  }));
  await tick();
  assert.equal(releases.length, 10);
  releases.shift()();
  await tick();
  assert.equal(releases.length, 10);
  releases.splice(0).forEach(release => release());
  await tick();
  releases.splice(0).forEach(release => release());
  assert.deepEqual(await Promise.all(results), Array.from({ length: 12 }, (_, i) => i));
  assert.equal(peak, 10);
});

test('cancelled queued research never calls the provider', async () => {
  const pool = createResearchPool(1), controller = new AbortController();
  let release, calls = 0;
  const first = pool(() => new Promise(resolve => { release = resolve; }));
  await tick();
  const second = pool(() => { calls++; }, controller.signal);
  const rejected = assert.rejects(second, /cancelled/);
  controller.abort(new Error('cancelled'));
  await rejected;
  release(); await first; await tick();
  assert.equal(calls, 0);
});

test('deadline aborts provider work, ignores late completion and allows the next request', async () => {
  const pool = createResearchPool(1);
  let signal, finishLate;
  await assert.rejects(pool(() => withAbortDeadline(current => {
    signal = current;
    return new Promise(resolve => { finishLate = resolve; });
  }, 10, 'research_timeout')), error => error.code === 'research_timeout');
  assert.equal(signal.aborted, true);
  assert.equal(await pool(async () => 'next request'), 'next request');
  finishLate('stale response');
});

test('closing the HTTP response cancels its research and removes the listener', async () => {
  const res = new EventEmitter();
  let signal;
  const operation = requestDeadline({}, res, current => { signal = current; return new Promise(() => {}); }, 1000, 'timeout');
  const rejected = assert.rejects(operation, error => error.code === 'marcie_request_disconnected');
  await tick(); res.emit('close'); await rejected;
  assert.equal(signal.aborted, true);
  assert.equal(res.listenerCount('close'), 0);
});

test('global evidence is checkpointed before failed selection and reused on resume', async () => {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../../public/MarcieBlogEditor/js/services/marcie-gemini-service.js'), 'utf8');
  const code = source.slice(source.indexOf('export async function researchArticleEvidenceBundle('), source.indexOf('export async function verifyArticleEvidence(')).replace('export ', '');
  let searches = 0, selections = 0, checkpoint;
  const context = vm.createContext({
    getConfiguredGeminiModel: () => 'model', console,
    researchArticleEvidence: async () => { searches++; return { sources: [{ id: 'saved', verificationStatus: 'verified' }] }; },
    authenticatedJsonRequestWithRetry: async () => {
      assert.equal(checkpoint.sources[0].id, 'saved');
      if (++selections === 1) throw Object.assign(new Error('selection unavailable'), { status: 503 });
      return { byAudience: {} };
    }
  });
  vm.runInContext(code, context);
  const options = { audiences: ['parents', 'educators'], onGlobalResearch: async dossier => { checkpoint = dossier; } };
  await assert.rejects(context.researchArticleEvidenceBundle(options), /selection unavailable/);
  await context.researchArticleEvidenceBundle({ ...options, existingGlobalDossier: checkpoint });
  assert.equal(searches, 1);
  assert.equal(selections, 2);
});

test('HTTP research overlaps selected platforms, deduplicates and verifies before returning evidence', async () => {
  const { researchArticleEvidenceServer } = require('./research-fixture.cjs');
  let active = 0, peak = 0, searches = 0;
  const checked = [];
  const json = value => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] });
  const client = { models: { generateContent: async request => {
    const prompt = request.contents[0].parts[0].text;
    if (prompt.includes('Extrae referencias atribuibles')) return json({ attributedReferences: [] });
    const index = ++searches;
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 15));
    active--;
    return json({ sources: [
      { id: 'common', url: 'https://scielo.org/common', title: 'Shared paper' },
      { id: `s${index}`, url: `https://scielo.org/paper-${index}`, title: `Paper ${index}` }
    ], facts: [], currentSignals: [], historicalMilestones: [] });
  } } };
  const dossier = await researchArticleEvidenceServer({ topic: 'Aprendizaje', minimumSources: 4,
    searchPlatforms: ['scielo', 'redalyc', 'dialnet'], timeBudgetMs: 150_000,
    dependencies: { client, verifyCandidateSources: async ({ candidates }) => {
      checked.push(...candidates.map(source => source.url));
      return { verifiedSources: candidates.map(source => ({ ...source, year: '2020', verificationStatus: 'verified', supportSummary: 'Document checked', evidenceRole: 'historical' })), rejectedSources: [], retrievedPages: [] };
    } }
  });
  assert.equal(peak, 3);
  assert.equal(searches, 3);
  assert.equal(checked.length, 4);
  assert.equal(new Set(checked).size, 4);
  assert.equal(dossier.sources.length, 4);
  assert.ok(dossier.sources.every(source => source.verificationStatus === 'verified'));
});

test('a research slice returns its checkpoint when the budget interrupts verification', async () => {
  const { researchArticleEvidenceServer } = require('./research-fixture.cjs');
  let providerSignal;
  const client = { models: { generateContent: async request => {
    const prompt = request.contents[0].parts[0].text;
    if (prompt.includes('verificador documental estricto')) {
      providerSignal = request.config.abortSignal;
      return new Promise(() => {});
    }
    return { candidates: [{ content: { parts: [{ text: JSON.stringify({ sources: [{ id: 's1', title: 'Study', url: 'https://scielo.org/study' }] }) }] } }] };
  } } };
  const result = await researchArticleEvidenceServer({ topic: 'Aprendizaje', minimumSources: 4, searchPlatforms: ['scielo'], timeBudgetMs: 40,
    dependencies: { client, verifyCandidateSources: async ({ candidates, assessSources }) => {
      try { await assessSources({ context: 'topic', pages: [{ id: 's1', text: 'Evidence' }] }); }
      catch { return { verifiedSources: [], rejectedSources: candidates.map(source => ({ ...source, reason: 'verification_error' })), retrievedPages: [] }; }
    } }
  });
  assert.equal(providerSignal.aborted, true);
  assert.equal(result.pendingCandidates.length, 1);
  assert.equal(result.pendingCandidates[0].url, 'https://scielo.org/study');
});
