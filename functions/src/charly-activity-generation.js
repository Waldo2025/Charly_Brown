const { TYPES } = require('./charly-resources/contracts.js');
const { getTypesFromSelections, isMathSection, RESOURCE_LIMITS, MAX_UNIT_RESOURCES } = require('./charly-production-policy.js');
const { validateResourceSpecification } = require('./charly-resources/coherence.js');
const { activityDynamics } = require('./charly-exercise-dynamics.js');
const {
  buildActivityPrompt,
  validateProjectArtifact,
  validateMathActivitySet,
  validateEmbeddedActivityResources,
  RESOURCE_LABELS
} = require('./charly-brown-agent-tools.js');

function resolveActivityResourceCodes(unit, sectionDefinition = {}, requestedTypes = []) {
  const sections = unit.workflow?.activitySections || [];
  const unitNumber = String(unit.meta?.unit || '1').replace(/\D+/g, '') || '1';
  const typeCounters = { worksheet: 0, annex: 0, cutout: 0, 'video-script': 0 };
  const resourceLabels = { annex: 'Anexo', cutout: 'Recortable', worksheet: 'Ficha', 'video-script': 'Video' };
  const targetCodes = [];
  let allocatedResources = 0;

  for (const section of sections) {
    const isTarget = Boolean(
      (sectionDefinition.sectionId && [section.id, section.sectionId].includes(sectionDefinition.sectionId))
      || (!sectionDefinition.sectionId && sectionDefinition.id && [section.id, section.sectionId].includes(sectionDefinition.id))
      || (!sectionDefinition.sectionId && !sectionDefinition.id && sectionDefinition.section && section.section === sectionDefinition.section)
      || (!sectionDefinition.sectionId && !sectionDefinition.id && !sectionDefinition.section && sectionDefinition.subtopic && section.subtopic === sectionDefinition.subtopic)
      || section === sectionDefinition
    );
    let rawTypes = section.resourceTypes || (section.resourceSelections ? getTypesFromSelections(section.resourceSelections) : []);
    for (const raw of rawTypes) {
      const normalized = TYPES.includes(raw) ? raw : (Object.keys(RESOURCE_LABELS).find(key => key === raw) || raw);
      if (!TYPES.includes(normalized) || allocatedResources >= MAX_UNIT_RESOURCES) continue;
      const count = typeCounters[normalized] || 0;
      if (count >= (RESOURCE_LIMITS[normalized] || 1)) continue;
      typeCounters[normalized] = count + 1;
      allocatedResources += 1;
      const letter = String.fromCharCode(97 + count);
      const codeKeys = { worksheet: 'fichas', annex: 'anexos', cutout: 'recortables', 'video-script': 'videos' };
      const code = normalized === 'video-script'
        ? `Video "${section.name || section.section || section.subtopic || `Unidad ${unitNumber}`}"`
        : (section.resourceCodes?.[codeKeys[normalized]] || `${resourceLabels[normalized] || normalized} ${unitNumber}${letter}`);
      if (isTarget) targetCodes.push({ type: normalized, code });
    }
    if (isTarget && targetCodes.length) break;
  }
  const requested = Array.isArray(requestedTypes) ? [...new Set(requestedTypes.filter(type => TYPES.includes(type)))] : [];
  if (!requested.length) return targetCodes;
  const plannedSpecs = (unit.accepted?.activities || []).flatMap(item => item.resourceSpecifications || []);
  const codeKeys = { worksheet: 'fichas', annex: 'anexos', cutout: 'recortables', 'video-script': 'videos' };
  for (const type of requested) {
    if (targetCodes.some(item => item.type === type)) continue;
    const count = plannedSpecs.filter(item => item?.type === type).length;
    const letter = String.fromCharCode(97 + count);
    const configuredCode = sectionDefinition.resourceCodes?.[codeKeys[type]];
    const code = type === 'video-script'
      ? `Video "${sectionDefinition.name || sectionDefinition.section || sectionDefinition.subtopic || `Unidad ${unitNumber}`}"`
      : (configuredCode || `${resourceLabels[type] || type} ${unitNumber}${letter}`);
    targetCodes.push({ type, code });
  }
  return targetCodes.filter(item => requested.includes(item.type));
}

