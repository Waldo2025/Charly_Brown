const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractPublicationDate,
  extractPdfPublicationDate,
  extractBibliographicMetadata
} = require("../src/marcie-source-verifier.js");
const bibliography = require("../src/marcie-bibliography.js");
const { selectArticleEvidenceServer } = require("../src/marcie-editorial-research.js");

test("extrae fechas de publicación desde metadatos académicos estándar (citation_year, dc.date)", () => {
  const htmlCitationYear = '<!doctype html><meta name="citation_year" content="2024"><title>Paper</title>';
  const metaCitationYear = extractBibliographicMetadata(htmlCitationYear);
  assert.equal(metaCitationYear.year, "2024");

  const htmlDcDate = '<!doctype html><meta name="dc.date.issued" content="2023-04-12"><title>Paper</title>';
  const metaDcDate = extractBibliographicMetadata(htmlDcDate);
  assert.equal(metaDcDate.year, "2023");

  const dateFromMeta = extractPublicationDate('<meta name="citation_year" content="2024">', "https://journal.org/paper");
  assert.ok(dateFromMeta.publishedAt.startsWith("2024"));
});

test("extrae año de publicación en PDFs desde patrones de volumen, año o copyright", () => {
  const pdfVol = "Revista de Neuroeducación\nVol. 12, Núm. 2 (2023)\nResultados del estudio...";
  const extractedVol = extractPdfPublicationDate(pdfVol);
  assert.equal(extractedVol.year, "2023");

  const pdfCopyright = "International Journal of Psychology\n© 2025 Elsevier B.V. All rights reserved.";
  const extractedCopyright = extractPdfPublicationDate(pdfCopyright);
  assert.equal(extractedCopyright.year, "2025");
});

test("bibliography.year rescata el año desde la URL o apaCitation si no viene en campo directo", () => {
  assert.equal(bibliography.year({ url: "https://scielo.org/article/2023/neurociencia.pdf" }), "2023");
  assert.equal(bibliography.year({ apaCitation: "Albadawi, E. A. (2024). Estudio del estrés..." }), "2024");
  assert.equal(bibliography.year({ title: "Sin fecha" }), "s. f.");
});

test("selectArticleEvidenceServer prioriza fuentes científicas de los últimos 5 años sobre estudios antiguos y sin fecha", async () => {
  const currentYear = new Date().getUTCFullYear();
  const recentYear = String(currentYear - 2);
  const olderYear = "2008"; // Caso del hallazgo clásico (Teicher 2008)

  const docRecent = {
    id: "s-recent",
    title: "Neuroplasticidad y estrés reciente",
    year: recentYear,
    publishedAt: `${recentYear}-06-01T00:00:00Z`,
    qualityTier: 1,
    publisher: "Nature Neuroscience",
    verificationStatus: "verified"
  };

  const docOlder = {
    id: "s-older",
    title: "Cambios funcionales asociados al estrés",
    year: olderYear,
    publishedAt: `${olderYear}-01-01T00:00:00Z`,
    qualityTier: 1,
    publisher: "Harvard University",
    verificationStatus: "verified"
  };

  const docUndated = {
    id: "s-undated",
    title: "Documento sin fecha",
    year: "",
    publishedAt: "",
    qualityTier: 2,
    publisher: "Portal Web",
    verificationStatus: "verified"
  };

  const client = {
    models: {
      generateContent: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                classification: [
                  { id: "s-recent", audiences: ["educators"] },
                  { id: "s-older", audiences: ["educators"] },
                  { id: "s-undated", audiences: ["educators"] }
                ]
              })
            }]
          }
        }]
      })
    }
  };

  const selection = await selectArticleEvidenceServer({
    dossier: {
      sources: [docUndated, docOlder, docRecent],
      facts: [
        { claim: "El estrés altera la plasticidad", sourceIds: ["s-recent", "s-older"] }
      ],
      attributedReferences: [],
      analysis: {},
      dateSearchComplete: true
    },
    audiences: ["educators"],
    minimumSources: 2,
    topic: "Estrés y plasticidad cerebral",
    dependencies: { client }
  });

  const educatorSources = selection.byAudience.educators.sources;
  assert.ok(educatorSources.length >= 2);
  // Debe priorizar docRecent (últimos 5 años) antes que docOlder (2008) y docUndated (sin fecha)
  assert.equal(educatorSources[0].id, "s-recent");
  assert.equal(educatorSources[1].id, "s-older");
});
