import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const html = await readFile(new URL("../public/scienceActivities.html", import.meta.url), "utf8");
const css = await readFile(new URL("../public/scienceActivities.css", import.meta.url), "utf8");
const body = html.match(/<body[^>]*>([\s\S]*?)<script type="module"/)?.[1] || "";
const pageHtml = `<!doctype html><html><head><style>${css}</style></head><body class="sa-shell"><main class="sa-page">${body}</main><script>
const form=document.querySelector('#activityForm'),modal=document.querySelector('#newSessionModal'),mount=document.querySelector('#newSessionBriefMount');
window.applyMode=mode=>{form.dataset.experienceMode=mode;modal.dataset.experienceMode=mode;form.querySelectorAll('[data-experience-scope]').forEach(section=>{const visible=section.dataset.experienceScope===mode;section.hidden=!visible;section.setAttribute('aria-hidden',String(!visible));section.querySelectorAll('input,select,textarea,button').forEach(control=>{if(!visible){if(!control.dataset.modeDisabled)control.dataset.modeDisabled=control.disabled?'preserved':'temporary';control.disabled=true}else if(control.dataset.modeDisabled==='temporary'){control.disabled=false;delete control.dataset.modeDisabled}else if(control.dataset.modeDisabled==='preserved'){delete control.dataset.modeDisabled}})})};
window.moveToModal=()=>mount.append(form);window.moveToPanel=()=>document.querySelector('.sa-brief').append(form);
</script></body></html>`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
try {
  await page.setContent(pageHtml);
  const inspect = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-experience-scope]')].map(node => [node.id, { hidden: node.hidden, display: getComputedStyle(node).display, disabled: [...node.querySelectorAll('input,select,textarea,button')].every(control => control.disabled) }])));
  await page.evaluate(() => { window.moveToPanel(); window.applyMode('simulator'); });
  let state = await inspect();
  for (const id of ['activityScenarioField','expectedLearningsField','experiencePromptField','gameStructureFields','gameProgressionFields']) assert.deepEqual(state[id], { hidden:true, display:'none', disabled:true }, `Panel simulator: ${id}`);
  for (const id of ['simulatorProfileSummary','simulatorVisualChoiceFields']) assert.equal(state[id].display === 'none', false, `Panel simulator debe mostrar ${id}`);
  await page.evaluate(() => { window.moveToModal(); window.applyMode('simulator'); });
  state = await inspect();
  for (const id of ['activityScenarioField','expectedLearningsField','experiencePromptField','gameStructureFields','gameProgressionFields']) assert.equal(state[id].display, 'none', `Modal simulator: ${id}`);
  await page.evaluate(() => window.applyMode('game'));
  state = await inspect();
  for (const id of ['activityScenarioField','expectedLearningsField','experiencePromptField','gameStructureFields','gameProgressionFields']) assert.equal(state[id].display === 'none', false, `Modal game debe mostrar ${id}`);
  for (const id of ['simulatorProfileSummary','simulatorVisualChoiceFields']) assert.deepEqual(state[id], { hidden:true, display:'none', disabled:true }, `Modal game: ${id}`);
} finally {
  await browser.close();
}
