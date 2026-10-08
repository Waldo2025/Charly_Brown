const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../../public/MarcieBlogEditor/js/editor-app.js"), "utf8");
const names = source.slice(source.indexOf("function articleExportFilename("), source.indexOf("async function fetchArticleCover("));
const htmlExport = source.slice(source.indexOf("async function exportArticlesAsZip("), source.indexOf("async function wordImageDataUri("));
const wordExport = source.slice(source.indexOf("async function exportArticlesAsWord("), source.indexOf("function getWordPressPublicationForSession("));

test("los ZIP de HTML y Word agrupan por tema y nombran archivos por público", async () => {
  const archives = [];
  const downloads = [];
  class Archive {
    constructor() { this.files = []; archives.push(this); }
    folder(name) { return { file: (file, content) => this.files.push({ path: `${name}/${file}`, content }), folder: sub => ({ file: (file, content) => this.files.push({ path: `${name}/${sub}/${file}`, content }) }) }; }
    async generateAsync() { return new Blob(["zip"]); }
  }
  const context = vm.createContext({
    Blob, URL: { createObjectURL: () => "blob:zip", revokeObjectURL: () => {} },
    DOMParser: class { parseFromString(html) { return { body: { innerHTML: html } }; } },
    document: { createElement: () => ({ click() { downloads.push(this.download); } }) },
    window: { JSZip: Archive, setTimeout: () => {} },
    resolveAuthorDisplayName: async () => "Autor",
    fetchArticleCover: async () => ({ blob: new Blob(["cover"]), extension: "png" }),
    buildArticleHtmlDocument: (_session, options) => `<img src="${options.coverSrc}">`,
    getPrimaryAuthorFallback: () => "Autor",
    articleWordHtml: async () => "<p>Artículo</p>",
    buildStyledDocxBlob: async () => new Blob(["word"]),
    downloadExportBlob: (_blob, filename) => downloads.push(filename)
  });
  vm.runInContext(`${names}\n${htmlExport}\n${wordExport}`, context);
  const session = { topic: "Neurociencia / palabras", title: "Título secundario" };
  const entries = ["coordinators", "parents", "educators", "students"].map(id => ({ id, article: { title: `Título largo para ${id}`, blocks: [{ text: "Cuerpo" }] } }));
  await context.exportArticlesAsZip(session, entries);
  await context.exportArticlesAsWord(session, entries, { bundle: true });
  const expected = ["Coordinadores", "Familia", "Docentes", "Estudiantes"];
  assert.deepEqual(archives[0].files.map(item => item.path), expected.flatMap(name => [`Neurociencia palabras/${name}.html`, `Neurociencia palabras/assets/${name}.png`]));
  assert.match(archives[0].files[0].content, /src="assets\/Coordinadores\.png"/);
  assert.deepEqual(archives[1].files.map(item => item.path), expected.map(name => `Neurociencia palabras/${name}.docx`));
  assert.deepEqual(downloads, ["neurociencia-palabras-html.zip", "neurociencia-palabras-articulos-word.zip"]);
});
