import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test, { after, before } from "node:test";
import { chromium } from "playwright";

const publicRoot = path.resolve("public");
const requests = new Map();
const apiObservations = [];
let browser;
let server;
let baseUrl;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2"
};

function activity(title) {
  return {
    schemaVersion: 2,
    title,
    subject: "physics",
    topic: "Movimiento",
    gameMode: "game",
    assessments: []
  };
}

function sendJson(response, body) {
  response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

async function handleApi(request, response, pathname) {
  const apiMode = String(request.headers.cookie || "").match(/(?:^|;\s*)scienceTestMode=([^;]+)/)?.[1] || "offline";
  apiObservations.push({ pathname, apiMode, startedAt: Date.now() });
  if (pathname === "/api/science-activities/list") {
    if (apiMode === "race") await new Promise((resolve) => setTimeout(resolve, 10_000));
    if (apiMode === "offline") return sendJson(response, { ok: true, sessions: [], complete: true });
    return sendJson(response, {
      ok: true,
      complete: true,
      sessions: [{
        firebaseDocId: "remote-document",
        localId: "remote-session",
        savedAt: "2026-08-13T12:00:00.000Z",
        title: "Sesión remota",
        subject: "physics",
        topic: "Movimiento",
        gameMode: "game"
      }]
    });
  }
  if (pathname.startsWith("/api/science-activities/session/")) {
    return sendJson(response, {
      ok: true,
      session: {
        firebaseDocId: "remote-document",
        localId: "remote-session",
        savedAt: "2026-08-13T12:00:00.000Z",
        activity: activity("Sesión remota")
      }
    });
  }
  sendJson(response, { ok: true });
}

async function handleRequest(request, response) {
  const url = new URL(request.url, "http://127.0.0.1");
  requests.set(url.pathname, (requests.get(url.pathname) || 0) + 1);
  if (url.pathname.startsWith("/api/science-activities/")) return handleApi(request, response, url.pathname);
  if (/\/(?:js\/)?config\.local\.js$/.test(url.pathname)) {
    response.writeHead(404).end("Not found");
    return;
  }
  if (url.pathname === "/cache-probe.html") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end('<!doctype html><link rel="stylesheet" href="/scienceActivities.css?v=cache-probe"><p>cache</p>');
    return;
  }
  const pathname = url.pathname === "/scienceActivities" ? "/scienceActivities.html" : url.pathname;
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(publicRoot, relative);
  if (!filePath.startsWith(`${publicRoot}${path.sep}`) && filePath !== publicRoot) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const longLived = /(?:scienceActivities(?:\.bundle)?\.(?:js|css)|science-(?:.*\.mjs|chunks\/)|\.(?:woff2?|ttf|otf))$/i.test(relative);
    response.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream",
      "Cache-Control": extension === ".html" || relative === "version.json"
        ? "no-store"
        : longLived ? "public, max-age=31536000, immutable" : "public, max-age=300, must-revalidate"
    });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
}

async function installFirebaseStubs(page, { authenticated = false, delayMs = 0 } = {}) {
  await page.addInitScript(() => {
    window.__CHARLY_CONFIG__ = {
      ...(window.__CHARLY_CONFIG__ || {}),
      apiBaseUrl: "/api",
      useLocalApi: true,
      allowSameOriginApi: true
    };
  });
  await page.route("https://www.gstatic.com/firebasejs/12.7.0/**", async (route) => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const url = route.request().url();
    let body = "export {}";
    if (url.endsWith("firebase-app.js")) {
      body = "const app={name:'test'}; export const initializeApp=()=>app; export const getApps=()=>[app]; export const getApp=()=>app;";
    } else if (url.endsWith("firebase-auth.js")) {
      body = `
        const user=${authenticated ? "{uid:'user-1',email:'test@example.com',getIdToken:async()=>\"token\",getIdTokenResult:async()=>({claims:{role:\"admin\"}})}" : "null"};
        const auth={currentUser:user,app:{name:'test'},authStateReady:async()=>{}};
        export const getAuth=()=>auth;
        export const onAuthStateChanged=(instance,callback)=>{queueMicrotask(()=>callback(instance.currentUser));return()=>{}};
        export const signInWithEmailAndPassword=async()=>({user});
        export const signOut=async()=>{};
      `;
    } else if (url.endsWith("firebase-firestore.js")) {
      body = `
        export const getFirestore=()=>({}); export const collectionGroup=()=>({}); export const collection=()=>({});
        export const query=(value)=>value; export const where=()=>({}); export const onSnapshot=()=>()=>{};
        export const doc=()=>({}); export const getDoc=async()=>({exists:()=>false});
        export const getDocs=async()=>({empty:true,docs:[]});
      `;
    }
    await route.fulfill({ status: 200, contentType: "text/javascript", body });
  });
}

