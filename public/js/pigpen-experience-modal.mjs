import {experience} from './escape-room-experience.mjs?v=20260912-text-pieces-v9';

const PRESETS_STORAGE_KEY = 'pigpen.experiencePresets.v1';

const DEFAULT_PRESETS = [
  {
    id: 'preset_classic',
    name: 'Clásico',
    config: {
      question_types: ['opcion_multiple', 'verdadero_falso', 'texto', 'relacion_columnas', 'drag_drop', 'completar_espacio', 'ordenar_secuencia', 'multimedia'],
      primary_reward: 'letras',
      extras: []
    },
    structure: { rooms: 4, questionsPerRoom: 4 }
  },
  {
    id: 'preset_logic',
    name: 'Lógica y deducción',
    config: {
      question_types: ['matriz_deduccion', 'clasificar_grupos', 'completar_patron', 'resolver_restricciones', 'opcion_multiple'],
      primary_reward: 'simbolos',
      extras: ['pista']
    },
    structure: { rooms: 4, questionsPerRoom: 4 }
  },
  {
    id: 'preset_math',
    name: 'Matemáticas y escala',
    config: {
      question_types: ['construir_expresion', 'ubicar_escala', 'balancear_cantidades', 'respuesta_coordenadas'],
      primary_reward: 'letras',
      extras: ['recompensa_visual']
    },
    structure: { rooms: 4, questionsPerRoom: 4 }
  },
  {
    id: 'preset_variety',
    name: 'Variedad total',
    config: {
      question_types: ['opcion_multiple', 'respuesta_justificacion', 'marcar_evidencia', 'matriz_deduccion', 'construir_solucion', 'clasificar_grupos'],
      primary_reward: 'imagen',
      extras: ['pista', 'recompensa_visual']
    },
    structure: { rooms: 4, questionsPerRoom: 4 }
  }
];

function loadPresets() {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return structuredClone(DEFAULT_PRESETS);
}

