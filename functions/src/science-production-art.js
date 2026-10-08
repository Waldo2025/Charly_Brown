const {fail,clean,hash}=require('./science-production-policy.js');

function validateArtDirection(source){
  const nonempty=value=>typeof value==='string'&&value.trim().length>0;
  const position=value=>value&&Number.isFinite(value.x)&&Number.isFinite(value.y)&&value.x>=0&&value.x<=1&&value.y>=0&&value.y<=1;
  if(!source||source.version!==2||source.style!=='illustrated-realism'||!nonempty(source.familyId)||!nonempty(source.environment)||!nonempty(source.backgroundPrompt)||!['object','code'].includes(source.representation)||!position(source.layout?.anchor)||!position(source.layout?.mobileAnchor)||![source.layout?.scale,source.layout?.mobileScale].every(value=>Number.isFinite(value)&&value>0&&value<=1))throw fail('La ficha de dirección artística está incompleta.',422);
  if(source.representation==='object'&&(!nonempty(source.hero)||!nonempty(source.primaryPrompt)))throw fail('La ficha artística requiere un protagonista identificable.',422);
  return clean(source);
}
async function deriveProductionArtDirection(activity,simulatorMode){
  const {getScienceSceneArtDirection}=await import('./science-scene-art-direction.mjs');
  const direction=validateArtDirection(getScienceSceneArtDirection(activity));
  // Generated models draw their scientific representation in the reviewed sandbox.
  return ['new','approved'].includes(simulatorMode)?{...direction,representation:'code'}:direction;
}
function lockArtDirection(reference,generated={}){
  const direction=validateArtDirection(reference);
  const text=(value,fallback)=>typeof value==='string'&&value.trim()?value.trim().slice(0,1800):fallback;
  return {...direction,camera:direction.camera||text(generated.camera,'Cámara coherente con la ficha y el recorrido científico.'),lighting:direction.lighting||text(generated.lighting,'Luz natural difusa desde arriba a la izquierda, sombras consistentes.'),palette:direction.palette||text(generated.palette,'Materiales naturales con acentos sobrios, contraste de lectura alto.'),compositionNotes:text(generated.compositionNotes,'Conservar el área científica despejada y la escala física del protagonista.'),specialist:'science-art-direction',referenceHash:hash(direction)};
}
function buildSimulatorAssetPrompt(run,item,art){
  const direction=lockArtDirection(run.plan.artDirection,art),primary=item.role==='primary';
  const source=primary?direction.primaryPrompt:direction.backgroundPrompt;
  return [`DIRECCIÓN ARTÍSTICA OBLIGATORIA v2: realismo ilustrado comercial de alta calidad; materiales, perspectiva, anatomía y luz físicamente verosímiles. Nunca fotografía cruda, clipart genérico ni infografía.`,
    `Tema ${run.config.topic}. Familia ${direction.familyId}. Entorno exacto: ${direction.environment}. Protagonista científico exacto: ${direction.hero}.`,
    `Cámara compartida: ${direction.camera}. Iluminación compartida: ${direction.lighting}. Paleta y materiales compartidos: ${typeof direction.palette==='string'?direction.palette:JSON.stringify(direction.palette)}.`,
    `Composición obligatoria: ${JSON.stringify(direction.layout)}. ${direction.compositionNotes}.`,
    primary?'Entrega un recorte PNG de alta resolución: genera ÚNICAMENTE el protagonista completo y aislado sobre alfa transparente, con una sombra de contacto suave e integrada en su base. Si el modelo no puede producir alfa, usa un croma plano uniforme como respaldo para que el servidor lo elimine. Conserva el ángulo, escala y luz de la ficha. NO incluyas entorno, suelo duro ni objetos extra.':'Genera ÚNICAMENTE una placa de fondo 16:9 vacía y de alta resolución para composición posterior. Debe mostrar exactamente el entorno de la ficha, su cámara, horizonte, iluminación y materiales, pero NO debe contener protagonista, copia del protagonista, personas, animales, instrumentos, objetos de primer plano, suelo de contacto, texto, UI, fórmulas ni elementos decorativos incoherentes. Conserva despejada la zona indicada para que el simulador dibuje o superponga allí el elemento científico.',
    `Instrucción específica no reemplazable: ${source}.`,
    `Sin letras, números, fórmulas, flechas, controles, gráficas, marcas de agua ni HUD; los datos y representaciones exactas se dibujan por código.`].join(' ');
}
function verifySimulatorAssetManifest(run,images,art){
  const direction=lockArtDirection(run.plan.artDirection,art);
  if(!art||art.referenceHash!==hash(validateArtDirection(run.plan.artDirection)))throw fail('Falta la revisión del especialista de dirección artística.',422);
  const required=['background',...(direction.representation==='object'?['primary']:[])];
  for(const role of required){const matching=images.filter(image=>image?.role===role);if(matching.length!==1)throw fail(`La escena requiere exactamente un recurso ${role}.`,422);const image=matching[0];
    if(!image.imageUrl||!image.storagePath||image.analysisVersion!==2||image.provenance?.runId!==run.id||image.provenance?.artDirectionVersion!==2||image.provenance?.referenceHash!==art.referenceHash)throw fail(`El recurso ${role} no tiene generación y verificación vigentes.`,422);
  }
  return direction;
}
function assembleSimulatorScene(run,images,art,integration={}){
  const direction=verifySimulatorAssetManifest(run,images,art),background=images.find(i=>i.role==='background');
  if(integration.valid!==true||integration.version!==2||integration.referenceHash!==art.referenceHash)throw fail('La escena necesita validación de integración visual vigente.',422);
  const primary=images.find(i=>i.role==='primary');
  return {version:2,status:'ready',style:'illustrated-realism',familyId:direction.familyId,representation:direction.representation,layout:direction.layout,artDirection:direction,background,
    layers:direction.representation==='object'?[{...primary,id:'primary-0',role:'primary',label:direction.hero,anchor:direction.layout.anchor,scale:direction.layout.scale,mobileAnchor:direction.layout.mobileAnchor,mobileScale:direction.layout.mobileScale,motionPreset:direction.motion?.preset||'none',driver:direction.motion?.driver||'',visible:true,depth:10,cutoutVersion:6}]:[],
    generationWarnings:[],provenance:{engine:'science-mcp',runId:run.id,planRevision:run.revision,artDirectionVersion:2,referenceHash:art.referenceHash,integration,assets:images.map(i=>({role:i.role,storagePath:i.storagePath,taskId:i.sourceTaskId,promptHash:i.provenance?.promptHash}))}};
}
module.exports={validateArtDirection,deriveProductionArtDirection,lockArtDirection,buildSimulatorAssetPrompt,verifySimulatorAssetManifest,assembleSimulatorScene};