before(async () => {
  server = http.createServer((request, response) => void handleRequest(request, response));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

test("Science Activities progressive startup", async (suite) => {
await suite.test("un editor local queda interactivo antes de Firebase y reutiliza assets versionados", async () => {
  requests.clear();
  const context = await browser.newContext();
  await context.addCookies([{ name: "scienceTestMode", value: "offline", url: baseUrl }]);
  const page = await context.newPage();
  await installFirebaseStubs(page);
  await page.addInitScript(({ sessions, active }) => {
    localStorage.setItem("scienceActivities.sessions.v2", JSON.stringify(sessions));
    localStorage.setItem("scienceActivities.activeSession.v1", active);
  }, {
    active: "local-session",
    sessions: [{ id: "local-session", savedAt: "2026-08-13T10:00:00.000Z", activity: activity("Sesión local") }]
  });
  await page.goto(`${baseUrl}/scienceActivities?testMode=offline`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.scienceActivitiesInteractive === "true");
  assert.equal(await page.locator("#trimesterSelect").getAttribute("required"), "");
  assert.equal(await page.locator("[data-session-trimester-filter]").count(), 4);
  await page.click("#quickNewBtn");
  assert.equal(await page.locator("#trimesterSelect").inputValue(), "");
  await page.click("#formGenerateBtn");
  assert.equal(await page.locator("#trimesterSelect").evaluate((element) => element.matches(":invalid")), true);
  assert.equal(await page.locator("#newSessionModal").getAttribute("aria-hidden"), "false");
  const timing = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const interactive = performance.getEntriesByName("science-activities:editor-interactive")[0];
    return interactive.startTime - navigation.responseEnd;
  });
  assert.ok(timing <= 2000, `editor-interactive tardó ${Math.round(timing)} ms después de responseEnd en el servidor HTTP/1 de prueba`);
  await page.waitForTimeout(1800);
  assert.equal(requests.get("/version.json"), 1);
  await context.close();
});

await suite.test("los assets versionados se reutilizan en una segunda navegación", async () => {
  requests.clear();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/cache-probe.html`, { waitUntil: "load" });
  assert.equal(requests.get("/scienceActivities.css"), 1);
  await page.goto("about:blank");
  await page.goto(`${baseUrl}/cache-probe.html`, { waitUntil: "load" });
  assert.equal(requests.get("/scienceActivities.css"), 1);
  await context.close();
});

await suite.test("una respuesta remota demorada no reemplaza una sesión creada por el usuario", async () => {
  requests.clear();
  apiObservations.length = 0;
  const context = await browser.newContext();
  await context.addCookies([{ name: "scienceTestMode", value: "race", url: baseUrl }]);
  const page = await context.newPage();
  await installFirebaseStubs(page, { authenticated: true });
  await page.goto(`${baseUrl}/scienceActivities?testMode=race`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.scienceActivitiesInteractive === "true");
  await page.click("#quickNewBtn");
  const createdSessionId = await page.evaluate(() => localStorage.getItem("scienceActivities.activeSession.v1"));
  assert.ok(createdSessionId);
  await page.waitForResponse((response) => response.url().includes("/api/science-activities/list"), { timeout: 15_000 });
  assert.equal(apiObservations.find((entry) => entry.pathname === "/api/science-activities/list")?.apiMode, "race");
  assert.equal(await page.evaluate(() => localStorage.getItem("scienceActivities.activeSession.v1")), createdSessionId);
  assert.equal(requests.get("/api/science-activities/session/remote-document") || 0, 0);
  await context.close();
});

await suite.test("una sesión exclusivamente remota se incorpora después del arranque interactivo", async () => {
  requests.clear();
  apiObservations.length = 0;
  const context = await browser.newContext();
  await context.addCookies([{ name: "scienceTestMode", value: "remote", url: baseUrl }]);
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") browserErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) browserErrors.push(`${response.status()} ${response.url()}`);
  });
  await installFirebaseStubs(page, { authenticated: true });
  await page.addInitScript(() => {
    localStorage.setItem("scienceActivities.sessionGroups.v1", JSON.stringify([{
      id: "remote-group",
      name: "Grupo remoto pendiente",
      sessionIds: ["remote-session"],
      collapsed: false,
      createdAt: "2026-08-13T11:00:00.000Z"
    }]));
  });
  await page.goto(`${baseUrl}/scienceActivities?testMode=remote`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.scienceActivitiesInteractive === "true");
  await page.waitForTimeout(3000);
  const diagnostics = await page.evaluate(() => ({
    title: document.querySelector("#previewTitle")?.textContent,
    activeSessionId: localStorage.getItem("scienceActivities.activeSession.v1"),
    saveStatus: document.querySelector("#saveStatus")?.textContent,
    config: window.__CHARLY_CONFIG__
  }));
  assert.equal(diagnostics.title, "Sesión remota", JSON.stringify({ diagnostics, apiObservations, browserErrors }));
  assert.equal(await page.evaluate(() => localStorage.getItem("scienceActivities.activeSession.v1")), "remote-session");
  assert.equal(await page.locator(".sa-session-group").count(), 1, JSON.stringify({ diagnostics, apiObservations, browserErrors }));
  assert.equal(await page.locator("#trimesterSelect").inputValue(), "Trimestre 1");
  await page.click('[data-session-trimester-filter="Trimestre 2"]');
  assert.match(await page.locator("#savedProjects").textContent(), /No hay sesiones/);
  await page.click('[data-session-trimester-filter="Trimestre 1"]');
  assert.equal(await page.locator(".sa-session-item").count(), 1);
  const persistedLayout = await page.evaluate(() => JSON.parse(localStorage.getItem("scienceActivities.sessionGroups.v1") || "null"));
  assert.equal(persistedLayout.groups?.[0]?.name, "Grupo remoto pendiente");
  await context.close();
});
});
