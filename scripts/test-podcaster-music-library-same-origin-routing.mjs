import fs from "node:fs";

const root = "/Users/waldolopez/Documents/CharlyBrown";
const apiClient = fs.readFileSync(`${root}/public/js/api-client.js`, "utf8");
const apiClientPodcaster = fs.readFileSync(`${root}/public/js/api-client-podcaster.js`, "utf8");
const panelMusic = fs.readFileSync(`${root}/public/podcaster/podcaster-panel-music.js`, "utf8");
const podcaster = fs.readFileSync(`${root}/public/podcaster/podcaster.js`, "utf8");
const publicLibrary = fs.readFileSync(`${root}/public/podcaster/podcaster-public-library.js`, "utf8");
const mediaReplacement = fs.readFileSync(`${root}/public/podcaster/podcaster-media-replacement.js`, "utf8");
const backend = fs.readFileSync(`${root}/backend/server.js`, "utf8");
const podcasterHtml = fs.readFileSync(`${root}/public/podcaster.html`, "utf8");
const cacheVersionLoader = fs.readFileSync(`${root}/public/js/cache-version-loader.js`, "utf8");
const version = JSON.parse(fs.readFileSync(`${root}/public/version.json`, "utf8"));
const cacheVersion = String(version.cache_version || "").trim();

if (!cacheVersion) {
  throw new Error("version.json debe declarar cache_version.");
}

for (const [source, expected, label] of [
  [podcasterHtml, `js/cache-version-loader.js?v=${cacheVersion}`, "podcaster.html"],
  [cacheVersionLoader, `const fallbackVersion = "${cacheVersion}"`, "cache-version-loader.js"],
  [podcaster, `../js/api-client-podcaster.js?v=${cacheVersion}`, "podcaster.js -> api-client-podcaster.js"],
  [podcaster, `./podcaster-panel-music.js?v=${cacheVersion}`, "podcaster.js -> podcaster-panel-music.js"],
  [publicLibrary, `../js/api-client-podcaster.js?v=${cacheVersion}`, "podcaster-public-library.js -> api-client-podcaster.js"],
  [mediaReplacement, `../js/api-client-podcaster.js?v=${cacheVersion}`, "podcaster-media-replacement.js -> api-client-podcaster.js"],
  [apiClientPodcaster, `./api-client.js?v=${cacheVersion}`, "api-client-podcaster.js -> api-client.js"]
]) {
  if (!source.includes(expected)) {
    throw new Error(`${label} debe usar el cache_version actual (${cacheVersion}).`);
  }
}

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
  const routeIndex = panelMusic.indexOf(`"${route}"`);
  const requestSnippet = routeIndex >= 0 ? panelMusic.slice(routeIndex, routeIndex + 500) : "";
  if (routeIndex < 0 || /sameOrigin:\s*true/.test(requestSnippet)) {
    throw new Error(`podcaster-panel-music.js debe enviar ${route} directo a Render para conservar Authorization.`);
  }
}

for (const route of [
  "/api/podcaster/music/library/delete",
  "/api/podcaster/music/library/upload"
]) {
  const routeIndex = podcaster.indexOf(`"${route}"`);
  const requestSnippet = routeIndex >= 0 ? podcaster.slice(routeIndex, routeIndex + 500) : "";
  if (routeIndex < 0 || /sameOrigin:\s*true/.test(requestSnippet)) {
    throw new Error(`podcaster.js debe enviar ${route} directo a Render para conservar Authorization.`);
  }
}

for (const routePrefix of ["music", "sessions", "scene-library", "scene-media"]) {
  const expected = `clean === "/api/podcaster/${routePrefix}" || clean.startsWith("/api/podcaster/${routePrefix}/")`;
  if (!apiClient.includes(expected)) {
    throw new Error(`api-client.js debe enrutar /api/podcaster/${routePrefix}/* directamente al backend de exportación.`);
  }
}

for (const header of ["X-Row-Id", "X-Mime-Type", "X-Previous-Storage-Path"]) {
  if (!backend.includes(`"${header}"`)) {
    throw new Error(`backend/server.js debe permitir ${header} en CORS.`);
  }
}

console.log("Podcaster authenticated media routing and CORS OK.");
