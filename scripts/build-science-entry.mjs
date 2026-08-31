import { build } from "esbuild";
import { rm } from "node:fs/promises";

await rm("public/js/scienceActivities.bundle.js", { force: true });
await rm("public/js/scienceActivities.min.js", { force: true });
await rm("public/js/science-chunks", { recursive: true, force: true });
await build({
  entryPoints: { scienceActivities: "public/js/scienceActivities.js" },
  outdir: "public/js",
  entryNames: "[name].bundle",
  chunkNames: "science-chunks/[name]-[hash]",
  bundle: true,
  splitting: true,
  minify: true,
  format: "esm",
  target: ["es2022"],
  legalComments: "none",
  external: ["https://*"]
});

console.log("Science Activities static graph bundled and minified.");
