import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const [runtime, styles, html2canvasRuntime] = await Promise.all([
  readFile(new URL("../public/js/science-assessment-export.js", import.meta.url), "utf8"),
  readFile(new URL("../public/science-assessment-export.css", import.meta.url), "utf8"),
  readFile(new URL("../node_modules/html2canvas-pro/dist/html2canvas-pro.min.js", import.meta.url), "utf8")
]);
const exportBundle = await readFile(new URL("../public/js/export-bundles/science-game-export.bundle.js", import.meta.url));

const historyId = "browser-history-fixture";
const storageKey = `scienceActivities:attempt-history:v1:${historyId}`;
const question = {
  type: "multiple",
  points: 1000,
  prompt: "¿Qué magnitud permanece constante en el MRU?",
  options: ["La velocidad", "La aceleración", "La fuerza neta", "El tiempo"],
  correct: 0,
  correctAnswers: [0],
  feedback: "En el MRU la velocidad permanece constante y la aceleración es cero."
};
const attempts = [1, 2].map((number) => ({
  id: `attempt-${number}`,
  number,
  completedAt: `2026-08-1${number}T18:00:00.000Z`,
  rawScore: number === 1 ? 180 : 160,
  penaltyRate: 0,
  score: number === 1 ? 180 : 160,
  accuracy: number === 1 ? 100 : 0,
  correct: number === 1 ? 1 : 0,
  totalQuestions: 1,
  bestStreak: number === 1 ? 1 : 0,
  questions: [{
    index: 1,
    level: 1,
    question: 1,
    type: "multiple",
    prompt: question.prompt,
    response: number === 1 ? "La velocidad" : "La aceleración",
    responseText: number === 1 ? "La velocidad" : "La aceleración",
    correctAnswer: "La velocidad",
    correct: number === 1,
    feedback: question.feedback,
    points: number === 1 ? 180 : 0,
    attempts: 1,
    durationMs: 12000
  }]
}));

const config = {
  historyId,
  exportPackage: { version: 4, historyId },
  title: "Física Tema 1 · Actividades MRU",
  subject: "physics",
  topic: "Movimiento rectilíneo uniforme",
  gameMode: "game",
  difficulty: "balanced",
  visualStyle: "rive-tokyo-tech",
  simulationType: "friction",
  levelCount: 1,
  questionsPerLevel: 1,
  questions: [question],
  theme: { sky: "#dff4ff", ground: "#8fd5c8", accent: "#ff7d68" },
  learningGuide: { levels: [{ title: "MRU", objective: "Analiza un movimiento uniforme.", concepts: [] }] }
};

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body data-science-export><main><div id="scienceGameMount"><canvas width="960" height="540"></canvas></div><div id="scienceGameControls"></div></main><script>window.SCIENCE_ASSESSMENT_CONFIG=${JSON.stringify(config)};window.SCIENCE_ASSESSMENT_INITIAL_VIEW="history";</script><script src="/capture.js"></script><script>window.__SCIENCE_HTML2CANVAS__=window.html2canvas.default||window.html2canvas;</script><script src="/runtime.js"></script></body></html>`;
const activeConfig = {
  ...config,
  historyId: `${historyId}-active`,
  exportPackage: { version: 7, historyId: `${historyId}-active` },
  questionsPerLevel: 2,
  questions: [question, { ...question, prompt: "¿Cuál es la segunda pregunta persistida?" }]
};
const activeHtml = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body data-science-export><main><div id="scienceGameMount"><canvas width="960" height="540"></canvas></div><div id="scienceGameControls"></div></main><script>window.SCIENCE_ASSESSMENT_CONFIG=${JSON.stringify(activeConfig)};window.SCIENCE_ASSESSMENT_INITIAL_VIEW="game";</script><script src="/capture.js"></script><script>window.__SCIENCE_HTML2CANVAS__=window.html2canvas.default||window.html2canvas;</script><script src="/runtime.js"></script></body></html>`;

