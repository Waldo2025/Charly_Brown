const normalized = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
const unique = values => [...new Map(values.filter(v=>String(v||'').trim()).map(v=>[normalized(v),String(v).trim()])).values()];
export const PEDAGOGY_VERSION = 4;
export function selectedExperienceInstruction(context = {}) {
  const narrative=context.narrativaBase === 'otro'
    ? String(context.narrativaPersonalizada || context.narrativa || '').trim()
    : String(context.narrativa || context.narrativaBase || '').trim();
  return `EXPERIENCIA DEL AUTOR (configuración vigente): ${JSON.stringify({
    narrativa:narrative, ritmo:context.ritmo || '', dificultad:context.dificultad || '',
    pistas:context.pistas || '', publico:context.publico || '', idioma:context.idioma || '',
    formato:context.modoPresentacion || '', estilo_visual:context.estiloImagen || '',
    recompensa:context.experience_config?.primary_reward || '', extras:context.experience_config?.extras || []
  })}
La narrativa seleccionada, incluida la personalizada, determina el mundo, la voz, los personajes, los objetos, el conflicto y las transiciones del briefing y de todas las salas. Desarrolla esa elección: no sustituyas su género por un escenario usado en ejemplos o en un objetivo anterior. Si el brief de Sheets trae otra ambientación, conserva su contenido académico y adapta la ambientación a la selección actual.
El ritmo determina cómo progresa la escena; la dificultad determina la inferencia necesaria, no vocabulario innecesariamente difícil. Respeta el público y el idioma. La política de pistas regula la ayuda sin revelar respuestas. El estilo visual guía los recursos gráficos y no reemplaza la narrativa seleccionada. La recompensa y los extras se entregan mediante los controles del juego: no anuncies letras si se eligió otra recompensa ni inventes acciones que el jugador no puede realizar.
Si no hay narrativa seleccionada, conserva la del brief. No impongas un género, escenario o recurso narrativo por defecto.`;
}

export const BRIEFING_NARRATIVE_INSTRUCTION = `REDACCIÓN DEL BRIEFING COMO ESCENA:
Escribe una lectura conectada y entretenida, no una lista de definiciones. Usa la narrativa elegida, la edad y el idioma del alumnado. mission.contexto abre con una situación concreta y un propósito de acción coherentes con la experiencia seleccionada; no repitas la introducción global ni expliques los controles del juego.
Deriva la voz, las situaciones y la forma de presentar la información de la configuración del autor y del contenido de esta sala. No utilices un catálogo prefijado de escenarios, personajes, objetos o documentos. Integra los conocimientos en lo que sucede y en las decisiones necesarias para avanzar. Mantén la continuidad de la experiencia sin repetir el mismo recurso de presentación en todos los acertijos. El tipo de pregunta determina la interacción, no la ambientación ni el soporte narrativo. Sólo introduce un recurso cuando tenga una función necesaria en esta situación.
knowledge y teaching_example se mostrarán juntos como un párrafo: knowledge explica con claridad una regla necesaria dentro de la escena; teaching_example continúa esa misma voz con un suceso de ejemplo que permite entenderla. Evita la alternancia de una definición de libro seguida de un ejemplo aislado. Usa transiciones naturales entre los párrafos, detalles concretos y un tono acorde con el ritmo y la experiencia elegidos, sin imponer tensión ni urgencia ajenas a esa elección.
Cuando varias preguntas utilicen exactamente el mismo aprendizaje, reutiliza literalmente knowledge y teaching_example; PigPen mostrará ese párrafo una sola vez. Cambia los casos evaluados, no multipliques explicaciones idénticas con sinónimos.
No envuelvas cada dato en una historia nueva ni agregues personajes por pregunta. Prioriza frases breves y una escena fácil de seguir. El interés y la dificultad nacen de lo que sucede y de las deducciones necesarias. No ocultes una regla indispensable ni sustituyas datos precisos por metáforas.
mission.reto cierra la lectura con una consecuencia pendiente que conecta con los desafíos, sin resumir sus soluciones. datos_clave contiene sólo recordatorios breves de procedimientos, sin copiar párrafos, ejemplos ni respuestas. La ambientación nunca modifica una regla curricular ni revela la solución.`;
export const PEDAGOGY_INSTRUCTION = `CONTRATO PEDAGÓGICO:
knowledge será una explicación para el alumno, no una etiqueta: enseña el concepto, criterio o procedimiento necesario y define el vocabulario. teaching_example demuestra cómo aplicarlo con otro caso, datos y resultado distintos de los evaluados. Ambos se mostrarán en el briefing; nunca incluyas el solucionario del acertijo.
case_data contiene únicamente observaciones y condiciones públicas del caso, no las asociaciones correctas, la interpretación ya resuelta ni la selección de opciones. PigPen mostrará todos esos datos en el enunciado. application formula la tarea sin resolverla. Las soluciones y sus justificaciones pertenecen sólo a los campos privados y al feedback correcto.
Cualquier cifra, escala, mapa o protocolo ficticio necesario debe estar definido explícitamente en case_data o en la interfaz. Nunca presentes una cifra inventada como norma real o universal. Si se trata de una convención del juego, di que es una regla de este escenario. En comunicación cultural evita afirmaciones universales, inferir emociones con certeza a partir de un gesto o generalizar continentes enteros: especifica contexto y límites.
Información suficiente requiere condiciones explícitas de éxito; un patrón requiere términos conocidos y una regla deducible; coordenadas requieren referencias visibles; escalas requieren unidades y significado de sus marcas. No pidas consultar un mapa, informe, imagen o norma que no se incluya realmente. Los datos de las fichas pueden aportarlos.
El objetivo curricular determina la tarea: no conviertas lenguaje corporal en una suma de puntos sin aprendizaje lingüístico. Si una mecánica usa cantidades, el alumno debe aplicar un contenido cuantitativo o vocabulario de medidas presente en el currículo, no sólo sumar para ambientar. No inventes un nuevo objetivo para justificar una interfaz.
Las pistas enseñan un procedimiento de revisión: no seleccionan fichas, no asignan parejas, no dan posiciones, números ni la expresión resuelta. Cambiar el tipo de interacción no convierte el mismo caso en una evaluación distinta. synthesis integra los aprendizajes indicados mediante condiciones que sean todas necesarias.`;

