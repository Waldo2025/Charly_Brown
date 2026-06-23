import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-app.js", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf.css", import.meta.url), "utf8");

test("revision cards render a busy spinner when their analysis is in progress", () => {
  assert.match(appSource, /function isRevisionBusy\(revision = null\) \{/);
  assert.match(appSource, /class="analizar-pdf-subrecord-card\$\{revision\.id === activeRevisionId \? " is-active" : ""\}\$\{isBusy \? " is-processing" : ""\}"/);
  assert.match(appSource, /<span class="analizar-pdf-subrecord-spinner" aria-label="Ficha en proceso" title="Ficha en proceso"><\/span>/);
  assert.match(cssSource, /\.analizar-pdf-subrecord-card\.is-processing \{/);
  assert.match(cssSource, /\.analizar-pdf-subrecord-spinner \{/);
});
