const pairs = text => [...String(text || '').matchAll(/\(\s*(-?\d+)\s*[,;]\s*(-?\d+)\s*\)/g)].map(m=>[Number(m[1]),Number(m[2])]);
export function coordinateRiddleIssues(question = {}, plan = {}) {
  if ((question.tipo_interaccion || plan.interaction) !== 'respuesta_coordenadas') return [];
  const c=question.interaction_data || plan.interaction_data;
  if(!c?.options?.length)return ['Coordenadas: falta el mapa del acertijo.'];
  const issues=[];
  if(new Set(c.options.map(o=>o.x)).size<2 || new Set(c.options.map(o=>o.y)).size<2)issues.push('Coordenadas: el acertijo necesita un mapa con filas y columnas, no una fila de opciones.');
  for(const option of c.options)if(pairs(option.label).some(([x,y])=>x!==option.x||y!==option.y))issues.push('Coordenadas: una etiqueta contradice la posición real de su celda.');
  const correct=new Set((c.solutions||[]).flatMap(s=>s.answers.flatMap(a=>a.options)));
  for(const field of ['reto','pista','extra_hint','retroalimentacion_incorrecta']) {
    if(pairs(question[field]).some(([x,y])=>c.options.some(o=>correct.has(o.id)&&o.x===x&&o.y===y)))issues.push(`Coordenadas: ${field} revela la coordenada de destino.`);
  }
  if(pairs(c.instructions).some(([x,y])=>c.options.some(o=>correct.has(o.id)&&o.x===x&&o.y===y)))issues.push('Coordenadas: las instrucciones revelan el destino.');
  // Spatial reasoning is not limited to directional vocabulary: row/column
  // constraints and relative-position deductions are valid coordinate tasks too.
  // A word count cannot establish whether a generated deduction is sound.
  return [...new Set(issues)];
}
export const MECHANIC_COHERENCE_INSTRUCTION = `COHERENCIA DEL ACERTIJO:
La operación intelectual debe necesitar la mecánica asignada. No redactes una pregunta de recordar una palabra y la disfraces con una cuadrícula, escala o diagrama. No escribas la asociación resuelta en case_data para después pedir copiarla.
En respuesta_coordenadas el mapa local tiene filas y columnas reales y etiquetas fijas. Diseña una deducción espacial que necesite el mapa y combine las condiciones necesarias para obtener un destino único. La forma de deducirlo debe adecuarse al contenido curricular y a la dificultad elegida; no es obligatorio convertirlo en un recorrido. Si existe start_option, utiliza esa celda como referencia inicial del recorrido y no inventes otra. Si no existe, puedes plantear una deducción sin recorrido. Los ejes y la referencia inicial se muestran en la interfaz: no repitas su explicación en cada pista. x aumenta hacia la derecha e y hacia abajo. Usa instrucciones curriculares que el briefing enseñe. Comprueba privadamente que las condiciones espaciales determinan exactamente la celda de solutions y descartan las demás. No escribas la coordenada final en reto, case_data, instructions ni pistas. No pidas buscar por nombre una celda cuyo nombre o posición ya has dado. No inventes etiquetas, coordenadas, celdas o movimientos que contradigan el mapa suministrado.
En patrón aporta términos conocidos y una regla para deducir huecos, sin escribir la secuencia resuelta. En matriz y restricciones aporta condiciones que permitan deducir relaciones, no las asignaciones. En escala la magnitud y sus unidades deben ser esenciales para responder. En selección, justificación y clasificación exige aplicar la regla a un caso nuevo, no repetir una definición copiada. En diagrama deben importar las relaciones entre nodos. En evidencia la selección debe sustentar una conclusión explícita. En información suficiente define primero las condiciones que hay que demostrar. En expresión los valores deben resolver una necesidad curricular concreta: el alumno debe deducir cómo combinar cantidades y operaciones a partir de condiciones del caso. El banco, el objetivo y el máximo de fichas ya aparecen en la interfaz: no los enumeres de nuevo ni dictes la operación de solutions. Incluye una condición que haga necesario relacionar cantidades antes de ajustar el resultado. No inventes puntuaciones o claves numéricas sin relación con lo que se aprende. En balance los valores deben resolver una necesidad curricular concreta.
En construir_solucion las piezas son texto curricular, nunca una suma disfrazada. El caso debe permitir deducir qué piezas encajan y qué relación las une; no escribas la respuesta ensamblada en las pistas. No impongas un escenario narrativo. Las expresiones y balances numéricos sólo son adecuados si el objetivo curricular requiere realmente calcular cantidades; no asignes valores arbitrarios a palabras o conceptos para justificar su uso.
La dificultad desafiante requiere inferencias vinculadas, no instrucciones verbosas que narren la solución. Reserva la explicación del recorrido o de las asignaciones correctas para reasoning_steps y el feedback correcto.`;

export function expressionRiddleIssues(question = {}, plan = {}) {
  if((question.tipo_interaccion||plan.interaction)!=='construir_expresion')return [];
  const c=question.interaction_data||plan.interaction_data;if(!c)return [];
  const normalize=text=>String(text||'').replace(/[×÷−]/g,ch=>({'×':'*','÷':'/','−':'-'}[ch])).replace(/[\s,]+/g,'');
  const expressions=(c.solutions||[]).flatMap(s=>s.answers.map(a=>a.options.map(id=>c.options.find(o=>o.id===id)?.label||'').join(''))).map(normalize).filter(Boolean);
  const fields={reto:question.reto||plan.application,pista:question.pista,extra_hint:question.extra_hint||c.extra_hint,instructions:c.instructions,retroalimentacion_incorrecta:question.retroalimentacion_incorrecta};
  return Object.entries(fields).filter(([,text])=>expressions.some(expression=>normalize(text).includes(expression))).map(([field])=>'Expresión: '+field+' dicta la operación resuelta; presenta condiciones para deducirla.');
}
