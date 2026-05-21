import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster-chat-assistant.js", import.meta.url), "utf8");

if (!/\| Tiempo \| Locutor \| Nombre del locutor \| Expresión \| Guion \| Media \| Notas \|/.test(source)) {
  throw new Error("La tabla podcast del chat debe mantener el esquema sin columna Elemento visual.");
}

if (/const visual = String\(row\?\.visualNotes/.test(source)) {
  throw new Error("El preview podcast del chat no debe renderizar la columna Elemento visual.");
}

console.log("Podcaster podcast chat table without visual column OK.");
