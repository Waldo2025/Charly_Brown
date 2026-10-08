const { createHash } = require('node:crypto');
const RESOURCE_GENERATION_VERSION = 'gemini-raster-v6-premium-cutouts';
const TYPES = Object.freeze(['annex', 'cutout', 'worksheet', 'video-script']);
const LABELS = Object.freeze({ annex: 'Anexo', cutout: 'Recortable', worksheet: 'Ficha', 'video-script': 'Guion de video' });
const VIDEO_COLUMNS = Object.freeze([
  ['time', 'Tiempo'], ['script', 'Guion'],
  ['sceneDescription', 'Descripción de escena'], ['inSceneText', 'Texto en pantalla'],
  ['transition', 'Transición'], ['visual', 'Elemento visual']
]);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = message => Object.assign(new Error(message), { code: 'RESOURCE_VALIDATION_FAILED', status: 422 });
function validateVideo(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 60) throw fail('El guion necesita entre 1 y 60 escenas.');
  let previousEnd = 0;
  return rows.map((row, i) => {
    for (const key of ['script', 'sceneDescription', 'visual']) if (!String(row[key] || '').trim()) throw fail(`Escena ${i + 1}: falta ${key}.`);
    const start = Number(row.startSeconds), end = Number(row.endSeconds);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < previousEnd || end <= start) throw fail(`Escena ${i + 1}: tiempos inválidos.`);
    previousEnd = end;
    const clock = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
    return { ...row, sceneIndex: i + 1, time: `${clock(start)}–${clock(end)}` };
  });
}
function renderVideo(rows) {
  const scenes = validateVideo(rows);
  return `<table class="cb-video-script-table" data-video-script="true"><thead><tr>${VIDEO_COLUMNS.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead><tbody>${scenes.map(row => `<tr>${VIDEO_COLUMNS.map(([key]) => `<td>${escape(row[key] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function validateArtifact(type, artifact, context = {}) {
  if (!TYPES.includes(type) || !artifact || !String(artifact.title || '').trim() || !artifact.activityId) throw fail('Falta título, tipo o actividad vinculada.');
  if (type === 'video-script') validateVideo(artifact.scenes);
  if (type === 'worksheet') {
    const { validateResourceArtifact } = require('../charly-brown-agent-tools.js');
    const result = validateResourceArtifact(artifact, type);
    if (!result.ok) throw fail(result.errors.join(' '));
  }
  if (['annex', 'cutout'].includes(type) && (!artifact.assets?.length || !artifact.assets.every(a => a.storagePath && a.url))) throw fail('El recurso visual no tiene archivos terminados.');
  if (['annex', 'cutout'].includes(type) && (artifact.generatedImage !== true || !artifact.assets.some(a => /^image\/(?:png|jpeg|webp)$/i.test(String(a.mimeType || ''))))) throw fail('El recurso visual no contiene una imagen raster generada por Gemini.');
  if (['annex', 'cutout'].includes(type) && artifact.visualReview?.ok !== true) throw fail('El recurso visual no cuenta con una revisión editorial aprobada por Gemini.');
  if (['annex', 'cutout'].includes(type) && (!/<img\b[^>]*src=["']https:\/\//i.test(String(artifact.html || '')) || /<\s*(?:svg|canvas)\b/i.test(String(artifact.html || '')))) throw fail('El recurso visual debe usar la imagen generada y no admite sustitutos vectoriales construidos por código.');
  if (type === 'cutout' && !artifact.assets.some(a => a.mimeType === 'application/pdf')) throw fail('Falta el PDF imprimible.');
  if (context.activity) {
    const coherence = require('./coherence.js').validateResourceActivityCoherence(type, artifact, context.activity);
    if (!coherence.ok) throw fail(coherence.errors.join(' '));
  }
  return { ok: true, errors: [] };
}
module.exports = { RESOURCE_GENERATION_VERSION, TYPES, LABELS, VIDEO_COLUMNS, escape, hash, fail, validateVideo, renderVideo, validateArtifact };
