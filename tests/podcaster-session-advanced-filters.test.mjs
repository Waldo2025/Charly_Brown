import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  matchesAcademicMetadataFilters,
  normalizeAcademicMetadata
} from "../public/podcaster/podcaster-academic-metadata.js";

const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");
const rail = readFileSync(new URL("../public/podcaster/podcaster-session-rail.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const store = readFileSync(new URL("../public/podcaster/podcaster-session-store.js", import.meta.url), "utf8");

test("el rail incorpora un botón accesible y un modal de filtros académicos", () => {
  assert.match(html, /id="openSessionFiltersBtn"[\s\S]*aria-label="Abrir filtros de sesiones"/);
  assert.match(html, /id="sessionFiltersModal"[\s\S]*role="dialog"[\s\S]*aria-modal="true"/);
  assert.match(html, /class="floating-panel-card session-academic-data-panel sessions-filter-panel"/);
  assert.match(html, /id="sessionFiltersForm" class="session-academic-data-form sessions-filter-form"/);
  for (const id of [
    "sessionFilterQueryInput",
    "sessionFilterLevelSelect",
    "sessionFilterGradeSelect",
    "sessionFilterTermSelect",
    "sessionFilterUnitSelect",
    "clearSessionFiltersBtn",
    "cancelSessionFiltersBtn",
    "applySessionFiltersBtn"
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(app, new RegExp(`${id}: document\\.getElementById\\("${id}"\\)`));
  }
});

test("el rail expone filtros rápidos combinables para Trim1, Trim2 y Trim3", () => {
  assert.match(html, /id="sessionsRailFilter"[\s\S]*role="group" aria-label="Filtrar por tipo"/);
  assert.match(html, /data-term-filter="1"[\s\S]*>Trim1</);
  assert.match(html, /data-term-filter="2"[\s\S]*>Trim2</);
  assert.match(html, /data-term-filter="3"[\s\S]*>Trim3</);
  assert.match(rail, /state\.sessionRailAdvancedFilters = \{[\s\S]*trimestre: currentFilters\.trimestre === requestedTerm \? "" : requestedTerm/);
  assert.match(rail, /querySelectorAll\("\[data-term-filter\]"\)/);
  assert.match(css, /\.sessions-rail-filter-group/);
  assert.match(css, /\.sessions-term-filter-chip\.is-active/);
});

test("la búsqueda considera el título de sesión y el título interno sin acentos", () => {
  assert.match(rail, /function normalizeSearchText/);
  assert.match(rail, /\.normalize\("NFD"\)/);
  assert.match(rail, /session\?\.title/);
  assert.match(rail, /session\?\.script\?\.episodeTitle/);
  assert.match(rail, /searchableTitle\.includes\(expectedTitle\)/);
});

test("los filtros académicos combinan metadata raíz y anidada", () => {
  const nested = normalizeAcademicMetadata({
    academicMetadata: { nivel: "Secundaria", grado: "Segundo", trimestre: "2", unidad: "4" }
  });
  assert.equal(matchesAcademicMetadataFilters(nested, {
    nivel: "Secundaria",
    grado: "Segundo",
    trimestre: "2",
    unidad: "4"
  }), true);
  assert.equal(matchesAcademicMetadataFilters({ nivel: "Primaria", grado: "Tercero" }, {
    nivel: "Primaria",
    grado: "Cuarto"
  }), false);
  assert.match(rail, /matchesAcademicMetadataFilters\(metadata/);
  assert.match(store, /const rootAcademicMetadata = data\.academicMetadata/);
  assert.match(store, /nivel: data\.nivel \|\| rootAcademicMetadata\.nivel/);
  assert.match(store, /academicMetadata,/);
  assert.match(rail, /\(value\) => `\$\{level \? unitLabel : "Tema \/ Unidad"\} \$\{value\}`/);
});

test("aplicar, cancelar, limpiar y Escape respetan el borrador del modal", () => {
  assert.match(rail, /sessionFiltersForm\?\.addEventListener\("submit"/);
  assert.match(rail, /state\.sessionRailAdvancedFilters = readAdvancedFilterForm\(\)/);
  assert.match(rail, /cancelSessionFiltersBtn\?\.addEventListener\("click", \(\) => setAdvancedFilterModalOpen\(false\)\)/);
  assert.match(rail, /clearSessionFiltersBtn\?\.addEventListener\("click", clearAdvancedFilters\)/);
  assert.match(rail, /event\.key === "Escape"/);
  assert.doesNotMatch(rail, /localStorage/);
});

test("el estado activo, vacío filtrado y diseño responsive quedan definidos", () => {
  assert.match(rail, /No hay sesiones que coincidan con los filtros\./);
  assert.match(rail, /openSessionFiltersBtn\.classList\.toggle\("is-active", isActive\)/);
  assert.match(css, /\.sessions-filter-active-dot/);
  assert.match(css, /\.sessions-filter-panel[\s\S]*width: min\(420px, calc\(100vw - 32px\)\)/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.sessions-filter-fields[\s\S]*grid-template-columns: 1fr/);
});

test("actualiza los cache-busters del módulo y los estilos", () => {
  assert.match(html, /podcaster\.css\?v=2026-1\.0\.10\.857/);
  assert.match(app, /podcaster-session-rail\.js\?v=2026-1\.0\.10\.857/);
  assert.match(app, /podcaster-session-store\.js\?v=2026-1\.0\.10\.857/);
});
