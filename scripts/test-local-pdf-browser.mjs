import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { chromium } from 'playwright';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const PDFDocument = require('pdfkit');
const sizes = process.argv.includes('--large') ? [250 * 1024**2, 500 * 1024**2, 1024**3] : [0];
const base = '/tmp/charly-local-pdf-base.pdf';
const out = fs.createWriteStream(base), pdf = new PDFDocument(); pdf.pipe(out);
for (let number=1;number<=52;number++) { if(number>1) pdf.addPage(); pdf.text(`Page ${number}: verified coverage marker ${number}`); }
pdf.end(); await once(out, 'finish');
const bytes = fs.readFileSync(base), offset = bytes.toString('latin1').match(/startxref\s+(\d+)\s+%%EOF\s*$/)[1];
const server = http.createServer((req,res) => {
  if(req.url==='/') { res.setHeader('Content-Type','text/html'); return res.end('<input id="file" type="file"><script type="module">import {extractPdf,readPdfPages} from "/document-processing/pdf-extractor.js";window.extractPdf=extractPdf;window.readPdfPages=readPdfPages;</script>'); }
  if(!/^\/(vendor\/(pdfjs|tesseract)|document-processing)\/[a-zA-Z0-9./-]+$/.test(req.url) || req.url.includes('..')) { res.statusCode=404; return res.end(); }
  res.setHeader('Content-Type',req.url.endsWith('.wasm') ? 'application/wasm' : req.url.endsWith('.gz') ? 'application/gzip' : req.url.endsWith('.js') ? 'application/javascript' : 'text/plain'); fs.createReadStream(path.join(process.cwd(),'public',req.url)).pipe(res);
});
server.listen(0,'127.0.0.1'); await once(server,'listening');
let browser;
try {
  browser=await chromium.launch({headless:true}); const page=await browser.newPage();
  if(process.env.CHARLY_PDF_PREVIEW_URL){
    await page.goto(process.env.CHARLY_PDF_PREVIEW_URL+'/robots.txt');
    await page.evaluate(async()=>{document.body.innerHTML='<input id="file" type="file">';const module=await import('/document-processing/pdf-extractor.js');window.extractPdf=module.extractPdf;window.readPdfPages=module.readPdfPages;});
  }else await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(()=>window.extractPdf);
  for(const size of sizes) {
    const fixture=`/tmp/charly-local-pdf-${size}.pdf`;
    fs.copyFileSync(base,fixture);
    if(size) { const fd=fs.openSync(fixture,'r+'); const tail=Buffer.from(`\nstartxref\n${offset}\n%%EOF\n`); fs.ftruncateSync(fd,size); fs.writeSync(fd,tail,0,tail.length,size-tail.length);fs.closeSync(fd); }
    await page.locator('#file').setInputFiles(fixture);
    const result=await page.evaluate(async()=>{
      const file=document.querySelector('#file').files[0];let batches=0;
      const manifest=await window.extractPdf(file,{ocr:false,onBatch:()=>batches++});
      const pages=await window.readPdfPages(manifest);
      return {complete:manifest.complete,pageCount:manifest.pageCount,errors:manifest.errors,markers:pages.every((p,i)=>p.text.includes(`marker ${i+1}`)),batches};
    });
    if(!result.complete||result.pageCount!==52||!result.markers)throw Error(JSON.stringify(result));
    console.log(JSON.stringify({size,...result}));
    const resumed = await page.evaluate(async () => { const file=document.querySelector('#file').files[0]; let batches=0; const manifest=await window.extractPdf(file,{ocr:false,onBatch:()=>batches++}); return {complete:manifest.complete,batches}; });
    if (!resumed.complete || resumed.batches !== 3) throw Error('resume failed');
    fs.unlinkSync(fixture);
  }
  if (process.argv.includes('--edge')) {
    await page.locator('#file').setInputFiles(base);
    const repaired=await page.evaluate(async()=>{
      const file=document.querySelector('#file').files[0],manifest=await window.extractPdf(file,{ocr:false});
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('CharlyLocalDocuments');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      await new Promise((resolve,reject)=>{const tx=db.transaction(['pages','manifests'],'readwrite');manifest.completed=manifest.completed.filter(n=>n!==26);manifest.errors=[{page:26,error:'fixture interruption'}];manifest.complete=false;tx.objectStore('manifests').put(manifest,manifest.key);tx.objectStore('pages').put({page:26,status:'error',error:'fixture interruption'},manifest.key+':26');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
      const delivered=[];const result=await window.extractPdf(file,{ocr:false,onBatch:pages=>delivered.push(...pages.map(p=>p.page))});return{complete:result.complete,pages:new Set(delivered).size,deliveries:delivered.length};
    });
    if(!repaired.complete||repaired.pages!==52||repaired.deliveries!==52)throw Error(JSON.stringify(repaired));console.log(JSON.stringify({repairedBatch:true,...repaired}));
    await page.locator('#file').setInputFiles(base);
    const result = await page.evaluate(async () => {
      const file = new Blob([document.querySelector('#file').files[0], '\n% cancel-fixture']);
      const controller = new AbortController(); let aborted = false;
      try { await window.extractPdf(file, { ocr:false, signal:controller.signal, onBatch:()=>controller.abort() }); }
      catch (error) { aborted = error.name === 'AbortError'; }
      const resumed = await window.extractPdf(file, { ocr:false });
      let damagedRejected = false;
      try { await window.extractPdf(new Blob(['%PDF-1.7\ninvalid file']), {ocr:false}); } catch { damagedRejected=true; }
      return {aborted, resumed:resumed.complete, damagedRejected};
    });
    if (!result.aborted || !result.resumed || !result.damagedRejected) throw Error(JSON.stringify(result));
    console.log(JSON.stringify({edge:true,...result}));
  }
  if (process.argv.includes('--ocr')) {
    const sharp = require('sharp');
    const image = await sharp(Buffer.from('<svg width="1200" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="300" fill="white"/><text x="40" y="150" font-family="Arial" font-size="70" fill="black">Documento para lectura local</text></svg>')).png().toBuffer();
    const scanned='/tmp/charly-local-pdf-scanned.pdf', stream=fs.createWriteStream(scanned), doc=new PDFDocument(); doc.pipe(stream); doc.image(image,30,100,{width:550}); doc.addPage().text('Mixed document verified text page'); doc.end(); await once(stream,'finish');
    await page.locator('#file').setInputFiles(scanned);
    const result = await page.evaluate(async () => { const manifest=await window.extractPdf(document.querySelector('#file').files[0],{ocr:true}); const pages=await window.readPdfPages(manifest); return {complete:manifest.complete,errors:manifest.errors,text:pages[0].text,mixed:pages[1].text.includes('verified text page')}; });
    fs.unlinkSync(scanned);
    if (!result.complete || !result.mixed || !/Documento/i.test(result.text)) throw Error(JSON.stringify(result));
    console.log(JSON.stringify({ocr:true,...result}));
  }
  if (process.argv.includes('--edge')) {
    const protectedPath='/tmp/charly-local-pdf-protected.pdf', stream=fs.createWriteStream(protectedPath),doc=new PDFDocument({userPassword:'fixture-password'});
    doc.pipe(stream);doc.text('Protected fixture');doc.end();await once(stream,'finish');
    await page.locator('#file').setInputFiles(protectedPath);
    const explicit=await page.evaluate(async()=>{try{await window.extractPdf(document.querySelector('#file').files[0]);return false;}catch(error){return Boolean(error.message);}});
    fs.unlinkSync(protectedPath);if(!explicit)throw Error('protected PDF silently accepted');console.log(JSON.stringify({protected:true,explicitError:true}));
  }
} finally {await browser?.close();server.close();fs.unlinkSync(base);}
