# Charly Brown Agent Instructions

## Remote Workflows

- Treat `firebase.json`, `render.yaml`, `cloud-run/`, and `functions/` as separate deployment surfaces. Identify the owning surface before changing deployment or routing code.
- Firebase project configuration is in `.firebaserc`. Hosting serves `public/`, and its rewrites and ignore list in `firebase.json` are part of the production contract.
- Use `firebase deploy` only after reviewing the affected surface. Prefer a scoped deploy such as `firebase deploy --only hosting` or `firebase deploy --only functions:<name>` when appropriate.
- Do not deploy Firestore or Storage rules casually. Review `firestore.rules`, `storage.rules`, and indexes, then run the relevant tests. Functions deployment also requires service-account, IAM, Cloud Tasks, and integration-test readiness; see [functions/README.md](functions/README.md).
- Before production Hosting cutover, follow [docs/google-cloud-phase5-runbook.md](docs/google-cloud-phase5-runbook.md). Preview and smoke-test first; preserve Render resources for the documented rollback window.
- Cloud Run workers and specialist services must remain private and use IAM/OIDC. Cloud Tasks headers alone are not authorization. Preserve the deployment and permission model in `scripts/deploy-charly-specialists.sh` and `cloud-run/`.
- Render services are role-specific `backend/server.js` processes described in `render.yaml`. Preserve `BACKEND_SERVICE_ROLE`, health checks, queue settings, and the `charly-brown.firebasestorage.app` bucket unless the migration documentation says otherwise.

## Remote Validation

- General checks: `npm test`, `npm run test:functions`, `npm run test:cloud-run`, `npm run security:scan-secrets`, and `npm run security:verify-public`.
- Migration checks: `npm run test:migration:session-compat` and the preview smoke commands documented in [docs/google-cloud-phase5-runbook.md](docs/google-cloud-phase5-runbook.md).
- For Gemini model or Firebase integration changes, use [docs/gemini-firebase-playbook.md](docs/gemini-firebase-playbook.md) and the `npm run gemini:*` scripts.
- Do not assume the root README is current: it mentions `npm run build`, but the root `package.json` does not define that script. Use `package.json` as the source of truth for commands.

## Secrets And Configuration

- Never commit or expose `GEMINI_API_KEY`, WordPress credentials, Firebase service-account JSON, or other secrets in `public/`, frontend configuration, Docker images, logs, or client requests.
- Keep `.env*`, `config.local.js`, and service-account files local and ignored. Preserve Firebase Hosting exclusions for local configuration.
- Before a remote deploy, run the security checks and inspect the generated/deployed file set. Do not use local credentials as a substitute for verifying the target project's IAM and runtime secrets.

## Change Discipline

- Prefer existing runbooks and scripts over duplicating deployment logic. Link to detailed documentation rather than copying it into this file.
- Keep remote changes small and reversible. State the target project/service, deployment scope, validation performed, and rollback path in the change summary.