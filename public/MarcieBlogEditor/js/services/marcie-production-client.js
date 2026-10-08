import { buildMarcieApiUrl } from '/js/api-client.js';
import { getCurrentUser } from './marcie-firebase.js';

export async function productionRequest(action, payload = {}, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(Object.assign(new Error('No se recibió respuesta; se volverá a consultar el avance guardado.'), { status: 504 })), 25000);
  try {
    if (signal?.aborted) abort();
    const work = async () => {
      const user = getCurrentUser();
      if (!user) throw Object.assign(new Error('Inicia sesión para continuar.'), { status: 401 });
      const token = await user.getIdToken();
      if (controller.signal.aborted) throw controller.signal.reason;
      const response = await fetch(buildMarcieApiUrl(`/api/marcie/production/${action}`), {
        method: action === 'capabilities' ? 'GET' : 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, ...(action === 'capabilities' ? {} : { 'Content-Type': 'application/json' }) },
        ...(action === 'capabilities' ? {} : { body: JSON.stringify(payload) })
      });
      const value = await response.json();
      if (!response.ok) throw Object.assign(new Error(value.message || value.error || 'No se pudo consultar la producción.'), { status: response.status });
      return value;
    };
    const aborted = new Promise((_, reject) => {
      if (controller.signal.aborted) reject(controller.signal.reason);
      else controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
    });
    return await Promise.race([work(), aborted]);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export function productionProgress(result) {
  const tasks = result.tasks || [];
  const completed = tasks.filter(t => t.status === 'completed').length;
  const active = tasks.filter(t => t.status === 'running').length;
  const retryAt = tasks.filter(t => t.retryAt > Date.now()).map(t => t.retryAt).sort((a, b) => a - b)[0];
  const mapping = { propose: 'proposals', search: 'proposals', validate: 'proposals', select: 'proposals', draft: 'articles', evidence: 'review', style: 'review', seo: 'review', correct: 'corrections', cover: 'covers' };
  const stage = mapping[tasks.find(t => t.status === 'running')?.stage] || 'proposals';
  const done = ['completed', 'completed_with_findings'].includes(result.status);
  return { productionId: result.id, engine: 'persistent', mode: 'automated', status: result.status === 'needs_attention' ? 'failed' : result.status,
    stage: done ? 'corrections' : stage, startedAt: result.startedAt, completedAt: result.completedAt, cancelledAt: result.cancelledAt,
    progress: done ? 100 : Math.min(99, Math.round(100 * completed / Math.max(1, tasks.length))),
    message: result.message || `${active} tareas activas · ${completed}/${tasks.length} checkpoints completados${retryAt ? ` · Próximo reintento ${new Date(retryAt).toLocaleTimeString()}` : ''}` };
}

export function waitForProductionSave(promise, signal, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const finish = (callback, value) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); callback(value); };
    const abort = () => finish(reject, signal.reason);
    const timer = setTimeout(() => finish(reject, Object.assign(new Error('La sincronización sigue pendiente; se conservará el checkpoint y se reintentará.'), { status: 504 })), timeoutMs);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
  });
}
