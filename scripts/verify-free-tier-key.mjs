#!/usr/bin/env node
// Phase 0 attestation for the AI Studio free tier used by PigPen text.
// It proves three things the routing code cannot know by itself: the key works on the
// Developer API, the model id we will configure really exists there, and the project
// behind the key is still on the FREE bucket instead of a billed one.
// The key is read from the environment only, never from argv, so it stays out of ps(1)
// and out of the report.
import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const PROMPT = "Responde exactamente con: OK_CHB_FREE_TIER";
const FREE_SIGNAL = /free[_ -]?tier|plan gratuito|FREE_TIER/i;
const PAID_SIGNAL = /billing|paid|credit|PREMIUM|trial/i;

function parseArgs(argv = []) {
  const out = { model: DEFAULT_MODEL, burst: 0, write: true, timeoutMs: 30_000 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--models") out.model = String(argv[i + 1] || out.model).split(",")[0].trim(), i += 1;
    else if (a === "--burst") out.burst = Math.max(0, Math.min(40, Number(argv[i + 1] || 20))), i += 1;
    else if (a === "--no-write") out.write = false;
    else if (a === "--timeout-ms") out.timeoutMs = Number(argv[i + 1] || out.timeoutMs), i += 1;
    else if (a === "--help") out.help = true;
  }
  return out;
}

function apiKey() {
  return String(process.env.GEMINI_FREE_TIER_API_KEY || process.env.GEMINI_API_KEY || "").trim();
}

async function call(url, options = {}, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: res.status, ok: res.ok, json, text };
  } finally {
    clearTimeout(timer);
  }
}

// A quota 429 from the Developer API names the bucket in error.details[].violations;
// that is the only in-band evidence that the project was never given a billing account.
function readQuotaEvidence(response) {
  const details = Array.isArray(response?.json?.error?.details) ? response.json.error.details : [];
  const violations = details.flatMap((detail) => (Array.isArray(detail?.violations) ? detail.violations : []));
  const consumers = details.map((detail) => String(detail?.reason || "")).filter(Boolean);
  const text = [JSON.stringify(violations), JSON.stringify(consumers), String(response?.json?.error?.message || "")].join(" ");
  return {
    violations,
    consumers,
    quotaExhausted: response?.status === 429,
    freeSignal: FREE_SIGNAL.test(text),
    paidSignal: PAID_SIGNAL.test(text),
    snippet: text.slice(0, 600)
  };
}

