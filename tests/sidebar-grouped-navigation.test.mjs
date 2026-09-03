import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layoutSource = readFileSync(new URL("../public/js/chromeLayout.js", import.meta.url), "utf8");
const sidebarSource = readFileSync(new URL("../public/js/sidebar.js", import.meta.url), "utf8");
const sidebarCss = readFileSync(new URL("../public/sidebar.css", import.meta.url), "utf8");
const moodleCss = readFileSync(new URL("../public/moodleCourse.css", import.meta.url), "utf8");
const themeManagerSource = readFileSync(new URL("../public/js/themeManager.js", import.meta.url), "utf8");
const videoPlayerSource = readFileSync(new URL("../public/video-player.html", import.meta.url), "utf8");

test("agrupa los accesos solicitados sin perder sus guards de rol", () => {
  for (const group of ["Editorial", "Multimedia", "Config", "Otros"]) {
    assert.match(layoutSource, new RegExp(`label: '${group}'`));
  }

  for (const label of [
    "Análisis editorial",
    "Charly Brown",
    "Crear cursos de Moodle",
    "Peppermint Patty Analizer",
    "Voice Transcribe",
    "Podcaster Studio",
    "Actividades de ciencias",
    "PigPen Escape Rooms",
    "Experiencias",
    "Image Creator",
    "Perfil",
    "Usuarios",
    "Chat",
    "Tema del sistema"
  ]) {
    assert.match(layoutSource, new RegExp(label));
  }

  assert.match(layoutSource, /id: 'analisisEditorialLink', roleVisibility: 'admin,author,editor,developer'/);
  assert.match(layoutSource, /id: 'gestionUsuariosLink', roleVisibility: 'admin'/);
  assert.doesNotMatch(layoutSource, /href: 'lecturasGame\.html'[^\n]*label: 'Lecturas Game'|lecturasGameLink/);
  assert.doesNotMatch(sidebarSource, /lecturasGameLink/);
  assert.match(layoutSource, /href: 'scienceActivities\.html', icon: 'fas fa-flask', label: 'Actividades de ciencias'/);
});

test("Moodle no sobrescribe la paleta del sidebar principal", () => {
  assert.match(
    moodleCss,
    /button:not\(\.icon-btn\):not\(\.btn-close-modal\):not\(\.sidebar-group-toggle\)/
  );
  assert.match(
    themeManagerSource,
    /body\[data-page="moodlecourse\.html"\] :where\(#sidebar2, #sidebarTemas, #contenidoEditor, main\) :where\(i, \[class\^="fa-"\], \[class\*=" fa-"\]\)/
  );
});

test("mantiene Inicio y Cerrar sesión fuera de la zona desplazable", () => {
  assert.match(layoutSource, /class="sidebar-primary-action"[\s\S]*href: 'home\.html'/);
  assert.match(layoutSource, /class="sidebar-groups"/);
  assert.match(layoutSource, /class="sidebar-footer-actions"[\s\S]*id="logoutLink"/);
  assert.match(sidebarCss, /\.sidebar-groups[\s\S]*overflow-y: auto/);
  assert.match(sidebarCss, /\.sidebar-footer-actions/);
});

test("el acordeón expande el grupo seleccionado y el grupo de la página activa", () => {
  assert.match(sidebarSource, /function setSidebarGroupExpanded/);
  assert.match(sidebarSource, /function initializeSidebarGroups/);
  assert.match(sidebarSource, /sidebarWasCollapsed \|\| !wasExpanded/);
  assert.match(sidebarSource, /sidebar-link\[aria-current='page'\]/);
  assert.match(sidebarCss, /prefers-reduced-motion: reduce/);
});

test("video-player ofrece un acceso directo a home", () => {
  assert.match(videoPlayerSource, /id="btnVideoPlayerHome"/);
  assert.match(videoPlayerSource, /href="home\.html"/);
  assert.match(videoPlayerSource, /aria-label="Volver a home"/);
});
