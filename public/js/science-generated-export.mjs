import { validateGeneratedSimulator, generatedSimulatorDocument } from "./science-model-generated-runtime.mjs";
function attribute(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
export function buildGeneratedSimulatorExportHtml(activity) {
  const generated = activity?.simulator?.generated;
  if (generated?.reviewStatus !== 'approved' || !generated?.candidateId || !generated?.hash || !generated?.html || !activity.generation?.complete) throw new Error('El simulador necesita aprobación y validación antes de exportarse.');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${attribute(activity.title || 'Simulador científico')}</title><link rel="stylesheet" href="css/styles.css"></head><body><main class="game-shell"><div class="game-frame"><iframe class="science-generated-frame" title="${attribute(activity.title || 'Simulador científico')}" sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="${attribute(generatedSimulatorDocument(generated))}"></iframe></div></main></body></html>`;
}
export async function exportGeneratedSimulator(JSZip, activity, { css, filename }) {
  await validateGeneratedSimulator(activity?.simulator?.generated);
  const zip = new JSZip();
  zip.file('index.html', buildGeneratedSimulatorExportHtml(activity));
  zip.file('css/styles.css', css);
  zip.file('data/activity.json', JSON.stringify(activity, null, 2));
  zip.file('LEEME.txt', 'Simulador aprobado y versionado. Abre index.html sin conexión. El simulador se ejecuta en un marco aislado y no requiere credenciales.');
  const blob = typeof zip.generateAsync === 'function' ? await zip.generateAsync({ type: 'blob' }) : zip.generate({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
