import test from "node:test";
import assert from "node:assert/strict";

import { createPodcasterTimelineUiApi } from "./podcaster-timeline-ui.js";

function createWheelHarness({
  scrollLeft = 500,
  scrollWidth = 1000,
  clientWidth = 200,
  editorScrollTop = 120
} = {}) {
  const listeners = new Map();
  const rulerInner = { style: {} };
  const editorScroller = {
    scrollTop: editorScrollTop,
    scrollHeight: 1000,
    clientHeight: 400,
    parentElement: null,
    scrollBy({ top = 0 }) {
      this.scrollTop += top;
    }
  };
  const timeline = {
    scrollLeft,
    scrollTop: 0,
    scrollWidth,
    clientWidth,
    parentElement: editorScroller,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    }
  };
  const ruler = {
    scrollLeft: 0,
    querySelector(selector) {
      return selector === ".podcast-timeline-ruler-inner" ? rulerInner : null;
    }
  };
  const documentBody = {};
  editorScroller.parentElement = documentBody;

  const previousGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    WheelEvent: globalThis.WheelEvent,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame
  };
  globalThis.document = {
    body: documentBody,
    documentElement: documentBody,
    scrollingElement: null
  };
  globalThis.window = {
    addEventListener() {},
    getComputedStyle(node) {
      return { overflowY: node === editorScroller ? "auto" : "visible" };
    }
  };
  globalThis.WheelEvent = {
    DOM_DELTA_PIXEL: 0,
    DOM_DELTA_LINE: 1,
    DOM_DELTA_PAGE: 2
  };
  globalThis.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {};

  const api = createPodcasterTimelineUiApi({
    els: {
      podcastVideoTimeline: timeline,
      podcastTimelineRuler: ruler
    },
    podcastVideoState: {}
  });
  api.attachPodcastTimelineScrollSync();

  return {
    timeline,
    editorScroller,
    dispatchWheel(options = {}) {
      let prevented = false;
      listeners.get("wheel")({
        deltaX: 0,
        deltaY: 0,
        deltaMode: 0,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        preventDefault() {
          prevented = true;
        },
        ...options
      });
      return { prevented };
    },
    restore() {
      Object.entries(previousGlobals).forEach(([key, value]) => {
        if (typeof value === "undefined") delete globalThis[key];
        else globalThis[key] = value;
      });
    }
  };
}

function withHarness(options, callback) {
  const harness = createWheelHarness(options);
  try {
    callback(harness);
  } finally {
    harness.restore();
  }
}

test("diagonal trackpad gestures scroll left and right even when deltaY is larger", () => {
  withHarness({}, ({ timeline, editorScroller, dispatchWheel }) => {
    const initialEditorScrollTop = editorScroller.scrollTop;
    const leftResult = dispatchWheel({ deltaX: -18, deltaY: -42 });
    assert.equal(timeline.scrollLeft, 482);
    assert.equal(leftResult.prevented, true);
    assert.equal(editorScroller.scrollTop, initialEditorScrollTop);

    const rightResult = dispatchWheel({ deltaX: 15, deltaY: 40 });
    assert.equal(timeline.scrollLeft, 497);
    assert.equal(rightResult.prevented, true);
    assert.equal(editorScroller.scrollTop, initialEditorScrollTop);
  });
});

test("horizontal-dominant and line-mode gestures use the normalized delta", () => {
  withHarness({}, ({ timeline, dispatchWheel }) => {
    assert.equal(dispatchWheel({ deltaX: -30, deltaY: -4 }).prevented, true);
    assert.equal(timeline.scrollLeft, 470);

    assert.equal(dispatchWheel({ deltaX: -2, deltaY: 0, deltaMode: 1 }).prevented, true);
    assert.equal(timeline.scrollLeft, 438);
  });
});

test("pure vertical scrolling remains routed to the editor scroller", () => {
  withHarness({}, ({ timeline, editorScroller, dispatchWheel }) => {
    const result = dispatchWheel({ deltaX: 0, deltaY: -20 });
    assert.equal(timeline.scrollLeft, 500);
    assert.equal(editorScroller.scrollTop, 100);
    assert.equal(result.prevented, true);
  });

  withHarness({}, ({ timeline, editorScroller, dispatchWheel }) => {
    const result = dispatchWheel({ deltaX: 0.25, deltaY: -20 });
    assert.equal(timeline.scrollLeft, 500);
    assert.equal(editorScroller.scrollTop, 100);
    assert.equal(result.prevented, true);
  });
});

test("Shift plus wheel maps vertical movement to horizontal scrolling", () => {
  withHarness({}, ({ timeline, dispatchWheel }) => {
    const result = dispatchWheel({ deltaX: 0, deltaY: -12, shiftKey: true });
    assert.equal(timeline.scrollLeft, 488);
    assert.equal(result.prevented, true);
  });
});

test("horizontal movement is clamped and only prevented when the timeline consumes it", () => {
  withHarness({ scrollLeft: 0 }, ({ timeline, dispatchWheel }) => {
    const outward = dispatchWheel({ deltaX: -20, deltaY: 0 });
    assert.equal(timeline.scrollLeft, 0);
    assert.equal(outward.prevented, false);

    const inward = dispatchWheel({ deltaX: 20, deltaY: 0 });
    assert.equal(timeline.scrollLeft, 20);
    assert.equal(inward.prevented, true);
  });

  withHarness({ scrollLeft: 800 }, ({ timeline, dispatchWheel }) => {
    const outward = dispatchWheel({ deltaX: 20, deltaY: 0 });
    assert.equal(timeline.scrollLeft, 800);
    assert.equal(outward.prevented, false);
  });
});

test("Ctrl and Meta gestures are not converted into timeline scrolling", () => {
  for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
    withHarness({}, ({ timeline, dispatchWheel }) => {
      const result = dispatchWheel({ deltaX: -20, deltaY: -4, ...modifier });
      assert.equal(timeline.scrollLeft, 500);
      assert.equal(result.prevented, false);
    });
  }
});
