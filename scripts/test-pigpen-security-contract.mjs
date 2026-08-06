import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");
const server = read("backend/server.js");
const rules = read("firestore.rules");
const home = read("public/js/home.js");
const creator = read("public/js/PigPenCreator.js");
const creatorHtml = read("public/PigPenCreator.html");
const homeHtml = read("public/home.html");
const apiClient = read("public/js/api-client.js");
const storageRules = read("storage.rules");
const sharedGeminiClient = read("public/charly-brown/gemini-client.js");

assert.match(rules, /allow read: if canReadEscapeRoom\(resource\.data\)/);
assert.match(rules, /request\.resource\.data\.ownerId == resource\.data\.ownerId/);
assert.match(rules, /isPublishedEscapeRoom\(data\)/);
assert.match(home, /where\("status", "==", "published"\)/);
assert.match(home, /where\("ownerId", "==", user\.uid\)/);

for (const html of [creatorHtml, homeHtml]) {
  assert.match(html, /sandbox="allow-scripts allow-forms allow-modals allow-downloads"/);
  assert.doesNotMatch(html, /allow-same-origin/);
  assert.match(html, /allow="fullscreen"/);
}
assert.match(home, /editorialReview: false/);
assert.match(creator, /event\.source !== elements\.previewFrame\?\.contentWindow/);
assert.match(creator, /event\.origin !== "null"/);

assert.match(server, /app\.disable\("x-powered-by"\)/);
assert.match(server, /app\.use\("\/api\/gemini", express\.json\(\{ limit: GEMINI_BODY_LIMIT \}\)\)/);
assert.match(server, /app\.use\("\/api\/gemini", requireGeminiClientSecurity, geminiRateLimiter\)/);
assert.match(server, /admin\.appCheck\(\)\.verifyToken\(token\)/);
assert.match(server, /GEMINI_GENERATE_ALLOWED_MODELS\.has\(requestedModel\)/);
assert.match(server, /detectSupportedRasterImage\(buffer\)/);
assert.doesNotMatch(server, /https:\/\/\*\.onrender\.com/);
assert.doesNotMatch(server, /Access-Control-Allow-Origin", origin \|\| "\*"/);
assert.match(apiClient, /"X-Firebase-AppCheck": appCheckToken/);
assert.match(storageRules, /allow read: if canReadEscapeRoomAssets\(uid, sessionId\)/);
assert.match(storageRules, /allow write: if \(isOwner\(uid\) \|\| isAdmin\(\)\) && isSafePublicAsset\(fileName\)/);
assert.match(sharedGeminiClient, /headers: await getAuthHeaders\(\)/);
assert.doesNotMatch(sharedGeminiClient, /getIdToken\(/);

console.log("PigPen security contract OK.");
