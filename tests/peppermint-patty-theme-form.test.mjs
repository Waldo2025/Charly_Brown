import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const htmlSource = readFileSync(new URL("../public/PeppermintPattyAnalizer.html", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf.css", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-app.js", import.meta.url), "utf8");
const resultsSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-results.js", import.meta.url), "utf8");

test("Peppermint ofrece temas persistentes claro, medio y oscuro", () => {
  assert.match(htmlSource, /id="analizarPdfThemeToggleBtn"[\s\S]*?fa-sun/);
  assert.match(htmlSource, /cb_analizar_pdf_theme_v1[\s\S]*?\["light", "medium", "dark"\]/);
  assert.match(cssSource, /html\[data-ap-theme="medium"\][\s\S]*?--ap-theme-text:/);
  assert.match(cssSource, /html\[data-ap-theme="dark"\][\s\S]*?--ap-theme-text:\s*#edf2fa/);
  assert.match(cssSource, /html\[data-ap-theme="light"\],[\s\S]*?html\[data-ap-theme="dark"\][\s\S]*?--app-text-color:\s*var\(--ap-theme-text\) !important/);
  assert.match(cssSource, /--app-bg-color:\s*var\(--ap-theme-bg\) !important/);
  assert.match(appSource, /function cycleAnalizarPdfTheme\(\)[\s\S]*?applyAnalizarPdfTheme/);
  assert.match(appSource, /els\.themeToggleBtn\?\.addEventListener\("click", cycleAnalizarPdfTheme\)/);
});

test("el formulario usa controles compactos y conserva las acciones de color", () => {
  assert.match(cssSource, /\.analizar-pdf-biblio-grid \{[\s\S]*?repeat\(6, minmax\(0, 1fr\)\)[\s\S]*?padding:\s*9px;[\s\S]*?border-radius:\s*14px/);
  assert.match(cssSource, /\.analizar-pdf-biblio-field \{[\s\S]*?min-height:\s*48px;[\s\S]*?background:\s*var\(--ap-control\)/);
  assert.match(cssSource, /#analizarPdfAnalyzeBtn \{[\s\S]*?background:\s*#aa8dff/);
  assert.match(cssSource, /#analizarPdfExportCorrectedBtn \{[\s\S]*?background:\s*#ff6fae/);
  assert.match(htmlSource, /id="analizarPdfEditGlobalTemplateBtn"[\s\S]*?fa-pen/);
  assert.match(cssSource, /#analizarPdfEditGlobalTemplateBtn \{[\s\S]*?background:\s*#d89cff/);
});

test("los datos globales se editan sin reemplazar la unidad individual", () => {
  assert.match(htmlSource, /id="analizarPdfGlobalTemplateModal"[\s\S]*?id="analizarPdfGlobalTemplateForm"/);
  assert.doesNotMatch(htmlSource, /analizarPdfGlobalUnidadInput/);
  assert.match(appSource, /function handleSaveGlobalTemplateData\(\)[\s\S]*?unidad:\s*currentInfo\.unidad \|\| ""[\s\S]*?for \(const revision[\s\S]*?revision\.revisionNumero = config\.revisionNumero/);
  assert.match(appSource, /editGlobalTemplateBtn\?\.addEventListener\("click"[\s\S]*?openGlobalTemplateModal\(\)/);
  assert.match(appSource, /globalTemplateForm\?\.addEventListener\("submit"[\s\S]*?handleSaveGlobalTemplateData\(\)/);
});

test("el modal de filtros domina el shell y el rail usa el color extraido", () => {
  assert.match(cssSource, /#analizarPdfQuickRailHost:has\(\.analizar-pdf-rail-filter-modal:not\(\[hidden\]\)\)[\s\S]*?z-index:\s*2147483500/);
  assert.match(cssSource, /\.analizar-pdf-rail-filter-modal \{[\s\S]*?z-index:\s*2147483550/);
  assert.match(resultsSource, /swatches\.find\(\(swatch\) => isValidHex\(swatch\?\.hex\) && !isNeutralSwatch\(swatch\)\)/);
  assert.match(resultsSource, /--analizar-pdf-rail-ink:/);
  assert.match(resultsSource, /function resolveRailTextRelief[\s\S]*?rgba\(0,0,0,\.34\)/);
});
