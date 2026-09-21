/** Self-contained reward rules, embedded into exported games. */
export function createRewardEngine(E) {
  const symbols=['●','▲','■','◆','★','⬟','☀','☽','♠','♣','♥','♦','✚','✿','⚑','⚓','✦','◎','⊕','⊗','△','□','◇','☆','○','✧'];
  function buildPlan(config,code,rooms) {
    const c=E.config(config),chars=[...new Set(code)],table=chars.map((letter,i)=>({letter,symbol:symbols[i],x:i%6+1,y:Math.floor(i/6)+1}));
    let offset=0;
    const awards=rooms.map((room,i)=>{const fragment=room.fragment || code.slice(Math.floor(i*code.length/rooms.length),Math.floor((i+1)*code.length/rooms.length));const seq=[...fragment].map(l=>table.find(v=>v.letter===l));const result={room_id:room.id,index:i,fragment,encoded:seq.map(v=>v.symbol),coordinates:seq.map(v=>({x:v.x,y:v.y})),pattern:[...fragment].map((_,j)=>symbols[(offset+j)%6]),title:room.titulo,learning:room.learning || room.titulo,position:i,accessory:symbols[i%symbols.length]};offset+=fragment.length;return result;});
    awards.forEach((r,i)=>{r.crop={x:0,y:i/awards.length,width:1,height:1/awards.length};});
    const plan={version:1,visual_only:true,image_aspect:c.reward_image_aspect || 16/9,type:c.primary_reward,code,table,rooms:awards,image:c.primary_reward==='imagen'?(c.reward_image || ''):'',image_alt:c.reward_image_alt || rooms.map(r=>r.titulo).join(" · "), image_is_custom:Boolean(c.reward_image), final_options:[code,...new Set([code.split('').reverse().join(''),code.slice(1)+code[0],code.slice(-1)+code.slice(0,-1),code+'X'])].filter((v,i,a)=>a.indexOf(v)===i).slice(0,4)};
    return c.primary_reward==='imagen'?puzzlePlan(plan):plan;
  }
  function bindPlan(plan,project) {
    const c=E.config(project.experience_config);
    if(!plan || !Array.isArray(plan.rooms) || plan.code!==project.clave_final || plan.type!==c.primary_reward || plan.rooms.length!==project.misiones.length) return buildPlan(c,project.clave_final,project.misiones.map(m=>({id:m.id,titulo:m.titulo,learning:m.contexto,fragment:''})));
    const result={...structuredClone(plan),rooms:plan.rooms.map((r,i)=>({...r,room_id:project.misiones[i].id,crop:r.crop||{x:0,y:i/plan.rooms.length,width:1,height:1/plan.rooms.length}}))};
    if(c.primary_reward==='imagen'){
      if(c.reward_image)result.image=c.reward_image;
      if(/^data:image\/svg/i.test(result.image||'')&&!result.image_is_custom)result.image='';
      return puzzlePlan(result);
    }
    return result;
  }
  function issues(plan) {
    if(!plan || plan.version!==1 || !E.rewards.some(r=>r.id===plan.type) || !Array.isArray(plan.rooms)||!plan.rooms.length)return ['Contrato de recompensas inválido.'];
    if(plan.type!=='imagen' && plan.rooms.map(r=>r.fragment).join('')!==plan.code)return ['Los fragmentos no reconstruyen el código.'];
    if(plan.type==='imagen' && !/^(?:data:image\/|assets\/|https?:\/\/)/i.test(plan.image||''))return ['Falta la imagen de recompensa.'];
    if(plan.type==='imagen' && plan.rooms.length>8)return ['La recompensa admite entre 1 y 8 piezas.'];
    if(plan.type==='imagen' && plan.rooms.some(r=>r.crop)){
      const rects=plan.rooms.map(r=>r.crop);
      if(rects.some(r=>!r||![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.x<0||r.y<0||r.width<=0||r.height<=0||r.x+r.width>1.000001||r.y+r.height>1.000001))return ['Los recortes de la recompensa no son válidos.'];
      if(Math.abs(rects.reduce((sum,r)=>sum+r.width*r.height,0)-1)>0.000001)return ['Los fragmentos no cubren la imagen completa.'];
      for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];if(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>0.000001&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>0.000001)return ['Los fragmentos de imagen se superponen.'];}
    }
    return [];
  }
  function rewardHTML(plan,index,locale) {
    const r=plan?.rooms[index];if(!r)return '';
    const e=E.esc,tiles=v=>'<div class="exp-reward-grid">'+v.map(v=>'<span class="exp-reward-tile">'+e(v)+'</span>').join('')+'</div>';
    if(plan.type==='simbolos')return tiles(r.encoded);
    if(plan.type==='coordenadas')return tiles(r.coordinates.map(v=>'('+v.x+', '+v.y+')'));
    if(plan.type==='patron')return tiles(r.pattern);
    if(plan.type==='posiciones')return tiles([r.fragment])+ '<p>'+e(positionClue(plan,index,locale))+'</p>';
    if(plan.type==='imagen')return (plan.image?imagePiece(plan,index,false):'<p>'+e(E.ui(locale,'rewardPending'))+'</p>');
    return tiles([r.fragment]);
  }
  function positionClue(plan,i,locale) {
    const lang=String(locale).split('-')[0],n=i+1;
    const labels={es:['Primero','Después del fragmento de la sala '],en:['First','After the fragment from room '],fr:['En premier','Après le fragment de la salle '],pt:['Primeiro','Após o fragmento da sala ']};const text=labels[lang]||labels.en;
    return i===0?text[0]:text[1]+i;
  }
  function puzzleText(locale,key) {
    const texts={es:{instruction:'Une las piezas para reconstruir la imagen. Selecciona una pieza y luego un espacio, o arrástrala. Puedes intercambiarlas o devolverlas a la bandeja.',verify:'Comprobar rompecabezas',tray:'Devolver a la bandeja',piece:'Pieza',space:'Espacio',empty:'Coloca todas las piezas antes de comprobar.',wrong:'La imagen aún no está armada. Revisa la posición de las piezas.',success:'¡Rompecabezas completado!',title:'Rompecabezas final'},en:{instruction:'Rebuild the image. Select a piece and then a space, or drag it. You can swap pieces or return them to the tray.',verify:'Check puzzle',tray:'Return to tray',piece:'Piece',space:'Space',empty:'Place every piece before checking.',wrong:'The image is not assembled yet. Check the positions of the pieces.',success:'Puzzle completed!',title:'Final puzzle'}};
    return (texts[String(locale).split('-')[0]]||texts.en)[key];
  }
  // Every internal edge is generated once in world coordinates. Adjacent pieces
  // traverse that same curve in reverse, so their tabs and sockets are complementary.
  function puzzlePlan(plan) {
    const n=plan.rooms.length,cols=n%2===0?Math.min(n/2,4):1,rows=n/cols;
    const edge=(x,y,dx,dy,tab)=>{
      const pt=(t,b=0)=>(x+dx*t-dy*b)+' '+(y+dy*t+dx*b);
      return 'L '+pt(.35)+' C '+pt(.45)+' '+pt(.35,tab)+' '+pt(.5,tab)+' C '+pt(.65,tab)+' '+pt(.55)+' '+pt(.65)+' L '+pt(1);
    };
    const rooms=plan.rooms.map((r,i)=>{
      const x=i%cols/cols,y=Math.floor(i/cols)/rows,w=1/cols,h=1/rows;
      const tab=.16*Math.min(w,h),xx=x*1000,yy=y*1000,ww=w*1000,hh=h*1000;
      const path='M '+xx+' '+yy+' '+edge(xx,yy,ww,0,y?tab/w:0)+' '+edge(xx+ww,yy,0,hh,x+w<.999999?tab/h:0)+' '+edge(xx+ww,yy+hh,-ww,0,y+h<.999999?-tab/w:0)+' '+edge(xx,yy+hh,0,-hh,x?-tab/h:0)+' Z';
      return {...r,crop:{x,y,width:w,height:h},piece_id:'piece-'+i,puzzle_path:path};
    });
    return {...plan,visual_only:false,puzzle_version:1,puzzle_columns:cols,puzzle_rows:rows,rooms};
  }
  function pieceGraphic(plan,index,id) {
    const r=plan.rooms[index];
    return '<defs><clipPath id="'+id+'"><path d="'+E.esc(r.puzzle_path)+'"/></clipPath></defs><image href="'+E.esc(plan.image)+'" width="1000" height="1000" preserveAspectRatio="none" clip-path="url(#'+id+')"/><path d="'+E.esc(r.puzzle_path)+'" fill="none" stroke="currentColor" stroke-width="2"/>';
  }
  function imagePiece(plan,index) {
    plan=puzzlePlan(plan);const c=plan.rooms[index].crop,pad=.18*Math.min(c.width,c.height);
    return '<svg class="exp-puzzle-piece" role="img" aria-label="'+(index+1)+'" viewBox="'+[(c.x-pad)*1000,(c.y-pad)*1000,(c.width+2*pad)*1000,(c.height+2*pad)*1000].join(' ')+'" style="display:block;width:100%;max-height:220px;aspect-ratio:'+((plan.image_aspect||16/9)*(c.width+2*pad)/(c.height+2*pad))+'" preserveAspectRatio="none">'+pieceGraphic(plan,index,'reward-piece-'+index+'-'+(++graphicId))+'</svg>';
  }
  let graphicId=0;
  function puzzleHTML(plan,state,locale) {
    if(!plan.image)return '<p role="status">'+E.esc(E.ui(locale,'rewardPending'))+'</p>';
    plan=puzzlePlan(plan);const e=E.esc,text=k=>e(puzzleText(locale,k));
    if(state.solved && evaluateFinal(plan,state))return '<img class="exp-reward-complete" style="width:100%;height:auto" src="'+e(plan.image)+'" alt="'+e(plan.image_alt)+'">';
    const n=plan.rooms.length;
    let html='<div class="exp-puzzle" style="width:100%"><p>'+text('instruction')+'</p><div class="exp-puzzle-board" style="position:relative;width:100%;aspect-ratio:'+(plan.image_aspect||16/9)+';border:1px solid currentColor">';
    html+='<svg aria-hidden="true" viewBox="0 0 1000 1000" preserveAspectRatio="none" style="position:absolute;width:100%;height:100%;inset:0;pointer-events:none">';
    html+=plan.rooms.map(r=>'<path d="'+e(r.puzzle_path)+'" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="2" stroke-dasharray="8 6"/>').join('');
    html+=state.placements.map((piece,pos)=>{if(piece===null)return '';const src=plan.rooms[piece].crop,dst=plan.rooms[pos].crop;return '<g transform="translate('+((dst.x-src.x)*1000)+' '+((dst.y-src.y)*1000)+')">'+pieceGraphic(plan,piece,'board-'+pos+'-'+(++graphicId))+'</g>';}).join('');
    html+='</svg>';
    html+=plan.rooms.map((r,pos)=>{const piece=state.placements[pos],c=r.crop;return '<button type="button" data-reward-action="place" data-reward-value="'+pos+'" '+(piece===null?'':'draggable="true" data-puzzle-piece="'+piece+'"')+' aria-label="'+text('space')+' '+(pos+1)+(piece===null?'':' · '+text('piece')+' '+(piece+1))+'" aria-pressed="'+(piece!==null&&state.selected===piece)+'" style="touch-action:none;position:absolute;left:'+(100*c.x)+'%;top:'+(100*c.y)+'%;width:'+(100*c.width)+'%;height:'+(100*c.height)+'%;min-height:0;padding:0;border:0;border-radius:0;background:transparent;'+(piece!==null&&state.selected===piece?'outline:3px solid var(--accent,#fbbf24);outline-offset:-4px;':'')+'">'+(piece===null?'<span style="background:var(--panel,#18202c);color:var(--text,#fff);padding:3px 6px;border-radius:6px">'+(pos+1)+'</span>':'')+'</button>';}).join('');
    html+='</div><div class="exp-puzzle-tray" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:16px 0;min-height:60px">';
    const order=Array.from({length:n},(_,i)=>(i+Math.max(1,Math.floor(n/2)))%n);
    html+=order.filter(i=>!state.placements.includes(i)).map(i=>'<button type="button" draggable="true" data-puzzle-piece="'+i+'" data-reward-action="select" data-reward-value="'+i+'" aria-label="'+text('piece')+' '+(i+1)+'" aria-pressed="'+(state.selected===i)+'" style="touch-action:none;min-width:0;padding:8px;background:var(--panel,#18202c);color:var(--text,#fff);border:2px solid '+(state.selected===i?'var(--accent,#fbbf24)':'transparent')+';border-radius:12px">'+imagePiece(plan,i)+'</button>').join('');
    return html+'</div><button type="button" data-reward-action="return" '+(state.selected===null?'disabled':'')+'>'+text('tray')+'</button></div>';
  }
  function finalState(plan,old={}) {
    if(plan.type==='imagen'){const n=plan.rooms.length,seen=new Set();const placements=Array.from({length:n},(_,i)=>{const v=old.puzzle_version===1?old.placements?.[i]:null;if(!Number.isInteger(v)||v<0||v>=n||seen.has(v))return null;seen.add(v);return v;});return {puzzle_version:1,placements,selected:Number.isInteger(old.selected)&&old.selected>=0&&old.selected<n&&old.puzzle_version===1?old.selected:null,solved:old.puzzle_version===1&&old.solved===true&&placements.every((v,i)=>v===i)};}
    return {order:Array.isArray(old.order)?old.order:Array.from({length:plan.rooms.length},(_,i)=>(i+1)%plan.rooms.length),selected:old.selected??null,choice:old.choice||'',sequence:Array.isArray(old.sequence)?old.sequence:[],positions:old.positions||{}};
  }
  function finalHTML(plan,old={},locale='es') {
    const state=finalState(plan,old),e=E.esc;
    if(plan.type==='imagen')return puzzleHTML(plan,state,locale);
    let html='<div class="exp-final"><p>'+e(E.ui(locale,plan.type==='imagen'&&!plan.visual_only?'image':plan.type==='patron'?'pattern':'decode'))+'</p>';
    if(plan.type==='patron'){
      const wanted=plan.rooms.flatMap(r=>r.pattern);
      html+='<output class="exp-built">'+e(state.sequence.join(' '))+'</output><div class="exp-tray">'+symbols.slice(0,6).map(v=>'<button type="button" class="exp-option" data-reward-action="symbol" data-reward-value="'+e(v)+'">'+e(v)+'</button>').join('')+'</div><button type="button" data-reward-action="undo">'+e(E.ui(locale,'undo'))+'</button>';
    } else {
      if(plan.type==='simbolos'||plan.type==='coordenadas')html+='<div class="exp-reward-grid">'+plan.table.map(t=>'<span class="exp-reward-tile">'+e(plan.type==='simbolos'?t.symbol:'('+t.x+', '+t.y+')')+' = '+e(t.letter)+'</span>').join('')+'</div>';
      if(plan.type==='posiciones')html+='<div class="exp-reward-grid">'+plan.rooms.map((r,i)=>'<span>'+e(r.fragment+' · '+positionClue(plan,i,locale))+'</span>').join('')+'</div>';
      html+='<div class="exp-tray">'+[...plan.code].map((letter,i)=>'<label>'+(i+1)+' <select data-reward-position="'+i+'"><option value="">—</option>'+[...new Set(plan.code)].sort().map(l=>'<option'+(state.positions[i]===l?' selected':'')+'>'+e(l)+'</option>').join('')+'</select></label>').join('')+'</div>';
    }
    return html+'</div>';
  }
  function actFinal(plan,old,action,value) {
    const s=finalState(plan,old);
    if(plan.type==='imagen'){
      if(s.solved)return s;
      const i=Number(value),valid=Number.isInteger(i)&&i>=0&&i<plan.rooms.length;
      if(action==='select'&&valid)s.selected=s.selected===i?null:i;
      if(action==='return'&&s.selected!==null){s.placements=s.placements.map(v=>v===s.selected?null:v);s.selected=null;}
      if(action==='place'&&valid){if(s.selected===null)s.selected=s.placements[i];else{const from=s.placements.indexOf(s.selected),other=s.placements[i];if(from===i){s.selected=null;return s;}s.placements[i]=s.selected;if(from>=0)s.placements[from]=other;s.selected=null;}}
      return s;
    }
    if(action==='piece'){const i=Number(value);if(!Number.isInteger(i)||i<0||i>=s.order.length)return s;if(s.selected===null)s.selected=i;else{[s.order[s.selected],s.order[i]]=[s.order[i],s.order[s.selected]];s.selected=null;}}
    if(action==='choice'&&plan.final_options.includes(value))s.choice=value;
    if(action==='symbol'&&symbols.slice(0,6).includes(value)&&s.sequence.length<plan.rooms.flatMap(r=>r.pattern).length)s.sequence.push(value);
    if(action==='undo')s.sequence.pop();
    return s;
  }
  function evaluateFinal(plan,old) {
    const s=finalState(plan,old);
    if(plan.type==='imagen')return Boolean(plan.image)&&s.placements.every((v,i)=>v===i);
    if(plan.type==='patron')return JSON.stringify(s.sequence)===JSON.stringify(plan.rooms.flatMap(r=>r.pattern));
    return Array.from({length:plan.code.length},(_,i)=>s.positions[i]||'').join('')===plan.code;
  }
  function inventoryHTML(plan,progress,locale='es') {
    if(!plan)return '';
    const cards=plan.rooms.filter(r=>progress.awarded[r.room_id]).map(r=>'<article class="exp-rewards"><strong>'+E.esc(r.title)+'</strong>'+rewardHTML(plan,r.index,locale)+(progress.awarded[r.room_id].perfect?'<p>'+E.esc(E.ui(locale,'perfect'))+'</p>':'')+(progress.awarded[r.room_id].extras.includes('coleccionable')?'<p>'+E.esc(r.learning)+'</p>':'')+(progress.awarded[r.room_id].extras.includes('personalizacion')?'<button type="button" data-reward-accessory="'+E.esc(r.accessory)+'">'+E.esc(r.accessory)+' · '+E.esc(E.ui(locale,'personalize'))+'</button>':'')+'</article>').join('');
    return '<details class="exp-rewards"><summary>'+E.esc(E.ui(locale,'inventory'))+(progress.customization?' · '+E.esc(progress.customization):'')+'</summary>'+ (cards||'<p>'+E.esc(E.ui(locale,'none'))+'</p>')+'</details>';
  }
  return {puzzlePlan,puzzleText,buildPlan,bindPlan,issues,rewardHTML,finalHTML,actFinal,evaluateFinal,finalState,inventoryHTML};
}
