function createMontageExportCancelController(jobId = "") {
  const cleanJobId = String(jobId || "").trim();
  const abortHandlers = new Set();
  let cancelled = false;

  const registerAbortHandler = (handler) => {
    if (typeof handler !== "function") return () => {};
    if (cancelled) {
      try {
        handler();
      } catch (_) {}
      return () => {};
    }
    abortHandlers.add(handler);
    return () => {
      abortHandlers.delete(handler);
    };
  };

  const cancel = () => {
    if (cancelled) return false;
    cancelled = true;
    const handlers = Array.from(abortHandlers);
    abortHandlers.clear();
    handlers.forEach((handler) => {
      try {
        handler();
      } catch (_) {}
    });
    return true;
  };

  return {
    jobId: cleanJobId,
    isCancelled: () => cancelled,
    cancel,
    registerAbortHandler,
    unregisterAbortHandler: (handler) => abortHandlers.delete(handler)
  };
}

module.exports = {
  createMontageExportCancelController
};
