const { createHash, randomUUID } = require('node:crypto');
const { normalizeTextModel } = require('./vertex.js');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32);
const clean = value => JSON.parse(JSON.stringify(value));
const LIMITS = Object.freeze({ text: 4, image: 2 });
const LEASE_MS = 240000;
const MAX_ATTEMPTS = 4;
const terminal = status => ['completed', 'cancelled', 'needs_attention'].includes(status);
const text = (v, max = 12000) => String(v ?? '').trim().slice(0, max);
function configuration(source = {}, activity = {}) {
  const config = { ...activity, ...source };
  if (!['physics', 'chemistry', 'biology', 'math'].includes(config.subject)) throw fail('Selecciona una materia válida.');
  if (!text(config.topic, 300)) throw fail('Selecciona un tema.');
  const trimester=String(config.trimester).replace(/^Trimestre\s*/i,'');
  if (!['1', '2', '3'].includes(trimester)) throw fail('Selecciona el trimestre.');
  const integer = (value, fallback, max) => { const n = Number(value ?? fallback); if (!Number.isInteger(n) || n < 1 || n > max) throw fail('Cantidad de niveles o preguntas inválida.'); return n; };
  const gameMode = config.gameMode === 'simulator' ? 'simulator' : config.gameMode === 'lab' ? 'lab' : 'game';
  if(['new','approved'].includes(config.simulatorMode)&&gameMode!=='simulator')throw fail('Los modelos nuevos o del catálogo requieren modo simulador.');
  if(config.simulatorMode==='approved'&&!/^generated-[a-f0-9]{64}$/.test(String(config.modelId||'')))throw fail('Modelo aprobado inválido.');
  return { subject: config.subject, topic: text(config.topic, 300), trimester: `Trimestre ${trimester}`, gameMode,
    programmaticScene:!['new','approved'].includes(config.simulatorMode)&&['addition-subtraction','quadratic-factorization-rectangle'].includes(activity.simulator?.modelId||activity.variant),
    artDirection:gameMode==='simulator'&&activity.artDirection?clean(activity.artDirection):null,
    requiresCharacter:gameMode!=='simulator'&&Boolean(activity.playerCharacter)&&!activity.playerSprite,
    grade: text(config.grade, 100), difficulty: text(config.difficulty || 'medium', 100), visualStyle: text(config.visualStyle || 'kawaii-lab', 100),
    experiencePrompt: text(config.experiencePrompt), expectedLearnings: text(config.expectedLearnings),
    levelCount: gameMode === 'simulator' ? 0 : integer(config.levelCount, 3, 10), questionsPerLevel: gameMode === 'simulator' ? 0 : integer(config.questionsPerLevel, 3, 15),
    questionTypeSchedule: Array.isArray(config.questionTypeSchedule)&&config.questionTypeSchedule.length ? config.questionTypeSchedule.slice(0,150).map(v=>text(v,50)) : Array.from({length:gameMode==='simulator'?0:integer(config.levelCount,3,10)*integer(config.questionsPerLevel,3,15)},(_,i)=>i===0?'image-multiple':(activity.allowedQuestionTypes||['multiple'])[i%Math.max(1,activity.allowedQuestionTypes?.length||1)]),
    model: normalizeTextModel(config.model), modelId:config.simulatorMode==='approved'?config.modelId:'', simulatorMode: ['new','approved'].includes(config.simulatorMode)?config.simulatorMode:'curated', instructions: text(config.instructions) };
}
function validatePlan(source, config) {
  if (!source || typeof source !== 'object' || !text(source.title) || !text(source.objective)) throw fail('El plan generado está incompleto.', 422);
  const levels = Array.isArray(source.levels) ? source.levels : [];
  if (levels.length !== config.levelCount || levels.some(l => !text(l.title) || !text(l.objective))) throw fail('El plan no contiene todos los niveles solicitados.', 422);
  let visuals = (Array.isArray(source.visuals) ? source.visuals : []).slice(0, 16).map((item, index) => ({ id: `visual-${index}`, role: ['primary','question','character'].includes(item.role)?item.role:'background', prompt: text(item.prompt, 6000), alt: text(item.alt || item.prompt, 300),...(Number.isInteger(item.levelIndex)?{levelIndex:item.levelIndex}:{}) }));
  let artDirection;
  if(config.gameMode==='simulator'){
    artDirection=require('./science-production-art.js').validateArtDirection(config.artDirection);
    visuals=[{id:'scene-background',role:'background',prompt:artDirection.backgroundPrompt,alt:artDirection.environment}];
    if(artDirection.representation==='object')visuals.push({id:'scene-primary',role:'primary',prompt:artDirection.primaryPrompt,alt:artDirection.hero});
  }
  if(config.gameMode!=='simulator'){
    const backgrounds=visuals.filter(v=>v.role==='background');
    visuals=visuals.filter(v=>v.role!=='background');
    levels.forEach((level,index)=>visuals.push({id:`background-${index}`,role:'background',levelIndex:index,prompt:text(backgrounds.find(b=>b.levelIndex===index)?.prompt||`${backgrounds[0]?.prompt||config.experiencePrompt||config.topic}. Escena única para ${level.title}: ${level.objective}`,6000),alt:text(level.title,300)}));
    if(config.requiresCharacter&&!visuals.some(v=>v.role==='character'))visuals.push({id:'character',role:'character',prompt:`Protagonista científico adolescente para ${config.topic}, ${config.visualStyle}`,alt:'Personaje científico'});
  }
  if (visuals.some(v => !v.prompt)) throw fail('Falta una instrucción visual.', 422);
  if (config.gameMode !== 'simulator' && visuals.filter(v => v.role === 'question').length !== 1) throw fail('El plan requiere exactamente una imagen de pregunta.', 422);
  if (config.gameMode === 'simulator' && !visuals.some(v => v.role === 'background')) throw fail('El simulador requiere un fondo.', 422);
  return { title: text(source.title, 300), objective: text(source.objective, 2000), instructions: text(source.instructions || config.instructions),
    levels: levels.map((l, index) => ({ id: `level-${index}`, title: text(l.title, 300), objective: text(l.objective, 2000) })), visuals, simulatorBrief: text(source.simulatorBrief, 8000),...(artDirection?{artDirection}:{}) };
}
function task(id, stage, input = {}, dependencies = []) { return { id, stage, pool: stage === 'image' ? 'image' : 'text', input, dependencies, status: 'pending', attempt: 0, dueAt: 0, leaseUntil: 0 }; }
function initialTasks(run) {
  const items = [task('pedagogy', 'pedagogy')];
  if (run.config.gameMode === 'simulator'){items.push(task('art-direction','art-direction'));items.push(task('simulator', run.config.simulatorMode === 'new' ? 'candidate' : 'simulator',{},run.config.simulatorMode==='new'?['art-direction']:[]));}
  else run.plan.levels.forEach((level, i) => items.push(task(`level-${i}`, 'questions', { levelIndex: i, level })));
  for (const visual of run.plan.visuals) items.push(task(visual.id, 'image', visual,run.config.gameMode==='simulator'?['art-direction']:visual.role === 'question' ? ['level-0'] : Number.isInteger(visual.levelIndex)?['pedagogy']:[]));
  items.push(task('validate', 'validate', {}, items.map(t => t.id)));
  return items;
}
function retryDelay(attempt, error = {}) { return Math.min(300000, Math.max(Number(error.retryAfterMs) || 0, 5000 * (2 ** Math.max(0, attempt - 1)))); }
function publicRun(run, tasks = []) { const { ownerId, epoch, activity, ...safe } = run; return { ...safe, tasks: tasks.map(({ token, epoch, result, ...item }) => ({...item,...(item.stage==='candidate'?{result}: {})})), warnings: run.warnings || [], result: run.result || null }; }
module.exports = { fail, hash, clean, LIMITS, LEASE_MS, MAX_ATTEMPTS, terminal, configuration, validatePlan, task, initialTasks, retryDelay, publicRun, randomUUID };
