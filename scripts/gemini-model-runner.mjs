#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_PROMPT =
  "Responde exactamente con: OK_CHB_GEMINI_SMOKE";
const DEFAULT_CANDIDATES = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
  "gemini-3-pro-preview"
];

function parseArgs(argv = []) {
  const out = {
    list: false,
    smoke: false,
    all: false,
    prompt: DEFAULT_PROMPT,
    timeoutMs: 20000,
    maxOutputTokens: 128,
    models: [],
    write: true
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--list") out.list = true;
    else if (a === "--smoke") out.smoke = true;
    else if (a === "--all") out.all = true;
    else if (a === "--no-write") out.write = false;
    else if (a === "--prompt") out.prompt = String(argv[i + 1] || "").trim() || DEFAULT_PROMPT, i += 1;
    else if (a === "--models") out.models = String(argv[i + 1] || "").split(",").map((x) => x.trim()).filter(Boolean), i += 1;
    else if (a === "--timeout-ms") out.timeoutMs = Number(argv[i + 1] || out.timeoutMs), i += 1;
    else if (a === "--max-output-tokens") out.maxOutputTokens = Number(argv[i + 1] || out.maxOutputTokens), i += 1;
  }
  if (!out.list && !out.smoke) out.smoke = true;
  return out;
}

function getApiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.API_KEY ||
    ""
  ).trim();
}

