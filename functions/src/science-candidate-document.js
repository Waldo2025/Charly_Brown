const { createHash } = require('node:crypto');
const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const jsonScript = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
function normalizeCandidate(input = {}) {
  const source = String(input.source || '');
  if (!source.trim() || Buffer.byteLength(source) > 80000) throw Error('candidate_source_size');
  const controls = (Array.isArray(input.controls) ? input.controls : []).slice(0, 16).map(c => ({ id: String(c.id || ''), label: String(c.label || c.id).slice(0, 120), min: Number(c.min), max: Number(c.max), step: Number(c.step || 1), value: Number(c.value ?? c.min), unit: String(c.unit || '').slice(0, 30) }));
  if (new Set(controls.map(c => c.id)).size !== controls.length || controls.some(c => !/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(c.id) || ![c.min,c.max,c.step,c.value].every(Number.isFinite) || c.max <= c.min || c.step <= 0 || c.value < c.min || c.value > c.max)) throw Error('candidate_controls_invalid');
  const tests = (Array.isArray(input.tests) ? input.tests : []).slice(0, 30).map(t => ({ params: t.params || {}, expected: t.expected || {}, tolerance: Number(t.tolerance ?? 1e-6) }));
  if (tests.length < 3 || tests.some(t => !Number.isFinite(t.tolerance) || t.tolerance < 0 || t.tolerance > .1 || !Object.keys(t.expected).length || Object.values(t.expected).some(n => !Number.isFinite(n)) || Object.values(t.params).some(n => !Number.isFinite(n)))) throw Error('candidate_tests_required');
  const result = { source, controls, tests, title: String(input.title || 'Simulador experimental').slice(0, 160), description: String(input.description || '').slice(0, 4000), limitations: String(input.limitations || '').slice(0, 4000), version: 1 };
  return { ...result, hash: createHash('sha256').update(JSON.stringify(result)).digest('hex') };
}
function buildCandidateDocument(candidate, { backgroundDataUrl = "" } = {}) {
  if (backgroundDataUrl && !/^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(backgroundDataUrl)) throw Error("candidate_background_invalid");
  const c = normalizeCandidate(candidate);
  const { tests: _tests, ...runtimeCandidate } = c;
  const executable = c.source.replace(/\bexport\s+(?=(?:async\s+)?function\s+(?:measure|draw)\s*\()/g, '').replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; worker-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"><title>${escapeHtml(c.title)}</title><style>body{margin:0;background:#10151f;color:#edf4f6;font:16px system-ui}main{max-width:1100px;margin:auto;padding:16px}canvas{width:100%;aspect-ratio:16/9;background:#18202c${backgroundDataUrl ? ` url('${backgroundDataUrl}') center/cover no-repeat` : ''};border-radius:12px}fieldset{border:1px solid #303b4b;display:flex;gap:12px;flex-wrap:wrap}label{display:grid;gap:4px}button{padding:10px;color:inherit;background:#202a38;border:1px solid #48d8c8;border-radius:8px}output{display:block;white-space:pre-wrap}#error{color:#ff8068}</style></head><body><main><h1>${escapeHtml(c.title)}</h1><p>${escapeHtml(c.description)}</p><canvas width="960" height="540" aria-label="Escena científica"></canvas><fieldset><legend>Variables</legend></fieldset><p><button id="run">Ejecutar</button> <button id="pause">Pausar</button> <button id="reset">Reiniciar</button></p><output aria-live="polite"></output><p id="error" role="alert"></p><p>${escapeHtml(c.limitations)}</p></main><script type="module">
const candidate=${jsonScript(runtimeCandidate)};
const error=document.querySelector('#error');
try {
  const model=(()=>{${executable}\n;return {measure,draw};})();
  if(typeof model.measure!=='function'||typeof model.draw!=='function')throw Error('Se requieren measure(params) y draw(ctx,state,width,height).');
  const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),params=Object.fromEntries(candidate.controls.map(c=>[c.id,c.value]));
  let time=0,running=false,previous=performance.now(),lastPublished=0;
  const measure=(p)=>{const value=model.measure({...p});if(!value||typeof value!=='object'||Object.values(value).some(v=>!Number.isFinite(v)))throw Error('Las mediciones deben ser números finitos.');return value};
  window.__scienceMeasure=measure;
  window.__scienceCandidateReady=true;
  const render=()=>{const measurements=measure({...params,time});ctx.clearRect(0,0,canvas.width,canvas.height);model.draw(ctx,{params:{...params},time,measurements,running},canvas.width,canvas.height);document.querySelector('output').textContent=Object.entries(measurements).map(([k,v])=>k+': '+Number(v.toFixed(6))).join(' · ')};
  candidate.controls.forEach(c=>{const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');text.textContent=c.label+' ('+c.unit+')';input.type='range';input.min=c.min;input.max=c.max;input.step=c.step;input.value=c.value;input.setAttribute('aria-label',c.label);input.oninput=()=>{params[c.id]=Number(input.value);render()};label.append(text,input);document.querySelector('fieldset').append(label)});
  document.querySelector('#run').onclick=()=>running=true;document.querySelector('#pause').onclick=()=>running=false;
  document.querySelector('#reset').onclick=()=>{time=0;running=false;render()};
  const publish=()=>{const measurements=measure({...params,time});parent.postMessage({type:'science-simulator:state',state:{time,running,values:{...params},params:{...params},measurements,measurement:Object.values(measurements)[0]??null}},'*')};
  function frame(now){try{if(running)time+=Math.min((now-previous)/1000,.05);previous=now;render();if(now-lastPublished>250){publish();lastPublished=now}requestAnimationFrame(frame)}catch(e){error.textContent=e.message;window.__scienceCandidateError=e.message}}
  window.addEventListener('message',event=>{if(event.source!==parent||event.data?.type!=='science-simulator:command')return;const message=event.data;if(message.command==='run')running=true;if(message.command==='pause')running=false;if(message.command==='reset'){time=0;running=false}if(message.command==='setParam'){const c=candidate.controls.find(c=>c.id===message.id);if(c&&Number.isFinite(message.value))params[c.id]=Math.max(c.min,Math.min(c.max,message.value))}render();publish()});
  render();requestAnimationFrame(frame);
}catch(e){error.textContent=e.message;window.__scienceCandidateError=e.message}
</script></body></html>`;
}
module.exports = { normalizeCandidate, buildCandidateDocument };
