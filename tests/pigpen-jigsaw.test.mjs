import test from 'node:test';import assert from 'node:assert/strict';
import {experience as E} from '../public/js/escape-room-experience.mjs';
import {createRewardEngine} from '../public/js/escape-room-rewards.mjs';
const R=createRewardEngine(E);
const plan=n=>R.buildPlan({primary_reward:'imagen',reward_image:'https://example.com/image.png'},'SECRET',Array.from({length:n},(_,i)=>({id:'m'+i,titulo:'Room '+i})));
for(let n=1;n<=8;n++)test('Puzzle '+n+': blank start, placement, persistence, no code, success',()=>{
 const p=plan(n);let s=R.finalState(p,{order:p.rooms.map((_,i)=>i),positions:{0:'S'}});
 assert.deepEqual(s.placements,Array(n).fill(null));assert.equal(R.evaluateFinal(p,s),false);
 assert.doesNotMatch(R.finalHTML(p,s),/data-reward-position|exp-reward-complete|SECRET/);
 for(let i=0;i<n;i++){s=R.actFinal(p,s,'select',String(i));s=R.actFinal(p,s,'place',String(i));}
 s=R.finalState(p,JSON.parse(JSON.stringify(s)));assert.equal(R.evaluateFinal(p,s),true);
 assert.doesNotMatch(R.finalHTML(p,s),/exp-reward-complete/);
 assert.match(R.finalHTML(p,{...s,solved:true}),/exp-reward-complete/);
 assert.equal((R.rewardHTML(p,0,'es').match(/<image /g)||[]).length,1);
 assert.doesNotMatch(R.rewardHTML(p,0,'es'),/<p>[^<]*<\/p>/);
});
test('Move, swap, return, invalid recovered positions and migration',()=>{
 const p=plan(4);let s={puzzle_version:1,placements:[0,1,null,null],selected:null};
 s=R.actFinal(p,s,'place','0');s=R.actFinal(p,s,'place','1');assert.deepEqual(s.placements,[1,0,null,null]);
 s=R.actFinal(p,s,'place','1');s=R.actFinal(p,s,'return');assert.deepEqual(s.placements,[1,null,null,null]);
 assert.equal(R.evaluateFinal(p,s),false);
 assert.deepEqual(R.finalState(p,{puzzle_version:1,placements:[1,1,99,-1],solved:true}).placements,[1,null,null,null]);
 const old={...p,visual_only:true};delete old.puzzle_version;
 const migrated=R.bindPlan(old,{experience_config:{primary_reward:'imagen'},clave_final:p.code,misiones:p.rooms.map(r=>({id:r.room_id}))});
 assert.equal(migrated.image,p.image);assert.equal(migrated.puzzle_version,1);assert.equal(migrated.visual_only,false);
});
test('Shared tab paths cover the image without overlap, measured by browser geometry',async()=>{
 const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true});
 try{const page=await browser.newPage();for(let n=1;n<=8;n++){
  const counts=await page.evaluate(paths=>{const ctx=document.createElement('canvas').getContext('2d'),shapes=paths.map(p=>new Path2D(p));let bad=0;for(let x=1.37;x<1000;x+=5.19)for(let y=2.13;y<1000;y+=5.43)if(shapes.filter(p=>ctx.isPointInPath(p,x,y)).length!==1)bad++;return bad;},plan(n).rooms.map(r=>r.puzzle_path));assert.equal(counts,0,'piece count '+n);
 }}finally{await browser.close();}
});

test('Missing image cannot be solved or shown as an empty puzzle',()=>{const p=plan(2);p.image='';assert.match(R.finalHTML(p,{},'es'),/Recompensa visual pendiente/);assert.equal(R.evaluateFinal(p,{puzzle_version:1,placements:[0,1]}),false);});
