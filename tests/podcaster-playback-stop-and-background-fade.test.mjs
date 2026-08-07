import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url),
  "utf8"
);

test("Stop always resets the montage cursor to the timeline origin", () => {
  const stopBlock = source.slice(source.indexOf("async stop(opts = {})"), source.indexOf("seekTo(el, seconds)"));
  assert.match(stopBlock, /const stopTargetMs = 0;/);
  assert.doesNotMatch(stopBlock, /sceneStartMs|shouldReturnToTimelineStart/);
  assert.match(stopBlock, /pendingTimelineSeekTick = null;/);
  assert.doesNotMatch(stopBlock, /this\.state\.isTickProcessing = false;/);
});

test("an async clock tick cannot restore an old playhead after Stop", () => {
  assert.match(
    source,
    /await this\.tick\(nextMs\);\s*if \(!this\.state\.isPlaying \|\| loopId !== this\.activeLoopId\) return;/
  );
});

test("explicit background fades apply the timeline gain directly", () => {
  assert.match(source, /const hasExplicitBackgroundFade = segmentFadeInMs > 0 \|\| segmentFadeOutMs > 0;/);
  assert.match(
    source,
    /if \(hasExplicitBackgroundFade\) \{[\s\S]*?gain\.setValueAtTime\(clampedFinalVolume, now\);[\s\S]*?\} else \{/
  );
  const explicitFadeBlock = source.slice(
    source.indexOf("if (hasExplicitBackgroundFade)"),
    source.indexOf("} else {", source.indexOf("if (hasExplicitBackgroundFade)"))
  );
  assert.doesNotMatch(explicitFadeBlock, /setTargetAtTime/);
});
