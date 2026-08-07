# Google Cloud phase 5 runbook

## Validated preview

- Preview: `https://charly-brown--google-cloud-phase4-mucp5w2o.web.app`
- Compute region: `us-central1`
- The isolated smoke creates a temporary Firebase user and session, then removes every temporary Firestore and Storage resource.
- Baseline: `node scripts/smoke-google-cloud-phase5.mjs --execute`
- Long jobs: `node scripts/smoke-google-cloud-phase5.mjs --execute --extended --jobs-only`
- Montage-only regression: `node scripts/smoke-google-cloud-phase5.mjs --execute --extended --jobs-only --montage-only`

The long-job smoke covers scenario image, Gemini TTS, Lyria, Veo Fast, Cloud Tasks, the montage Cloud Run Job and cancellation. The baseline also covers an 80 MiB resumable upload, signed media and HTTP Range.

## Authentication check

A `401` is valid only when the request has no Firebase ID token or the token is invalid. For a signed-in browser, verify that `Authorization: Bearer ...` is present and inspect `podcasterApi` logs. The client retries once with `getIdToken(true)`; it must not fall back to Render.

## Monitoring

`monitorStalePodcasterJobs` runs every five minutes. It emits `podcaster_job_heartbeat_expired` for stale `running` AI or montage documents. `scripts/configure-google-cloud-alerts.mjs --execute` idempotently creates log metrics and policies for HTTP 5xx, Cloud Tasks depth, failed Cloud Run Jobs, stale heartbeats and Vertex quota errors.

Use `node scripts/reconcile-stale-google-cloud-jobs.mjs` for a dry-run of abandoned legacy montage jobs. Add `--execute` only after reviewing the count; it preserves the documents and marks them as `status=error`, `stage=interrupted` so existing clients treat them as terminal and users can start a fresh export.

Cloud Monitoring tiene que conservar al menos un canal de correo habilitado. El script descubre esos canales y los asocia idempotentemente a las cinco políticas; si no encuentra ninguno, termina con error para evitar alertas silenciosas.

## Production cutover

Do not modify production Hosting until all preview checks pass. The cutover is one Hosting deploy from the reviewed `firebase.json`. Confirm that no browser request uses `onrender.com`, then repeat both smoke commands against production by setting `CHARLY_PHASE5_BASE_URL=https://charly-brown.web.app`.

## Emergency rollback

1. Keep all Render services suspended but recoverable for seven days.
2. Restore the last pre-cutover `firebase.json` from Git without reverting Firestore or Storage data.
3. Reactivate the four Render services and verify their health endpoints.
4. Deploy only Hosting rewrites.
5. Confirm sessions and public-library media before reopening traffic.

No rollback step deletes or migrates session documents. Never delete Render, BullMQ or Redis resources before the seven-day stability window and explicit approval.