function normalizeModelId(name = "") {
  const n = String(name || "").trim();
  if (!n) return "";
  return n.replace(/^models\//i, "").replace(/:generateContent$/i, "").trim();
}

function withTimeout(promise, timeoutMs) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function getJson(url, timeoutMs) {
  const res = await withTimeout(fetch(url), timeoutMs);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (_) {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.error?.message || json?.raw || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

async function postJson(url, body, timeoutMs) {
  const res = await withTimeout(
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }),
    timeoutMs
  );
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (_) {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.error?.message || json?.raw || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

function supportsGenerateContent(m = {}) {
  const methods = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
  return methods.includes("generateContent");
}

function supportsLive(m = {}) {
  const methods = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
  return methods.includes("bidiGenerateContent");
}

function extractText(resp = {}) {
  const cands = Array.isArray(resp.candidates) ? resp.candidates : [];
  const parts = cands.flatMap((c) => c?.content?.parts || []);
  const texts = parts.map((p) => p?.text || "").filter(Boolean);
  return texts.join("\n").trim();
}

function modelSortScore(item) {
  if (!item.ok) return -1e9;
  const latencyScore = Math.max(0, 40000 - Number(item.latencyMs || 40000));
  const lengthScore = Math.min(500, Number(item.outputChars || 0));
  const liveBonus = item.supportsLive ? 150 : 0;
  const stableBonus = /preview/i.test(item.model) ? 0 : 250;
  return latencyScore + lengthScore + liveBonus + stableBonus;
}

function isTextSafeModelId(model = "") {
  const m = String(model || "").toLowerCase();
  if (!m) return false;
  if (m.includes("image")) return false;
  if (m.includes("tts")) return false;
  if (m.includes("computer-use")) return false;
  if (m.includes("deep-research")) return false;
  if (m.includes("robotics")) return false;
  return true;
}

async function listModels(apiKey, timeoutMs) {
  const url = `${BASE_URL}/models?key=${encodeURIComponent(apiKey)}`;
  const json = await getJson(url, timeoutMs);
  const models = Array.isArray(json.models) ? json.models : [];
  return models
    .map((m) => ({
      name: String(m.name || ""),
      model: normalizeModelId(m.name || ""),
      displayName: String(m.displayName || ""),
      supportedGenerationMethods: Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [],
      inputTokenLimit: Number(m.inputTokenLimit || 0),
      outputTokenLimit: Number(m.outputTokenLimit || 0),
      supportsGenerateContent: supportsGenerateContent(m),
      supportsLive: supportsLive(m)
    }))
    .filter((m) => !!m.model);
}

async function runSmoke({ model, apiKey, prompt, timeoutMs, maxOutputTokens, supportsLive: modelSupportsLive }) {
  const startedAt = Date.now();
  const url = `${BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try {
    const resp = await postJson(
      url,
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens
        }
      },
      timeoutMs
    );
    const output = extractText(resp);
    return {
      model,
      ok: true,
      latencyMs: Date.now() - startedAt,
      outputChars: output.length,
      outputSample: output.slice(0, 200),
      supportsLive: !!modelSupportsLive
    };
  } catch (err) {
    return {
      model,
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: String(err?.message || err),
      outputChars: 0,
      outputSample: "",
      supportsLive: !!modelSupportsLive
    };
  }
}

function buildModelPlan({ cliModels, all, listed }) {
  const availableGenerate = listed.filter((m) => m.supportsGenerateContent).map((m) => m.model);
  const dedup = (arr) => [...new Set(arr.map(normalizeModelId).filter(Boolean))];
  if (cliModels.length) return dedup(cliModels).filter((m) => availableGenerate.includes(m));
  if (all) return dedup(availableGenerate);
  return dedup(DEFAULT_CANDIDATES).filter((m) => availableGenerate.includes(m));
}

async function writeReport(report) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.resolve(process.cwd(), "backups");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `gemini-model-report-${ts}.json`);
  await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outPath;
}

function printList(models) {
  const rows = models
    .filter((m) => m.supportsGenerateContent)
    .sort((a, b) => a.model.localeCompare(b.model))
    .map((m) => [
      m.model,
      m.supportsLive ? "yes" : "no",
      String(m.inputTokenLimit || 0),
      String(m.outputTokenLimit || 0)
    ]);
  console.log("MODEL | LIVE | INPUT_TOKENS | OUTPUT_TOKENS");
  for (const r of rows) console.log(`${r[0]} | ${r[1]} | ${r[2]} | ${r[3]}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error("Missing API key. Set GEMINI_API_KEY (or GOOGLE_API_KEY).");
    process.exit(1);
  }

  const listed = await listModels(apiKey, args.timeoutMs);
  if (args.list) printList(listed);
  if (!args.smoke) return;

  const plan = buildModelPlan({ cliModels: args.models, all: args.all, listed });
  if (!plan.length) {
    console.error("No testable models found with generateContent support.");
    process.exit(1);
  }

  const metaMap = new Map(listed.map((m) => [m.model, m]));
  const results = [];
  for (const model of plan) {
    const r = await runSmoke({
      model,
      apiKey,
      prompt: args.prompt,
      timeoutMs: args.timeoutMs,
      maxOutputTokens: args.maxOutputTokens,
      supportsLive: !!metaMap.get(model)?.supportsLive
    });
    results.push(r);
    const status = r.ok ? "OK" : "FAIL";
    console.log(`[${status}] ${model} (${r.latencyMs}ms)${r.ok ? "" : ` -> ${r.error}`}`);
  }

  const ranked = [...results].sort((a, b) => modelSortScore(b) - modelSortScore(a));
  const success = ranked.filter((x) => x.ok);
  const fallbackChain = success.map((x) => x.model);
  const fallbackChainTextSafe = success.map((x) => x.model).filter(isTextSafeModelId);
  const report = {
    testedAt: new Date().toISOString(),
    prompt: args.prompt,
    timeoutMs: args.timeoutMs,
    maxOutputTokens: args.maxOutputTokens,
    testedModels: plan,
    summary: {
      total: results.length,
      ok: success.length,
      failed: results.length - success.length,
      recommended: fallbackChain[0] || null,
      fallbackChain,
      recommendedTextSafe: fallbackChainTextSafe[0] || null,
      fallbackChainTextSafe
    },
    results: ranked
  };

  let outPath = "";
  if (args.write) outPath = await writeReport(report);

  console.log("\nRecommended policy:");
  console.log(
    JSON.stringify(
      {
        preferredModel: report.summary.recommended,
        fallbackChain: report.summary.fallbackChain,
        preferredModelTextSafe: report.summary.recommendedTextSafe,
        fallbackChainTextSafe: report.summary.fallbackChainTextSafe,
        testedAt: report.testedAt,
        reportPath: outPath || null
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("gemini-model-runner failed:", err?.message || err);
  process.exit(1);
});
