// Keep provider diagnostics separate from request bodies, headers and credentials.
function vertexFailureDiagnostic(error, context = {}) {
  let body = error?.response?.data;
  if (!body) {
    try { body = JSON.parse(String(error?.message || "")); } catch { body = {}; }
  }
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const provider = body?.error || body || {};
  const clean = value => String(value || "")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/AIza[\w-]+/g, "[redacted]")
    .replace(/([?&](?:key|token|access_token)=)[^&\s]+/gi, "$1[redacted]")
    .slice(0, 1500);
  const details = Array.isArray(provider.details) ? provider.details : [];
  const violations = details.flatMap(detail => Array.isArray(detail.violations) ? detail.violations : [])
    .slice(0, 8).map(item => ({ subject: clean(item.subject), description: clean(item.description) }));
  return {
    severity: "WARNING", event: "vertex_resource_exhausted", provider: "vertex-ai",
    service: "gemini-api", requestId: clean(context.requestId),
    model: clean(context.model), location: "global",
    providerStatus: Number(error?.status || error?.response?.status || provider.code) || 429,
    providerCode: clean(provider.status || error?.code || "RESOURCE_EXHAUSTED"),
    providerMessage: clean(provider.message || error?.message || "Resource exhausted"),
    quotaViolations: violations,
    retryDelay: clean(details.find(item => item.retryDelay)?.retryDelay)
  };
}

module.exports = { vertexFailureDiagnostic };
