import {fixedInteraction} from '../../public/js/pigpen-fixed-content.mjs';
import {experience as E} from '../../public/js/escape-room-experience.mjs';
export function contractFor(type) {
  if(type==='construir_solucion'){const c=fixedInteraction(type,E);c.options.forEach((o,i)=>o.label='Pieza '+i);c.targets.forEach((t,i)=>t.label='Parte '+i);c.instructions='Deduce las tres partes.';c.extra_hint='Contrasta las relaciones.';return c;}
  const c={version:1,instructions:'Aplica las evidencias y reglas del caso.',extra_hint:'Contrasta las propiedades antes de decidir.',options:[{id:'a',label:'A',value:1,x:1,y:1},{id:'b',label:'B',value:2,x:2,y:1},{id:'c',label:'C',value:3,x:3,y:1}],targets:[{id:'t',label:'Respuesta',allowed:[],x:30,y:30}],solutions:[{answers:[{target:'t',options:['a']}]}],connections:[],rules:[],minimum:1,maximum:12,goal:0};
  if(type==='seleccion_multiple')c.options.push({id:'d',label:'D',value:4,x:4,y:1});
  const family=E.get(type).family;
  if(['respuesta_justificacion','corregir_error'].includes(type)||['matrix','attributes','diagram','balance','scale'].includes(family)||['clasificar_grupos','resolver_restricciones'].includes(type)) {
    c.targets.push({id:'u',label:'Segunda respuesta',allowed:[],x:70,y:70});c.solutions[0].answers.push({target:'u',options:['b']});
  }
  if(['multi','evidence'].includes(family))c.solutions[0].answers[0].options=['a','c'];
  if(family==='attributes')c.solutions[0].answers[0].options=['a','c'];
  if(family==='diagram')c.connections=[{from:'t',to:'u'}];
  if(type==='resolver_restricciones')c.rules=[{kind:'different',a:'',b:'',value:0},{kind:'before',a:'a',b:'b',value:0}];
  if(family==='expression'){c.options=[{id:'a',label:'3',value:3,x:0,y:0},{id:'b',label:'+',value:0,x:0,y:0},{id:'c',label:'4',value:4,x:0,y:0}];c.goal=7;c.solutions[0].answers[0].options=['a','b','c'];}
  if(family==='balance')c.goal=3;
  return c;
}
export function questionFor(type,i=0){return {id:'q'+i,titulo:E.get(type).label,tipo_interaccion:type,interaction_contract_version:1,interaction_data:contractFor(type),reto:'Resuelve el caso utilizando los datos del briefing.',pista:'Primera pista',retroalimentacion_correcta:'Correcto',retroalimentacion_incorrecta:'Revisa los datos.'};}
export function projectFor(types=['seleccion_multiple'],primary='letras',extras=[]){return {titulo:'PigPen experiencias',idioma:'es-419',clave_final:'SOL',conclusion:'Misión completada',introduccion:'Instrucciones',instrucciones:'Lee y resuelve',duracion_minutos:30,experience_config:E.config({question_types:types,primary_reward:primary,extras}),misiones:[{id:'m1',titulo:'Sala 1',contexto:'Las evidencias del expediente permiten distinguir los tres casos presentados. Compara sus propiedades y aplica la condición del problema para encontrar una solución comprobable.',contexto_requerido:false,preguntas:types.map(questionFor)}]};}
