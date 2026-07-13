import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const checks = [
  ["node", ["--check", "public/analizarPDF/analizar-pdf-app.js"]],
  ["node", ["--check", "public/analizarPDF/analizar-pdf-results.js"]],
  ["node", ["--check", "public/analizarPDF/analizar-pdf-session-logic.js"]],
  ["node", ["--check", "public/analizarPDF/analizar-pdf-session-store.js"]],
  ["node", ["scripts/test-analizar-pdf-rail-sequential-job-isolation.mjs"]],
  ["node", ["scripts/test-analizar-pdf-rail-browser-smoke.mjs"]],
  ["node", ["scripts/test-analizar-pdf-multi-revision-regression.mjs"]],
  ["node", ["scripts/test-analizar-pdf-local-analysis-persistence-contract.mjs"]],
  ["node", ["scripts/test-analizar-pdf-session-merge-preserves-results.mjs"]],
  ["node", ["scripts/test-analizar-pdf-session-store.mjs"]],
  ["node", ["scripts/test-analizar-pdf-source-path-repair.mjs"]],
  ["node", ["scripts/test-analizar-pdf-style-mapping-scope.mjs"]],
  ["node", ["scripts/test-analizar-pdf-recortable-destination-renderer.mjs"]],
  ["node", ["scripts/test-analizar-pdf-quick-analysis-contract.mjs"]],
  ["python3", ["scripts/test-analizar-idml-recortable-destination.py"]],
  ["python3", ["scripts/test-analizar-idml-text-status.py"]],
  ["python3", ["scripts/test-analizar-idml-quick-tools.py"]],
  ["python3", ["scripts/test-analizar-idml-rae-validator.py"]],
  ["python3", ["scripts/test-analizar-idml-local-language-findings.py"]],
  ["python3", ["scripts/test-analizar-idml-semantic-block-merge.py"]],
  ["python3", ["scripts/test-analizar-idml-gemini-spanish-prompt.py"]],
  ["python3", ["scripts/test-analizar-idml-redaction-suggestions.py"]],
  ["node", ["scripts/test-analizar-pdf-backend-contract.mjs"]],
  ["node", ["scripts/test-firestore-rules-analizar-pdf.mjs"]],
  ["node", ["scripts/test-public-version-json-bumped.mjs"]],
];

function runCheck(command, args) {
  return new Promise((resolve) => {
    const label = [command, ...args].join(" ");
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code, signal) => {
      resolve({ label, code, signal, stdout, stderr });
    });
  });
}

const failures = [];
const startedAt = Date.now();

for (const [command, args] of checks) {
  const label = [command, ...args].join(" ");
  process.stdout.write(`\n[analizar-pdf-suite] ${label}\n`);
  const result = await runCheck(command, args);
  if (result.stdout.trim()) {
    process.stdout.write(`${result.stdout.trim()}\n`);
  }
  if (result.stderr.trim()) {
    process.stderr.write(`${result.stderr.trim()}\n`);
  }
  if (result.code !== 0) {
    failures.push(result);
    process.stderr.write(`[analizar-pdf-suite] FAILED ${label}\n`);
  } else {
    process.stdout.write(`[analizar-pdf-suite] OK ${label}\n`);
  }
}

const elapsedMs = Date.now() - startedAt;
if (failures.length) {
  process.stderr.write(`\n[analizar-pdf-suite] ${failures.length} fallo(s) en ${elapsedMs}ms.\n`);
  for (const failure of failures) {
    process.stderr.write(`- ${failure.label}: exit=${failure.code}${failure.signal ? ` signal=${failure.signal}` : ""}\n`);
  }
  process.exit(1);
}

process.stdout.write(`\n[analizar-pdf-suite] ${checks.length} checks OK en ${elapsedMs}ms.\n`);
