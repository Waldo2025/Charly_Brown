import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const sourcePath = path.resolve("public/podcaster/podcaster-chat-assistant.js");
const source = fs.readFileSync(sourcePath, "utf8");

function extractFunction(name) {
  const signature = `function ${name}`;
  const start = source.indexOf(signature);
  if (start === -1) {
    throw new Error(`No se encontró la función ${name}`);
  }
  let index = source.indexOf("{", start);
  if (index === -1) {
    throw new Error(`No se encontró la apertura de ${name}`);
  }
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;
  for (let i = index; i < source.length; i += 1) {
    const char = source[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (!inDouble && !inTemplate && char === "'") {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inTemplate && char === "\"") {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && char === "`") {
      inTemplate = !inTemplate;
      continue;
    }
    if (inSingle || inDouble || inTemplate) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }
  throw new Error(`No se pudo extraer la función ${name}`);
}

const context = {
  escapeHtml(value = "") {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
};

vm.createContext(context);
[
  "splitMarkdownTableCells",
  "isMarkdownDividerCell",
  "convertMarkdownTableAt",
  "renderChatTextWithMarkdownTables"
].forEach((name) => {
  vm.runInContext(`${extractFunction(name)}; this.${name} = ${name};`, context);
});

const markdown = [
  "| Tiempo | Guion | Descripción |",
  "| --- | --- | --- |",
  "| 0:00-0:08 | Línea normal | Escena normal |",
  "| 0:08-0:16 | Explica A \\| B sin cortar la celda | Escena con detalle |"
].join("\n");

const rendered = context.renderChatTextWithMarkdownTables(markdown);

assert.match(rendered, /<table>/, "Debe renderizar una tabla HTML");
assert.doesNotMatch(
  rendered,
  /<br>\| 0:08-0:16 \|/,
  "No debe dejar filas de la tabla como texto plano después del HTML"
);
assert.match(
  rendered,
  /Explica A \\?\| B sin cortar la celda/,
  "La celda con pipes escapados debe conservar su contenido"
);

console.log("ok - podcaster chat assistant markdown table render");
