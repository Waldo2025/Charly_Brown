const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { chromium } = require("../../node_modules/playwright");
const bibliography = require("../src/marcie-bibliography.js");
const { renderArticleToWordPressHtml } = require("../src/marcie-wordpress-core.js");
const { extractBibliographicMetadata, retrieveSourcePage } = require("../src/marcie-source-verifier.js");
const root = path.resolve(__dirname, "../..");
const read = p => fs.readFileSync(path.join(root,p),"utf8");
const strip = text => text.replace(/^import[\s\S]*?;\s*$/gm,"").replace(/\bexport /g,"");

test("source taxonomy separates documents from editorial resources and migrates saved choices", () => {
  const source = read("public/MarcieBlogEditor/js/components/modals.js");
  const context = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf("function normalizeEditorialSpecifications"), source.indexOf("function escapeModalHtml")), context);
  const values = context.normalizeEditorialSpecifications([
    "#fuentes Casos reales documentados", "#concepto Desarrollar un caso de estudio documentado",
    "#fuentes Bibliografía final en formato APA", "#fuentes Libros de autores reconocidos"
  ]);
  assert.deepEqual(Array.from(values), ["#concepto Desarrollar un caso de estudio documentado", "#fuentes Libros de autores reconocidos"]);
  const sources = source.slice(source.indexOf('<legend><span>Fuentes</span>'), source.indexOf('<legend><span>Recursos editoriales</span>'));
  assert.doesNotMatch(sources, /data-session-spec-value="(?:Casos reales documentados|Bibliografía final en formato APA)"/);
  assert.match(sources, /Dónde buscar/);
  assert.match(sources, /Tipos de fuente y criterios/);
  assert.match(source, /Bibliografía APA 7 · Siempre incluida/);
});

test("research checks all seven platforms and can supplement empty results", async () => {
  const { researchArticleEvidenceServer } = require("../src/marcie-editorial-research.js");
  const prompts=[];
  const client={models:{generateContent:async request=>{
    const prompt=request.contents[0].parts[0].text;prompts.push(prompt);
    return {candidates:[{content:{parts:[{text:JSON.stringify({sources:[],facts:[],currentSignals:[],historicalMilestones:[]})}]}}]};
  }}};
  const dossier=await researchArticleEvidenceServer({topic:"Aprendizaje",dependencies:{client}});
  const expected=require("../src/marcie-research-policy.js").platforms;
  for(const platform of expected) assert.ok(prompts.some(prompt=>prompt.includes("site:"+platform.domains[0])),platform.name);
  assert.ok(dossier.platformResults.some(result=>result.id==="supplemental"));
  assert.equal(dossier.sources.length,0);
});
test("research searches only selected platforms and rejects an empty selection", async () => {
  const { researchArticleEvidenceServer } = require("../src/marcie-editorial-research.js");
  const prompts = [];
  const client = { models: { generateContent: async request => {
    prompts.push(request.contents[0].parts[0].text);
    return { candidates: [{ content: { parts: [{ text: JSON.stringify({ sources: [] }) }] } }] };
  } } };
  const dossier = await researchArticleEvidenceServer({ topic: "Aprendizaje", searchPlatforms: ["scielo"], dependencies: { client } });
  assert.equal(prompts.length, 3);
  assert.ok(prompts[0].includes("site:scielo.org"));
  assert.deepEqual(dossier.platformResults.map(result => result.id), ["scielo", "scielo", "scielo"]);
  await assert.rejects(researchArticleEvidenceServer({ searchPlatforms: [], dependencies: { client } }), /Selecciona al menos/);
  assert.equal(prompts.length, 3);
  const policy = require("../src/marcie-research-policy.js");
  assert.notEqual(policy.fingerprint({ searchPlatforms: ["scielo"] }), policy.fingerprint({ searchPlatforms: ["ebsco"] }));
});

