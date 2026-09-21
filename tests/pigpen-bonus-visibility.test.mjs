import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {experience as EXP} from '../public/js/escape-room-experience.mjs';
const source=readFileSync(new URL('../public/js/escape-room-package-builder.mjs',import.meta.url),'utf8');
const snippet=source.slice(source.indexOf('  function bonusCapabilities('),source.indexOf('  function useExperienceBonus('));
function setup(extras,inventory={}){const ctx=vm.createContext({EXP,ESCAPE_ROOM_DATA:{idioma:'es',experience_config:{extras}},state:{isStarted:true,completedQuestions:new Set(),questionMatches:{},questionDragMatches:{},experience:{inventory,answers:{}}},usesDragAnswers:q=>q.tipo_interaccion==='drag_drop',escapeHtml:EXP.esc,escapeHtmlAttr:EXP.esc});vm.runInContext(snippet,ctx);return ctx;}
test('Written and choice questions never show the partial-check aid, even with stock',()=>{
 for(const inventory of [{},{comprobacion:2}])for(const tipo_interaccion of ['texto','opcion_multiple','verdadero_falso'])assert.equal(setup(['comprobacion'],inventory).renderBonusButtons({tipo_interaccion},'q'),'');
});
test('Compatible aid stays hidden at zero and shows a localized control when earned',()=>{
 const question={tipo_interaccion:'relacion_columnas'};const empty=setup(['comprobacion']).renderBonusButtons(question,'q');assert.equal(empty,'');assert.doesNotMatch(empty,/<button|\(0\)/);
 const available=setup(['comprobacion'],{comprobacion:1}).renderBonusButtons(question,'q');assert.match(available,/data-exp-bonus="comprobacion"/);assert.match(available,/Comprobar una parte \(1\)/);assert.match(available,/ disabled/);assert.match(available,/<svg/);
});
