import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  applyScienceActivityContext,
  buildScienceExperienceIntroduction,
  deriveScienceActivityContext,
  meaningfulActivityText
} from "../public/js/science-activity-context.mjs";

test("rechaza valores undefined generados y deriva misión desde experiencePrompt", () => {
  const activity = {
    subject: "physics",
    topic: "Caída libre",
    experiencePrompt: "Ajusta la altura para decidir desde dónde soltar un paquete sin dañarlo.",
    mission: "undefined",
    scientificPrinciple: undefined
  };

  applyScienceActivityContext(activity);

  assert.equal(meaningfulActivityText(" undefined "), "");
  assert.match(activity.mission, /Ajusta la altura/);
  assert.match(activity.scientificPrinciple, /Caída libre/);
  assert.doesNotMatch(`${activity.mission} ${activity.scientificPrinciple}`, /undefined|null/i);
});

test("preserva contenido válido de Gemini y construye la introducción completa", () => {
  const activity = {
    subject: "biology",
    topic: "Ecosistemas",
    experiencePrompt: "Recupera el equilibrio de un humedal después de una sequía.",
    mission: "Distribuye agua y recursos para recuperar las poblaciones.",
    scientificPrinciple: "La disponibilidad de recursos limita el tamaño de las poblaciones."
  };
  const context = deriveScienceActivityContext(activity);
  const introduction = buildScienceExperienceIntroduction(activity);

  assert.equal(context.mission, activity.mission);
  assert.equal(context.objective, activity.experiencePrompt);
  assert.match(introduction, /Objetivo del juego:/);
  assert.match(introduction, /Principio científico:/);
  assert.match(introduction, /humedal/);
  assert.doesNotMatch(introduction, /Contexto de la experiencia:/);
});

test("la portada y el primer briefing muestran la experiencia antes de jugar", async () => {
  const source = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");
  const exportSource = await readFile(new URL("../public/js/science-assessment-export.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../public/science-hud-themes.css", import.meta.url), "utf8");
  assert.match(source, /!meaningfulActivityText\(input\.mission\)/);
  assert.match(source, /!meaningfulActivityText\(input\.scientificPrinciple\)/);
  assert.match(source, /class="science-export-experience"/);
  assert.match(source, /class="science-experience-briefing"/);
  assert.match(source, /data-experience-carousel/);
  assert.match(source, /aria-roledescription="carrusel"/);
  assert.match(source, /buildExperienceBriefingCarousel\(\[\s*\{ label: "Objetivo del juego"/);
  assert.match(source, /\["ArrowLeft", "ArrowRight", "Home", "End"\]/);
  assert.match(exportSource, /experienceBriefingCarouselMarkup/);
  assert.match(exportSource, /var objective = safeGeneratedText\(config\.experiencePrompt\) \|\| config\.mission/);
  assert.match(exportSource, /var slides = \[\s*\["Objetivo del juego"/);
  assert.match(exportSource, /data-experience-next/);
  assert.match(styles, /science-experience-carousel-track/);
  assert.match(styles, /science-experience-carousel-dots button\[aria-selected="true"\]/);
  assert.match(styles, /science-experience-carousel-controls>button>span\{color:inherit!important/);
  assert.match(styles, /data-experience-status\].*color-mix\(in srgb,var\(--science-hud-text\)/);
  assert.match(source, /progress\.level === 1/);
  assert.match(source, /experiencePrompt: state\.activity\.experiencePrompt/);
});
