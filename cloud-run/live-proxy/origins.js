"use strict";

const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  "https://charly-brown.web.app",
  "https://charly-brown.firebaseapp.com"
]);

function configuredOrigins(value = "") {
  const configured = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

function isAllowedLiveOrigin(origin = "", configuredValue = "") {
  const clean = String(origin || "").trim();
  if (!clean) return false;
  if (configuredOrigins(configuredValue).has(clean)) return true;
  if (/^https:\/\/charly-brown--[a-z0-9-]+\.web\.app$/i.test(clean)) return true;
  return /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(clean);
}

module.exports = {
  DEFAULT_ALLOWED_ORIGINS,
  configuredOrigins,
  isAllowedLiveOrigin
};
