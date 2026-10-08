import { analyzeVideoTableHeader } from '../podcaster/podcaster-video-table-mapping.js';
export function scriptTablePayload(table) {
  const rows = Array.from(table.rows, row => Array.from(row.cells, cell => (cell.textContent || '').replace(/\s+/g, ' ').trim()));
  const { keys, isHeader } = analyzeVideoTableHeader(rows[0] || []);
  if (!isHeader || !['script', 'sceneDescription', 'visual'].every(key => keys.includes(key)) || rows.length < 2) throw new Error('La tabla no contiene las columnas necesarias para Snoopy.');
  return { html: table.outerHTML, text: rows.map(row => row.join('\t')).join('\n') };
}
export async function copyScriptTable(table) {
  const payload = scriptTablePayload(table);
  if (navigator.clipboard?.write && globalThis.ClipboardItem) {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([payload.html], { type: 'text/html' }), 'text/plain': new Blob([payload.text], { type: 'text/plain' }) })]);
  } else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(payload.text);
  else throw new Error('El navegador no permite copiar. Selecciona la tabla y cópiala manualmente.');
}
export function installScriptCopyButtons(panel) {
  for (const table of panel.querySelectorAll('table')) {
    try { scriptTablePayload(table); } catch { continue; }
    if (table.previousElementSibling?.dataset.copyVideoScript) continue;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'cb-chip-action'; button.dataset.copyVideoScript = 'true';
    button.textContent = 'Copiar tabla del guion';
    button.addEventListener('click', async () => {
      try { await copyScriptTable(table); button.textContent = 'Tabla copiada para Snoopy'; }
      catch (error) { button.textContent = 'No se pudo copiar'; button.title = error.message; }
    });
    table.before(button);
  }
}
