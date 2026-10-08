const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const editor = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/js/editor-app.js"), "utf8");
const visuals = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/js/components/automation-visuals.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/css/MarcieBlogEditor.css"), "utf8");
const html = fs.readFileSync(path.join(root, "public/MarcieBlogEditor.html"), "utf8");
const agentPanel = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/js/components/marcie-agent-panel.js"), "utf8");
const firebaseConfig = require(path.join(root, "firebase.json"));

test("las etiquetas orbitales contrarrotan y permanecen legibles", () => {
  assert.match(visuals, /automation-stage-orbit-layer/);
  assert.match(visuals, /automation-orbit-item/);
  assert.match(visuals, /data-orbit-item-id="\$\{item\.id\}"/);
  assert.match(visuals, /Array\.from\(\{ length: 17 \}/);
  assert.match(visuals, /el\.animate\(keyframes/);
  assert.doesNotMatch(visuals, /\.style\./);
  assert.match(visuals, /stopStageOrbitalAnimation/);
});

test("los chips orbitales tienen tamaño compacto y texto horizontal", () => {
  assert.match(styles, /\.automation-agent-orbit-label \{[\s\S]*min-width: 48px;[\s\S]*min-height: 26px;/);
  assert.match(styles, /\.automation-agent-orbit-label \{[\s\S]*border-radius: 999px;/);
  assert.match(styles, /\.automation-agent-orbit-label \{[\s\S]*white-space: nowrap;/);
  assert.match(styles, /\.automation-agent-orbit-label \{[\s\S]*will-change: transform;/);
  assert.match(styles, /\.automation-agent-orbit-glyph \{[\s\S]*border-radius: 50%/);
  assert.match(styles, /\.automation-agent-orbit\.is-inner span:nth-child\(2\) \{ top: auto; right: 4px; bottom: 12px; left: auto; \}/);
});

test("la automatización muestra el estado de generación dentro de article-view", () => {
  assert.match(editor, /window\.__marcieShowArticleGenerationSpinner\?\.\(session, \{[\s\S]*current: index \+ 1,[\s\S]*total: audiences\.length/);
  assert.match(editor, /finally \{[\s\S]*?window\.__marcieHideArticleGenerationSpinner\?\.\(\);\s*\}/);
  assert.match(editor, /spinnerHost\.setAttribute\("role", "status"\)/);
  assert.match(editor, /Artículo \$\{generationProgress\.current\} de \$\{generationProgress\.total\}/);
  assert.match(styles, /#article-generation-spinner \{[\s\S]*min-height:/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("cambiar de público reutiliza el spinner accesible de article-view", () => {
  const handler = editor.slice(editor.indexOf("async function selectAudienceSafely"), editor.indexOf("async function reconfigureSession"));
  assert.match(handler, /window\.__marcieShowArticleGenerationSpinner\?\.\(session, \{/);
  assert.match(handler, /audienceLabel: getEditorialAudienceLabel\(audience\)/);
  assert.match(handler, /finally \{[\s\S]*window\.__marcieHideArticleGenerationSpinner\?\.\(\)/);
});

test("abrir el enlace normal de Marcie revalida sus recursos sin hard refresh", () => {
  const rule = firebaseConfig.hosting.headers.find(entry => entry.source === "/MarcieBlogEditor/**");
  assert.ok(rule, "Marcie debe tener una política de caché propia");
  assert.match(rule.headers.find(header => header.key === "Cache-Control")?.value || "", /no-cache/);
  assert.match(rule.headers.find(header => header.key === "Cache-Control")?.value || "", /must-revalidate/);
});

test("las fuentes APA se presentan siempre en una sola columna", () => {
  assert.match(html, /id="article-sources-list" class="article-sources-list grid grid-cols-1 sm:grid-cols-2 gap-3"/);
  assert.match(editor, /classList\.toggle\("sm:grid-cols-2", !isApa\)/);
  assert.match(styles, /#article-sources-list\.is-apa \{\s*grid-template-columns: minmax\(0, 1fr\) !important;/);
  assert.match(editor, /data-source-citation-format="\$\{sourceMode\}"/);
});

test("el control editorial comienza después de redactar, antes de esperar las portadas", () => {
  assert.match(editor, /AUTOMATION_STAGE_ORDER = \["proposals", "articles", "review", "covers", "corrections"\]/);
  const workflow = editor.slice(editor.indexOf("async function runAutomatedSessionWorkflow"), editor.indexOf("async function createEditorialSessionFromModal"));
  const reviewStart = workflow.indexOf('saveAutomationStage(session, "review", 50');
  const coverStart = workflow.indexOf('saveAutomationStage(session, "covers", 74');
  assert.ok(reviewStart > 0 && coverStart > reviewStart);
  assert.match(workflow, /articlesByAudience\[audience\.id\] = article;\s*session\.articlesByAudience = \{ \.\.\.articlesByAudience \}/);
  assert.match(workflow, /session\.audience = firstReady\.id;\s*session\.article = articlesByAudience\[firstReady\.id\];\s*}\s*window\.__marcieHideArticleGenerationSpinner/);
});

test("la producción conserva estado local, recupera la sesión y permite cancelar o reconfigurar", () => {
  assert.match(agentPanel, /marcie_agent_guide_v1_\$\{userId\}/);
  assert.match(agentPanel, /responseState, messages: guideMessages, input:/);
  assert.match(agentPanel, /saveGuideWithFallback\(window\.localStorage, window\.sessionStorage, guideStorageKey, snapshot/);
  assert.match(agentPanel, /openVoiceGuide\(\);[\s\S]*guide\.input\.value = String\(saved\.input/);
  assert.match(editor, /marcie_automation_v1_\$\{appState\.currentUser\.uid\}/);
  assert.match(editor, /localStorage\.setItem\(key, marker\)/);
  assert.doesNotMatch(editor, /localStorage\.setItem\(`\$\{key\}_snapshot`, JSON\.stringify\(session\)\)/);
  assert.match(editor, /data-automation-cancel/);
  assert.match(editor, /data-automation-reconfigure/);
  assert.match(editor, /cancellation\.controller\.abort\(\)/);
  assert.match(editor, /\["running", "queued", "failed", "retrying"\]\.includes\(recover\.automation\.status\)/);
});

test("la reanudación envía la variable de propuestas existentes con el nombre correcto", () => {
  assert.match(editor, /const reusableProposals = hasProposalsForAudiences\(session\.proposals, selectedAudienceIds\)/);
  assert.match(editor, /reuseProposals: reusableProposals/);
  assert.doesNotMatch(editor, /\n\s*reuseProposals,\n/);
});

test("el acceso al progreso tiene icono y destello periódico respetando movimiento reducido", () => {
  assert.match(html, /id="btn-automation-progress"[\s\S]*data-lucide="sparkles"/);
  assert.match(html, /class="automation-toolbar-label">Generando/);
  assert.match(styles, /@media \(min-width: 640px\) \{\s*#btn-automation-progress \.automation-toolbar-label \{ display: inline; \}/);
  assert.match(styles, /#btn-automation-progress::after \{[\s\S]*animation: automationBtnSpotlight 9s/);
  assert.match(styles, /@keyframes automationBtnSpotlight/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{\s*#btn-automation-progress,[\s\S]*\.automation-toolbar-spinner \{ animation: none; \}/);
});
