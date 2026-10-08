import test from 'node:test';
import assert from 'node:assert/strict';
import { createPdfRules } from '../public/document-processing/pdf-rules.js';
const page = (number, logical, extra = {}) => ({ page: number, logicalPageNumber: logical, printedPageNumber: logical, text: 'Contenido suficiente para analizar. '.repeat(5), headings: [], status: 'completed', ...extra });
test('pagination detects jumps, allows spacers and respects label restarts', () => {
  const rules = createPdfRules();
  rules.add([page(1,1),page(2,0,{text:''}),page(3,3),page(4,5),page(5,1,{logicalPageSource:'pdf-label',logicalPageRuleStartPage:5}),page(6,1,{logicalPageSource:'pdf-label',logicalPageRuleStartPage:6})]);
  assert.deepEqual(rules.finish().paginationIssues.map(issue=>issue.pdfPageNumber),[4,5]);
});
test('sections exclude index, detect accents and report missing headings', () => {
  const rules=createPdfRules({ indexConfig:{indexPageNumber:1,sections:[{title:'Introducción',expectedPageNumber:3},{title:'Conclusión',expectedPageNumber:8}]} });
  rules.add([page(1,1,{headings:['Introducción']}),page(2,2,{headings:['Introduccion']})]);
  assert.deepEqual(rules.finish().sectionIssues,[{sectionTitle:'Introducción',expectedPageNumber:3,detectedPageNumber:2},{sectionTitle:'Conclusión',expectedPageNumber:8,detectedPageNumber:null}]);
});
test('incomplete extraction is an error, never a clean result', () => {
  assert.throws(()=>createPdfRules().add([{page:4,status:'error',error:'damaged'}]),/página 4/);
});
