import test from "node:test";
import assert from "node:assert/strict";
import { buildProyectoResourceFallbackHtml, buildProyectoVideoPedagogicGuide } from "../public/unidadProyectoResourceFallback.js";

test("construye una ficha fallback con actividades reales", () => {
  const html = buildProyectoResourceFallbackHtml({
    type: "ficha",
    clave: "Ficha p1a",
    subtema: "Inclusión I",
    categoria: "Proyectos",
    grado: "Primero",
    objetivoT: "Inclusión y convivencia"
  });

  assert.match(html, /data-resource-type="ficha"/i);
  assert.match(html, /Ficha p1a/i);
  assert.match(html, /class="activity"/i);
  assert.match(html, /steps-numbered/i);
});

test("construye un video fallback con tabla de guion", () => {
  const html = buildProyectoResourceFallbackHtml({
    type: "video",
    clave: "Video p1a",
    subtema: "Inclusión I",
    objetivoT: "Inclusión y convivencia"
  });

  assert.match(html, /data-resource-type="video"/i);
  assert.match(html, /<table/i);
  assert.match(html, /Tiempo/i);
  assert.match(html, /Guion/i);
});

test("el plan pedagógico del video conecta actividad y guion", () => {
  const guide = buildProyectoVideoPedagogicGuide({
    clave: "Video p1a",
    subtema: "Inclusión I",
    objetivoT: "Presentación de nombres y participación",
    objetivoAE: "Explica ideas usando apoyos visuales",
    objetivoP: "Observa, explica y aplica lo aprendido",
    activityTitle: "Preparamos el mensaje para presentar nuestros nombres",
    readingTitle: "Lucas aprende a leer el mundo",
    readingSummary: "Lucas observa nombres, animales y objetos para descubrir significados en su entorno"
  });

  assert.match(guide.sentence, /mejorar tu trabajo/i);
  assert.match(guide.substepIntro, /relaciónalo directamente/i);
  assert.equal(Array.isArray(guide.substepPoints), true);
  assert.equal(guide.substepPoints.length, 3);
  assert.match(guide.answer, /propia producción/i);
  assert.equal(Array.isArray(guide.scenes), true);
  assert.equal(guide.scenes.length, 4);
  guide.scenes.forEach((scene) => {
    const wordCount = String(scene.guion || "").trim().split(/\s+/).filter(Boolean).length;
    assert.ok(wordCount >= 14, `scene too short: ${scene.guion}`);
    assert.ok(wordCount <= 17, `scene too long: ${scene.guion}`);
    assert.match(scene.guion, /[.!?]$/);
  });
  assert.match(guide.scenes[0].guion, /^\¿/);
  assert.doesNotMatch(guide.scenes[0].guion, /\bproyectos?\b/i);
  assert.match(guide.substepIntro, /lectura/i);
  assert.match(guide.scenes[1].guion, /nombres|present/i);
});

test("el fallback de video no usa un propósito genérico sobre el proyecto", () => {
  const html = buildProyectoResourceFallbackHtml({
    type: "video",
    clave: "Video p1a",
    subtema: "Proyectos",
    objetivoT: "",
    objetivoAE: "Explica relaciones entre nombres y objetos",
    objetivoP: "Observa y aplica ideas",
    activityTitle: '[IC OBSERVA] Ve el Video p1a "Proyectos".',
    readingTitle: "Lucas aprende a leer el mundo",
    readingSummary: "Lucas observa nombres, animales y objetos para descubrir mensajes en su entorno diario"
  });

  assert.doesNotMatch(html, /ampliar el conocimiento del proyecto/i);
  assert.doesNotMatch(html, /Ve el Video p1a/i);
  assert.match(html, /desde la lectura base/i);
});

test("el guion de video puede anclarse al texto completo de la actividad", () => {
  const guide = buildProyectoVideoPedagogicGuide({
    clave: "Los nombres y sus sonidos",
    subtema: "Proyectos",
    objetivoAE: "Explica sonidos y semejanzas",
    activityTitle: "¿Qué sonidos escuchamos?",
    activityText: "Escuchen el video. ¿Qué sonidos de nombres escucharon? ¿Cuáles se parecen?",
    readingTitle: "Lucas aprende a leer el mundo",
    readingSummary: "Lucas descubre nombres y sonidos en su entorno"
  });

  assert.match(guide.scenes[0].guion, /sonidos/i);
  assert.match(guide.scenes[2].guion, /sonidos/i);
  assert.doesNotMatch(guide.title, /\bp\d+[a-z]\b/i);
});
