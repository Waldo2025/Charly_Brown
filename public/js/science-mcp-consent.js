import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { getDefaultFirebaseApp } from './firebase-default-app.js';
const auth = getAuth(getDefaultFirebaseApp());
const request = new URLSearchParams(location.search).get('request');
const status = document.getElementById('consentStatus');
const login = document.getElementById('consentLogin');
const controls = ['consentAllow', 'consentDeny'].map(id => document.getElementById(id));
const labels = { 'science:read': 'Consultar tus planes y resultados.', 'science:plan': 'Crear, modificar y aprobar planes.', 'science:execute': 'Ejecutar, cancelar y reintentar la generación.' };
async function api(path, body) {
  if (!auth.currentUser || !request) throw Error('Inicia sesión y vuelve a solicitar la conexión.');
  const response = await fetch(`/api/science-activities/oauth/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json(); if (!response.ok) throw Error(value.message || value.error || 'No se pudo completar la conexión.'); return value;
}
login.addEventListener('click', () => signInWithPopup(auth, new GoogleAuthProvider()).catch(error => { status.textContent = error.message; }));
onAuthStateChanged(auth, async user => {
  login.hidden = Boolean(user); document.getElementById('consentDetails').hidden = true;
  if (!user) return;
  try {
    const details = await api(`request/${encodeURIComponent(request)}`);
    document.getElementById('consentClient').textContent = details.clientName;
    document.getElementById('consentRedirect').textContent = new URL(details.redirectUri).origin;
    document.getElementById('consentScopes').replaceChildren(...details.scopes.map(scope => { const li = document.createElement('li'); li.textContent = labels[scope] || scope; return li; }));
    status.textContent = `Sesión: ${user.email || user.uid}`; document.getElementById('consentDetails').hidden = false;
  } catch (error) { status.textContent = error.message; }
});
controls.forEach((button, index) => button.addEventListener('click', async () => {
  controls.forEach(node => { node.disabled = true; });
  try { const result = await api('consent', { request, allow: index === 0 }); location.assign(result.redirect); }
  catch (error) { status.textContent = error.message; controls.forEach(node => { node.disabled = false; }); }
}));
