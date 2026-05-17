import fs from "node:fs";

const podcasterSource = fs.readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const historyModulePath = new URL("../public/podcaster/podcaster-history.js", import.meta.url);
const historyModuleSource = fs.existsSync(historyModulePath)
  ? fs.readFileSync(historyModulePath, "utf8")
  : "";

if (!/import\s+\{\s*createPodcasterHistoryApi\s*\}\s+from\s+"\.\/podcaster-history\.js";/m.test(podcasterSource)) {
  throw new Error("podcaster.js debe importar createPodcasterHistoryApi desde podcaster-history.js.");
}

for (const legacyFn of [
  "recordPodcastHistory",
  "undoPodcastAction",
  "redoPodcastAction",
  "applyPodcastHistorySnapshot"
]) {
  if (new RegExp(`function\\s+${legacyFn}\\s*\\(`, "m").test(podcasterSource)) {
    throw new Error(`podcaster.js no debe seguir implementando ${legacyFn}; debe vivir en podcaster-history.js.`);
  }
}

if (!/export\s+function\s+createPodcasterHistoryApi\s*\(/m.test(historyModuleSource)) {
  throw new Error("podcaster-history.js debe exportar createPodcasterHistoryApi.");
}

console.log("Podcaster history module regression test OK.");
