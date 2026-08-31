import { build } from "esbuild";

await build({
  entryPoints: ["public/vendor/phaser/phaser.esm.js"],
  outfile: "public/vendor/phaser/phaser.esm.min.js",
  bundle: false,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  minify: true,
  legalComments: "eof"
});
