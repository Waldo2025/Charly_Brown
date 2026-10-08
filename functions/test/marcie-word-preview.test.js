const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const JSZip = require("jszip");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "../..");

test("Word exporta contenido nativo, portada y miniatura para vista previa", async () => {
  const server = http.createServer((request, response) => {
    const file = request.url === "/word-export.js" ? path.join(root, "public/js/word-export.js")
      : request.url === "/jszip.min.js" ? path.join(root, "public/vendor/jszip/jszip.min.js") : null;
    if (!file) { response.writeHead(404).end(); return; }
    response.setHeader("Content-Type", "text/javascript");
    response.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.addScriptTag({ url: "/jszip.min.js" });
    const bytes = await page.evaluate(async () => {
      const { buildStyledDocxBlob } = await import("/word-export.js");
      const canvas = document.createElement("canvas");
      canvas.width = 320; canvas.height = 180;
      canvas.getContext("2d").fillRect(0, 0, 320, 180);
      const html = `<h1>Artículo de prueba</h1><p>Contenido visible en Finder y Word.</p><p><img src="${canvas.toDataURL("image/png")}" alt="Portada"></p>`;
      const blob = await buildStyledDocxBlob({ html, title: "Artículo de prueba", appTitle: "Marcie", includeTitleInBody: false });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    const docx = await JSZip.loadAsync(Buffer.from(bytes));
    if (process.env.MARCIE_PREVIEW_ARTIFACT_PATH) fs.writeFileSync(process.env.MARCIE_PREVIEW_ARTIFACT_PATH, Buffer.from(bytes));
    const documentXml = await docx.file("word/document.xml").async("string");
    const relationships = await docx.file("word/_rels/document.xml.rels").async("string");
    assert.match(documentXml, /Contenido visible en Finder y Word/);
    assert.match(documentXml, /<w:drawing>/);
    assert.doesNotMatch(documentXml, /altChunk/);
    assert.match(relationships, /relationships\/image/);
    assert.ok(docx.file("word/media/image1.png"));
    assert.ok((await docx.file("docProps/thumbnail.jpeg").async("nodebuffer")).length > 1000);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
