// Reuse the editor's authoring contracts in Node without loading its DOM or Firebase UI.
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');
const esbuild = require('esbuild');
const source = fs.readFileSync('public/js/PigPenCreator.js', 'utf8');
const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
const roots = [
  'buildObjectiveSourceContract', 'buildDeterministicQuestionPlanTemplate', 'requestFixedFoundationContent',
  'buildObjectiveFoundationResponseSchema', 'buildObjectiveFoundationPrompt', 'normalizeObjectiveBrief', 'requestThematicObjectiveUnlockWord',
  'buildObjectiveRoomFillResponseSchema', 'buildRoomBundleResponseSchema', 'getRequiredBriefingEvidenceCount',
  'buildFixedRoomContent', 'buildFixedRoomTextPrompt', 'materializeFixedRoomContent', 'validateFixedObjectiveFill',
  'buildObjectiveRoomFillPrompt', 'requestFixedObjectiveRoomFill', 'mergeFilledQuestionPlanWithTemplate',
  'requestGeneratedRoomBundle', 'setObjectiveGeneratedRoom', 'attachObjectiveCompilationMetadata', 'formatObjectiveBrief',
  'buildDeterministicRoomCompletionFeedback', 'buildDeterministicFinalUnlockFeedback',
  'buildPrivateProjectShell', 'assemblePrivateGenerationDraft', 'buildAcademicPreviewTheme', 'applyAcademicMissionPalettes',
  'stripTemporaryCoverageAnchors', 'preserveExistingProjectImages', 'getReusableObjectiveGeneratedMission',
  'buildInteractionPlanFromObjectiveBlueprint', 'buildCoverVisualPrompt', 'buildRoomVisualPrompt',
  'buildQuestionVisualPrompt', 'buildVisualDirection', 'selectQuestionImageIndexes', 'extractJsonFromGeminiResponse',
  'fixedSchemaValue', 'contentDocument', 'contentInstructions', 'fillContentDocument', 'normalizeThematicFinalWord',
  'partitionThematicFinalWord', 'normalizeObjectiveUnlockFragment', 'materializeObjectiveBlueprintMechanics',
  'pedagogicalRoomIssues', 'composePedagogicalRoom', 'coordinateRiddleIssues', 'expressionRiddleIssues', 'findRepeatedQuestionPlans',
  'normalizeEscapeRoomProject', 'experience', 'rewardEngine', 'selectedExperienceInstruction'
];
const imports = new Map(), declarations = new Map();
for (const node of ast.body) {
  if (node.type === 'ImportDeclaration') for (const spec of node.specifiers) imports.set(spec.local.name, { node, spec });
  if (node.type === 'FunctionDeclaration') declarations.set(node.id.name, { node, code: source.slice(node.start, node.end) });
  if (node.type === 'VariableDeclaration') for (const d of node.declarations) if (d.id.type === 'Identifier') declarations.set(d.id.name, { node: d, code: `${node.kind} ${source.slice(d.start, d.end)};` });
}
const overrides = new Map([
  ['requestQualityJson', 'const requestQualityJson = adapters.requestQualityJson;'],
  ['setStatus', 'const setStatus = adapters.onProgress || (() => {});'],
  ['updatePreviewGenerationProgress', 'const updatePreviewGenerationProgress = adapters.onProgress || (() => {});'],
  ['state', 'const state = {};'],
  ['getFormData', 'function getFormData() { throw Error("Explicit generation context required"); }'],
  ['getPresentationMode', 'function getPresentationMode() { return "salas"; }']
  ,['getAcademicFieldMode', 'function getAcademicFieldMode() { return "Secundaria"; }']
]);
function identifiers(node, out = new Set(), parent = null, key = '') {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'Identifier' && !(parent?.type === 'MemberExpression' && key === 'property' && !parent.computed)
    && !(parent?.type === 'Property' && key === 'key' && !parent.computed && !parent.shorthand)) out.add(node.name);
  for (const [k, value] of Object.entries(node)) {
    if (Array.isArray(value)) value.forEach(child => identifiers(child, out, node, k));
    else if (value && typeof value === 'object') identifiers(value, out, node, k);
  }
  return out;
}
const selected = new Set(), usedImports = new Map();
function visit(name) {
  if (selected.has(name)) return;
  if (imports.has(name)) { usedImports.set(name, imports.get(name)); return; }
  if (overrides.has(name)) { selected.add(name); return; }
  const declaration = declarations.get(name);
  if (!declaration) return;
  selected.add(name);
  for (const dependency of identifiers(declaration.node)) if (dependency !== name) visit(dependency);
}
roots.forEach(visit);
const importCode = [...usedImports].map(([name, { node, spec }]) => {
  if (!node.source.value.startsWith('./')) throw Error(`Browser dependency leaked: ${name}`);
  const file = path.resolve('public/js', node.source.value.split('?')[0]);
  return spec.type === 'ImportSpecifier' ? `import { ${spec.imported.name} as ${name} } from ${JSON.stringify(file)};` : `import ${name} from ${JSON.stringify(file)};`;
}).join('\n');
const body = [...selected].filter(n => !overrides.has(n)).sort((a,b) => declarations.get(a).node.start - declarations.get(b).node.start).map(n => declarations.get(n).code).join('\n');
if (/\b(?:document|window|localStorage|elements)\b/.test(body.replace(/\/\/[^\n]*/g, ''))) {
  const bad = [...selected].filter(n => declarations.has(n) && !overrides.has(n) && /\b(?:document\.|window\.|localStorage\.|elements\.)/.test(declarations.get(n).code));
  if (bad.length) throw Error(`DOM dependencies: ${bad.join(', ')}`);
}
const entry = `${importCode}\nexport function createCore(adapters) {\n${[...selected].filter(n => overrides.has(n)).map(n => overrides.get(n)).join('\n')}\n${body}\nreturn { ${roots.join(', ')} };\n}`;
const result = esbuild.buildSync({ stdin: { contents: entry, resolveDir: process.cwd(), sourcefile: 'pigpen-generation-core.mjs' }, bundle: true, platform: 'node', format: 'cjs', target: 'node22', write: false });
const output = '// Generated by scripts/build-pigpen-generation-core.cjs; do not edit.\n' + result.outputFiles[0].text;
const target = 'functions/src/pigpen-generation-core.generated.js';
if (process.argv.includes('--check')) { if (fs.readFileSync(target, 'utf8') !== output) throw Error('PigPen generation core is stale'); }
else fs.writeFileSync(target, output);
console.log(`PigPen core: ${selected.size} declarations, ${usedImports.size} shared imports`);
