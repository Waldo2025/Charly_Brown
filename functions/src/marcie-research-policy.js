/* Shared research policy. Keep browser mirror identical (verified by tests). */
(function(root) {
  const version = 4;
  const searchBudget = { maxRounds: 3, verificationBatchSize: 32, maxCandidates: 256 };
  const supplemental = {
    id: "supplemental",
    name: "Búsqueda académica e institucional abierta",
    instruction: "Busca también fuera de las siete plataformas, sin limitarte a una lista cerrada de sitios. Prioriza artículos revisados por pares, libros académicos, revisiones sistemáticas, repositorios universitarios, bibliotecas digitales, organismos públicos e instituciones científicas fiables. Sigue las referencias bibliográficas pertinentes hasta el documento original. Evalúa autoría, respaldo documental y pertinencia; el dominio por sí solo no acredita fiabilidad. Recupera documentos concretos HTML o PDF, no portadas ni resultados de buscadores. Conserva autoría, fecha, título, publicación, volumen, número, páginas y DOI o URL comprobables. No inventes metadatos. Los documentos anteriores o sin fecha comprobada deben marcarse historical."
  };
  const platforms = [
    { id:"ebsco", name:"EBSCO", domains:["ebsco.com","ebscohost.com"] },
    { id:"cochrane", name:"Cochrane Library", domains:["cochranelibrary.com"] },
    { id:"redalyc", name:"Redalyc", domains:["redalyc.org"] },
    { id:"scielo", name:"SciELO", domains:["scielo.org","scielo.org.mx","scielo.br","scielo.cl","scielo.org.ar","scielo.org.co","scielo.isciii.es","scielo.org.pe","scielo.sld.cu","scielo.org.bo","scielo.sa.cr","scielo.senescyt.gob.ec","scielo.iics.una.py","scielo.pt","scielo.edu.uy","scielosp.org"] },
    { id:"dialnet", name:"Dialnet", domains:["dialnet.unirioja.es"] },
    { id:"base", name:"BASE", domains:["base-search.net"] },
    { id:"refseek", name:"RefSeek", domains:["refseek.com"] }
  ];
  function target(session = {}) { return Math.max(1, Math.min(30, Number(session.editorialProfileSnapshot?.minimumSources) || (session.editorialMode === "aida" ? 8 : 6))); }
  function fingerprint(session = {}, audience = "", context = {}) {
    session = { ...session, specifications: [...(session.specifications || []), { searchPlatforms: selection(session) }] };
    const youtube = (session.sourceInputs?.youtube || session.sessionConfiguration?.sourceInputs?.youtube || []).map(item => item?.videoId || item?.url).filter(Boolean);
    const videoAnalysisVersion = Number(session.videoResearch?.analysisVersion || session.sessionConfiguration?.videoResearch?.analysisVersion || 0);
    return JSON.stringify({ researchPolicyVersion:version, topic:session.topic || session.title, context, audience, region:session.researchRegion || "MX", period:session.researchPeriod || "6m", mode:session.editorialMode || "marcie", profile:session.editorialProfileSnapshot || {}, specifications:session.specifications || [], youtube, videoAnalysisVersion, revision:session.configurationRevision || 0 });
  }
  function selection(session = {}) {
    const ids = platforms.map(platform => platform.id).concat("supplemental");
    const selected = session.searchPlatforms ?? session.sessionConfiguration?.searchPlatforms;
    return Array.isArray(selected) ? ids.filter(id => selected.includes(id)) : ids;
  }
  function readiness(dossier = {}, minimum = dossier.targetSourceCount || 6) {
    const sources = (dossier.sources || []).filter(source => source.verificationStatus === "verified");
    const count = new Set(sources.map(source => String(source.doi || source.url || source.id).toLowerCase())).size;
    const targetCount = target({ editorialProfileSnapshot: { minimumSources: minimum } });
    const analysed = new Set(dossier.analysis?.sourceIds || []);
    const reasons = [];
    if (!count) reasons.push("La investigación no contiene fuentes verificadas.");
    if (dossier.analysisStatus !== "complete" || sources.some(source => !analysed.has(source.id))) reasons.push("Falta completar el análisis documental antes de redactar.");
    const substantiveBlockers = (Array.isArray(dossier.blockers) ? dossier.blockers : []).map(String).filter(reason =>
      !/\b\d+\s+de\s+\d+\s+fuentes verificadas requeridas\b/i.test(reason)
      && !/requiere\s+\d+\s+fuentes verificadas/i.test(reason)
    );
    if (dossier.verificationStatus === "blocked" && substantiveBlockers.length) reasons.push(...substantiveBlockers);
    return { ready: !reasons.length, count, target: targetCount, reasons: [...new Set(reasons)] };
  }
  function assertReady(dossier, minimum) {
    const state = readiness(dossier, minimum);
    if (!state.ready) {
      const error = new Error(state.reasons.join(" ") + " No se redactó ni se reemplazó el artículo. Reintenta la investigación o ajusta sus fuentes.");
      error.code = "marcie_research_incomplete";
      throw error;
    }
    return state;
  }
  const api = { version, platforms, supplemental, selection, target, fingerprint, searchBudget, readiness, assertReady };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MarcieResearchPolicy = api;
})(globalThis);
