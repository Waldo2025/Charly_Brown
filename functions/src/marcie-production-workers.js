const { randomUUID } = require('node:crypto');
const { createVertexClient, buildVertexGenerateRequest, DEFAULT_TEXT_MODEL, DEFAULT_IMAGE_MODEL } = require('./vertex.js');
const { generateJson, createSourceAssessor, extractAttributedReferences, selectArticleEvidenceServer, verifyArticleEvidenceServer, researchDateWindow } = require('./marcie-editorial-research.js');
const { verifyCandidateSources } = require('./marcie-source-verifier.js');
const policy = require('./marcie-research-policy.js');
const { audienceSpecifications, hash } = require('./marcie-production-policy.js');
const createDraftService = require('./marcie-production-draft.generated.js');
const bibliography = require('./marcie-bibliography.js');

function createWorkers({ client = createVertexClient({ location: 'global' }), bucket } = {}) {
  return async function execute(run, task, checkpoint, signal) {
  const { withResearchContext } = require('./research/budget.js');
  return withResearchContext({ db: require('./common.js').getAdminServices().db,
    uid: run.ownerUid || run.ownerId, dossierId: require('./research/budget.js').dossierKey('marcie', run.sessionId || run.id) }, async () => {
  // The coordinator owns provider permits. Calls inside one task remain sequential.
  const managed = { productionManaged: true, models: { generateContent: args => { if (signal.aborted) throw signal.reason; return client.models.generateContent({ ...args, config: { ...args.config, abortSignal: signal } }); } } };
  const json = async (prompt, tools = [], research = {}) => (await generateJson({ client: managed, model: run.config.model || DEFAULT_TEXT_MODEL, prompt, tools, maxOutputTokens: 8192, ...research })).parsed;
  const draftService = createDraftService(async ({ model, payload }) => {
    const response = await managed.models.generateContent(buildVertexGenerateRequest({ model: model || DEFAULT_TEXT_MODEL, payload }));
    return (response?.candidates?.[0]?.content?.parts || []).map(part => part.text || '').join('');
  });
    const retrieveOptions = { fetchImpl: (url, options = {}) => fetch(url, { ...options, signal: options.signal ? AbortSignal.any([options.signal, signal]) : signal }) };
    const retrievalCache = new Map((task.input.pages || []).flatMap(page => [page.requestedUrl, page.finalUrl].filter(Boolean).map(url => [url, Promise.resolve(page)])));
    const config = run.config;
    const input = task.input;
    if (signal.aborted) throw signal.reason;
    switch (task.stage) {
      case 'propose': {
        const specs = audienceSpecifications(config, input.audience);
        const fixedTitle = specs.find(s => /^#(?:titulo|title)\s/i.test(s))?.replace(/^#(?:titulo|title)\s+/i, '');
        const result = await json(`Propón un enfoque editorial específico para ${input.audience} sobre ${config.audienceTopics[input.audience] || config.topic}. Modo ${config.mode}. Reglas ${JSON.stringify(config.profile)}. Instrucciones ${JSON.stringify(specs)}. ${config.prompts?.approach_proposals || ''}. ${fixedTitle ? `Conserva exactamente este título: ${fixedTitle}.` : 'Crea un título claro, específico y original.'} Base de video ${JSON.stringify(config.video)}. SOLO JSON {"title":"","brief":"","angle":""}.`);
        if (!String(result.title || '').trim() || !String(result.brief || '').trim()) throw Error('El enfoque llegó incompleto.');
        return { ...result, ...(fixedTitle ? { title: fixedTitle } : {}), audience: input.audience };
      }
      case 'search': {
        const selected = policy.platforms.filter(p => config.platforms.includes(p.id));
        const restriction = config.platforms.includes('supplemental')
          ? `Fuentes académicas y oficiales. Plataformas permitidas: ${config.platforms.join(', ')}. Excluir las plataformas desmarcadas: ${policy.platforms.filter(p => !config.platforms.includes(p.id)).flatMap(p => p.domains).join(', ')}.`
          : `Busca exclusivamente en estos dominios: ${selected.flatMap(p => p.domains).join(', ')}.`;
        if (!config.platforms.length) throw Object.assign(new Error('Selecciona una plataforma de investigación.'), { status: 400 });
        const currentYear = new Date().getUTCFullYear();
        const recentThresholdYear = currentYear - 5;
        const result = await json(`Investiga ${config.topic}. Enfoque complementario: ${input.lens}. Ronda ${input.round}. Región ${config.region}, periodo ${config.period}. Públicos ${config.audiences.join(', ')}. Instrucciones ${JSON.stringify(config.specifications)}. Política de investigación: ${config.prompts?.source_research_policy || ""}. ${restriction} CRITERIO CIENTÍFICO: Prioriza activamente literatura científica de los últimos 5 años (${recentThresholdYear}-${currentYear}), prefiriendo el hallazgo más reciente disponible a menos que la información científica no haya cambiado desde el artículo seminal original. Cada fuente debe incluir fecha o año verificable (publishedAt). Devuelve hasta 8 documentos originales pertinentes, con datos verificables. No inventes enlaces ni autores. No repitas: ${JSON.stringify(input.exclude || [])}. SOLO JSON {"sources":[{"title":"","url":"","authors":[],"publishedAt":"","publisher":"","doi":""}]}.`, [{ googleSearch: {} }], { researchQuery: `${config.topic} ${input.lens} investigación académica`.slice(0,300), researchDomains: config.platforms.includes('supplemental') ? [] : selected.flatMap(p => p.domains), excludedDomains: policy.platforms.filter(p => !config.platforms.includes(p.id)).flatMap(p => p.domains), evidenceGap: input.evidenceGap, reformulation: input.reformulation });
        return { sources: (result.sources || []).filter(s => /^https?:\/\//.test(s.url || '')).slice(0, 8) };
      }
      case 'validate': {
        const result = await verifyCandidateSources({ candidates: [input.source], maxCandidates: 1, retrievalConcurrency: 1,
          context: config.topic, retrieveOptions, assessSources: createSourceAssessor(managed), allowHistorical: true, dateWindow: researchDateWindow(config.period, new Date()) });
        if (result.quotaLimited || result.rejectedSources?.some(s => s.reason === 'verification_error')) throw Object.assign(new Error('La verificación documental requiere reintento.'), { status: result.quotaLimited ? 429 : 503 });
        await require('./research/budget.js').recordEvidence(result.verifiedSources);
        return { sources: result.verifiedSources, rejectedSources: result.rejectedSources, retrievedPages: result.retrievedPages.filter(page => result.verifiedSources.some(source => source.id === page.id)), attributedReferences: await extractAttributedReferences({ client: managed, verifiedSources: result.verifiedSources, retrievedPages: result.retrievedPages }) };
      }
      case 'select': {
        const result = await selectArticleEvidenceServer({ topic: config.topic, audiences: config.audiences,
          audienceBriefs: Object.fromEntries(config.audiences.map(a => [a, input.proposals?.[a]?.brief || config.proposals.find(p => p.audience === a)?.brief || config.audienceTopics[a] || config.topic])),
          minimumSources: config.minimum, dossier: input.dossier, dependencies: { client: managed } });
        const selected = result.byAudience;
        if (Object.values(selected || {}).some(dossier => dossier.blockers?.some(value => /No se pudo confirmar la pertinencia/.test(value)))) throw Object.assign(new Error("La selección de fuentes requiere reintento."), { status: 503 });
        return selected;
      }
      case 'draft': {
        const audience = input.audience;
        const specs = audienceSpecifications(config, audience);
        const title = specs.find(s => /^#(?:titulo|title)\s/i.test(s))?.replace(/^#(?:titulo|title)\s+/i, '') || input.proposal?.title || config.proposals.find(p => p.audience === audience)?.title || config.topic;
        const brief = [input.proposal?.brief || "", ...specs, `Vocabulario preferido: ${config.vocabulary.join(', ')}`, config.video ? `Base de video: ${JSON.stringify(config.video)}. Atribuye sus ideas, sin inventar citas ni reproducir su secuencia.` : ''].join('\n');
        let article = await draftService.generateArticleInChunks({ model: config.model || DEFAULT_TEXT_MODEL, title, topic: config.audienceTopics[audience] || config.topic, audience,
          brief, dossier: input.dossier, mode: config.mode === 'aida' || config.profile.structure === 'aida' ? 'aida' : config.mode,
          brandLine: config.profile.brandLine || '', editorialPolicy: [draftService.getAudienceEditorialDirective(audience), draftService.LATAM_ARTICLE_LANGUAGE_POLICY, config.prompts?.article_drafting || "", config.prompts?.source_citation_policy || "", JSON.stringify(config.profile)].join("\n"), checkpoint: task.checkpoint || run.imported.drafts[audience], onChunk: checkpoint, signal });
        article = draftService.applyVerifiedAttributions(article, input.dossier);
        if (config.humanize) {
          const originalQuotes = new Map(article.blocks.filter(b => b.type === 'quote').map(b => [b.id, b]));
          article = draftService.humanizeArticleContent(article);
          article.blocks = article.blocks.map(b => originalQuotes.get(b.id) || b);
        }
        const result = { ...article, sourceCitationStyle: 'apa', editorialMode: config.mode, preferredVocabulary: config.vocabulary, researchDossier: input.dossier, researchSources: input.dossier.sources, sources: input.dossier.sources, usedSources: input.dossier.sources };
        bibliography.assertIntegrity(result);
        return result;
      }
      case 'evidence':
        return verifyArticleEvidenceServer({ article: input.article, topic: config.topic, additionalSearches: 0, dependencies: { client: managed, retrievalConcurrency: 1, retrieveOptions, retrievalCache } });
      case 'style':
      case 'seo': {
        const audit = await json(`Revisa sin reescribir este artículo. Especialidad: ${task.stage === 'style' ? 'claridad, tono, español latinoamericano, coherencia y reglas editoriales' : 'SEO, título, descripción e intención de búsqueda'}. Reglas ${JSON.stringify(config.profile)}. Política de revisión: ${config.prompts?.editorial_review || ""}. Artículo ${JSON.stringify(input.article)}. SOLO JSON {"summary":"","issues":[{"id":"","blockId":"","message":"","suggestion":""}],"seoRecommendations":[]}.`);
        if (!Array.isArray(audit.issues)) throw Error('Revisión incompleta.');
        return { ...audit, articleFingerprint: hash(input.article) };
      }
      case 'correct': {
        if (!input.issues.length) return input.article;
        const corrected = await json(`Corrige exclusivamente estos hallazgos: ${JSON.stringify(input.issues)}. Conserva IDs, fuentes, público y estructura. No inventes citas ni bibliografía. Reglas ${JSON.stringify(config.profile)}. Devuelve SOLO JSON del artículo completo: ${JSON.stringify(input.article)}`);
        if (!Array.isArray(corrected.blocks) || !corrected.blocks.length) throw Error('Corrección incompleta.');
        const result = { ...input.article, ...corrected, title: input.article.title, subtitle: input.article.subtitle, audience: input.article.audience, researchSources: input.article.researchSources, sources: input.article.sources };
        bibliography.assertIntegrity(result);
        return verifyArticleEvidenceServer({ article: result, topic: config.topic, additionalSearches: 0, dependencies: { client: managed, retrievalConcurrency: 1, retrieveOptions, retrievalCache } });
      }
      case 'cover': {
        if (!bucket) throw Error('Almacenamiento de portadas no disponible.');
        const response = await managed.models.generateContent(buildVertexGenerateRequest({ model: DEFAULT_IMAGE_MODEL, payload: {
          contents: [{ role: 'user', parts: [{ text: `Portada editorial educativa horizontal 16:9. Fotografía conceptual humana, inclusiva, contemporánea; sin texto, logotipos ni marcas de agua. Tema ${input.article.title}. Público ${input.audience}. Contexto ${input.article.subtitle || ''}. Paleta natural y acentos verde azulado. Dirección editorial: ${config.prompts?.cover_generation || ""}.` }] }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '16:9', imageSize: '1K' } }
        } }));
        const image = response?.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data)?.inlineData;
        if (!image || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType)) throw Error('Portada incompleta.');
        const storagePath = `unidadesGeneradasAssets/${run.ownerId}/marcie-blog-editor/${run.sessionId}/${task.id}-${task.token}.${image.mimeType.split('/')[1]}`;
        const token = randomUUID();
        if (signal.aborted) throw signal.reason;
        await bucket.file(storagePath).save(Buffer.from(image.data, 'base64'), { resumable: false, metadata: { contentType: image.mimeType, metadata: { firebaseStorageDownloadTokens: token } } });
        if (signal.aborted) { await bucket.file(storagePath).delete().catch(() => {}); throw signal.reason; }
        return { url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`, storagePath, mimeType: image.mimeType, model: DEFAULT_IMAGE_MODEL, generatedAt: new Date().toISOString() };
      }
      default: throw Object.assign(new Error('Etapa desconocida.'), { status: 400 });
    }
  });
  };
}
module.exports = { createWorkers };
