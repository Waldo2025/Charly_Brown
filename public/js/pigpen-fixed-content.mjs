// PigPen owns the JSON topology and answer wiring. The model supplies text only.
export const CONTENT_SLOT = '__PIGPEN_CONTENT__';
export function fixedSchemaValue(schema) {
  if (schema.enum) return schema.enum[0];
  if (schema.type === 'object') return Object.fromEntries((schema.required || []).map(key => [key, fixedSchemaValue(schema.properties[key])]));
  if (schema.type === 'array') return Array.from({length: schema.maxItems === 0 ? 0 : Math.max(schema.minItems || 0, Math.min(schema.maxItems ?? 3, 3))},()=>fixedSchemaValue(schema.items));
  if (schema.type === 'string') return CONTENT_SLOT;
  if (schema.type === 'boolean') return false;
  return schema.default ?? schema.minimum ?? 0;
}
export function fixedInteraction(type, engine, seed = 0) {
  const family = engine.get(type).family;
  const text = name => CONTENT_SLOT + name;
  const option = (id,i) => ({id,label:text(id),value:i+1+(seed%7),x:i+1,y:1});
  const c={version:1,instructions:text('instructions'),extra_hint:text('extra_hint'),options:['a','b','c','d'].map(option),targets:[{id:'t',label:text('t'),allowed:[],x:30,y:30}],solutions:[{answers:[{target:'t',options:['a']}]}],connections:[],rules:[],minimum:1,maximum:12,goal:0};
  if (['respuesta_justificacion','corregir_error','completar_patron','completar_analogia','clasificar_grupos','resolver_restricciones'].includes(type) || ['matrix','attributes','diagram','balance','scale'].includes(family)) {
    c.targets.push({id:'u',label:text('u'),allowed:[],x:70,y:70});
    c.solutions[0].answers.push({target:'u',options:['b']});
  }
  if (['respuesta_justificacion','corregir_error'].includes(type)) {
    c.options=['a','b','c','d','e','f'].map(option);
    c.targets[0].allowed=['a','c','e'];c.targets[1].allowed=['b','d','f'];
  }
  if (['multi','evidence','attributes'].includes(family)) c.solutions[0].answers[0].options=['a','c'];
  if (family === 'attributes') c.solutions[0].answers[1].options = ['b', 'd'];
  if (type==='construir_solucion') {
    c.options=['a','b','c','d','e','f'].map(option);
    c.targets=['t','u','v'].map((id,i)=>({id,label:text(id),allowed:[],x:0,y:0}));
    c.solutions=[{answers:c.targets.map((t,i)=>({target:t.id,options:[['a','b','c'][i]]}))}];
  }
  if (family==='coordinates') {
    c.options=Array.from({length:9},(_,i)=>({id:'cell'+i,label:String.fromCharCode(65+i),x:i%3+1,y:Math.floor(i/3)+1,value:0}));
    c.start_option='cell4';
    const corners=[0,2,6,8];
    c.solutions[0].answers[0].options=['cell'+corners[seed%4]];
  }
  if (family==='diagram') c.connections=[{from:'t',to:'u'}];
  if (type==='resolver_restricciones') c.rules=[{kind:'different',a:'',b:'',value:0},{kind:'before',a:'a',b:'b',value:0}];
  if (family==='expression') {
    // Build a bank with a proven two-operation solution and no one-operation shortcut.
    const choices=[];
    for(let a=3;a<=9;a++)for(let b=a+1;b<=12;b++)for(let d=2;d<=9;d++){
      if(d===a||d===b)continue;
      const goal=a*b-d;
      for(let extra=2;extra<=12;extra++){
        const numbers=[a,b,d,extra];
        if(new Set(numbers).size!==4||goal<=Math.max(...numbers))continue;
        if(numbers.some(x=>numbers.some(y=>[x+y,x-y,x*y,x/y].some(n=>Math.abs(n-goal)<1e-8))))continue;
        choices.push({numbers,goal});break;
      }
    }
    const chosen=choices[seed%choices.length];
    c.options=[...chosen.numbers.map((n,i)=>({id:'n'+i,label:String(n),value:n,x:0,y:0})),...['+','−','×','÷'].map((label,i)=>({id:'op'+i,label,value:0,x:0,y:0}))];
    c.maximum=5;c.goal=chosen.goal;
    c.solutions[0].answers[0].options=['n0','op2','n1','op1','n2'];
  }
  if (family==='balance') c.goal=c.options[0].value+c.options[1].value;
  const issues=engine.authoringIssues(type,c);
  if(issues.length)throw Error(`Plantilla local ${type}: ${issues.join(' · ')}`);
  return c;
}
export function contentDocument(value) {
  const template=structuredClone(value), fields=[];
  const visit=(node,path=[])=>{
    if(typeof node==='string' && node.startsWith(CONTENT_SLOT)) {
      const id='f'+String(fields.length+1).padStart(5,'0');fields.push({id,path});return `[[${id}]]`;
    }
    if(Array.isArray(node))return node.map((v,i)=>visit(v,[...path,i]));
    if(node && typeof node==='object')return Object.fromEntries(Object.entries(node).map(([k,v])=>[k,visit(v,[...path,k])]));
    return node;
  };
  const annotated=visit(template);
  return {template:annotated,fields};
}
export function contentInstructions(document) {
  const firstId = document.fields[0]?.id || '(ninguno)';
  const lastId = document.fields.at(-1)?.id || '(ninguno)';
  return [
    `Debes entregar exactamente ${document.fields.length} bloques: desde ${firstId} hasta ${lastId}, siguiendo la lista de CAMPOS DE TEXTO. Distribuye tu respuesta para llegar al último campo: etiquetas breves, metadatos concisos y explicaciones suficientes en los campos pedagógicos. Comprueba todos los IDs antes de terminar; no sustituyas campos pendientes con un resumen.`,
    'PigPen YA construyó el JSON. Es de sólo lectura: no devuelvas JSON, estructuras, IDs de opciones, arrays, soluciones ni reglas. Redacta únicamente el texto de cada campo [[fNNNNN]], respetando las respuestas y constantes fijadas en la plantilla. No cambies la solución para adaptarla a tu texto: diseña el caso y los distractores para que esa solución sea correcta.',
    `Devuelve cada campo exactamente una vez usando este formato literal (el contenido admite comillas y varias líneas sin escapes):\n<<<FIELD f00001>>>\nTexto del campo\n<<<END>>>\nContinúa con el siguiente ID hasta ${lastId}. No uses bloques de código Markdown (\`\`\` ni \`\`\`markdown). No escribas saludos, comentarios ni despedidas fuera de los bloques: empieza directamente con <<<FIELD ${firstId}>>> y termina cerrando con <<<END>>> en ${lastId}. No omitas campos. No copies marcadores en el contenido.`,
    `PLANTILLA LOCAL INMUTABLE: ${JSON.stringify(document.template)}`,
    `CAMPOS DE TEXTO:\n${document.fields.map(f=>f.id+' = '+f.path.join('.')).join('\n')}`
  ].join('\n');
}
export function fillContentDocument(document, response) {
  let text = String(response ?? '').trim();
  text = text.replace(/^\s*`{3,}(?:markdown|text|json)?\s*\n?/i, '').replace(/\n?\s*`{3,}\s*$/i, '').trim();
  const values = new Map();
  const block = /<{2,4}\s*FIELD\s+(f\d{5,})\s*>{2,4}\s*([\s\S]*?)\s*<{2,4}\s*(?:END|\/FIELD)\s*>{2,4}/gi;
  let cursor = 0, match;
  while ((match = block.exec(text))) {
    if (text.slice(cursor, match.index).trim()) throw Error('La IA devolvió contenido fuera de los campos de texto. La plantilla local se conserva.');
    const fieldId = match[1].toLowerCase();
    if (values.has(fieldId)) throw Error(`Campo de texto duplicado: ${fieldId}`);
    if (!match[2].trim() || /\[\[f\d+\]\]|<{2,4}\s*(?:FIELD|END|\/FIELD)/i.test(match[2])) throw Error(`Campo de texto incompleto: ${fieldId}`);
    values.set(fieldId, match[2].trim());
    cursor = block.lastIndex;
  }
  const remaining = text.slice(cursor).trim();
  if (remaining) {
    const cleanRemaining = remaining.replace(/^`{3,}\s*$/g, '').replace(/^---+$/g, '').trim();
    if (cleanRemaining) throw Error('La respuesta de texto está incompleta o contiene bloques inválidos. La plantilla local se conserva.');
  }
  const expected = new Set(document.fields.map(f => f.id.toLowerCase()));
  const missing = document.fields.filter(f => !values.has(f.id.toLowerCase()));
  if (missing.length) throw Error(`Faltan ${missing.length} campos de texto: ${missing.slice(0, 5).map(f => f.path.join('.')).join(', ')}. La plantilla local se conserva.`);
  if ([...values.keys()].some(id => !expected.has(id))) throw Error('La IA devolvió campos de texto no solicitados.');
  const result = structuredClone(document.template);
  for (const field of document.fields) {
    let parent = result;
    for (const key of field.path.slice(0, -1)) parent = parent[key];
    parent[field.path.at(-1)] = values.get(field.id.toLowerCase());
  }
  return result;
}