test("failed/empty dossiers are retried; valid matching dossiers are reused", async () => {
  let searches=0;
  const context=vm.createContext({
    MarcieResearchPolicy:require("../src/marcie-research-policy.js"),
    listMarciePromptProfiles:()=>[],
    researchArticleEvidence:async()=>{searches++;if(searches===1)throw Error("offline");return {sources:Array.from({length:6},(_,i)=>({id:"s"+i,verificationStatus:"verified",title:"Paper",url:"https://example.org/paper"+i})),analysisStatus:"complete",analysis:{sourceIds:Array.from({length:6},(_,i)=>"s"+i)},verificationStatus:"verified"};},
    draftArticleWithGemini:async({researchDossier})=>({blocks:[{text:"Article"}],sources:researchDossier.sources}),
    console
  });
  vm.runInContext(strip(read("public/MarcieBlogEditor/js/services/marcie-mode-service.js")),context);
  const session={id:"s",topic:"Learning",audience:"educators",researchByAudience:{educators:{sources:[]}}};
  await assert.rejects(context.draftArticleForMode({session,topic:session.topic,audience:"educators"}),/fuentes verificadas/);
  const result=await context.draftArticleForMode({session,topic:session.topic,audience:"educators"});
  assert.equal(result.sources.length,6);assert.equal(searches,2);
  await context.draftArticleForMode({session,topic:session.topic,audience:"educators"});assert.equal(searches,2);
  session.topic="Different";
  await context.draftArticleForMode({session,topic:session.topic,audience:"educators"});assert.equal(searches,3);
});
function storeContext(remoteRevision=0) {
  const writes=[], storage=new Map();
  let remote={storageRevision:remoteRevision};
  const context=vm.createContext({
    getCurrentUser:()=>({uid:"owner",email:"owner@example.org"}),
    db:{},doc:(_db,_collection,id)=>id,serverTimestamp:()=>new Date("2026-09-08"),
    normalizeEditorialMode:x=>x||"marcie",normalizeSelectedAudiences:x=>x||["educators"],isAidaArticleCompatible:()=>true,
    localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)||null,removeItem:k=>storage.delete(k)},
    runTransaction:async(_db,fn)=>fn({get:async()=>({exists:()=>true,data:()=>remote}),set:(_ref,payload,options)=>{assert.ok(options.mergeFields.includes("article"));remote=payload;writes.push(JSON.parse(JSON.stringify(payload)));}}),
    console,setTimeout,clearTimeout,queueMicrotask
  });
  vm.runInContext(strip(read("public/MarcieBlogEditor/js/services/marcie-session-store.js")),context);
  return {context,writes,storage};
}
test("queued writes snapshot each edit, preserve separate audiences and persist metadata",async()=>{
  const {context,writes}=storeContext();
  const session={id:"s",ownerId:"owner",title:"First",audience:"educators",article:{audience:"educators",title:"First",blocks:[]},articlesByAudience:{parents:{audience:"parents",title:"Parents",blocks:[]}},researchRegion:"ES",researchPeriod:"12m",auditsByAudience:{parents:{issues:[]}},archived:true};
  const one=context.saveMarcieSession(session);session.title="Second";session.article.title="Second";const two=context.saveMarcieSession(session);
  await Promise.all([one,two]);
  assert.equal(writes[0].title,"First");assert.equal(writes[1].title,"Second");
  assert.equal(writes[1].articlesByAudience.parents.title,"Parents");
  assert.equal(writes[1].researchRegion,"ES");assert.equal(writes[1].archived,true);assert.equal(writes[1].storageRevision,2);
});

