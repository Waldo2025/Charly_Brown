const { hash, TYPES, validateArtifact } = require('./charly-resources/contracts.js');
const { validateResourceSpecification } = require('./charly-resources/coherence.js');
const RESOURCE_TYPES = { annex: 'anexo', cutout: 'recortable', worksheet: 'ficha', 'video-script': 'video' };
const stable = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const activityKey = item => item?.sectionId
  ? `section:${stable(item.sectionId)}`
  : `${stable(item.category)}:${stable(item.subtopic)}`;
const inputHash = unit => hash({
  meta: {
    level: unit.meta?.level || '',
    grade: unit.meta?.grade || '',
    trimester: unit.meta?.trimester || '',
    unit: unit.meta?.unit || ''
  },
  readingId: unit.accepted?.reading?.id || unit.reading?.id || unit.accepted?.reading?.title || unit.reading?.title || '',
  sya: unit.accepted?.sya || unit.sya || unit.syaContextKey || ''
});
const taskId = (stage, key) => hash([stage, key]).slice(0, 32);
function normalizedPlannedTypes(section = {}) {
  const raw = section.resourceTypes || (section.resourceSelections ? getTypesFromSelections(section.resourceSelections) : []);
  return [...new Set(raw.map(type => TYPES.includes(type)
    ? type
    : (Object.keys(RESOURCE_TYPES).find(key => RESOURCE_TYPES[key] === type) || type)).filter(type => TYPES.includes(type)))];
}
function reusableActivity(activity, section = {}) {
  if (!activity || !String(activity.html || '').trim()) return false;
  return normalizedPlannedTypes(section).every(type => validateResourceSpecification(activity, type).ok);
}
function reusableResource(resource, type, activity) {
  if (!resource) return false;
  if (!['annex', 'cutout'].includes(type)) return true;
  try {
    validateArtifact(type, resource, { activity });
    return true;
  } catch (_) {
    return false;
  }
}
function initialTasks(unit) {
  const sections = unit.workflow?.activitySections || [];
  if (!sections.length || sections.length > 100 || !unit.accepted?.reading || !(unit.accepted?.sya || unit.sya)) throw Object.assign(new Error('Completa lectura, secuencia y secciones antes de automatizar.'), { status: 422 });
  return sections.map((section, order) => {
    if (!section.category || !section.subtopic) throw Object.assign(new Error('Cada sección necesita categoría y subtema.'), { status: 422 });
    const candidate = unit.accepted.activities.find(a => activityKey(a) === activityKey(section));
    const activity = reusableActivity(candidate, section) ? candidate : null;
    return { id: taskId('activity', activityKey(section)), stage: 'activity', order, section, activityId: activity?.id || candidate?.id || `auto_${taskId('activity', activityKey(section))}`, status: activity ? 'completed' : 'pending', attempt: 0, dueAt: 0 };
  });
}
const MAX_UNIT_RESOURCES = 24;
const STAGE_CONCURRENCY = Object.freeze({
  activity: 7,
  worksheet: 1,
  annex: 2,
  cutout: 2,
  'video-script': 1,
  notes: 4,
  resources: 6
});

const productionConcurrency = stage => {
  if (stage === 'activity') return Math.max(1, Number.parseInt(process.env.CHARLY_ACTIVITY_CONCURRENCY, 10) || STAGE_CONCURRENCY.activity);
  if (stage === 'worksheet') return Math.max(1, Number.parseInt(process.env.CHARLY_WORKSHEET_CONCURRENCY, 10) || STAGE_CONCURRENCY.worksheet);
  if (stage === 'annex') return Math.max(1, Number.parseInt(process.env.CHARLY_ANNEX_CONCURRENCY, 10) || STAGE_CONCURRENCY.annex);
  if (stage === 'cutout') return Math.max(1, Number.parseInt(process.env.CHARLY_CUTOUT_CONCURRENCY, 10) || STAGE_CONCURRENCY.cutout);
  if (stage === 'video-script' || stage === 'video') return Math.max(1, Number.parseInt(process.env.CHARLY_VIDEO_CONCURRENCY, 10) || STAGE_CONCURRENCY['video-script']);
  if (stage === 'notes') return Math.max(1, Number.parseInt(process.env.CHARLY_NOTES_CONCURRENCY, 10) || STAGE_CONCURRENCY.notes);
  if (stage === 'resources') return Math.max(1, Number.parseInt(process.env.CHARLY_RESOURCE_CONCURRENCY, 10) || STAGE_CONCURRENCY.resources);
  return 4;
};
const RESOURCE_LIMITS = Object.freeze({
  worksheet: 6,
  annex: 6,
  cutout: 6,
  'video-script': 2,
  notes: 30
});

