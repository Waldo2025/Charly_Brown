export function courseReport(inventory){
  if(!inventory)return "";
  const sections=inventory.sections||[],pages=inventory.pages||[],coverage=inventory.coverage||{};
  const modules=sections.flatMap(section=>section.modules||[]);
  const unique=[...new Map(modules.map(m=>[m.url||m.id||m.title,m])).values()];
  const types={};for(const m of unique)types[m.type||"resource"]=(types[m.type||"resource"]||0)+1;
  const fonts={};for(const p of pages)for(const node of p.design||[])if(node.font)fonts[node.font]=(fonts[node.font]||0)+1;
  const lines=[inventory.title||"Curso",inventory.inProgress?"Análisis en curso":coverage.complete?"Lectura completada":"Lectura parcial",
    `${sections.length} secciones; ${unique.length} recursos únicos identificados.`,
    `Contenido leído: ${coverage.analyzed??pages.length} de ${coverage.discovered??unique.length} recursos navegables.`,
    "Tipos: "+Object.entries(types).map(([type,count])=>`${type}: ${count}`).join(", ")];
  if(inventory.format)lines.push("Formato detectado: "+inventory.format.label+(inventory.format.id==="unknown"?" (no confirmado)":""));
  if(inventory.tabCoverage)lines.push(`Pestañas y subpestañas leídas: ${inventory.tabCoverage.read} de ${inventory.tabCoverage.discovered}.`);
  for(const tab of inventory.tabs||[])lines.push(`${tab.level?"Subpestaña":"Pestaña"}: ${(tab.path||[tab.title]).join(" → ")} · ${tab.status==="read"?"leída":"pendiente o restringida"}`);
  const design=Object.entries(fonts).sort((a,b)=>b[1]-a[1]).slice(0,3);
  if(design.length)lines.push("Tipografías observadas: "+design.map(([font])=>font).join("; "));
  for(const page of pages.slice(0,3))lines.push(`${page.title||"Contenido"}: ${(page.text||"").replace(/\s+/g," ").slice(0,350)}`);
  if(inventory.warnings?.length)lines.push(`${inventory.warnings.length} incidencias. Consulta los avisos del inventario.`);
  lines.push("Alcance: estructura visible y texto extraído de páginas accesibles; no certifica archivos, preguntas ni contenido oculto. No se ha modificado Moodle.");
  return lines.join("\n\n");
}