test("session persistence removes inline images and duplicated research payloads", () => {
  const source=read("public/MarcieBlogEditor/js/services/marcie-session-store.js");
  const code=source.slice(source.indexOf("function omitUndefinedFirestoreValues"),source.indexOf("async function persistMarcieSession")).replace(/\bexport /g,"");
  const context=vm.createContext({});
  vm.runInContext(code,context);
  const sources=Array.from({length:12},(_,index)=>({id:`s${index}`,title:`Fuente ${index}`,url:`https://example.org/${index}`,apaCitation:"Referencia completa ".repeat(20)}));
  const rejected=Array.from({length:80},(_,index)=>({id:`r${index}`,title:`Descartada ${index}`,url:`https://discarded.example/${index}`,reason:"content_mismatch",raw:"x".repeat(2000)}));
  const dossier={sources,rejectedSources:rejected,platformResults:Array.from({length:21},(_,index)=>({id:`p${index}`,round:1,status:"searched",query:"q".repeat(5000),rejected})),telemetry:{retrievedUrls:sources.map(item=>item.url)}};
  const article={title:"Artículo",blocks:[{text:"Contenido"}],featuredImage:{url:`data:image/png;base64,${"A".repeat(400000)}`},sources,usedSources:sources,researchSources:sources,researchDossier:dossier,sourceAudit:rejected};
  const session={audience:"parents",article,articlesByAudience:{parents:article},researchByAudience:{parents:dossier},trends:[dossier],log:[]};
  const before=Buffer.byteLength(JSON.stringify(session));
  const compact=context.compactMarcieSessionForFirestore(session);
  const serialized=JSON.stringify(compact);
  assert.ok(Buffer.byteLength(serialized)<before/4);
  assert.doesNotMatch(serialized,/data:image|base64,/i);
  assert.equal(compact.article.sources.length,12);
  assert.equal(compact.article.researchDossier,undefined);
  assert.equal(compact.researchByAudience.parents.platformResults[0].query,undefined);
  assert.equal(compact.researchByAudience.parents.rejectedSources.length,40);
});
test("remote revision conflict prevents overwrites and retains a user-scoped backup",async()=>{
  const {context,writes,storage}=storeContext(9);
  const session={id:"s",ownerId:"owner",title:"Local",article:{blocks:[]}};
  await assert.rejects(context.saveMarcieSession(session));
  assert.equal(writes.length,0);
  assert.ok(storage.has("marcie_blog_editor_pending_save_v1_owner_s"));
});
test("PDF retrieval extracts actual document text using bounded downloaded bytes",async()=>{
  const text="Learning research supports classroom practice and evidence based decisions. ".repeat(5);
  const stream="BT /F1 12 Tf 20 750 Td "+Array.from({length:6},()=>"(Learning research supports classroom practice and evidence.) Tj 0 -20 Td").join(" ")+" ET";
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>","<< /Length "+stream.length+" >>\nstream\n"+stream+"\nendstream","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let pdf="%PDF-1.4\n";const offsets=[0];
  objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(pdf));pdf+=(index+1)+" 0 obj\n"+object+"\nendobj\n";});
  const xref=Buffer.byteLength(pdf);pdf+="xref\n0 6\n0000000000 65535 f \n"+offsets.slice(1).map(offset=>String(offset).padStart(10,"0")+" 00000 n \n").join("")+"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF";
  const page=await retrieveSourcePage({id:"pdf",title:"Paper",url:"https://example.org/paper.pdf"},{resolveHost:async()=>[{address:"93.184.216.34",family:4}],fetchImpl:async()=>new Response(Buffer.from(pdf),{headers:{"content-type":"application/pdf"}})});
  assert.match(page.text,/Learning research supports classroom/);assert.equal(page.contentType,"application/pdf");
});

test("browser and server bibliography/research policies use identical implementations", () => {
  for (const name of ["marcie-bibliography","marcie-research-policy"]) assert.equal(read("functions/src/"+name+".js"),read("public/MarcieBlogEditor/js/contracts/"+name+".js"));
});
test("APA retains all used documents, deduplicates DOI and excludes unused research", () => {
  const sources = Array.from({length:25}, (_,i) => ({id:"s"+i,title:"Paper "+i,authors:["Apellido, A."],year:"2020",doi:"10.1234/"+i,url:"https://example.org/"+i}));
  const article = {sources,usedSources:[...sources,{...sources[0],url:"https://other.org/copy"}],researchSources:[{id:"unused",title:"Discarded",url:"https://example.org/unused"}]};
  assert.equal(bibliography.sources(article).length,25);
  assert.equal(bibliography.sources(article).some(s=>s.id==="unused"),false);
  const html = renderArticleToWordPressHtml(article);
  assert.equal((html.match(/<li /g)||[]).length,25);
  assert.match(html,/Referencias bibliográficas/);
});
test("APA handles journal metadata, personal names, absent dates and unsafe links", () => {
  const s={authors:[{family:"García",given:"Ana María"}],year:"2022",title:"Aprendizaje",journal:"Educación",volume:"12",issue:"3",pages:"10–20",doi:"10.1234/abc"};
  assert.equal(bibliography.format(s),"García, A. M. (2022). Aprendizaje. Educación, 12(3), 10–20. https://doi.org/10.1234/abc");
  assert.match(bibliography.formatHtml(s),/<em>Educación, 12<\/em>/);
  assert.match(bibliography.format({title:"Sin fecha"}),/s\. f\./);
  assert.doesNotMatch(bibliography.formatHtml({title:"<script>",url:"javascript:alert(1)"}),/<script>|javascript:/);
});