function nextTasks(run, tasks, unit) {
  const additions = [], existing = new Set(tasks.map(t => t.id));
  const add = task => {
    if (!existing.has(task.id)) {
      existing.add(task.id);
      additions.push({ ...task, status: task.status || 'pending', attempt: 0, dueAt: 0 });
    }
  };
  const sections = unit.workflow?.activitySections || [];

  const existingResources = tasks.filter(t => TYPES.includes(t.stage));
  const typeCounts = {};
  TYPES.forEach(type => {
    typeCounts[type] = existingResources.filter(t => t.stage === type && !['failed', 'stale'].includes(t.status)).length;
  });
  let currentResourceCount = existingResources.filter(t => !['failed', 'stale'].includes(t.status)).length;

  const allActivitiesCompleted = tasks.filter(t => t.stage === 'activity').every(t => t.status === 'completed');

  if (allActivitiesCompleted) {
    for (const parent of tasks.filter(t => t.stage === 'activity' && t.status === 'completed')) {
      const activity = unit.accepted?.activities?.find(a => a.id === parent.activityId);
      if (!activity) continue;

      const section = parent.section || sections.find(s =>
        (parent.sectionId && s.sectionId === parent.sectionId)
        || (parent.section?.section && s.section === parent.section.section)
        || activityKey(s) === activityKey(parent.section || activity)
        || (stable(s.category) === stable(activity.category) && stable(s.subtopic) === stable(activity.subtopic))
      );
      // La etapa de actividades decide explícitamente qué recursos existen.
      // La ausencia de configuración significa “sin recurso”; nunca fabriques
      // fichas, anexos o recortables por defecto, ni siquiera en Matemáticas.
      const specifications = Array.isArray(activity.resourceSpecifications) ? activity.resourceSpecifications : [];
      const allowedTypes = specifications.map(item => item?.type).filter(Boolean);

      if (!allowedTypes || allowedTypes.length === 0) {
        continue;
      }

      for (const rawType of allowedTypes) {
        if (currentResourceCount >= MAX_UNIT_RESOURCES) break;
        const normalizedType = TYPES.includes(rawType) ? rawType : (Object.keys(RESOURCE_TYPES).find(k => RESOURCE_TYPES[k] === rawType) || rawType);
        if (!TYPES.includes(normalizedType)) continue;

        const specificationValidation = validateResourceSpecification(activity, normalizedType);
        if (!specificationValidation.ok) {
          throw Object.assign(new Error(`La actividad “${activity.title || activity.id}” no entregó un contrato válido al especialista: ${specificationValidation.errors.join(' ')}`), {
            code: 'RESOURCE_SPECIFICATION_REQUIRED',
            status: 422
          });
        }
        const specification = specificationValidation.specification;

        if ((typeCounts[normalizedType] || 0) >= (RESOURCE_LIMITS[normalizedType] || 1)) continue;

        const hasTaskForThisActivity = tasks.some(t => t.activityId === activity.id && t.stage === normalizedType && !['failed', 'stale'].includes(t.status));
        if (hasTaskForThisActivity) continue;

        const tId = taskId(normalizedType, activity.id);
        if (!existing.has(tId)) {
          const prior = unit.accepted?.resources?.find(r =>
            r.activityId === activity.id
            && [normalizedType, RESOURCE_TYPES[normalizedType]].includes(r.type || r.contentType)
            && reusableResource(r, normalizedType, activity)
          );
          const code = String(specification.code).trim();
          typeCounts[normalizedType] = (typeCounts[normalizedType] || 0) + 1;
          currentResourceCount++;
          add({
            id: tId,
            stage: normalizedType,
            activityId: activity.id,
            section: activity.section || activity.title || '',
            subtopic: activity.subtopic || '',
            order: parent.order,
            code,
            status: prior ? 'completed' : 'pending'
          });
        }
      }
    }
  }

  const all = [...tasks, ...additions];

  // Solo los contratos aceptados de las actividades autorizan recursos.
  const expectedTypes = new Set();
  for (const acceptedActivity of unit.accepted?.activities || []) {
    for (const specification of acceptedActivity.resourceSpecifications || []) {
      const t = specification?.type;
      const norm = TYPES.includes(t) ? t : (Object.keys(RESOURCE_TYPES).find(k => RESOURCE_TYPES[k] === t) || t);
      if (TYPES.includes(norm)) expectedTypes.add(norm);
    }
  }

  const allExpectedCreated = all.filter(t => TYPES.includes(t.stage)).length >= MAX_UNIT_RESOURCES || expectedTypes.size === 0 || Array.from(expectedTypes).every(type =>
    all.some(t => t.stage === type)
  );

  const resourceTasks = all.filter(t => TYPES.includes(t.stage));
  const allResourcesCompleted = allExpectedCreated && (
    resourceTasks.length > 0
      ? resourceTasks.every(t => t.status === 'completed')
      : expectedTypes.size === 0
  );

  if (allActivitiesCompleted && allResourcesCompleted && all.some(t => t.stage === 'activity' && t.status === 'completed')) {
    for (const parent of all.filter(t => t.stage === 'activity' && t.status === 'completed')) {
      const tId = taskId('notes', parent.activityId);
      if (!existing.has(tId)) {
        const prior = unit.accepted?.teacherNotes?.find(n => n.activityId === parent.activityId || (all.filter(t => t.stage === 'activity').length === 1 && !n.activityId));
        const parentSection = typeof parent.section === 'object' && parent.section !== null ? parent.section : {};
        add({
          id: tId,
          stage: 'notes',
          activityId: parent.activityId,
          section: parentSection.name || parentSection.section || (typeof parent.section === 'string' ? parent.section : ''),
          subtopic: parentSection.subtopic || parentSection.mathFocus || '',
          order: 1000 + parent.order,
          status: prior ? 'completed' : 'pending'
        });
      }
    }
  }
  return additions;
}

