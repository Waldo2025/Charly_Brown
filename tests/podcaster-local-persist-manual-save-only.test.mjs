import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

function extractConst(name) {
  const match = source.match(new RegExp(`const ${name} = [^;]+;`));
  if (!match) {
    throw new Error(`No se encontró la constante ${name}`);
  }
  return match[0];
}

function extractFunction(name) {
  const signature = `function ${name}`;
  const start = source.indexOf(signature);
  if (start === -1) {
    throw new Error(`No se encontró ${name}`);
  }
  let parenDepth = 0;
  let braceStart = -1;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") parenDepth += 1;
    if (char === ")") {
      parenDepth -= 1;
      continue;
    }
    if (char === "{" && parenDepth === 0) {
      braceStart = index;
      break;
    }
  }
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`No se pudo extraer ${name}`);
}

test("manual-save-only mode still persists session state locally", () => {
  const calls = [];
  const context = {
    console,
    cloudAutosaveTimeout: 0,
    PODCAST_SESSION_MANUAL_SAVE_ONLY: true,
    getActiveSession: () => ({ id: "session-1" }),
    persistSessions: () => {
      calls.push("persist");
    },
    sessionStore: {
      markDirty(sessionId, reason) {
        calls.push(`dirty:${sessionId}:${reason}`);
      }
    },
    setTimeout(fn) {
      fn();
      return 1;
    },
    clearTimeout() {}
  };
  vm.createContext(context);
  vm.runInContext(extractConst("PODCAST_SESSION_MANUAL_SAVE_ONLY"), context);
  vm.runInContext("let cloudAutosaveTimeout = 0;", context);
  vm.runInContext(`${extractFunction("scheduleSessionLocalPersist")};`, context);
  vm.runInContext(`${extractFunction("flushSessionLocalPersistNow")};`, context);

  vm.runInContext(`scheduleSessionLocalPersist("background-music");`, context);
  vm.runInContext(`flushSessionLocalPersistNow("session-1", "immediate");`, context);

  assert.deepEqual(calls, [
    "persist",
    "dirty:session-1:background-music",
    "persist",
    "dirty:session-1:immediate"
  ]);
});