function activityResourceBrief(assignedCodes = []) {
  if (!assignedCodes.length) {
    return 'Esta actividad no tiene recursos complementarios asignados. Devuelve resourceSpecifications: [] y no menciones fichas, anexos, recortables o videos ni agregues espacios de pegado.';
  }
  return `Esta actividad tiene vinculados los siguientes recursos complementarios obligatorios: ${assignedCodes.map(item => item.code).join(', ')}.
REGLA ESTRICTA DE MENCIÓN DE RECURSOS:
- En la consigna donde se use cada recurso, inicia la frase con un verbo en imperativo e incluye el código exacto:
${assignedCodes.map(item => {
  if (item.type === 'worksheet') return `  • Para la ficha: inicia con verbo imperativo mencionando "${item.code}" (ejemplo: "<strong>Resuelve la ${item.code}.</strong> ...")`;
  if (item.type === 'annex') return `  • Para el anexo: inicia con verbo imperativo mencionando "${item.code}" (ejemplo: "<strong>Analiza el ${item.code}.</strong> ...")`;
  if (item.type === 'cutout') return `  • Para el recortable: inicia con verbo imperativo mencionando "${item.code}" (ejemplo: "<strong>Utiliza el ${item.code}.</strong> ...")`;
  if (item.type === 'video-script') return `  • Para el video: inicia con verbo imperativo mencionando "${item.code}" (ejemplo: "<strong>Observa el ${item.code} y comenta.</strong> ...")`;
  return `  • ${item.code}`;
}).join('\n')}
- NUNCA comiences la actividad con una pregunta.
- NO generes los recursos dentro del HTML de la actividad, solo su mención y consigna de uso pedagógico en los pasos.
- Devuelve resourceSpecifications con una entrada por recurso: {type, code, mechanic, useInstruction, studentAction, requiredElements, visualBrief, expectedProduct, piecePolicy, primaryPiece, placement}.
- La especificación es el contrato que recibirá el agente especialista. Debe describir exactamente qué debe producir, cómo se usa, qué elementos contiene y qué evidencia deja el alumno.
- requiredElements debe ser una lista concreta y no vacía para fichas, anexos, recortables y videos. visualBrief debe describir la composición, jerarquía, estilo, distribución y contenido que el especialista debe materializar.
- Para fichas usa placement.mode="complete-separate-resource"; para anexos placement.mode="consult-alongside-activity"; para videos placement.mode="view-before-or-during-activity". En estos tres casos usa baseProvidedBy="resource" y describe el momento de uso en zoneDescription.
- SOLO para recortables: debajo del ejercicio que lo utiliza agrega <div class="cb-cutout-paste-zone" data-resource-code="CÓDIGO"><div class="cb-cutout-paste-guide">[guía visual o contorno que queda impreso en la actividad]</div><div class="cb-cutout-completed-example" data-cutout-example="CÓDIGO"><span>[descripción breve de la composición terminada]</span></div></div>. Las piezas ya recortadas se pegan en esa zona.
- Para cada recortable, placement debe ser {"mode":"paste-into-activity","baseProvidedBy":"activity","zoneDescription":"..."}; expectedProduct debe explicar cómo luce la composición ya terminada.
- Para cada recortable usa piecePolicy="multi-piece" cuando se recortan varias piezas independientes y primaryPiece.composite=false. Usa piecePolicy="single-composite" y primaryPiece.composite=true únicamente cuando toda la ilustración se recorta y pega como una sola pieza. La base o zona que ya está impresa en la actividad nunca puede declararse como primaryPiece del recortable.
- Fichas, anexos y videos NUNCA reciben espacio para pegarse dentro de la actividad.
- Cada ejercicio con recortable debe usar una mecánica y una composición distinta de los otros recortables del libro; evita repetir marcos, rompecabezas, árboles, collages o escenarios ya usados.`;
}

