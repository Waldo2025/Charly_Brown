import { authFetchJson } from './api-client.js';
export async function openScienceCandidateReview(id, { onApproved } = {}) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw Error('Identificador de simulador inválido.');
  const base = `/api/science-activities/candidates/${id}`;
  const request = (path = '', body) => authFetchJson(base + path, { sameOrigin: true, ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  let { candidate } = await request();
  const dialog = document.createElement('dialog'); dialog.className = 'sa-candidate-dialog';
  const title = document.createElement('h2'); title.textContent = candidate.title;
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const iframe = document.createElement('iframe'); iframe.title = 'Vista previa aislada del simulador'; iframe.setAttribute('sandbox', 'allow-scripts'); iframe.referrerPolicy = 'no-referrer';
  const { html } = await request('/preview'); iframe.srcdoc = html;
  const details = document.createElement('details'), summary = document.createElement('summary'), code = document.createElement('pre'); summary.textContent = 'Código y pruebas del modelo'; code.textContent = candidate.source + '\n\n' + JSON.stringify(candidate.tests, null, 2); details.append(summary, code);
  const buttons = document.createElement('div'); buttons.className = 'sa-stage-actions';
  const update = () => { status.textContent = candidate.status === 'approved' ? 'Modelo aprobado y disponible para completar la actividad.' : candidate.evidence ? `Pruebas: ${candidate.evidence.passed ? 'aprobadas; pendiente de revisión administrativa' : 'fallidas'}.` : 'Pendiente de pruebas y revisión administrativa.'; };
  const action = (label, path) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'sa-small-button'; button.textContent = label; button.addEventListener('click', async () => { button.disabled = true; try { ({ candidate } = await request(path, { hash: candidate.hash })); update(); if (candidate.status === 'approved') await onApproved?.(candidate); } catch (error) { status.textContent = error.message; } finally { button.disabled = false; } }); buttons.append(button); };
  action('Ejecutar pruebas', '/validate'); action('Aprobar catálogo (administrador)', '/approve'); action('Rechazar', '/reject');
  const close = document.createElement('button'); close.textContent = 'Cerrar'; close.className = 'sa-small-button'; close.onclick = () => dialog.close(); buttons.append(close);
  dialog.append(title, status, iframe, details, buttons); document.body.append(dialog); update(); dialog.addEventListener('close', () => dialog.remove(), { once: true }); dialog.showModal();
}
