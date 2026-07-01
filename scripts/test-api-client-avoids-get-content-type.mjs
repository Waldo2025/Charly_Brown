import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/js/api-client.js",
  "utf8"
);

assert.match(
  source,
  /const requestHasBody = Object\.prototype\.hasOwnProperty\.call\(options \|\| \{\}, "body"\) && options\.body != null;/,
  "authFetchJson debe detectar si la request realmente lleva body."
);

assert.match(
  source,
  /const headers = await getAuthHeaders\(requestHasBody \? \{ "Content-Type": "application\/json" \} : \{\}\);/,
  "authFetchJson no debe mandar Content-Type en GET/HEAD sin body para evitar preflight CORS innecesario."
);

console.log("api-client GET Content-Type avoidance OK.");