test("APA 7 distinguishes books, institutional reports and journal articles without numbering", () => {
  const book = { authors: ["López, Waldo"], year: "2024", title: "Neuroeducación aplicada", publisher: "Editorial Académica", url: "https://books.example.edu/neuroeducacion" };
  const report = { authors: ["UNESCO"], year: "2025", title: "Informe mundial de educación", publisher: "UNESCO", url: "https://unesco.example.org/report" };
  assert.equal(bibliography.format(book), "López, W. (2024). Neuroeducación aplicada. Editorial Académica. https://books.example.edu/neuroeducacion");
  assert.equal(bibliography.format(report), "UNESCO. (2025). Informe mundial de educación. https://unesco.example.org/report");
  assert.doesNotMatch(bibliography.markdown({ title: "Artículo", sources: [book, report] }), /^\[\d+\]/m);
});

test("Markdown includes the same complete bibliography and formatted direct quotes", () => {
  const article={title:"Artículo",blocks:[{type:"quote",text:"El aprendizaje requiere práctica.",attribution:"García (2022)",sourceIds:["s"]}],sources:[{id:"s",authors:["García, A."],year:"2022",title:"Aprendizaje",journal:"Educación",url:"https://example.org/article"}]};
  const markdown=bibliography.markdown(article);
  assert.match(markdown,/García \(2022\): \*“El aprendizaje requiere práctica\.”\*/);
  assert.match(markdown,/\*Educación\*/);
  assert.match(markdown,/Referencias bibliográficas/);
  assert.match(renderArticleToWordPressHtml(article),/href="#source-s"/);
});

