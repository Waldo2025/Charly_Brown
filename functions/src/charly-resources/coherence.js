function stripHtml(value = '') {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function comparable(value = '') {
  return stripHtml(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Los componentes concretos vienen del contrato producido por el agente de
// actividades. No existe un inventario global de marcos, paisajes o piezas.
const COMPONENTS = Object.freeze([]);

function buildSyntheticResourceSpecification(activity = {}, type = '', expectedCode = '') {
  const title = activity.subtopic || activity.title || activity.section || 'Contenido curricular';
  const code = expectedCode || (type === 'annex' ? 'Anexo 1a' : type === 'cutout' ? 'Recortable 1a' : type === 'worksheet' ? 'Ficha 1a' : 'Video');
  return {
    type,
    code,
    mechanic: `Material educativo visual e interactivo para ${title}.`,
    useInstruction: `Observa y utiliza ${code} para complementar las consignas de la actividad escolar.`,
    studentAction: `Observa, analiza, resuelve y complementa los ejercicios sobre ${title}.`,
    requiredElements: [title, 'Elementos ilustrados clave del contenido'],
    visualBrief: `Ilustración o lámina educativa a todo color, estilo libro escolar infantil de calidad editorial sobre ${title}.`,
    expectedProduct: `Actividad complementada y resuelta con el apoyo visual de ${code}.`,
    ...(type === 'cutout' ? {
      piecePolicy: 'multi-piece',
      primaryPiece: { label: `Piezas ilustradas de ${title}`, composite: false },
      placement: {
        mode: 'paste-into-activity',
        baseProvidedBy: 'activity',
        zoneDescription: 'Zona de pegado en la actividad didáctica'
      }
    } : {
      placement: {
        mode: 'consult-alongside-activity',
        baseProvidedBy: 'resource',
        zoneDescription: 'Lámina de consulta y apoyo visual'
      }
    })
  };
}

function resourceSpecification(activity = {}, type = '', expectedCode = '') {
  const specs = Array.isArray(activity.resourceSpecifications) ? activity.resourceSpecifications : [];
  if (expectedCode) {
    const matchByCode = specs.find(item => item && item.type === type && comparable(item.code) === comparable(expectedCode));
    if (matchByCode) return matchByCode;
  }
  return specs.find(item => item && item.type === type) || null;
}

function validateResourceSpecification(activity = {}, type = '', expectedCode = '') {
  let specification = resourceSpecification(activity, type, expectedCode);
  const errors = [];
  if (!specification) {
    errors.push(`La actividad no contiene una especificación del agente de actividades para ${type}.`);
    return { ok: false, errors, specification: null };
  }
  const requiredText = [
    ['code', 'código'],
    ['mechanic', 'mecánica'],
    ['useInstruction', 'instrucción de uso'],
    ['studentAction', 'acción del alumno'],
    ['visualBrief', 'dirección visual'],
    ['expectedProduct', 'producto esperado']
  ];
  for (const [field, label] of requiredText) {
    if (!String(specification[field] || '').trim()) errors.push(`La especificación no define ${label}.`);
  }
  if (!Array.isArray(specification.requiredElements) || !specification.requiredElements.map(String).some(item => item.trim())) {
    errors.push('La especificación no enumera los elementos obligatorios del recurso.');
  }
  if (!specification.placement || typeof specification.placement !== 'object' || !String(specification.placement.mode || '').trim()) {
    errors.push('La especificación no define cómo se coloca o consulta el recurso.');
  }
  const requestedCode = String(expectedCode || '').trim();
  const plannedCode = String(specification.code || '').trim();
  if (requestedCode && plannedCode && comparable(requestedCode) !== comparable(plannedCode)) {
    const exactMatch = (Array.isArray(activity.resourceSpecifications) ? activity.resourceSpecifications : [])
      .find(item => item && item.type === type && comparable(item.code) === comparable(requestedCode));
    if (exactMatch) {
      specification = exactMatch;
    } else {
      errors.push(`El código solicitado “${requestedCode}” no coincide con el contrato “${plannedCode}”.`);
    }
  }
  if (type === 'cutout') {
    if (!String(specification.piecePolicy || '').trim()) errors.push('El recortable no define su política de piezas.');
    if (!specification.primaryPiece || typeof specification.primaryPiece !== 'object' || !String(specification.primaryPiece.label || '').trim()) {
      errors.push('El recortable no define su pieza principal.');
    }
    if (specification.primaryPiece?.composite === true && specification.piecePolicy !== 'single-composite') {
      errors.push('Una pieza principal compuesta exige piecePolicy="single-composite"; los conjuntos de piezas independientes deben usar composite=false.');
    }
    if (specification.placement?.mode !== 'paste-into-activity' || specification.placement?.baseProvidedBy !== 'activity') {
      errors.push('El recortable debe declarar que sus piezas se pegan en una base impresa dentro de la actividad.');
    }
    if (!String(specification.placement?.zoneDescription || '').trim()) errors.push('El recortable no describe su zona de pegado.');
  }
  return { ok: errors.length === 0, errors, specification };
}

function meaningfulTokens(value = '') {
  const stop = new Set(['para', 'como', 'dentro', 'sobre', 'esta', 'este', 'cada', 'pieza', 'recurso', 'actividad', 'imagen']);
  return comparable(value).split(/[^a-z0-9ñ]+/).filter(token => token.length >= 4 && !stop.has(token));
}

function containsRequiredElement(haystack = '', label = '') {
  const tokens = [...new Set(meaningfulTokens(label))];
  if (!tokens.length) return comparable(haystack).includes(comparable(label));
  return tokens.some(token => haystack.includes(token)) || comparable(haystack).includes(comparable(label));
}

function isAuditedVisualRequirement(label = '') {
  return /l[ií]nea(?:s)?\s+(?:de\s+)?corte|contorno(?:s)?\s+(?:de\s+)?corte|outline|icono\s+de\s+tijera|margen(?:es)?\s+para\s+tijera/i.test(String(label));
}

function deriveResourceUsageContract(activity = {}, type = '') {
  const specification = resourceSpecification(activity, type);
  const sourceHtml = String(activity.html || activity.text || '');
  const activityText = stripHtml(`${activity.title || ''} ${sourceHtml}`);
  const sentences = activityText.split(/(?<=[.!?])\s+/).filter(Boolean);
  const typePattern = type === 'cutout' ? /recortable/i
    : type === 'annex' ? /anexo/i
      : type === 'worksheet' ? /ficha/i
        : type === 'video-script' ? /video|guion/i
          : null;
  const structuralBlocks = [...sourceHtml.matchAll(/<(?:li|p|section|div)\b[^>]*>([\s\S]*?)<\/(?:li|p|section|div)>/gi)]
    .map(match => stripHtml(match[1]))
    .filter(Boolean);
  const matchedBlocks = typePattern ? structuralBlocks.filter(block => typePattern.test(block)) : [];
  const matchedIndexes = typePattern ? sentences.map((sentence, index) => typePattern.test(sentence) ? index : -1).filter(index => index >= 0) : [];
  const scopedText = matchedBlocks.length
    ? matchedBlocks.join(' ')
    : matchedIndexes.length
      ? [...new Set(matchedIndexes.flatMap(index => [sentences[index], sentences[index + 1]].filter(Boolean)))].join(' ')
      : activityText;
  const normalized = comparable(scopedText);
  const requiredComponents = specification?.requiredElements?.length
    ? specification.requiredElements.map((label, index) => ({ id: `specified-${index + 1}`, label: String(label) }))
    : COMPONENTS.filter(component => component.match.test(normalized)).map(component => ({ id: component.id, label: component.label }));
  const requiresActivityPasteZone = type === 'cutout';
  const requiresAssemblyBase = type === 'cutout' && specification?.placement?.baseProvidedBy === 'cutout';
  const requiresSingleCompositeInsert = type === 'cutout' && (
    specification?.piecePolicy === 'single-composite'
    || specification?.primaryPiece?.composite === true
    || (!specification && /pega\s+(?:la|una)\s+(?:foto|fotografia|imagen)[^.]{0,180}(?:dentro|centro)/.test(normalized))
  );
  return {
    type,
    activityId: String(activity.id || ''),
    activityTitle: String(activity.title || activity.section || ''),
    usageExcerpt: scopedText.slice(0, 5000),
    requiredComponents,
    resourceSpecification: specification,
    hasAuthoritativeSpecification: Boolean(specification),
    requiresActivityPasteZone,
    requiresAssemblyBase,
    requiresSingleCompositeInsert,
    expectedProduct: String(specification?.expectedProduct || ''),
    baseDescription: String(specification?.placement?.baseDescription || specification?.placement?.zoneDescription || ''),
    primaryPieceLabel: String(specification?.primaryPiece?.label || specification?.primaryPieceLabel || 'Pieza principal completa'),
    rule: requiresAssemblyBase
      ? `El recortable debe incluir la base funcional descrita por la actividad y todas las piezas que se colocan en ella.${requiresSingleCompositeInsert ? ' La pieza principal debe ser una sola composición y debe caber en su zona de pegado.' : ''}`
      : requiresActivityPasteZone
        ? `Las piezas recortadas se pegan en la zona impresa dentro de la actividad. El recortable no debe duplicar esa base.${requiresSingleCompositeInsert ? ' La pieza principal debe ser una sola composición dimensionada para esa zona.' : ''}`
        : 'El recurso debe contener todos los elementos materiales necesarios para ejecutar las consignas de la actividad.'
  };
}

function artifactCoherenceText(artifact = {}) {
  const document = artifact.cutoutDocument || artifact.annexDocument || {};
  return comparable([
    artifact.title,
    artifact.html,
    document.title,
    document.instructions,
    document.imagePrompt,
    ...(document.targets || []).map(item => `${item.label || ''} ${item.description || ''}`),
    ...(document.pieces || []).map(item => `${item.label || ''} ${item.shape || ''} ${item.interactionRole || ''} ${item.hint || ''}`)
  ].join(' '));
}

function isAssemblyBasePiece(piece = {}) {
  const identity = comparable(`${piece.label || ''} ${piece.shape || ''}`);
  return /\bbase\b|tablero|escenario|contenedor|portarretrat|marco\s+(?:base|recortable|fotografico)|estructura\s+(?:de|del)\s+marco|plantilla\s+base/.test(identity);
}

function isDecorationPiece(piece = {}) {
  return /adorn|distintiv|esquina|copo|estrella|decor/.test(comparable(`${piece.label || ''} ${piece.shape || ''} ${piece.interactionRole || ''}`));
}

function normalizeResourceAssembly(type, artifact = {}, activity = {}) {
  const contract = deriveResourceUsageContract(activity, type);
  if (type !== 'cutout' || !contract.requiresSingleCompositeInsert || !artifact.cutoutDocument) return { artifact, contract };
  const document = artifact.cutoutDocument;
  const targets = Array.isArray(document.targets) ? [...document.targets] : [];
  let centerTarget = targets.find(target => /centro|interior|ventana|zona|area|composicion/i.test(comparable(`${target.label || ''} ${target.description || ''}`)));
  if (!centerTarget) {
    centerTarget = { id: 'zona-composicion', label: 'Zona de composición indicada en la actividad' };
    targets.push(centerTarget);
  }
  let cornerTarget = targets.find(target => /esquina|adorno|decor/i.test(comparable(`${target.label || ''} ${target.description || ''}`)));
  if (!cornerTarget) {
    cornerTarget = { id: 'zona-decorativa', label: 'Zona decorativa indicada en la actividad' };
    targets.push(cornerTarget);
  }
  const pieces = Array.isArray(document.pieces) ? document.pieces : [];
  // The action text of an insert commonly says “pegar dentro del marco”. It must
  // not turn that insert into the frame itself; only the piece identity can do so.
  const isBase = piece => isAssemblyBasePiece(piece);
  const bases = pieces.filter(isBase);
  const decorations = pieces.filter(piece => !isBase(piece) && isDecorationPiece(piece));
  const contentPieces = pieces.filter(piece => !isBase(piece) && !isDecorationPiece(piece));
  const sourceLabels = contentPieces.map(piece => String(piece.label || piece.shape || '')).filter(Boolean);
  const compositeId = String(contentPieces[0]?.id || 'fotografia-compuesta');
  const compositePiece = {
    ...(contentPieces[0] || {}),
    id: compositeId,
    label: contract.primaryPieceLabel,
    shape: `Una sola composición completa que integra ${sourceLabels.join(', ') || contract.requiredComponents.map(item => item.label).join(', ') || 'todos los elementos requeridos'}`,
    interactionRole: 'Recortar como una sola pieza y pegarla completa en la zona indicada dentro de la actividad',
    targetId: String(centerTarget.id)
  };
  document.targets = targets;
  document.pieces = [
    ...(contract.requiresAssemblyBase ? bases.map(piece => ({ ...piece, targetId: '' })) : []),
    compositePiece,
    ...decorations.map(piece => ({ ...piece, targetId: String(cornerTarget.id) }))
  ];
  document.instructions = `Recorta ${contract.primaryPieceLabel.toLowerCase()} como una sola pieza y pégala en la zona indicada dentro de la actividad.${decorations.length ? ' Recorta y coloca por separado las piezas decorativas en sus posiciones señaladas.' : ''}`;
  const removedIds = new Set(contentPieces.map(piece => String(piece.id || '')).filter(Boolean));
  document.answerKey = [
    ...(Array.isArray(document.answerKey) ? document.answerKey : []).filter(item => !removedIds.has(String(item.pieceId || ''))),
    { pieceId: compositeId, targetId: String(centerTarget.id) }
  ];
  artifact.cutoutDocument = document;
  return { artifact, contract };
}

function validateResourceActivityCoherence(type, artifact = {}, activity = {}) {
  const contract = deriveResourceUsageContract(activity, type);
  if (!['cutout', 'annex'].includes(type)) return { ok: true, errors: [], contract };
  const artifactText = artifactCoherenceText(artifact);
  const errors = [];
  for (const component of contract.requiredComponents) {
    if (artifact.visualReview?.ok === true && isAuditedVisualRequirement(component.label)) continue;
    const definition = COMPONENTS.find(item => item.id === component.id);
    const present = definition ? definition.match.test(artifactText) : containsRequiredElement(artifactText, component.label);
    if (!present) errors.push(`Falta el componente requerido por la actividad: ${component.label}.`);
  }
  if (type === 'cutout' && contract.requiresActivityPasteZone) {
    const code = String(contract.resourceSpecification?.code || '').trim();
    const activityHtml = String(activity.html || '');
    const hasPasteZone = /cb-cutout-paste-zone/i.test(activityHtml);
    if (!hasPasteZone) errors.push('La actividad no incluye la zona donde deben pegarse las piezas del recortable.');
  }
  if (type === 'cutout' && contract.requiresAssemblyBase) {
    const pieces = artifact.cutoutDocument?.pieces || [];
    const hasBasePiece = pieces.some(piece => isAssemblyBasePiece(piece));
    if (!hasBasePiece) errors.push('La especificación exige que la base forme parte del recortable, pero no se declaró esa pieza funcional.');
  }
  if (type === 'cutout' && contract.requiresSingleCompositeInsert) {
    const document = artifact.cutoutDocument || {};
    const centerTargetIds = new Set((document.targets || [])
      .filter(target => /centro|interior|ventana|zona|area|composicion/i.test(comparable(`${target.label || ''} ${target.description || ''}`)))
      .map(target => String(target.id || ''))
      .filter(Boolean));
    const insertPieces = (document.pieces || []).filter(piece => {
      if (isAssemblyBasePiece(piece) || isDecorationPiece(piece)) return false;
      const text = comparable(`${piece.label || ''} ${piece.shape || ''} ${piece.interactionRole || ''}`);
      return centerTargetIds.has(String(piece.targetId || '')) || /foto|fotograf|imagen principal|pieza principal|composicion completa|escena central|insert|zona indicada/.test(text);
    });
    if (insertPieces.length !== 1) errors.push(`La actividad exige una sola pieza principal compuesta, pero el recortable declara ${insertPieces.length} piezas principales.`);
    const insertText = comparable(insertPieces.map(piece => `${piece.label || ''} ${piece.shape || ''} ${piece.interactionRole || ''} ${piece.hint || ''}`).join(' '));
    if (insertPieces.length === 1 && !/foto|fotograf|imagen|paisaje|escena|pieza principal|composicion/.test(insertText)) errors.push('La pieza principal debe declararse como una composición completa, no como objetos separados.');
  }
  return { ok: errors.length === 0, errors, contract };
}

module.exports = {
  stripHtml,
  comparable,
  resourceSpecification,
  buildSyntheticResourceSpecification,
  validateResourceSpecification,
  deriveResourceUsageContract,
  normalizeResourceAssembly,
  validateResourceActivityCoherence
};
