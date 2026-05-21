import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../public/podcaster/podcaster.js", import.meta.url),
  "utf8"
);

const invalidMixedOperatorPatterns = [
  /\?\?[^()]*\|\|/,
  /\|\|[^()]*\?\?/,
  /\?\?[^()]*&&/,
  /&&[^()]*\?\?/
];

const offenders = source
  .split("\n")
  .map((line, index) => ({ line, lineNumber: index + 1 }))
  .filter(({ line }) => invalidMixedOperatorPatterns.some((pattern) => pattern.test(line)));

if (offenders.length) {
  const details = offenders
    .map(({ lineNumber, line }) => `${lineNumber}: ${line.trim()}`)
    .join("\n");
  throw new Error(`podcaster.js no debe mezclar ?? con || o && en la misma expresión.\n${details}`);
}

console.log("Podcaster nullish/logical operator mixing guard OK.");
