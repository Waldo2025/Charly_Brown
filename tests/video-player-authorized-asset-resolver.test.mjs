import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/js/home.js", import.meta.url), "utf8");
const controllerSource = readFileSync(
  new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url),
  "utf8"
);

test("video-player provides the private asset resolver to the shared playback controller", () => {
  assert.match(
    source,
    /async function resolveAuthorizedAssetUrl\(proxyUrl = ""\)[\s\S]*?authFetchJson\([\s\S]*?\/api\/assets\/signed-url\?storagePath=/,
  );
  assert.match(
    source,
    /const multimediaPlaybackDeps = \{[\s\S]*?resolveAuthorizedAssetUrl,/
  );
});

test("video-player delegates stage video loading to the shared playback controller", () => {
  assert.doesNotMatch(source, /homeStageVideoLoadTokenSeq|homeStageVideoLoadTokensByEl/);
  assert.match(
    source,
    /setPodcastStageVideoSourceForElement:\s*\(video, url, options = \{\}\) => \(\s*multimediaPlaybackController\.setStageVideoSourceForElement\(video, url, options\)\s*\)/
  );
});

test("the shared controller never assigns an unresolved private stage source", () => {
  assert.doesNotMatch(controllerSource, /const preferredSource = cachedObjectUrl \|\| src/);
  assert.doesNotMatch(controllerSource, /const blobUrl = this\.getBlobUrlSync\(entry\.videoSrc\) \|\| entry\.videoSrc/);
  assert.match(
    controllerSource,
    /void this\.setStageVideoSourceForElement\(stageVideo, src, \{[\s\S]*?noWait: true,[\s\S]*?keepHidden: false/
  );
  assert.doesNotMatch(controllerSource, /forcePersistent: true/);
  assert.match(
    controllerSource,
    /cachedObjectUrl \|\| await this\.getBlobUrl\(cleanSrc, \{/
  );
});

test("video-player resolves gs paths without sending the gs scheme as storagePath", () => {
  assert.match(source, /replace\(\/\^gs:\\\/\\\/\[\^\/\]\+\\\/\/i, ""\)/);
  assert.match(source, /getDownloadURL\(ref\(storage, storagePath\)\)/);
  assert.doesNotMatch(
    source,
    /proxy-media\?storagePath=\$\{encodeURIComponent\(gsPath\)\}/
  );
});
