import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calculateScienceSimulatorMeasurement, normalizeScienceSimulatorVisualScene } from "../public/js/science-simulator-runtime.mjs";
import { applyBiologySimulatorProfile } from "../public/js/science-biology-profiles.mjs";
import { validateLocalizedSimulatorExportContract } from "../public/js/science-export-contract.mjs";

const [editor, runtime, assessmentRuntime, server, styles, imageApi, cloudFunctions, exportContract] = await Promise.all([
  readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8"),
  readFile(new URL("../public/js/science-simulator-runtime.mjs", import.meta.url), "utf8"),
  readFile(new URL("../public/js/science-assessment-export.js", import.meta.url), "utf8"),
  readFile(new URL("../functions/src/science-activities.js", import.meta.url), "utf8"),
  readFile(new URL("../public/scienceActivities.css", import.meta.url), "utf8"),
  readFile(new URL("../public/imagecreator/api.js", import.meta.url), "utf8"),
  readFile(new URL("../functions/src/index.js", import.meta.url), "utf8"),
  readFile(new URL("../public/js/science-export-contract.mjs", import.meta.url), "utf8")
]);

const activity = {
  controls: [{ id: "velocity", min: 0, max: 20 }],
  visualScene: {
    background: { imageSrc: "assets/simulator/background.webp", alt: "Laboratorio MRU" },
    layers: Array.from({ length: 7 }, (_, index) => ({
      id: index < 2 ? "car" : `layer-${index}`,
      label: `Elemento ${index}`,
      role: index === 0 ? "primary" : "supporting",
      imageSrc: `assets/simulator/layer-${index}.webp`,
      motionPreset: index === 1 ? "unsupported" : "translate-x",
      driver: index === 2 ? "control:missing" : "control:velocity",
      anchor: { x: 4, y: -2 }, depth: 90, scale: 4
    }))
  }
};

test("el manifiesto limita capas, ids, drivers, posiciones y movimientos", () => {
  const normalized = normalizeScienceSimulatorVisualScene(activity);
  assert.equal(normalized.layers.length, 6);
  assert.equal(new Set(normalized.layers.map((layer) => layer.id)).size, 6);
  assert.equal(normalized.layers[1].motionPreset, "static");
  assert.equal(normalized.layers[2].driver, "time");
  assert.deepEqual(normalized.layers[0].anchor, { x: .95, y: .08 });
  assert.equal(normalized.layers[0].depth, 20);
  assert.equal(normalized.layers[0].scale, .75);
});

