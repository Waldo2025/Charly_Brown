const DEFAULT_BASE_URL = String(process.env.LANGUAGETOOL_BASE_URL || "http://127.0.0.1:8081").trim().replace(/\/+$/, "");

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} at ${url}`);
    error.status = response.status;
    error.detail = data;
    throw error;
  }
  return data;
}

function summarizeMatch(match = {}) {
  return {
    message: String(match?.message || "").trim(),
    shortMessage: String(match?.shortMessage || "").trim(),
    offset: Number(match?.offset || 0) || 0,
    length: Number(match?.length || 0) || 0,
    replacements: Array.isArray(match?.replacements)
      ? match.replacements.slice(0, 4).map((entry) => String(entry?.value || "").trim()).filter(Boolean)
      : [],
    ruleId: String(match?.rule?.id || "").trim(),
    issueType: String(match?.rule?.issueType || "").trim(),
    category: String(match?.rule?.category?.id || "").trim()
  };
}

async function main() {
  const sampleText = "Este texsto tiene un error ortografico y otra palabra mal escrita.";
  console.log(`[languagetool:check] base URL: ${DEFAULT_BASE_URL}`);

  const languages = await fetchJson(`${DEFAULT_BASE_URL}/v2/languages`, {
    method: "GET",
    headers: { Accept: "application/json" }
  });
  const hasSpanish = Array.isArray(languages) && languages.some((entry) => String(entry?.code || "").toLowerCase().startsWith("es"));
  console.log(`[languagetool:check] languages ok: ${Array.isArray(languages) ? languages.length : 0} disponibles`);
  if (!hasSpanish) {
    throw new Error("LanguageTool no reporta soporte para español en /v2/languages.");
  }

  const body = new URLSearchParams({
    language: "es",
    text: sampleText
  });
  const check = await fetchJson(`${DEFAULT_BASE_URL}/v2/check`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const matches = Array.isArray(check?.matches) ? check.matches : [];
  console.log(`[languagetool:check] check ok: ${matches.length} hallazgos`);
  console.log(JSON.stringify({
    ok: true,
    baseUrl: DEFAULT_BASE_URL,
    hasSpanish,
    sampleText,
    matches: matches.slice(0, 5).map((match) => summarizeMatch(match))
  }, null, 2));
}

main().catch((error) => {
  const payload = {
    ok: false,
    baseUrl: DEFAULT_BASE_URL,
    error: String(error?.message || error),
    detail: error?.detail || null
  };
  console.error(JSON.stringify(payload, null, 2));
  process.exitCode = 1;
});
