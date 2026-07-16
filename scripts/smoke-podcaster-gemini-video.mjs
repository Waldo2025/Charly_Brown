#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MAX_PROVIDER_WAIT_MS = 7 * 60 * 1000;
const POLL_INTERVAL_MS = 10_000;

function readArgValue(name, fallback = "") {
  const directPrefix = `${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(directPrefix));
  if (direct) return direct.slice(directPrefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    return { raw: text.slice(0, 2_000) };
  }
}

function apiHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    "x-goog-api-key": apiKey
  };
}

function extractVideoContent(payload = {}) {
  const stepContent = Array.isArray(payload?.steps)
    ? payload.steps.flatMap((step) => Array.isArray(step?.content) ? step.content : [])
    : [];
  const interactionVideo = stepContent.find((item) => item?.type === "video") || payload?.output_video || null;
  if (interactionVideo?.data || interactionVideo?.uri) return interactionVideo;

  const generated = payload?.response?.generateVideoResponse?.generatedSamples
    || payload?.response?.generatedVideos
    || payload?.generateVideoResponse?.generatedSamples
    || payload?.generatedVideos
    || [];
  const first = Array.isArray(generated) ? generated[0] : null;
  return first?.video || first || null;
}

async function downloadVideo(video, outputPath, apiKey) {
  if (video?.data) {
    await writeFile(outputPath, Buffer.from(String(video.data), "base64"));
    return;
  }
  const uri = String(video?.uri || "").trim();
  if (!uri) throw new Error("Gemini terminó sin devolver datos ni URI de video.");
  const fileMatch = uri.match(/\/files\/([^/:?]+)(?::download)?/i);
  if (fileMatch?.[1]) {
    const deadline = Date.now() + MAX_PROVIDER_WAIT_MS;
    let fileReady = false;
    while (Date.now() < deadline) {
      const stateResponse = await fetch(`${GEMINI_BASE}/files/${encodeURIComponent(fileMatch[1])}`, {
        headers: { "x-goog-api-key": apiKey }
      });
      const statePayload = await readJson(stateResponse);
      if (!stateResponse.ok) {
        throw new Error(`No se pudo consultar el archivo de video (${stateResponse.status}): ${statePayload?.error?.message || statePayload?.raw || "sin detalle"}`);
      }
      const state = String(statePayload?.state?.name || statePayload?.state || "").trim().toUpperCase();
      if (state === "ACTIVE") {
        fileReady = true;
        break;
      }
      if (state === "FAILED") throw new Error("Gemini marcó el archivo de video como FAILED.");
      await sleep(5_000);
    }
    if (!fileReady) throw new Error("El archivo de video no quedó ACTIVE dentro de siete minutos.");
  }
  const downloadUri = fileMatch?.[1]
    ? `${GEMINI_BASE}/files/${encodeURIComponent(fileMatch[1])}:download?alt=media`
    : (/^https?:\/\//i.test(uri)
      ? uri
      : `${GEMINI_BASE}/${uri.replace(/^\/+/, "")}${uri.includes(":download") ? "" : ":download?alt=media"}`);
  const response = await fetch(downloadUri, { headers: { "x-goog-api-key": apiKey } });
  if (!response.ok) {
    const detail = await readJson(response);
    throw new Error(`No se pudo descargar el video (${response.status}): ${detail?.error?.message || detail?.raw || "sin detalle"}`);
  }
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
}

async function pollOperation(name, apiKey) {
  const operationName = String(name || "").replace(/^\/+/, "");
  if (!operationName) throw new Error("Veo no devolvió el nombre de la operación.");
  const deadline = Date.now() + MAX_PROVIDER_WAIT_MS;
  while (Date.now() < deadline) {
    const response = await fetch(`${GEMINI_BASE}/${operationName}`, {
      headers: { "x-goog-api-key": apiKey }
    });
    const payload = await readJson(response);
    if (!response.ok) {
      throw new Error(`Polling Veo falló (${response.status}): ${payload?.error?.message || payload?.raw || "sin detalle"}`);
    }
    if (payload?.done === true) {
      if (payload?.error) throw new Error(`Veo falló: ${payload.error?.message || JSON.stringify(payload.error)}`);
      return payload;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("Veo excedió el límite de siete minutos del smoke test.");
}

function buildOmniPayload() {
  return {
    model: "gemini-omni-flash-preview",
    input: [
      {
        type: "text",
        text: [
          "Single continuous title-card shot. No scene cuts.",
          "Render exactly one centered line: \"CHARLY PODCAST\".",
          "Large clean sans-serif letters, high contrast, static and fully visible.",
          "No other visible text. No subtitles. No dialogue."
        ].join(" ")
      }
    ],
    response_format: {
      type: "video",
      aspect_ratio: "9:16",
      delivery: "uri"
    },
    generation_config: {
      video_config: {
        task: "text_to_video"
      }
    },
    store: true
  };
}

function buildVeoPayload() {
  return {
    instances: [{
      prompt: [
        "Single continuous cinematic shot of a warm modern podcast studio without signage.",
        "A presenter adjusts headphones and looks toward the camera while soft practical lights glow in the background.",
        "Medium shot, slow dolly-in, natural motion, polished editorial lighting.",
        "Ambient room tone only. No dialogue.",
        "No subtitles, captions, signs, logos, visible letters, words, or pseudo-text."
      ].join(" ")
    }],
    parameters: {
      aspectRatio: "16:9",
      durationSeconds: 8,
      resolution: "1080p",
      personGeneration: "allow_all"
    }
  };
}

async function runOmni(apiKey, outputDir) {
  const response = await fetch(`${GEMINI_BASE}/interactions`, {
    method: "POST",
    headers: apiHeaders(apiKey),
    body: JSON.stringify(buildOmniPayload())
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(`Omni falló (${response.status}): ${payload?.error?.message || payload?.raw || "sin detalle"}`);
  }
  const video = extractVideoContent(payload);
  const outputPath = path.join(outputDir, "omni-charly-podcast.mp4");
  await downloadVideo(video, outputPath, apiKey);
  return { provider: "omni", model: payload?.model || "gemini-omni-flash-preview", interactionId: payload?.id || "", outputPath };
}

async function runVeo(apiKey, outputDir) {
  const model = "veo-3.1-generate-preview";
  const response = await fetch(`${GEMINI_BASE}/models/${model}:predictLongRunning`, {
    method: "POST",
    headers: apiHeaders(apiKey),
    body: JSON.stringify(buildVeoPayload())
  });
  const created = await readJson(response);
  if (!response.ok) {
    throw new Error(`Veo falló (${response.status}): ${created?.error?.message || created?.raw || "sin detalle"}`);
  }
  const completed = created?.done === true ? created : await pollOperation(created?.name, apiKey);
  const video = extractVideoContent(completed);
  const outputPath = path.join(outputDir, "veo-no-visible-text.mp4");
  await downloadVideo(video, outputPath, apiKey);
  return { provider: "veo", model, operationName: created?.name || "", outputPath };
}

const provider = String(readArgValue("--provider", "all")).trim().toLowerCase();
if (!new Set(["all", "omni", "veo"]).has(provider)) {
  throw new Error("--provider debe ser all, omni o veo.");
}

const paidConfirmation = process.argv.includes("--confirm-paid")
  && process.env.PODCASTER_GEMINI_VIDEO_SMOKE === "1";

if (!paidConfirmation) {
  console.log("DRY RUN: no se realizaron llamadas a Gemini.");
  console.log("Omni payload:", JSON.stringify(buildOmniPayload(), null, 2));
  console.log("Veo payload:", JSON.stringify(buildVeoPayload(), null, 2));
  console.log("Para ejecutar con cuota: PODCASTER_GEMINI_VIDEO_SMOKE=1 node scripts/smoke-podcaster-gemini-video.mjs --confirm-paid --provider=all");
  process.exit(0);
}

const apiKey = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
if (!apiKey) throw new Error("Falta GEMINI_API_KEY o GOOGLE_API_KEY.");

const outputDir = path.resolve(readArgValue("--output", "tmp/podcaster-gemini-video-smoke"));
await mkdir(outputDir, { recursive: true });

const results = [];
if (provider === "all" || provider === "omni") results.push(await runOmni(apiKey, outputDir));
if (provider === "all" || provider === "veo") results.push(await runVeo(apiKey, outputDir));

console.log(JSON.stringify({ ok: true, results }, null, 2));
