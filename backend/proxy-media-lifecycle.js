"use strict";

function shouldDestroyProxyMediaUpstream({
  requestAborted = false,
  responseFinished = false,
  responseClosed = false
} = {}) {
  if (requestAborted) return true;
  if (responseClosed && !responseFinished) return true;
  return false;
}

function isTransientProxyMediaError(error = null) {
  const code = String(error?.code || "").trim().toUpperCase();
  const message = String(error?.message || error || "").trim().toLowerCase();
  const status = Number(error?.statusCode || error?.status || 0) || 0;
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  if ([
    "ECONNRESET",
    "ECONNREFUSED",
    "EPIPE",
    "ETIMEDOUT",
    "ENOTFOUND",
    "ERR_STREAM_PREMATURE_CLOSE",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_SOCKET"
  ].includes(code)) return true;
  return /premature close|connection closed|socket hang up|fetch failed|network|timed? ?out|signed url get failed: 5\d\d/.test(message);
}

async function fetchProxyMediaWithTimeout(fetchFn, url, init = {}, timeoutMs = 30000) {
  if (typeof fetchFn !== "function") throw new TypeError("fetchFn must be a function");
  const budgetMs = Math.max(250, Number(timeoutMs || 0) || 30000);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try { controller.abort(); } catch (_) {}
  }, budgetMs);
  try {
    return await fetchFn(url, {
      ...(init || {}),
      signal: controller.signal
    });
  } catch (error) {
    if (!timedOut) throw error;
    const timeoutError = new Error("proxy_media_upstream_timeout");
    timeoutError.code = "proxy_media_upstream_timeout";
    timeoutError.status = 504;
    timeoutError.timeoutMs = budgetMs;
    throw timeoutError;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bind a media stream to the real client-disconnect lifecycle.
 *
 * IncomingMessage emits `close` after a normally completed request on current
 * Node versions, so using `req.on("close")` as an abort signal tears down valid
 * GET streams while the response is still being written. A client abort is
 * represented by `aborted`, or by the response closing before `finish`.
 */
function bindProxyMediaStreamLifecycle(request, response, stream, options = {}) {
  let responseFinished = response?.writableFinished === true;
  let clientDisconnected = false;
  let cleanedUp = false;

  const destroyStream = (reason) => {
    clientDisconnected = true;
    if (typeof options?.onDisconnect === "function") {
      try { options.onDisconnect(reason); } catch (_) {}
    }
    if (stream && typeof stream.destroy === "function" && !stream.destroyed) {
      stream.destroy();
    }
  };
  const onRequestAborted = () => destroyStream("request-aborted");
  const onResponseFinish = () => {
    responseFinished = true;
  };
  const onResponseClose = () => {
    if (shouldDestroyProxyMediaUpstream({
      requestAborted: false,
      responseFinished,
      responseClosed: true
    })) {
      destroyStream("response-close");
    }
  };
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    request?.removeListener?.("aborted", onRequestAborted);
    response?.removeListener?.("finish", onResponseFinish);
    response?.removeListener?.("close", onResponseClose);
  };

  request?.once?.("aborted", onRequestAborted);
  response?.once?.("finish", onResponseFinish);
  response?.once?.("close", onResponseClose);

  return {
    cleanup,
    wasClientDisconnected: () => clientDisconnected,
    wasResponseFinished: () => responseFinished
  };
}

module.exports = {
  bindProxyMediaStreamLifecycle,
  fetchProxyMediaWithTimeout,
  isTransientProxyMediaError,
  shouldDestroyProxyMediaUpstream
};
