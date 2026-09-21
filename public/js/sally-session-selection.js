const key=uid=>`sally-last-session:${uid}`;
export function rememberSession(storage,uid,id){
  if(!uid)return;
  try{if(id)storage.setItem(key(uid),id);else storage.removeItem(key(uid));}catch{}
}
export function restoredSession(storage,uid,sessions,{ready=false,activeId=""}={}){
  if(!ready)return null;
  if(activeId&&sessions.some(session=>session.id===activeId))return activeId;
  let remembered="";try{remembered=storage.getItem(key(uid))||"";}catch{}
  if(remembered&&sessions.some(session=>session.id===remembered))return remembered;
  return sessions.find(session=>!session.archived)?.id||sessions[0]?.id||"";
}
