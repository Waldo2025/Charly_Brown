import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [source, css] = await Promise.all([
  readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8"),
  readFile(new URL("../public/scienceActivities.css", import.meta.url), "utf8")
]);

test("la pantalla inicial tiene contenido editable y hereda la información curricular", () => {
  assert.match(source, /function resolveStartScreenContent\(activity = \{\}\)/);
  assert.match(source, /experience:\s*meaningfulActivityText\(custom\.experience\) \|\| meaningfulActivityText\(activity\.experiencePrompt\)/);
  assert.match(source, /expectedLearnings:\s*meaningfulActivityText\(custom\.expectedLearnings\) \|\| meaningfulActivityText\(activity\.expectedLearnings\)/);
  assert.match(source, /id="startScreenExperience"/);
  assert.match(source, /id="startScreenExpectedLearnings"/);
  assert.match(source, /id="startScreenButtonLabel"/);
  assert.match(source, /updateStartScreenFromEditor\(state\.activity, event\.target\)/);
});

test("el inspector contiene una pestaña Inicio y cinco columnas", () => {
  assert.match(source, /data-inspector-tab="start"/);
  assert.match(source, /\["general", "start", "objectives", "questions", "help"\]/);
  assert.match(css, /grid-template-columns:\s*repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css, /grid-template-columns:repeat\(5,minmax\(56px,1fr\)\)\s*!important/);
});

test("preview y ZIP comparten experiencia y aprendizajes esperados", () => {
  assert.match(source, /function renderPreviewStartScreen\(activity = state\.previewActivity \|\| state\.activity\)/);
  assert.match(source, /if \(state\.contentSelection === "start"\) renderPreviewStartScreen\(previewActivity\)/);
  assert.match(source, /function buildExportStartGate\(activity\)/);
  assert.match(source, /parseExpectedLearningStatements\(content\.expectedLearnings\)/);
  assert.match(source, /class="science-export-learnings"/);
  assert.match(css, /\.science-preview-start-info/);
  assert.match(css, /@container sa-briefing-frame \(max-width:720px\)/);
  assert.match(css, /-webkit-text-fill-color:#d8eaf1\s*!important/);
  assert.match(source, /@media\(orientation:portrait\) and \(max-width:900px\)\{\.science-export-experience\{grid-template-columns:1fr!important\}\}/);
  assert.match(source, /\.science-export-experience :is\(p,ol,li\)\{color:#d8eaf1!important;-webkit-text-fill-color:#d8eaf1!important;font-weight:400!important/);
  assert.match(css, /\.science-preview-start-info :is\(p,ol,li\)[\s\S]*?font-weight:400\s*!important/);
  assert.match(css, /#sciencePreviewStartTitle\s*\{[\s\S]*?color:var\(--preview-start-title-color,#f4fbff\)\s*!important/);
  assert.match(css, /data-visual-style\*="arcade"[\s\S]*?--preview-start-title-color:#fff4a8/);
  assert.match(source, /--start-title-color:#fff4a8/);
  assert.match(source, /color:var\(--start-title-color,#f4fbff\)!important/);
  assert.match(css, /background:var\(--preview-start-card-bg\)/);
  assert.match(css, /border:1px solid var\(--preview-start-card-border\)/);
  assert.match(source, /background:var\(--start-card-bg\)!important/);
  assert.match(css, /border-color:var\(--preview-start-card-border\)\s*!important/);
});
