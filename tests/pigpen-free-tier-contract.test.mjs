import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const indexSource = read('../functions/src/index.js');
const freeTierSource = read('../functions/src/gemini-free-tier.js');
const gatewaySource = read('../functions/src/pigpen-text-gateway.js');
const workersSource = read('../functions/src/pigpen-generation-workers.js');
const policySource = read('../functions/src/pigpen-generation-policy.js');
const modelsSource = read('../functions/src/ai-jobs.js');
const savingsSource = read('../functions/src/savings-policy.js');
const browserSource = read('../public/js/PigPenCreator.js');
const backendSource = read('../backend/server.js');

test('the free-tier gateway is mounted before the paid route without editing it', () => {
  assert.equal(indexSource.match(/geminiApp\.post\("\/api\/gemini\/generate"/g).length, 1);
  const gatewayAt = indexSource.indexOf('geminiApp.use(createPigPenTextGateway(');
  const paidAt = indexSource.indexOf('geminiApp.post("/api/gemini/generate"');
  assert.ok(gatewayAt > -1 && gatewayAt < paidAt);
  const route = indexSource.slice(paidAt, indexSource.indexOf('\nregisterSupportGraphicUploadRoute(geminiApp)'));
  assert.match(route, /const client = createVertexClient\(\{ location: ['"]global['"] \}\);/);
  assert.match(route, /generationProfile === ['"]imagecreator['"]/);
});

test('only the free-tier module builds a Developer API client with an API key', () => {
  const sources = readdirSync(new URL('../functions/src/', import.meta.url))
    .filter((name) => name.endsWith('.js'))
    .map((name) => ({ name, text: read(`../functions/src/${name}`) }));
  const builders = sources.filter(({ text }) => /new GoogleGenAI\(\{[^}]*apiKey/.test(text));
  assert.deepEqual(builders.map(({ name }) => name), ['gemini-free-tier.js']);
  // Reusing GEMINI_API_KEY would move ai-jobs.js voice and audio onto the free bucket.
  assert.doesNotMatch(freeTierSource, /process\.env\.GEMINI_API_KEY\b/);
  assert.match(indexSource, /defineSecret\(['"]GEMINI_FREE_TIER_API_KEY['"]\)/);
});

test('every PigPen text stage goes through the free tier and image stays paid', () => {
  assert.match(workersSource, /freeTier\.generateText\(\{[\s\S]*?stage: task\.stage/);
  assert.doesNotMatch(workersSource, /await client\.models\.generateContent\(providerRequest\)/);
  // The image stage builds its own request with responseModalities and must keep the paid client.
  const imageStage = workersSource.slice(workersSource.indexOf("if (task.stage === 'image')"), workersSource.indexOf("if (task.stage === 'review')"));
  assert.match(imageStage, /await client\.models\.generateContent\(request\)/);
  assert.match(imageStage, /responseModalities: \['IMAGE'\]/);
  assert.doesNotMatch(imageStage, /freeTier/);
  const reviewStage = workersSource.slice(workersSource.indexOf("if (task.stage === 'review')"), workersSource.indexOf("if (task.stage === 'assemble')"));
  assert.match(reviewStage, /await request\(\[[\s\S]*run\.config\.reviewModel \|\| 'gemini-3\.5-flash'/);
});

test('the free-tier executor is handed the client the module built', () => {
  // A caller that does not pass freeClient gets the one createFreeTierClient() built; passing
  // the caller's argument instead made every free-tier call die on a null client before it
  // reached the provider, which reads as the free tier being broken rather than this.
  assert.match(freeTierSource, /const client = freeClient \|\| createFreeTierClient\(\);/);
  assert.match(freeTierSource, /await run\(client, freeRequest\)/);
  assert.doesNotMatch(freeTierSource, /await run\(freeClient, freeRequest\)/);
});

test('free-tier decisions are logged as their own event, never as a Vertex alert', () => {
  assert.match(freeTierSource, /event: "gemini_provider_route"/);
  assert.doesNotMatch(freeTierSource, /vertex_resource_exhausted/);
  assert.doesNotMatch(gatewaySource, /vertex_resource_exhausted/);
});

test('exhaustion and deadline are terminal on both halves', () => {
  assert.match(freeTierSource, /if \(isTerminalFreeTierError\(error\)\) throw error;/);
  assert.match(freeTierSource, /\["pigpen_free_tier_exhausted", "pigpen_free_tier_unavailable"\]\.includes\(error\?\.code\)/);
  assert.match(gatewaySource, /pigpen_free_tier_exhausted/);
  assert.match(gatewaySource, /pigpen_free_tier_unavailable/);
  assert.match(gatewaySource, /gemini_upstream_timeout/);
  assert.doesNotMatch(gatewaySource, /createVertexClient/);
});

test('the free model is the selector default and paid needs an explicit change', () => {
  // The catalog offer is the only source of the default: no browser-side list decides that
  // a paid model may bill, and the built-in id stays as the fallback for when there is no offer.
  assert.match(browserSource, /let TEXT_MODEL_DEFAULT = BUILTIN_TEXT_MODEL_DEFAULT;/);
  assert.match(browserSource, /if \(freeModel\) TEXT_MODEL_DEFAULT = freeModel;/);
  assert.match(modelsSource, /freeTier: freeTier\.describeFreeTierOffer\(\)/);
  assert.match(freeTierSource, /function describeFreeTierOffer\(\)[\s\S]*?isFreeTierEnabled\(\) && Boolean\(String\(process\.env\.GEMINI_FREE_TIER_API_KEY \|\| ""\)\.trim\(\)\)/);
  // A turn that names the free model stops instead of paying; a different name is honored.
  assert.match(freeTierSource, /if \(selection\.paidModelSelected\) return \{ useFreeTier: false, reason: "paid_model_selected"/);
  assert.match(freeTierSource, /if \(route\.explicitFreeSelection\) throw unavailableError\(route\.reason\);/);
  assert.match(gatewaySource, /requestedModel: String\(req\.body\?\.model \|\| ""\)\.trim\(\)/);
  // Content stages send the selector value; only the reviewer's service-chosen model abstains.
  assert.match(workersSource, /requestedModel: task\.stage === 'review' \? null : context\.modelo/);
  // A run config that carries no model means the free default, never a paid id.
  assert.match(policySource, /value\.modelo = value\.contentModel \|\| value\.modeloObjetivo \|\| value\.modelo \|\| \(offer\.enabled \? offer\.model : 'gemini-2\.5-flash'\);/);
  // The free tier is not a savings level: it applies with the mode off too, and the panel
  // reports it in every level.
  assert.doesNotMatch(freeTierSource, /getPolicy|savings_level|policy\.level/);
  assert.match(savingsSource, /result\.freeTier = await freeTier\.describeFreeTierState\(db\);/);
});

test('a dead Vertex catalog still reports the free tier', () => {
  // During a spend cap or quota outage the paid list is exactly what fails, and a 403 here
  // would leave the selector with no offer and PigPen's text on a model that cannot answer.
  assert.match(modelsSource, /let catalogError = null;/);
  assert.match(modelsSource, /const pager = await client\.models\.list\(\{/);
  assert.match(modelsSource, /catch \(error\) \{\s*catalogError = String\(error\?\.message \|\| error\)\.slice\(0, 300\);/);
  assert.match(modelsSource, /res\.status\(200\)\.json\(\{\s*models,\s*freeTier: freeTier\.describeFreeTierOffer\(\),/);
  assert.match(modelsSource, /\.\.\.\(catalogError \? \{ catalogError \} : \{\}\)/);
  assert.match(browserSource, /const outageNote = payload\?\.catalogError \?/);
});

test('the browser never switches a free-tier turn to a model of cobro', () => {
  // Both halves of the model ladder are gated on the proxy's own marker: the answer it
  // served, and the free-tier failure it refused to answer.
  assert.match(browserSource, /if \(response\?\.charlyProvider === "aistudio-free"\) onFreeTier = true;/);
  assert.match(browserSource, /const freeTierTurn = onFreeTier \|\| error\?\.detail\?\.freeTier === true;/);
  assert.match(browserSource, /if \(textOnly && !freeTierTurn && \(isGeminiQuotaExhausted\(error\) \|\| error\?\.code === 'pigpen_invalid_text_content'\) && !modelFallbackUsed\) \{/);
  assert.match(browserSource, /quotaRetries >= 2 \|\| \(error\?\.detail\?\.freeTier === true && error\?\.detail\?\.permanentToday === true\)/);
  assert.match(gatewaySource, /body\.charlyProvider = "aistudio-free";/);
  assert.match(gatewaySource, /freeTier: true,/);
});

test('the gateway is mounted with the same two deadlines the paid route uses', () => {
  assert.match(indexSource, /createPigPenTextGateway\(\{[\s\S]*?contentTimeoutMs: PIGPEN_CONTENT_TIMEOUT_MS,[\s\S]*?providerTimeoutMs: GEMINI_PROVIDER_TIMEOUT_MS/);
  assert.match(gatewaySource, /new Set\(\[PIGPEN_FIXED_CONTENT_PROFILE, PIGPEN_TEXT_PROFILE\]\)/);
});

test('every PigPen browser text turn is tagged and image turns are not', () => {
  // A turn without a PigPen profile falls through to the paid route unnoticed, so the
  // tagging lives in the three request builders and nowhere else.
  assert.match(browserSource, /generationProfile: textOnly \? "pigpen-fixed-content" : "pigpen-text"/);
  assert.equal((browserSource.match(/generationProfile: "pigpen-text"/g) || []).length, 2, 'the JSON repairers must send the text profile');
  assert.deepEqual([...new Set([...browserSource.matchAll(/generationProfile[^,;)]*?"([a-z-]+)"/g)].map((match) => match[1]))].sort(), ['pigpen-fixed-content', 'pigpen-text']);
  const imageHelper = browserSource.slice(
    browserSource.indexOf('async function generateGeminiImage('),
    browserSource.indexOf('function yieldToBrowser(')
  );
  assert.match(imageHelper, /responseModalities: \["IMAGE"\]/);
  assert.doesNotMatch(imageHelper, /generationProfile/);
});

test('the free tier asks for no image and leaves each slot its prompt', () => {
  // The offer, not a browser-side list, decides that images wait: no free model reported means
  // automatic images keep working exactly as before.
  assert.match(browserSource, /const freeModel = normalizeGeminiCatalogModelId\(elements\.objetivoModeloSelect\?\.dataset\.freeTierModel \|\| ""\);/);
  assert.match(browserSource, /function rememberManualImagePrompt\(target = \{\}, prompt = ""\)/);
  const missionImages = browserSource.slice(
    browserSource.indexOf('async function generateMissionImages('),
    browserSource.indexOf('function getQuestionComparisonText(')
  );
  assert.match(missionImages, /const manual = manualImageMode\(context\?\.modelo\);/);
  assert.match(missionImages, /rememberManualImagePrompt\(mission, missionPrompt\);/);
  assert.match(missionImages, /rememberManualImagePrompt\(question, questionPrompt\);/);
  // The provider call only happens on the paid half of the branch.
  assert.match(missionImages, /\} else try \{\s*const generatedImage = await generateValidatedImage\(missionPrompt/);
  assert.match(missionImages, /\} else try \{\s*const generatedImage = await generateValidatedImage\(questionPrompt/);
  assert.match(missionImages, /return \{ generated, failed, deferred, total, error: firstError \};/);

  const imagePhase = browserSource.slice(
    browserSource.indexOf('const imageStorageContext = await resolveGeneratedImageStorageContext();'),
    browserSource.indexOf('} catch (imageError) {')
  );
  assert.match(imagePhase, /const manualImages = manualImageMode\(formData\.modelo\);/);
  assert.match(imagePhase, /needsCoverImage && !manualImages \? await generateCoverImage/);
  assert.match(imagePhase, /if \(needsEndingImage && !manualImages\) \{/);
  assert.match(imagePhase, /if\(!manualImages\)await ensureRewardImage\(project,formData\);/);
  // A slot left for the author is not a failed image, and the savings claim must not hang on it.
  assert.match(imagePhase, /const failedImages = imageStats\.failed\s*\+ \(coverRequested && !manualImages/);
  assert.doesNotMatch(imagePhase, /await generateValidatedImage\(/);
});

test('every manual image button says the same instead of billing', () => {
  assert.equal((browserSource.match(/if \(manualImageMode\(\)\) return blockManualImageAction\(\);/g) || []).length, 5,
    'cover, ending, reward, mission and question each stop on the same instruction');
});

test('the local proxy accepts the same owner segment as the deployed upload route', () => {
  // toBackendStoragePath lowercases the uid, so comparing the raw uid 403-ed every hand-made
  // upload on :8787 while the functions route (uploads.js sanitizeSegment) accepted it.
  assert.match(backendSource, /const ownerSegment = String\(uid \|\| ""\)/);
  assert.match(backendSource, /!storagePath\.includes\(`\/\$\{ownerSegment\}\/`\)/);
  assert.doesNotMatch(backendSource, /!storagePath\.includes\(`\/\$\{uid\}\/`\)/);
});
