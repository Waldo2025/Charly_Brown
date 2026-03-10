# Release Gate Checklist (Security + Deploy)

Last update: 2026-03-10

## Gate 1: Secrets and credentials
- [ ] `npm run security:scan-secrets` returns OK.
- [ ] `git ls-files` does not include `public/config.local.js`, `.env` secrets, service accounts, private keys.
- [ ] No provider API keys (OpenAI/HF/Gemini server keys) in tracked frontend files.

## Gate 2: Backend API readiness
- [ ] Function `api` is deployed in `charly-brown`.
- [ ] CORS preflight (`OPTIONS`) for `/api/gemini/generate` returns `204` with `Access-Control-Allow-Origin` for production origin.
- [ ] `/api/*` without Firebase token returns `401/403`.
- [ ] `/api/*` with Firebase token returns `200` in smoke tests.

## Gate 3: Frontend production behavior
- [ ] Production path uses authenticated `/api/*` calls.
- [ ] Direct Gemini mode is only enabled in localhost with explicit flag (`allowDirectGemini` or `forceDirectGemini`).
- [ ] No `API_KEY is not defined` runtime errors in Unidad flow.

## Gate 4: Anti-XSS / anti-phishing
- [ ] High-risk dynamic HTML render points sanitized (lectura/content previews and restored HTML blocks).
- [ ] External URLs validated with `safeUrl`; dynamic links use `rel=\"noopener noreferrer\"`.
- [ ] CSP/Referrer-Policy/X-Content-Type-Options/Permissions-Policy present in hosting config.

## Gate 5: Functional smoke
- [ ] Login and profile flows work in deployed web app.
- [ ] Unidad generation creates full output including `.col-maestro`.
- [ ] Gemini generate/live-token requests complete without browser CORS errors.

## Blocker policy
If any gate is unchecked, the release is blocked.
