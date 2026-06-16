# Podcaster Karaoke Centralization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize on-screen text and karaoke rendering in one shared JS module and make both the editor preview and the montage export use the same implementation.

**Architecture:** Create one shared Podcaster text-render module that wraps the existing on-screen-text spec and the karaoke helpers, then convert the current `podcaster-karaoke.js` file into a compatibility wrapper. Update the frontend preview controller and the backend montage export pipeline to consume the shared module instead of separate local helpers.

**Tech Stack:** Node.js, CommonJS/ESM-compatible UMD module pattern, FFmpeg drawtext filters, existing Podcaster frontend/backend JS.

---

### Task 1: Add the shared text-render module

**Files:**
- Create: `public/podcaster/podcaster-text-render.js`
- Test: `tests/podcaster-karaoke-overlay.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { buildKaraokeSubtitleMarkup } from "../public/podcaster/podcaster-text-render.js";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/podcaster-karaoke-overlay.test.mjs`
Expected: fail because the new module does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Expose the shared karaoke helpers, the on-screen-text re-exports, and the FFmpeg-facing draw/filter helpers from a single UMD module.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/podcaster-karaoke-overlay.test.mjs`
Expected: pass.

### Task 2: Switch frontend consumers to the shared module

**Files:**
- Modify: `public/podcaster/podcaster.js`
- Modify: `public/podcaster/podcaster-playback-controller.js`
- Modify: `public/podcaster/podcaster-karaoke.js`

- [ ] **Step 1: Update imports**

Replace direct imports from `podcaster-karaoke.js` with the new shared module, and keep `podcaster-karaoke.js` as a compatibility re-export.

- [ ] **Step 2: Run the preview regressions**

Run: `node --test tests/podcaster-karaoke-overlay.test.mjs`
Expected: pass.

### Task 3: Switch backend export to the shared module and validate export behavior

**Files:**
- Modify: `backend/server.js`
- Modify: `scripts/test-podcaster-montage-export-karaoke-render.mjs`
- Modify: `tests/podcaster-onscreen-text-track-layout.test.mjs`

- [ ] **Step 1: Update backend karaoke helpers**

Remove local karaoke/render helpers from the backend and call the shared module for normalization, active-word resolution, markup generation, and FFmpeg karaoke filtering.

- [ ] **Step 2: Refresh the export regression test**

Update the export test so it asserts the current shared-module path instead of the obsolete `ASS/subtitles` expectation.

- [ ] **Step 3: Run the export and shared-layout tests**

Run:

```bash
node --test scripts/test-podcaster-montage-export-karaoke-render.mjs
node --test tests/podcaster-onscreen-text-track-layout.test.mjs
```

Expected: both pass.

