import { build } from "esbuild";

const shared = {
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  sourcemap: false,
  minify: true,
  legalComments: "linked"
};

await Promise.all([
  build({
    ...shared,
    entryPoints: ["public/js/science-game-export-entry.js"],
    outfile: "public/js/export-bundles/science-game-export.bundle.js"
  }),
  build({
    ...shared,
    entryPoints: ["public/js/science-game-rive-export-entry.js"],
    outfile: "public/js/export-bundles/science-game-rive-export.bundle.js"
  }),
  build({
    ...shared,
    entryPoints: ["public/js/science-simulator-export-entry.js"],
    outfile: "public/js/export-bundles/science-simulator-export.bundle.js"
  })
]);
