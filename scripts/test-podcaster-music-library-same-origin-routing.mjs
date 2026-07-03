import fs from "node:fs";

const root = "/Users/waldolopez/Documents/CharlyBrown";
const apiClient = fs.readFileSync(`${root}/public/js/api-client.js`, "utf8");
const apiClientPodcaster = fs.readFileSync(`${root}/public/js/api-client-podcaster.js`, "utf8");
const panelMusic = fs.readFileSync(`${root}/public/podcaster/podcaster-panel-music.js`, "utf8");
const podcaster = fs.readFileSync(`${root}/public/podcaster/podcaster.js`, "utf8");

if (!/export function buildSameOriginApiUrl\(path = ""\)/.test(apiClient)) {
  throw new Error("api-client.js debe exponer buildSameOriginApiUrl para rutas que no deben ir a snoopy-export.");
}

if (!/const \{ auth = true, preferRemote = false, sameOrigin = false, \.\.\.requestOptions \} = options \|\| \{\};/.test(apiClient)) {
  throw new Error("authFetch/authFetchJson deben aceptar la opción sameOrigin.");
}

if (!apiClientPodcaster.includes("buildSameOriginApiUrl")) {
  throw new Error("api-client-podcaster.js debe reexportar buildSameOriginApiUrl.");
}

for (const route of [
  "/api/podcaster/music/library/list",
  "/api/podcaster/music/upload"
]) {
  const pattern = new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?sameOrigin:\\s*true`);
  if (!pattern.test(panelMusic)) {
    throw new Error(`podcaster-panel-music.js debe enviar ${route} con sameOrigin: true.`);
  }
}

for (const route of [
  "/api/podcaster/music/library/delete",
  "/api/podcaster/music/library/upload"
]) {
  const pattern = new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?sameOrigin:\\s*true`);
  if (!pattern.test(podcaster)) {
    throw new Error(`podcaster.js debe enviar ${route} con sameOrigin: true.`);
  }
}

console.log("Podcaster music library same-origin routing OK.");