async function planActivityResources({ unit = {}, activity = {}, sectionDefinition = {}, assignedCodes = [], generateJson }) {
  if (!assignedCodes.length) return [];
  const priorCutoutMechanics = (unit.accepted?.activities || []).flatMap(item => item.resourceSpecifications || [])
    .filter(item => item?.type === 'cutout')
    .map(item => String(item.mechanic || '').trim())
    .filter(Boolean);
  const prompt = `Actúas como el agente que planifica una actividad escolar antes de que los especialistas creen sus recursos.
Planifica exactamente estos recursos asignados, sin crear todavía la ficha, anexo, recortable o video: ${JSON.stringify(assignedCodes)}.
Unidad: ${unit.meta?.unit || ''}. Nivel y grado: ${unit.meta?.level || 'Primaria'} ${unit.meta?.grade || ''}.
Sección: ${sectionDefinition.section || sectionDefinition.name || activity.section || ''}.
Subtema: ${sectionDefinition.subtopic || activity.subtopic || ''}.
Descripción curricular: ${sectionDefinition.description || ''}.
Objetivo: ${sectionDefinition.objective || ''}.
Mecánicas de recortables ya usadas y prohibidas para esta nueva actividad: ${JSON.stringify(priorCutoutMechanics)}.
${activityResourceBrief(assignedCodes)}
Devuelve SOLO JSON con esta forma exacta:
{"resourceSpecifications":[{"type":"worksheet|annex|cutout|video-script","code":"código exacto asignado","mechanic":"mecánica concreta","useInstruction":"consigna exacta que aparecerá en la actividad","studentAction":"acción observable del alumno","requiredElements":["elementos concretos"],"visualBrief":"composición, estilo, jerarquía, distribución y contenido exactos","expectedProduct":"evidencia o composición terminada","piecePolicy":"multi-piece|single-composite (solo recortable)","primaryPiece":{"label":"pieza manipulable principal, nunca la base impresa en la actividad","composite":false},"placement":{"mode":"...","baseProvidedBy":"resource|activity","zoneDescription":"..."}}]}.
Incluye exactamente una especificación por recurso asignado, con type y code idénticos. No agregues recursos.`;
  let lastErrors = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const correction = attempt ? `\nCorrige estos errores del plan anterior: ${lastErrors.join(' ')}` : '';
    const result = await generateJson(`${prompt}${correction}`);
    const specs = Array.isArray(result?.resourceSpecifications) ? result.resourceSpecifications : [];
    const errors = [];
    for (const assigned of assignedCodes) {
      const exact = specs.find(spec => spec?.type === assigned.type && String(spec.code || '') === String(assigned.code || ''));
      if (!exact) {
        errors.push(`Falta el contrato de ${assigned.code}.`);
        continue;
      }
      const validation = validateResourceSpecification({ resourceSpecifications: [exact] }, assigned.type, assigned.code);
      if (!validation.ok) errors.push(...validation.errors.map(error => `${assigned.code}: ${error}`));
    }
    const extras = specs.filter(spec => !assignedCodes.some(assigned => assigned.type === spec?.type && String(assigned.code || '') === String(spec?.code || '')));
    if (extras.length) errors.push(`El plan agregó recursos no asignados: ${extras.map(item => item.code || item.type).join(', ')}.`);
    if (!errors.length && specs.length === assignedCodes.length) return specs;
    lastErrors = errors;
  }
  throw Object.assign(new Error(`No se pudo completar la planificación de recursos: ${lastErrors.join(' ')}`), { status: 422 });
}

