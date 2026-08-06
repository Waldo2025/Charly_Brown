import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-app.js", import.meta.url), "utf8");
const resultsSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-results.js", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf.css", import.meta.url), "utf8");

test("opening a finding updates only the quick-detail panel and preserves the Muuri rail", () => {
  const handlerStart = resultsSource.indexOf('if (action === "show-page-fragments")');
  const handlerEnd = resultsSource.indexOf('if (action === "toggle-hide-outside-text")', handlerStart);
  const findingHandler = resultsSource.slice(handlerStart, handlerEnd);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  assert.match(
    resultsSource,
    /function renderQuickDetailOnly\(session = null\)[\s\S]*?pageReportsEl\.innerHTML = shouldShow/
  );
  assert.match(
    findingHandler,
    /renderQuickDetailOnly\(session\);[\s\S]*?return;/
  );
  assert.doesNotMatch(findingHandler, /\brender\(session\);/);
});

test("the full-analysis character remains alive through quick finding search and persistence", () => {
  assert.match(
    appSource,
    /keepMagicSpriteAlive: state\.isAnalyzingAll === true/
  );
  assert.match(
    appSource,
    /completeAnalysisSprite\(magicSpriteToken,[\s\S]*?keepAlive: context\?\.keepMagicSpriteAlive === true/
  );
  assert.match(
    appSource,
    /async function handleQuickAnalyzeAll\(options = \{\}\)[\s\S]*?retargetAnalysisSprite\(magicSpriteToken, spriteContext\)[\s\S]*?await persistLocalAnalysisSession\(next\)/
  );
  assert.match(
    appSource,
    /await handleQuickAnalyzeAll\(\{\s*magicSpriteToken: initialMagicSpriteToken,\s*keepMagicSpriteAlive: true,\s*\}\)/
  );
});

test("selecting a file card toggles the final matching analyzed rail item", () => {
  assert.match(
    resultsSource,
    /\.analizar-pdf-ortho-rail-group\.is-complete\.has-analysis\[data-rail-group-key\]/
  );
  assert.match(
    appSource,
    /const selectedFileId = String\(selectedFile\?\.id \|\| ""\)\.trim\(\);[\s\S]*?mutateActiveSession\([\s\S]*?\{ render: false \}\);[\s\S]*?renderActiveSession\(\{ preserveResultsRail: true \}\);[\s\S]*?toggleFileRailGroup\(revisionId, selectedFileId\);/
  );
  assert.doesNotMatch(
    appSource.slice(appSource.indexOf('els.revisionList?.addEventListener("click"'), appSource.indexOf('els.revisionList?.addEventListener("dragstart"')),
    /renderAll\(\)/
  );
  assert.match(
    appSource,
    /async function rehydrateSelectedFilesForActiveContext\(options = \{\}\)[\s\S]*?renderActiveSession\(options\);/
  );
  assert.match(
    appSource.slice(appSource.indexOf('els.revisionList?.addEventListener("click"'), appSource.indexOf('els.revisionList?.addEventListener("dragstart"')),
    /rehydrateSelectedFilesForActiveContext\(\{ preserveResultsRail: true \}\)/
  );
  assert.match(
    resultsSource,
    /const shouldOpen = details\.open !== true;[\s\S]*?details\.open = shouldOpen;[\s\S]*?requestAnimationFrame\(\(\) => scheduleRailMasonryLayout\(\)\)/
  );
});

test("the sticky hero does not intercept file cards visible underneath", () => {
  assert.match(cssSource, /\.analizar-pdf-hero \{[\s\S]*?pointer-events:\s*none;/);
  assert.match(
    cssSource,
    /\.analizar-pdf-hero :where\(button, input, select, textarea, label, a, \[tabindex\]\),\s*#analizarPdfEditorialPanel \{\s*pointer-events:\s*auto;/
  );
});

test("finding detail renders its full paragraph and toggles a separate full-page card", () => {
  assert.match(resultsSource, /paragraphText: String\(issue\?\.paragraphText/);
  assert.match(resultsSource, /data-action="toggle-full-page-text"/);
  assert.match(resultsSource, /class="analizar-pdf-full-page-text-card" hidden/);
  assert.match(resultsSource, /pageCard\.hidden = !shouldShow/);
});

test("IDML notes and tracked changes have independent rail details", () => {
  assert.match(resultsSource, /renderChangeControlMetaList\(page\.notes, page\.noteHistory, page\.trackedChanges\)/);
  assert.match(resultsSource, /\{ id: "notes", label: "Notas" \}/);
  assert.match(resultsSource, /\{ id: "tracked-changes", label: "Control de cambios" \}/);
  assert.match(resultsSource, /InsertedText: "Texto insertado"/);
  assert.match(resultsSource, /DeletedText: "Texto eliminado"/);
  assert.match(resultsSource, /MovedText: "Texto movido"/);
});

test("quick detail routes notes, tracked changes and recortables to their own content", () => {
  assert.match(resultsSource, /detailKind: String\(target\?\.dataset\?\.detailKind \|\| railCategory \|\| "orthotypography"\)/);
  assert.match(resultsSource, /selectedQuickPage\.detailKind === selection\.detailKind/);
  assert.match(resultsSource, /if \(detailKind === "notes"\)[\s\S]*?renderNotesMetaList\(page\?\.notes, page\?\.noteHistory\)/);
  assert.match(resultsSource, /if \(detailKind === "tracked-changes"\)[\s\S]*?renderTrackedChangesMetaList\(page\?\.trackedChanges\)/);
  assert.match(resultsSource, /if \(detailKind === "recortables"\)[\s\S]*?renderRecortableMetaList\(page/);
  assert.match(resultsSource, /Notas editoriales detectadas/);
  assert.match(resultsSource, /Cambios rastreados detectados/);
  assert.match(resultsSource, /Recortables, fichas, anexos y videos detectados/);
});

test("the volcanic animation uses words extracted from the analyzed IDML", () => {
  assert.match(appSource, /function collectIdmlAnimationWords\(result = null, limit = 8\)/);
  assert.match(appSource, /async function extractIdmlAnimationWordsFromFile\(file = null, limit = 32\)/);
  assert.match(appSource, /new DecompressionStream\("deflate-raw"\)/);
  assert.match(appSource, /primeAnalysisSpriteWords\(magicSpriteToken, selectedFile\)/);
  assert.match(appSource, /result\?\.stats\?\.pageReports/);
  assert.match(appSource, /const pageText = String\(page\?\.pageText/);
  assert.match(appSource, /payload\?\.result\?\.stats\?\.pageReports\?\.length[\s\S]*?collectIdmlAnimationWords\(payload\.result, 20\)[\s\S]*?resolveAnalysisAnimationWords\(deliveryContext\.revisionId, deliveryContext\.fileId, 20\)/);
  assert.match(appSource, /const eruptionWords = Array\.isArray\(context\?\.words\)/);
});

test("preparation, extraction, analysis and saving continuously advance the rail fill", () => {
  assert.match(appSource, /function startProgressiveAnalysisWords\(record = null, options = \{\}\)/);
  assert.match(appSource, /function launchProgressiveAnalysisWord\(record = null\)/);
  assert.match(appSource, /function syncAnalysisSpriteProgressStage\(token = "", status = ""\)/);
  assert.match(appSource, /phase: "preparing-session"[\s\S]*?maxProgress: \.12/);
  assert.match(appSource, /phase: "extracting-styles"[\s\S]*?maxProgress: \.2/);
  assert.match(appSource, /phase: "preparing-file"[\s\S]*?maxProgress: \.28/);
  assert.match(appSource, /phase: "reading-source"[\s\S]*?maxProgress: \.36/);
  assert.match(appSource, /phase: "uploading-source"[\s\S]*?maxProgress: \.48/);
  assert.match(appSource, /normalized === "queued"[\s\S]*?phase: "extracting"[\s\S]*?maxProgress: \.58/);
  assert.match(appSource, /normalized === "processing"[\s\S]*?phase: "analyzing"[\s\S]*?maxProgress: \.76/);
  assert.match(appSource, /const isSameTarget = [\s\S]*?if \(!isSameTarget\) \{[\s\S]*?record\.railFillProgress = 0/);
  assert.match(appSource, /record\.progressWordMaxProgress = Math\.max\(currentProgress, requestedMaxProgress\)/);
  assert.doesNotMatch(appSource, /analizar-pdf-magic-orb(?:\s|"|')/);
  assert.match(appSource, /stopProgressiveAnalysisWords\(activeAnalysisSprites\.get\(magicSpriteToken\)\)/);
  assert.match(appSource, /eruptionFillLimit - baseFillProgress/);
  assert.match(appSource, /phase: "saving"[\s\S]*?maxProgress: \.96/);
  assert.match(appSource, /finalizeVerticalFill: true/);
  assert.match(appSource, /advanceRailWordColorFill\(target, 1/);
});

test("rail color fills bottom-up and finishes with falling words", () => {
  assert.match(cssSource, /\.analizar-pdf-rail-color-fill \{[\s\S]*?transform: scaleY\(0\);[\s\S]*?transform-origin: 50% 100%/);
  assert.match(cssSource, /\.analizar-pdf-rail-word-splash/);
  assert.match(appSource, /word\.className = `analizar-pdf-rail-word-splash/);
  assert.match(appSource, /word\.textContent = resolveSpriteAnimationWord/);
  assert.match(appSource, /const isFinalFill = safeProgress >= 1/);
  assert.match(appSource, /duration: 2420/);
  assert.match(appSource, /window\.setTimeout\(\(\) => resolve\(target\), 2500\)/);
});

test("rail fill and completed item use the exact extracted swatch with a white sheen", () => {
  assert.match(
    cssSource,
    /\.analizar-pdf-rail-color-fill \{[\s\S]*?background:\s*var\(--analizar-pdf-rail-tint, #7381ca\)/
  );
  assert.match(
    cssSource,
    /\.analizar-pdf-rail-color-fill::after \{[\s\S]*?rgba\(255, 255, 255, \.9\)[\s\S]*?analizar-pdf-metal-sheen 3\.8s/
  );
  assert.match(
    cssSource,
    /\.analizar-pdf-ortho-rail-group\.has-analysis > summary \{[\s\S]*?background:\s*var\(--analizar-pdf-rail-tint, #69717d\);[\s\S]*?color:\s*var\(--analizar-pdf-rail-ink, #182034\)/
  );
  assert.match(
    cssSource,
    /\.analizar-pdf-ortho-rail-group\.is-complete\.has-analysis > summary::after \{[\s\S]*?analizar-pdf-rail-item-sheen 6\.8s/
  );
});

test("rail text contrast and relief adapt to the extracted color brightness", () => {
  assert.match(resultsSource, /const perceivedBrightness = Math\.sqrt\([\s\S]*?perceivedBrightness < \.64 \? "#ffffff" : "#111827"/);
  assert.match(resultsSource, /function resolveRailTextRelief\(ink = ""\)/);
  assert.match(resultsSource, /rgba\(0,0,0,\.28\),0 0 2px rgba\(255,255,255,\.14\)/);
  assert.match(resultsSource, /rgba\(255,255,255,\.32\),0 0 1px rgba\(255,255,255,\.12\)/);
  assert.match(resultsSource, /--analizar-pdf-rail-text-relief:\$\{resolveRailTextRelief\(ink\)\}/);
  assert.match(resultsSource, /"--analizar-pdf-rail-text-relief"/);
  assert.match(
    cssSource,
    /\.analizar-pdf-ortho-rail-group\.has-analysis > summary \{[\s\S]*?text-shadow:\s*var\(--analizar-pdf-rail-text-relief/
  );
  assert.match(
    cssSource,
    /\.analizar-pdf-ortho-rail-group\.has-analysis > summary \.analizar-pdf-summary-toggle \{[\s\S]*?color:\s*inherit;[\s\S]*?text-shadow:\s*inherit;/
  );
  assert.match(
    cssSource,
    /\.analizar-pdf-ortho-rail-group\.is-complete > summary > span,[\s\S]*?font-weight:\s*600;/
  );
});

test("inline rail action buttons shimmer without receiving a background", () => {
  assert.match(
    cssSource,
    /\.analizar-pdf-rail-selection-toggle \{[\s\S]*?overflow:\s*hidden;[\s\S]*?background:\s*transparent;/
  );
  assert.match(
    cssSource,
    /\.analizar-pdf-rail-selection-toggle::before \{[\s\S]*?linear-gradient\(90deg, transparent, rgba\(255,255,255,\.82\), transparent\)[\s\S]*?analizar-pdf-metal-sheen 4\.8s/
  );
  assert.match(
    cssSource,
    /\.analizar-pdf-rail-selection-toggle:hover,[\s\S]*?background:\s*transparent;/
  );
  assert.match(cssSource, /prefers-reduced-motion:[\s\S]*?\.analizar-pdf-inline-actions \.analizar-pdf-rail-selection-toggle::before/);
});

test("advanced rail filters remain available but start disabled", () => {
  assert.match(resultsSource, /\{ id: "redaction", label: "Propuestas de redacción", defaultVisible: false \}/);
  assert.match(resultsSource, /\{ id: "text-status", label: "Texto fuera o desbordado", defaultVisible: false \}/);
  assert.match(resultsSource, /\{ id: "field-profile", label: "Campo formativo", defaultVisible: false \}/);
  assert.match(resultsSource, /item\.defaultVisible !== false/);
  assert.match(resultsSource, /Object\.prototype\.hasOwnProperty\.call\(stored, item\.id\)/);
  assert.match(resultsSource, /isRailCategoryVisible\("redaction"\)/);
  assert.match(resultsSource, /isRailCategoryVisible\("text-status"\)/);
  assert.match(resultsSource, /isRailCategoryVisible\("field-profile"\)/);
});

test("finishing one file updates only its existing rail item", () => {
  const updaterStart = resultsSource.indexOf("function updateRailEntry(session = null");
  const updaterEnd = resultsSource.indexOf("function bindEvents()", updaterStart);
  const updaterSource = resultsSource.slice(updaterStart, updaterEnd);
  assert.ok(updaterStart >= 0 && updaterEnd > updaterStart);
  assert.match(updaterSource, /matchesTarget/);
  assert.match(updaterSource, /currentBody\.innerHTML = replacementBody\.innerHTML/);
  assert.match(updaterSource, /destroyRailMasonryLayoutFor\(currentBody\)/);
  assert.match(updaterSource, /createRailMasonryLayout\(currentBody\)/);
  assert.doesNotMatch(updaterSource, /railRootEl\.innerHTML\s*=/);
  assert.doesNotMatch(updaterSource, /current\.replaceWith|current\.outerHTML\s*=/);
  assert.match(appSource, /updateTargetRailOnly: true/);
  assert.match(appSource, /resultsRenderer\.updateRailEntry/);
  assert.match(
    appSource,
    /renderAll\(\{ preserveResultsRail: updateTargetRailOnly \}\)/
  );
});