test("reconfiguration success commits the same ID and invalidates approval", async () => {
  const editor=read("public/MarcieBlogEditor/js/editor-app.js");
  const fn=editor.slice(editor.indexOf("async function reconfigureSession"),editor.indexOf("function setupEventListeners"));
  let committed;
  const session={id:"same",topic:"Original",article:{title:"Original"},articlesByAudience:{parents:{title:"Original"}},publicationsByAudience:{parents:{remoteId:123,status:"publish"}}};
  const context=vm.createContext({sessionOperations:new Set(),showNewSessionModal:async()=>({title:"Nuevo",topic:"Nuevo",selectedAudiences:["parents"],specifications:[]}),getActiveMarciePromptProfileId:()=>"",listMarciePromptProfiles:()=>[],listEditorialProfilesOnce:async()=>[],chooseEditorialAction:async()=>"replace",showAutomatedSessionProgress(){},runAutomatedSessionWorkflow:async working=>{working.article={title:"Nuevo",blocks:[{text:"New"}],approval:{approvedAt:"date"}};working.articlesByAudience={parents:working.article};working.approvedAudiences=["parents"];},saveMarcieSession:async()=>{},commitMarcieSessionReplacement:async working=>{committed=JSON.parse(JSON.stringify(working));},appState:{sessions:[session]},renderSessionList(){},renderActiveSession(){},showToast(){}});
  vm.runInContext(fn,context);
  await context.reconfigureSession(session);
  assert.equal(committed.id,"same");assert.equal(session.article.title,"Nuevo");assert.deepEqual(committed.approvedAudiences,[]);assert.equal(committed.article.approval,undefined);assert.equal(committed.publicationsByAudience.parents.remoteId,123);
});
test("publisher metadata keeps journal volume issue pages and all authors", () => {
  const meta=extractBibliographicMetadata('<meta name="citation_journal_title" content="Revista"><meta name="citation_volume" content="4"><meta name="citation_issue" content="2"><meta name="citation_firstpage" content="12"><meta name="citation_lastpage" content="19">'+Array.from({length:23},(_,i)=>'<meta name="citation_author" content="Autor '+i+'">').join(""));
  assert.equal(meta.journal,"Revista"); assert.equal(meta.pages,"12–19"); assert.equal(meta.authors.length,23);
});
test("real browser preserves body edits before changing sessions and persists all block types", async () => {
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    await page.setContent('<span id="sync-status"></span><h1 id="article-title" contenteditable="true">A</h1><p id="article-subtitle">Sub</p><div id="article-body-container"><h2 data-block-id="h">Heading</h2><p data-block-id="p">Paragraph</p><blockquote data-block-id="q"><p>Quote</p><footer>Author (2020)</footer></blockquote><ul data-block-id="l"><li>One</li></ul></div>');
    const result=await page.evaluate(async source=>{
      window.saved=[];window.saveMarcieSession=async session=>saved.push(JSON.parse(JSON.stringify(session)));window.markMarcieSessionDirty=()=>{};
      (0,eval)(source);
      const a={id:"A",audience:"educators",article:{title:"A",blocks:[{id:"h",type:"heading"},{id:"p",type:"paragraph"},{id:"q",type:"quote"},{id:"l",type:"bulletList"}]}};
      let active=a;
      makeArticleEditable({getSession:()=>active});
      document.querySelector("h2").textContent="Changed heading";
      document.querySelector("blockquote p").textContent="Changed quote";
      document.querySelector("li").textContent="Changed list";
      document.getElementById("article-title").textContent="Edited A";
      document.getElementById("article-title").dispatchEvent(new Event("input",{bubbles:true}));
      active={id:"B"};
      document.getElementById("article-title").textContent="B";
      document.querySelector("#article-body-container p").textContent="B paragraph";
      await new Promise(resolve=>setTimeout(resolve,550));
      return saved;
    },strip(read("public/MarcieBlogEditor/js/components/inline-editor.js")));
    assert.equal(result[0].id,"A"); assert.equal(result[0].title,"Edited A");
    assert.equal(result[0].article.blocks[0].text,"Changed heading");
    assert.equal(result[0].article.blocks[2].text,"Changed quote");
    assert.deepEqual(result[0].article.blocks[3].items,["Changed list"]);
  } finally { await browser.close(); }
});
test("audience cancellation makes no requests and existing article opens without generation", async () => {
  const editor=read("public/MarcieBlogEditor/js/editor-app.js");
  const fn=editor.slice(editor.indexOf("async function selectAudienceSafely"),editor.indexOf("async function reconfigureSession"));
  let choice="cancel",calls=0,dialogTitle="";
  const context=vm.createContext({sessionOperations:new Set(),chooseEditorialAction:async title=>{dialogTitle=title;return choice;},getEditorialAudienceLabel:x=>x==="parents"?"Padres y tutores":x,draftArticleForMode:async()=>{calls++;return{}},saveMarcieSession:async()=>{},updateAudienceSelector(){},renderSessionList(){},renderActiveSession(){},requestAnimationFrame:callback=>callback(),setSyncStatus(){},showToast(){},invalidateMaterialApproval(){},window:{}});
  vm.runInContext(fn,context);
  const session={id:"a",audience:"educators",article:{title:"Old"},articlesByAudience:{}};
  await context.selectAudienceSafely(session,"parents");assert.equal(dialogTitle,"Artículo para Padres y tutores");assert.equal(session.audience,"educators");assert.equal(calls,0);
  session.articlesByAudience.parents={title:"Parents",blocks:[{text:"Hello"}]};
  await context.selectAudienceSafely(session,"parents");assert.equal(session.article.title,"Parents");assert.equal(calls,0);
});

test("audience generation shows its progress in article-view and clears it after saving", async () => {
  const editor=read("public/MarcieBlogEditor/js/editor-app.js");
  const fn=editor.slice(editor.indexOf("async function selectAudienceSafely"),editor.indexOf("async function reconfigureSession"));
  const spinner=[];
  const context=vm.createContext({sessionOperations:new Set(),chooseEditorialAction:async()=>"generate",getEditorialAudienceLabel:()=>"Padres y tutores",
    window:{__marcieShowArticleGenerationSpinner:(session,progress)=>spinner.push({state:"show",session:session.id,...progress}),__marcieHideArticleGenerationSpinner:()=>spinner.push({state:"hide"})},
    draftArticleForMode:async()=>{assert.equal(spinner[0].state,"show");return{title:"Nuevo",audience:"parents",blocks:[{text:"Contenido"}]};},
    saveMarcieSession:async()=>{},renderSessionList(){},renderActiveSession(){},setSyncStatus(){},showToast(){},invalidateMaterialApproval(){}});
  vm.runInContext(fn,context);
  const session={id:"a",topic:"Tema",audience:"educators",article:{title:"Old"},articlesByAudience:{},researchByAudience:{},approvedAudiences:[]};
  await context.selectAudienceSafely(session,"parents");
  assert.deepEqual(spinner.map(entry=>entry.state),["show","hide"]);
  assert.equal(spinner[0].audienceLabel,"Padres y tutores");
  assert.equal(spinner[0].heading,"Creando artículo para otro público");
  assert.equal(session.article.title,"Nuevo");
});

