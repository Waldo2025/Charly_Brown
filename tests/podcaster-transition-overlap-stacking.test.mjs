import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const timelineUiSource = readFileSync(new URL("../public/podcaster/podcaster-timeline-ui.js", import.meta.url), "utf8");

test("incoming transition clip gets elevated z-index so its menu stays clickable", () => {
  assert.match(
    timelineUiSource,
    /const effectiveClipZIndex = Math\.max\(1, Number\(timelineClip\?\.zIndex \|\| index \+ 1\)\) \+ \(fadeInPx > 0 \? 1 : 0\);/m
  );
  assert.match(
    timelineUiSource,
    /style="left:\$\{leftPx\.toFixed\(3\)\}px;width:\$\{widthPx\.toFixed\(3\)\}px;z-index:\$\{effectiveClipZIndex\};--trim-mask-left:/m
  );
});
