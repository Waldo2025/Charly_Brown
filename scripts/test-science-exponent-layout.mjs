import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtime = await readFile(new URL("../public/js/science-game-runtime.mjs", import.meta.url), "utf8");
const editorCss = await readFile(new URL("../public/scienceActivities.css", import.meta.url), "utf8");
const exportCss = await readFile(new URL("../public/science-assessment-export.css", import.meta.url), "utf8");
const hudCss = await readFile(new URL("../public/science-hud-themes.css", import.meta.url), "utf8");

test("el runtime clasifica bases largas y separa el texto de la zona de exponente", () => {
  assert.match(runtime, /exponentBase\.length > 12 \? "long"/);
  assert.match(runtime, /data-base-size="\$\{exponentBaseSize\}"/);
  assert.match(runtime, /<span>\$\{escape\(exponentBase\)\}<\/span><sup data-exponent-slot>/);
});

test("preview y export limitan la base larga sin reducir el control táctil", () => {
  for (const css of [editorCss, exportCss, hudCss]) {
    assert.match(css, /science-exponent-base\[data-base-size="long"\]/);
    assert.match(css, /font-size:clamp\(1\.55rem,3\.5vw,3rem\)/);
    assert.match(css, /min-width:clamp\(52px,5vw,66px\)/);
  }
});

test("la base del exponente conserva contraste en los tableros Arcade oscuros", () => {
  for (const css of [editorCss, exportCss, hudCss]) {
    assert.match(css, /is-exponent-placement \.science-exponent-base\s*>?\s*span/);
    assert.match(css, /color:#fff9e8!important/);
    assert.match(css, /-webkit-text-fill-color:#fff9e8!important/);
  }
});
