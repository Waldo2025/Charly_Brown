import { authFetchJson } from "../js/api-client-podcaster.js?v=2026-1.0.10.537";

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

export async function waitForPodcasterJob(accepted = {}, options = {}) {
  if (!accepted?.jobId) return accepted;
  const statusUrl = String(accepted.statusUrl || `/api/podcaster/jobs/${encodeURIComponent(accepted.jobId)}`).trim();
  const timeoutMs = Math.max(10_000, Number(options.timeoutMs || 30 * 60 * 1000) || 30 * 60 * 1000);
  const intervalMs = Math.max(1000, Number(options.intervalMs || 2500) || 2500);
  const startedAt = Date.now();
  let last = accepted;
  while (Date.now() - startedAt < timeoutMs) {
    if (options.signal?.aborted) throw new DOMException("Trabajo cancelado.", "AbortError");
    if (typeof options.onUpdate === "function") options.onUpdate(last);
    const status = String(last?.status || "").toLowerCase();
    if (status === "ready" || status === "completed") return last;
    if (status === "error" || status === "cancelled" || status === "canceled") {
      const error = new Error(String(last?.error?.message || last?.error?.code || last?.hint || "El trabajo no pudo completarse."));
      error.detail = last;
      throw error;
    }
    await sleep(intervalMs);
    last = await authFetchJson(statusUrl, { method: "GET" });
  }
  const error = new Error("El trabajo tardó más de lo esperado.");
  error.status = 504;
  error.detail = last;
  throw error;
}
