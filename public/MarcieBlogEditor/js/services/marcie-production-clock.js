const finished = new Set(["completed", "completed_with_findings", "cancelled"]);

function timestamp(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value && typeof value === "object" && Number.isFinite(value.seconds)) return value.seconds * 1000;
  if (typeof value === "number") return value;
  return Date.parse(value || "");
}

export function productionElapsedMs(automation = {}, now = Date.now()) {
  const start = timestamp(automation.startedAt);
  if (!Number.isFinite(start)) return 0;
  const end = finished.has(automation.status)
    ? timestamp(automation.status === "cancelled" ? automation.cancelledAt : automation.completedAt)
    : now;
  return Math.max(0, (Number.isFinite(end) ? end : now) - start);
}

export function formatProductionElapsed(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, "0")).join(":");
}

// Wall time includes retries and offline time; no writes or accumulated interval drift.
export function mountProductionClock(root, getAutomation) {
  const node = root?.querySelector("[data-automation-elapsed]");
  if (!node) return () => {};
  let timer;
  const update = () => {
    if (!node.isConnected) { clearInterval(timer); return; }
    node.textContent = formatProductionElapsed(productionElapsedMs(getAutomation()));
  };
  update();
  timer = setInterval(update, 1000);
  return () => clearInterval(timer);
}
