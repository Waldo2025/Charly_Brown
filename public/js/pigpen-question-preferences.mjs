import { experience } from './escape-room-experience.mjs?v=20260924-coordinate-grid-v12';

export const QUESTION_PREFERENCES_KEY = 'pigpen.questionTypes.v1';
export const questionPreferencesKey = uid => uid ? `pigpen.questionTypes.v2:${encodeURIComponent(uid)}` : '';

// Preferences apply to new work; saved topics keep their own configuration.
export function readQuestionPreferences(base = {}, storage, uid = '') {
  const fallback = experience.config(base);
  const key = questionPreferencesKey(uid);
  if (!key) return fallback;
  try {
    const saved = JSON.parse((storage ?? globalThis.localStorage).getItem(key) || 'null');
    if (saved?.version !== 1 || !Array.isArray(saved.question_types)) return fallback;
    const selected = experience.config({ question_types: saved.question_types }).question_types;
    return selected.length ? { ...fallback, question_types: selected } : fallback;
  } catch { return fallback; }
}

export function saveQuestionPreferences(config, storage, uid = '') {
  const question_types = experience.config(config).question_types;
  const key = questionPreferencesKey(uid);
  if (!question_types.length || !key) return false;
  try {
    (storage ?? globalThis.localStorage).setItem(key, JSON.stringify({ version: 1, question_types }));
    return true;
  } catch { return false; }
}