async function listModels(key, timeoutMs) {
  const res = await call(`${BASE_URL}/models?pageSize=200`, { headers: { "x-goog-api-key": key } }, timeoutMs);
  if (!res.ok) return { ok: false, status: res.status, message: res.json?.error?.message || res.text?.slice(0, 300) };
  const models = (res.json?.models || [])
    .filter((model) => (model?.supportedGenerationMethods || []).includes("generateContent"))
    .map((model) => ({
      id: String(model.name || "").replace(/^models\//, ""),
      inputTokenLimit: Number(model.inputTokenLimit || 0),
      // Grounding services are advertised per model; free-tier keys must not rely on them.
      grounding: ["GOOGLE_SEARCH", "SEARCH", "URL_CONTEXT"].filter((token) => JSON.stringify(model).includes(token))
    }));
  return { ok: true, models };
}

async function generate(key, model, timeoutMs) {
  return call(`${BASE_URL}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: PROMPT }] }], generationConfig: { maxOutputTokens: 8, temperature: 0 } })
  }, timeoutMs);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("usage: GEMINI_FREE_TIER_API_KEY=... node scripts/verify-free-tier-key.mjs [--models <id>] [--burst <n>] [--no-write]");
    return;
  }
  const key = apiKey();
  if (!key) throw new Error("Falta GEMINI_FREE_TIER_API_KEY en el entorno; nunca la pases por argv.");
  const startedAt = new Date();
  const inventory = await listModels(key, options.timeoutMs);
  const modelOffered = inventory.ok ? inventory.models.some((model) => model.id === options.model) : false;

  let single = null;
  if (modelOffered) single = await generate(key, options.model, options.timeoutMs);
  const singleEvidence = single ? readQuotaEvidence(single) : null;

  // The RPM ceiling only shows up under load, so an optional burst turns the bucket
  // signal into evidence instead of guesswork.
  const burst = [];
  if (options.burst && modelOffered) {
    const responses = await Promise.all(Array.from({ length: options.burst }, () => generate(key, options.model, options.timeoutMs)));
    for (const response of responses) burst.push({ status: response.status, ...readQuotaEvidence(response) });
  }
  const burstViolations = burst.filter((item) => item.quotaExhausted);
  const freeSignal = Boolean(singleEvidence?.freeSignal) || burstViolations.some((item) => item.freeSignal);
  const paidSignal = burstViolations.some((item) => item.paidSignal && !item.freeSignal);
  const plan = freeSignal && !paidSignal ? "free" : "unverified";

  const report = {
    checkedAt: startedAt.toISOString(),
    model: options.model,
    modelOfferedByDeveloperApi: modelOffered,
    firstCall: single ? { status: single.status, served: single.status === 200 && Boolean(single.json?.candidates?.[0]), evidence: singleEvidence } : null,
    burst: { requested: options.burst, exhausted: burstViolations.length, signals: burstViolations.map((item) => item.snippet).slice(0, 3) },
    modelsWithGenerateContent: inventory.ok ? inventory.models.map((model) => model.id) : [],
    groundingAdvertised: inventory.ok ? [...new Set(inventory.models.flatMap((model) => model.grounding))] : [],
    plan,
    env: {
      GEMINI_FREE_TIER_PLAN: plan,
      GEMINI_FREE_TIER_TEXT_MODEL: plan === "free" && modelOffered ? options.model : ""
    },
    nextSteps: [
      plan === "free"
        ? "Exporta GEMINI_FREE_TIER_PLAN=free y GEMINI_FREE_TIER_TEXT_MODEL=" + options.model + " en Functions."
        : "No actives el flag: sin señas de bucket gratuito, el routing debe quedarse en Vertex.",
      "Confirma además que el proyecto no tiene facturación: gcloud billing projects describe <proyecto> --format=\"value(billingAccountName)\" debe estar vacío.",
      "Una key de proyecto con facturación se factura en silencio: si aparece cualquier señal de billing, crea el secreto en otro proyecto."
    ]
  };

  console.log(JSON.stringify(report, null, 2));
  if (!options.write) return;
  const day = startedAt.toISOString().slice(0, 10);
  const dir = path.resolve("docs/validation");
  const file = path.join(dir, `gemini-free-tier-${day}.md`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, [
    `# Gemini free tier attestation (${day})`,
    "",
    `- Modelo sondeado: \`${options.model}\``,
    `- Disponible en la Developer API: ${modelOffered ? "sí" : "no"}`,
    `- Primera llamada: ${single ? `HTTP ${single.status}${single.status === 200 ? " (servida)" : ""}` : "no ejecutada"}`,
    `- Ráfaga de ${options.burst} llamadas: ${burstViolations.length} respuestas 429`,
    `- Señal de bucket gratuito: ${freeSignal ? "sí" : "no"}; señal de facturación: ${paidSignal ? "sí" : "no"}`,
    `- Servicios de grounding anunciados por los modelos: ${report.groundingAdvertised.length ? report.groundingAdvertised.join(", ") : "ninguno"} (el plan gratuito no los ofrece; fase 2)`,
    `- **Plan verificado: ${plan}**`,
    "",
    "## Variables resultantes",
    "",
    "```sh",
    `GEMINI_FREE_TIER_PLAN=${plan}`,
    ...(report.env.GEMINI_FREE_TIER_TEXT_MODEL ? [`GEMINI_FREE_TIER_TEXT_MODEL=${report.env.GEMINI_FREE_TIER_TEXT_MODEL}`] : []),
    "```",
    "",
    "## Modelos que ofrecen generateContent",
    "",
    ...(inventory.ok ? report.modelsWithGenerateContent.map((id) => `- \`${id}\``) : ["- El sondeo de modelos falló; revisa la key."]),
    "",
    "## Notas",
    "",
    ...(report.nextSteps.map((step) => `- ${step}`)),
    ""
  ].join("\n"));
  console.log(`report: ${path.relative(process.cwd(), file)}`);
}

main().catch((error) => {
  console.error(String(error?.message || error).slice(0, 400));
  process.exitCode = 1;
});
