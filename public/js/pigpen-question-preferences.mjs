import { experience } from './escape-room-experience.mjs?v=20260912-text-pieces-v9';

export const QUESTION_PREFERENCES_KEY = 'pigpen.questionTypes.v1';

// Preferences apply to new work; saved topics keep their own configuration.
export function readQuestionPreferences(base = {}, storage) {
  const fallback = experience.config(base);
  try {
    const saved = JSON.parse((storage ?? globalThis.localStorage).getItem(QUESTION_PREFERENCES_KEY) || 'null');
    if (saved?.version !== 1 || !Array.isArray(saved.question_types)) return fallback;
    const selected = experience.config({ question_types: saved.question_types }).question_types;
    return selected.length ? { ...fallback, question_types: selected } : fallback;
  } catch { return fallback; }
}

export function saveQuestionPreferences(config, storage) {
  const question_types = experience.config(config).question_types;
  if (!question_types.length) return false;
  try {
    (storage ?? globalThis.localStorage).setItem(QUESTION_PREFERENCES_KEY, JSON.stringify({ version: 1, question_types }));
    return true;
  } catch { return false; }
}
