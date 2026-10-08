import { detectExerciseDynamics, EXERCISE_DYNAMICS_VERSION } from './exercise-dynamics-catalog.js';

const CLASS_ALIASES = Object.freeze({
  'word-bank': 'cb-activity-bank',
  'banco-palabras': 'cb-activity-bank',
  'fill-blank': 'cb-fill-blank',
  'sopa-letras': 'cb-word-search-grid',
  'matching-columns': 'cb-matching-columns',
  'multiple-choice': 'cb-mc-group',
  'timeline': 'cb-timeline'
});

export function convertExerciseStyles(html = '') {
  const source = String(html || '');
  const template = document.createElement('template');
  template.innerHTML = source;
  let changed = false;
  for (const [oldClass, newClass] of Object.entries(CLASS_ALIASES)) {
    template.content.querySelectorAll(`.${oldClass}`).forEach((node) => {
      node.classList.replace(oldClass, newClass);
      changed = true;
    });
  }
  const convertedHtml = changed ? template.innerHTML : source;
  return {
    html: convertedHtml,
    exerciseDynamics: { version: EXERCISE_DYNAMICS_VERSION, detected: detectExerciseDynamics(convertedHtml) },
    changed
  };
}
