import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const resultsModuleUrl = "/public/analizarPDF/analizar-pdf-results.js";

function getContentType(filePath = "") {
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function buildSmokeHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Analizar PDF rail smoke</title>
  </head>
  <body>
    <main class="analizar-pdf-layout">
      <section id="result-root"></section>
      <section id="page-reports-root"></section>
    </main>
    <script type="module">${buildBrowserFixtureScript()}</script>
  </body>
</html>`;
}

function startStaticSmokeServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (url.pathname === "/__analizar_pdf_rail_smoke.html") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(buildSmokeHtml());
        return;
      }
      const decodedPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      const filePath = path.resolve(repoRoot, decodedPath);
      if (!filePath.startsWith(repoRoot + path.sep)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      const content = await readFile(filePath);
      response.writeHead(200, { "Content-Type": getContentType(filePath) });
      response.end(content);
    } catch (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(error?.message || "Not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}/__analizar_pdf_rail_smoke.html`,
      });
    });
  });
}

function buildBrowserFixtureScript() {
  return `
    class FakeMuuri {
      static instances = [];
      constructor(element, options) {
        this.element = element;
        this.options = options;
        this.layoutCount = 0;
        FakeMuuri.instances.push(this);
      }
      refreshItems() {
        return this;
      }
      layout() {
        this.layoutCount += 1;
        return this;
      }
      destroy() {
        this.destroyed = true;
      }
    }
    window.Muuri = FakeMuuri;
    const { createAnalizarPdfResultsRenderer } = await import(${JSON.stringify(resultsModuleUrl)});

    const resultRoot = document.querySelector("#result-root");
    const pageReportsRoot = document.querySelector("#page-reports-root");
    window.localStorage.removeItem("analizar-pdf-rail-category-visibility");

    function buildEntry(unitNumber, revisionIndex) {
      const padded = String(unitNumber).padStart(2, "0");
      return {
        revisionId: "revision_unidad_" + unitNumber,
        fileId: "file_unidad_" + unitNumber,
        revisionIndex,
        fileIndex: 0,
        fileTitle: "EEFESPPRI_10REV_TRIM1_P4_LA_" + padded + "_L" + unitNumber + ".idml",
        railTitle: "Cuarto · Trim 1 · Unidad " + unitNumber,
        railTooltip: "EEFESPPRI_10REV_TRIM1_P4_LA_" + padded + "_L" + unitNumber + ".idml",
        revisionTitle: "Unidad " + unitNumber + " · F1",
        unidad: "Unidad " + unitNumber,
        analysisStatus: "completed",
        resultSummary: {
          paginationIssueCount: 0,
          sectionIssueCount: 0,
          spellingIssueCount: 0,
          orthotypographyIssueCount: 0,
          colorIssueCount: 0,
          recortableIssueCount: 0,
          pageCount: 1,
          analyzedAt: "2026-07-08T10:0" + revisionIndex + ":00.000Z",
        },
        result: {
          paginationIssues: [],
          sectionIssues: [],
          spellingIssues: [],
          orthotypographyIssues: [],
          colorIssues: [],
          recortableIssues: [],
          stats: {
            documentName: "Unidad " + unitNumber,
            pageCount: 1,
            pageReports: [
              {
                pageName: String(unitNumber),
                pageSequence: String(revisionIndex + 1),
                spellingIssues: [],
                orthotypographyIssues: [],
                recortableIssues: [],
                recortableSummary: unitNumber === 1
                  ? {
                      visualKind: "",
                      originCodes: ["Poblamiento de América", "Anexo PaT1"],
                      destinationCodes: [],
                      codeTitles: {
                        "Anexo PaT1": "Elementos de un ecosistema",
                      },
                      pendingDestinations: [],
                      resolvedDestinations: [],
                      resolvedLinks: [],
                    }
                  : {},
                notes: [],
                noteHistory: [],
              },
            ],
            swatchInventory: [
              { name: "U" + unitNumber, hex: "#336699" },
            ],
          },
        },
      };
    }

    const fileResults = [
      buildEntry(1, 0),
      buildEntry(4, 1),
      buildEntry(5, 2),
      buildEntry(6, 3),
    ];

    const session = {
      id: "analizar_pdf_rail_browser_smoke",
      sourceType: "idml",
      revisions: fileResults.map((entry) => ({
        id: entry.revisionId,
        title: entry.revisionTitle,
        unidad: entry.unidad,
        files: [{ id: entry.fileId, documentName: entry.fileTitle }],
      })),
      fileResults,
    };

    const renderer = createAnalizarPdfResultsRenderer({
      el: resultRoot,
      pageReportsEl: pageReportsRoot,
      isRailCleared: () => false,
    });
    renderer.render(session);

    const topGroups = Array.from(pageReportsRoot.querySelectorAll(".analizar-pdf-ortho-rail-body > .analizar-pdf-ortho-rail-group"));
    const tooltipBadges = Array.from(pageReportsRoot.querySelectorAll(".analizar-pdf-rail-badge[data-tooltip]")).map((badge) => ({
      text: badge.querySelector("span:last-child")?.textContent?.trim() || "",
      tooltip: badge.getAttribute("data-tooltip") || "",
    }));
    window.__analizarPdfRailSmoke = {
      titleTexts: topGroups.map((group) => group.querySelector(".analizar-pdf-rail-file-title-text")?.textContent?.trim() || ""),
      groupKeys: topGroups.map((group) => group.getAttribute("data-rail-group-key") || ""),
      tooltips: topGroups.map((group) => group.querySelector(".analizar-pdf-rail-file-title")?.getAttribute("data-tooltip") || ""),
      tooltipBadges,
      reportTexts: Array.from(pageReportsRoot.querySelectorAll(".analizar-pdf-page-report-list")).map((node) => node.textContent || ""),
      muuriContainerCount: FakeMuuri.instances.length,
      muuriContainers: FakeMuuri.instances.map((instance) => instance.element.className || ""),
      muuriLayoutCounts: FakeMuuri.instances.map((instance) => instance.layoutCount || 0),
    };
  `;
}

