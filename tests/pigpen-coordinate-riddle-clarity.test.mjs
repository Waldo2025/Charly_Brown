import test from 'node:test';
import assert from 'node:assert/strict';
import {experience as E} from '../public/js/escape-room-experience.mjs';
import {questionInteractionIssues,coordinateRiddleIssues} from '../public/js/escape-room-question-policy.mjs';
import {contractFor} from './fixtures/pigpen-experience.mjs';

function coordinateQuestion(reto){
  const options=Array.from({length:9},(_,i)=>({id:`cell${i}`,label:String.fromCharCode(65+i),value:0,x:i%3+1,y:Math.floor(i/3)+1}));
  return {titulo:'Navegación por coordenadas',reto,tipo_interaccion:'respuesta_coordenadas',interaction_data:{
    ...contractFor('respuesta_coordenadas'),instructions:'Selecciona la casilla de destino.',
    options,targets:[{id:'t',label:'Destino',allowed:[]}],solutions:[{answers:[{target:'t',options:['cell8']}]}],
    start_option:'cell4'
  }};
}

test('generated coordinate routes must state their start and quantified x/y movement',()=>{
  const unclear=coordinateQuestion("En el tablero de navegación del estadio se muestra una cuadrícula de 3x3 celdas con la celda inicial 'E' ubicada en el centro (x=2, y=2). Siguiendo la regla de desplazamiento lineal donde el movimiento horizontal avanza hacia la derecha y el vertical hacia abajo según la función de posición, localiza y selecciona la celda final exacta que corresponde al destino del indicador.");
  unclear.interaction_data.instructions='Localiza en la cuadrícula la celda que corresponde a la coordenada final tras aplicar el desplazamiento indicado.';
  const issues=questionInteractionIssues(unclear,{generated:true});
  assert.ok(issues.some(issue=>issue.includes('cuántas columnas')));
  assert.ok(issues.some(issue=>issue.includes('cuántas filas')));
  const clear=coordinateQuestion('Empieza en E (2, 2). Avanza una columna a la derecha y una fila hacia abajo. ¿En qué casilla terminas?');
  assert.deepEqual(questionInteractionIssues(clear,{generated:true}),[]);
  assert.deepEqual(coordinateRiddleIssues(clear),[]);
});

test('coordinate interaction names the ordered pair, axis direction, and row/column headers',()=>{
  const contract=contractFor('respuesta_coordenadas');
  contract.start_option='b';
  const html=E.render('respuesta_coordenadas',contract,{},'room::coordinate');
  assert.match(html,/Par \(x, y\): x es la columna, de izquierda a derecha; y es la fila, de arriba hacia abajo/);
  assert.match(html,/La casilla marcada «Inicio» indica desde dónde comenzar/);
  assert.match(html,/exp-coordinate-cell[^\"]*is-start/);
  assert.match(html,/exp-start-indicator[^>]*>Inicio<\/span>/);
  assert.match(html,/aria-label="B \(2, 1\), Inicio"/);
  assert.match(html,/y ↓ \/ x →/);
  assert.match(html,/\(1, 1\)/);
});
