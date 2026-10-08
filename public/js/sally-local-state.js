const DRAFT_LIMIT=30000;

function releaseSallyDraftSpace(except=""){
  try{
    const keys=[];
    for(let index=0;index<localStorage.length;index++)keys.push(localStorage.key(index)||"");
    for(const key of keys){
      if(key===except)continue;
      if(key.startsWith("sally-unified-draft:")||(key.startsWith("sally-conversation:")&&key.includes(":draft:")))localStorage.removeItem(key);
    }
  }catch{}
}

export function readLocalState(key){
  try{return localStorage.getItem(key);}catch{return null;}
}

export function writeLocalState(key,value,{draft=false}={}){
  const text=String(value??"").slice(0,draft?DRAFT_LIMIT:500);
  try{localStorage.setItem(key,text);return true;}
  catch{
    releaseSallyDraftSpace(key);
    try{localStorage.setItem(key,text);return true;}catch{return false;}
  }
}

export function removeLocalState(key){
  try{localStorage.removeItem(key);}catch{}
}
