# Sally browser service

## Operational task integration (local, not yet deployed)

The root composer now records project context. Named task subchats use authenticated
`/api/sally/:sessionId/tasks` routes: create/list, GET task, POST `messages`,
POST `context`, POST `control`, GET `artifacts/:index`. A message receives an
acknowledgement after durable storage; investigation runs asynchronously and the
UI polls its task ID. Full results live in private Storage, with version pointers
in server-managed `SallyBrownTasks` Firestore documents.

The server model chooses typed read tools and proposes catalogued operations.
No Moodle writes occur during investigation. Approval is tied to a plan hash;
manual takeover pauses work, uncertain steps cannot be repeated automatically,
and a task from a previous server instance requires explicit recovery.

Before deploying this integration:

- Publish reviewed Sally rules, including the Storage fallback exclusion and
  server-only task state paths. Do not publish unrelated local rules changes.
- Grant the service account the necessary reviewed Firestore/Storage write
  permissions; the previously deployed viewer role is insufficient.
- Include `js/sally-tasks.js` in the selective Hosting release.
- Keep `SALLY_CERTIFIED_COURSES` empty until the actual Sally pipeline has passed
  authorized Moodle write/verification tests. Course 496 is authorized for tests,
  not automatically certified. No resources or paid capacity have been increased.

Current limitations: attached binary files are references, not parsed content;
conditional teacher-note privacy is not certified; native Description insertion
selectors, content verification, and multiple insertions require Moodle testing.
The agent refuses changes to quiz structure when Moodle reports existing attempts.
Local mocked execution tests do not certify real Moodle writes.

Independent Cloud Run service for the Sally web editor. Express and Playwright
run outside the renderer. No Electron is required by the web transport.

## Security and lifecycle

- Firebase Admin verifies each token including revocation; an approved role and
  participation in `SallyBrownSessions/{id}` are required on every request.
- Each user/session gets a separate browser profile in a temporary directory.
  Reopening the same viewer reuses the live Chromium context, preserving session
  cookies. Hidden tabs send lightweight heartbeats every 30 seconds.
  Profiles are deleted after ten minutes without requests, or on explicit close.
  Container restarts also discard Moodle logins; users must sign in again.
- Only configured Moodle origins and the listed static asset origins are allowed.
  Private IP destinations and arbitrary browser code are rejected.
- Screenshots mask password fields, remain transient in server/client memory and
  are not written to Firestore. Extracted course inventories are stored in private
  Firebase Storage; session documents hold summaries and references.
- Plan execution requires approval of the exact sanitized plan. Unknown actions
  fail closed. Local filesystem uploads are forbidden through the server API.

## Deployment

Image: `mcr.microsoft.com/playwright:v1.61.0-noble`, matching npm Playwright.
Service: `sally-browser`, project `charly-brown`, region `us-central1`.
Service account: `sally-browser@charly-brown.iam.gserviceaccount.com`, with
`roles/datastore.viewer` and `roles/firebaseauth.viewer`.

Configured as one instance, 2 GiB, 2 CPUs, HTTP concurrency 64, at most three browser contexts. This
is intentionally a small pilot, not a multi-instance durable session system.
CPU is allocated while the instance runs; Cloud Run costs apply. Polling keeps
an open visible browser active. Scale-to-zero and deployments can end sessions.

Environment:

- `SALLY_MOODLE_ORIGINS`: comma-separated exact HTTPS origins, default
  `https://aprende.asc.education`.
- `SALLY_WEB_ORIGINS`: allowed editor origins (Firebase Hosting and localhost/127.0.0.1 on ports 3000 and 5010
  by default). Add a custom frontend domain before serving Sally from it.
- `GOOGLE_CLOUD_PROJECT`: `charly-brown`.

Run `npm ci && npm test` in this directory. `node smoke.js` checks Chromium and
the public Moodle login without authenticating. Repository scripts also test
destination-only extraction against a local Moodle-like fixture and visual UI.
`node scripts/deploy-sally-hosting.mjs` from the repository publishes only Sally
files and adds the server to the live CSP, preserving unrelated published files.

