import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const html = read("public/SallyBrownEditor.html");
const ui = read("public/js/SallyBrownEditor.js");
const css = read("public/SallyBrownEditor.css");
const layout = read("public/js/chromeLayout.js");
const sidebar = read("public/js/sidebar.js");
const preload = read("preload.js");
const main = read("main.js");
const controller = read("backend/sally/controller.js");
const firestore = read("firestore.rules");
const storage = read("storage.rules");

assert.match(layout, /SallyBrownEditor\.html/);
assert.match(layout, /requiresApproval:\s*true/);
assert.match(sidebar, /data-approval-required/);
assert.match(sidebar, /resolveApprovedUserProfile/);
assert.match(html, /id="sallyAccessGate"/);
assert.match(html, /id="sallySessionsPane"/);
assert.match(html, /id="sallyBrowserStage"/);
assert.match(html, /id="sallyBriefPane"/);
assert.match(ui, /onAuthStateChanged/);
assert.match(ui, /!approved \|\| !role/);
assert.match(ui, /approvedPlanHash/);
assert.match(css, /grid-template-columns:var\(--sally-left\)/);
assert.match(css, /@media\(max-width:820px\)/);
assert.match(preload, /exposeInMainWorld\("sallyBrown"/);
assert.match(main, /registerSallyBrownIpc/);
assert.match(controller, /accounts:lookup/);
assert.match(controller, /ALLOWED_OPERATIONS/);
assert.match(controller, /launchPersistentContext/);
assert.match(firestore, /match \/SallyBrownSessions\/\{sessionId\}/);
assert.match(firestore, /request\.resource\.data\.ownerId == resource\.data\.ownerId/);
assert.match(storage, /match \/sallyBrown\/\{uid\}\/\{sessionId\}/);

console.log("Sally Brown Editor contracts: OK");