function savePresets(presets) {
  try {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch {}
}

export function mountExperienceModal({getConfig,onSave,getStructure=()=>({rooms:4,questionsPerRoom:4}),isBusy=()=>false}) {
  const esc=experience.esc;
  const root=document.createElement('div');
  root.id='erExperienceModal';root.className='modal fade';root.tabIndex=-1;
  root.setAttribute('aria-labelledby','erExperienceTitle');root.setAttribute('aria-hidden','true');
  const group=(name,title,items,kind='checkbox')=>`<section class="er-experience-section" data-experience-group="${name}"><div class="er-experience-heading"><h3>${title}</h3>${kind==='checkbox'&&name!=='extras'?`<div><button type="button" class="er-button er-button-ghost" data-experience-all="${name}">Seleccionar todas</button><button type="button" class="er-button er-button-ghost" data-experience-none="${name}">Desmarcar todas</button></div>`:''}</div><div class="er-experience-options">${items.map(item=>`<label class="er-experience-option"><input type="${kind}" name="${kind==='radio'?'erPrimaryReward':name}" value="${item.id}"><span><strong>${esc(item.label)}</strong>${item.description?`<small>${esc(item.description)}</small>`:''}</span></label>`).join('')}</div></section>`;
  const defs=experience.definitions;
  const presetsSection = `<section class="er-experience-section er-experience-presets-section">
    <div class="er-experience-heading">
      <h3>Presets rápidos</h3>
      <div class="er-preset-save-bar">
        <input type="text" class="er-preset-name-input" placeholder="Nombre del preset…" aria-label="Nombre del preset" maxlength="28" data-experience-preset-name>
        <button type="button" class="er-button er-button-secondary" data-experience-save-preset title="Guardar configuración actual como preset">
          <i class="fas fa-bookmark" aria-hidden="true"></i>
          <span>Guardar preset</span>
        </button>
      </div>
    </div>
    <div class="er-experience-presets-list" data-experience-presets-list aria-label="Lista de presets"></div>
  </section>`;
  root.innerHTML=`<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg"><div class="modal-content er-experience-modal"><div class="modal-header"><div><h2 id="erExperienceTitle" class="modal-title">Configurar preguntas y recompensas</h2><p>Elige cómo responderá el alumnado y qué recibirá al completar cada sala.</p></div><button type="button" class="er-experience-close" data-bs-dismiss="modal" aria-label="Cerrar"><span aria-hidden="true">×</span></button></div><div class="modal-body">
  ${presetsSection}
  <section class="er-experience-section"><div class="er-experience-heading"><h3>Estructura del escape room</h3></div><div class="er-experience-structure"><label class="er-field"><span>Salas</span><input type="number" min="1" max="8" step="1" data-experience-rooms></label><label class="er-field"><span>Preguntas por sala</span><input type="number" min="1" step="1" data-experience-question-count></label></div><p>Esta configuración se conserva al cargar un brief desde Sheets.</p></section>
  ${group('classic' ,'Preguntas clásicas',experience.classics.map(([id,label])=>({id,label,description:id==='texto'?'Palabra, número o código exacto; no admite respuestas abiertas.':''})))}
  <p>Compatibilidad curricular: expresión matemática, escala y balance requieren cantidades o magnitudes relevantes para el objetivo. Para construir mensajes o relaciones entre conceptos, selecciona «Construir una solución con piezas».</p><h2 class="er-experience-new-title">Nuevos tipos de preguntas</h2><p>Los tipos marcados son los permitidos. PigPen los distribuirá con variedad sin aumentar las preguntas solicitadas.</p>
  ${group('new_selection','Selección y evidencia',defs.filter(d=>['single','multi','evidence'].includes(d.family)||['respuesta_justificacion','corregir_error'].includes(d.id)))}
  ${group('new_structure','Relaciones y estructuras',defs.filter(d=>['matrix','attributes','diagram'].includes(d.family)||['clasificar_grupos','completar_patron','completar_analogia','construir_solucion'].includes(d.id)))}
  ${group('new_operations','Operaciones y restricciones',defs.filter(d=>['expression','scale','coordinates','balance'].includes(d.family)||d.id==='resolver_restricciones'))}
  ${group('primary_classic','Recompensa principal · Clásica',experience.rewards.slice(0,1),'radio')}
  ${group('primary_new','Recompensa principal · Nuevas',experience.rewards.slice(1),'radio')}
  <section data-experience-image hidden><label class="er-field"><span>Imagen para reconstruir (opcional)</span><input type="file" accept="image/png,image/jpeg,image/webp" data-experience-image-file></label><p>Se incluirá en el juego descargable. Sin archivo, PigPen crea una imagen con el código.</p><img data-experience-image-preview alt="Vista previa de la recompensa" style="max-width:100%;max-height:180px" hidden><button type="button" data-experience-clear-image>Usar imagen automática</button></section>
  ${group('extras','Premios adicionales · Opcionales',experience.extras)}
  <p class="er-experience-rule">Sala perfecta: todas las preguntas al primer intento y sin ayudas. Sólo así se obtienen los premios adicionales. La recompensa principal siempre se entrega al completar la sala.</p>
  <p id="erExperienceError" role="alert"></p></div><div class="modal-footer"><p id="erExperienceSummary" aria-live="polite"></p><button type="button" class="er-button er-button-secondary" data-experience-reset>Restaurar clásicos</button><button type="button" class="er-button er-button-secondary" data-bs-dismiss="modal">Cancelar</button><button type="button" class="er-button er-button-primary" data-experience-save>Guardar y continuar</button></div></div></div>`;
  document.body.append(root);
  function syncTheme() {
    const theme = getComputedStyle(document.documentElement);
    for (const [token, fallback] of [['--app-bg-color','--er-studio-surface'],['--app-text-color','--er-studio-text']]) {
      root.style.setProperty(token, theme.getPropertyValue(token).trim() || theme.getPropertyValue(fallback).trim());
    }
  }
  syncTheme();
  new MutationObserver(syncTheme).observe(document.documentElement,{attributes:true,attributeFilter:['style','class']});
  let pending=null,saving=false,rewardImage='',returnFocus=null,saved=false;
  let presets=loadPresets();
  root.inert=true;
  root.addEventListener('show.bs.modal',()=>{returnFocus=document.activeElement;root.inert=false;});
  root.addEventListener('shown.bs.modal',()=>{root.inert=false;});
  root.addEventListener('hide.bs.modal',event=>{
    if(event.defaultPrevented)return;
    // Move focus out before Bootstrap sets aria-hidden. Restore the opener
    // only after its focus trap has been deactivated.
    if(root.contains(document.activeElement))document.activeElement.blur();
    const resolve=pending;pending=null;resolve?.(saved);saved=false;
  });
  function readStructure(){return {rooms:Number(root.querySelector('[data-experience-rooms]').value),questionsPerRoom:Number(root.querySelector('[data-experience-question-count]').value)};}
  function structureIssues(){const s=readStructure();return [...(!Number.isInteger(s.rooms)||s.rooms<1||s.rooms>8?['El número de salas debe estar entre 1 y 8.']:[]),...(!Number.isInteger(s.questionsPerRoom)||s.questionsPerRoom<1?['Las preguntas por sala deben ser un entero mayor que cero.']:[])];}
  function read(){return experience.config({reward_image:rewardImage,question_types:[...root.querySelectorAll('input[type=checkbox]:checked')].filter(i=>i.name!=='extras').map(i=>i.value),primary_reward:root.querySelector('input[type=radio]:checked')?.value,extras:[...root.querySelectorAll('input[name=extras]:checked')].map(i=>i.value)});}
  function isMatchingPreset(p,cfg,str){
    if(!p||!p.config)return false;
    if(p.structure&&str){
      if(Number(p.structure.rooms)!==Number(str.rooms)||Number(p.structure.questionsPerRoom)!==Number(str.questionsPerRoom))return false;
    }
    if(p.config.primary_reward!==cfg.primary_reward)return false;
    const aTypes=[...(p.config.question_types||[])].sort();
    const bTypes=[...(cfg.question_types||[])].sort();
    if(aTypes.length!==bTypes.length||aTypes.some((v,idx)=>v!==bTypes[idx]))return false;
    const aExtras=[...(p.config.extras||[])].sort();
    const bExtras=[...(cfg.extras||[])].sort();
    if(aExtras.length!==bExtras.length||aExtras.some((v,idx)=>v!==bExtras[idx]))return false;
    return true;
  }
  function renderPresets(){
    const list=root.querySelector('[data-experience-presets-list]');
    if(!list)return;
    if(!presets.length){
      list.innerHTML='<span class="er-preset-empty">No hay presets guardados. Guarda el actual arriba.</span>';
      return;
    }
    const currentCfg=read();
    const currentStr=readStructure();
    list.innerHTML=presets.map(p=>{
      const active=isMatchingPreset(p,currentCfg,currentStr);
      return `<div class="er-preset-badge ${active?'is-active':''}" data-preset-id="${esc(p.id)}" role="button" tabindex="0" title="Cargar preset: ${esc(p.name)}">
        <span class="er-preset-badge-name">${esc(p.name)}</span>
        <button type="button" class="er-preset-delete-btn" data-preset-delete="${esc(p.id)}" aria-label="Eliminar preset ${esc(p.name)}" title="Eliminar preset">&times;</button>
      </div>`;
    }).join('');
  }
  function handleSavePreset(){
    const input=root.querySelector('[data-experience-preset-name]');
    if(!input)return;
    const name=input.value.trim();
    if(!name){input.focus();return;}
    const currentCfg=read();
    const currentStr=readStructure();
    const newPreset={
      id:'preset_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
      name:name.slice(0,30),
      config:currentCfg,
      structure:currentStr
    };
    const existingIndex=presets.findIndex(p=>p.name.toLowerCase()===newPreset.name.toLowerCase());
    if(existingIndex>=0){
      presets[existingIndex]=newPreset;
    }else{
      presets.push(newPreset);
    }
    savePresets(presets);
    input.value='';
    renderPresets();
  }
  function summary(){
    const c=read();root.querySelector('[data-experience-image]').hidden=c.primary_reward!=='imagen';
    const preview=root.querySelector('[data-experience-image-preview]');preview.hidden=!rewardImage;if(rewardImage)preview.src=rewardImage;
    root.querySelector('#erExperienceSummary').textContent=`${c.question_types.length} tipos permitidos · ${experience.rewards.find(r=>r.id===c.primary_reward).label} · ${c.extras.length} extras`;
    const issues=[...experience.configIssues(c),...structureIssues()];
    root.querySelector('#erExperienceError').textContent=issues.join(' ');
    root.querySelector('[data-experience-save]').disabled=saving||!!issues.length;
    renderPresets();
  }
  function fill(value){const c=experience.config(value);rewardImage=c.reward_image||'';root.querySelectorAll('input[type=checkbox],input[type=radio]').forEach(i=>i.checked=i.type==='radio'?i.value===c.primary_reward:i.name==='extras'?c.extras.includes(i.value):c.question_types.includes(i.value));summary();}
  root.addEventListener('input',e=>{if(e.target.matches('[data-experience-rooms],[data-experience-question-count]'))summary();});
  root.addEventListener('change',async e=>{if(e.target.matches('[data-experience-image-file]')){const file=e.target.files[0];if(file){if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>4*1024*1024){root.querySelector('#erExperienceError').textContent='Elige una imagen PNG, JPEG o WebP de hasta 4 MB.';return;}rewardImage=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const image=new Image();image.onload=()=>{const canvas=document.createElement('canvas');const scale=Math.min(1,900/image.width,600/image.height);canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',0.65));};image.onerror=()=>reject(new Error('No se pudo leer la imagen.'));image.src=reader.result;};reader.onerror=reject;reader.readAsDataURL(file);});}}summary();});
  root.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&e.target.matches('[data-experience-preset-name]')){
      e.preventDefault();
      handleSavePreset();
    }else if((e.key==='Enter'||e.key===' ')&&e.target.matches('.er-preset-badge')){
      e.preventDefault();
      e.target.click();
    }
  });
  root.addEventListener('click',async e=>{
    const deleteBtn=e.target.closest('[data-preset-delete]');
    if(deleteBtn){
      e.stopPropagation();
      const pId=deleteBtn.dataset.presetDelete;
      presets=presets.filter(p=>p.id!==pId);
      savePresets(presets);
      renderPresets();
      return;
    }
    const badge=e.target.closest('[data-preset-id]');
    if(badge){
      const p=presets.find(item=>item.id===badge.dataset.presetId);
      if(p){
        fill(p.config);
        if(p.structure){
          if(p.structure.rooms)root.querySelector('[data-experience-rooms]').value=p.structure.rooms;
          if(p.structure.questionsPerRoom)root.querySelector('[data-experience-question-count]').value=p.structure.questionsPerRoom;
        }
        summary();
      }
      return;
    }
    if(e.target.closest('[data-experience-save-preset]')){
      handleSavePreset();
      return;
    }
    if(e.target.closest('[data-experience-clear-image]')){rewardImage='';root.querySelector('[data-experience-image-file]').value='';summary();}
    const all=e.target.closest('[data-experience-all]'),none=e.target.closest('[data-experience-none]');
    if(all||none){const name=all?.dataset.experienceAll||none.dataset.experienceNone;root.querySelectorAll(`[data-experience-group="${name}"] input`).forEach(i=>i.checked=!!all);summary();}
    if(e.target.closest('[data-experience-reset]'))fill({});
    if(e.target.closest('[data-experience-save]')&&!saving){
      const value=read();if(experience.configIssues(value).length||structureIssues().length)return; saving=true;summary();
      try{await onSave(value,readStructure());saved=true;window.bootstrap.Modal.getInstance(root).hide();}
      catch(error){saving=false;summary();root.querySelector('#erExperienceError').textContent=error.message;return;}
      finally{saving=false;root.querySelector('[data-experience-save]').disabled=!!(experience.configIssues(read()).length||structureIssues().length);}
    }
  });
  root.addEventListener('hidden.bs.modal',()=>{
    if(!pending&&!root.classList.contains('show'))root.inert=true;
    if(returnFocus?.isConnected&&!returnFocus.disabled&&!returnFocus.closest('[inert]')&&document.activeElement===document.body)returnFocus.focus({preventScroll:true});
  });
  return {open(){if(isBusy())return Promise.resolve(false);if(pending)return Promise.resolve(false);syncTheme();saved=false;root.inert=false;const structure=getStructure();root.querySelector('[data-experience-rooms]').value=structure.rooms;root.querySelector('[data-experience-question-count]').value=structure.questionsPerRoom;fill(getConfig());return new Promise(resolve=>{pending=resolve;window.bootstrap.Modal.getOrCreateInstance(root).show();});},element:root};
}
