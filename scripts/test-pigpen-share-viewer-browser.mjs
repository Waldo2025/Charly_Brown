import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const publicRoot = new URL("../public/", import.meta.url).pathname;
const mimeTypes = new Map([
  [".css", "text/css"],
  [".html", "text/html"],
  [".js", "text/javascript"],
  [".mjs", "text/javascript"],
  [".png", "image/png"],
  [".woff2", "font/woff2"]
]);

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relativePath = normalize(pathname === "/" ? "PigPen-Visor.html" : pathname.replace(/^\/+/, ""));
    if (relativePath.startsWith("..")) throw new Error("unsafe_path");
    const body = await readFile(join(publicRoot, relativePath));
    response.writeHead(200, { "Content-Type": mimeTypes.get(extname(relativePath)) || "application/octet-stream" });
    response.end(body);
  } catch (_) {
    response.writeHead(404).end("Not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  await page.route("**/api/pigpen/share/**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        session: {
          id: "session-demo",
          title: "Ciencias compartidas",
          activeTopicId: "topic-1",
          topics: [
            {
              id: "topic-1",
              academicNumber: 1,
              title: "La materia",
              project: {
                idioma: "es-419",
                titulo: "Misión: La materia",
                introduccion: "Resuelve el reto.",
                misiones: []
              }
            },
            {
              id: "topic-2",
              academicNumber: 2,
              title: "Energy",
              project: {
                idioma: "en-US",
                titulo: "Mission: Energy",
                introduccion: "Solve the challenge.",
                misiones: []
              }
            }
          ]
        }
      })
    });
  });

  await page.goto(`http://127.0.0.1:${port}/PigPen-Visor.html?session=session-demo&token=0123456789abcdefghijklmnopqrstuv`, { waitUntil: "networkidle" });
  await page.locator("#pvGameShell:not([hidden])").waitFor();
  assert.equal(await page.locator("#pvSessionTitle").textContent(), "Ciencias compartidas");
  assert.equal(await page.locator("#pvTopicSelect option").count(), 2);
  assert.equal(await page.locator("html").getAttribute("lang"), "es-419");

  await page.locator("#pvTopicSelect").selectOption("topic-2");
  await page.waitForFunction(() => document.documentElement.lang === "en-US");
  assert.match(await page.title(), /Mission: Energy/);
  assert.match(page.url(), /topic=topic-2/);
  assert.equal(await page.locator("#pvGameFrame").getAttribute("srcdoc").then((value) => /Mission: Energy/.test(value || "")), true);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log("PigPen shared viewer browser OK.");
