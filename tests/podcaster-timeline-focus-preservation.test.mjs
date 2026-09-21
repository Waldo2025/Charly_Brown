import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../public/podcaster/podcaster-timeline-ui.js", import.meta.url),
  "utf8"
);

test("lightweight timeline renders do not move focus to the playhead scene", () => {
  const lightweightStart = source.indexOf("if (requestLightweight && els.podcastVideoTimeline)");
  const fullRenderStart = source.indexOf("if (!els.podcastVideoTimeline) return;", lightweightStart);
  const lightweightBlock = source.slice(lightweightStart, fullRenderStart);

  assert.ok(lightweightStart > 0);
  assert.ok(fullRenderStart > lightweightStart);
  assert.match(
    lightweightBlock,
    /syncPodcastTimelinePlayhead\(activeSession, \{ lightweight: true \}\);/
  );
  assert.doesNotMatch(
    lightweightBlock,
    /syncPodcastTimelinePlayhead\(activeSession\);/
  );
});
