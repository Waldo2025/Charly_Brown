# Karaoke Highlight Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable karaoke active-word highlight styling for on-screen text, exposed in a wider tabbed `onScreenTextTrackModal`, and keep preview, render, export, and Home visually aligned.

**Architecture:** Extend the existing `onScreenTextTrack` settings object with karaoke-highlight-specific fields, then thread those normalized settings through the existing shared renderers instead of creating a separate styling system. The UI remains in the existing on-screen text modal, but the modal body changes from one long inspector to tabbed panels. Preview/live HTML, raster SVG, ASS export, browser render, backend sanitization, and Home dashboard consume the same normalized fields.

**Tech Stack:** Vanilla JS modules, existing Podcaster modal/event delegation, CSS in `public/podcaster.css`/inline Home CSS, shared renderer `public/podcaster/podcaster-text-render.js`, backend sanitizer in `backend/server.js`, Node test scripts.

---

## File Structure

- Modify `public/podcaster/podcaster-on-screen-text.js`
  - Owns `normalizeOnScreenTextTrackSettings`, `applyOnScreenTextTrackSettingValue`, CSS class helpers, and `buildOnScreenTextTrackModalMarkup`.
  - Add karaoke highlight settings and tabbed modal markup.

- Modify `public/podcaster.css`
  - Owns the large modal layout and panel/tab visual styling for Podcaster.
  - Add width rules for `#onScreenTextTrackPanel` and tabbed inspector classes.

- Modify `public/podcaster/podcaster-text-render.js`
  - Owns shared karaoke HTML markup, raster/SVG, drawtext, and ASS generation.
  - Add functions that resolve highlight style tokens and apply shape/color consistently.

- Modify `public/podcaster/podcaster-playback-controller.js`
  - Owns live preview overlay HTML injection.
  - Pass normalized karaoke highlight settings into `buildKaraokeSubtitleMarkup`.

- Modify `public/podcaster/podcaster-render.js`
  - Owns browser renderer for montage export/review.
  - Pass settings into shared karaoke markup/rendering.

- Modify `public/js/home.js` and `public/home.html`
  - Own Home dashboard defaults and CSS for previewing the same karaoke highlight styles.

- Modify `backend/server.js`
  - Preserve/sanitize new `onScreenTextTrack` fields in export payloads.

- Modify or add tests:
  - `public/podcaster/podcaster-on-screen-text.test.js`
  - `public/podcaster/podcaster-text-render.test.js`
  - `scripts/test-podcaster-onscreen-text-modal-controls.mjs`
  - Add `scripts/test-podcaster-karaoke-highlight-style.mjs`

---

### Task 1: Extend Track Settings Model

**Files:**
- Modify: `public/podcaster/podcaster-on-screen-text.js`
- Test: `public/podcaster/podcaster-on-screen-text.test.js`

- [ ] **Step 1: Add failing normalization tests**

Add assertions to `public/podcaster/podcaster-on-screen-text.test.js`:

```js
assert.deepEqual(
  normalizeOnScreenTextTrackSettings({
    karaokeHighlightColor: "#22c55e",
    karaokeHighlightStyle: "pill",
    karaokeHighlightOpacity: 0.72,
    karaokeHighlightPaddingXPx: 14,
    karaokeHighlightPaddingYPx: 5,
    karaokeHighlightRadiusPx: 10
  }),
  {
    ...normalizeOnScreenTextTrackSettings({}),
    karaokeHighlightColor: "#22c55e",
    karaokeHighlightStyle: "pill",
    karaokeHighlightOpacity: 0.72,
    karaokeHighlightPaddingXPx: 14,
    karaokeHighlightPaddingYPx: 5,
    karaokeHighlightRadiusPx: 10
  }
);

assert.equal(
  normalizeOnScreenTextTrackSettings({ karaokeHighlightStyle: "invalid" }).karaokeHighlightStyle,
  "glow"
);
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run:

```bash
node public/podcaster/podcaster-on-screen-text.test.js
```

Expected: FAIL because the new fields do not exist.

- [ ] **Step 3: Add normalized fields**

In `normalizeOnScreenTextTrackSettings`, after `textColor`/background settings are resolved, add:

```js
const karaokeHighlightColor = String(source.karaokeHighlightColor || "").trim() || "#facc15";
const karaokeHighlightStyleRaw = String(source.karaokeHighlightStyle || "").trim().toLowerCase();
const karaokeHighlightStyle = ["glow", "text", "pill", "rect", "underline"].includes(karaokeHighlightStyleRaw)
  ? karaokeHighlightStyleRaw
  : "glow";