const server = createServer((request, response) => {
  if (request.url === "/runtime.js") {
    response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    response.end(runtime);
    return;
  }
  if (request.url === "/styles.css") {
    response.writeHead(200, { "content-type": "text/css; charset=utf-8" });
    response.end(styles);
    return;
  }
  if (request.url === "/capture.js") {
    response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    response.end(html2canvasRuntime);
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(request.url === "/active" ? activeHtml : html);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const mainContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
const page = await mainContext.newPage();
const consoleErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => consoleErrors.push(error.message));
await page.addInitScript(() => {
  globalThis.__SCIENCE_WRITE_CAPTURE__ = async (blobPromise) => {
    const blob = await blobPromise;
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let darkPixels = 0;
    for (let y = 0; y < canvas.height; y += 4) {
      for (let x = 0; x < canvas.width; x += 4) {
        const offset = (y * canvas.width + x) * 4;
        if (pixels[offset + 3] > 180 && pixels[offset] < 120 && pixels[offset + 1] < 120 && pixels[offset + 2] < 120) darkPixels += 1;
      }
    }
    bitmap.close();
    window.__scienceCapturedPngs = window.__scienceCapturedPngs || [];
    window.__scienceCapturedPngs.push({ type: blob.type, size: blob.size, width: canvas.width, height: canvas.height, darkPixels });
  };
});
await page.addInitScript(({ key, value }) => {
  if (sessionStorage.getItem("science-history-fixture-seeded") === "true") return;
  localStorage.setItem(key, JSON.stringify(value));
  sessionStorage.setItem("science-history-fixture-seeded", "true");
}, {
  key: storageKey,
  value: { version: 1, historyId, totalCompleted: 3, attempts }
});

try {
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.locator(".science-history-book").waitFor();
  assert.equal(await page.locator(".science-history-attempt-tabs button").count(), 2);
  assert.match(await page.locator(".science-history-header p").innerText(), /3 intentos completados · Datos guardados/);
  assert.equal(await page.locator('[data-rive-role="history-core"]').count(), 1);
  assert.equal(await page.locator('[data-rive-role="history-attempt"]').count(), 2);
  assert.equal(await page.locator(".science-history-best strong").innerText(), "180");
  assert.equal(await page.locator(".science-assessment-host").getAttribute("data-visual-style"), "rive-tokyo-tech");
  assert.equal(await page.locator(".science-history-book input,.science-history-book select,.science-history-book textarea").count(), 0);
  assert.equal(await page.locator("[data-history-question]").first().getAttribute("aria-expanded"), "true");
  await page.locator("[data-history-question]").first().click();
  assert.equal(await page.locator("[data-history-question]").first().getAttribute("aria-expanded"), "false");
  await page.locator('[data-history-attempt="attempt-1"]').click();
  assert.match(await page.locator(".science-history-summary").innerText(), /180/);
  await page.locator("[data-share-history]").click();
  await page.waitForTimeout(3000);
  if (!await page.evaluate(() => window.__scienceCapturedPngs?.length)) {
    throw new Error(`Captura no generada: ${await page.evaluate(() => window.__SCIENCE_CAPTURE_LAST_ERROR__ || "sin error registrado")}`);
  }
  await page.waitForFunction(() => window.__scienceCapturedPngs?.length === 1);
  assert.equal(await page.evaluate(() => window.__scienceCapturedPngs[0].type), "image/png");
  assert.ok((await page.evaluate(() => window.__scienceCapturedPngs[0].size)) > 1000);
  await page.screenshot({ path: "/tmp/science-attempt-history-desktop.png", fullPage: true });

  await page.locator("[data-reset-history]").click();
  assert.equal(await page.locator(".science-history-reset-confirm").getAttribute("hidden"), null);
  await page.locator("[data-cancel-reset]").click();
  assert.notEqual(await page.locator(".science-history-reset-confirm").getAttribute("hidden"), null);
  await page.locator("[data-reset-history]").click();
  await page.locator("[data-confirm-reset]").click();
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), storageKey), null);
  assert.match(await page.locator(".science-history-book").innerText(), /Todavía no hay intentos completos/);

  const completeCorrectAttempt = async (startSelector) => {
    await page.locator(startSelector).click();
    await page.locator("[data-start-level]").click();
    await page.locator('[data-answer="0"]').click();
    await page.locator("[data-continue]").waitFor();
    await page.locator("[data-continue]").click();
    await page.locator("[data-restart-game]").waitFor();
  };
  await completeCorrectAttempt("[data-history-start]");
  assert.match(await page.locator(".science-score-summary").innerText(), /Score final\s*1,000/);
  await page.locator("[data-share-result]").click();
  await page.waitForFunction(() => window.__scienceCapturedPngs?.length === 2);
  assert.equal(await page.evaluate(() => window.__scienceCapturedPngs[1].type), "image/png");
  assert.ok((await page.evaluate(() => window.__scienceCapturedPngs[1].size)) > 1000);
  assert.ok((await page.evaluate(() => window.__scienceCapturedPngs[1].darkPixels)) > 400, JSON.stringify(await page.evaluate(() => window.__scienceCapturedPngs[1])));
  assert.ok((await page.evaluate(() => window.__scienceCapturedPngs[1].width)) < 2300, "La captura debe recortarse a la tarjeta, no a toda la capa.");
  await completeCorrectAttempt("[data-restart-game]");
  await completeCorrectAttempt("[data-restart-game]");
  const generatedHistory = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  assert.equal(generatedHistory.totalCompleted, 3);
  assert.deepEqual(generatedHistory.attempts.map((attempt) => attempt.number), [2, 3]);
  assert.equal(generatedHistory.attempts[1].penaltyRate, .25);
  assert.equal(generatedHistory.attempts[1].rawScore, 1000);
  assert.equal(generatedHistory.attempts[1].questions[0].points, 1000);
  assert.equal(generatedHistory.attempts[1].score, 750);
  assert.equal(generatedHistory.attempts[1].score, Math.round(generatedHistory.attempts[1].rawScore * .75));
  assert.equal(generatedHistory.attempts[1].questions[0].responseText, "La velocidad");
  assert.equal(generatedHistory.attempts[1].questions[0].correctAnswer, "La velocidad");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".science-history-book").waitFor();
  await page.screenshot({ path: "/tmp/science-attempt-history-mobile.png", fullPage: true });
  await page.locator(".science-assessment-host").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  assert.equal(await page.locator("[data-reset-history]").isVisible(), true);

  const corruptContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const corruptPage = await corruptContext.newPage();
  corruptPage.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  corruptPage.on("pageerror", (error) => consoleErrors.push(error.message));
  await corruptPage.goto(origin, { waitUntil: "networkidle" });
  await corruptPage.evaluate((key) => localStorage.setItem(key, "{historial-invalido"), storageKey);
  await corruptPage.reload({ waitUntil: "networkidle" });
  assert.match(await corruptPage.locator(".science-history-book").innerText(), /Todavía no hay intentos completos/);
  assert.match(await corruptPage.locator(".science-history-warning").innerText(), /no permitió leer la bitácora local/i);
  await corruptContext.close();

  const activeContext = await browser.newContext({ viewport: { width: 1000, height: 760 } });
  const activePage = await activeContext.newPage();
  activePage.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  activePage.on("pageerror", (error) => consoleErrors.push(error.message));
  await activePage.goto(`${origin}/active`, { waitUntil: "networkidle" });
  await activePage.locator("[data-start-level]").click();
  await activePage.locator('[data-answer="0"]').click();
  await activePage.locator("[data-continue]").click();
  await activePage.locator(".science-question-card").waitFor();
  assert.match(await activePage.locator(".science-question-card").innerText(), /Pregunta 2 de 2/);
  const activeStorageKey = `scienceActivities:active-attempt:v1:${activeConfig.historyId}`;
  const beforeReload = await activePage.evaluate((key) => JSON.parse(localStorage.getItem(key)), activeStorageKey);
  assert.equal(beforeReload.progress.question, 2);
  assert.equal(beforeReload.progress.completed, 1);
  await activePage.reload({ waitUntil: "networkidle" });
  await activePage.locator(".science-question-card").waitFor();
  assert.match(await activePage.locator(".science-question-card").innerText(), /Pregunta 2 de 2/);
  const afterReload = await activePage.evaluate((key) => JSON.parse(localStorage.getItem(key)), activeStorageKey);
  assert.equal(afterReload.progress.question, 2);
  assert.equal(afterReload.progress.completed, 1);
  await activePage.locator('[data-answer="0"]').click();
  await activePage.locator("[data-continue]").click();
  await activePage.locator("[data-restart-game]").click();
  await activePage.locator("[data-start-level]").waitFor();
  const afterNewAttempt = await activePage.evaluate((key) => JSON.parse(localStorage.getItem(key)), activeStorageKey);
  assert.equal(afterNewAttempt.progress.question, 1);
  assert.equal(afterNewAttempt.progress.completed, 0);
  await activeContext.close();

  const fileExportDirectory = await mkdtemp(join(tmpdir(), "science-active-attempt-"));
  try {
    const fileConfig = { ...activeConfig, historyId: `${historyId}-file`, exportPackage: { version: 7, historyId: `${historyId}-file` }, visualStyle: "kawaii-lab" };
    const fileHtml = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body data-science-export><main><div id="scienceGameMount"></div><div id="scienceGameControls"></div></main><script>window.SCIENCE_ACTIVITY=${JSON.stringify(fileConfig)};window.SCIENCE_ASSESSMENT_CONFIG=${JSON.stringify(fileConfig)};window.SCIENCE_ASSESSMENT_INITIAL_VIEW="game";</script><script src="./science-game-export.bundle.js"></script></body></html>`;
    await Promise.all([
      writeFile(join(fileExportDirectory, "index.html"), fileHtml),
      writeFile(join(fileExportDirectory, "science-game-export.bundle.js"), exportBundle)
    ]);
    const fileContext = await browser.newContext({ viewport: { width: 1000, height: 760 } });
    const filePage = await fileContext.newPage();
    filePage.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    filePage.on("pageerror", (error) => consoleErrors.push(error.message));
    await filePage.goto(pathToFileURL(join(fileExportDirectory, "index.html")).href, { waitUntil: "load" });
    await filePage.locator("[data-start-level]").waitFor();
    await filePage.locator("[data-start-level]").click();
    const fileAnswer = filePage.locator('[data-answer="0"],[data-rive-answer="0"]').first();
    await fileAnswer.waitFor();
    assert.equal(await fileAnswer.isVisible(), true);
    assert.equal(await filePage.evaluate(() => typeof window.__SCIENCE_HTML2CANVAS__), "function");
    await fileContext.close();
  } finally {
    await rm(fileExportDirectory, { recursive: true, force: true });
  }
  assert.equal(consoleErrors.length, 0, consoleErrors.join("\n"));
} finally {
  await mainContext.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
