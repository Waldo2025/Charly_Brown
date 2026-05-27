import assert from "node:assert/strict";
import fs from "node:fs";

const backendSource = fs.readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

assert.match(
  backendSource,
  /const DEFAULT_PODCASTER_VIDEO_MODEL = "veo-3\.1-generate-preview";/
);

assert.match(
  backendSource,
  /resolution\s*=\s*"1080p"/
);

assert.doesNotMatch(
  backendSource,
  /compressionQuality\s*=/
);

assert.match(
  backendSource,
  /El video adjunto.*se convirtió a un frame de referencia/
);