export function composePedagogicalRoom(combined, slots) {
  const result=structuredClone(combined),mission=result.mission;
  const sections=[];
  for(const slot of slots){
    const plan=result.plans[slot.plan_id];
    if(!plan)continue;
    const index=slots.indexOf(slot),question=mission.preguntas[index];
    if(!question)continue;
    sections.push(unique([plan.knowledge,plan.teaching_example]).join(" "));
    const facts=unique(plan.case_data||[]).filter(f=>!normalized(plan.application).includes(normalized(f)));
    question.reto=unique([...facts,plan.application]).join('\n\n');
  }
  mission.contexto=unique([mission.contexto,...sections]).join('\n\n');
  // datos_clave is a summary, never the answer bank or private evidence.
  mission.datos_clave=unique(mission.datos_clave || []).slice(0,5);
  return result;
}

export function pedagogicalRoomIssues(mission, plans) {
  const issues=[],brief=normalized(mission?.contexto);
  for(const [index,plan] of plans.entries()){
    const prefix=plan.plan_id||`pregunta ${index+1}`,q=mission?.preguntas?.[index]||{};
    const publicCase=normalized([q.reto,q.interaction_data?.instructions,...(q.interaction_data?.options||[]).map(o=>o.label)].join('\n'));
    if(!String(plan.knowledge||'').trim() || !brief.includes(normalized(plan.knowledge)))issues.push(`${prefix}: el conocimiento necesario no aparece en el briefing visible.`);
    if(!String(plan.teaching_example||'').trim() || !brief.includes(normalized(plan.teaching_example)))issues.push(`${prefix}: falta un ejemplo resuelto distinto en el briefing visible.`);
    for(const fact of plan.case_data||[])if(!publicCase.includes(normalized(fact)))issues.push(`${prefix}: un dato necesario sólo está en el plan privado: ${fact}`);
    if(normalized(plan.teaching_example)===normalized(plan.application) || (plan.case_data||[]).some(f=>normalized(f).length>25 && normalized(plan.teaching_example).includes(normalized(f))))issues.push(`${prefix}: el ejemplo del briefing reutiliza los datos del caso evaluado.`);
    const c=q.interaction_data||plan.interaction_data;
    const optionIds=new Set((c?.solutions||[]).flatMap(s=>s.answers.flatMap(a=>a.options)));
    const labels=(c?.options||[]).filter(o=>optionIds.has(o.id)).map(o=>normalized(o.label)).filter(v=>v.length>2);
    const application=normalized(plan.application);
    if(c && /(?:matches|corresponds|displays|maps to|equivale|corresponde|→)/u.test(application)) {
      const disclosed=(c.solutions||[]).flatMap(s=>s.answers).filter(a=>{
        const target=normalized(c.targets.find(t=>t.id===a.target)?.label);
        return target.length>3 && application.includes(target) && a.options.some(id=>{
          const label=normalized(c.options.find(o=>o.id===id)?.label);
          return label.length>3 && application.includes(label);
        });
      });
      if(disclosed.length>=2)issues.push(`${prefix}: el enunciado presenta las correspondencias resueltas en lugar de pedir deducirlas.`);
    }
    for(const fact of plan.case_data||[])if(normalized(plan.answer_target).length>25 && normalized(fact)===normalized(plan.answer_target))issues.push(`${prefix}: CASE_DATA contiene la respuesta privada completa, no un dato del caso.`);
    const hints=[q.pista,q.extra_hint,c?.extra_hint,q.retroalimentacion_incorrecta];
    for(const hint of hints){
      const h=normalized(hint);
      if(!/\b(select|choose|highlight|sort|place|enter|write|selecciona|elige|marca|coloca|escribe|ubica)\b/u.test(h))continue;
      const direct=labels.filter(label=>h.includes(label));
      const assignments=(c?.solutions||[]).some(s=>s.answers.some(a=>{
        const target=normalized(c.targets.find(t=>t.id===a.target)?.label);
        return target.length>3 && h.includes(target) && a.options.some(id=>{const label=normalized(c.options.find(o=>o.id===id)?.label);return label && h.includes(label);});
      }));
      if(direct.length>=2 || assignments)issues.push(`${prefix}: la ayuda asigna o selecciona respuestas correctas; debe orientar el procedimiento.`);
    }
  }
  return [...new Set(issues)];
}
