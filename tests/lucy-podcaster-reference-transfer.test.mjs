import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNewPodcasterVideoSession,
  buildPodcasterReferenceMaps,
  planPodcasterReferenceTransfer,
  validateApprovedSceneImages
} from "../public/imagecreator/podcaster-reference-transfer.js";

const rows = (count) => Array.from({ length: count }, (_, index) => ({ id: `row-${index + 1}`, dialogue: `Texto ${index + 1}` }));
const images = (count) => Array.from({ length: count }, (_, index) => ({
  approved: true,
  downloadUrl: `https://firebasestorage.googleapis.com/image-${index + 1}`,
  storagePath: `images/scene-${index + 1}.png`,
  mimeType: "image/png"
}));

test("same scene count maps Lucy scene 1 to Podcaster scene 1", () => {
  const plan = planPodcasterReferenceTransfer(2, { session: { script: { rows: rows(2) } } });
  assert.equal(plan.ok, true);
  assert.equal(plan.offset, 0);
  assert.deepEqual(plan.assignments.map((item) => item.rowId), ["row-1", "row-2"]);
});

test("two bookends shift only central references and preserve intro/outro media", () => {
  const session = {
    script: { rows: rows(4) },
    rowReferenceVideoMap: { "row-1": { name: "intro.mp4" }, "row-4": { name: "outro.mp4" }, "row-2": { name: "old.mp4" } },
    rowReferenceImageMap: { "row-1": { name: "intro.png" } },
    rowReferenceModeByRowId: { "row-1": "video", "row-4": "video", "row-2": "video" }
  };
  const plan = planPodcasterReferenceTransfer(2, { session });
  assert.equal(plan.ok, true);
  assert.equal(plan.offset, 1);
  assert.deepEqual(plan.assignments.map((item) => [item.rowId, item.podcasterSceneNumber]), [["row-2", 2], ["row-3", 3]]);
  const next = buildPodcasterReferenceMaps(session, plan.assignments, images(2));
  assert.equal(next.rowReferenceVideoMap["row-1"].name, "intro.mp4");
  assert.equal(next.rowReferenceVideoMap["row-4"].name, "outro.mp4");
  assert.equal(next.rowReferenceVideoMap["row-2"], undefined);
  assert.equal(next.rowReferenceModeByRowId["row-2"], "image");
  assert.equal(next.rowReferenceModeByRowId["row-4"], "video");
  assert.deepEqual(next.rowReferenceImageListMap["row-2"], [next.rowReferenceImageMap["row-2"]]);
  assert.equal(next.rowReferenceImageMap["row-2"].name, "Escena1.png");
  assert.equal(next.rowReferenceImageMap["row-3"].storagePath, "images/scene-2.png");
  assert.equal(next.rowReferenceImageMap["row-1"].name, "intro.png");
  assert.deepEqual(session.script.rows, rows(4));
});

test("other count differences and invalid row IDs stop before assignment", () => {
  assert.equal(planPodcasterReferenceTransfer(2, { script: { rows: rows(3) } }).ok, false);
  assert.equal(planPodcasterReferenceTransfer(2, { script: { rows: [{ id: "one" }, { id: "one" }] } }).ok, false);
});

test("unapproved and incomplete uploads cannot enter Snoopy video generation", () => {
  assert.throws(() => validateApprovedSceneImages([{ ...images(1)[0], approved: false }], 1), /aún no está aprobada/);
  assert.throws(() => validateApprovedSceneImages([{ ...images(1)[0], storagePath: "" }], 1), /no terminó de subirse/);
  assert.doesNotThrow(() => validateApprovedSceneImages(images(2), 2));
});

test("new Podcaster session has chat script, editable timeline scenes, and video-ready references", () => {
  const session = buildNewPodcasterVideoSession({
    title: "Prueba Lucy",
    now: "2026-09-29T12:00:00.000Z",
    scenes: [
      { tiempo: "0:00-0:08", guion: "Hola <mundo>", descripcion_escena: "Primer plano", texto_pantalla: "Inicio", transicion: "Corte", elemento_visual: "Sol" },
      { tiempo: "0:08-0:16", guion: "Seguimos", descripcion_escena: "Plano general", texto_pantalla: "Fin", transicion: "Fundido", elemento_visual: "Luna" }
    ],
    images: images(2)
  });
  assert.equal(session.script.videoContentType, "creative");
  assert.equal(session.script.rows[0].voiceOverText, "Hola <mundo>");
  assert.equal(session.script.rows[1].id, "scene-2");
  assert.deepEqual(
    [...session.chat[1].html.matchAll(/<th>(.*?)<\/th>/g)].map((match) => match[1]),
    ["Tiempo", "Guion", "Descripción de escena", "Texto en pantalla", "Transición", "Elemento visual"]
  );
  assert.deepEqual(
    [...session.chat[1].html.matchAll(/<tbody>[\s\S]*?<\/tbody>/g)].flatMap((match) => [...match[0].matchAll(/<tr>/g)]).length,
    2
  );
  assert.equal(session.chat[0].role, "user");
  assert.equal(session.chat[1].role, "assistant");
  assert.match(session.chat[1].html, /Hola &lt;mundo&gt;/);
  assert.equal(session.chat[1].html.includes("Hola <mundo>"), false);
  assert.equal(session.podcastVideoConfig.timelineClipsByRowId["scene-1"].startMs, 0);
  assert.equal(session.podcastVideoConfig.timelineClipsByRowId["scene-2"].startMs, 8000);
  assert.equal(session.rowReferenceImageMap["scene-2"].storagePath, "images/scene-2.png");
  assert.equal(session.rowReferenceModeByRowId["scene-1"], "image");
});

test("new session rejects scenes missing Podcaster timeline columns", () => {
  assert.throws(() => buildNewPodcasterVideoSession({
    scenes: [{ guion: "Narración", descripcion_escena: "Plano de prueba", elemento_visual: "" }],
    images: images(1)
  }), /escena 1 no tiene Elemento visual/);
});
