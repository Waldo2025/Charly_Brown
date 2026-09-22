const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  ANALYSIS_VERSION,
  ANALYSIS_TIMEOUT_MS,
  YOUTUBE_ANALYSIS_CACHE_COLLECTION,
  analyzeSingleYoutubeVideo,
  analyzeYoutubeVideos,
  compactVideoAnalysisForCache,
  normalizeYoutubeUrl,
  normalizeYoutubeUrls,
  youtubeAnalysisCacheKey
} = require("../src/marcie-youtube-agent.js");

test("el análisis de video usa el presupuesto extendido de la función", () => {
  assert.equal(ANALYSIS_TIMEOUT_MS, 500_000);
});

test("invalida análisis previos que no separan los dos ejes editoriales", () => {
  assert.equal(ANALYSIS_VERSION, 2);
  assert.equal(YOUTUBE_ANALYSIS_CACHE_COLLECTION, "MarcieYoutubeAnalysisCache");
});

const IDS = ["dQw4w9WgXcQ", "9bZkp7q19f0", "M7lc1UVf-VE", "aqz-KE-bpKQ", "jNQXAC9IVRw", "kJQP7kiw5Fk"];

function parsedVideo(overrides = {}) {
  return {
    title: "Aprender mejor",
    channel: "Canal educativo",
    publishedAt: "2026-09-22",
    summary: "Una síntesis editorial breve.",
    centralIdea: "La conversación interna influye en la experiencia cotidiana.",
    neuroeducationConnection: "El lenguaje puede relacionarse con emoción, atención y autorregulación en contextos educativos.",
    proposedTopics: ["Tema propuesto"],
    evidenceItems: [{ text: "La autora presenta una estrategia.", timestamp: "02:14", evidenceKind: "video_attribution" }],
    shortQuotes: [{ text: "Una cita breve", timestamp: "02:14" }],
    fullTranscript: "Este contenido nunca debe persistirse.",
    ...overrides
  };
}

test("acepta formatos públicos de YouTube, canonicaliza y rechaza imitadores", () => {
  const expected = `https://www.youtube.com/watch?v=${IDS[0]}`;
  [
    `https://www.youtube.com/watch?v=${IDS[0]}&utm_source=test&list=PL123`,
    `https://youtu.be/${IDS[0]}?si=tracking`,
    `https://youtube.com/shorts/${IDS[0]}?feature=share`,
    `https://m.youtube.com/live/${IDS[0]}?feature=share`
  ].forEach((url) => assert.deepEqual(normalizeYoutubeUrl(url), { videoId: IDS[0], url: expected }));
  [
    `http://youtube.com/watch?v=${IDS[0]}`,
    `https://youtube.example/watch?v=${IDS[0]}`,
    "https://www.youtube.com/playlist?list=PL123",
    "https://www.youtube.com/@canal"
  ].forEach((url) => assert.equal(normalizeYoutubeUrl(url), null));
});

test("deduplica y limita el expediente a cinco videos", () => {
  const input = [
    `https://youtu.be/${IDS[0]}`,
    `https://www.youtube.com/watch?v=${IDS[0]}`,
    ...IDS.slice(1).map((id) => `https://www.youtube.com/watch?v=${id}`)
  ];
  const result = normalizeYoutubeUrls(input);
  assert.equal(result.valid.length, 5);
  assert.equal(new Set(result.valid.map((item) => item.videoId)).size, 5);
});

test("usa Interactions con procesamiento agentivo para videos largos", async () => {
  let request;
  const client = { interactions: { create: async (value) => {
    request = value;
    return { id: "interaction-1", status: "completed", output_text: JSON.stringify(parsedVideo()) };
  } } };
  const source = normalizeYoutubeUrl(`https://youtu.be/${IDS[0]}`);
  const result = await analyzeSingleYoutubeVideo(source, { client });
  assert.equal(request.model, "gemini-3.8-flash");
  assert.deepEqual(request.input[0], { type: "video", uri: source.url, mime_type: "video/mp4", processing: "agentic", resolution: "low" });
  assert.equal(request.background, true);
  assert.equal(request.response_mime_type, "application/json");
  assert.equal(result.bibliographySource.verificationStatus, "attributed_only");
  assert.match(result.centralIdea, /conversación interna/);
  assert.match(result.neuroeducationConnection, /autorregulación/);
  assert.equal(Object.hasOwn(result, "fullTranscript"), false);
  assert.equal(JSON.stringify(result).includes("Este contenido nunca debe persistirse"), false);
});

test("espera una interacción en segundo plano hasta completarse", async () => {
  let polls = 0;
  const client = {
    interactions: {
      create: async () => ({ id: "interaction-queued", status: "queued" }),
      get: async () => (++polls === 1
        ? { id: "interaction-queued", status: "in_progress" }
        : { id: "interaction-queued", status: "completed", output_text: JSON.stringify(parsedVideo()) })
    }
  };
  const result = await analyzeSingleYoutubeVideo(normalizeYoutubeUrl(`https://youtu.be/${IDS[0]}`), { client, sleep: async () => {} });
  assert.equal(polls, 2);
  assert.equal(result.title, "Aprender mejor");
});

test("conserva generateContent como compatibilidad cuando Interactions no está disponible", async () => {
  let request;
  const client = { models: { generateContent: async (value) => {
    request = value;
    return { text: JSON.stringify(parsedVideo()) };
  } } };
  const source = normalizeYoutubeUrl(`https://youtu.be/${IDS[0]}`);
  await analyzeSingleYoutubeVideo(source, { client });
  assert.deepEqual(request.contents[0].parts[0].fileData, { fileUri: source.url, mimeType: "video/mp4" });
});

