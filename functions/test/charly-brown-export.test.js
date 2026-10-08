const test = require("node:test");
const assert = require("node:assert/strict");
const JSZip = require("jszip");
const { buildCharlyExport, buildExportBaseName, collectApprovedDocument, htmlBlocks } = require("../src/charly-brown-export.js");

const session = {
  activeUnitId: "unit-2",
  title: "Libro de ciencias",
  academicMeta: { level: "Primaria", grade: "3°", trimester: "2" },
  units: [{
    id: "unit-2",
    title: "Unidad 2. Nuestro entorno",
    meta: { unit: "2" },
    accepted: {
      activities: [{ section: "Ciencias", html: `<div class="activity"><h2>Clasificar hojas</h2><p><strong>Instrucción:</strong> compara H<sub>2</sub>O y registra.</p><ol><li>Observa</li><li><em>Compara</em></li></ol><table><tr><th>Hoja</th><th>Color</th></tr><tr><td>A</td><td>Verde</td></tr></table><p class="answer">Respuesta esperada: dos diferencias.</p></div>` }],
      resources: [], teacherNotes: []
    }
  }]
};

test("uses the academic export nomenclature", () => {
  assert.equal(buildExportBaseName(session), "Primaria_nv3_trim2_U2");
});

test("collects approved content as semantic blocks", () => {
  const document = collectApprovedDocument(session);
  assert.equal(document.sections.length, 1);
  assert.equal(document.sections[0].title, "Ciencias");
  assert.ok(document.sections[0].blocks.some((block) => block.type === "table"));
  assert.ok(document.sections[0].blocks.some((block) => block.type === "list" && block.ordered));
});

test("preserves inline editorial semantics", () => {
  const blocks = htmlBlocks(`<p><strong>Negrita</strong> <em>cursiva</em> x<sup>2</sup> H<sub>2</sub>O</p>`);
  assert.ok(blocks[0].runs.some((run) => run.bold));
  assert.ok(blocks[0].runs.some((run) => run.italics));
  assert.ok(blocks[0].runs.some((run) => run.superscript));
  assert.ok(blocks[0].runs.some((run) => run.subscript));
});

test("builds a styled DOCX package", async () => {
  const artifact = await buildCharlyExport({ session, format: "docx" });
  assert.equal(artifact.buffer.subarray(0, 2).toString(), "PK");
  const zip = await JSZip.loadAsync(artifact.buffer);
  const styles = await zip.file("word/styles.xml").async("string");
  const document = await zip.file("word/document.xml").async("string");
  assert.match(styles, /T[IÍ]TULO/i);
  assert.match(styles, /INSTRUCCI[OÓ]N/i);
  assert.match(styles, /SUPER[IÍ]NDICE/i);
  assert.match(document, /Clasificar hojas/);
});

test("builds a paginated PDF", async () => {
  const artifact = await buildCharlyExport({ session, format: "pdf" });
  assert.equal(artifact.buffer.subarray(0, 4).toString(), "%PDF");
  assert.ok(artifact.buffer.length > 1000);
});

