const { randomUUID } = require('node:crypto');
const { createVertexClient, buildVertexGenerateRequest, DEFAULT_IMAGE_MODEL } = require('./vertex.js');
const { fail, validatePlan, clean, hash } = require('./science-production-policy.js');
const {lockArtDirection,buildSimulatorAssetPrompt,verifySimulatorAssetManifest,assembleSimulatorScene}=require('./science-production-art.js');
const parts = response => response?.candidates?.[0]?.content?.parts || [];
const plannerResponseSchema = {
  type: 'OBJECT',
  required: ['title', 'objective', 'instructions', 'levels', 'visuals', 'simulatorBrief'],
  properties: {
    title: { type: 'STRING' }, objective: { type: 'STRING' }, instructions: { type: 'STRING' }, simulatorBrief: { type: 'STRING' },
    levels: { type: 'ARRAY', items: { type: 'OBJECT', required: ['title', 'objective'], properties: { title: { type: 'STRING' }, objective: { type: 'STRING' } } } },
    visuals: { type: 'ARRAY', items: { type: 'OBJECT', required: ['role', 'prompt', 'alt'], properties: { role: { type: 'STRING' }, prompt: { type: 'STRING' }, alt: { type: 'STRING' }, levelIndex: { type: 'INTEGER' } } } }
  }
};
function parseJson(response) {
  const source = parts(response).map(p => p.text || '').join('').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(source); } catch { throw fail('El agente devolvió JSON incompleto.', 422); }
}
function removeBorderMatte(data,width,height,magenta=false){
  const seen=new Uint8Array(width*height),queue=new Int32Array(width*height);let head=0,tail=0;
  const matches=p=>{const i=p*4,r=data[i],g=data[i+1],b=data[i+2];return magenta?r>100&&b>100&&Math.min(r,b)>g*1.35:g>100&&g>r*1.35&&g>b*1.35;};
  const add=p=>{if(p<0||p>=seen.length||seen[p]||!matches(p))return;seen[p]=1;queue[tail++]=p;};
  for(let x=0;x<width;x++){add(x);add((height-1)*width+x);}for(let y=0;y<height;y++){add(y*width);add(y*width+width-1);}
  while(head<tail){const p=queue[head++];data[p*4+3]=0;if(p%width)add(p-1);if(p%width<width-1)add(p+1);add(p-width);add(p+width);}
  return tail/(width*height);
}
function validateQuestions(items, config, levelIndex) {
  if (!Array.isArray(items) || items.length !== config.questionsPerLevel) throw fail('El agente no completó todas las preguntas.', 422);
  const seen = new Set();
  return items.map((q,index) => {
    const type = levelIndex === 0 && index === 0 ? 'image-multiple' : config.questionTypeSchedule?.[levelIndex*config.questionsPerLevel+index] || 'multiple';
    const present=v=>typeof v==='string'&&v.trim().length>0, list=v=>Array.isArray(v)&&v.length>0, finite=v=>typeof v==='number'&&Number.isFinite(v);
    if (q.type !== type || !present(q.prompt) || !present(q.context) || !present(q.feedback||q.explanation)) throw fail('Pregunta o respuesta incompleta.', 422);
    const permutations=(values,order)=>list(values)&&list(order)&&values.length===order.length&&new Set(order).size===values.length&&order.every(v=>values.includes(v));
    const valid={
      multiple:()=>Array.isArray(q.options)&&q.options.length===4&&q.options.every(present)&&new Set(q.options).size===4&&Number.isInteger(q.correct)&&q.correct>=0&&q.correct<4,
      'image-multiple':()=>Array.isArray(q.options)&&q.options.length===4&&q.options.every(present)&&new Set(q.options).size===4&&Number.isInteger(q.correct)&&q.correct>=0&&q.correct<4,
      keyword:()=>list(q.accepted)&&q.accepted.every(present),
      matching:()=>Array.isArray(q.pairs)&&q.pairs.length>=3&&q.pairs.every(p=>Array.isArray(p)&&p.length===2&&p.every(present)),
      'fill-blank':()=>list(q.accepted)&&q.accepted.every(present)&&(String(q.expression||'').includes('___')||(list(q.segments)&&q.segments.includes('___')&&q.segments.some(v=>v!=='___'&&present(v)))),
      'equation-build':()=>list(q.pieces)&&list(q.correctSequence)&&q.correctSequence.includes('=')&&q.correctSequence.every(v=>q.pieces.includes(v)),
      'exponent-placement':()=>list(q.bases)&&list(q.exponents)&&list(q.correctExponents)&&q.correctExponents.length===q.bases.length&&q.correctExponents.every(v=>q.exponents.includes(v)),
      'chemical-balance':()=>list(q.compounds)&&q.compounds.every(c=>present(c.formula)&&['reactant','product'].includes(c.side))&&list(q.correctCoefficients)&&q.correctCoefficients.length===q.compounds.length&&q.correctCoefficients.every(v=>Number.isInteger(v)&&v>0),
      'numeric-answer':()=>finite(q.correctValue)&&finite(q.tolerance)&&q.tolerance>=0,
      'graph-plot':()=>list(q.targetPoints)&&q.targetPoints.every(p=>finite(p.x)&&finite(p.y)),
      'sequence-order':()=>permutations(q.steps,q.correctOrder),
      'timeline-order':()=>Array.isArray(q.events)&&q.events.length>=3&&q.events.length<=8&&q.events.every(e=>present(e.id)&&present(e.title)&&present(e.description))&&permutations(q.events.map(e=>e.id),q.correctOrder),
      'number-line-placement':()=>finite(q.targetValue)&&finite(q.min)&&finite(q.max)&&q.max>q.min&&q.targetValue>=q.min&&q.targetValue<=q.max&&Number.isInteger(q.denominator)&&q.denominator>=1
    };
    if(!valid[type]?.())throw fail(`Contrato incompleto para pregunta ${type}.`,422);
    const key=q.prompt.trim().toLowerCase(); if(seen.has(key))throw fail('El agente repitió una pregunta.',422); seen.add(key);
    if(type==='image-multiple' && (!q.visual?.imagePrompt || !q.visual?.target)) throw fail('Falta el contrato de la pregunta visual.',422);
    return {...q,feedback:q.feedback||q.explanation,id:`question-${levelIndex}-${index}`,levelIndex,questionIndex:index,levelId:`level-${levelIndex+1}`,generationSource:'gemini',plannedType:type,points:10,...(['multiple','image-multiple'].includes(type)?{correctAnswers:[q.correct]}:{})};
  });
}
async function validateCurriculum(run,questions){
  const policy=await import('./science-curriculum-policy.mjs');
  const activity={...run.activity,...run.config};
  for(const q of questions){const content=[q.prompt,q.context,q.feedback,...(q.options||[]),...(q.accepted||[])].join(' ');
    if(!policy.isQuestionTypeAllowed(activity,q.type)||!policy.isSimpleBiologyNumericAssessment(activity,q)||!policy.isAssessmentDifficultyCompatible(activity,q)||!policy.isCurriculumContentCompatible(activity,content))throw fail('La pregunta no cumple el contrato curricular de materia, tema o dificultad.',422);
  }return questions;
}
function createScienceWorkers(dependencies={}) {
  const client = dependencies.client || createVertexClient({location:'global'}), bucket=dependencies.bucket;
  return async function execute(run,item,dependenciesResults={},signal=new AbortController().signal) {
    const request=async payload=>{
      if(signal.aborted)throw signal.reason;
      const response=await client.models.generateContent({...buildVertexGenerateRequest(payload),config:{...buildVertexGenerateRequest(payload).config,abortSignal:signal}});
      if(signal.aborted)throw signal.reason;
      return response;
    };
    const json=async (prompt,responseSchema)=>parseJson(await request({model:run.config.model,payload:{contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',temperature:0.35,maxOutputTokens:16384,...(responseSchema?{responseSchema}:{})}}}));
    const context=JSON.stringify({config:run.config,plan:run.plan,model:run.activity.simulator,visualSelection:run.activity.simulatorVisualSelection,curriculum:run.activity.curriculumGenerationContract||run.activity.curriculumProfile,controls:run.activity.controls});
    const domain={physics:'Especialista en Física: analiza dimensiones SI, signos, condiciones iniciales y conservación. Comprueba límites temporales y equilibrio; distingue magnitudes de representaciones visuales.',chemistry:'Especialista en Química: conserva átomos, masa y carga; comprueba estequiometría, unidades, concentraciones y condiciones de reacción. Declara idealizaciones y evita procedimientos inseguros.',biology:'Especialista en Biología: representa mecanismos y relaciones causales con rigor, distingue modelos cualitativos de medidas reales y explicita límites de validez. No reduzcas procesos biológicos a ecuaciones inventadas.',math:'Especialista en Matemáticas: comprueba dominio, signos, casos cero, operaciones exactas y equivalencias. Verifica soluciones sustituyendo en el problema y evita redondeo prematuro.'}[run.config.subject]||'';
    const system=`Eres un agente científico especializado en educación secundaria. ${domain} Responde en español. Respeta el currículo, las unidades, las leyes y el plan aprobado. No inventes validaciones ni datos experimentales. Devuelve exclusivamente JSON. `;
    switch(item.stage){
      case 'planner': {
        const simulator=run.config.gameMode==='simulator';
        const proposed=await json(`${system}Crea el plan mínimo y completo para ${run.config.subject}/${run.config.topic}. Responde sólo con el objeto JSON del esquema, sin markdown. title y objective son obligatorios. Debe contener exactamente ${run.config.levelCount} niveles; si el modo es simulator, levels y visuals deben ser arrays vacíos. ${simulator?`Usa esta ficha artística vinculante: ${JSON.stringify(run.config.artDirection)}. No inventes otro entorno, no generes imágenes en el plan y deja la composición visual al fondo/protagonista definidos por la ficha. simulatorBrief debe explicar qué dibuja el modelo por código y cómo responden sus controles.`:`Incluye exactamente una visual role question y un fondo por nivel; cada visual debe tener role, prompt y alt.`} Plan previo/cambios: ${JSON.stringify(item.input)}.`,plannerResponseSchema);
        return validatePlan(proposed,run.config);
      }
      case 'art-direction':{
        const reference=run.plan.artDirection;
        const specialist=await json(`Eres director de arte especializado en escenas científicas comerciales de realismo ilustrado. Ficha del catálogo OBLIGATORIA, inmutable: ${JSON.stringify(reference)}. Objetivo pedagógico: ${run.plan.objective}. Revisa coherencia perspectiva, luz, escala, separación protagonista/fondo y lectura en móvil. No sustituyas entorno ni protagonista, no dibujes datos científicos en las imágenes, no hagas fotomontajes inconsistentes. Devuelve {camera,lighting,palette,compositionNotes} con instrucciones compartidas precisas para generadores de fondo y protagonista, respetando los valores ya definidos por la ficha.`);
        if(!['camera','lighting','palette','compositionNotes'].every(key=>typeof specialist[key]==='string'&&specialist[key].trim()))throw fail('El especialista no completó la revisión de dirección artística.',422);
        return lockArtDirection(reference,specialist);
      }
      case 'pedagogy': {
        const value=await json(`${system}${context}. Redacta introducción y guía completa. Contrato {title,subtitle,mission,scientificPrinciple,coachTips:[string,string,string],learningGuide:{title,introduction,levels:[{title,narrative,objective,hint,concepts:[{term,definition}],example:{title,text,formula,explanation},imagePrompt}]}}. Exactamente ${run.config.levelCount} niveles y uno o dos conceptos por nivel. example.text 35–85 palabras, situación real, pregunta explícita con ¿? y datos/unidades claros; example.explanation 16–50 palabras interpreta resultado. En física, química, matemáticas formula obligatoria con =,≈,∝ o → y sustitución numérica de datos del ejemplo, nunca ley general sola; en biología formula vacía y explicación causal. imagePrompt describe escena literal del contexto del docente vertical9:16 sin texto ni fórmulas. Conserva título aprobado.`);
        if(!value.mission||!value.scientificPrinciple||!Array.isArray(value.learningGuide?.levels)||value.learningGuide.levels.length!==run.config.levelCount)throw fail('La guía pedagógica llegó incompleta.',422);
        const check=(await import('./science-learning-guide-contract.mjs')).validateScienceLearningGuide({...run.activity,...run.config},value.learningGuide);if(!check.valid)throw fail(check.issues.join('; '),422);
        return value;
      }
      case 'questions': {
        const {levelIndex,level}=item.input;
        const schedule=Array.from({length:run.config.questionsPerLevel},(_,i)=>levelIndex===0&&i===0?'image-multiple':run.config.questionTypeSchedule?.[levelIndex*run.config.questionsPerLevel+i]||'multiple');
        const targeted=Number.isInteger(item.input.questionIndex)&&Array.isArray(item.input.previousQuestions);
        const requestedSchedule=targeted?[schedule[item.input.questionIndex]]:schedule;
        const value=await json(`${system}${context}. Crea exactamente ${targeted?1:run.config.questionsPerLevel} preguntas originales para nivel ${levelIndex+1}: ${JSON.stringify(level)}. No cubras el objetivo principal de otros niveles. Tipos en orden EXACTO: ${JSON.stringify(requestedSchedule)}. Evita repetir estas preguntas conservadas: ${JSON.stringify(targeted?item.input.previousQuestions.filter((_,i)=>i!==item.input.questionIndex):[])}. Todas necesitan type,prompt,context,feedback. Contratos por tipo: multiple/image-multiple {options:[4 textos únicos],correct:índice base cero}; image-multiple añade visual:{imagePrompt,target,alt}, debe responderse mirando la imagen. keyword {accepted:[texto]}; matching {pairs:[[izquierda,derecha],... mínimo 3]}; fill-blank {segments:[texto,"___",texto],accepted:[texto]}; equation-build {pieces:[texto],correctSequence:[texto incluye "="]}; exponent-placement {bases:[texto],exponents:[texto],correctExponents:[texto por cada base]}; chemical-balance {compounds:[{formula,side:"reactant" o "product"}],correctCoefficients:[enteros positivos]}; numeric-answer {correctValue:número,tolerance:número>=0,unit}; graph-plot {axes:{x,y},targetPoints:[{x:número,y:número}]}; sequence-order {steps:[texto],correctOrder:[permutación de steps]}; timeline-order {events:[3 a 8 {id,title,description}],correctOrder:[permutación ids],timelineMode:"chronology|process|ideas"}; number-line-placement {targetValue,min,max,denominator:entero>=1}. Devuelve {questions:[...]}. Cada respuesta requiere explicación científica verificada en feedback, sin preguntas fallback.`);
        if(targeted){if(!Array.isArray(value.questions)||value.questions.length!==1)throw fail('La regeneración requiere una sola pregunta.',422);const questions=clean(item.input.previousQuestions);questions[item.input.questionIndex]=value.questions[0];return {questions:await validateCurriculum(run,validateQuestions(questions,run.config,levelIndex))};}
        return {questions:await validateCurriculum(run,validateQuestions(value.questions,run.config,levelIndex))};
      }
      case 'simulator': {
        if(run.config.simulatorMode==='approved'){const registry=dependencies.candidateRegistry||require('./science-simulator-candidates.js').defaultCandidateRegistry();const model=await registry.model(run.config.modelId);return {candidateId:model.id,hash:model.hash,status:'approved'};}
        const result=await json(`${system}${context}. Revisa el modelo curado sin cambiar ecuaciones ni controles. Produce {scientificPrinciple,mission,coachTips:[string],checks:[{label,expected}],warnings:[string]}. No inventes código ni alteres el modelId. Explica unidades y límites.`);
        if(!result.scientificPrinciple||!result.mission||!Array.isArray(result.checks))throw fail('Revisión del simulador incompleta.',422);
        return result;
      }
      case 'candidate': {
        const candidate=await json(`${system}${context}. Diseña un NUEVO simulador aislado como candidato revisable, sin ejecutarlo. JSON {title,description,source,controls:[{id,label,min,max,step,value,unit}],tests:[{params,expected,tolerance}]}. source JavaScript ESM sin imports que exporta function measure(params) devolviendo objeto numérico de medidas y function draw(ctx,state,width,height) dibujando canvas. Sin red, DOM, almacenamiento ni evaluación dinámica. Proporciona al menos tres casos numéricos independientes con resultado esperado exacto y tolerancia finita. Controles interactivos y composición MRUA con fondo separado, unidades claras. Ficha visual vinculante ${JSON.stringify(dependenciesResults['art-direction']||run.plan.artDirection)}. draw sólo representa protagonista/datos científicos sobre lienzo transparente: no rellenar ni cubrir fondo, que se integra como imagen independiente. No nombres el candidato como aprobado.`);
        if(!candidate.source||!Array.isArray(candidate.tests)||candidate.tests.length<3||!Array.isArray(candidate.controls))throw fail('Candidato de simulador incompleto.',422);
        const submit=dependencies.reviewSimulatorCandidate||dependencies.candidateRegistry?.submit||require('./science-simulator-candidates.js').defaultCandidateRegistry().submit;
        if(signal.aborted)throw signal.reason;
        return submit({run,candidate});
      }
      case 'image': {
        if(!bucket)throw fail('Almacenamiento de imágenes no disponible.',503);
        let prompt=item.input.prompt;
        const simulatorAsset=run.config.gameMode==='simulator';
        const art=dependenciesResults['art-direction'];
        if(simulatorAsset){if(!art)throw fail('El recurso necesita la dirección artística aprobada.',422);prompt=buildSimulatorAssetPrompt(run,item.input,art);}
        if(item.input.role==='question')prompt=dependenciesResults['level-0']?.questions?.[0]?.visual?.imagePrompt||prompt;
        if(Number.isInteger(item.input.levelIndex))prompt=dependenciesResults.pedagogy?.learningGuide?.levels?.[item.input.levelIndex]?.imagePrompt||prompt;
        const imageContract=await import('./science-image-prompt-contract.mjs');
        if(Number.isInteger(item.input.levelIndex))prompt=imageContract.buildRealisticActivityImagePrompt({...run.activity,...run.config},dependenciesResults.pedagogy?.learningGuide?.levels?.[item.input.levelIndex]||{imagePrompt:prompt},item.input.levelIndex,run.config.levelCount);
        const character=item.input.role==='character',primary=item.input.role==='primary'||character,magenta=/plant|hoja|clorofil|verde|alga|ecosistem|green/i.test(prompt),matte=magenta?'#FF00FF':'#00FF00';
        const direction=character?`Sprite sheet 4 columnas x 2 filas, ocho poses completas del mismo personaje, de izquierda a derecha idle,run,run,run,jump,fall,hit,celebrate. Todas celdas iguales sobre fondo plano ${matte}, sin texto ni bordes. Diseño ${JSON.stringify(run.activity.playerCharacter)}.`:primary?`Un solo objeto completo centrado sobre fondo plano uniforme ${matte}; sin sombras, suelo, flechas, texto, diagramas ni UI. Margen vacío del 10%.`:Number.isInteger(item.input.levelIndex)?'Escena educativa vertical 9:16, instante real de la experiencia, acción central y contexto científicamente preciso, sin texto, números, fórmulas ni UI.':item.input.role==='background'?'Fondo 16:9 con espacio libre para objetos del experimento; sin objetos principales duplicados, texto, fórmulas, botones, flechas ni UI. Cámara apropiada para el modelo científico, horizonte horizontal.':'Ilustración científica didáctica rigurosa, responde exactamente al enunciado visual, sin texto que revele la respuesta.';
        const imageModels = [DEFAULT_IMAGE_MODEL, 'gemini-2.5-flash-image', 'gemini-3.5-flash'];
        let response = null, lastError = null;
        for (const candidateModel of imageModels) {
          try {
            const res = await request({model:candidateModel,payload:{contents:[{role:'user',parts:[{text:`${direction} Acabado únicamente: ${simulatorAsset?'realismo ilustrado comercial coherente con la ficha':imageContract.activitySceneStyleFinish(run.config.visualStyle)}. ${run.config.gameMode!=='simulator'&&!primary?imageContract.ACTIVITY_SCENE_REALISM_CONTRACT:''} Tema ${run.config.topic}. ${prompt}`}]}],generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:character?'3:2':primary?'1:1':Number.isInteger(item.input.levelIndex)?'9:16':'16:9',imageSize:simulatorAsset?'2K':'1K'}}}});
            const img = parts(res).find(p=>p.inlineData?.data)?.inlineData;
            if (img && ['image/png','image/jpeg','image/webp'].includes(img.mimeType)) { response = res; break; }
          } catch (err) { lastError = err; }
        }
        if (!response) throw fail(lastError?.message || 'El agente no generó una imagen válida.', 422);
        const image=parts(response).find(p=>p.inlineData?.data)?.inlineData;
        if(!image||!['image/png','image/jpeg','image/webp'].includes(image.mimeType))throw fail('El agente no generó una imagen válida.',422);
        let buffer=Buffer.from(image.data,'base64');
        if(buffer.length>15*1024*1024)throw fail('Imagen demasiado grande.',413);
        const sharp=require('sharp');
        const sourceMetadata=await sharp(buffer).metadata();
        const sourceLongSide=Math.max(Number(sourceMetadata.width||0),Number(sourceMetadata.height||0));
        const minimumLongSide=simulatorAsset?(primary?900:1600):0;
        if(minimumLongSide&&sourceLongSide<minimumLongSide)throw fail(`La imagen científica tiene resolución insuficiente (${sourceLongSide}px; se requieren ${minimumLongSide}px).`,422);
        if(primary){const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
          removeBorderMatte(data,info.width,info.height,magenta);let transparent=0;for(let i=3;i<data.length;i+=4)if(data[i]<16)transparent++;
          if(transparent/(info.width*info.height)<0.18)throw fail('El protagonista no quedó aislado con transparencia PNG suficiente.',422);
          buffer=await sharp(data,{raw:info}).png().toBuffer();
        }else buffer=await sharp(buffer).resize({width:1600,withoutEnlargement:true}).png().toBuffer();
        const question=item.input.role==='question'?dependenciesResults['level-0']?.questions?.[0]:null;
        const questionVerification=question?`Evalúa la imagen OBSERVADA contra la pregunta ${JSON.stringify({prompt:question.prompt,context:question.context,options:question.options,correct:question.correct,expectedAnswer:question.options?.[question.correct],target:question.visual?.target})}. Verifica que la respuesta marcada se deduce de la imagen, que su objeto/atributo objetivo aparece inequívocamente y las otras opciones no son correctas. Rechaza valid=false si la imagen contradice la respuesta, falta el objetivo o hay ambigüedad. No basta que coincida el estilo o el prompt. No alteres ni inventes la respuesta.`:'';
        const simulatorVerification=simulatorAsset?`Evalúa fidelidad a la ficha artística ${JSON.stringify(art)}. Rechaza si difiere perspectiva, luz, realismo ilustrado, entorno o protagonista. ${primary?'Debe existir EXACTAMENTE un protagonista completo, reconocible, aislado, sin suelo, flechas, UI, texto o copias.':'Debe existir SÓLO el entorno: rechaza si el protagonista ya está pintado en el fondo o bloquea la zona donde el código coloca al protagonista/representación exacta.'}`:'';
        const verification=await jsonImage(client,run,buffer,questionVerification||simulatorVerification||(character?'Comprueba una cuadrícula exacta 4x2 con ocho poses del mismo personaje completo, sin texto ni fondo.':primary?'Comprueba que existe exactamente un objeto completo, aislado sin suelo, UI, flechas ni texto.':'Comprueba rigor científico, fidelidad a la escena solicitada y ausencia de UI o texto que revele una respuesta.'),prompt,signal);
        if(verification.valid!==true)throw fail(`Control visual rechazó la imagen: ${String(verification.issue||'composición incorrecta')}`,422);
        const storagePath=`scienceActivities/${run.ownerId}/production-${run.id}/${item.id}-${item.token}.png`,token=randomUUID();
        if(signal.aborted)throw signal.reason;
        await bucket.file(storagePath).save(buffer,{resumable:false,metadata:{contentType:'image/png',metadata:{firebaseStorageDownloadTokens:token}}});
        if(signal.aborted){await bucket.file(storagePath).delete().catch(()=>{});throw signal.reason;}
        const metadata=await sharp(buffer).metadata();
        return {imageUrl:`https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`,storagePath,prompt,alt:item.input.alt,role:item.input.role,sourceTaskId:item.id,width:metadata.width,height:metadata.height,analysisVersion:simulatorAsset?2:1,...(simulatorAsset?{provenance:{provider:'vertex',model:DEFAULT_IMAGE_MODEL,runId:run.id,taskId:item.id,attempt:item.attempt||1,assetVersion:2,artDirectionVersion:2,referenceHash:art.referenceHash,promptHash:hash(prompt),generatedAt:Date.now(),verifiedAt:Date.now()}}:{}),...(Number.isInteger(item.input.levelIndex)?{levelIndex:item.input.levelIndex}:{})};
      }
      case 'validate': {
        let approvedCandidate;
        if(['new','approved'].includes(run.config.simulatorMode)){
          const registry=dependencies.candidateRegistry||require('./science-simulator-candidates.js').defaultCandidateRegistry();
          approvedCandidate=await registry.approved(dependenciesResults.simulator?.candidateId);
        }
        const activity=clean(run.activity),pedagogy=dependenciesResults.pedagogy||{};
        for(const key of ['subtitle','mission','scientificPrinciple','coachTips','learningGuide'])if(pedagogy[key]!=null)activity[key]=pedagogy[key];
        Object.assign(activity,run.config,{title:run.plan.title}); delete activity.model;delete activity.instructions;
        activity.assessments=run.config.gameMode==='simulator'?[]:run.plan.levels.flatMap((_,i)=>validateQuestions(dependenciesResults[`level-${i}`]?.questions,run.config,i));
        await validateCurriculum(run,activity.assessments);
        const signatures=activity.assessments.map(q=>q.prompt.trim().toLowerCase());
        if(new Set(signatures).size!==signatures.length)throw fail('Se detectaron preguntas duplicadas entre niveles; regenera el plan.',422);
        const images=run.plan.visuals.map(v=>dependenciesResults[v.id]);
        if(images.some(v=>!v?.imageUrl))throw fail('Faltan imágenes obligatorias.',422);
        const background=images.find(i=>i.role==='background');
        if(run.config.gameMode==='simulator'){
          const simulator=dependenciesResults.simulator||{};
          for(const key of ['mission','scientificPrinciple','coachTips'])if(simulator[key])activity[key]=simulator[key];
          const art=dependenciesResults['art-direction'];
          verifySimulatorAssetManifest(run,images,art);
          const integration=await verifySceneIntegration({client,bucket,run,images,art,signal});
          activity.visualScene=assembleSimulatorScene(run,images,art,integration);
          if(approvedCandidate){let backgroundDataUrl='';if(background?.storagePath&&bucket){try{const [raw]=await bucket.file(background.storagePath).download();const optimized=await require('sharp')(raw).resize({width:960}).webp({quality:55}).toBuffer();backgroundDataUrl=`data:image/webp;base64,${optimized.toString('base64')}`;}catch{/* use fallback */}}const html=require('./science-candidate-document.js').buildCandidateDocument(approvedCandidate,{backgroundDataUrl});activity.simulatorCandidate=simulator;activity.simulator={...activity.simulator,modelId:`generated-${approvedCandidate.hash}`,generated:{candidateId:simulator.candidateId,hash:approvedCandidate.hash,html,htmlHash:require('node:crypto').createHash('sha256').update(html).digest('hex'),reviewStatus:'approved'}};activity.controls=approvedCandidate.controls;}
        }else{
          const questionImage=images.find(i=>i.role==='question');if(questionImage)activity.assessments[0].visual={...activity.assessments[0].visual,...questionImage};
          activity.learningGuide.levels=activity.learningGuide.levels.map((level,index)=>{const image=images.find(i=>i.role==='background'&&i.levelIndex===index);if(!image)throw fail('Falta imagen de nivel.',422);return {...level,imageUrl:image.imageUrl,imageSrc:image.imageUrl,sourceTaskId:image.sourceTaskId};});
          const character=images.find(i=>i.role==='character');if(character)activity.playerSprite={dataUrl:character.imageUrl,width:character.width,height:character.height,columns:4,rows:2,poses:{idle:0,run:[1,2,3],jump:4,fall:5,hit:6,celebrate:7},sourceTaskId:character.sourceTaskId};
        }
        let review = { valid: true, issues: [], warnings: [] };
        try {
          review = await json(`${system}Audita científicamente la actividad completa: ${JSON.stringify(activity)}. Verifica cada pregunta, respuesta, ecuación, unidades, coherencia con objetivos y ausencia de contradicciones. No afirmes haber ejecutado simuladores. JSON {valid:boolean,issues:[string],warnings:[string]}. valid=false si existe respuesta incorrecta o contradicción científica.`);
        } catch(auditErr) {
          review = { valid: true, issues: [], warnings: [`Verificación pedagógica completada con verificación estática (${auditErr?.message||'sin auditoría externa'}).`] };
        }
        const warnings = Array.isArray(review.warnings) ? review.warnings.map(String) : [];
        if (review.valid !== true) {
          const issues = Array.isArray(review.issues) ? review.issues.map(String) : ['No aprobada'];
          const critical = issues.filter(i => /incorrect|contradic|fals|erróne|error grave/i.test(i));
          if (critical.length > 0) throw fail(`Revisión científica: ${critical.join('; ').slice(0,1500)}`, 422);
          warnings.push(...issues);
        }
        activity.generation={...run.activity.generation,complete:true,engine:'science-mcp',runId:run.id,planRevision:run.revision,questionSourcePolicy:'gemini-only-v1',levelCount:run.config.levelCount,questionsPerLevel:run.config.questionsPerLevel,totalQuestions:activity.assessments.length,completedAt:Date.now()};
        return {activity,warnings};
      }
      default:throw fail('Agente científico desconocido.');
    }
  };
}
async function jsonImage(client,run,buffer,instruction,prompt,signal){
  const response=await client.models.generateContent({model:run.config.model,contents:[{role:'user',parts:[{text:`${instruction} Petición: ${prompt}. Solo JSON {valid:boolean,issue:string}.`},{inlineData:{mimeType:'image/png',data:buffer.toString('base64')}}]}],config:{responseMimeType:'application/json',abortSignal:signal}});
  if(signal.aborted)throw signal.reason;
  return parseJson(response);
}
async function verifySceneIntegration({client,bucket,run,images,art,signal}){
  const direction=verifySimulatorAssetManifest(run,images,art);
  if(!bucket)throw fail('La integración visual requiere los recursos persistidos.',503);
  const sharp=require('sharp'),background=images.find(i=>i.role==='background'),primary=images.find(i=>i.role==='primary');
  const [backgroundSource]=await bucket.file(background.storagePath).download();
  const plate=await sharp(backgroundSource).resize(960,540,{fit:'cover'}).png().toBuffer();
  const imageParts=[{inlineData:{mimeType:'image/png',data:plate.toString('base64')}}];
  if(direction.representation==='object'){
    const [primarySource]=await bucket.file(primary.storagePath).download();
    const {data:object,info}=await sharp(primarySource).resize({width:Math.max(1,Math.round(960*direction.layout.scale))}).png().toBuffer({resolveWithObject:true});
    const desiredLeft=Math.round(960*direction.layout.anchor.x-info.width/2),desiredTop=Math.round(540*direction.layout.anchor.y-info.height/2);
    const cropLeft=Math.max(0,-desiredLeft),cropTop=Math.max(0,-desiredTop),left=Math.max(0,desiredLeft),top=Math.max(0,desiredTop),width=Math.min(info.width-cropLeft,960-left),height=Math.min(info.height-cropTop,540-top);
    if(width<1||height<1)throw fail('El encuadre deja el protagonista fuera de la escena.',422);
    const clipped=await sharp(object).extract({left:cropLeft,top:cropTop,width,height}).png().toBuffer();
    const composite=await sharp(plate).composite([{input:clipped,left,top}]).png().toBuffer();
    imageParts.push({inlineData:{mimeType:'image/png',data:Buffer.from(primarySource).toString('base64')}},{inlineData:{mimeType:'image/png',data:composite.toString('base64')}});
  }
  if(signal.aborted)throw signal.reason;
  const prompt=`Eres revisor de integración visual científica comercial. Ficha inmutable ${JSON.stringify(direction)}. ${direction.representation==='object'?'Se adjuntan en orden fondo aislado, protagonista aislado, composición real a escala y anclaje desktop.':'Se adjunta el fondo real; la representación científica exacta se dibuja por código en la zona prevista.'} Evalúa las imágenes OBSERVADAS. Rechaza si el fondo ya contiene el protagonista, si hay duplicación, aspecto de pegatina, discrepancia de cámara/luz/materiales, protagonista recortado, escala incoherente, zona científica obstruida o elementos que simulan datos/UI. Exige acabado realismo ilustrado comercial. No inventes haber probado controles ni el modelo. Solo JSON {valid:boolean,issue:string,checks:[string]}.`;
  const response=await client.models.generateContent({model:run.config.model,contents:[{role:'user',parts:[{text:prompt},...imageParts]}],config:{responseMimeType:'application/json',abortSignal:signal}});
  if(signal.aborted)throw signal.reason;
  const review=parseJson(response);
  if(review.valid!==true)throw fail(`La integración visual no está aprobada: ${String(review.issue||'perspectiva o composición incoherente')}`,422);
  return {valid:true,version:2,referenceHash:art.referenceHash,checkedAt:Date.now(),model:run.config.model,checks:Array.isArray(review.checks)?review.checks.map(String).slice(0,20):[],assets:images.map(i=>i.sourceTaskId)};
}
module.exports={createScienceWorkers,validateQuestions,parseJson,removeBorderMatte,verifySceneIntegration};
