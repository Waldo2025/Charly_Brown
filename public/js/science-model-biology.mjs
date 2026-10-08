import { finite as num, clampModel as clamp, bars } from "./science-model-common.mjs";
const fmt=value=>Number(value.toFixed(2));
function measureBiology(model,values={}){
  const v=(id,f=0)=>num(values[id],f);
  if(model==="cell-structure"){
    if(values.sampleCells!=null){const cellEvidence=clamp((v("organizedCells")+v("newCells"))/2+Math.min(20,v("sampleCells")/5),0,100);return{value:cellEvidence,cellEvidence,unit:"%",label:"Evidencia celular",formula:"evidencia = organización + origen celular"}}
    if(values.dnaAccess!=null){const rnaOutput=v("dnaAccess")*v("transcription")*v("rnaExport")/10000;return{value:rnaOutput,rnaOutput,unit:"u/min",label:"ARN producido y exportado",formula:"ARN ∝ ADN accesible·transcripción·exportación"}}
    const organelles=v("organelleCount",v("ribosomes",40)/8),resources=(v("nutrients",v("metabolism",60))+v("oxygen",v("nucleusIntegrity",80)))/2,cellHealth=clamp(resources*.72+Math.min(28,organelles*2.4),0,100);return{value:cellHealth,cellHealth,unit:"%",label:"Estado funcional celular",formula:"estado = recursos + estructuras funcionales"}
  }
  if(model==="membrane-transport"){const concentrationGradient=v("externalConcentration")-v("internalConcentration"),netFlux=concentrationGradient*v("permeability")*(1+v("channels")/10);return{value:netFlux,netFlux,concentrationGradient,unit:"u/s",label:"Flujo neto",formula:"J = P·(Cext − Cint)·(1+canales/10)"}}
  if(model==="cell-metabolism"){
    if(values.light!=null){const optimum=values.temperature==null?1:clamp(1-Math.abs(v("temperature")-25)/30,0,1),photosynthesisRate=Math.min(v("light"),v("carbonDioxide"),v("water"))*optimum*Math.min(1.5,v("chloroplastCount",10)/8),oxygenOutput=photosynthesisRate*.8;return{value:photosynthesisRate,photosynthesisRate,oxygenOutput,unit:values.chloroplastCount!=null?"u/min":"%",label:"Tasa fotosintética",formula:"tasa ∝ luz·CO₂·agua"}}
    if(values.messengerRna!=null){const proteinRate=Math.min(v("messengerRna"),v("aminoAcids"))*v("activeRibosomes")/10*v("translationAccuracy")/100;return{value:proteinRate,proteinRate,unit:"aa/s",label:"Síntesis proteica",formula:"proteína ∝ ARNm·ribosomas·aminoácidos"}}
    const optimum=values.temperature==null?1:clamp(1-Math.abs(v("temperature")-37)/25,0,1),atpRate=Math.min(v("glucose"),v("oxygen"))*optimum*Math.min(1.5,v("mitochondriaCount",8)/8),demand=v("energyDemand",v("activity",50)),energyBalance=atpRate-demand,carbonDioxideOutput=atpRate*.75;return{value:atpRate,atpRate,energyBalance,carbonDioxideOutput,unit:"u/min",label:"Producción de ATP",formula:"ATP ∝ glucosa·O₂"}
  }
  if(model==="genetics-expression"){
    if(values.adenine!=null){const adenine=v("adenine"),cytosine=v("cytosine"),basePairBalance=100-(Math.abs(adenine-(100-adenine))+Math.abs(cytosine-(100-cytosine)))/2,geneticAccuracy=clamp(basePairBalance-v("mutationRate"),0,100),replicationSpeed=Math.max(1,v("sequenceLength")/20);return{value:geneticAccuracy,geneticAccuracy,basePairBalance,replicationSpeed,unit:"%",label:"Pares de bases correctos",formula:"exactitud = 100 − (|A−T| + |C−G|)/2 − mutaciones"}}
    if(values.templateLength!=null){const transcriptionRate=Math.min(v("transcriptionSpeed"),v("nucleotides")/5);return{value:transcriptionRate,transcriptionRate,errorRate:v("errorRate"),unit:"nt/s",label:"ARN transcrito",formula:"ADN molde → ARNm"}}
    if(values.promoterStrength!=null){const geneExpression=clamp((v("promoterStrength")+v("activators")-v("repressors"))*v("rnaStability")/100,0,100);return{value:geneExpression,geneExpression,unit:"%",label:"Expresión génica",formula:"expresión = promotor + activadores − represores"}}
    if(values.chromosomeCount!=null){return{value:v("condensation"),condensation:v("condensation"),replication:v("replication"),chromosomeCount:v("chromosomeCount"),homologPairing:v("homologPairing"),unit:"%",label:"Condensación cromosómica",formula:"cromatina → cromosoma"}}
    const mutationImpact=(v("mutationType")+1)*v("codingRegion",1)*(100-v("repairEfficiency"))/3;return{value:mutationImpact,mutationImpact,unit:"%",label:"Impacto proteico",formula:"impacto = tipo·región·(1−reparación)"}
  }
  if(model==="cell-division"){
    if(values.parentA!=null){const pa=v("parentA")/2,pb=v("parentB")/2,aa=(1-pa)*(1-pb),AA=pa*pb,Aa=pa*(1-pb)+(1-pa)*pb,dominantPhenotype=(1-aa)*100,recessivePhenotype=aa*100,offspring=Math.max(4,Math.round(v("offspring",16))),value=v("dominance",1)?dominantPhenotype:recessivePhenotype;return{value,dominantPhenotype,recessivePhenotype,offspring,AA,Aa,aa,unit:"%",label:v("dominance",1)?"Probabilidad de fenotipo dominante":"Probabilidad de fenotipo recesivo",formula:"P(AA)=pA·pB; P(aa)=(1−pA)(1−pB)",visual:bars([["AA esperados",AA*offspring],["Aa esperados",Aa*offspring],["aa esperados",aa*offspring]],"descendientes esperados")}}
    const meiosis=values.crossingOver!=null,maxPhase=meiosis?8:4,requestedPhase=clamp(Math.round(v("phase")),0,maxPhase),replicationReady=meiosis||v("replication",100)>=100,checkpointReady=v("checkpoint",100)>=80,separationReady=v(meiosis?"segregation":"spindle",100)>=50,effectivePhase=Math.min(requestedPhase,!replicationReady?0:!checkpointReady?1:!separationReady?2:maxPhase),progress=effectivePhase/maxPhase*100,gametes=meiosis&&effectivePhase>=8?4:effectivePhase>=4?2:1;return{value:progress,divisionProgress:progress,gametes,effectivePhase,recombination:v("crossingOver"),unit:"%",label:effectivePhase<requestedPhase?"Fase detenida: revisa replicación, control y separación":meiosis?"Progreso meiótico":"Progreso mitótico",formula:meiosis?"1 célula → 4 gametos":"1 célula → 2 células"}
  }
  if(model==="population-evolution"){
    if(values.initialTrait!=null){const traitFrequency=clamp(v("initialTrait")+(v("selectionPressure")+v("migration"))*v("generations")/20,0,100);return{value:traitFrequency,traitFrequency,population:100,unit:"%",label:"Frecuencia del rasgo",formula:"Δf = selección + migración"}}
    const survivalRate=clamp(v("traitMatch")*.55+v("resources")*.35+v("reproduction")*.25-v("predation")*.25,0,100);return{value:survivalRate,survivalRate,population:100,unit:"%",label:"Supervivencia del rasgo",formula:"éxito = supervivencia·reproducción"}
  }
  if(model==="organism-classification"){
    if(values.sharedTraits!=null){const classificationScore=clamp(v("sharedTraits")/Math.max(1,v("totalTraits"))*70+v("molecularEvidence")*.3,0,100);return{value:classificationScore,classificationScore,unit:"%",label:"Coincidencia taxonómica",formula:"similitud = caracteres + evidencia molecular"}}
    if(values.organization!=null){const lifeCriteria=(v("organization")+v("metabolism")+v("reproduction")+v("response"))/4;return{value:lifeCriteria,lifeCriteria,unit:"%",label:"Criterios vitales",formula:"vida = organización + metabolismo + reproducción + respuesta"}}
    if(values.light!=null){const plantGrowth=Math.min(v("light"),v("water"),v("minerals"))*(1-Math.abs(v("stomata")-55)/140);return{value:plantGrowth,plantGrowth,leaves:Math.round(plantGrowth/10),unit:"%",label:"Crecimiento vegetal",formula:"crecimiento ∝ luz·agua·minerales"}}
    const energyUse=v("basalDemand")+v("activity")*12+Math.abs(v("temperature")-22)*18,energyBalance=v("foodEnergy")-energyUse;return{value:energyBalance,energyBalance,energyUse,unit:"kcal",label:"Balance energético",formula:"balance = ingreso − gasto"}
  }
  if(model==="microorganism-growth"){
    if(values.antibiotic!=null){const optimum=clamp(1-Math.abs(v("temperature")-37)/37,0,1),growthRate=v("nutrients")*optimum,microbePopulation=clamp(growthRate-v("antibiotic")*(1-v("resistance")/100),0,100);return{value:microbePopulation,microbePopulation,growthRate,unit:"%",label:"Índice didáctico de población bacteriana",formula:"crecimiento − efecto antibiótico"}}
    if(values.receptors!=null){const infectionRate=clamp(v("receptors")*v("viralLoad")/100*(1-v("cellResponse")/120)*(1+v("elapsedTime")/24),0,100),replicationRate=infectionRate/10;return{value:infectionRate,infectionRate,replicationRate,unit:"%",label:"Células infectadas",formula:"infección ∝ receptores·carga viral"}}
    const optimum=clamp(1-Math.abs(v("temperature")-25)/25,0,1),fungalGrowth=Math.min(v("humidity"),v("substrate"))*optimum*Math.min(1.5,v("spores")/20);return{value:fungalGrowth,fungalGrowth,unit:"%",label:"Extensión del micelio",formula:"crecimiento ∝ humedad·sustrato·temperatura"}
  }
  if(model==="human-physiology"){
    if(values.carbohydrates!=null){const energy=v("carbohydrates")*4+v("proteins")*4+v("fats")*9,energyBalance=energy-v("energyDemand");return{value:energy,energyBalance,unit:"kcal",label:"Energía alimentaria",formula:"E = 4C + 4P + 9G"}}
    if(values.foodAmount!=null){const phFit=clamp(1-Math.abs(v("ph")-3)/6,0,1),absorption=clamp(v("foodAmount")*v("enzymes")/100*phFit*Math.min(1.3,v("transitTime")/8),0,100);return{value:absorption,absorption,unit:"%",label:"Nutrientes absorbidos",formula:"absorción ∝ enzimas·pH·tiempo"}}
    if(values.breathingRate!=null){const ventilation=v("breathingRate")*v("tidalVolume"),oxygenExchange=ventilation*v("ambientOxygen")/21,relativeDemand=1+v("activity")/100;return{value:ventilation,ventilation,oxygenExchange,relativeDemand,supplyDemandRatio:oxygenExchange/(7*relativeDemand),unit:"L/min",label:"Ventilación",formula:"V = frecuencia·volumen"}}
    if(values.heartRate!=null){const cardiacOutput=v("heartRate")*v("strokeVolume")/1000,bloodFlow=cardiacOutput/Math.max(.01,v("vascularResistance",100)/100),relativeDemand=1+v("demand")/100;return{value:cardiacOutput,cardiacOutput,bloodFlow,relativeDemand,supplyDemandRatio:bloodFlow/(5*relativeDemand),unit:"L/min",label:"Gasto cardiaco",formula:"GC = FC·VS"}}
    if(values.stimulus!=null){const nerveFrequency=Math.max(0,v("stimulus")-v("threshold"))*(.8+v("myelin")/200)/Math.max(1,v("synapses")/5);return{value:nerveFrequency,nerveFrequency,unit:"Hz",label:"Frecuencia de impulsos",formula:"disparo si estímulo ≥ umbral"}}
    if(values.secretion!=null){const hormoneLevel=clamp((v("secretion")-v("degradation")*.5)*(1-v("feedback")/200)*(.5+v("receptors")/200),0,100);return{value:hormoneLevel,hormoneLevel,unit:"%",label:"Nivel hormonal",formula:"nivel = secreción − degradación"}}
    if(values.pathogenLoad!=null){const immuneResponse=clamp(v("immuneMemory")*.35+v("antibodies")*.4+v("effectorCells")*.4,0,120),remainingPathogen=clamp(v("pathogenLoad")-immuneResponse,0,100);return{value:remainingPathogen,remainingPathogen,immuneResponse,unit:"%",label:"Carga patógena restante",formula:"carga restante = patógeno − respuesta"}}
    const homeostasisError=clamp((Math.abs(v("bodyTemperature")-37)/4*35+Math.abs(v("bloodGlucose")-90)/160*35+Math.abs(v("hydration")-70)/70*30)*(1-v("feedback")/150),0,100);return{value:homeostasisError,homeostasisError,regulatedVariables:3,unit:"%",label:"Error homeostático",formula:"error = desviación·(1−retroalimentación)"}
  }
  if(model==="ecosystem-dynamics"){
    if(values.solarEnergy!=null){
      const capturedEnergy=v("solarEnergy")*v("producerCapture")/100;
      const transfers=Math.max(1,Math.round(v("trophicLevels"))-1);
      const finalEnergy=capturedEnergy*Math.pow(v("transferEfficiency")/100,transfers);
      const dissipatedEnergy=Math.max(0,v("solarEnergy")-finalEnergy);
      return{value:finalEnergy,finalEnergy,energyFlow:finalEnergy,capturedEnergy,dissipatedEnergy,unit:"kJ",label:"Energía del último nivel",formula:"Eproductores = Esolar·captura; Eₙ₊₁ = Eₙ·eficiencia"}
    }
    if(values.producerEnergy!=null){const finalEnergy=v("producerEnergy")*Math.pow(v("transferEfficiency")/100,Math.max(1,v("trophicLevels")-1)),energyFlow=finalEnergy,consumerDemand=finalEnergy*v("populationDemand")/100;return{value:finalEnergy,finalEnergy,energyFlow,consumerDemand,availableEnergy:finalEnergy-consumerDemand,unit:"kJ",label:"Energía del último nivel",formula:"Eₙ₊₁ = Eₙ·eficiencia"}}
    if(values.atmosphere!=null){const cycleBalance=v("atmosphere")-(v("biosphere")+v("geosphere"))/2+v("humanFlux"),cycleFlux=Math.abs(cycleBalance);return{value:cycleBalance,cycleBalance,cycleFlux,reservoirs:3,unit:"%",label:"Balance del reservorio",formula:"balance = entradas − salidas"}}
    if(values.speciesRichness!=null){const diversityIndex=clamp(Math.sqrt(v("speciesRichness"))*10*v("evenness")/100*v("habitatQuality")/70-v("disturbance")*.25,0,100);return{value:diversityIndex,diversityIndex,populationTurnover:v("disturbance"),unit:"%",label:"Índice de diversidad",formula:"diversidad = riqueza·equidad·hábitat"}}
    const ecosystemStability=clamp(Math.min(v("producers"),v("resources"))*1.1-Math.abs(v("consumers")-v("producers")*.65)*.5-v("disturbance")*.4,0,100),populationRate=(v("producers")+v("consumers"))/2;return{value:ecosystemStability,ecosystemStability,populationRate,unit:"%",label:"Estabilidad del ecosistema",formula:"estabilidad = recursos − competencia − perturbación"}
  }
  return null;
}
export function calculateBiologyModel(model,values={}){
  const measurement=measureBiology(model,values);
  if(!measurement)return null;
  if(model==="human-physiology"){
    if(values.carbohydrates!=null)measurement.visual=bars([["Carbohidratos",num(values.carbohydrates)*4],["Proteínas",num(values.proteins)*4],["Grasas",num(values.fats)*9],["Demanda",num(values.energyDemand)]],"kcal");
    else if(values.secretion!=null)measurement.visual=bars([["Secreción",num(values.secretion)],["Degradación",num(values.degradation)],["Respuesta didáctica",measurement.hormoneLevel]],"% relativo");
    else if(values.pathogenLoad!=null)measurement.visual=bars([["Carga inicial",num(values.pathogenLoad)],["Respuesta",measurement.immuneResponse],["Carga restante",measurement.remainingPathogen]],"% relativo");
    else if(values.bodyTemperature!=null)measurement.visual=bars([["Desviación térmica",Math.abs(num(values.bodyTemperature)-37)/4*100],["Desviación glucosa",Math.abs(num(values.bloodGlucose)-90)/160*100],["Desviación agua",Math.abs(num(values.hydration)-70)/70*100],["Error regulado",measurement.homeostasisError]],"% de escala didáctica");
  }
  return measurement;
}
