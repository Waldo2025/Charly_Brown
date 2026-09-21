// Conservative recovery: commas only. Never add values, quotes or closing
// brackets to a potentially truncated response.
export function repairJsonCommas(text) {
  const tokens=[];let pos=0;
  while(pos<text.length){
    if(/\s/.test(text[pos])){pos++;continue;}
    const start=pos, ch=text[pos];
    if(ch==='"'){
      pos++;let closed=false;
      while(pos<text.length){if(text[pos]==='\\'){pos+=2;continue;}if(text[pos++]==='"'){closed=true;break;}}
      if(!closed)throw new Error('Cadena JSON incompleta');
      const raw=text.slice(start,pos);JSON.parse(raw);tokens.push({kind:'string',start,end:pos});continue;
    }
    if('{}[],:'.includes(ch)){tokens.push({kind:ch,start,end:++pos});continue;}
    const match=text.slice(pos).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=\s|[,\]}]|$)/);
    if(!match)throw new Error('Contenido JSON ambiguo');
    pos+=match[0].length;tokens.push({kind:'literal',start,end:pos});
  }
  let i=0;const edits=[];
  const expect=kind=>{if(tokens[i]?.kind!==kind)throw new Error('Estructura JSON incompleta o ambigua');return tokens[i++];};
  function value(){
    const kind=tokens[i]?.kind;
    if(kind==='string'||kind==='literal'){i++;return;}
    if(kind!=='{'&&kind!=='[')throw new Error('Falta un valor JSON');
    const object=kind==='{',end=object?'}':']';i++;
    if(tokens[i]?.kind===end){i++;return;}
    while(true){
      if(object){expect('string');expect(':');}value();
      if(tokens[i]?.kind===end){i++;return;}
      if(tokens[i]?.kind===','){
        const comma=tokens[i++];
        if(tokens[i]?.kind===end){edits.push({start:comma.start,end:comma.end,text:''});i++;return;}
      }else{
        if(!tokens[i]||(object&&(tokens[i].kind!=='string'||tokens[i+1]?.kind!==':')))throw new Error('JSON truncado o ambiguo');
        edits.push({start:tokens[i].start,end:tokens[i].start,text:','});
      }
    }
  }
  value();if(i!==tokens.length)throw new Error('Contenido adicional fuera del JSON');
  if(!edits.length)throw new Error('No hay una corrección inequívoca de comas');
  let fixed=text;for(const e of edits.sort((a,b)=>b.start-a.start))fixed=fixed.slice(0,e.start)+e.text+fixed.slice(e.end);
  return JSON.parse(fixed);
}
