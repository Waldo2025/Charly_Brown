const DEFAULT_ANALIZAR_PDF_WORKER_BASE_URL = "https://analizar-pdf-worker-128488238449.us-central1.run.app";
const FORWARDED_REQUEST_HEADERS = Object.freeze([
  "authorization",
  "content-type",
  "x-request-id",
  "x-session-id",
  "x-revision-id",
  "x-file-id",
  "x-file-name",
  "x-mapping-id",
  "x-use-stored-source",
  "x-local-analysis-context",
  "x-analysis-categories"
]);
const FORWARDED_RESPONSE_HEADERS = Object.freeze([
  "content-type",
  "content-disposition",
  "content-length",
  "etag",
  "last-modified"
]);

function resolveAnalizarPdfWorkerBaseUrl() {
  return String(process.env.ANALIZAR_PDF_WORKER_BASE_URL || DEFAULT_ANALIZAR_PDF_WORKER_BASE_URL)
    .trim()
    .replace(/\/+$/, "");
}

function buildWorkerHeaders(req) {
  const headers = {};
  FORWARDED_REQUEST_HEADERS.forEach((name) => {
    const value = req.headers?.[name];
    if (value !== undefined && value !== null && String(value).trim()) headers[name] = String(value);
  });
  return headers;
}

function resolveWorkerRequestBody(req) {
  if (["GET", "HEAD"].includes(String(req.method || "GET").toUpperCase())) return undefined;
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (req.body && typeof req.body === "object") return Buffer.from(JSON.stringify(req.body));
  if (typeof req.body === "string") return Buffer.from(req.body);
  return undefined;
}

function registerAnalizarPdfWorkerProxyRoutes(app) {
  app.use("/api/analizar-pdf", async (req, res, next) => {
    try {
      const baseUrl = resolveAnalizarPdfWorkerBaseUrl();
      if (!baseUrl) throw Object.assign(new Error("analizar_pdf_worker_base_url_missing"), { status: 503 });
      const requestPath = String(req.originalUrl || req.url || "");
      const response = await fetch(`${baseUrl}${requestPath}`, {
        method: req.method,
        headers: buildWorkerHeaders(req),
        body: resolveWorkerRequestBody(req),
        redirect: "manual",
        signal: AbortSignal.timeout(110000)
      });
      FORWARDED_RESPONSE_HEADERS.forEach((name) => {
        const value = response.headers.get(name);
        if (value) res.setHeader(name, value);
      });
      const body = Buffer.from(await response.arrayBuffer());
      if (!response.ok && !String(response.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
        return res.status(response.status).json({
          error: "analizar_pdf_worker_request_failed",
          status: response.status
        });
      }
      return res.status(response.status).send(body);
    } catch (error) {
      if (error?.name === "AbortError" || error?.name === "TimeoutError") {
        return res.status(504).json({ error: "analizar_pdf_worker_timeout" });
      }
      return next(Object.assign(new Error("analizar_pdf_worker_unavailable"), {
        status: Number(error?.status || 502),
        cause: error
      }));
    }
  });
}

module.exports = {
  DEFAULT_ANALIZAR_PDF_WORKER_BASE_URL,
  resolveAnalizarPdfWorkerBaseUrl,
  registerAnalizarPdfWorkerProxyRoutes
};