test("session header opens reconfiguration for the active session and prevents double clicks", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const html = read("public/MarcieBlogEditor.html");
    const button = html.match(/<button\s+id="btn-reconfigure-session-header"[\s\S]*?<\/button>/)?.[0];
    assert.ok(button, "the session header must expose a dedicated button");
    await page.setContent(button);
    const editor = read("public/MarcieBlogEditor/js/editor-app.js");
    const binding = editor.slice(editor.indexOf('  document.getElementById("btn-reconfigure-session-header")?.addEventListener'), editor.indexOf('  document.getElementById("btn-ai-assistant-header")?.addEventListener'));
    const result = await page.evaluate(async binding => {
      const session = { id: "existing-session", topic: "Configuración existente" };
      const calls = [];
      let finish;
      globalThis.getActiveSession = () => session;
      globalThis.sessionOperations = new Set();
      globalThis.reconfigureSession = async value => { calls.push(value); await new Promise(resolve => { finish = resolve; }); };
      (0, eval)(binding);
      const button = document.getElementById("btn-reconfigure-session-header");
      button.disabled = false;
      button.click(); button.click();
      const disabledWhileOpen = button.disabled;
      finish();
      await new Promise(resolve => setTimeout(resolve, 0));
      return { count: calls.length, id: calls[0].id, same: calls[0] === session, disabledWhileOpen, enabledAfter: !button.disabled };
    }, binding);
    assert.deepEqual(result, { count: 1, id: "existing-session", same: true, disabledWhileOpen: true, enabledAfter: true });
  } finally { await browser.close(); }
});

test("reconfiguration wires topic refinement to the selected editorial mode", async () => {
  const editor = read("public/MarcieBlogEditor/js/editor-app.js");
  const fn = editor.slice(editor.indexOf("async function reconfigureSession"), editor.indexOf("function setupEventListeners"));
  let received;
  const context = vm.createContext({ sessionOperations: new Set(),
    showNewSessionModal: async options => { assert.equal(await options.onRefineTopic("Tema", ["#fuentes Libros"], "aida", { structure: "hybrid" }), "Tema afinado"); return null; },
    refineTopicForMode: async options => { received = options; return "Tema afinado"; },
    getActiveMarciePromptProfileId: () => "", listMarciePromptProfiles: () => [], listEditorialProfilesOnce: async () => [],
    showToast: message => { throw Error(message); }
  });
  vm.runInContext(fn, context);
  await context.reconfigureSession({ id: "existing", topic: "Tema" });
  assert.equal(received.topic, "Tema"); assert.equal(received.editorialMode, "aida");
});

test("modal refines typed text and shows every configured research platform", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent("<main></main>");
    await page.evaluate(source => (0, eval)(source), read("public/MarcieBlogEditor/js/contracts/marcie-research-policy.js"));
    await page.evaluate(source => {
      (0, eval)(source);
      showNewSessionModal({ initialConfiguration: { mode: "automated" }, onRefineTopic: async topic => topic + " mejorado" });
    }, strip(read("public/MarcieBlogEditor/js/components/modals.js")));
    await page.locator("#new-session-title-input").fill("Aprendizaje activo");
    await page.locator("#new-session-refine-topic").click();
    await page.waitForFunction(() => document.getElementById("new-session-title-input").value === "Aprendizaje activo mejorado");
    assert.equal(await page.locator("#new-session-title-error").evaluate(el => el.classList.contains("hidden")), true);
    const labels = await page.locator("[data-research-platform-options] label").allTextContents();
    assert.deepEqual(labels, require("../src/marcie-research-policy.js").platforms.map(platform => platform.name).concat("Otros sitios fiables"));
    assert.equal(await page.locator('[name="research-platform"]:checked').count(), 8);
    await page.locator('[name="research-platform"][value="ebsco"]').uncheck();
    assert.equal(await page.locator('[name="research-platform"]:checked').count(), 7);
  } finally { await browser.close(); }
});