test("builds an IDML package with paragraph and character styles", async () => {
  const artifact = await buildCharlyExport({ session, format: "idml" });
  assert.equal(artifact.buffer.subarray(0, 2).toString(), "PK");
  const zip = await JSZip.loadAsync(artifact.buffer);
  assert.equal(await zip.file("mimetype").async("string"), "application/vnd.adobe.indesign-idml-package");
  for (const path of ["META-INF/container.xml", "designmap.xml", "Resources/Styles.xml", "XML/Tags.xml", "XML/BackingStory.xml", "Spreads/Spread_u2_1.xml", "Stories/Story_u3.xml"]) assert.ok(zip.file(path), path);
  const container = await zip.file("META-INF/container.xml").async("string");
  const designmap = await zip.file("designmap.xml").async("string");
  const spread = await zip.file("Spreads/Spread_u2_1.xml").async("string");
  assert.match(container, /media-type="text\/xml"/);
  assert.match(designmap, /StoryList="u3"/);
  assert.match(designmap, /<idPkg:Tags src="XML\/Tags\.xml"\/>/);
  assert.match(designmap, /<idPkg:BackingStory src="XML\/BackingStory\.xml"\/>/);
  assert.match(spread, /<Spread\b[^>]*PageCount="1"[^>]*BindingLocation="0"/);
  assert.match(spread, /<\/Page><TextFrame\b/);
  assert.match(spread, /<Page\b[^>]*ItemTransform="1 0 0 1 0 -396\.8503937008"/);
  assert.match(spread, /<TextFrame\b[^>]*ItemTransform="1 0 0 1 0 -396\.8503937008"/);
  assert.match(spread, /ItemLayer="uLayer1"/);
  const styles = await zip.file("Resources/Styles.xml").async("string");
  assert.match(styles, /<AppliedFont type="string">Arial<\/AppliedFont>/);
  const story = await zip.file("Stories/Story_u3.xml").async("string");
  for (const name of ["TITULO", "SUBTITULO", "TEXTO", "INSTRUCCION", "SUBINSTRUCCION", "TABLAS TITULO", "TABLAS CUERPO", "RESPUESTA ALUMNO"]) assert.match(styles, new RegExp(`ParagraphStyle/${name}`));
  for (const name of ["BOLD", "ITALIC", "SUPERINDICE", "SUBINDICE", "SUBRAYADO", "SPEC Car"]) assert.match(styles, new RegExp(`CharacterStyle/${name}`));
  assert.match(story, /AppliedParagraphStyle="ParagraphStyle\/LISTA NUMERADA"/);
  assert.match(story, /AppliedCharacterStyle="CharacterStyle\/SUBINDICE"/);
  assert.match(story, /<Table\b/);
  assert.match(await zip.file("Resources/Preferences.xml").async("string"), /SmartTextReflow="false"/);
  assert.match(await zip.file("Resources/Preferences.xml").async("string"), /PagesPerDocument="1"/);
  assert.match(await zip.file("Resources/Preferences.xml").async("string"), /PageWidth="595\.2755905512"/);
});

test("builds aligned facing-page spreads without leading blank pages", async () => {
  const longSession = structuredClone(session);
  longSession.units[0].accepted.activities[0].html += `<p>${"Contenido de prueba para flujo editorial. ".repeat(260)}</p>`;
  const artifact = await buildCharlyExport({ session: longSession, format: "idml" });
  const zip = await JSZip.loadAsync(artifact.buffer);
  const designmap = await zip.file("designmap.xml").async("string");
  const firstSpread = await zip.file("Spreads/Spread_u2_1.xml").async("string");
  const facingSpread = await zip.file("Spreads/Spread_u2_2.xml").async("string");

  assert.match(designmap, /Spread_u2_1\.xml[\s\S]*Spread_u2_2\.xml/);
  assert.match(firstSpread, /PageCount="1"/);
  assert.match(firstSpread, /<Page\b[^>]*Name="1"[\s\S]*<TextFrame\b[^>]*Self="u2tf1"/);
  assert.match(facingSpread, /PageCount="2"/);
  assert.match(facingSpread, /AllowPageShuffle="false"/);
  assert.match(facingSpread, /<Page\b[^>]*Name="2"[^>]*ItemTransform="1 0 0 1 -595\.2755905512 -396\.8503937008"/);
  assert.match(facingSpread, /<Page\b[^>]*Name="3"[^>]*ItemTransform="1 0 0 1 0 -396\.8503937008"/);
  assert.match(facingSpread, /<TextFrame\b[^>]*Self="u2tf2"[^>]*ItemTransform="1 0 0 1 -595\.2755905512 -396\.8503937008"/);
  assert.match(facingSpread, /<TextFrame\b[^>]*Self="u2tf3"[^>]*ItemTransform="1 0 0 1 0 -396\.8503937008"/);
});

test("exports teacher notes separately from student content", async () => {
  const withNotes = structuredClone(session);
  withNotes.units[0].accepted.activities[0].notes = [{ html: "<p>Preparar hojas reales.</p>" }];
  withNotes.units[0].accepted.teacherNotes = [{ title: "Antes de la clase", html: "<p>Organizar equipos.</p>" }];
  const student = collectApprovedDocument(withNotes, { documentKind: "student" });
  const notes = collectApprovedDocument(withNotes, { documentKind: "teacher-notes" });
  assert.doesNotMatch(JSON.stringify(student), /Preparar hojas reales|Organizar equipos/);
  assert.match(JSON.stringify(notes), /Preparar hojas reales/);
  assert.match(JSON.stringify(notes), /Organizar equipos/);
  const artifact = await buildCharlyExport({ session: withNotes, format: "idml", documentKind: "teacher-notes" });
  assert.equal(artifact.filename, "Primaria_nv3_trim2_U2-notas-del-maestro.idml");
});

test("rejects exports without approved content", async () => {
  await assert.rejects(() => buildCharlyExport({ session: { title: "Vacío", units: [] }, format: "pdf" }), /contenido aprobado/);
});