function getTypesFromSelections(selections = {}) {
  if (!selections) return [];
  const types = [];
  if (selections.fichas) types.push('worksheet');
  if (selections.anexos) types.push('annex');
  if (selections.recortables) types.push('cutout');
  if (selections.videos) types.push('video-script');
  return types;
}
function parseErrorStatus(error = {}) {
  const status = Number(error.status || error.code || 0);
  if (status > 0) return status;
  const message = String(error.message || error || "");
  if (/429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(message)) return 429;
  if (/503|UNAVAILABLE|overloaded|high demand/i.test(message)) return 503;
  if (/504|GATEWAY_TIMEOUT|timeout/i.test(message)) return 504;
  if (/500|INTERNAL/i.test(message)) return 500;
  return 500;
}

function retryDelay(attempt, error = {}) {
  const status = parseErrorStatus(error);
  const is429 = status === 429;
  const maxAttempts = is429 ? 6 : 3;
  if (attempt >= maxAttempts || ![408, 429, 500, 502, 503, 504].includes(status)) return null;
  const baseDelay = is429 ? 5000 : 2000;
  return Math.max(Number(error?.retryAfterSeconds || 0) * 1000, baseDelay * (2 ** (attempt - 1)));
}
function isMathSection(section = {}) {
  return /matem[aá]t|saberes\s+y\s+pensamiento/i.test(`${section.category || ''} ${section.subtopic || ''} ${section.section || ''}`);
}
module.exports = { productionConcurrency, MAX_UNIT_RESOURCES, RESOURCE_TYPES, RESOURCE_LIMITS, activityKey, inputHash, taskId, initialTasks, nextTasks, retryDelay, getTypesFromSelections, isMathSection, reusableActivity, reusableResource };