test("el ZIP conserva assets auditables e incrusta la escena para file protocol", () => {
  assert.match(editor, /async function localizePreviewExportImages\(zip, activity, runtimeActivity = activity\)/);
  assert.match(editor, /runtimeBackground\.dataUrl = asset\.dataUrl/);
  assert.match(editor, /runtimeLayer\.dataUrl = asset\.dataUrl/);
  assert.match(editor, /validateLocalizedSimulatorExport\(exportActivity, runtimeActivity, localizedImages\)/);
  assert.match(exportContract, /No se pudo incrustar el fondo del simulador para abrir el ZIP con doble clic/);
  assert.match(editor, /buildStandalonePreviewHtml\(runtimeActivity, assessmentConfig\)/);
  assert.match(editor, /zip\.file\("data\/activity\.json", JSON\.stringify\(exportActivity/);
  assert.match(exportContract, /supera el límite de 10 MB del ZIP/);
  assert.match(editor, /simulatorUsesProgrammaticPrimary\(activity\)/);
  assert.match(editor, /activity\.visualScene\.layers = \[\]/);
});

test("el ZIP energético exige sol y los cinco niveles raster", () => {
  const manifest = { gameMode: "simulator", simulator: { modelId: "ecosystem-dynamics", sceneVariant: "ecosystem-energy-flow" }, visualScene: { background: { imageSrc: "assets/simulator/background.webp" }, layers: Array.from({ length: 6 }, (_, trophicLevel) => ({ trophicLevel, imageSrc: `assets/simulator/layer-${trophicLevel + 1}.webp` })) } };
  const runtimeActivity = structuredClone(manifest);
  runtimeActivity.visualScene.background = { dataUrl: "data:image/webp;base64,AA==" };
  runtimeActivity.visualScene.layers = manifest.visualScene.layers.map((layer) => ({ ...layer, dataUrl: "data:image/webp;base64,AA==" }));
  assert.doesNotThrow(() => validateLocalizedSimulatorExportContract(manifest, runtimeActivity));
  const incompleteManifest = structuredClone(manifest); incompleteManifest.visualScene.layers.pop();
  const incompleteRuntime = structuredClone(runtimeActivity); incompleteRuntime.visualScene.layers.pop();
  assert.throws(() => validateLocalizedSimulatorExportContract(incompleteManifest, incompleteRuntime), /nivel trófico 5/);
});

test("la recta numérica recibe un fondo local visible sin geometría matemática incrustada", () => {
  assert.match(editor, /number-line-observatory-v1\.webp/);
  assert.match(editor, /isCodeDrawnNumberLine\s*\? DEFAULT_SIMULATOR_VISUAL_ASSETS\.numberLine/);
  assert.match(editor, /sourceBackgroundIsClean/);
  assert.match(editor, /hasBackground && \(hasPrimary \|\| isCodeDrawnNumberLine\)/);
  assert.match(editor, /la recta numérica completa y el vector de desplazamiento se dibujan con geometría exacta/);
  assert.match(runtime, /model==="number-line"\|\|hasVisualBackground/);
});

test("un escenario personalizado nunca queda sustituido silenciosamente por el fondo local", () => {
  assert.match(editor, /const customScenarioRequested = activity\?\.simulatorVisualSelection\?\.scenarioId === "__custom_simulator_visual__"/);
  assert.match(editor, /!\(customScenarioRequested && sourceUsesDefaultBackground\)/);
  assert.match(editor, /!sourceHasBackground && !customScenarioRequested/);
  assert.match(editor, /background-content-lock-v6/);
  assert.match(editor, /HIGHEST PRIORITY USER-SPECIFIED SCENARIO: create exactly/);
  assert.match(editor, /Object\.assign\(scene\.background, \{ imageUrl: "", imageSrc: "", storagePath: "" \}/);
  assert.match(editor, /Fondo personalizado pendiente de Gemini/);
  assert.match(editor, /Generar fondo solicitado/);
  assert.match(editor, /hasGeneratedPrimaryLayer = simulatorUsesProgrammaticPrimary\(state\.activity\)/);
});

test("la recta personalizada no convierte universo o galaxias en una pista o plataforma", () => {
  assert.match(editor, /const NUMBER_LINE_CUSTOM_SCENARIO_CONTRACT = "CUSTOM CONTENT LOCK/);
  assert.match(editor, /If the request is outer space, the universe, stars, nebulae or galaxies, render an uninterrupted celestial view/);
  assert.match(editor, /Do not add floors, ground, roads, tracks, corridors, platforms, runways, walkways, bridges, rails, buildings, rooms, laboratories/);
  assert.match(editor, /simulatorScenarioBackgroundContract\(catalog\.modelKey, composition, customScenario\)/);
  assert.match(editor, /CONTENT FIDELITY OVERRIDES THE MATHEMATICAL TOPIC/);
  assert.match(editor, /Apply this only as color, lighting and rendering finish; it must not add, replace or reinterpret any scene content/);
  assert.match(editor, /customNumberLineScenario \? "Do not add any foreground object\."/);
  assert.match(editor, /validateSimulatorCustomBackground\(raw, visualSelection\.customScenario\)/);
  assert.match(editor, /Verificando fidelidad del fondo…/);
  assert.match(editor, /RETRY AFTER VISUAL QA FAILURE: \$\{backgroundVerificationIssue\}/);
  assert.match(editor, /Control visual rechazó el fondo/);
});

test("la generación Gemini usa planificación estructurada, chroma adaptativo y fallback", () => {
  assert.match(editor, /SIMULATOR_VISUAL_PLAN_SCHEMA/);
  assert.match(editor, /const model = "gemini-3\.1-flash-image"/);
  assert.doesNotMatch(editor.match(/async function generateSimulatorImage[\s\S]*?\n\}/)?.[0] || "", /gemini-2\.5-flash-image/);
  assert.match(editor, /removeSimulatorLayerBackground/);
  assert.match(editor, /simulatorObjectArtDirection/);
  assert.match(editor, /ABSOLUTELY NO arrows, motion trails/);
  assert.match(editor, /keepPrimaryImageComponent/);
  assert.match(editor, /strict: isLinearTranslationScene\(activity, layer\)/);
  assert.match(editor, /validateSimulatorLayerIsolation/);
  assert.match(editor, /Control visual rechazó la imagen/);
  assert.match(editor, /RETRY AFTER VISUAL QA FAILURE/);
  assert.match(editor, /chroma === "magenta"/);
  assert.match(editor, /status: "fallback"/);
  assert.match(editor, /SIMULATOR_VISUAL_BUDGET_BYTES/);
});

test("los sprites eliminan halo de croma y se codifican sin pérdida alfa", () => {
  assert.match(editor, /despillImageMatte\(data, width, height, matte/);
  assert.match(editor, /output\.toBlob\([\s\S]*?"image\/png"/);
  assert.match(editor, /No rechaces por antialiasing subpíxel/);
  assert.match(editor, /sanitizeAndResizeImage\(source,[\s\S]*?\{ losslessAlpha: true \}\)/);
  assert.match(editor, /fringeOnly && Number\(chromaFringeRatio\) <= \.001/);
  assert.match(editor, /chromaFringeRatio: cutout\.chromaFringeRatio/);
});

test("el control visual envía una miniatura acotada y no el PNG completo", () => {
  assert.match(editor, /const inspectionMaxSide = 320/);
  assert.match(editor, /for \(const quality of \[\.68, \.56, \.44\]\)/);
  assert.match(editor, /inspectionBlob\.size <= 80 \* 1024/);
  assert.match(editor, /inspectionBlob\.size > 96 \* 1024/);
  assert.match(editor, /const inspectionDataUrl = await blobToDataUrl\(inspectionBlob\)/);
  assert.match(editor, /String\(inspectionDataUrl \|\| ""\)\.match/);
});

test("los errores 413 antiguos no sobreviven a una regeneración exitosa", () => {
  assert.match(editor, /filter\(\(warning\) => !\/gemini_payload_too_large\/i\.test\(warning\)\)/);
  assert.match(editor, /warnings = warnings\.filter\(\(warning\) => !String\(warning\)\.startsWith\(`\$\{layer\.label\}:`\)\)/);
});

test("el fondo sólo contiene el escenario solicitado y excluye controles o decoración temática", () => {
  assert.match(editor, /function simulatorBackgroundArtDirection/);
  assert.match(editor, /SIMULATOR_BACKGROUND_EXCLUSION_CONTRACT/);
  assert.match(editor, /SIMULATOR_BACKGROUND_PROMPT_VERSION = "background-content-lock-v6"/);
  assert.match(editor, /BACKGROUND PLATE ONLY/);
  assert.match(editor, /Never introduce terrain, architecture, roads, tracks, corridors, platforms, runways, walkways/);
  assert.match(editor, /Do not add monitors, screens, dashboards, control panels, consoles, instruments, gauges, charts, plots, graphs, data displays, telemetry/);
  assert.match(editor, /If an element can be operated, measured, read, interpreted as an interface/);
  assert.match(editor, /HORIZONTALLY LOOPABLE PLATE/);
  const backgroundGeneration = editor.match(/const customNumberLineScenario =[\s\S]*?optimizeSimulatorBackground\(raw\)/)?.[0] || "";
  assert.ok(backgroundGeneration, "Debe existir un contrato aislado para generar el fondo");
  assert.doesNotMatch(backgroundGeneration, /VISUAL_STYLE_DIRECTIONS/);
  assert.doesNotMatch(backgroundGeneration, /Supporting scene plan/);
  assert.doesNotMatch(backgroundGeneration, /scene\.background\.prompt/);
});

test("un 429 detiene la cascada, activa cooldown y conserva el fallback local o programático", () => {
  assert.match(imageApi, /GEMINI_IMAGE_QUOTA_COOLDOWN_MS = 60_000/);
  assert.match(imageApi, /geminiImageQuotaBlockedUntil = Date\.now\(\) \+ retryAfterMs/);
  assert.match(imageApi, /throw buildGeminiImageQuotaError\(error, retryAfterMs\)/);
  assert.match(editor, /quotaLimited = isGeminiQuotaExhausted\(error\)/);
  assert.match(editor, /options\.backgroundOnly \|\| quotaLimited \? \[\]/);
  assert.match(editor, /simulatorGeminiQuotaBlockedUntil - Date\.now\(\)/);
  assert.match(editor, /rememberSimulatorGeminiQuota\(error\)/);
  assert.match(editor, /El simulador usará su escena local o programática de respaldo/);
  assert.match(cloudFunctions, /res\.set\("Retry-After", "60"\)/);
  assert.match(cloudFunctions, /error: "gemini_quota_exhausted"/);
});

test("Phaser carga texturas y separa overlays transparentes del fallback vectorial", () => {
  assert.match(runtime, /this\.load\.image\("science-generated-background"/);
  assert.match(runtime, /science-generated-layer-/);
  for (const preset of ["translate-x", "translate-y", "projectile", "orbit", "rotate", "pulse", "vibrate", "flow", "scale", "phase-step", "static"]) assert.match(runtime, new RegExp(`\\"${preset}\\"`));
  assert.match(runtime, /if\(isEcosystemEnergyFlow\)/);
  assert.match(runtime, /drawEcosystemEnergyOverlay/);
  assert.match(runtime, /else if\(!hasLoadedPrimary\)\{scene\(/);
  assert.match(runtime, /visualScene:\{status:visualScene\.status/);
  assert.match(runtime, /drawLinearMotionIndicators/);
  assert.match(runtime, /velocity:linearMotion\?\.velocity\?\?values\.velocity/);
  assert.match(runtime, /this\.add\.tileSprite/);
  assert.match(runtime, /calculateScienceBackgroundMotion/);
  assert.match(runtime, /tilePositionX/);
});

test("MRU y MRUA generan y renderizan únicamente el objeto principal", () => {
  assert.match(editor, /if \(modelKey === "friction" \|\| modelKey === "ecosystem"\) plannedLayers\.splice\(1\)/);
  assert.match(runtime, /linearMotionEnabled&&primaryLayer\?\[primaryLayer\]:visualScene\.layers/);
  assert.match(runtime, /runtimeVisualLayers\.forEach/);
});

test("la recta numérica genera sólo el entorno y dibuja el vector con código", () => {
  assert.match(editor, /Vector de desplazamiento \(dibujado por código\)/);
  assert.match(editor, /visualSelection\.modelKey === "number-line"/);
  assert.match(editor, /background: \{ prompt: visualSelection\.scenarioPrompt, alt: visualSelection\.scenarioLabel \}/);
  assert.match(editor, /existing\.layers = \[\]/);
  assert.match(editor, /existing\.generationWarnings = existing\.generationWarnings\.filter/);
  assert.match(editor, /isCodeDrawnNumberLine[\s\S]*?No fue posible planificar la escena/);
  assert.match(editor, /Gemini genera sólo el entorno/);
  assert.match(runtime, /else if\(model==="number-line"\)/);
  assert.match(runtime, /calculateScienceNumberLineMotion\(measurement,time,duration\)/);
  assert.match(runtime, /function createScienceNumberLineVectorOverlay/);
  assert.match(runtime, /shape-rendering","geometricPrecision/);
  assert.match(runtime, /vector-effect=\"non-scaling-stroke\"/);
  assert.match(runtime, /const runtimeVisualLayers=isNumberLine\|\|isFactorization\?\[\]/);
  assert.match(runtime, /isCodeDrawnNumberLine\?warnings\.filter/);
  assert.match(runtime, /if\(useGeneratedBackground\)this\.load\.image/);
  assert.match(runtime, /Movimiento completado/);
  assert.match(runtime, /visualTime=numberLineMotionDuration\(\);running=false/);
  assert.match(runtime, /function syncScienceNumberLineVectorOverlay/);
  assert.match(runtime, /for\(let jump=0;jump<motion\.completedJumps;jump\+\+\)/);
  assert.match(runtime, /calculateScienceNumberLineLayout\(measurement,w\)/);
  assert.match(editor, /background-content-lock-v6/);
});

test("editor, Firebase y ZIP reconocen fondo y capas del simulador", () => {
  assert.match(editor, /data-regenerate-simulator-background/);
  assert.match(editor, /data-regenerate-simulator-layer/);
  assert.match(editor, /assetType: "simulatorBackground"/);
  assert.match(editor, /assetType: "simulatorLayer"/);
  assert.match(editor, /assets\/simulator\/background/);
  assert.match(editor, /assets\/simulator\/layer-/);
  assert.match(assessmentRuntime, /visualScene: config\.visualScene/);
  assert.match(server, /assetType === "simulatorBackground"/);
  assert.match(server, /assetType === "simulatorLayer"/);
  assert.match(styles, /sa-simulator-visual-editor/);
});

test("las capas guardadas se reparan localmente sin consumir cuota de Gemini", () => {
  assert.match(editor, /repairStoredSimulatorLayerCutouts\(runtimeActivity, runtimeActivity\.visualScene\)/);
  assert.match(editor, /layer\.cutoutVersion >= 5/);
  assert.match(editor, /layer\.cutoutVersion = 5/);
  assert.match(editor, /runtimeActivity\.visualScene = repairedVisualScene\.scene/);
  assert.match(editor, /sourceBackground !== normalizedBackground \|\| sourcePrimaryImage !== normalizedPrimaryImage/);
});

test("la ruta curada de simuladores genera la escena antes de renderizar", () => {
  const curatedBranch = editor.match(/if \(selectedMode === "simulator"\) \{[\s\S]*?return;\n  \}/)?.[0] || "";
  assert.match(curatedBranch, /state\.activity\.visualScene = await generateSimulatorVisualSceneWithGemini\(state\.activity, \{ replan: true \}\)/);
  assert.ok(
    curatedBranch.indexOf("generateSimulatorVisualSceneWithGemini") < curatedBranch.indexOf("renderGame"),
    "La escena visual debe completarse antes de montar el simulador curado"
  );
});

test("el viewport del simulador no incluye historial ni panel de gráfica", () => {
  assert.doesNotMatch(runtime, /science-sim-chart-label/);
  assert.doesNotMatch(runtime, /HISTORIAL · 32 MUESTRAS/);
  assert.doesNotMatch(runtime, /function chart\(/);
  assert.doesNotMatch(runtime, /fillStyle\(0x06111b,.85\)\.fillRoundedRect/);
  assert.doesNotMatch(runtime, /fillStyle\(0x04131f,.28\)\.fillRoundedRect/);
  assert.doesNotMatch(runtime, /strokeRoundedRect\(18,18/);
});

test("materia y tema gobiernan escenario, objeto y driver visual", () => {
  assert.match(editor, /SIMULATOR_OBJECT_CHOICES/);
  assert.match(editor, /SIMULATOR_SCENE_TEMPLATES/);
  assert.match(editor, /simulatorVisualCatalog\(subject, topic\)/);
  assert.match(editor, /scenarioPrompt: scenario\.prompt/);
  assert.match(editor, /objectPrompt: object\.prompt/);
  assert.match(editor, /driver: primaryDriverId \? `control:\$\{primaryDriverId\}`/);
  assert.match(runtime, /scientificMotionIntensity/);
  assert.match(runtime, /rate=\.12\+intensity\*2\.65/);
  assert.match(editor, /function simulatorVariablesFor\(subject, topic\)/);
  assert.match(editor, /profile\?\.simulatorProfile\?\.controls/);
  assert.match(editor, /data-simulator-variable/);
  assert.match(editor, /getSelectedSimulatorVariableValues/);
});

test("cada capa ecológica se genera y valida con su propia identidad", () => {
  const layerGeneration = editor.match(/const isPrimary = layer\.role[\s\S]*?validateSimulatorLayerIsolation\(cutout\.dataUrl, requestedObject/)?.[0] || "";
  assert.ok(layerGeneration, "Debe existir el flujo de generación y validación por capa");
  assert.match(layerGeneration, /const requestedObject = isPrimary[\s\S]*?: String\(layer\.label \|\| layer\.prompt/);
  assert.match(layerGeneration, /THE ONLY FOREGROUND SUBJECT IS EXACTLY ONE COMPLETE \$\{requestedObject\}/);
  assert.doesNotMatch(layerGeneration, /const requestedObject = visualSelection\.customObject \|\| visualSelection\.objectLabel/);
});

test("Transformación de la energía en los ecosistemas tiene un perfil científico independiente", () => {
  const profile = applyBiologySimulatorProfile("Transformación de la energía en los ecosistemas", { gameProfile: {} }).simulatorProfile;
  assert.equal(profile.sceneVariant, "ecosystem-energy-flow");
  assert.deepEqual(profile.controls.map((control) => control.id), ["solarEnergy", "producerCapture", "trophicLevels", "transferEfficiency"]);
  const measurement = calculateScienceSimulatorMeasurement(profile.modelId, Object.fromEntries(profile.controls.map((control) => [control.id, control.value])));
  assert.equal(measurement.capturedEnergy, 500);
  assert.ok(Math.abs(measurement.finalEnergy - 5) < 1e-9);
  assert.ok(Math.abs(measurement.dissipatedEnergy - 9995) < 1e-9);
  assert.equal(measurement.unit, "kJ");
  assert.match(profile.explanation, /flujo y la transformación de energía/i);
});

test("Ecosistemas conserva su modelo general de estabilidad ecológica", () => {
  const profile = applyBiologySimulatorProfile("Ecosistemas", { gameProfile: {} }).simulatorProfile;
  assert.equal(profile.sceneVariant, "ecosystem");
  assert.deepEqual(profile.controls.map((control) => control.id), ["producers", "consumers", "resources", "disturbance"]);
  assert.match(profile.explanation, /productores, consumidores, recursos y perturbaciones/i);
});

test("la escena energética usa una cadena raster y el ecosistema general conserva su productor", () => {
  for (const asset of ["sun", "grass", "grasshopper", "frog", "snake", "hawk"]) assert.match(editor, new RegExp(`ecosystem-energy-${asset}\\.webp`));
  for (const label of ["Pasto · productor", "Saltamontes · consumidor primario", "Rana · consumidor secundario", "Serpiente · consumidor terciario", "Halcón · depredador superior"]) assert.match(editor, new RegExp(label));
  assert.match(editor, /No incluir animales, criaturas, organismos híbridos o fantásticos/);
  assert.match(editor, /if \(!plannedLayers\[0\]\) plannedLayers\.push/);
  assert.match(editor, /modelKey === "friction" \|\| modelKey === "ecosystem"/);
  assert.match(runtime, /isEcosystemEnergyFlow=model==="ecosystem-dynamics"/);
  assert.match(runtime, /drawEcosystemEnergyOverlay/);
  assert.doesNotMatch(runtime.match(/export function drawEcosystemEnergyOverlay[\s\S]*?\n\}/)?.[0] || "", /strokeCircle|fillEllipse/);
});

test("Transformación energética conserva fondo y seis recursos raster locales cuando Gemini no genera recursos", () => {
  assert.match(editor, /DEFAULT_SIMULATOR_VISUAL_ASSETS/);
  assert.match(editor, /ecosystem-energy-prairie-v2\.webp/);
  assert.match(editor, /!isEcosystemEnergy \|\| customScenarioRequested/);
  assert.match(editor, /defaultVisuals\.layers\.map/);
  assert.match(editor, /trophicLevel/);
  assert.match(editor, /defaultBackgroundApplied/);
  assert.match(editor, /nunca deja el preview vacío/);
  assert.ok(
    editor.indexOf("if (curriculumProfile) applyCurriculumProfile") < editor.indexOf("activity.visualScene = normalizeSimulatorVisualScene"),
    "El perfil curricular debe aplicarse antes de materializar los recursos visuales predeterminados"
  );
  assert.match(runtime, /drawEcosystemImageBackdropFallback/);
  assert.match(runtime, /layerStates:generatedLayerStates/);
  assert.match(runtime, /generatedMotionIndicatorStates=drawEcosystemEnergyOverlay/);
});

test("fondo y objetos conservan proporción en pantallas verticales", () => {
  assert.match(runtime, /scale=w\/sourceWidth/);
  assert.match(runtime, /fit:"width"/);
  assert.match(runtime, /heightScale=h\*\.48\/Math\.max\(1,sprite\.height\)/);
  assert.match(runtime, /baseScale=Math\.min\(widthScale,heightScale\)/);
  assert.match(runtime, /x=clamp\(x,safeX,w-safeX\);y=clamp\(y,safeY,h-safeY\)/);
  assert.match(runtime, /new ResizeObserver\(scheduleViewportSync\)/);
  assert.match(runtime, /game\.scale\.resize\(width,height\)/);
  assert.match(runtime, /autoCenter:Phaser\.Scale\.NO_CENTER/);
});

test("MRU exige una pista recta y alinea el objeto con su recorrido", () => {
  assert.match(editor, /SIMULATOR_COMPOSITION_CONTRACTS/);
  assert.match(editor, /Una carretera o pista única, perfectamente recta, plana y horizontal cruza el encuadre completo de izquierda a derecha/);
  assert.match(editor, /sin punto de fuga, curvas, pendientes, cruces, rieles, obstáculos ni plataformas verticales/);
  assert.match(editor, /anchor: \{ x: \.16, y: \.72 \}, motionPreset: "translate-x"/);
  assert.match(editor, /NON-NEGOTIABLE SCIENTIFIC DIRECTION AND ACTION PATH/);
  assert.match(editor, /do not duplicate \$\{visualSelection\.objectLabel\}/);
});

test("las selecciones personalizadas invalidan la escena anterior y dominan los prompts", () => {
  assert.match(editor, /function simulatorVisualSelectionKey\(activity/);
  assert.match(editor, /sceneSelectionChanged = state\.activity\.visualScene\?\.selectionKey !== requestedSelectionKey/);
  assert.match(editor, /generateSimulatorVisualSceneWithGemini\(state\.activity, \{ replan: true \}\)/);
  assert.match(editor, /HIGHEST PRIORITY USER-SPECIFIED SCENARIO/);
  assert.match(editor, /visualSelection\.customObject \|\| visualSelection\.objectLabel/);
  assert.match(editor, /THE ONLY FOREGROUND SUBJECT IS EXACTLY ONE COMPLETE/);
  assert.match(editor, /This is a fresh redesign; do not reuse a previous laboratory/);
  assert.match(editor, /scene\.background\.prompt = visualSelection\.scenarioPrompt/);
});

test("los campos personalizados sólo aparecen al elegir Otro", () => {
  assert.match(editor, /const custom = select\?\.value === CUSTOM_SIMULATOR_VISUAL_VALUE/);
  assert.match(editor, /field\.hidden = !custom/);
  assert.match(styles, /\.sa-simulator-custom-choice\[hidden\]\{display:none!important\}/);
});
