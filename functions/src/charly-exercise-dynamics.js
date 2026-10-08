const catalogPromise = import('./charly-exercise-dynamics-catalog.mjs');

async function activityDynamics(enabledIds, html = '') {
  const catalog = await catalogPromise;
  const ids = catalog.normalizeExerciseDynamics(enabledIds);
  const detected = html ? catalog.detectExerciseDynamics(html) : [];
  return {
    version: catalog.EXERCISE_DYNAMICS_VERSION,
    enabled: ids,
    detected,
    directive: catalog.buildExerciseDynamicsDirective(ids)
  };
}

module.exports = { activityDynamics };
