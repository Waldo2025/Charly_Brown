export function createAnalizarPdfSaveCoordinator({ saveImpl } = {}) {
  if (typeof saveImpl !== "function") {
    throw new Error("analizar_pdf_save_impl_required");
  }

  const pendingBySessionId = new Map();
  const maxRetries = 3;

  function isRetryableSaveError(error = null) {
    const message = String(error?.message || error || "").toLowerCase();
    return message.includes("aborted") || message.includes("cross-transaction contention");
  }

  async function saveWithRetry(session = null) {
    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        return await saveImpl(session);
      } catch (error) {
        lastError = error;
        if (!isRetryableSaveError(error) || attempt === maxRetries) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
      }
    }
    throw lastError;
  }

  function getSessionKey(session = null) {
    return String(session?.id || "__new_session__").trim() || "__new_session__";
  }

  function save(session = null) {
    const sessionKey = getSessionKey(session);
    const previous = pendingBySessionId.get(sessionKey) || Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => saveWithRetry(session))
      .finally(() => {
        if (pendingBySessionId.get(sessionKey) === next) {
          pendingBySessionId.delete(sessionKey);
        }
      });
    pendingBySessionId.set(sessionKey, next);
    return next;
  }

  return {
    save
  };
}
