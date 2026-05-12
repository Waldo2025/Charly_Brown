import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

async function main() {
  const frontend = await import("../public/moodleCourse-featuredSources.js");
  const backend = require("../backend/featured-source-extractor.js");

  assert.equal(
    frontend.normalizarTipoModuloFeaturedSource("Fuentes destacadas"),
    "fuentes_destacadas",
    "Debe normalizar el nuevo tipo de módulo"
  );

  const defaults = frontend.crearDefaultsFuentesDestacadas();
  assert.equal(defaults.tipo, "Fuentes destacadas. Extracción de contenido de fuentes externas");
  assert.equal(defaults.fuenteDestacadaUrl, "");
  assert.equal(defaults.fuenteDestacadaReferencia, "");
  assert.match(defaults.contenido, /Ficha de fuente destacada/i);
  assert.match(defaults.instrucciones, /Enlace web:/i);
  assert.match(defaults.instrucciones, /Referencia bibliográfica:/i);

  const invalid = frontend.validarFuentesDestacadas({
    tipo: "Fuentes destacadas",
    fuenteDestacadaUrl: "",
    fuenteDestacadaReferencia: ""
  });
  assert.equal(invalid.ok, false, "Debe rechazar módulos sin URL");
  assert.match(String(invalid.error || ""), /enlace web/i);

  const validWithoutReference = frontend.validarFuentesDestacadas({
    tipo: "Fuentes destacadas",
    fuenteDestacadaUrl: "https://example.org/article",
    fuenteDestacadaReferencia: ""
  });
  assert.equal(validWithoutReference.ok, true, "Debe aceptar módulos con URL aunque la referencia no se haya proporcionado");
  assert.equal(validWithoutReference.referencia, "");

  const validWithReference = frontend.validarFuentesDestacadas({
    tipo: "Fuentes destacadas",
    fuenteDestacadaUrl: "https://example.org/article",
    fuenteDestacadaReferencia: "Autor, A. (2026). Título. Editorial."
  });
  assert.equal(validWithReference.ok, true, "Debe aceptar módulos con URL y referencia");

  const parsedFromInstructions = frontend.extraerCamposFuentesDestacadasDesdeInstrucciones(`
    <p>Genera una ficha completa de la fuente analizada.</p>
    <p>Enlace web: https://example.org/article</p>
    <p>Referencia bibliográfica: Autor, A. (2026). Título. Editorial.</p>
  `);
  assert.equal(parsedFromInstructions.fuenteDestacadaUrl, "https://example.org/article");
  assert.equal(parsedFromInstructions.fuenteDestacadaReferencia, "Autor, A. (2026). Título. Editorial.");

  const validFromInstructionsOnly = frontend.validarFuentesDestacadas({
    tipo: "Fuentes destacadas",
    instrucciones: `
      <p>Enlace web: https://example.org/article</p>
      <p>Extrae el contenido completo del sitio y descríbelo con detalle.</p>
    `
  });
  assert.equal(validFromInstructionsOnly.ok, true, "Debe aceptar módulos cuando URL y referencia están solo en instrucciones");
  assert.equal(validFromInstructionsOnly.url, "https://example.org/article");
  assert.equal(validFromInstructionsOnly.referencia, "");

  const authorInstruction = frontend.extraerConsignaFuentesDestacadasDesdeInstrucciones(`
    <p>Haz una ficha extensa.</p>
    <p>Enlace web: https://example.org/article</p>
    <p>Extrae el contenido completo del sitio y detalla todos los apartados relevantes.</p>
    <p>Referencia bibliográfica: Autor, A. (2026). Título. Editorial.</p>
  `);
  assert.match(authorInstruction, /Haz una ficha extensa\./);
  assert.match(authorInstruction, /Extrae el contenido completo del sitio/i);
  assert.doesNotMatch(authorInstruction, /Referencia bibliográfica:/i);
  assert.doesNotMatch(authorInstruction, /Enlace web:/i);

  const normalizedFeaturedOutput = frontend.normalizarSalidaFuentesDestacadasMarkdown(`
# Fuentes destacadas 1 ## Observación del Cielo en Mayo de 2026 Este contenido se centra en eventos astronómicos.
### Eventos Clave y Fechas Exactas: * **21 de mayo de 2026:** **La Luna se une a Marte y Júpiter.**
* **28 de mayo de 2026:** **Mercurio en su máxima elongación este.**
`);
  assert.match(normalizedFeaturedOutput, /^# Fuentes destacadas 1/m);
  assert.match(normalizedFeaturedOutput, /\n## Observación del Cielo en Mayo de 2026/m);
  assert.match(normalizedFeaturedOutput, /\n### Eventos Clave y Fechas Exactas:/m);
  assert.match(normalizedFeaturedOutput, /\n- \*\*21 de mayo de 2026:\*\*/m);

  const extraction = backend.extractFeaturedSourceTextFromHtml(`
    <html>
      <head>
        <title>Example Source</title>
        <style>body { color: red; }</style>
        <script>console.log("ignore")</script>
      </head>
      <body>
        <main>
          <h1>Example Source</h1>
          <p>This is the first paragraph.</p>
          <p>This is the second paragraph.</p>
        </main>
      </body>
    </html>
  `, "https://example.org/article");

  assert.equal(extraction.title, "Example Source");
  assert.match(extraction.extractedText, /This is the first paragraph\./);
  assert.match(extraction.extractedText, /This is the second paragraph\./);
  assert.match(extraction.extractedText, /\n\n/);
  assert.doesNotMatch(extraction.extractedText, /console\.log/);
  assert.doesNotMatch(extraction.extractedText, /color: red/);

  const prompt = frontend.construirPromptFuentesDestacadas({
    nombreModulo: "Fuentes destacadas",
    fuenteDestacadaUrl: "https://example.org/article",
    fuenteDestacadaReferencia: "Autor, A. (2026). Título. Editorial.",
    extractedText: extraction.extractedText,
    extractedTitle: extraction.title,
    instruccionesAutor: "Extrae el contenido completo del sitio y no lo reduzcas a una ficha breve.",
    contextoCurso: "Curso: Astronomía básica. Ya se estudió observación nocturna.",
    contextoSubtema: "Subtema: Fenómenos visibles del cielo nocturno."
  });
  assert.match(prompt, /FORMATO DE SALIDA/i);
  assert.match(prompt, /puedes usar una estructura libre/i);
  assert.match(prompt, /no impongas secciones artificiales/i);
  assert.match(prompt, /si el sitio tiene una organización clara/i);
  assert.match(prompt, /encabezados markdown reales/i);
  assert.match(prompt, /listas markdown reales/i);
  assert.match(prompt, /Autor, A\. \(2026\)\. Título\. Editorial\./);
  assert.match(prompt, /NO resumas en exceso/i);
  assert.match(prompt, /INSTRUCCIONES ESPECÍFICAS DEL AUTOR/i);
  assert.match(prompt, /Extrae el contenido completo del sitio/i);
  assert.match(prompt, /Si el autor pide otro formato/i);
  assert.match(prompt, /NO lo conviertas en un resumen breve/i);
  assert.match(prompt, /recorre de forma amplia los apartados/i);
  assert.match(prompt, /valor pedagógico/i);
  assert.match(prompt, /CONTEXTO DEL CURSO Y DEL SUBTEMA/i);
  assert.match(prompt, /Astronomía básica/);
  assert.match(prompt, /Fenómenos visibles del cielo nocturno/);

  const urlContextPrompt = frontend.construirPromptFuentesDestacadasDesdeUrl({
    nombreModulo: "Fuentes destacadas",
    fuenteDestacadaUrl: "https://example.org/article",
    fuenteDestacadaReferencia: ""
  });
  assert.match(urlContextPrompt, /URL Context/i);
  assert.match(urlContextPrompt, /https:\/\/example\.org\/article/);
  assert.match(urlContextPrompt, /\[No proporcionada\]/);

  console.log("moodle-course-featured-sources.test.mjs: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
