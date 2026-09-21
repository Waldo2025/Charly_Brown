import {sanitizeHtml,escapeHtml} from "./security-utils.js";
export function fillTemplate(html,values={}){
  const filled=String(html).replace(/\{\{\s*([\w-]+)\s*\}\}/g,(_,key)=>{
    if(!(key in values))throw Error(`Falta el valor de {{${key}}}.`);
    return escapeHtml(String(values[key]));
  });
  const clean=sanitizeHtml(filled);
  if(!clean.trim())throw Error("La plantilla no contiene HTML válido.");
  return clean;
}
export function contentMatches(inventories,query=""){
  const needle=query.toLocaleLowerCase();
  return inventories.flatMap(inv=>(inv?.pages||[]).map(page=>({...page,courseUrl:inv.url,courseView:inv.courseView})))
    .filter(page=>!needle||`${page.title} ${page.text}`.toLocaleLowerCase().includes(needle));
}