test("continúa con videos válidos cuando existe un fallo parcial", async () => {
  const result = await analyzeYoutubeVideos({ urls: IDS.slice(0, 3).map((id) => `https://youtu.be/${id}`) }, {
    analyzeVideo: async (source) => {
      if (source.videoId === IDS[1]) throw Object.assign(new Error("private_video"), { code: "private_video" });
      return {
        videoId: source.videoId,
        url: source.url,
        title: `Video ${source.videoId}`,
        proposedTopics: ["Tema"],
        evidenceItems: [],
        warnings: [],
        bibliographySource: { id: `youtube-${source.videoId}`, sourceType: "youtube_video", url: source.url }
      };
    }
  });
  assert.equal(result.videos.length, 2);
  assert.equal(result.rejectedVideos.length, 1);
  assert.match(result.warnings.join(" "), /private_video/);
});

test("reutiliza desde Firebase el análisis del mismo video y objetivo", async () => {
  const cache = new Map();
  let analysisCalls = 0;
  const url = `https://youtu.be/${IDS[0]}`;
  const options = {
    readCachedAnalysis: async ({ source, objective, language }) => cache.get(youtubeAnalysisCacheKey({ ownerId: "user-1", videoId: source.videoId, objective, language })) || null,
    writeCachedAnalysis: async ({ source, objective, language, video }) => cache.set(youtubeAnalysisCacheKey({ ownerId: "user-1", videoId: source.videoId, objective, language }), video),
    analyzeVideo: async (source) => {
      analysisCalls += 1;
      return compactVideoAnalysisForCache({
        ...parsedVideo({ fullTranscript: "no guardar", rawAudio: "no guardar" }),
        videoId: source.videoId,
        url: source.url,
        topics: ["lenguaje"],
        concepts: ["autorregulación"],
        warnings: [],
        bibliographySource: { id: `youtube-${source.videoId}`, title: "Aprender mejor", authors: ["Canal educativo"], url: source.url }
      });
    }
  };

  const first = await analyzeYoutubeVideos({ urls: [url], objective: "Neuroeducación" }, options);
  const second = await analyzeYoutubeVideos({ urls: [url], objective: "Neuroeducación" }, options);
  assert.equal(analysisCalls, 1);
  assert.deepEqual(first.cache, { hitCount: 0, missCount: 1 });
  assert.deepEqual(second.cache, { hitCount: 1, missCount: 0 });
  assert.equal(second.videos[0].centralIdea, parsedVideo().centralIdea);
  assert.doesNotMatch(JSON.stringify([...cache.values()]), /fullTranscript|rawAudio|no guardar/);
});

test("separa la caché cuando cambia el objetivo editorial", () => {
  const base = { ownerId: "user-1", videoId: IDS[0], language: "es-MX" };
  assert.notEqual(
    youtubeAnalysisCacheKey({ ...base, objective: "Docentes" }),
    youtubeAnalysisCacheKey({ ...base, objective: "Familias" })
  );
});

test("bloquea la confirmación cuando fallan todos los videos", async () => {
  await assert.rejects(
    analyzeYoutubeVideos({ urls: [`https://youtu.be/${IDS[0]}`] }, { analyzeVideo: async () => { throw new Error("inaccesible"); } }),
    (error) => error.code === "youtube_analysis_empty" && error.status === 422
  );
});

test("distingue un análisis agotado de un video inválido", async () => {
  await assert.rejects(
    analyzeYoutubeVideos({ urls: [`https://youtu.be/${IDS[0]}`] }, {
      analyzeVideo: async () => { throw Object.assign(new Error("youtube_analysis_timeout"), { code: "youtube_analysis_timeout" }); }
    }),
    (error) => error.code === "youtube_analysis_timeout" && error.status === 504 && /tardó más de lo esperado/i.test(error.message)
  );
});

test("rechaza más de cinco URLs en una sola solicitud", async () => {
  await assert.rejects(
    analyzeYoutubeVideos({ urls: IDS.map((id) => `https://youtu.be/${id}`) }, { analyzeVideo: async () => ({}) }),
    (error) => error.code === "youtube_url_limit" && error.status === 400
  );
});

test("la sesión persiste el expediente permitido sin audio ni transcripción", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-session-store.js"), "utf8");
  const code = source.slice(source.indexOf("function omitUndefinedFirestoreValues"), source.indexOf("async function persistMarcieSession")).replace(/\bexport /g, "");
  const context = vm.createContext({});
  vm.runInContext(code, context);
  const compact = context.compactMarcieSessionForFirestore({
    sourceInputs: { youtube: [{ videoId: IDS[0], url: `https://www.youtube.com/watch?v=${IDS[0]}` }] },
    sessionConfiguration: { videoResearch: { duplicated: true }, sourceInputs: { youtube: [] } },
    videoResearch: { analysisVersion: 1, cache: { hitCount: 1, missCount: 0 }, fullTranscript: "no guardar", rawAudio: "no guardar", videos: [{ videoId: IDS[0], url: `https://www.youtube.com/watch?v=${IDS[0]}`, title: "Video", centralIdea: "Idea central", neuroeducationConnection: "Relación educativa", fullTranscript: "no guardar" }] }
  });
  const serialized = JSON.stringify(compact);
  assert.equal(compact.videoResearch.videos[0].title, "Video");
  assert.equal(compact.videoResearch.videos[0].centralIdea, "Idea central");
  assert.equal(compact.videoResearch.videos[0].neuroeducationConnection, "Relación educativa");
  assert.deepEqual(JSON.parse(JSON.stringify(compact.videoResearch.cache)), { hitCount: 1, missCount: 0 });
  assert.equal(Object.hasOwn(compact.sessionConfiguration, "videoResearch"), false);
  assert.doesNotMatch(serialized, /fullTranscript|rawAudio|no guardar/);
});