const karaokeHighlightOpacity = clamp01(source.karaokeHighlightOpacity, 0.92);
const karaokeHighlightPaddingXPx = Math.max(0, Math.min(40, Math.round(toFiniteNumber(source.karaokeHighlightPaddingXPx, 10))));
const karaokeHighlightPaddingYPx = Math.max(0, Math.min(28, Math.round(toFiniteNumber(source.karaokeHighlightPaddingYPx, 4))));
const karaokeHighlightRadiusPx = Math.max(0, Math.min(40, Math.round(toFiniteNumber(source.karaokeHighlightRadiusPx, 12))));
```

Return them in the settings object:

```js
karaokeHighlightColor,
karaokeHighlightStyle,
karaokeHighlightOpacity,
karaokeHighlightPaddingXPx,
karaokeHighlightPaddingYPx,
karaokeHighlightRadiusPx,
```

- [ ] **Step 4: Add setting application cases**

In `applyOnScreenTextTrackSettingValue`, add:

```js
} else if (key === "karaokeHighlightColor") {
  current.karaokeHighlightColor = nextValue || current.karaokeHighlightColor;
} else if (key === "karaokeHighlightStyle") {
  const allowed = new Set(["glow", "text", "pill", "rect", "underline"]);
  current.karaokeHighlightStyle = allowed.has(nextValue.toLowerCase()) ? nextValue.toLowerCase() : current.karaokeHighlightStyle;
} else if (key === "karaokeHighlightOpacity") {
  const numeric = toFiniteNumber(nextValue, Number.NaN);
  if (Number.isFinite(numeric)) current.karaokeHighlightOpacity = Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric));
} else if (key === "karaokeHighlightPaddingXPx") {
  current.karaokeHighlightPaddingXPx = Math.max(0, Math.min(40, Math.round(toFiniteNumber(nextValue, current.karaokeHighlightPaddingXPx))));
} else if (key === "karaokeHighlightPaddingYPx") {
  current.karaokeHighlightPaddingYPx = Math.max(0, Math.min(28, Math.round(toFiniteNumber(nextValue, current.karaokeHighlightPaddingYPx))));
} else if (key === "karaokeHighlightRadiusPx") {
  current.karaokeHighlightRadiusPx = Math.max(0, Math.min(40, Math.round(toFiniteNumber(nextValue, current.karaokeHighlightRadiusPx))));
```

- [ ] **Step 5: Run normalization tests**

Run:

```bash
node public/podcaster/podcaster-on-screen-text.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/podcaster/podcaster-on-screen-text.js public/podcaster/podcaster-on-screen-text.test.js
git commit -m "Add karaoke highlight track settings"
```

---

### Task 2: Rework `onScreenTextTrackModal` Into Tabs

**Files:**
- Modify: `public/podcaster/podcaster-on-screen-text.js`
- Modify: `public/podcaster.css`
- Test: `scripts/test-podcaster-onscreen-text-modal-controls.mjs`

- [ ] **Step 1: Add modal markup expectations**

Extend `scripts/test-podcaster-onscreen-text-modal-controls.mjs` to assert these strings exist in `buildOnScreenTextTrackModalMarkup(settings)`:

```js
assert.match(markup, /data-onscreen-tab="layout"/);
assert.match(markup, /data-onscreen-tab="appearance"/);
assert.match(markup, /data-onscreen-tab="effects"/);
assert.match(markup, /data-onscreen-tab="karaoke"/);
assert.match(markup, /data-setting="karaokeHighlightColor"/);
assert.match(markup, /data-setting="karaokeHighlightStyle"/);
```

- [ ] **Step 2: Run modal test and verify it fails**

Run:

```bash
node scripts/test-podcaster-onscreen-text-modal-controls.mjs
```

Expected: FAIL because tabs and karaoke controls are absent.

- [ ] **Step 3: Add tab state and markup**

In `buildOnScreenTextTrackModalMarkup`, wrap existing panels with:

```html
<div class="onscreen-text-tabs" role="tablist" aria-label="Paneles de texto en pantalla">
  <button class="onscreen-text-tab is-active" type="button" role="tab" data-action="onscreen-text-track-tab" data-onscreen-tab="layout" aria-selected="true">Layout</button>
  <button class="onscreen-text-tab" type="button" role="tab" data-action="onscreen-text-track-tab" data-onscreen-tab="appearance" aria-selected="false">Apariencia</button>
  <button class="onscreen-text-tab" type="button" role="tab" data-action="onscreen-text-track-tab" data-onscreen-tab="effects" aria-selected="false">Efectos</button>
  <button class="onscreen-text-tab" type="button" role="tab" data-action="onscreen-text-track-tab" data-onscreen-tab="karaoke" aria-selected="false">Karaoke</button>
</div>
```

Group current sections into panels:

```html
<section class="onscreen-text-tab-panel is-active" data-onscreen-tab-panel="layout">...</section>
<section class="onscreen-text-tab-panel" data-onscreen-tab-panel="appearance">...</section>
<section class="onscreen-text-tab-panel" data-onscreen-tab-panel="effects">...</section>
<section class="onscreen-text-tab-panel" data-onscreen-tab-panel="karaoke">...</section>
```

- [ ] **Step 4: Add karaoke controls**

In the karaoke panel, add:

```html
<section class="onscreen-text-inspector-panel is-karaoke-highlight">
  <div class="onscreen-text-inspector-panel-head"><strong>Highlight karaoke</strong></div>
  <div class="onscreen-text-inline-row">
    <label class="row-field onscreen-text-swatch-field">
      <span>Color</span>
      <input type="color" value="${escapeHtml(String(current.karaokeHighlightColor || "#facc15"))}" data-action="onscreen-text-track-setting" data-setting="karaokeHighlightColor" aria-label="Color del highlight karaoke">
    </label>
    <label class="row-field">
      <span>Forma</span>
      <select class="podcast-text-track-select" data-action="onscreen-text-track-setting" data-setting="karaokeHighlightStyle" aria-label="Forma del highlight karaoke">
        <option value="glow"${current.karaokeHighlightStyle === "glow" ? " selected" : ""}>Iluminado</option>
        <option value="text"${current.karaokeHighlightStyle === "text" ? " selected" : ""}>Solo color</option>
        <option value="pill"${current.karaokeHighlightStyle === "pill" ? " selected" : ""}>Redondo</option>
        <option value="rect"${current.karaokeHighlightStyle === "rect" ? " selected" : ""}>Rectángulo</option>
        <option value="underline"${current.karaokeHighlightStyle === "underline" ? " selected" : ""}>Subrayado</option>
      </select>
    </label>
  </div>
  <label class="row-field wide">
    <span>Opacidad</span>
    <div class="studio-volume-control">
      <input type="range" min="0" max="100" step="1" value="${Math.round((current.karaokeHighlightOpacity ?? 0.92) * 100)}" data-action="onscreen-text-track-setting" data-setting="karaokeHighlightOpacity">
      <input type="number" min="0" max="100" step="1" value="${Math.round((current.karaokeHighlightOpacity ?? 0.92) * 100)}" data-action="onscreen-text-track-setting" data-setting="karaokeHighlightOpacity" inputmode="numeric">
    </div>
  </label>
  <label class="row-field wide">
    <span>Padding X</span>
    <div class="studio-volume-control">
      <input type="range" min="0" max="40" step="1" value="${escapeHtml(String(current.karaokeHighlightPaddingXPx || 10))}" data-action="onscreen-text-track-setting" data-setting="karaokeHighlightPaddingXPx">
      <input type="number" min="0" max="40" step="1" value="${escapeHtml(String(current.karaokeHighlightPaddingXPx || 10))}" data-action="onscreen-text-track-setting" data-setting="karaokeHighlightPaddingXPx" inputmode="numeric">
    </div>
  </label>
  <label class="row-field wide">
    <span>Padding Y</span>
    <div class="studio-volume-control">
      <input type="range" min="0" max="28" step="1" value="${escapeHtml(String(current.karaokeHighlightPaddingYPx || 4))}" data-action="onscreen-text-track-setting" data-setting="karaokeHighlightPaddingYPx">
      <input type="number" min="0" max="28" step="1" value="${escapeHtml(String(current.karaokeHighlightPaddingYPx || 4))}" data-action="onscreen-text-track-setting" data-setting="karaokeHighlightPaddingYPx" inputmode="numeric">
    </div>
  </label>
  <label class="row-field wide">
    <span>Radio</span>
    <div class="studio-volume-control">
      <input type="range" min="0" max="40" step="1" value="${escapeHtml(String(current.karaokeHighlightRadiusPx || 12))}" data-action="onscreen-text-track-setting" data-setting="karaokeHighlightRadiusPx">
      <input type="number" min="0" max="40" step="1" value="${escapeHtml(String(current.karaokeHighlightRadiusPx || 12))}" data-action="onscreen-text-track-setting" data-setting="karaokeHighlightRadiusPx" inputmode="numeric">
    </div>
  </label>
</section>
```

- [ ] **Step 5: Add tab click handling**

In the existing `els.onScreenTextTrackModal.addEventListener("click", ...)` handler in `public/podcaster/podcaster.js`, add:

```js
const tabBtn = event.target.closest("[data-action='onscreen-text-track-tab']");
if (tabBtn) {
  const tab = String(tabBtn.dataset.onscreenTab || "").trim();
  const modal = els.onScreenTextTrackModal;
  modal.querySelectorAll("[data-action='onscreen-text-track-tab']").forEach((btn) => {
    const active = String(btn.dataset.onscreenTab || "") === tab;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  modal.querySelectorAll("[data-onscreen-tab-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", String(panel.dataset.onscreenTabPanel || "") === tab);
  });
  return;
}
```

- [ ] **Step 6: Make modal wider and tabbed in CSS**

Add to `public/podcaster.css` near existing on-screen text modal styles:

```css
#onScreenTextTrackPanel {
  width: min(1180px, calc(100vw - 32px));
  max-height: min(820px, calc(100vh - 40px));
}