## Scope still requiring certification

## Conversation and HTML content tools

Conversation entries, template versions and analysis reports are immutable JSON
files under each participant's private `sallyBrown/{uid}/{sessionId}/history/`
folder. The existing Storage participation rules apply; no new public collection
or access rule was introduced. `historyAuthors` records contributors, while
authorization continues to depend only on the actual session participants.
Each analysis uses a unique `inventories/{runId}/{view}.json` path. Previously
overwritten versions cannot be reconstructed; the latest existing report is
imported into the history when available.

The library can load HTML with inline styles, fill escaped `{{fields}}`, search
stored course content and prepare append/replace or new-page plans. The model
course is optional for explicit target HTML operations. All writes still require
approval. Server sanitization preserves allowed inline CSS and removes scripts,
event handlers and CSS network expressions. Existing resources are checked against
the approved destination course and must be a Moodle page or label. Hidden
visibility uses Moodle's `visible=0`, verified after saving, not CSS hiding.
Access to hidden activities depends on Moodle role capabilities, not an exclusive
hard-coded teacher role. This does not implement cloning native quiz questions,
files or arbitrary Moodle activity types.

Private Moodle content cannot be certified without an authorized manual login.
Extraction currently reads visible course sections and linked activity pages;
the reader tab is streamed during extraction, and inventory progress is emitted
before completion. The web client saves each completed course independently and
renders a descriptive report with coverage, resource types, observed fonts and
short text samples. This is not a certified pedagogical assessment. An interrupted
login returns partial coverage when structure/content was already collected.
Moodle plugins, nested tab layouts, file pickers and question types may require
additional adapters. Reordering is deliberately blocked without a certified
adapter. Execution deduplication remains in memory, not durable across a restart.
Do not claim full Moodle replication or every Moodle operation is certified.

## Manual control and tabbed formats

Manual input is coalesced into ordered batches (up to 64 entries per request).
Adjacent wheel events are summed and adjacent text events joined without crossing
click/key boundaries. One capture is returned per batch; stale frames are ignored
by timestamp. While controlling manually the server captures up to every 300 ms
and the web client polls every 250 ms; background tabs retain heartbeat-only
polling. Firebase and session authorization still run for every HTTP request.
These are cadence targets, not a guaranteed end-to-end latency.

`course-reader.js` detects format classes and Onetopic DOM markers, follows
same-course section/tab links recursively, and activates fixed role-based lazy
tab controls (including parent controls). It waits for current AJAX requests and
DOM stability, not just an earlier page's network-idle state. Inventories retain
tab paths, source URLs, section summaries, deduplicated modules and explicit
tab coverage. Restricted, failed or capped traversal is never marked complete.
Maximum 250 discovered views per run. Authentication restrictions are not bypassed.
Reference: https://github.com/davidherney/moodle-format_onetopic/tree/master/templates/courseformat
Certification still requires the user's Moodle theme/plugin and manual login.

## Separate model and destination conversations

The two chat tabs persist independent drafts and immutable messages (`thread`).
Legacy entries are assigned using `courseView` or their operation kind. Reading
the model requires no destination URL. Explicit transfers create destination-only
plans; messages can also be copied as references without modifying either course.
Read-only questions receive a full generated answer, retained without client
truncation; non-STOP provider responses are visibly marked incomplete.

Before approval, the authenticated `checkpoint` command reads original HTML and
visibility for existing page/label edits. The web client must persist that copy
to private history before approving. Each edit compares the current content hash
to the checkpoint and stops on conflict. Successful page edits return the full
post-save HTML and hash for durable execution history. A reverse plan restores
HTML and visibility only after a new approval and another conflict check. Exact
automatic restoration is offered only where the original HTML survives the
sanitizer unchanged. New resources, section creation, complex marked selections
and unsupported activities require manual restoration. This is not a global
Moodle transaction or backup; failed saves can still require manual inspection.
