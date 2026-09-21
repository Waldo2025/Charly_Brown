const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const bibliography = require("../src/marcie-bibliography.js");
const { renderArticleToWordPressHtml } = require("../src/marcie-wordpress-core.js");
const root = path.resolve(__dirname, "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const strip = code => code.replace(/^import[\s\S]*?;\s*$/gm, "").replace(/\bexport /g, "");
const documents = [
  { id: "s-a", title: "Un libro", authors: ["Alonso, Ana"], year: "2020", publisher: "Editorial", url: "https://library.org/book" },
  { id: "s-b", title: "Un artículo", authors: ["Benítez, Beatriz"], year: "2021", journal: "Educación", volume: "3", pages: "10–15", doi: "10.1234/paper", url: "https://journal.org/paper" },
  { id: "s-c", title: "Una página", authors: ["Centro Educativo"], year: "2024", url: "https://university.edu/page" }
];
function article() {
  return { title: "Artículo", sources: [documents[0]],
    researchDossier: { sources: documents, attributedReferences: [
      { id: "reference-1", sourceId: "s-b" }, { id: "reference-2", sourceId: "s-c" }, { id: "reference-3", sourceId: "s-a" }
    ] },
    blocks: [{ id: "p", type: "paragraph", text: "Una afirmación [reference-1], otra [reference-2] y otra [reference-3].", sourceIds: ["reference-1", "reference-2", "reference-3"] }]
  };
}

test("three inline references recover their exact documents and use linked author-year citations", () => {
  const value = article();
  assert.deepEqual(bibliography.sources(value).map(source => source.id), ["s-a", "s-b", "s-c"]);
  const html = bibliography.renderCitations(value, value.blocks[0], `<p>${value.blocks[0].text}</p>`);
  assert.match(html, /href="#source-s-b"[^>]*>Benítez, B\., 2021/);
  assert.match(html, /href="#source-s-c"[^>]*>Centro Educativo, 2024/);
  assert.match(html, /href="#source-s-a"[^>]*>Alonso, A\., 2020/);
  assert.doesNotMatch(html.replace(/<[^>]*>/g, ""), /reference-/);
  assert.equal((html.match(/data-citation-link/g) || []).length, 3, "no extra block-end duplicates");
  const wp = renderArticleToWordPressHtml(value);
  for (const id of ["s-a", "s-b", "s-c"]) assert.match(wp, new RegExp('id="source-' + id + '"'));
  assert.match(wp, /Alonso, A\. \(2020\)/);
  assert.match(wp, /<em>Educación, 3<\/em>, 10–15/);
  assert.match(wp, /Centro Educativo\. \(2024\)/);
  assert.doesNotMatch(wp, />\[\d+\]/);
  const markdown = bibliography.markdown(JSON.parse(JSON.stringify(value)));
  assert.match(markdown, /href="#source-s-b"[^>]*>Benítez, B\., 2021/);
  assert.match(markdown, /id="source-s-b"/);
  assert.doesNotMatch(markdown, /\[\d+\]/);
});

test("multiple attributions to one consulted document share the same author-year label", () => {
  const value = article();
  value.researchDossier.attributedReferences.forEach(reference => { reference.sourceId = "s-a"; });
  assert.equal(bibliography.sources(value).length, 1);
  const html = bibliography.renderCitations(value, value.blocks[0], `<p>${value.blocks[0].text}</p>`);
  assert.equal((html.match(/>Alonso, A\., 2020<\/a>/g) || []).length, 3);
});

test("grouped source IDs render as one author-year group instead of leaking internal IDs", () => {
  const groupedSources = documents.slice(0, 2).map((source, index) => ({ ...source, id: `source-${index === 0 ? "a" : "b"}` }));
  const value = {
    sources: groupedSources,
    blocks: [{ id: "p", type: "paragraph", text: "Una afirmación [source-a, source-b].", sourceIds: [] }]
  };
  const html = bibliography.renderCitations(value, value.blocks[0], `<p>${value.blocks[0].text}</p>`);
  assert.deepEqual(bibliography.markerIds(value, value.blocks[0].text), ["source-a", "source-b"]);
  assert.match(html, /\(<a href="#source-source-a"[^>]*>Alonso, A\., 2020<\/a>; <a href="#source-source-b"[^>]*>Benítez, B\., 2021<\/a>\)/);
  assert.doesNotMatch(html.replace(/<[^>]*>/g, ""), /source-[a-z]/);
  assert.equal((html.match(/data-citation-link/g) || []).length, 1, "the source group remains one editable citation");
});

test("in-text labels use initials, y for two authors, et al. for three, and institutional authors", () => {
  assert.equal(bibliography.citation({ authors: ["López, Waldo"], year: "2022" }), "(López, W., 2022)");
  assert.equal(bibliography.citation({ authors: ["López, Waldo", "Uribe, Ana"], year: "2022" }), "(López, W. y Uribe, A., 2022)");
  assert.equal(bibliography.citation({ authors: ["López, Waldo", "Uribe, Ana", "Pérez, Mario"], year: "2026" }), "(López, W. et al., 2026)");
  assert.equal(bibliography.citation({ authors: ["UNESCO"], year: "2024" }), "(UNESCO, 2024)");
});

test("unresolved references never use array positions as a fallback and prevent publication", () => {
  const value = article();
  value.researchDossier = {};
  assert.equal(bibliography.integrity(value).missing.length, 3);
  const html = bibliography.renderCitations(value, value.blocks[0], `<p>${value.blocks[0].text}</p>`);
  assert.match(html.replace(/<[^>]*>/g, ""), /\(\?\)/);
  assert.doesNotMatch(html, /href="#source-s-a"/);
  assert.throws(() => renderArticleToWordPressHtml(value), /sin documento bibliográfico asociado/);
});

test("a partially unresolved citation group exposes the missing document", () => {
  const value = article();
  value.blocks = [{ id: "p", type: "paragraph", text: "Una afirmación [reference-1, reference-99]." }];
  const html = bibliography.renderCitations(value, value.blocks[0], `<p>${value.blocks[0].text}</p>`);
  assert.match(html, />Benítez, B\., 2021<\/a>; <span[^>]*>\?<\/span>/);
  assert.throws(() => renderArticleToWordPressHtml(value), /reference-99/);
});

test("source IDs in generated text resolve before normalizing attributions; unknown ones fail", () => {
  const context = vm.createContext({ MarcieBibliography: bibliography, DEFAULT_GEMINI_MODEL: "test" });
  // Read only the pure attribution functions, without bootstrapping network clients.
  const code = read("public/MarcieBlogEditor/js/services/marcie-gemini-service.js");
  vm.runInContext(strip(code.slice(code.indexOf("function normalizedAttributionText"), code.indexOf("function extractGeminiResponseText"))), context);
  const dossier = { sources: documents.map(source => ({ ...source, verificationStatus: "verified" })), attributedReferences: [{ id: "reference-1", sourceId: "s-b", verificationStatus: "verified", text: "Una afirmación", type: "paraphrase", personOrInstitution: "Benítez" }] };
  const result = context.applyVerifiedAttributions({ blocks: [{ type: "paragraph", text: "Una afirmación [reference-1]", sourceIds: ["reference-1"] }] }, dossier);
  assert.deepEqual(Array.from(result.blocks[0].sourceIds), ["s-b"]);
  assert.equal(result.blocks[0].text, "Una afirmación [reference-1]", "do not inject extra unrelated citations");
  assert.throws(() => context.applyVerifiedAttributions({ blocks: [{ type: "paragraph", text: "Afirmación [reference-99]" }] }, dossier), /sin documento bibliográfico/);
});

test("editing an author-year citation preserves its original source token", () => {
  const context = vm.createContext({});
  const code = read("public/MarcieBlogEditor/js/components/inline-editor.js");
  vm.runInContext(code.slice(code.indexOf("function inlineText"), code.indexOf("export function readEditableBlocks")), context);
  assert.equal(context.inlineText({ nodeType: 1, hasAttribute: name => name === "data-citation-link", dataset: { citationToken: "reference-2" } }), "[reference-2]");
  assert.equal(context.inlineText({ nodeType: 1, hasAttribute: name => name === "data-citation-link", dataset: {} }), "");
  const editor = read("public/MarcieBlogEditor/js/editor-app.js");
  assert.doesNotMatch(editor, /Bibliografía incompleta:|este artículo se redactó únicamente con/);
  assert.match(editor, /Investigación pendiente:/);
});

test("browser renders clickable author-year citations and editing preserves citation positions", async () => {
  const { chromium } = require("../../node_modules/playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const value = article();
    const body = bibliography.renderCitations(value, value.blocks[0], '<p data-block-id="p">' + value.blocks[0].text + '</p>');
    const references = bibliography.sources(value).map((source) => `<li id="source-${source.id}">${bibliography.formatHtml(source)}</li>`).join("");
    await page.setContent('<main style="font:20px/1.6 sans-serif"><div id="body" contenteditable="true">' + body + '</div><h2>Referencias bibliográficas</h2><ul>' + references + '</ul></main>');
    await page.locator('[data-citation-link] a[href="#source-s-b"]').click();
    assert.equal(await page.evaluate(() => location.hash), "#source-s-b");
    const result = await page.evaluate(({ code, previous }) => {
      (0, eval)(code);
      const marker = document.querySelector("[data-citation-link]");
      const style = getComputedStyle(marker);
      return { blocks: readEditableBlocks(document.getElementById("body"), previous), fontSize: style.fontSize, verticalAlign: style.verticalAlign };
    }, { code: strip(read("public/MarcieBlogEditor/js/components/inline-editor.js")), previous: value.blocks });
    assert.equal(result.blocks[0].text, value.blocks[0].text);
    assert.equal(result.fontSize, "20px");
    assert.equal(result.verticalAlign, "baseline");
  } finally { await browser.close(); }
});
