/* PDF parsing and OCR run away from the application UI. */
importScripts('/vendor/pdfjs/pdf.min.js', '/vendor/pdfjs/pdf.worker.min.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js';
class BrowserCanvasFactory {
  create(width, height) { const canvas = new OffscreenCanvas(width, height); return { canvas, context: canvas.getContext('2d') }; }
  reset(target, width, height) { target.canvas.width = width; target.canvas.height = height; }
  destroy(target) { target.canvas.width = target.canvas.height = 1; target.canvas = target.context = null; }
}
let documentTask, cancelled = false, acknowledgement;
self.onmessage = async ({ data }) => {
  if (data.type === 'ack') { acknowledgement?.(); return; }
  if (data.type === 'cancel') { cancelled = true; await documentTask?.destroy(); return; }
  if (data.type !== 'extract') return;
  let ocr, dictionaries;
  try {
    const file = data.file;
    const initial = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
    const range = new pdfjsLib.PDFDataRangeTransport(file.size, initial);
    range.requestDataRange = async (begin, end) => {
      try { range.onDataRange(begin, new Uint8Array(await file.slice(begin, end).arrayBuffer())); }
      catch (error) { self.postMessage({ type: 'error', message: error.message }); await documentTask?.destroy(); }
    };
    documentTask = pdfjsLib.getDocument({ range, disableAutoFetch: true, disableStream: true, rangeChunkSize: 65536,
      disableWorker: true, isEvalSupported: false, useSystemFonts: true, canvasFactory: new BrowserCanvasFactory() });
    const pdf = await documentTask.promise;
    const labels = await pdf.getPageLabels();
    if (data.spelling) {
      importScripts('/document-processing/spell-bundle.js');
      dictionaries = await Promise.all(['es', 'en'].map(async language => {
        const [aff, dic] = await Promise.all(['aff', 'dic'].map(ext => fetch(`/document-processing/dictionaries/${language}.${ext}`).then(response => { if (!response.ok) throw Error('Diccionario local no disponible.'); return response.text(); })));
        return createLocalDictionary(aff, dic);
      }));
    }
    let labelStart = 1, previousLabelNumber = 0, previousLabelKind = '';
    const labelRecords = (labels || []).map((label, index) => {
      const roman = /^[ivxlcdm]+$/i.test(label), kind = /^\d+$/.test(label) ? 'arabic' : roman ? 'roman' : 'metadata';
      const values = { I:1, V:5, X:10, L:50, C:100, D:500, M:1000 };
      let number = Number(label) || index + 1;
      if (roman) { number = 0; let previous = 0; for (const char of [...label.toUpperCase()].reverse()) { const current = values[char]; number += current < previous ? -current : current; previous = Math.max(current, previous); } }
      if (kind !== previousLabelKind || number !== previousLabelNumber + 1) labelStart = index + 1;
      previousLabelKind = kind; previousLabelNumber = number;
      return { number, start: labelStart };
    });
    self.postMessage({ type: 'manifest', pageCount: pdf.numPages });
    for (let number = 1; number <= pdf.numPages && !cancelled; number++) {
      if ((data.completed || []).includes(number)) continue;
      let page, record;
      try {
        page = await pdf.getPage(number);
        const content = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });
        let text = content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('').trim();
        let method = 'text';
        const lines = new Map();
        for (const item of content.items) {
          if (item.transform[5] < viewport.height * .75) continue;
          const key = Math.round(item.transform[5]);
          const line = lines.get(key) || { items: [], size: 0 };
          line.items.push(item); line.size = Math.max(line.size, Math.hypot(item.transform[2], item.transform[3])); lines.set(key, line);
        }
        const headings = [...lines.values()].filter(line => line.size >= 15.5).map(line => line.items.sort((a,b) => a.transform[4]-b.transform[4]).map(item => item.str).join(' ').trim()).filter(title => !/\d/.test(title) && !/^unidad\s/i.test(title));
        if (!text && data.ocr && (await page.getOperatorList()).fnArray.length > 0) {
          if (typeof OffscreenCanvas !== 'function') throw Error('OCR local no compatible con este navegador.');
          if (!ocr) {
            importScripts('/vendor/tesseract/tesseract.min.js');
            ocr = await Tesseract.createWorker({ workerPath: '/vendor/tesseract/worker.min.js', corePath: '/vendor/tesseract/tesseract-core.wasm.js', langPath: '/vendor/tesseract/lang', workerBlobURL: false });
            await ocr.loadLanguage('spa+eng'); await ocr.initialize('spa+eng');
          }
          const scale = Math.min(1.5, Math.sqrt(4000000 / (viewport.width * viewport.height)));
          const view = page.getViewport({ scale });
          const canvas = new OffscreenCanvas(Math.ceil(view.width), Math.ceil(view.height));
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: view, canvasFactory: new BrowserCanvasFactory() }).promise;
          const result = await ocr.recognize(await canvas.convertToBlob({ type: 'image/png' }));
          text = result.data.text.trim(); method = 'ocr'; canvas.width = canvas.height = 1;
          if(!text)throw Error('OCR no encontró texto legible en esta página; requiere revisión.');
        }
        const footer = content.items.filter(item => /^\d{1,4}$/.test(item.str.trim()) && item.transform[5] <= viewport.height * .2)
          .sort((a,b) => a.transform[5]-b.transform[5])[0];
        const printedPageNumber = Number(footer?.str || 0);
        const spelling = [];
        if (dictionaries) for (const match of text.matchAll(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ'-]{2,}/g)) {
          const token = match[0];
          if (token.length < 4 || /^[A-ZÁÉÍÓÚÜÑ]/.test(token) || ['morsan','printeligencia','socioemocional','interculturalidad','neurolinguistica','neuropsicologia','andragogia','contextualizadas','xoloitzcuintle','sacadicos','copreterito','guion'].includes(token.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')) || token.includes('-') || token === token.toUpperCase() || dictionaries.some(dict => dict.correct(token.toLowerCase()))) continue;
          const replacements = [...new Set(dictionaries.flatMap(dict => dict.suggest(token)))].slice(0,4);
          if (replacements.some(value => !/[ -]/.test(value) && value.toLowerCase() !== token.toLowerCase() && value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'') === token.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''))) spelling.push({ word: token, token, pdfPageNumber: number, printedPageNumber, suggestions: replacements, replacements, context: text.slice(Math.max(0,match.index-60),match.index+token.length+60) });
          if (spelling.length >= 120) break;
        }
        record = { page: number, text, headings, method, spelling, printedPageNumber, logicalPageLabel: labels?.[number-1] || '',
          logicalPageNumber: labelRecords[number-1]?.number || printedPageNumber, logicalPageRuleStartPage: labelRecords[number-1]?.start || 0,
          logicalPageSource: labels ? 'pdf-label' : 'printed', status: 'completed', width: viewport.width, height: viewport.height };
      } catch (error) { record = { page: number, text: '', status: 'error', error: String(error.stack || error.message).slice(0, 600) }; }
      finally { page?.cleanup(); }
      const ack = new Promise(resolve => { acknowledgement = resolve; });
      self.postMessage({ type: 'page', record });
      await ack; // IndexedDB and consumers finish before retaining another page.
    }
    self.postMessage({ type: cancelled ? 'cancelled' : 'done' });
  } catch (error) { self.postMessage({ type: 'error', message: String(error.message).slice(0, 300) }); }
  finally { await ocr?.terminate(); await documentTask?.destroy(); }
};
