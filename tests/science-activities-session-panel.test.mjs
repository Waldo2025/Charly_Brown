import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/scienceActivities.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/scienceActivities.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");

test("Science Activities sessions mirror the Peppermint session panel pattern", () => {
  assert.match(html, /class="sa-panel-title sa-sessions-title"[\s\S]*?<span>Sesiones<\/span>/);
  assert.match(html, /id="quickNewBtn" class="sa-new-session-btn"[\s\S]*?fa-pen-to-square[\s\S]*?<span>Nueva sesión<\/span>[\s\S]*?fa-circle-plus/);
  assert.match(html, /id="savedProjects" class="sa-session-list" role="list"/);
  assert.match(app, /class="sa-session-item[^"$]*\$\{[\s\S]*?role="listitem"/);
  assert.match(css, /\.sa-new-session-btn \{[\s\S]*?display:\s*flex;[\s\S]*?justify-content:\s*flex-start;[\s\S]*?gap:\s*9px/);
  assert.match(css, /\.sa-new-session-plus \{[\s\S]*?margin-left:\s*auto;[\s\S]*?opacity:\s*0;[\s\S]*?transform:\s*scale\(\.65\) rotate\(-45deg\)/);
  assert.match(css, /\.sa-new-session-btn:hover \.sa-new-session-plus,[\s\S]*?opacity:\s*1;/);
  assert.match(css, /\.sa-session-item\.active \{[\s\S]*?background:\s*var\(--sa-panel-2\) !important;[\s\S]*?box-shadow:\s*none !important;/);
  assert.match(css, /\.sa-sessions \{[\s\S]*?background:\s*var\(--sa-panel\) !important;/);
  assert.doesNotMatch(html, /id="quickNewBtn"[^>]*>[\s\S]{0,80}fa-plus/);
});
