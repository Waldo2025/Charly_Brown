export function generationApiBase(config = globalThis.__CHARLY_CONFIG__ || {}, location = globalThis.location) {
  return String(config.pigpenGenerationApiBaseUrl || (/^(localhost|127\.0\.0\.1)$/.test(location?.hostname || '')
    ? 'http://127.0.0.1:8793/api/pigpen/generation' : '/api/pigpen/generation')).replace(/\/$/,'');
}
export function generationSummary(run) {
  const labels={objective:'Preparando objetivo',room:'Generando acertijos',repair:'Corrigiendo coherencia',image:'Generando imágenes',review:'Revisando brief, acertijos e imágenes',assemble:'Ensamblando escape room'};
  const current=(run.tasks||[]).filter(t=>t.status==='running');
  const ready=new Set((run.tasks||[]).filter(t=>t.stage==='review'&&t.status==='completed').map(t=>t.roomIndex));
  return {title:run.status==='completed'?'Generación terminada':run.status==='needs_attention'?'Hay elementos que requieren atención':'Agentes trabajando en paralelo',
    detail:run.status==='completed'?(run.mode==='objective'?'Plan maestro listo para generar las salas.':'Todas las salas fueron revisadas.'):current.map(t=>`${t.roomIndex>=0?`Sala ${t.roomIndex+1}: `:''}${labels[t.stage]||t.stage}`).join(' · ')||run.message||'Esperando capacidad disponible',ready:ready.size};
}
export function createGenerationClient({fetchJson,onProgress=()=>{},interval=2000,base=generationApiBase()}) {
  const request = fetchJson;
  fetchJson = (url, options) => request(url, {...options, sameOrigin:base.startsWith('/'), allowFallback: false});
  const get=id=>fetchJson(`${base}/${encodeURIComponent(id)}`,{method:'GET'});
  const control=(id,action)=>fetchJson(`${base}/${encodeURIComponent(id)}/${action}`,{method:'POST',body:{}});
  async function watch(run,{signal}={}) {
    while(true){
      if(signal?.aborted)throw new DOMException('Se cambió el tema abierto.','AbortError');
      onProgress(run);
      if(run.status==='completed')return run;
      if(['needs_attention','cancelled'].includes(run.status))throw Object.assign(new Error(run.message||'Generación cancelada. Los avances se conservaron.'),{run});
      await new Promise(resolve=>setTimeout(resolve,interval));
      if(signal?.aborted)throw new DOMException('Se cambió el tema abierto.','AbortError');
      try{run=await get(run.runId);}catch(error){
        if([401,403,404].includes(error.status))throw error;
        onProgress({...run,message:'Conexión interrumpida. El servidor continúa trabajando.'});
        await new Promise(resolve=>setTimeout(resolve,interval*2));
      }
    }
  }
  return {get,control,watch,
    active:(sessionId,topicId)=>fetchJson(`${base}/active?sessionId=${encodeURIComponent(sessionId)}&topicId=${encodeURIComponent(topicId)}`,{method:'GET'}),
    start:input=>fetchJson(base,{method:'POST',body:{...input,idempotencyKey:input.idempotencyKey||crypto.randomUUID()}})};
}