function validateActivityResourcePlan(artifact = {}, assignedCodes = [], unit = {}) {
  const errors = [];
  const specs = Array.isArray(artifact.resourceSpecifications) ? artifact.resourceSpecifications : [];
  const source = String(artifact.html || '');
  const unassignedSpecs = specs.filter(spec => !assignedCodes.some(item => item.type === spec?.type && item.code === spec?.code));
  if (unassignedSpecs.length) errors.push(`La actividad declaró recursos no asignados: ${unassignedSpecs.map(item => item.code || item.type).join(', ')}.`);
  for (const assigned of assignedCodes) {
    const spec = specs.find(item => item && item.type === assigned.type && String(item.code || '') === String(assigned.code || ''));
    if (!spec) {
      errors.push(`Falta resourceSpecifications para ${assigned.code}.`);
      continue;
    }
    const detailValidation = validateResourceSpecification({ resourceSpecifications: specs }, assigned.type, assigned.code);
    if (!detailValidation.ok) errors.push(...detailValidation.errors.map(error => `${assigned.code}: ${error}`));
    const zonePattern = new RegExp(`class=["'][^"']*cb-cutout-paste-zone[^"']*["'][^>]*data-resource-code=["']${String(assigned.code).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i');
    if (assigned.type === 'cutout') {
      if (!zonePattern.test(source)) errors.push(`${assigned.code} no tiene espacio de pegado debajo de su ejercicio.`);
      if (spec.placement?.mode !== 'paste-into-activity' || spec.placement?.baseProvidedBy !== 'activity') errors.push(`${assigned.code} debe declarar que las piezas se pegan en la actividad.`);
      if (!String(spec.expectedProduct || '').trim()) errors.push(`${assigned.code} no describe la composición terminada.`);
    } else if (zonePattern.test(source)) {
      errors.push(`${assigned.code} no es recortable y no debe tener espacio de pegado.`);
    }
  }
  const unexpectedZones = [...source.matchAll(/class=["'][^"']*cb-cutout-paste-zone[^"']*["'][^>]*data-resource-code=["']([^"']+)["']/gi)]
    .map(match => match[1])
    .filter(code => !assignedCodes.some(item => item.type === 'cutout' && item.code === code));
  if (unexpectedZones.length) errors.push(`Hay espacios de pegado sin recortable asignado: ${unexpectedZones.join(', ')}.`);
  const priorMechanics = new Set((unit.accepted?.activities || []).flatMap(item => item.resourceSpecifications || [])
    .filter(item => item?.type === 'cutout').map(item => String(item.mechanic || '').trim().toLowerCase()).filter(Boolean));
  for (const spec of specs.filter(item => item?.type === 'cutout')) {
    const mechanic = String(spec.mechanic || '').trim().toLowerCase();
    if (!mechanic) errors.push(`${spec.code || 'El recortable'} no define una mecánica manipulativa única.`);
    else if (priorMechanics.has(mechanic)) errors.push(`La mecánica “${spec.mechanic}” ya fue utilizada por otro recortable del libro.`);
  }
  return { ok: errors.length === 0, errors, specifications: specs };
}

async function generateActivityArtifact({
  unit,
  activity,
  sectionDefinition = {},
  generateJson,
  sanitizeHtml,
  memory = [],
  brief = '',
  sourceContent = '',
  operation = 'create',
  structureMode = 'default',
  structureInstructions = '',
  editorialConfig = {},
  assignedCodes
}) {
  const codes = Array.isArray(assignedCodes) ? assignedCodes : resolveActivityResourceCodes(unit, sectionDefinition);
  const plannedResourceSpecifications = await planActivityResources({
    unit,
    activity,
    sectionDefinition,
    assignedCodes: codes,
    generateJson
  });
  const sharedBrief = [
    'Crea la actividad didáctica e interactiva para este subtema.',
    sectionDefinition.agentInstructions || '',
    activityResourceBrief(codes),
    plannedResourceSpecifications.length
      ? `PLAN DE RECURSOS YA APROBADO. Úsalo como contrato autoritativo, menciónalo en las consignas y devuélvelo sin cambios en resourceSpecifications:\n${JSON.stringify(plannedResourceSpecifications)}`
      : '',
    brief || ''
  ].filter(Boolean).join('\n\n');
  const dynamics = await activityDynamics(editorialConfig.enabledExerciseDynamics ?? unit.meta?.enabledExerciseDynamics, sourceContent);
  const sourceDynamics = sourceContent ? await activityDynamics(undefined, sourceContent) : null;
  const prompt = buildActivityPrompt({
    unit,
    activity,
    sectionDefinition,
    brief: sharedBrief,
    sourceContent,
    operation,
    memory,
    structureMode,
    structureInstructions,
    resourceTypes: [],
    editorialConfig,
    exerciseDynamicsDirective: sourceDynamics?.directive || dynamics.directive
  });
  const isMath = isMathSection(sectionDefinition || activity);
  const expectedMathCount = sectionDefinition?.mathSingleActivity ? 1 : 6;
  const attempts = 3;
  let artifact = null;
  let mathValidation = { ok: true, errors: [] };
  let projectValidation = { ok: true, errors: [] };
  let embeddedValidation = { ok: true, errors: [] };
  let resourcePlanValidation = { ok: true, errors: [] };
  let dynamicsValidation = { ok: true, errors: [] };

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const retryErrors = [...(mathValidation.errors || []), ...(resourcePlanValidation.errors || []), ...(dynamicsValidation.errors || [])];
    const retry = attempt
      ? `\n\nREINTENTO ${attempt + 1}: corrige exactamente estos incumplimientos: ${retryErrors.join(' ')}. Devuelve de nuevo la propuesta completa y solo el JSON solicitado.`
      : '';
    artifact = await generateJson(`${prompt}${retry}`);
    if (!artifact?.title || !artifact.html) break;
    artifact.html = sanitizeHtml(artifact.html);
    artifact.resourceSpecifications = plannedResourceSpecifications;
    mathValidation = isMath ? validateMathActivitySet(artifact.html, expectedMathCount) : { ok: true, errors: [] };
    resourcePlanValidation = validateActivityResourcePlan(artifact, codes, unit);
    const usedDynamics = (await activityDynamics(dynamics.enabled, artifact.html)).detected;
    const forbidden = sourceContent ? [] : usedDynamics.filter((id) => !dynamics.enabled.includes(id));
    dynamicsValidation = { ok: forbidden.length === 0, errors: forbidden.map((id) => `El tipo de ejercicio ${id} está desactivado en el catálogo.`) };
    if (mathValidation.ok && resourcePlanValidation.ok && dynamicsValidation.ok) break;
  }
  if (!artifact?.title || !artifact.html) throw Object.assign(new Error('Contenido incompleto.'), { status: 422 });
  projectValidation = validateProjectArtifact(artifact, unit, activity);
  embeddedValidation = validateEmbeddedActivityResources(artifact.html, []);
  const errors = [...(projectValidation.errors || []), ...(mathValidation.errors || []), ...(embeddedValidation.errors || []), ...(resourcePlanValidation.errors || []), ...(dynamicsValidation.errors || [])];
  if (!projectValidation.ok || !mathValidation.ok || !embeddedValidation.ok || !resourcePlanValidation.ok || !dynamicsValidation.ok) {
    throw Object.assign(new Error(`Contenido no válido: ${errors.join(' ')}`), { status: 422 });
  }
  return {
    ...artifact,
    exerciseDynamics: {
      version: dynamics.version,
      enabled: dynamics.enabled,
      detected: (await activityDynamics(dynamics.enabled, artifact.html)).detected,
      sourceDetected: dynamics.detected
    },
    activityId: activity.id || '',
    validation: {
      ok: true,
      project: projectValidation,
      mathematics: mathValidation,
      embeddedResources: embeddedValidation,
      resourcePlan: resourcePlanValidation,
      dynamics: dynamicsValidation,
      resourceCodes: codes
    }
  };
}

module.exports = { resolveActivityResourceCodes, activityResourceBrief, planActivityResources, validateActivityResourcePlan, generateActivityArtifact };
