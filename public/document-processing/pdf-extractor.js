export const EXTRACTOR_VERSION = 'pdf-local-1';
export const MAX_PDF_BYTES = 1024 ** 3;
let database;
function openDatabase() {
  return database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('CharlyLocalDocuments', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('pages'); request.result.createObjectStore('manifests'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function storage(store, key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, value === undefined ? 'readonly' : 'readwrite');
    const request = value === undefined ? tx.objectStore(store).get(key) : tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(tx.error);
  });
}
const hex = buffer => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
export async function fingerprintFile(file, signal) {
  // SHA-256 of ordered chunk digests: bounded memory, all bytes participate.
  const hashes = [];
  for (let offset = 0; offset < file.size; offset += 4 * 1024 ** 2) {
    signal?.throwIfAborted();
    hashes.push(hex(await crypto.subtle.digest('SHA-256', await file.slice(offset, offset + 4 * 1024 ** 2).arrayBuffer())));
  }
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${file.size}:${hashes.join(':')}`)));
}
export async function readPdfPages(manifest, first = 1, last = manifest.pageCount) {
  const pages = [];
  for (let number = first; number <= Math.min(last, manifest.pageCount); number++) pages.push(await storage('pages', `${manifest.key}:${number}`));
  return pages;
}
export async function extractPdf(file, { signal, onProgress, onBatch, ocr = true, spelling = false } = {}) {
  if (!(file instanceof Blob) || file.size > MAX_PDF_BYTES) throw Error('El límite local es 1 GB.');
  signal?.throwIfAborted();
  const fingerprint = await fingerprintFile(file, signal);
  const key = `${EXTRACTOR_VERSION}:${fingerprint}:${ocr}:${spelling}`;
  const previous = await storage('manifests', key);
  const manifest = previous || { key, fingerprint, version: EXTRACTOR_VERSION, size: file.size, pageCount: 0, completed: [], errors: [] };
  const delivered=new Set();
  // Re-deliver persisted pages to rebuild deterministic external batches after reload.

  for (let first = 1; first <= manifest.pageCount; first += 25) {
    const pages = (await readPdfPages(manifest, first, first + 24)).filter(p => p?.status === 'completed');
    if (pages.length === Math.min(25, manifest.pageCount - first + 1)){await onBatch?.(pages, manifest);delivered.add(first);}
  }
  const worker = new Worker('/document-processing/pdf-worker.js');
  let rejectAbort;
  const abort = () => { worker.terminate(); rejectAbort?.(signal.reason || new DOMException('Cancelado', 'AbortError')); };
  const aborted = new Promise((_, reject) => { rejectAbort = reject; signal?.addEventListener('abort', abort, { once: true }); });
  signal?.throwIfAborted();
  try {
    const result = new Promise((resolve, reject) => {
      let chain = Promise.resolve();
      worker.onmessage = ({ data }) => {
        chain = chain.then(async () => {
          signal?.throwIfAborted();
          if (data.type === 'error') throw Error(data.message);
          if (data.type === 'manifest') { manifest.pageCount = data.pageCount; await storage('manifests', key, manifest); }
          if (data.type === 'page') {
            const page = data.record;
            await storage('pages', `${key}:${page.page}`, page);
            manifest.errors = manifest.errors.filter(error => error.page !== page.page);
            if (page.status === 'completed') manifest.completed = [...new Set([...manifest.completed, page.page])];
            else manifest.errors.push({ page: page.page, error: page.error });
            await storage('manifests', key, manifest);
            if (page.page % 25 === 0 || page.page === manifest.pageCount) {
              const first = Math.floor((page.page - 1) / 25) * 25 + 1;
              await onBatch?.((await readPdfPages(manifest, first, Math.min(first + 24, manifest.pageCount))).filter(Boolean), manifest);
              delivered.add(first);
            }
            onProgress?.({ page: page.page, pageCount: manifest.pageCount, completed: manifest.completed.length, errors: manifest.errors.length });
            worker.postMessage({ type: 'ack' });
          }
          if (data.type === 'done') {

            manifest.complete = manifest.completed.length === manifest.pageCount && manifest.errors.length === 0;
            // A repaired page can be inside an otherwise cached batch: no later
            // page event will cross that batch boundary. Deliver it before done.
            if(manifest.complete)for(let first=1;first<=manifest.pageCount;first+=25)if(!delivered.has(first)){
              await onBatch?.(await readPdfPages(manifest,first,first+24),manifest);delivered.add(first);
            }
            await storage('manifests', key, manifest); resolve(manifest);
          }
        }).catch(reject);
      };
      worker.onerror = event => reject(Error(event.message));
      worker.postMessage({ type: 'extract', file, completed: manifest.completed, ocr, spelling });
    });
    return await Promise.race([result, aborted]);
  } finally { worker.terminate(); signal?.removeEventListener('abort', abort); }
}
