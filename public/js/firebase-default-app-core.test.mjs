import test from "node:test";
import assert from "node:assert/strict";

import { getOrInitFirebaseApp } from "./firebase-default-app-core.mjs";

test("reuses the existing default Firebase app when one is already registered", () => {
  const existingApp = { name: "[DEFAULT]", source: "existing" };
  let initializeCalls = 0;

  const app = getOrInitFirebaseApp({
    getApps: () => [existingApp],
    getApp: () => existingApp,
    initializeApp: () => {
      initializeCalls += 1;
      return { name: "[DEFAULT]", source: "new" };
    },
    config: { apiKey: "demo", appId: "demo-app", projectId: "demo-project" }
  });

  assert.equal(app, existingApp);
  assert.equal(initializeCalls, 0);
});

test("initializes the default Firebase app when none exists yet", () => {
  const config = { apiKey: "demo", appId: "demo-app", projectId: "demo-project" };
  const createdApp = { name: "[DEFAULT]", source: "new" };
  let receivedConfig = null;

  const app = getOrInitFirebaseApp({
    getApps: () => [],
    getApp: () => {
      throw new Error("getApp should not run when there is no app");
    },
    initializeApp: (nextConfig) => {
      receivedConfig = nextConfig;
      return createdApp;
    },
    config
  });

  assert.equal(app, createdApp);
  assert.equal(receivedConfig, config);
});
