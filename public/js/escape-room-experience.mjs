/** Pure, self-contained engine shared by the author, preview and offline package. */
export function createExperienceEngine() {
  const classics = [
    ['texto','Respuesta exacta'], ['opcion_multiple','Opción múltiple'], ['relacion_columnas','Relación de columnas'],
    ['drag_drop','Drag & Drop'], ['multimedia','Multimedia'], ['verdadero_falso','Verdadero / falso'],
    ['ordenar_secuencia','Ordenar secuencia'], ['completar_espacio','Completar lectura']
  ];
  const definitions = [
    ['seleccion_multiple','Selección de varias respuestas','multi','Marca todas las opciones que cumplen la condición.'],
    ['respuesta_justificacion','Respuesta + justificación','slots','Elige una conclusión y la razón que la explica.'],
    ['marcar_evidencia','Marcar evidencia','evidence','Señala los fragmentos que demuestran la conclusión.'],
    ['clasificar_grupos','Clasificación en grupos','slots','Asigna cada elemento a una categoría; pueden repetirse categorías.'],
    ['matriz_deduccion','Matriz de deducción','matrix','Relaciona elementos mediante pistas y descartes.'],
    ['completar_patron','Completar un patrón','slots','Completa los huecos de una sucesión aplicando su regla.'],
    ['construir_expresion','Construir una expresión matemática','expression','Sólo para objetivos que requieran cálculos. Para mensajes o relaciones conceptuales, usa Construir una solución con piezas.'],
    ['construir_solucion','Construir una solución con piezas','slots','Deduce y combina piezas de texto para construir un mensaje, explicación o relación; incluye distractores.'],
    ['ubicar_escala','Ubicar en una escala','scale','Sitúa cada marcador en un valor de la escala.'],
    ['corregir_error','Seleccionar y sustituir el error','slots','Selecciona el fragmento erróneo y su sustitución.'],
    ['predecir_resultado','Predicción de resultados','single','Selecciona el estado resultante de un cambio.'],
    ['completar_analogia','Analogías incompletas','slots','Completa una relación entre conceptos.'],
    ['seleccionar_contraejemplo','Seleccionar un contraejemplo','single','Elige el caso que contradice una afirmación general.'],
    ['comparar_atributos','Comparar por atributos','attributes','Marca todas las propiedades de cada elemento.'],
    ['completar_diagrama','Completar un diagrama','diagram','Completa los nodos y conexiones del esquema.'],
    ['resolver_restricciones','Resolver restricciones','slots','Distribuye elementos cumpliendo todas las condiciones.'],
    ['informacion_suficiente','Seleccionar información suficiente','multi','Selecciona un conjunto mínimo de datos suficientes.'],
    ['respuesta_coordenadas','Respuesta por coordenadas','coordinates','Localiza una celda a partir de sus coordenadas.'],
    ['balancear_cantidades','Balancear cantidades','balance','Ajusta las cantidades hasta cumplir la igualdad o proporción.']
  ].map(([id,label,family,description]) => ({id,label,family,description}));
  const rewards = [
    ['letras','Letras o fragmentos del código'], ['imagen','Fragmentos de imagen'], ['simbolos','Símbolos cifrados'],
    ['coordenadas','Coordenadas'], ['posiciones','Pistas de posición'], ['patron','Piezas de clave visual']
  ].map(([id,label]) => ({id,label}));
  const extras = [['descarte','Comodín de descarte'],['comprobacion','Comodín de comprobación'],['pista','Pista adicional'],['coleccionable','Coleccionable'],['personalizacion','Personalización']].map(([id,label]) => ({id,label}));
  const types = [...classics.map(([id]) => id), ...definitions.map(d => d.id)];
  const get = id => definitions.find(d => d.id === id);
  const copy = value => JSON.parse(JSON.stringify(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
  const stable = value => JSON.stringify(Object.keys(value || {}).filter(k=>!k.startsWith('_')).sort().map(k => [k,[...(value[k] || [])].sort()]));
  function config(value = {}) {
    return {version:1, question_types: Array.isArray(value.question_types) ? [...new Set(value.question_types.filter(id => types.includes(id)))] : classics.map(([id]) => id),
      primary_reward: rewards.some(r => r.id === value.primary_reward) ? value.primary_reward : 'letras',
      extras: Array.isArray(value.extras) ? extras.filter(r => value.extras.includes(r.id)).map(r => r.id) : [], bonus_rule:'perfect_room',...(Number.isFinite(value.reward_image_aspect)&&value.reward_image_aspect>0?{reward_image_aspect:value.reward_image_aspect}:{}),reward_image_alt:typeof value.reward_image_alt==='string'?value.reward_image_alt:'', ...(typeof value.reward_image === 'string' && /^(?:data:image\/(?:png|jpeg|webp);base64,|https:\/\/|assets\/)/.test(value.reward_image) ? {reward_image:value.reward_image} : {})};
  }
  function configIssues(value) { return config(value).question_types.length ? [] : ['Selecciona al menos un tipo de pregunta.']; }
  function requirements(type) {
    const family = get(type)?.family;
    const one = ['single','multi','evidence','expression','coordinates'].includes(family);
    const two = ['respuesta_justificacion','corregir_error'].includes(type);
    if(type==='construir_solucion')return {family,targetMin:3,targetMax:3,optionMin:6,optionMax:36,numericOptions:false,coordinateOptions:false,positionedTargets:false,selectionMinimum:false,tokenMaximum:false,goal:false};
    return { family, targetMin: two ? 2 : 1, targetMax: one ? 1 : two ? 2 : 12,
      optionMin: type === 'seleccion_multiple' ? 4 : type === 'completar_patron' ? 3 : 2,
      optionMax: type === 'seleccion_multiple' ? 8 : 36,
      numericOptions: ['balance','scale'].includes(family), coordinateOptions: family === 'coordinates',
      positionedTargets: family === 'diagram', selectionMinimum: ['multi','evidence'].includes(family),
      tokenMaximum: ['expression','balance'].includes(family), goal: ['expression','balance'].includes(family) };
  }
  function normalizeContract(value, type) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const c = copy(value);
    if (get(type)) {
      const r = requirements(type);
      if (!own(c,'connections') && !r.positionedTargets) c.connections = [];
      if (!own(c,'rules') && type !== 'resolver_restricciones') c.rules = [];
      if (!own(c,'minimum') && !r.selectionMinimum) c.minimum = 1;
      if (!own(c,'maximum') && !r.tokenMaximum) c.maximum = 12;
      if (!own(c,'goal') && !r.goal) c.goal = 0;
      if (Array.isArray(c.targets)) for (const t of c.targets) if(t && typeof t === 'object' && !own(t,'allowed')) t.allowed = [];
    }
    if (!structuralIssues(type,c).length && get(type)) {
      if (type === 'seleccion_multiple') c.targets.forEach(t => { t.allowed = []; });
      if (get(type)?.family === 'slots') for (const t of c.targets) {
        const minimumWrong = type === 'completar_patron' ? 2 : 1;
        const correct = new Set(c.solutions.flatMap(s=>s.answers.filter(a=>a.target===t.id).flatMap(a=>a.options)));
        const wrong = list => list.filter(o=>!correct.has(o.id)).length;
        if (wrong(optionList(c,t)) < minimumWrong && wrong(c.options) >= minimumWrong) t.allowed = [];
      }
    }
    return c;
  }
  function solutionState(solution) { return Object.fromEntries((solution?.answers || []).map(a => [a.target, [...a.options]])); }
  function optionList(c, target, type) { if (type === 'seleccion_multiple') return c.options; return c.options.filter(o => !target.allowed?.length || target.allowed.includes(o.id)); }
  function structuralIssues(type, c) {
    if (!get(type)) return [];
    if (!c || c.version !== 1) return ['Falta interaction_data versión 1.'];
    const issues = [];
    if (!Array.isArray(c.options) || c.options.length < 2 || c.options.length > 36) return ['Define entre 2 y 36 opciones.'];
    if (!Array.isArray(c.targets) || !c.targets.length || c.targets.length > 12) return ['Define entre 1 y 12 destinos.'];
    if (c.options.some(o=>!o || typeof o !== 'object') || c.targets.some(t=>!t || typeof t !== 'object' || !Array.isArray(t.allowed))) return ['Opciones o destinos inválidos.'];
    const ids = c.options.map(o => o.id), tids = c.targets.map(t => t.id);
    const safeId = id => typeof id === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(id);
    if (ids.some(id => !safeId(id)) || new Set(ids).size !== ids.length || c.options.some(o => typeof o.label !== 'string' || !o.label.trim())) issues.push('Las opciones necesitan ID y etiqueta únicos y válidos.');
    if (tids.some(id => !safeId(id)) || new Set(tids).size !== tids.length || c.targets.some(t => typeof t.label !== 'string' || !t.label.trim())) issues.push('Los destinos necesitan ID y etiqueta válidos.');
    c.targets.forEach(t => { if (!Array.isArray(t.allowed) || t.allowed.some(id => !ids.includes(id))) issues.push('Un destino referencia opciones desconocidas.'); });
    if (!Array.isArray(c.solutions) || !c.solutions.length || c.solutions.length > 64) return [...issues,'Define entre 1 y 64 soluciones verificadas.'];
    const family = get(type).family;
    if (typeof c.instructions !== 'string' || !c.instructions.trim()) issues.push('Faltan las instrucciones y datos públicos del ejercicio.');
    if (['single','multi','evidence','expression','coordinates'].includes(family) && tids.length !== 1) issues.push('Este tipo utiliza exactamente un destino.');
    if (['respuesta_justificacion','corregir_error'].includes(type) && tids.length !== 2) issues.push('Este tipo requiere exactamente dos destinos.');
    if (type === 'construir_solucion' && (tids.length!==3 || ids.length<6)) issues.push('Construir una solución requiere tres partes y al menos seis piezas.');
    if (family === 'balance' && (!Number.isFinite(c.goal) || c.options.some(o => !Number.isFinite(o.value)))) issues.push('Balance requiere valores numéricos y un objetivo.');
    if (family === 'expression' && (!Number.isFinite(c.goal) || c.options.some(o => !/^(?:-?\d+(?:\.\d+)?|[+*/()−×÷-])$/.test(o.label)))) issues.push('Expresión requiere fichas numéricas y operadores seguros y un objetivo.');
    if (family === 'scale' && c.options.some(o => !Number.isFinite(o.value))) issues.push('La escala requiere valores numéricos.');
    if (family === 'coordinates' && c.start_option && !ids.includes(c.start_option)) issues.push('La referencia inicial no existe en el mapa.');
    if (family === 'coordinates' && (c.options.some(o => !Number.isInteger(o.x) || !Number.isInteger(o.y)) || new Set(c.options.map(o => o.x+':'+o.y)).size !== ids.length)) issues.push('Cada celda necesita coordenadas únicas.');
    if (family === 'diagram' && c.targets.some(t => !Number.isFinite(t.x) || !Number.isFinite(t.y) || t.x < 0 || t.x > 100 || t.y < 0 || t.y > 100)) issues.push('Los nodos requieren coordenadas de 0 a 100.');
    if (!Array.isArray(c.connections) || c.connections.some(e => !e || !tids.includes(e.from) || !tids.includes(e.to))) issues.push('Conexiones de diagrama inválidas.');
    if (issues.length) return issues;
    const ruleKinds = ['different','before','after','at','not_at','sum'];
    if (!Array.isArray(c.rules) || c.rules.some(r => !r || !ruleKinds.includes(r.kind) || (['before','after','at','not_at'].includes(r.kind) && (!ids.includes(r.a) || (['before','after'].includes(r.kind) && !ids.includes(r.b)))))) issues.push('Restricciones desconocidas.');
    if (type === 'resolver_restricciones' && !c.rules?.length) issues.push('Declara las restricciones comprobables.');
    if (issues.length) return issues;
    if (c.rules.some(r=>['at','not_at'].includes(r.kind) && (!Number.isInteger(r.value)||r.value<0||r.value>=tids.length))) issues.push('La posición de una restricción está fuera de los destinos.');
    if (c.rules.some(r=>r.kind==='sum' && (!Number.isFinite(r.value)||c.options.some(o=>!Number.isFinite(o.value))))) issues.push('La restricción de suma requiere valores numéricos finitos.');
    if (issues.length) return issues;
    c.solutions.forEach(s => {
      if (!s || !Array.isArray(s.answers) || s.answers.some(a=>!a || !Array.isArray(a.options))) {issues.push('Solución inválida.');return;}
      if (!Array.isArray(s.answers) || s.answers.length !== tids.length || new Set(s.answers.map(a => a.target)).size !== tids.length) { issues.push('Cada solución debe cubrir todos los destinos una sola vez.'); return; }
      for (const a of s.answers) {
        const t = c.targets.find(t => t.id === a.target);
        if (!t || !Array.isArray(a.options) || a.options.some(id => !ids.includes(id) || (t.allowed.length && !t.allowed.includes(id)))) { issues.push('Solución con referencias desconocidas.'); continue; }
        if (!['multi','evidence','attributes','expression','balance'].includes(family) && a.options.length !== 1) issues.push('Cada destino requiere una sola opción.');
        if (!['expression','balance'].includes(family) && new Set(a.options).size !== a.options.length) issues.push('Solución con selecciones repetidas.');
        if (a.options.length > 36 || (!a.options.length && family !== 'attributes' && family !== 'balance')) issues.push('Solución vacía o demasiado larga.');
      }
      const state = solutionState(s);
      if (['multi','evidence'].includes(family) && s.answers.some(a=>a.options.length<c.minimum)) issues.push('El mínimo de selección supera una solución declarada.');
      if (['expression','balance'].includes(family) && s.answers.reduce((n,a)=>n+a.options.length,0)>c.maximum) issues.push('La solución supera el máximo de fichas permitidas.');
      if (family === 'matrix' && new Set(s.answers.flatMap(a=>a.options)).size !== tids.length) issues.push('La matriz requiere una relación uno a uno, sin opciones repetidas entre filas.');
      if (family === 'expression' && !(Math.abs(expression(c, state) - c.goal) <= 1e-8)) issues.push('La expresión de solución no produce el objetivo.');
      if (family === 'balance' && Math.abs(balance(c, state) - c.goal) > 1e-8) issues.push('Las cantidades de solución no producen el objetivo.');
      if (c.rules.length && !rulesHold(c,state)) issues.push('La solución contradice las restricciones.');
    });
    if (family === 'multi' || family === 'evidence') {
      if (!Number.isInteger(c.minimum) || c.minimum < 1 || c.minimum > ids.length) issues.push('Indica el mínimo de selecciones.');
    }
    if (family === 'expression' || family === 'balance') {
      if (!Number.isInteger(c.maximum) || c.maximum < 1 || c.maximum > 36) issues.push('Indica un límite de 1 a 36 fichas.');
    }
    if (typeof c.extra_hint !== 'string' || !c.extra_hint.trim()) issues.push('Falta la pista adicional.');
    return [...new Set(issues)];
  }
  function authoringIssues(type, c) {
    const issues = structuralIssues(type,c);
    if (issues.length) return issues;
    if (get(type)?.family === 'slots') {
      const minChoices = type === 'completar_patron' ? 3 : 2;
      for (const target of c.targets) {
        const visible = optionList(c,target);
        const valid = new Set(c.solutions.flatMap(s=>s.answers.filter(a=>a.target===target.id).flatMap(a=>a.options)));
        if (visible.length < minChoices || (type !== 'resolver_restricciones' && visible.filter(o=>!valid.has(o.id)).length < minChoices - 1)) {
          issues.push(target.label + ': ofrece al menos ' + minChoices + ' alternativas visibles, con al menos ' + (minChoices-1) + ' distractores para este hueco. allowed no debe mostrar únicamente la solución.');
        }

      }
    }
    const family = get(type)?.family;
    if (['single','scale','diagram','coordinates','matrix','evidence'].includes(family)) {
      for (const target of c.targets) {
        const visible = optionList(c,target,type);
        const correct = new Set(c.solutions.flatMap(s=>s.answers.filter(a=>a.target===target.id).flatMap(a=>a.options)));
        if (visible.length < 2 || (['single','scale','diagram','coordinates','evidence'].includes(family) && !visible.some(o=>!correct.has(o.id)))) issues.push(target.label + ': faltan alternativas visibles que no sean la solución.');
      }
    }
    // Labels only need to be distinguishable within the same choice bank.
    // Evidence segments have documentary positions; coordinate cells display x/y.
    if (!['expression','balance','evidence','coordinates'].includes(family)) for (const target of c.targets) {
      const groups = new Map();
      for (const option of optionList(c,target,type)) {
        const label = option.label.trim().toLocaleLowerCase();
        groups.set(label,[...(groups.get(label)||[]),option]);
      }
      for (const group of groups.values()) if(group.length>1) issues.push(target.label + ': etiquetas indistinguibles en este banco: ' + JSON.stringify(group[0].label) + ' (IDs: ' + group.map(o=>o.id).join(', ') + '). Diferencia las alternativas o separa sus bancos mediante allowed.');
    }
    if (family==='scale' && new Set(c.options.map(o=>o.value)).size!==c.options.length) issues.push('La escala requiere posiciones numéricas distintas.');
    if (family==='coordinates' && new Set(c.options.map(o=>o.x)).size*new Set(c.options.map(o=>o.y)).size!==c.options.length) issues.push('La cuadrícula debe contener todas las celdas de su rectángulo.');
    if (family==='diagram' && c.targets.some((a,i)=>c.targets.some((b,j)=>i<j&&Math.hypot(a.x-b.x,a.y-b.y)<14))) issues.push('Los nodos del diagrama se superponen.');
    if (type==='informacion_suficiente') {
      const sets=c.solutions.map(s=>s.answers[0].options);
      if(sets.some((a,i)=>sets.some((b,j)=>i!==j&&b.length<a.length&&b.every(id=>a.includes(id))))) issues.push('Un conjunto suficiente contiene otro declarado; las soluciones deben ser mínimas.');
    }
    if (family === 'attributes') {
      const selectedOptionIds = new Set(c.solutions.flatMap(s => s.answers.flatMap(a => a.options)));
      for (const option of c.options) {
        if (!selectedOptionIds.has(option.id)) {
          issues.push(option.label + ': toda columna o propiedad debe estar seleccionada al menos en un elemento; no dejes columnas sin ninguna selección.');
        }
      }
      for (const target of c.targets) {
        const hasSelection = c.solutions.some(s => s.answers.some(a => a.target === target.id && a.options.length > 0));
        if (!hasSelection) {
          issues.push(target.label + ': cada elemento o fila debe tener al menos un atributo seleccionado.');
        }
      }
    }
    if (type !== 'seleccion_multiple') return [...new Set(issues)];
    const visible = optionList(c,c.targets[0],type);
    const correct = new Set(c.solutions.flatMap(s=>s.answers.flatMap(a=>a.options)));
    if (visible.length < 4 || visible.length > 8) issues.push('Selección de varias respuestas requiere entre 4 y 8 opciones visibles.');
    if (c.solutions.some(s=>s.answers[0].options.length < 2)) issues.push('Selección de varias respuestas requiere al menos 2 respuestas correctas por solución.');
    if (visible.filter(o=>!correct.has(o.id)).length < 2) issues.push('Añade al menos 2 distractores plausibles y visibles que no pertenezcan a ninguna solución. No pueden ser correctas todas las opciones.');
    const labels=visible.map(o=>o.label.trim().toLocaleLowerCase());
    if(new Set(labels).size!==labels.length) issues.push('Las opciones deben tener textos diferentes; no dupliques respuestas para completar el banco.');
    return issues;
  }
  function expression(c, state) {
    const tokens = (state[c.targets[0].id] || []).map(id => c.options.find(o => o.id === id)?.label.replace(/[×÷−]/g,v=>({'×':'*','÷':'/','−':'-'}[v])));
    let index = 0;
    function atom() { const t = tokens[index++]; if (t === '(') { const n = sum(); if (tokens[index++] !== ')') return NaN; return n; } return /^-?\d+(?:\.\d+)?$/.test(t || '') ? Number(t) : NaN; }
    function product() { let n = atom(); while (tokens[index] === '*' || tokens[index] === '/') { const op = tokens[index++], rhs = atom(); n = op === '*' ? n * rhs : rhs === 0 ? NaN : n / rhs; } return n; }
    function sum() { let n = product(); while (tokens[index] === '+' || tokens[index] === '-') { const op = tokens[index++], rhs = product(); n = op === '+' ? n + rhs : n - rhs; } return n; }
    if (!tokens.length || tokens.length > c.maximum) return NaN;
    const value = sum(); return index === tokens.length && Number.isFinite(value) ? value : NaN;
  }
  function balance(c,state) { return c.targets.reduce((sum,t) => sum + (state[t.id] || []).reduce((n,id)=>n+(c.options.find(o=>o.id===id)?.value ?? NaN),0),0); }
  function rulesHold(c,state) {
    const assigned = c.targets.flatMap(t => state[t.id] || []);
    const position = id => c.targets.findIndex(t => (state[t.id] || []).includes(id));
    return (c.rules || []).every(r => {
      if (r.kind === 'different') return new Set(assigned).size === assigned.length;
      if (r.kind === 'before') return position(r.a) >= 0 && position(r.b) >= 0 && position(r.a) < position(r.b);
      if (r.kind === 'after') return position(r.a) >= 0 && position(r.b) >= 0 && position(r.a) > position(r.b);
      if (r.kind === 'at') return position(r.a) === r.value;
      if (r.kind === 'not_at') return position(r.a) >= 0 && position(r.a) !== r.value;
      if (r.kind === 'sum') return Math.abs(balance(c,state)-r.value) < 1e-8;
      return false;
    });
  }
  function evaluate(type,c,state = {}) {
    if (structuralIssues(type,c).length) return 'invalid';
    const family = get(type).family;
    if (!state || typeof state !== 'object' || Array.isArray(state)) return 'unanswered';
    if (Object.keys(state).some(id => !id.startsWith('_') && !c.targets.some(t=>t.id===id))) return 'incorrect';
    for (const t of c.targets) {
      const selected = state[t.id] || [];
      if (!Array.isArray(selected) || selected.some(id=>!optionList(c,t,type).some(o=>o.id===id))) return 'incorrect';
      if (!['expression','balance'].includes(family) && new Set(selected).size !== selected.length) return 'incorrect';
      if (family === 'attributes' || family === 'balance') { if (!own(state,t.id)) return 'unanswered'; }
      else if (!selected.length) return 'unanswered';
      if (['multi','evidence'].includes(family) && selected.length < c.minimum) return 'unanswered';
      if (!['multi','evidence','attributes','expression','balance'].includes(family) && selected.length !== 1) return 'incorrect';
    }
    if (['expression','balance'].includes(family) && Object.values(state).flat().length > c.maximum) return 'incorrect';
    if (family==='matrix' && c.targets.some(t=>(state[t.id]||[]).some(id=>(state._excluded?.[t.id]||[]).includes(id)))) return 'incorrect';
    if (!rulesHold(c,state)) return 'incorrect';
    if (family === 'expression') { const n = expression(c,state); return !Number.isFinite(n) ? 'unanswered' : Math.abs(n-c.goal)<1e-8 ? 'correct' : 'incorrect'; }
    if (family === 'balance') return Math.abs(balance(c,state)-c.goal)<1e-8 ? 'correct' : 'incorrect';
    if (type === 'resolver_restricciones') return 'correct';
    return c.solutions.some(s=>stable(solutionState(s))===stable(state)) ? 'correct' : 'incorrect';
  }
  function answerText(type,c) {
    if (!c?.solutions) return '';
    return c.solutions.map(s=>s.answers.map(a=>(c.targets.find(t=>t.id===a.target)?.label || a.target)+': '+a.options.map(id=>c.options.find(o=>o.id===id)?.label || id).join(', ')).join(' · ')).join(' / ');
  }
  function render(type,c,state={},key='',locale='es') {
    if (structuralIssues(type,c).length) return '<p role="alert">'+esc(ui(locale,'invalid'))+'</p>';
    const family=get(type).family;
    if (!['evidence','scale','coordinates'].includes(family)) {
      const rank = id => [...key+'|'+id].reduce((h,ch)=>Math.imul(h ^ ch.charCodeAt(0),16777619)>>>0,2166136261);
      c={...c,options:[...c.options].sort((a,b)=>rank(a.id)-rank(b.id))};
    }
    const attr=(target,option,action='toggle')=>' data-exp-key="'+esc(key)+'" data-exp-target="'+esc(target)+'" data-exp-option="'+esc(option)+'" data-exp-action="'+action+'"';
    const button=(t,o,action='toggle')=>'<button type="button" class="exp-option'+((state[t.id]||[]).includes(o.id)?' is-selected':'')+'"'+attr(t.id,o.id,action)+' aria-pressed="'+((state[t.id]||[]).includes(o.id))+'">'+esc(o.label)+'</button>';
    let body='';
    if (family==='matrix'||family==='attributes') {
      body='<div class="exp-table-scroll"><table class="exp-matrix"><thead><tr><th></th>'+c.options.map(o=>'<th scope="col">'+esc(o.label)+'</th>').join('')+'</tr></thead><tbody>'+c.targets.map(t=>'<tr><th scope="row">'+esc(t.label)+'</th>'+c.options.map(o=>'<td>'+((!t.allowed.length||t.allowed.includes(o.id))?'<button type="button"'+attr(t.id,o.id)+' aria-label="'+esc(t.label+' / '+o.label)+'" aria-pressed="'+((state[t.id]||[]).includes(o.id))+'">'+((state[t.id]||[]).includes(o.id)?'✓':(state._excluded?.[t.id]||[]).includes(o.id)?'×':'·')+'</button>':'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
      if(family==='attributes') body+='<button type="button"'+attr('','','mark')+'>'+esc(ui(locale,'markReviewed'))+'</button>';
    } else if(family==='expression'||family==='balance') {
      body=c.targets.map(t=>'<fieldset><legend>'+esc(t.label)+'</legend><div class="exp-tray">'+optionList(c,t,type).map(o=>button(t,o,'append')).join('')+'</div><output class="exp-built">'+esc((state[t.id]||[]).map(id=>c.options.find(o=>o.id===id)?.label).join(' '))+'</output><button type="button"'+attr(t.id,'','undo')+'>'+esc(ui(locale,'undo'))+'</button></fieldset>').join('');
          if(family==='balance')body+='<button type="button"'+attr('','','mark')+'>'+esc(ui(locale,'verify'))+' · 0</button>';
    } else if(family==='coordinates') {
      const t=c.targets[0], rows=[...new Set(c.options.map(o=>o.y))].sort((a,b)=>a-b);
      const columns=[...new Set(c.options.map(o=>o.x))].sort((a,b)=>a-b);
      const chosen=c.options.find(o=>(state[t.id]||[]).includes(o.id));
      body='<p class="exp-coordinate-help">'+esc(ui(locale,'axes'))+(c.start_option?' '+esc(ui(locale,'coordinateStartHint')):'')+'</p><div class="exp-table-scroll"><table class="exp-matrix" aria-label="'+esc(ui(locale,'axes'))+'"><thead><tr><th scope="col">y ↓ / x →</th>'+columns.map(x=>'<th scope="col">'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(y=>'<tr><th scope="row">'+y+'</th>'+c.options.filter(o=>o.y===y).sort((a,b)=>a.x-b.x).map(o=>{const isStart=c.start_option===o.id,selected=(state[t.id]||[]).includes(o.id),accessibleLabel=o.label+' ('+o.x+', '+o.y+')'+(isStart?', '+ui(locale,'start'):'');return '<td'+(isStart?' class="exp-start"':'')+'><button type="button" class="exp-option exp-coordinate-cell'+(selected?' is-selected':'')+(isStart?' is-start':'')+'"'+attr(t.id,o.id)+' aria-label="'+esc(accessibleLabel)+'" aria-pressed="'+selected+'"><span class="exp-coordinate-cell-label">'+esc(o.label)+'</span><span class="exp-coordinate-cell-pair">('+o.x+', '+o.y+')</span>'+(isStart?'<span class="exp-start-indicator" aria-hidden="true">'+esc(ui(locale,'start'))+'</span>':'')+'</button></td>';}).join('')+'</tr>').join('')+'</tbody></table></div><output aria-live="polite">'+esc(chosen?ui(locale,'selectedCell')+' ('+chosen.x+', '+chosen.y+')':'')+'</output>';
    } else if(family==='diagram') {
      const marker='arrow-'+String(key).replace(/[^a-zA-Z0-9_-]/g,'_');
      const diagramHeight=Math.max(440,...c.targets.map(t=>(t.label+' '+(state[t.id]||[]).map(id=>c.options.find(o=>o.id===id)?.label||'').join(' ')).length*7));
      body='<div class="exp-diagram-live" style="min-height:'+diagramHeight+'px"><svg class="exp-diagram-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><marker id="'+marker+'" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10" fill="currentColor"/></marker></defs>'+(c.connections||[]).map(e=>{const a=c.targets.find(t=>t.id===e.from),b=c.targets.find(t=>t.id===e.to);return '<line x1="'+a.x+'" y1="'+a.y+'" x2="'+(b.x+(a.x-b.x)*.25)+'" y2="'+(b.y+(a.y-b.y)*.25)+'" stroke="currentColor" stroke-width=".5" marker-end="url(#'+marker+')"/>';}).join('')+'</svg>'+c.targets.map((t,i)=>{const label=(state[t.id]||[]).map(id=>c.options.find(o=>o.id===id)?.label||'').join(', ');return '<div class="exp-diagram-node'+(label?' is-filled':'')+'" style="left:'+t.x+'%;top:'+t.y+'%" role="status"><strong>'+esc((i+1)+'. '+t.label)+'</strong><span>'+esc(label||'—')+'</span></div>';}).join('')+'</div>'+c.targets.map((t,i)=>'<fieldset><legend>'+(i+1)+'. '+esc(t.label)+'</legend><div class="exp-tray">'+optionList(c,t,type).map(o=>button(t,o)).join('')+'</div></fieldset>').join('');
    } else {
      body=c.targets.map(t=>'<fieldset><legend>'+esc(t.label)+'</legend><div class="exp-tray'+(family==='scale'?' exp-scale':'')+'">'+(family==='scale'?[...optionList(c,t,type)].sort((a,b)=>a.value-b.value):optionList(c,t,type)).map(o=>button(t,family==='evidence'?{...o,label:(c.options.findIndex(item=>item.id===o.id)+1)+'. '+o.label}:o)).join('')+'</div></fieldset>').join('');
    }
    if(type==='construir_solucion')body='<output class="exp-built" aria-live="polite">'+c.targets.map((t,i)=>'<span>'+esc((i+1)+'. '+t.label)+': '+esc((state[t.id]||[]).map(id=>c.options.find(o=>o.id===id)?.label||'').join(' ')||'—')+'</span>').join(' → ')+'</output>'+body;
    return '<div class="exp-question exp-type-'+esc(type)+'" data-exp-board="'+esc(key)+'"><p>'+esc(c.instructions)+'</p>'+body+'</div>';
  }
  function act(type,c,state={},target,option,action) {
    const next=copy(state),family=get(type)?.family,t=c.targets.find(t=>t.id===target);
    if(action==='mark'&&['attributes','balance'].includes(family)) {c.targets.forEach(t=>next[t.id] ||= []); return next;}
    if(!t)return next;
    const values=next[target] || [];
    if(action==='undo'){next[target]=values.slice(0,-1);return next;}
    if(!optionList(c,t,type).some(o=>o.id===option))return next;
    if(action==='append'){if(Object.values(next).filter(Array.isArray).flat().length<c.maximum)next[target]=[...values,option];return next;}
    if(family==='matrix'){next._excluded ||= {};const excluded=next._excluded[target] ||= [];if(values.includes(option)){next[target]=[];next._excluded[target]=[...excluded,option];}else if(excluded.includes(option))next._excluded[target]=excluded.filter(id=>id!==option);else next[target]=[option];return next;}
    if(['multi','evidence','attributes'].includes(family))next[target]=values.includes(option)?values.filter(id=>id!==option):[...values,option];
    else next[target]=values.includes(option)?[]:[option];
    return next;
  }
  const translations={
    es:{aid:'Comodín',rewardPending:'Recompensa visual pendiente',axes:'Par (x, y): x es la columna, de izquierda a derecha; y es la fila, de arriba hacia abajo.',coordinateStartHint:'La casilla marcada «Inicio» indica desde dónde comenzar.',start:'Inicio',selectedCell:'Celda seleccionada',invalid:'Esta pregunta necesita reparación.',undo:'Deshacer',markReviewed:'Confirmar filas sin atributos',empty:'Completa la respuesta antes de comprobar.',inventory:'Recompensas',perfect:'¡Sala perfecta!',earned:'Recompensa obtenida',bonus:'Premios adicionales',use:'Usar',partial:'Selecciona una parte de tu respuesta para comprobarla.',correct:'Correcto',incorrect:'Revisa esta parte',final:'Desafío final',verify:'Comprobar',hint:'Pista adicional',decode:'Utiliza las recompensas de las salas para construir el código.',image:'Reconstruye la imagen y elige el código que revela.',pattern:'Reproduce el patrón de las salas en orden.',none:'Todavía no hay recompensas.',collected:'Colección',personalize:'Personalización',cancel:'Cerrar',next:'Continuar'},
    en:{aid:'Bonus aid',rewardPending:'Visual reward pending',axes:'Pair (x, y): x is the column from left to right; y is the row from top to bottom.',coordinateStartHint:'The cell marked “Start” shows where to begin.',start:'Start',selectedCell:'Selected cell',invalid:'This question needs repair.',undo:'Undo',markReviewed:'Confirm rows with no attributes',empty:'Complete your answer before checking.',inventory:'Rewards',perfect:'Perfect room!',earned:'Reward earned',bonus:'Bonus rewards',use:'Use',partial:'Select part of your answer to check.',correct:'Correct',incorrect:'Review this part',final:'Final challenge',verify:'Check',hint:'Extra hint',decode:'Use your room rewards to build the code.',image:'Rebuild the image and choose the code it reveals.',pattern:'Reproduce the room patterns in order.',none:'No rewards yet.',collected:'Collection',personalize:'Personalization',cancel:'Close',next:'Continue'},
    fr:{aid:'Aide bonus',rewardPending:'Récompense visuelle en attente',axes:'Paire (x, y) : x indique la colonne de gauche à droite ; y indique la ligne du haut vers le bas.',coordinateStartHint:'La case marquée « Départ » indique où commencer.',start:'Départ',selectedCell:'Case sélectionnée',invalid:'Cette question doit être réparée.',undo:'Annuler',markReviewed:'Confirmer les lignes sans attribut',empty:'Complétez la réponse avant de vérifier.',inventory:'Récompenses',perfect:'Salle parfaite !',earned:'Récompense obtenue',bonus:'Bonus',use:'Utiliser',partial:'Sélectionnez une partie à vérifier.',correct:'Correct',incorrect:'Revoyez cette partie',final:'Défi final',verify:'Vérifier',hint:'Indice supplémentaire',decode:'Utilisez les récompenses pour composer le code.',image:'Reconstituez l’image et choisissez le code.',pattern:'Reproduisez les motifs dans l’ordre.',none:'Aucune récompense.',collected:'Collection',personalize:'Personnalisation',cancel:'Fermer',next:'Continuer'},
    pt:{aid:'Ajuda extra',rewardPending:'Recompensa visual pendente',axes:'Par (x, y): x indica a coluna da esquerda para a direita; y indica a linha de cima para baixo.',coordinateStartHint:'A célula marcada “Início” mostra por onde começar.',start:'Início',selectedCell:'Célula selecionada',invalid:'Esta pergunta precisa de reparo.',undo:'Desfazer',markReviewed:'Confirmar linhas sem atributos',empty:'Complete a resposta antes de verificar.',inventory:'Recompensas',perfect:'Sala perfeita!',earned:'Recompensa obtida',bonus:'Prêmios extras',use:'Usar',partial:'Selecione uma parte para verificar.',correct:'Correto',incorrect:'Revise esta parte',final:'Desafio final',verify:'Verificar',hint:'Dica extra',decode:'Use as recompensas para montar o código.',image:'Reconstrua a imagem e escolha o código.',pattern:'Reproduza os padrões na ordem.',none:'Ainda não há recompensas.',collected:'Coleção',personalize:'Personalização',cancel:'Fechar',next:'Continuar'}
  };
  const bonusMessages = {
    es: ['No tienes ayudas disponibles para esta pregunta. Se ganan al completar una sala al primer intento y sin ayudas.', 'Completa una parte de la respuesta y vuelve a pulsar Comprobar una parte. No se ha gastado el comodín.', 'Descartar una opción', 'Comprobar una parte', 'Pista adicional'],
    en: ['No bonus aids are available for this question. Earn them by completing a room on the first attempt without help.', 'Fill in part of your answer, then select Check one part. No aid has been spent.', 'Remove one option', 'Check one part', 'Extra hint'],
    fr: ['Aucune aide disponible pour cette question. Terminez une salle au premier essai sans aide pour en gagner.', 'Complétez une partie de la réponse, puis vérifiez-la. Aucune aide utilisée.', 'Éliminer une option', 'Vérifier une partie', 'Indice supplémentaire'],
    pt: ['Não há ajudas disponíveis para esta pergunta. Complete uma sala na primeira tentativa sem ajuda para ganhá-las.', 'Preencha uma parte da resposta e verifique-a. Nenhuma ajuda foi gasta.', 'Eliminar uma opção', 'Verificar uma parte', 'Dica extra']
  };
  Object.entries(bonusMessages).forEach(([lang, values]) => ['bonusEmpty','partialEmpty','bonus_descarte','bonus_comprobacion','bonus_pista'].forEach((key,i) => translations[lang][key] = values[i]));
  Object.entries({es:'Se ha usado 1 comodín. Tu respuesta no se ha modificado.',en:'1 aid used. Your answer has not been changed.',fr:'1 aide utilisée. Votre réponse reste inchangée.',pt:'1 ajuda usada. Sua resposta não foi alterada.'}).forEach(([lang,text])=>translations[lang].partialSpent=text);
  function ui(locale,key){return (translations[String(locale).split('-')[0]]||translations.en)[key]||key;}
  function metrics(value={}){return {discarded:value.discarded||{},answers:value.answers||{},attempts:value.attempts||{},assisted:value.assisted||{},awarded:value.awarded||{},inventory:value.inventory||{},customization:value.customization||'',final:value.final||{}};}
  function recordAttempt(progress,key,result){if(result==='unanswered'||result==='invalid')return;progress.attempts[key]=(progress.attempts[key]||0)+1;}
  function award(progress,mission,cfg){if(progress.awarded[mission.id])return progress.awarded[mission.id];const perfect=mission.preguntas.length>0&&mission.preguntas.every(q=>progress.attempts[mission.id+'::'+q.id]===1&&!progress.assisted[mission.id+'::'+q.id]);const received=perfect?config(cfg).extras:[];received.forEach(id=>progress.inventory[id]=(progress.inventory[id]||0)+1);return progress.awarded[mission.id]={perfect,extras:received};}
  return {classics,definitions,types,rewards,extras,get,requirements,config,configIssues,normalizeContract,structuralIssues,authoringIssues,evaluate,solutionState,answerText,render,act,esc,ui,metrics,recordAttempt,award,expression,rulesHold};
}
export const experience = createExperienceEngine();
export const EXPERIENCE_CSS = `
dialog.question-hint-dialog{width:min(460px,calc(100vw - 32px));max-height:calc(100dvh - 48px);box-sizing:border-box;padding:0;border:1px solid var(--line,#8886);border-radius:16px;background:var(--panel,#18202c);color:var(--text,#eef3fc);box-shadow:0 24px 80px #0007;overflow:auto}dialog.question-hint-dialog::backdrop{background:#0009;backdrop-filter:blur(4px)}.question-hint-dialog header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:16px 18px;border-bottom:1px solid var(--line,#8886)}.question-hint-dialog h2{margin:0;font-size:18px;color:inherit}.question-hint-dialog header p{margin:4px 0 0;font-size:12px;opacity:.72}.question-hint-dialog [data-hint-close]{display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;min-height:36px;padding:0;border-radius:50%;font-size:24px;line-height:1}.question-hint-dialog #questionHintText{padding:20px;font-size:16px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere}.question-hint-dialog button:focus-visible{outline:2px solid var(--accent,#fbbf24);outline-offset:3px}
 .question-actions.button-row{display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:10px}.question-actions.button-row>button.question-hint-icon{display:inline-grid;place-items:center;flex:0 0 44px;width:44px;height:44px;min-width:44px;min-height:44px;padding:0!important;border-radius:50%!important}.question-hint-icon svg{width:22px;height:22px;pointer-events:none}.question-actions.button-row .exp-bonus-tray{display:flex;flex-flow:row wrap;align-items:center;flex:0 0 auto;gap:10px;padding:0;margin:0}.question-actions.button-row>button[data-question-verify]{flex:0 1 auto;width:auto;margin-right:0}
button.exp-bonus-icon{position:relative;display:inline-grid;place-items:center;flex:0 0 44px;width:44px;height:44px;min-width:44px;min-height:44px;padding:0!important;border-radius:50%!important;border:1px solid #fff8!important;background:#fbbf24!important;color:#172033!important;box-shadow:0 3px 12px #0003;overflow:visible;cursor:pointer}button.exp-bonus-icon svg{width:23px;height:23px;pointer-events:none}.exp-bonus-count{position:absolute;right:-3px;top:-4px;min-width:17px;height:17px;padding:0 3px;border-radius:12px;background:#172033;color:#fff;font:600 10px/17px system-ui;text-align:center;border:1px solid #fff9;pointer-events:none}button.exp-bonus-icon:disabled{opacity:.38;filter:grayscale(1);cursor:not-allowed;box-shadow:none}button.exp-bonus-icon:focus-visible{outline:3px solid #fff;outline-offset:4px}.exp-bonus-tray{padding:6px 2px;gap:12px}button.exp-bonus-icon.exp-bonus-glow:not(:disabled)::before{content:"";position:absolute;inset:-5px;border-radius:50%;border:2px solid #fcd34d;pointer-events:none;animation:exp-bonus-spotlight 1.1s ease-out 2}@keyframes exp-bonus-spotlight{0%{transform:scale(.9);opacity:0;box-shadow:0 0 0 #fcd34d}25%{opacity:.9;box-shadow:0 0 22px #fcd34d99}100%{transform:scale(1.65);opacity:0;box-shadow:0 0 0 #fcd34d00}}@media(prefers-reduced-motion:reduce){button.exp-bonus-icon.exp-bonus-glow::before{animation:none!important}button.exp-bonus-icon:not(:disabled){box-shadow:0 0 0 3px #fcd34d55}}
.question-card{container-type:inline-size}.exp-type-respuesta_justificacion{display:grid;grid-template-columns:1fr 1fr;gap:12px}.exp-type-respuesta_justificacion>p{grid-column:1/-1}.exp-type-respuesta_justificacion .exp-tray{display:grid}.exp-type-respuesta_justificacion fieldset:nth-of-type(1){--choice-accent:#40b9e0}.exp-type-respuesta_justificacion fieldset:nth-of-type(2){--choice-accent:#d991e9}.exp-question[class] .exp-option.is-selected{background:color-mix(in srgb,var(--choice-accent,var(--accent,#5279b9)) 28%,var(--panel,#18202c))!important;border-color:var(--choice-accent,var(--accent,#5279b9));box-shadow:inset 0 0 0 2px var(--choice-accent,var(--accent,#5279b9))}.exp-option.is-selected:before{content:'✓ ';font-weight:bold}.exp-start{outline:2px dashed var(--accent,#5279b9);outline-offset:-4px}.exp-diagram-live{position:relative;min-height:440px;margin:24px 12%;}.exp-diagram-lines{position:absolute;inset:0;width:100%;height:100%;overflow:visible}.exp-diagram-node{position:absolute;transform:translate(-50%,-50%);width:clamp(100px,32%,240px);padding:12px;background:var(--panel,#18202c);border:2px dashed var(--line,#8888);border-radius:12px;overflow-wrap:anywhere;display:grid;gap:8px;font-size:.85em}.exp-diagram-node.is-filled{border-style:solid;border-color:var(--accent,#5279b9)}@container (max-width:639px){.exp-type-respuesta_justificacion{grid-template-columns:1fr}}@media(max-width:639px){.exp-type-respuesta_justificacion{grid-template-columns:1fr}.exp-diagram-live{min-height:600px}}
.exp-bonus-status{display:block;margin:10px 0;padding:12px;border:1px solid var(--line,#8888);border-radius:10px;font-size:.9em;line-height:1.45}.exp-bonus-status p{margin:0 0 8px}.exp-bonus-status.hidden{display:none}.exp-question fieldset{border:1px solid var(--line,#9996);border-radius:14px;padding:14px;margin:12px 0;min-width:0}.exp-question legend{font-weight:650;padding:0 6px}.exp-tray{display:flex;flex-wrap:wrap;gap:8px}.exp-option,.exp-matrix button{min-height:44px;padding:10px 14px;border:1px solid var(--line,#8888);border-radius:10px;background:var(--panel,#fff);color:inherit;cursor:pointer;font:inherit}.exp-option.is-selected,.exp-matrix button[aria-pressed=true]{box-shadow:inset 0 0 0 3px var(--accent,#5279b9);background:var(--panel,#18202c)}.exp-question .exp-option,.exp-question .exp-matrix button{color:var(--text,#eef3fc)!important}.exp-question .exp-option.is-selected,.exp-question .exp-matrix button[aria-pressed=true]{background:color-mix(in srgb,var(--text,#eef3fc) 8%,var(--panel,#18202c))!important;color:var(--text,#eef3fc)!important;border-color:var(--accent,#5279b9)}.exp-option:focus-visible,.exp-matrix button:focus-visible{outline:3px solid var(--accent,#5279b9);outline-offset:3px}.exp-table-scroll{overflow:auto;max-width:100%}.exp-matrix{border-collapse:collapse;width:100%}.exp-matrix th,.exp-matrix td{padding:8px;border:1px solid var(--line,#9996);text-align:center}.exp-built{display:block;min-height:44px;padding:14px;font-size:1.3em}.exp-scale{flex-wrap:nowrap;overflow:auto;border-bottom:3px solid currentColor;padding-bottom:8px}.exp-diagram{display:block;width:100%;max-height:270px}.exp-rewards{border:1px solid var(--line,#9996);border-radius:16px;padding:16px;margin:12px 0}.exp-rewards summary{cursor:pointer;font-weight:bold;min-height:32px}.exp-reward-grid{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0}.exp-reward-tile{border:1px solid var(--line,#9996);border-radius:12px;padding:12px;min-width:44px;text-align:center}.exp-image-grid{display:grid;gap:4px;grid-template-columns:repeat(2,minmax(0,1fr));max-width:600px}.exp-image-piece.is-selected{outline:4px solid var(--accent,#5279b9);outline-offset:-4px}.exp-image-piece{aspect-ratio:2;background-size:200% auto;background-repeat:no-repeat}.exp-final{margin:20px 0}.exp-final button{min-height:44px}.exp-question [hidden],.exp-rewards [hidden]{display:none!important}
.exp-coordinate-cell{display:grid!important;place-items:center;gap:4px;min-width:76px;min-height:78px;padding:8px!important}.exp-coordinate-cell-label{font-weight:750;font-size:1.05em}.exp-coordinate-cell-pair{font-size:.82em;opacity:.85}.exp-coordinate-cell.is-start{border:2px solid var(--accent,#5279b9)!important;outline:3px solid color-mix(in srgb,var(--accent,#5279b9) 30%,transparent);outline-offset:2px}.exp-start-indicator{display:inline-flex;align-items:center;justify-content:center;padding:3px 8px;border:1px solid var(--accent,#5279b9);border-radius:999px;background:color-mix(in srgb,var(--accent,#5279b9) 22%,var(--panel,#18202c));color:var(--text,#eef3fc);font-size:.72em;font-weight:800;line-height:1.15}
`;
