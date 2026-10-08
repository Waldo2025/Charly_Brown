const { createCore } = require('./pigpen-generation-core.generated.js');
const clone = value => structuredClone(value);
const invalid = message => Object.assign(new Error(message), { status: 422 });

function createEngine(requestQualityJson) {
  const c = createCore({ requestQualityJson });
  async function objective(context) {
    const count = context.misiones;
    const source = context.sourceContract || c.buildObjectiveSourceContract(context);
    const schema = c.buildObjectiveFoundationResponseSchema(count);
    const document = c.contentDocument(c.fixedSchemaValue(schema));
    const prompt = c.buildObjectiveFoundationPrompt(context, source, count).replace(/<OUTPUT_FORMAT>[\s\S]*?<\/OUTPUT_FORMAT>/g, '')
      + '\nCrea sólo el plan maestro y el reparto curricular; no redactes preguntas. Asigna a cada sala casos y subtemas distintos. Define las transiciones de todas las salas ahora.\n'
      + c.contentInstructions(document);
    const text = await requestQualityJson(prompt, context, .3, { textOnly: true, expectedContent: document });
    const filled = c.fillContentDocument(document, text);
    const issues = c.validateFixedObjectiveFill(filled, schema, 'Plan maestro');
    if (issues.length) throw invalid(issues.join(' · '));
    const foundation = c.normalizeObjectiveBrief(filled);
    const code = c.normalizeThematicFinalWord(source.fixed_final_code || foundation.final_unlock.code, count)
      || await c.requestThematicObjectiveUnlockWord(context, foundation, count, foundation.final_unlock.code);
    foundation.final_unlock.code = code;
    const fragments = c.partitionThematicFinalWord(code, count);
    const templates = c.buildDeterministicQuestionPlanTemplate(context, source);
    foundation.rooms.forEach((room, i) => {
      room.room_number = i + 1;
      if (i) room.narrative_beat.incoming_state = foundation.rooms[i - 1].narrative_beat.next_state;
      room.fixed_code_fragment = fragments[i];
      room.interaction_anchor = templates[i].interaction_anchor;
      room.question_plans = clone(templates[i].question_plans);
      room.reserve_opportunity = clone(templates[i].reserve_opportunity);
    });
    if (source.explicit_title) foundation.project_copy.title = source.explicit_title;
    const master = c.attachObjectiveCompilationMetadata(foundation, context, source);
    master.parallel_plan_version = 1;
    master.experience_config = c.experience.config(context.experience_config);
    master.reward_plan = c.rewardEngine.buildPlan(master.experience_config, code, master.rooms.map((r,i) => ({ id: String(i), titulo: r.title, fragment: fragments[i], learning: r.learning_focus })));
    master.templates = templates;
    return master;
  }
  async function room(context, master, index) {
    const cached = c.getReusableObjectiveGeneratedMission(clone(master),index,context,master.rooms[index].question_plans.map(p=>p.interaction));
    if (cached) {
      validateRoom(cached,master.rooms[index]);
      return {room:clone(master.rooms[index]),mission:cached};
    }
    const foundation = clone(master), source = master.source_contract;
    const current = foundation.rooms[index], template = master.templates?.[index] || c.buildDeterministicQuestionPlanTemplate(context, source)[index];
    const interactions = template.question_plans.map(p => p.interaction);
    const schema = { type: 'object', properties: {
      plans: c.buildObjectiveRoomFillResponseSchema(template),
      room_context: clone(c.buildObjectiveFoundationResponseSchema(context.misiones).properties.rooms.items),
      ...c.buildRoomBundleResponseSchema(interactions.length, c.getRequiredBriefingEvidenceCount(context)).properties
    }, required: ['plans', 'room_context', 'mission'] };
    schema.properties.room_context.properties.room_number = { type: 'integer', enum: [index + 1] };
    const document = c.buildFixedRoomContent(schema, template);
    // The immutable narrative boundaries are supplied by the planner, not by another worker.
    for (const field of ['incoming_state', 'next_state']) {
      document.template.room_context.narrative_beat[field] = current.narrative_beat[field];
      document.fields = document.fields.filter(f => f.path.join('.') !== `room_context.narrative_beat.${field}`);
    }
    const prompt = c.buildFixedRoomTextPrompt(context, source, foundation, current, template, document)
      + '\nREPARTO GLOBAL INMUTABLE: ' + JSON.stringify(master.rooms.map(r => ({ sala: r.room_number, aprendizaje: r.learning_focus, objetivo: r.room_objective, inventario: r.curriculum_inventory })))
      + '\nDesarrolla únicamente los conceptos y casos asignados a esta sala. Conserva sus límites narrativos.';
    const text = await requestQualityJson(prompt, context, .32, { textOnly: true, expectedContent: document });
    const combined = c.materializeFixedRoomContent(document, text, schema, template);
    const issues = c.validateFixedObjectiveFill(combined, schema, `Sala ${index + 1}`);
    if (issues.length) throw invalid(issues.join(' · '));
    const boundary = clone(current.narrative_beat);
    Object.assign(current, combined.room_context);
    current.narrative_beat.incoming_state = boundary.incoming_state;
    current.narrative_beat.next_state = boundary.next_state;
    const filled = await c.requestFixedObjectiveRoomFill(c.buildObjectiveRoomFillPrompt(context, source, foundation, current, template), context, template, combined.plans);
    current.question_plans = template.question_plans.map(slot => c.mergeFilledQuestionPlanWithTemplate(filled[slot.plan_id], slot));
    current.reserve_opportunity = c.mergeFilledQuestionPlanWithTemplate(filled[template.reserve_opportunity.plan_id], template.reserve_opportunity);
    current.fixed_code_fragment = master.rooms[index].fixed_code_fragment;
    current.room_completion_feedback = c.buildDeterministicRoomCompletionFeedback(current, current.fixed_code_fragment, context.idioma);
    const materialized = c.materializeObjectiveBlueprintMechanics(foundation);
    const form = { ...context, objectiveBlueprint: materialized };
    try {
      const mission = await c.requestGeneratedRoomBundle(form, index, { roomInteractionPlan: interactions, suppliedResponse: { mission: combined.mission } });
      validateRoom(mission, materialized.rooms[index]);
      c.setObjectiveGeneratedRoom(materialized, index, mission, form, interactions);
      return { room: materialized.rooms[index], mission };
    } catch(error) {
      const partial = {room:materialized.rooms[index],mission:error.generatedMission || combined.mission};
      const findings = (error.questionIndexes?.length ? error.questionIndexes : [null]).map(questionIndex=>({target:Number.isInteger(questionIndex)?'question':'brief',questionIndex,evidence:error.message,correction:'Corrige el defecto detectado por el validador conservando los demás elementos.'}));
      try { return await repair(context,master,index,partial,findings); }
      catch(repairError) { repairError.partialResult=partial; repairError.validationIssues=findings; throw repairError; }
    }
  }
  function validateRoom(mission, room) {
    const issues = [ ...c.pedagogicalRoomIssues(mission, room.question_plans),
      ...room.question_plans.flatMap((p,i) => [...c.coordinateRiddleIssues(mission.preguntas[i], p), ...c.expressionRiddleIssues(mission.preguntas[i], p)]) ];
    if (issues.length) throw invalid(issues.join(' · '));
  }
  async function repair(context, master, index, previous, findings) {
    const next = clone(previous);
    const contentIssues = findings.filter(f => f.target !== 'image');
    if (!contentIssues.length) return next;
    const indices = [...new Set(contentIssues.flatMap(f => Number.isInteger(f.questionIndex) ? [f.questionIndex] : []))];
    const briefing = contentIssues.some(f => f.target === 'brief' || !Number.isInteger(f.questionIndex));
    const expectedTypes = Object.fromEntries(indices.map(i => [i, next.mission.preguntas[i]?.tipo_interaccion]));
    const response = await requestQualityJson([
      'Corrige exclusivamente los elementos indicados de esta sala. No cambies IDs, tipos de interacción, fragmento final ni fronteras narrativas.',
      'Devuelve JSON {"contexto":"", "questions":[{"index":0,"question":{objeto completo},"plan":{plan privado completo}}]}.',
      `Índices permitidos: ${indices.map(i => `Pregunta ${i} (tipo_interaccion OBLIGATORIO: "${expectedTypes[i]}")`).join(', ')}. ${briefing ? 'Corrige contexto incorporando la evidencia faltante sin revelar las respuestas.' : 'contexto debe permanecer idéntico.'}`,
      'Los índices son cero-based. Conserva todos los campos de cada objeto y alinea planes, respuestas y datos visuales. Verifica los cálculos matemáticos.',
      'IMPORTANTE: Debes mantener rigurosamente el tipo de interacción asignado para cada pregunta; corrige enunciado y opciones para adecuarse a este tipo.',
      'HALLAZGOS: ' + JSON.stringify(contentIssues), 'SALA: ' + JSON.stringify(previous)
    ].join('\n'), context, .15);
    if (briefing && typeof response.contexto === 'string' && response.contexto.trim()) next.mission.contexto = response.contexto;
    if (!Array.isArray(response.questions) || indices.some(index=>!response.questions.some(p=>p.index===index))) throw invalid('La reparación omitió preguntas que requerían corrección.');
    for (const patch of response.questions || []) {
      if (!indices.includes(patch.index) || !patch.question || !patch.plan) throw invalid('La reparación intentó cambiar una pregunta fuera de alcance.');
      const old = next.mission.preguntas[patch.index], plan = next.room.question_plans[patch.index];
      if (!patch.question.tipo_interaccion) patch.question.tipo_interaccion = old.tipo_interaccion;
      if (patch.question.tipo_interaccion !== old.tipo_interaccion) throw invalid('La reparación cambió el tipo de interacción.');
      next.mission.preguntas[patch.index] = { ...patch.question, id: old.id, tipo_interaccion: old.tipo_interaccion };
      next.room.question_plans[patch.index] = { ...patch.plan, plan_id: plan.plan_id, interaction: plan.interaction };
      if (!briefing) {
        next.room.question_plans[patch.index].knowledge=plan.knowledge;
        next.room.question_plans[patch.index].teaching_example=plan.teaching_example;
      }
    }
    // Apply the same public evidence composition used by initial authoring.
    // The corrected plan cannot leave required facts or examples private.
    next.mission=c.composePedagogicalRoom({mission:next.mission,plans:Object.fromEntries(next.room.question_plans.map(p=>[p.plan_id,p]))},next.room.question_plans).mission;
    const foundation = clone(master); foundation.rooms[index] = next.room;
    next.mission = await c.requestGeneratedRoomBundle({ ...context, objectiveBlueprint: foundation }, index, {
      roomInteractionPlan: next.room.question_plans.map(p => p.interaction), suppliedResponse: { mission: next.mission }
    });
    validateRoom(next.mission, next.room);
    c.setObjectiveGeneratedRoom(foundation, index, next.mission, context, next.room.question_plans.map(p => p.interaction));
    next.room = foundation.rooms[index];
    return next;
  }
  function project(context, master, results) {
    const blueprint = clone(master);
    results.forEach((r,i) => { if (r) blueprint.rooms[i] = clone(r.room); });
    const theme = c.buildAcademicPreviewTheme(context);
    const draft = { project: c.buildPrivateProjectShell(context, blueprint), rooms: results.map(r => r?.mission || { preguntas: [] }) };
    const value = c.applyAcademicMissionPalettes(c.normalizeEscapeRoomProject(c.stripTemporaryCoverageAnchors(c.assemblePrivateGenerationDraft(draft, context, theme))), context);
    value.experience_config = c.experience.config(context.experience_config);
    value.reward_plan = c.rewardEngine.bindPlan(blueprint.reward_plan, value);
    value.dedicatedEndingImage = true;
    return value;
  }
  function imageSpecs(context, master, result, index = -1) {
    const shell = c.buildPrivateProjectShell(context, master);
    if (index < 0) {
      const visual = c.buildVisualDirection({ ...shell, ...context });
      return [{ key: 'cover', prompt: c.buildCoverVisualPrompt({ ...shell, ...context }), aspectRatio: '16:9' },
        { key: 'ending', prompt: `Ilustración del desenlace victorioso de ${shell.titulo}. ${visual.line}. Resultado: ${master.narrative_arc?.finale}. Muestra el escenario restaurado y la misión cumplida; composición distinta de la portada. Sin texto, claves ni marcas de agua.`, aspectRatio: '16:9' },
        ...(master.experience_config.primary_reward === 'imagen' && !master.experience_config.reward_image ? [{ key: 'reward', prompt: `Recompensa visual de ${shell.titulo}. ${visual.line}. ${master.narrative_arc?.finale}. Sin texto, claves, números ni interfaces.`, aspectRatio: '16:9' }] : [])];
    }
    const mission = result.mission;
    return [{ key: 'room', prompt: c.buildRoomVisualPrompt({ data: { ...shell, ...context }, mission, index }), aspectRatio: '4:3' },
      ...[...c.selectQuestionImageIndexes(mission)].map(questionIndex => ({ key: `question-${questionIndex}`, questionIndex, prompt: c.buildQuestionVisualPrompt({ data: { ...shell, ...context }, mission, question: mission.preguntas[questionIndex], roomIndex: index, questionIndex }), aspectRatio: '4:3' }))];
  }
  return { objective, room, repair, project, imageSpecs, core: c, validateRoom };
}
module.exports = { createEngine };
