const normalized=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[−–]/g,'-').replace(/\s+/g,' ').trim();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function learnerQuestion(question,index) {
  const q=structuredClone(question),type=q.tipo_interaccion;
  const visible={index,type,title:q.titulo,prompt:q.reto,options:q.opciones||[],text:q.texto_con_hueco||''};
  if(type==='ordenar_secuencia')visible.elements=[...(q.elementos||[])].sort();
  if(['relacion_columnas','drag_drop','completar_espacio'].includes(type)) {
    visible.targets=(q.parejas||[]).map(p=>p.izquierda);
    visible.bank=[...(q.parejas||[]).map(p=>p.derecha),...(q.opciones||[])].sort();
  }
  if(q.interaction_data?.solutions) {
    const {solutions,...interaction}=q.interaction_data;
    visible.interaction=interaction;
  }
  return visible;
}
function answerMismatch(question,check) {
  let values=Array.isArray(check.values)?check.values.map(normalized):[];
  if(question.interaction_data?.solutions?.length) {
    const canonical=answers=>(answers||[]).map(a=>({target:a.target,options:a.options})).sort((a,b)=>String(a.target).localeCompare(String(b.target)));
    return !question.interaction_data.solutions.some(s=>same(canonical(s.answers),canonical(check.answers)));
  }
  if(question.tipo_interaccion==='ordenar_secuencia')return !same(values,(question.elementos||[]).map(normalized));
  if(['relacion_columnas','drag_drop','completar_espacio'].includes(question.tipo_interaccion)) {
    if(!values.length && Array.isArray(check.answers))values=(question.parejas||[]).map(pair=>normalized(check.answers.find(a=>String(a.target)===String(pair.izquierda))?.options?.[0]));
    if(values.length!==(question.parejas||[]).length)throw Object.assign(Error('El revisor debe devolver una ficha por destino o hueco.'),{status:422});
    return !same(values,(question.parejas||[]).map(p=>normalized(p.derecha)));
  }
  if(question.tipo_interaccion==='verdadero_falso')return !same(values,[question.respuesta_correcta?'true':'false']);
  const valid=[question.respuesta_correcta,...(question.respuestas_aceptadas||[])].map(normalized);
  return values.length!==1 || !valid.includes(values[0]);
}
function independentFindings(mission,checks) {
  if(!Array.isArray(checks)||checks.length!==mission.preguntas.length)throw Object.assign(Error('La revisión omitió soluciones independientes.'),{status:422});
  return mission.preguntas.flatMap((question,index)=>{
    const found=checks.filter(c=>c.questionIndex===index);
    if(found.length!==1||!String(found[0].evidence||'').trim())throw Object.assign(Error('La revisión no justificó cada actividad.'),{status:422});
    if(!answerMismatch(question,found[0]))return [];
    return [{target:'question',questionIndex:index,evidence:`La solución independiente difiere de la clave configurada: ${JSON.stringify(found[0].values||found[0].answers)}. ${found[0].evidence}`,correction:'Comprueba el enunciado y el cálculo. Corrige la clave privada, el plan y la actividad para que coincidan con la solución justificable. En secuencias, elementos contiene el orden correcto; en huecos, parejas sigue el orden de aparición.'}];
  });
}
module.exports={learnerQuestion,answerMismatch,independentFindings};
