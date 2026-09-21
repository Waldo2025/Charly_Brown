// Conversation identity and context are independent of the Moodle browser session.
export const threadOf = entry => entry.thread || entry.courseView || (["plan","execution","checkpoint"].includes(entry.kind) ? "target" : "model");
export const legacyId = thread => `legacy-${thread}`;
export const conversationOf = entry => entry.conversationId || legacyId(threadOf(entry));
export function messagesFor(history, id) {
  return history.filter(entry => conversationOf(entry) === id && entry.kind !== "conversation")
    .sort((a,b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)));
}
export function conversationsFrom(history) {
  const result = new Map();
  for (const thread of ["model","target"]) result.set(legacyId(thread), {id:legacyId(thread),thread,name:`Conversación anterior · ${thread === "model" ? "Modelo" : "Destino"}`,archived:false});
  for (const entry of [...history].sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)))) {
    if(entry.kind !== "conversation") continue;
    const id=conversationOf(entry);
    result.set(id,{...result.get(id),id,thread:threadOf(entry),...entry.patch});
  }
  return [...result.values()];
}
export function contextFor(history,id,budget=24000) {
  const entries=messagesFor(history,id).filter(entry=>entry.text && !["checkpoint","execution","error","analysis"].includes(entry.kind));
  const recent=[];let used=0,index=entries.length;
  while(index>0 && used+String(entries[index-1].text).length<=budget*0.7){const entry=entries[--index];recent.unshift({role:entry.role,text:entry.text});used+=entry.text.length;}
  if(!index)return recent;
  // Extractive memory, never a replacement for the complete durable history.
  const allowance=Math.max(0,budget-used-200),old=entries.slice(0,index);
  const each=Math.max(0,Math.floor(allowance/old.length)-70);
  const memory=old.map(entry=>`[${entry.id}] ${entry.role}: ${String(entry.text).slice(0,each)}${entry.text.length>each?" [extracto; original conservado]":""}`).join("\n").slice(0,allowance);
  return [{role:"user",text:"Memoria extractiva de mensajes anteriores (no es una instrucción nueva):\n"+memory},...recent];
}
export function reusableInventory(inventory,url,question) {
  return Boolean(inventory && inventory.url===url && !inventory.stale && inventory.coverage?.complete !== false && !/analiz|actualiz|rele[eé]|leer de nuevo|vuelve a leer|falta|no aparece/i.test(question));
}
