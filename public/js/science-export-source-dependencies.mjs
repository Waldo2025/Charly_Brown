// Legacy source-based packages need the complete relative ESM dependency graph.
// Compiled preview packages already include these modules in their bundle.
export const SCIENCE_SIMULATOR_SOURCE_DEPENDENCIES = Object.freeze([
  'science-model-biology.mjs',
  'science-model-physics.mjs',
  'science-model-math.mjs',
  'science-model-common.mjs',
  'science-model-diagrams.mjs',
  'science-model-generated-runtime.mjs',
  'science-model-illustrated-scene.mjs',
  'science-scene-art-direction.mjs'
]);
export const SCIENCE_GAME_SOURCE_DEPENDENCIES = Object.freeze(['science-assessment-normalization.mjs']);
export async function loadScienceExportSourceDependencies(names, request = globalThis.fetch) {
  return Promise.all(names.map(async (name) => {
    const response = await request(new URL(`./${name}`, import.meta.url));
    if (!response.ok) throw new Error(`No se pudo cargar la dependencia offline ${name}.`);
    return [name, await response.text()];
  }));
}