test("region dropdown supports global selection and preserves legacy regions", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent("<main></main>");
    const result = await page.evaluate(async source => {
      (0, eval)(source);
      const pending = showNewSessionModal({ defaultValue: "Aprendizaje", initialConfiguration: { researchRegion: "Región andina" } });
      const select = document.getElementById("new-session-region");
      const saved = select.value;
      const tag = select.tagName;
      const globalLabel = select.querySelector('[value="GLOBAL"]').textContent;
      select.value = "GLOBAL";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      document.getElementById("new-session-create").click();
      return { saved, tag, globalLabel, region: (await pending).researchRegion };
    }, strip(read("public/MarcieBlogEditor/js/components/modals.js")));
    assert.deepEqual(result, { saved: "Región andina", tag: "SELECT", globalLabel: "Global / Todas las regiones", region: "GLOBAL" });
  } finally { await browser.close(); }
});

test("configuration modal restores audiences, specifications, region and period", async () => {
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    await page.setContent("<main></main>");
    const values=await page.evaluate(async source=>{
      (0,eval)(source);
      const pending=showNewSessionModal({defaultValue:"Aprendizaje",initialConfiguration:{mode:"automated",editorialMode:"custom",selectedAudiences:["parents"],specifications:["#tono Cercano"],researchRegion:"ES",researchPeriod:"12m",editorialProfileSnapshot:{tone:"Cercano",minimumSources:9}}});
      const result={region:document.getElementById("new-session-region").value,period:document.getElementById("new-session-period").value,audiences:[...document.querySelectorAll('[name="session-audience"]:checked')].map(input=>input.value),tone:document.getElementById("custom-tone").value,minimum:document.getElementById("custom-minimum-sources").value};
      document.getElementById("new-session-create").click();
      result.request=await pending;
      return result;
    },strip(read("public/MarcieBlogEditor/js/components/modals.js")));
    assert.equal(values.region,"ES");assert.equal(values.period,"12m");assert.deepEqual(values.audiences,["parents"]);assert.equal(values.minimum,"9");assert.equal(values.request.specifications[0],"#tono Cercano");assert.equal(values.request.researchPeriod,"12m");
  } finally { await browser.close(); }
});
test("audience failure leaves original article and audience intact", async () => {
  const editor=read("public/MarcieBlogEditor/js/editor-app.js");
  const fn=editor.slice(editor.indexOf("async function selectAudienceSafely"),editor.indexOf("async function reconfigureSession"));
  const context=vm.createContext({sessionOperations:new Set(),chooseEditorialAction:async()=>"generate",getEditorialAudienceLabel:x=>x,window:{},draftArticleForMode:async()=>{throw Error("offline")},setSyncStatus(){},showToast(){}});
  vm.runInContext(fn,context);
  const session={id:"a",audience:"educators",article:{title:"Old"},articlesByAudience:{}};
  await context.selectAudienceSafely(session,"parents");
  assert.equal(session.audience,"educators");assert.equal(session.article.title,"Old");
});
test("reconfiguration failure never commits a provisional replacement", async () => {
  const editor=read("public/MarcieBlogEditor/js/editor-app.js");
  const fn=editor.slice(editor.indexOf("async function reconfigureSession"),editor.indexOf("function setupEventListeners"));
  let writes=0;
  const context=vm.createContext({sessionOperations:new Set(),showNewSessionModal:async()=>({title:"New",selectedAudiences:["parents"]}),getActiveMarciePromptProfileId:()=>"",listMarciePromptProfiles:()=>[],listEditorialProfilesOnce:async()=>[],chooseEditorialAction:async()=>"replace",showAutomatedSessionProgress(){},runAutomatedSessionWorkflow:async working=>{assert.equal(working._provisional,true);throw Error("offline")},saveMarcieSession:async()=>writes++,showToast(){}});
  vm.runInContext(fn,context);
  const session={id:"a",topic:"Old",article:{title:"Old"},articlesByAudience:{parents:{title:"Old"}}};
  await context.reconfigureSession(session);
  assert.equal(writes,1);assert.equal(session.article.title,"Old");
});
