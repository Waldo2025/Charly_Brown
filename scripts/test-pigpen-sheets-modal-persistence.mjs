import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const source = await readFile(new URL('../public/js/pigpen-sheets-import.js', import.meta.url), 'utf8');
const fields = ['level','grade','trimester','subject','unit'];
const row = {rowNumber:2,level:'Secundaria',grade:'Primero',trimester:'1',subject:'Inglés',unit:'Chapter 1',curricularTopic:'Biomes'};
const ids = ['erSheetsSourceSelect','erSheetsSheetSelect','erSheetsRowSelect',...fields.map(f=>`erSheets${f[0].toUpperCase()}${f.slice(1)}Filter`)];
const html = ids.map(id=>`<select id="${id}"></select>`).join('') + fields.map(f=>`<div data-sheet-filter="${f}"></div>`).join('') + '<input type="checkbox" id="erSheetsEnrichObjective"><input type="checkbox" id="erSheetsGenerateEscapeRoom"><button id="btnApplySheetsImport"><span></span></button><div id="erSheetsImportPreview"></div><div id="erSheetsImportStatus"></div>';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();
 await page.route('http://pigpen.test/**',route=>route.fulfill({contentType:'text/html',body:html}));
 async function boot(){
  await page.goto('http://pigpen.test');
  await page.evaluate(({row,fields})=>{
   window.fetch=async url=>({ok:true,json:async()=>url.endsWith('/rows')?{rows:[row,{...row,rowNumber:3}],fields}:url.endsWith('/sheets')?{sheets:[{sheetId:0,title:'Hoja'}]}:{sources:[{id:'source',displayName:'Archivo'}]}});
  },{row,fields});
  await page.addScriptTag({content:source});
  await page.evaluate(()=>{window.PigPenSheetsImport.init({getUser:()=>({getIdToken:async()=> 'test'})});window.PigPenSheetsImport.open();});
  await page.waitForFunction(()=>document.querySelector('#erSheetsSourceSelect').options.length===2);
 }
 await boot();
 await page.selectOption('#erSheetsSourceSelect','source');
 await page.waitForFunction(()=>document.querySelector('#erSheetsSheetSelect').options.length===2);
 await page.selectOption('#erSheetsSheetSelect','0');
 await page.waitForFunction(()=>document.querySelector('#erSheetsRowSelect').options.length===3);
 for(const f of fields) await page.selectOption(`#erSheets${f[0].toUpperCase()}${f.slice(1)}Filter`,row[f]);
 await page.selectOption('#erSheetsRowSelect','3');
 await page.check('#erSheetsEnrichObjective');
 await page.check('#erSheetsGenerateEscapeRoom');
 await boot();
 await page.waitForFunction(()=>document.querySelector('#erSheetsRowSelect').value==='3');
 assert.equal(await page.inputValue('#erSheetsSheetSelect'),'0');
 for(const f of fields) assert.equal(await page.inputValue(`#erSheets${f[0].toUpperCase()}${f.slice(1)}Filter`),row[f]);
 assert.equal(await page.isChecked('#erSheetsEnrichObjective'),true);
 assert.equal(await page.isChecked('#erSheetsGenerateEscapeRoom'),true);
 assert.match(await page.locator('#erSheetsImportPreview').innerText(),/Fila 3/);
 await page.evaluate(()=>localStorage.setItem('pigpen.sheetImportModal.v1','{bad json'));
 await boot();
 assert.equal(await page.inputValue('#erSheetsSourceSelect'),'');
 console.log('Sheets modal persistence OK: reload, sheet 0, filters, row, switches, corrupt storage.');
} finally {await browser.close();}
