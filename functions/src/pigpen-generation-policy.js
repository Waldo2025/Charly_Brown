const { createHash, randomUUID } = require('node:crypto');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex').slice(0, 32);
const clean = value => JSON.parse(JSON.stringify(value));
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const identifier = value => { if (!/^[\w-]{1,180}$/.test(String(value || ''))) throw fail('Identificador inválido.'); return String(value); };
function configuration(input = {}) {
  const value = clean(input);
  for (const key of ['objectiveBlueprint', 'project', '_quotaFallbackModel']) delete value[key];
  value.misiones = Number(value.misiones) || 4;
  value.preguntasPorSala = Number(value.preguntasPorSala) || 4;
  if (!Number.isInteger(value.misiones) || value.misiones < 1 || value.misiones > 8 || !Number.isInteger(value.preguntasPorSala) || value.preguntasPorSala < 1) throw fail('Configuración de salas o preguntas inválida.');
  if (!String(value.tema || '').trim()) throw fail('Falta el tema curricular.');
  if (Buffer.byteLength(JSON.stringify(value)) > 500000) throw fail('El brief supera el tamaño admitido.', 413);
  // A config without a model means the free default, never a paid id: the browser always
  // sends its selector value, and an older record must not start billing by omission.
  const offer = require('./gemini-free-tier.js').describeFreeTierOffer();
  value.modelo = value.contentModel || value.modeloObjetivo || value.modelo || (offer.enabled ? offer.model : 'gemini-2.5-flash');
  return value;
}
const task = (stage, roomIndex = -1, revision = 0, key = '', input = {}) => ({ id: `${stage}-${roomIndex}-${revision}-${key || 'main'}`, stage, roomIndex, revision, key, input: clean(input), status: 'pending', attempt: 0, dueAt: 0 });
const taskClass = stage => stage === 'image' ? 'image' : 'text';
const LIMITS = { text: 4, image: 2 };
function parseHttpStatus(error) {
  if (!error) return 0;
  if (typeof error.status === 'number') return error.status;
  if (typeof error.code === 'number') return error.code;
  if (typeof error.statusCode === 'number') return error.statusCode;
  if (typeof error.error?.code === 'number') return error.error.code;
  if (typeof error.error?.status === 'number') return error.error.status;
  const raw = String(error.status || error.code || error.error?.status || error.error?.code || error.message || error.error?.message || '');
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(raw)) return 429;
  if (/503|UNAVAILABLE/i.test(raw)) return 503;
  if (/500|INTERNAL/i.test(raw)) return 500;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
function retryPolicy(error, attempt, now = Date.now(), random = Math.random) {
  const status = parseHttpStatus(error);
  const uncertain = error.uncertain || /timeout|timed out|ECONNRESET|fetch failed|socket hang up|abort/i.test(String(error.message || error.error?.message || ''));
  // permanentToday marks a free-tier bucket that will not recover before the daily
  // reset; retrying it would burn calls and still return 429.
  const retry = !uncertain && !error.permanentToday && [429, 503].includes(status) && attempt < 3;
  return { status: retry ? 'pending' : 'needs_attention', dueAt: retry ? now + Math.max(Number(error.retryAfterMs) || 0, Math.min(120000, 10000 * 2 ** (attempt - 1)) + Math.floor(random() * 1000)) : 0,
    error: String(error.message || error.error?.message || error).slice(0, 1500), uncertain: Boolean(uncertain) };
}
module.exports = { hash, clean, fail, identifier, configuration, task, taskClass, LIMITS, retryPolicy, randomUUID, parseHttpStatus };
