const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
const fontDeclaration = source.slice(
  source.indexOf("const FFMPEG_REVIEW_FONT_FILE ="),
  source.indexOf("const fetchCompat =")
);
const filterFunctions = source.slice(
  source.indexOf("function escapeFfmpegDrawtextText("),
  source.indexOf("function parseAllowedOrigins(")
);
const ffmpeg = require("ffmpeg-static");

test("review export renders distinct scene digits with its configured font", () => {
  const context = {
    fs,
    path,
    __dirname,
    IS_RENDER_RUNTIME: false,
    FFMPEG_DRAWTEXT_FONT_CANDIDATES: [],
    console: { log() {}, warn() {} }
  };
  vm.createContext(context);
  vm.runInContext(`${fontDeclaration}\n${filterFunctions}\nthis.build = buildMontageReviewVideoFilter;`, context);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cb-review-font-test-"));
  try {
    const render = (sceneIndex) => {
      let fileIndex = 0;
      const filter = context.build([{
        sceneIndex,
        reviewStartMs: 0,
        reviewEndMs: 1000,
        timelineLabel: "00:00:00 - 00:00:01",
        voiceOverText: "Sistema inmunológico",
        sceneDescription: "Interior cinematográfico",
        onScreenText: "Sistema inmunológico",
        visualNotes: "cortinilla 3d"
      }], {
        width: 640,
        height: 360,
        montageTotalDurationMs: 1000,
        globalCounterMode: "static",
        textFileResolver: (value) => {
          const file = path.join(tempDir, `scene-${sceneIndex}-${++fileIndex}.txt`);
          fs.writeFileSync(file, value, "utf8");
          return file;
        }
      });
      const result = spawnSync(ffmpeg, [
        "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", "color=c=0x05070B:s=640x360:d=0.1",
        "-vf", filter, "-frames:v", "1", "-f", "md5", "-"
      ], { encoding: "utf8", timeout: 15000 });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    };

    assert.notEqual(render(1), render(2), "Los números 1 y 2 no deben dibujarse como el mismo glifo");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
