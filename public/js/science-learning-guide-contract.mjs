import { isCurriculumContentCompatible } from './science-curriculum-policy.mjs';

// Shared contract for authored guide content. Never fills missing scientific text.
export function validateScienceLearningGuide(activity, guide) {
  const issues = [], nonempty = value => typeof value === 'string' && value.trim().length > 0;
  const wordCount = value => String(value || '').trim().split(/\s+/).filter(Boolean).length;
  const expected = activity.gameMode === 'simulator' ? 0 : Number(activity.levelCount || 3);
  if (!nonempty(guide?.title) || !nonempty(guide?.introduction) || !Array.isArray(guide?.levels) || guide.levels.length !== expected) return { valid: false, issues: ['La guía no contiene la introducción y todos los niveles solicitados.'] };
  for (const [index, level] of guide.levels.entries()) {
    if (['title', 'narrative', 'objective', 'hint', 'imagePrompt'].some(key => !nonempty(level[key]))) issues.push(`Nivel ${index + 1}: faltan textos requeridos.`);
    if (!Array.isArray(level.concepts) || level.concepts.length < 1 || level.concepts.length > 2 || level.concepts.some(c => !nonempty(c.term) || !nonempty(c.definition))) issues.push(`Nivel ${index + 1}: se requieren uno o dos conceptos definidos.`);
    const example = level.example || {}, words = wordCount(example.text), explanationWords = wordCount(example.explanation);
    if (!nonempty(example.title) || words < 35 || words > 85 || explanationWords < 16 || explanationWords > 50 || !/[¿?]/.test(String(example.text || ''))) issues.push(`Nivel ${index + 1}: el ejemplo necesita contexto, pregunta y explicación completa.`);
    if (['math', 'physics', 'chemistry'].includes(activity.subject) && (!/[=≈∝→]/.test(String(example.formula || '')) || !/\d/.test(String(example.formula || '')))) issues.push(`Nivel ${index + 1}: falta una fórmula aplicada a los datos del caso.`);
    if (activity.subject === 'biology' && String(example.formula || '').trim()) issues.push(`Nivel ${index + 1}: Biología requiere explicación causal sin fórmula.`);
  }
  const visible = [guide.title, guide.introduction, ...guide.levels.flatMap(l => [l.title, l.narrative, l.objective, l.hint, l.example?.title, l.example?.text, l.example?.explanation, ...(l.concepts || []).flatMap(c => [c.term, c.definition])])].filter(Boolean).join(' ');
  if (!isCurriculumContentCompatible(activity, visible)) issues.push('El contenido no cumple el contrato curricular.');
  return { valid: issues.length === 0, issues };
}
