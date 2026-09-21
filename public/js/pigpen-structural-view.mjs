import { sessionTopicCandidates, topicAcademic, topicMatchesFilters } from './pigpen-topic-transfer.mjs?v=20260909-v1';

export const structuralKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
export const topicReferenceKey = (sessionId, topicId) => JSON.stringify([sessionId, topicId]);

export function buildStructuralGroups(sessions, filters = {}, search = '', normalizeGrade = value => value) {
  const groups = new Map();
  const query = structuralKey(search);
  const grades = ['Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto', 'Sexto'];
  for (const session of sessions) {
    // Truly empty sessions are not escape rooms. Legacy content remains visible.
    if (!session.topicSummaries?.length && !session.project && !Object.keys(session.formState || {}).length) continue;
    for (const topic of sessionTopicCandidates(session)) {
      if (!topicMatchesFilters(topic, filters, session)) continue;
      const academic = topicAcademic(topic, session);
      const materia = academic.materia || 'Sin materia', nivel = academic.nivel || 'Sin nivel';
      const grado = normalizeGrade(academic.grado) || 'Sin grado';
      const title = topic.title || session.project?.titulo || session.title || 'Nuevo escape room';
      if (query && !structuralKey([nivel, materia, grado, title, session.title].join(' ')).includes(query)) continue;
      const key = JSON.stringify([structuralKey(nivel), structuralKey(materia), structuralKey(grado)]);
      if (!groups.has(key)) groups.set(key, { key, materia, nivel, grado, title: `${nivel} · ${materia} · ${grado}`, topics: [] });
      const topicId = topic.id || 'legacy';
      groups.get(key).topics.push({ ...topic, ...academic, title, topicId, sessionId: session.id,
        sessionTitle: session.title || 'Sesión', referenceKey: topicReferenceKey(session.id, topicId) });
    }
  }
  const gradeIndex = topic => { const i = grades.indexOf(normalizeGrade(topic.grado)); return i < 0 ? grades.length : i; };
  for (const group of groups.values()) group.topics.sort((a, b) => gradeIndex(a) - gradeIndex(b)
    || structuralKey(normalizeGrade(a.grado)).localeCompare(structuralKey(normalizeGrade(b.grado)), 'es')
    || (Number(a.trimestre) || 4) - (Number(b.trimestre) || 4)
    || (Number(a.academicNumber) || 0) - (Number(b.academicNumber) || 0)
    || a.title.localeCompare(b.title, 'es') || a.referenceKey.localeCompare(b.referenceKey));
  return [...groups.values()].sort((a, b) => structuralKey(a.nivel).localeCompare(structuralKey(b.nivel), 'es')
    || structuralKey(a.materia).localeCompare(structuralKey(b.materia), 'es')
    || gradeIndex(a) - gradeIndex(b) || structuralKey(a.grado).localeCompare(structuralKey(b.grado), 'es'));
}
