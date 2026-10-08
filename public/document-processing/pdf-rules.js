const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export function classifyPage(page) {
  const text = normalize(page.text), logical = page.logicalPageNumber || 0;
  if (logical === 1 && !page.printedPageNumber) return 'cover';
  if (['isbn','reservados todos los derechos','editorial','copyright','impreso por','promotora y comercializadora','shutterstock'].some(marker => text.includes(marker))) return 'legal';
  if (text.includes('indice') && (text.match(/\d/g) || []).length >= 8) return 'index';
  if (['semana','mes','dia'].filter(marker => text.includes(marker)).length >= 2 && (text.match(/[a-z]{3,}/g) || []).length < 20) return 'agenda';
  if (logical <= 5 && ['prologo','campos formativos','ejes articuladores','competencias intrinsecas','pilares'].some(marker => text.includes(marker))) return 'intro';
  if (text.includes('unidad 1') && (page.headings || []).length <= 1) return 'unit-overview';
  return page.text.trim().length < 80 ? 'low-signal' : 'content';
}
// Stream the same pagination/section rules without retaining the entire PDF text.
export function createPdfRules(session = {}, categories = {}) {
  const result = { paginationIssues: [], sectionIssues: [], spellingIssues: [], orthotypographyIssues: [], colorIssues: [],
    stats: { pageCount: 0, sourceType: 'pdf', processingLocation: 'browser', spellProvider: 'nspell', geminiVerifierEnabled: false, analysisCategories: categories } };
  let previous, spacers = 0, allSpacers = true;
  const sections = (session.indexConfig?.sections || []).filter(section => section.title && Number(section.expectedPageNumber) > 0).map(section => ({ ...section, normalized: normalize(section.title), detected: null }));
  return { result, add(pages) {
    for (const page of pages) {
      if (page.status !== 'completed') throw Error(`No se pudo analizar la página ${page.page}: ${page.error || 'error de extracción'}`);
      result.stats.pageCount++;
      const logical = Number(page.logicalPageNumber || page.printedPageNumber || 0), type = classifyPage(page);
      if (logical > 0) {
        const reset = previous && page.logicalPageSource === 'pdf-label' && previous.logicalPageSource === 'pdf-label' && page.logicalPageRuleStartPage !== previous.logicalPageRuleStartPage;
        if (categories.pagination !== false && previous && !reset && logical !== previous.number + 1 && !(spacers && allSpacers && logical === previous.number + spacers + 1)) result.paginationIssues.push({ pdfPageNumber: page.page, printedPageNumber: logical, expectedPrintedPageNumber: previous.number + 1, printedPageLabel: page.logicalPageLabel || String(logical), logicalPageSource: page.logicalPageSource });
        previous = { ...page, number: logical }; spacers = 0; allSpacers = true;
      } else { spacers++; allSpacers &&= ['agenda','low-signal'].includes(type); }
      const sectionPage = logical || page.page;
      if (sectionPage > Number(session.indexConfig?.indexPageNumber || 0)) for (const section of sections) {
        if (section.detected === null && (page.headings || []).some(title => normalize(title) === section.normalized)) section.detected = sectionPage;
      }
      if (categories.spelling !== false && type === 'content') for (const issue of page.spelling || []) {
        if (result.spellingIssues.length >= 120) break;
        result.spellingIssues.push({ ...issue, printedPageNumber: logical || page.page, printedPageLabel: page.logicalPageLabel || String(logical || page.page), message: 'Posible falta de ortografía.', providers: ['nspell-es','nspell-en'] });
      }
    }
  }, finish() {
    if (categories.sections !== false) result.sectionIssues = sections.filter(section => section.detected !== Number(section.expectedPageNumber)).map(section => ({ sectionTitle: section.title, expectedPageNumber: Number(section.expectedPageNumber), detectedPageNumber: section.detected }));
    return result;
  } };
}