#onScreenTextTrackModalBody {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
}

.onscreen-text-tabs {
  display: flex;
  gap: 6px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  padding: 0 4px 8px;
}

.onscreen-text-tab {
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.46);
  color: rgba(248, 250, 252, 0.82);
  min-height: 34px;
  padding: 0 12px;
  border-radius: 8px;
}

.onscreen-text-tab.is-active {
  background: rgba(248, 250, 252, 0.12);
  color: #fff;
  border-color: rgba(250, 204, 21, 0.55);
}

.onscreen-text-tab-panel {
  display: none;
  min-height: 0;
}

.onscreen-text-tab-panel.is-active {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 760px) {
  #onScreenTextTrackPanel {
    width: calc(100vw - 18px);
  }
  .onscreen-text-tabs {
    overflow-x: auto;
  }
  .onscreen-text-tab-panel.is-active {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 7: Run modal and syntax tests**

Run:

```bash
node --check public/podcaster/podcaster.js
node --check public/podcaster/podcaster-on-screen-text.js
node scripts/test-podcaster-onscreen-text-modal-controls.mjs
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add public/podcaster/podcaster-on-screen-text.js public/podcaster.css public/podcaster/podcaster.js scripts/test-podcaster-onscreen-text-modal-controls.mjs
git commit -m "Add tabbed on-screen text modal"
```

---

### Task 3: Apply Highlight Style in Live Preview

**Files:**
- Modify: `public/podcaster/podcaster-text-render.js`
- Modify: `public/podcaster/podcaster-playback-controller.js`
- Modify: `public/home.html`
- Test: `public/podcaster/podcaster-text-render.test.js`

- [ ] **Step 1: Add tests for karaoke markup settings**

In `public/podcaster/podcaster-text-render.test.js`, add:

```js
const html = api.buildKaraokeSubtitleMarkup("hola mundo", [
  { tokenIndex: 0, startMs: 0, endMs: 500 },
  { tokenIndex: 1, startMs: 500, endMs: 1000 }
], 1, {
  karaokeHighlightColor: "#22c55e",
  karaokeHighlightStyle: "pill",
  karaokeHighlightOpacity: 0.7,
  karaokeHighlightPaddingXPx: 12,
  karaokeHighlightPaddingYPx: 6,
  karaokeHighlightRadiusPx: 14
});

assert.match(html, /is-highlight-pill/);
assert.match(html, /--pod-karaoke-highlight-color:#22c55e/);
assert.match(html, /--pod-karaoke-highlight-opacity:0.7/);
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
node public/podcaster/podcaster-text-render.test.js
```

Expected: FAIL because `buildKaraokeSubtitleMarkup` has only three parameters and hardcoded active styling.

- [ ] **Step 3: Add shared highlight style helpers**

In `public/podcaster/podcaster-text-render.js`, add:

```js
function normalizeKaraokeHighlightSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const style = String(source.karaokeHighlightStyle || "").trim().toLowerCase();
  return {
    color: String(source.karaokeHighlightColor || "#facc15").trim() || "#facc15",
    style: ["glow", "text", "pill", "rect", "underline"].includes(style) ? style : "glow",
    opacity: Math.max(0, Math.min(1, Number(source.karaokeHighlightOpacity ?? 0.92) || 0.92)),
    paddingX: Math.max(0, Math.min(40, Math.round(Number(source.karaokeHighlightPaddingXPx ?? 10) || 10))),
    paddingY: Math.max(0, Math.min(28, Math.round(Number(source.karaokeHighlightPaddingYPx ?? 4) || 4))),
    radius: Math.max(0, Math.min(40, Math.round(Number(source.karaokeHighlightRadiusPx ?? 12) || 12)))
  };
}

function buildKaraokeHighlightInlineStyle(settings = {}) {
  const resolved = normalizeKaraokeHighlightSettings(settings);
  return [
    `--pod-karaoke-highlight-color:${escapeHtml(resolved.color)}`,
    `--pod-karaoke-highlight-opacity:${resolved.opacity}`,
    `--pod-karaoke-highlight-padding-x:${resolved.paddingX}px`,
    `--pod-karaoke-highlight-padding-y:${resolved.paddingY}px`,
    `--pod-karaoke-highlight-radius:${resolved.radius}px`
  ].join(";");
}
```

- [ ] **Step 4: Update `buildKaraokeSubtitleMarkup`**

Change signature:

```js
function buildKaraokeSubtitleMarkup(text = "", wordTimings = [], activeIndex = -1, settings = {}) {
```

Change active span construction:

```js
const highlight = normalizeKaraokeHighlightSettings(settings);
const className = `podcast-karaoke-word${isActive ? ` is-active is-highlight-${highlight.style}` : ""}`;
const style = isActive
  ? `font-size: inherit !important;${buildKaraokeHighlightInlineStyle(settings)}`
  : "font-size: inherit !important;";
const html = `<span class="${className}" data-karaoke-index="${wordIndex}" style="${style}">${escapeHtml(token)}</span>`;
```

- [ ] **Step 5: Pass settings from playback controller**

In `public/podcaster/podcaster-playback-controller.js`, change:

```js
const contentHtml = karaokeWordTimings.length
  ? buildKaraokeSubtitleMarkup(text, karaokeWordTimings, activeKaraokeWordIndex, settings)
  : this.deps.escapeHtml(text);
```

- [ ] **Step 6: Add shared CSS for live preview and Home**

In `public/home.html`, replace `.podcast-karaoke-word.is-active` hardcoded CSS with:

```css
.podcast-karaoke-word.is-active {
  color: var(--pod-karaoke-highlight-color, #facc15);
  filter: brightness(1.08);
}
.podcast-karaoke-word.is-active.is-highlight-glow {
  text-shadow:
    0 0 0.2em color-mix(in srgb, var(--pod-karaoke-highlight-color, #facc15) 96%, transparent),
    0 0 0.72em color-mix(in srgb, var(--pod-karaoke-highlight-color, #facc15) 62%, transparent),
    var(--pod-onscreen-text-stroke-shadow),
    var(--pod-onscreen-text-preset-shadow),
    var(--pod-onscreen-text-user-shadow);
}
.podcast-karaoke-word.is-active.is-highlight-pill,
.podcast-karaoke-word.is-active.is-highlight-rect {
  position: relative;
  display: inline-block;
  padding: var(--pod-karaoke-highlight-padding-y, 4px) var(--pod-karaoke-highlight-padding-x, 10px);
  border-radius: var(--pod-karaoke-highlight-radius, 12px);
  background: color-mix(in srgb, var(--pod-karaoke-highlight-color, #facc15) calc(var(--pod-karaoke-highlight-opacity, 0.92) * 100%), transparent);
  color: #0f172a;
  text-shadow: none;
}
.podcast-karaoke-word.is-active.is-highlight-rect {
  border-radius: min(4px, var(--pod-karaoke-highlight-radius, 4px));
}
.podcast-karaoke-word.is-active.is-highlight-underline {
  text-decoration: underline;
  text-decoration-color: var(--pod-karaoke-highlight-color, #facc15);
  text-decoration-thickness: 0.18em;
  text-underline-offset: 0.16em;
}
```

Mirror equivalent rules into `public/podcaster.css` for the editor preview containers.

- [ ] **Step 7: Run tests**

Run:

```bash
node public/podcaster/podcaster-text-render.test.js
node --check public/podcaster/podcaster-playback-controller.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add public/podcaster/podcaster-text-render.js public/podcaster/podcaster-playback-controller.js public/podcaster.css public/home.html public/podcaster/podcaster-text-render.test.js
git commit -m "Apply karaoke highlight style in preview"
```

---

### Task 4: Apply Highlight Style in Raster, Render, and Export

**Files:**
- Modify: `public/podcaster/podcaster-text-render.js`
- Modify: `public/podcaster/podcaster-render.js`
- Modify: `backend/server.js`
- Test: `scripts/test-podcaster-karaoke-highlight-style.mjs`

- [ ] **Step 1: Add export/raster test**

Create `scripts/test-podcaster-karaoke-highlight-style.mjs`:

```js
import assert from "node:assert/strict";
import fs from "node:fs";

const textRender = fs.readFileSync("public/podcaster/podcaster-text-render.js", "utf8");
const backend = fs.readFileSync("backend/server.js", "utf8");

assert.match(textRender, /karaokeHighlightColor/);
assert.match(textRender, /karaokeHighlightStyle/);
assert.match(textRender, /buildOnScreenTextRasterTokenMarkup\(token, wordIndex === activeWordIndex, textColor, settings\)/);
assert.match(textRender, /buildAssActiveWordColorOverlayText\(wrappedText, index, activeColor, baseColor, settings\)/);
assert.match(backend, /karaokeHighlightColor/);
assert.match(backend, /karaokeHighlightStyle/);

console.log("Podcaster karaoke highlight style export parity OK.");
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
node scripts/test-podcaster-karaoke-highlight-style.mjs
```

Expected: FAIL because raster/ASS/backend do not support settings yet.

- [ ] **Step 3: Update raster SVG tokens**

Change:

```js
function buildOnScreenTextRasterTokenMarkup(token = "", isActive = false, textColor = "currentColor") {
```

to:

```js
function buildOnScreenTextRasterTokenMarkup(token = "", isActive = false, textColor = "currentColor", settings = {}) {
```

Use:

```js
const highlight = normalizeKaraokeHighlightSettings(settings);
if (!isActive) return `<tspan fill="${escapeSvgText(textColor)}">${safeToken}</tspan>`;
if (highlight.style === "text" || highlight.style === "glow") {
  return `<tspan fill="${escapeSvgText(highlight.color)}" filter="${highlight.style === "glow" ? "url(#pod-karaoke-active)" : ""}">${safeToken}</tspan>`;
}
return `<tspan fill="${escapeSvgText(highlight.color)}" filter="url(#pod-karaoke-active)">${safeToken}</tspan>`;
```

Pass settings through `buildOnScreenTextRasterLineMarkup` and the caller that builds SVG/raster snapshots.

- [ ] **Step 4: Update ASS active overlay**

Change:

```js
function buildAssActiveWordColorOverlayText(text = "", activeWordIndex = -1, activeColor = "&H0015CCFA", baseColor = "&H00FCFAF8") {
```

to:

```js
function buildAssActiveWordColorOverlayText(text = "", activeWordIndex = -1, activeColor = "&H0015CCFA", baseColor = "&H00FCFAF8", settings = {}) {
```

For `pill` and `rect`, approximate TikTok/Facebook-style background in ASS by applying `\4c`/`\4a` box color to the active layer and using a larger border/shadow:

```js
const highlight = normalizeKaraokeHighlightSettings(settings);
const activeBoxColor = toAssColor(highlight.color, highlight.opacity, "FACC15");
```

When building `activeOverrides`, for pill/rect use:

```js
const activeOverrides = highlight.style === "pill" || highlight.style === "rect"
  ? `{${baseCommon}\\bord${Math.max(visibleStrokeWidth, highlight.paddingY)}\\shad0${formatAssOverrideColor(baseColor, "1")}${formatAssOverrideColor(baseColor, "2")}${formatAssOverrideColor(activeBoxColor, "3")}${formatAssOverrideColor(activeBoxColor, "4")}}`
  : `{${baseCommon}\\bord${visibleStrokeWidth}\\shad${Math.max(shadowPx, stylePreset === "3d" ? 1 : shadowPx)}\\xshad${shadowX}\\yshad${Math.max(shadowPx, stylePreset === "3d" ? 1 : shadowPx)}${formatAssOverrideColor(activeColor, "1")}${formatAssOverrideColor(activeColor, "2")}${formatAssOverrideColor(outlineColor, "3")}\\4a&HFF&}`;
```

Note: ASS cannot do true per-word rounded rectangles. The export approximation should be visually consistent enough: colored backing behind the active token for `pill`/`rect`, underline for `underline`, color/glow for `glow`.

- [ ] **Step 5: Pass settings in browser renderer**

In `public/podcaster/podcaster-render.js`, change `buildKaraokeSubtitleMarkup(text, audioClip?.wordTimings || [], activeWordIndex)` to:

```js
buildKaraokeSubtitleMarkup(text, audioClip?.wordTimings || [], activeWordIndex, settings)
```

- [ ] **Step 6: Preserve settings in backend sanitizer**

In `backend/server.js` `sanitizeOnScreenTextTrack`, add:

```js
karaokeHighlightColor: clampText(trackRaw?.karaokeHighlightColor || "#facc15", 24) || "#facc15",
karaokeHighlightStyle: ["glow", "text", "pill", "rect", "underline"].includes(String(trackRaw?.karaokeHighlightStyle || "").trim().toLowerCase())
  ? String(trackRaw.karaokeHighlightStyle).trim().toLowerCase()
  : "glow",
karaokeHighlightOpacity: clampNumber(trackRaw?.karaokeHighlightOpacity, 0, 1, 0.92),
karaokeHighlightPaddingXPx: clampNumber(trackRaw?.karaokeHighlightPaddingXPx, 0, 40, 10),
karaokeHighlightPaddingYPx: clampNumber(trackRaw?.karaokeHighlightPaddingYPx, 0, 28, 4),
karaokeHighlightRadiusPx: clampNumber(trackRaw?.karaokeHighlightRadiusPx, 0, 40, 12),
```

- [ ] **Step 7: Run export/raster tests**

Run:

```bash
node scripts/test-podcaster-karaoke-highlight-style.mjs
node public/podcaster/podcaster-text-render.test.js
node scripts/test-podcaster-montage-export-karaoke-render.mjs
node scripts/test-podcaster-montage-export-ass-pipeline.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add public/podcaster/podcaster-text-render.js public/podcaster/podcaster-render.js backend/server.js scripts/test-podcaster-karaoke-highlight-style.mjs
git commit -m "Apply karaoke highlight style in export"
```

---

### Task 5: Update Home Dashboard Parity

**Files:**
- Modify: `public/js/home.js`
- Modify: `public/home.html`
- Test: `scripts/test-home-gemini-audio-speed-playback.mjs` or a new focused static test

- [ ] **Step 1: Add Home static test**

Create `scripts/test-home-karaoke-highlight-style.mjs`:

```js
import assert from "node:assert/strict";
import fs from "node:fs";

const homeJs = fs.readFileSync("public/js/home.js", "utf8");
const homeHtml = fs.readFileSync("public/home.html", "utf8");

assert.match(homeJs, /normalizeOnScreenTextTrackSettings\(cfg\?\.onScreenTextTrack \|\| \{\}\)/);
assert.match(homeHtml, /is-highlight-pill/);
assert.match(homeHtml, /--pod-karaoke-highlight-color/);

console.log("Home karaoke highlight style parity OK.");
```

- [ ] **Step 2: Run and verify it fails**

Run:

```bash
node scripts/test-home-karaoke-highlight-style.mjs
```

Expected: FAIL until Home CSS includes the new classes.

- [ ] **Step 3: Ensure Home preserves settings**

In `public/js/home.js`, keep the existing `normalizeSharedTrack(cfg.onScreenTextTrack)` call, but verify it uses the updated global `normalizeOnScreenTextTrackSettings` from `podcaster-on-screen-text.js`. Do not overwrite new fields when forcing:

```js
cfg.onScreenTextTrack = normalizeSharedTrack({
  ...cfg.onScreenTextTrack,
  enabled: true,
  showTrack: true
});
```

- [ ] **Step 4: Add Home CSS classes**

Add the same `.is-highlight-*` rules from Task 3 to `public/home.html` near existing `.podcast-karaoke-word.is-active` CSS.

- [ ] **Step 5: Run Home tests**

Run:

```bash
node scripts/test-home-karaoke-highlight-style.mjs
node scripts/test-home-gemini-audio-speed-playback.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/js/home.js public/home.html scripts/test-home-karaoke-highlight-style.mjs
git commit -m "Align Home karaoke highlight styles"
```

---

### Task 6: Browser QA and Release Versioning

**Files:**
- Modify: `public/podcaster.html`
- Modify: `public/version.json`

- [ ] **Step 1: Increment cache-busters**

Update `public/podcaster.html`:

```html
<script src="podcaster/podcaster-on-screen-text.js?v=2026-06-26.2"></script>
<script src="podcaster/podcaster-text-render.js?v=2026-06-26.1"></script>
<script type="module" src="podcaster/podcaster.js?v=2026-06-26.6"></script>
```

If `podcaster-render.html` imports `podcaster-render.js` or shared renderers with cache-busters, increment those too.

- [ ] **Step 2: Update `public/version.json`**

Set:

```json
{
  "version": "1.0.10.249",
  "build": "2026-1.0.10.249",
  "cache_version": "2026-1.0.10.249"
}
```

Add changelog:

```json
"Mejorado: El texto en pantalla de Podcaster ahora permite configurar color y forma del highlight karaoke desde una nueva pestaña del modal, con paridad en preview, Home, render y export."
```

- [ ] **Step 3: Run full targeted verification**

Run:

```bash
node --check public/podcaster/podcaster-on-screen-text.js
node --check public/podcaster/podcaster-text-render.js
node --check public/podcaster/podcaster-playback-controller.js
node --check public/podcaster/podcaster-render.js
node --check public/js/home.js
node --check backend/server.js
node public/podcaster/podcaster-on-screen-text.test.js
node public/podcaster/podcaster-text-render.test.js
node scripts/test-podcaster-onscreen-text-modal-controls.mjs
node scripts/test-podcaster-karaoke-highlight-style.mjs
node scripts/test-home-karaoke-highlight-style.mjs
node scripts/test-podcaster-montage-export-karaoke-render.mjs
node scripts/test-podcaster-montage-export-ass-pipeline.mjs
git diff --check
```

Expected: all PASS.

- [ ] **Step 4: Manual UI smoke**

Start a local static server:

```bash
npx live-server public --host=127.0.0.1 --port=5179
```

Open `http://127.0.0.1:5179/podcaster.html`, then verify:

- `onScreenTextTrackModal` is wider and usable on desktop.
- Modal tabs switch between Layout, Apariencia, Efectos, Karaoke.
- Karaoke tab changes highlight color live.
- `pill` and `rect` render as background shapes behind the active word.
- `underline` only underlines the active word.
- Regular text styling still works.
- Montage preview playback keeps the selected karaoke highlight style.

- [ ] **Step 5: Commit and push**

```bash
git add public/podcaster.html public/version.json
git commit -m "Release karaoke highlight controls"
git push origin codex-bootstrap
```

---

## Self-Review

**Spec coverage:**
- Modal wider: Task 2 CSS.
- Modal panels organized as tabs: Task 2 markup, CSS, click handler.
- New tab to modify text-on-screen karaoke highlight: Task 2 karaoke panel.
- Change highlight color: Task 1 settings, Task 2 control, Tasks 3-5 rendering.
- Change highlight shape to glow/rect/rounded/TikTok-style: Task 1 setting, Task 2 selector, Tasks 3-4 render parity.
- Adjust preview/render/export/home: Tasks 3, 4, 5.

**Placeholder scan:** No TODO/TBD placeholders. All implementation-sensitive tasks include file paths, code snippets, commands, and expected outcomes.

**Type consistency:** Settings names are consistent across plan:
- `karaokeHighlightColor`
- `karaokeHighlightStyle`
- `karaokeHighlightOpacity`
- `karaokeHighlightPaddingXPx`
- `karaokeHighlightPaddingYPx`
- `karaokeHighlightRadiusPx`

