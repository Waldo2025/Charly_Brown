// The legacy HTTP/MCP research path shares a bounded pool within each process.
// Persistent workers already acquire distributed capacity through ProductionStore.
function createResearchPool(limit = 10) {
  let active = 0;
  const pending = [];
  const drain = () => {
    while (active < limit && pending.length) {
      const entry = pending.shift();
      entry.signal?.removeEventListener('abort', entry.abort);
      if (entry.signal?.aborted) { entry.reject(entry.signal.reason); continue; }
      active++;
      Promise.resolve().then(entry.work).then(entry.resolve, entry.reject).finally(() => { active--; drain(); });
    }
  };
  return (work, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const entry = { work, signal, resolve, reject, abort: () => {
      const index = pending.indexOf(entry);
      if (index >= 0) pending.splice(index, 1);
      reject(signal.reason);
    } };
    signal?.addEventListener('abort', entry.abort, { once: true });
    pending.push(entry);
    drain();
  });
}
const scheduleResearch = createResearchPool(10);
const timeoutError = code => Object.assign(new Error(code), { code, status: 503 });
async function withAbortDeadline(work, timeoutMs, code, parentSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort(parentSignal.reason);
  parentSignal?.addEventListener('abort', abort, { once: true });
  if (parentSignal?.aborted) abort();
  const timer = setTimeout(() => controller.abort(timeoutError(code)), timeoutMs);
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    const cancelled = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true }));
    return await Promise.race([Promise.resolve().then(() => work(controller.signal)), cancelled]);
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', abort);
  }
}
function researchClient(client, signal) {
  // Persistent workers own their timeout and distributed permit.
  if (client.productionManaged) return client;
  return { productionManaged: client.productionManaged, researchSignal: signal, researchSearch: client.researchSearch, models: {
    generateContent: args => withAbortDeadline(operationSignal => client.models.generateContent({
      ...args, config: { ...args.config, abortSignal: operationSignal }
    }), 60_000, 'marcie_research_call_timeout', signal || args.config?.abortSignal)
  } };
}
async function requestDeadline(req, res, work, timeoutMs, code) {
  const controller = new AbortController();
  const disconnect = () => { if (!res.writableEnded) controller.abort(timeoutError('marcie_request_disconnected')); };
  res.once?.('close', disconnect);
  try { return await withAbortDeadline(work, timeoutMs, code, controller.signal); }
  finally { res.removeListener?.('close', disconnect); }
}
module.exports = { createResearchPool, scheduleResearch, withAbortDeadline, researchClient, requestDeadline };