let browser = null;
let smokeServer = null;

try {
  smokeServer = await startStaticSmokeServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    browserErrors.push(error?.stack || error?.message || String(error));
  });
  await page.goto(smokeServer.url);
  await page.waitForFunction(() => Boolean(window.__analizarPdfRailSmoke), null, { timeout: 5000 }).catch((error) => {
    throw new Error([
      error.message,
      "Errores del navegador:",
      ...(browserErrors.length ? browserErrors : ["(sin errores capturados)"]),
    ].join("\n"));
  });

  const smoke = await page.evaluate(() => window.__analizarPdfRailSmoke);
  assert.deepEqual(
    smoke.titleTexts,
    [
      "Cuarto · Trim 1 · Unidad 1",
      "Cuarto · Trim 1 · Unidad 4",
      "Cuarto · Trim 1 · Unidad 5",
      "Cuarto · Trim 1 · Unidad 6",
    ],
    "El rail debe renderizar títulos con datos de ficha editorial, no con nombre de archivo."
  );
  assert.deepEqual(
    smoke.tooltips,
    [
      "Cuarto · Trim 1 · Unidad 1 · EEFESPPRI_10REV_TRIM1_P4_LA_01_L1.idml",
      "Cuarto · Trim 1 · Unidad 4 · EEFESPPRI_10REV_TRIM1_P4_LA_04_L4.idml",
      "Cuarto · Trim 1 · Unidad 5 · EEFESPPRI_10REV_TRIM1_P4_LA_05_L5.idml",
      "Cuarto · Trim 1 · Unidad 6 · EEFESPPRI_10REV_TRIM1_P4_LA_06_L6.idml",
    ],
    "El rail debe conservar el nombre de archivo real en tooltip."
  );
  assert.deepEqual(
    smoke.groupKeys,
    [
      "file::revision_unidad_1::file_unidad_1::cuarto-trim-1-unidad-1",
      "file::revision_unidad_4::file_unidad_4::cuarto-trim-1-unidad-4",
      "file::revision_unidad_5::file_unidad_5::cuarto-trim-1-unidad-5",
      "file::revision_unidad_6::file_unidad_6::cuarto-trim-1-unidad-6",
    ],
    "Las claves del rail deben incluir revisionId::fileId para impedir sustituciones por orden visual."
  );
  assert.equal(
    new Set(smoke.groupKeys).size,
    4,
    "El rail no debe deduplicar grupos por nombre, unidad, titulo ni ficha activa."
  );
  assert.ok(
    smoke.muuriContainerCount >= 1,
    "El rail debe inicializar Muuri cuando la librería está disponible."
  );
  assert.ok(
    smoke.muuriContainers.some((className) => String(className).includes("analizar-pdf-ortho-rail-body")),
    "Muuri debe controlar el contenedor principal del rail."
  );
  assert.ok(
    smoke.tooltipBadges.some((item) => item.text === "Video" && item.tooltip === "Poblamiento de América"),
    "Los badges de video deben mostrar solo Video y conservar el nombre completo en tooltip."
  );
  assert.ok(
    smoke.tooltipBadges.some((item) => item.text === "Anexo PaT1" && item.tooltip === "Elementos de un ecosistema"),
    "Los badges de anexo deben mostrar Anexo + código y conservar el nombre completo en tooltip."
  );
  await page.click("[data-action='open-rail-filter-modal']");
  await page.waitForSelector("[data-rail-filter-modal]:not([hidden])");
  const filterLabels = await page.$$eval(".analizar-pdf-rail-filter-option span", (nodes) => nodes.map((node) => node.textContent.trim()));
  assert.deepEqual(
    filterLabels,
    [
      "Ortografía",
      "Ortotipografía",
      "Análisis rápido ortotipográfico",
      "Propuestas de redacción",
      "Texto fuera o desbordado",
      "Campo formativo",
      "Notas",
      "Control de cambios",
      "Condiciones personalizadas",
      "Recortables / Fichas / Anexos / Videos",
    ],
    "El modal del rail debe listar las categorías solicitadas."
  );
  await page.locator("[data-action='toggle-rail-category'][data-rail-category-id='recortables']").uncheck();
  await page.waitForFunction(() => !document.querySelector("[data-rail-category='recortables']"));
  const storedRailVisibility = await page.evaluate(() => JSON.parse(window.localStorage.getItem("analizar-pdf-rail-category-visibility-en-forma") || "{}"));
  assert.equal(storedRailVisibility.recortables, false, "El filtro del rail debe persistir la categoría desactivada.");

  console.log("Analizar PDF rail browser smoke OK.");
} finally {
  if (browser) {
    await browser.close();
  }
  if (smokeServer?.server) {
    await new Promise((resolve) => smokeServer.server.close(resolve));
  }
}
