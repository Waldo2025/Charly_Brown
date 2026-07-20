import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../public/PigPenCreator.css", import.meta.url), "utf8");

const legacyMobileQueries = css.match(/@media\s*\(max-width:\s*768px\)/g) || [];
assert.equal(
  legacyMobileQueries.length,
  0,
  "PigPen no debe activar su layout movil en iPad/tablet de 768px."
);

const phoneQueries = css.match(/@media\s*\(max-width:\s*600px\)/g) || [];
assert.ok(
  phoneQueries.length >= 3,
  "Las variantes compactas de pagina, paneles y preview deben compartir el breakpoint de telefono."
);

assert.match(
  css,
  /@media\s*\(min-width:\s*1024px\)[\s\S]*?\.er-studio-shell\s*\{[\s\S]*?grid-template-columns:/,
  "El estudio multipanel debe activarse desde 1024px."
);
assert.doesNotMatch(
  css,
  /@media\s*\((?:min-width:\s*1440px|max-width:\s*1439px)\)/,
  "PigPen no debe mantener el antiguo umbral de 1440px que simulaba movil en pantallas amplias."
);

const js = await readFile(new URL("../public/js/PigPenCreator.js", import.meta.url), "utf8");
assert.match(
  js,
  /STUDIO_DESKTOP_MEDIA\s*=\s*"\(min-width:\s*1024px\)"/,
  "JavaScript debe usar el mismo umbral multipanel que CSS."
);

const backdropRule = css.match(/\.er-studio-backdrop\s*\{([^}]*)\}/)?.[1] || "";
assert.ok(backdropRule, "PigPen debe conservar el backdrop de los paneles adaptativos.");
assert.doesNotMatch(
  backdropRule,
  /(?:-webkit-)?backdrop-filter\s*:/,
  "Abrir Brief no debe desenfocar el contenido del estudio."
);
assert.match(
  backdropRule,
  /background\s*:\s*transparent\s*;/,
  "Abrir Brief no debe proyectar una sombra sobre paneles y subpaneles."
);

assert.match(
  css,
  /\.er-brief-form-grid\s+:where\([\s\S]*?input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)[\s\S]*?select,[\s\S]*?textarea[\s\S]*?\)\s*\{\s*font-size:\s*0\.68rem;/,
  "Los valores dentro de los campos del Brief deben usar tipografía compacta."
);

assert.match(
  css,
  /\.er-publish-switch-label\s*\{[\s\S]*?font-size:\s*small\s*!important;/,
  "El texto del switch de publicación debe mostrarse en tamaño small."
);
assert.match(
  css,
  /\.er-publish-switch-track\s*\{[\s\S]*?width:\s*36px;[\s\S]*?height:\s*20px;/,
  "El switch de publicación debe conservar su variante compacta."
);

console.log("PigPen responsive breakpoint OK.");
