import { readFileSync } from "node:fs";

const podcasterJs = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");
const podcasterCss = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");
const homeJs = readFileSync(new URL("../public/home.js", import.meta.url), "utf8");
const homeCss = readFileSync(new URL("../public/home.css", import.meta.url), "utf8");

if (!/visualNotesResolvedProposals/.test(podcasterJs)) {
  throw new Error("Podcaster debe persistir un estado de propuestas realizadas por fila.");
}

if (!/function isVisualProposalResolved/.test(podcasterJs)) {
  throw new Error("Podcaster debe exponer un helper para detectar propuestas realizadas.");
}

if (!/row-active-proposal\$\{isVisualProposalResolved/.test(podcasterJs) || !/proposal-item\$\{isVisualProposalResolved/.test(podcasterJs)) {
  throw new Error("Podcaster debe renderizar propuestas resueltas con clase visual dedicada.");
}

if (!/\.row-active-proposal\.is-resolved/.test(podcasterCss) || !/\.proposal-item\.is-resolved/.test(podcasterCss)) {
  throw new Error("Podcaster CSS debe estilizar propuestas resueltas en gris y tachadas.");
}

if (!/visualNotesResolvedProposals/.test(homeJs) || !/isDashboardProposalResolved/.test(homeJs)) {
  throw new Error("Home debe leer y renderizar el estado de propuestas realizadas.");
}

if (!/proposal-item-dashboard\$\{isDashboardProposalResolved/.test(homeJs) || !/classList\.toggle\(\"is-resolved\", isDashboardProposalResolved/.test(homeJs)) {
  throw new Error("Home debe aplicar clases visuales para propuestas realizadas.");
}

if (!/\.proposal-item-dashboard\.is-resolved/.test(homeCss) || !/\.info-value-box\.is-resolved/.test(homeCss)) {
  throw new Error("Home CSS debe estilizar las propuestas realizadas.");
}

console.log("Visual proposal resolution state OK.");
