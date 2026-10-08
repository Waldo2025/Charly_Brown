const test = require("node:test");
const assert = require("node:assert/strict");
const bibliography = require("../src/marcie-bibliography.js");

const url = "https://www.youtube.com/watch?v=YOF7hfZGD6o";
const metadata = { videoId: "YOF7hfZGD6o", title: "La Neurociencia de las Palabras: Cómo Proverbios Explica tu Salud Mental", channel: "La Biblia Descomplicada", publishedAt: "2026-09-15" };

test("repara la ficha de YouTube en una sesión guardada sin modificar los párrafos", async () => {
  const { videosNeedingMetadata, mergeVideoMetadata } = await import("../../public/MarcieBlogEditor/js/services/marcie-video-metadata.mjs");
  const oldSource = () => ({ id: "youtube-YOF7hfZGD6o", sourceType: "youtube_video", title: "Video de YouTube YOF7hfZGD6o", url, authors: [] });
  const session = {
    article: { title: "Artículo", blocks: [{ type: "paragraph", text: "Texto original." }], sources: [oldSource()] },
    articlesByAudience: { educators: { blocks: [{ type: "paragraph", text: "Texto del docente." }], researchSources: [oldSource()] } },
    videoResearch: { videos: [{ videoId: metadata.videoId, url, title: "Video de YouTube YOF7hfZGD6o", bibliographySource: oldSource() }], bibliographySources: [oldSource()] }
  };
  const before = JSON.stringify([session.article.blocks, session.articlesByAudience.educators.blocks]);
  assert.deepEqual(videosNeedingMetadata(session), [url]);
  assert.equal(mergeVideoMetadata(session, [metadata]), true);
  assert.equal(JSON.stringify([session.article.blocks, session.articlesByAudience.educators.blocks]), before);
  assert.deepEqual(videosNeedingMetadata(session), []);
  const reference = bibliography.format(session.article.sources[0]);
  assert.match(reference, /La Biblia Descomplicada\. \(2026, 15 de septiembre\)/);
  assert.match(reference, /La Neurociencia de las Palabras: Cómo Proverbios Explica tu Salud Mental/);
  assert.doesNotMatch(reference, /Canal no identificado|Video de YouTube YOF7hfZGD6o|s\. f\./);
});
