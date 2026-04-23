# Podcaster video pipeline simplification

## Goal
Reduce the `video/create` path to a small, explicit pipeline that is easy to debug:
`Gemini -> JSON parse -> minimal normalization -> strict validation -> render`.

## Problem
The current flow spreads video generation across many helpers. That makes it hard to tell whether a failure comes from Gemini, parsing, row normalization, scene enrichment, or validation. It also makes small bugs look like model failures.

## Design
- Keep one video generation entrypoint for `create`.
- Keep one separate entrypoint for `compose`.
- For `create`, remove semantic rescue layers that invent or rewrite scene content.
- Normalize only the fields needed to display a valid scene table.
- Validate only the fields the UI truly needs:
  - `voiceOverText`
  - `sceneDescription`
  - `visualNotes`
  - `videoDirective`
  - `onScreenText` when provided
- If any required field is missing or generic, fail explicitly and report the exact stage.

## Expected flow
1. `generateVideoScript()` prepares the prompt and calls Gemini.
2. `generateScriptWithGeminiCore()` sends the request and parses the JSON.
3. `normalizeScriptPayload()` maps Gemini output to the internal row shape.
4. `normalizeCreativeRow()` only standardizes aliases and trims text.
5. `validateCreativeVideoScriptOutput()` rejects invalid rows.

## What gets removed
- Fallback demo rows for video.
- Educational/template rewriting.
- Scene enrichment that fabricates missing content.
- Duplicate validation paths that do the same check in different places.

## Success criteria
- A valid Gemini response becomes a table with no extra invention.
- An invalid response fails with a precise error message.
- DevTools logs show the failing stage, not multiple noisy layers.

## Scope
This refactor only targets the creative video generation path in `public/podcaster.js` and the local Gemini proxy in `backend/server.js` if needed for debugging. Podcast generation stays unchanged.
