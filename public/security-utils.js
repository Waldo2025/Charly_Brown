export function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function safeUrl(value = "", fallback = "#") {
  const input = String(value || "").trim();
  if (!input) return fallback;
  try {
    const url = new URL(input, window.location.origin);
    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.toString();
    }
    return fallback;
  } catch (_) {
    return fallback;
  }
}

export function renderTrustedTemplate(el, html) {
  if (!el) return;
  el.innerHTML = String(html || "");
}

export function sanitizeHtml(value = "") {
  const template = document.createElement("template");
  template.innerHTML = String(value || "");

  const blockedTags = new Set(["SCRIPT", "IFRAME", "OBJECT", "EMBED", "LINK", "META"]);
  template.content.querySelectorAll("*").forEach((node) => {
    if (blockedTags.has(node.tagName)) {
      node.remove();
      return;
    }
    [...node.attributes].forEach((attr) => {
      const name = String(attr.name || "").toLowerCase();
      const rawValue = String(attr.value || "");
      const valueTrim = rawValue.trim().toLowerCase();
      if (name.startsWith("on")) {
        node.removeAttribute(attr.name);
        return;
      }
      if ((name === "href" || name === "src" || name === "xlink:href") &&
        (valueTrim.startsWith("javascript:") || valueTrim.startsWith("data:text/html"))) {
        node.removeAttribute(attr.name);
      }
    });
  });

  return template.innerHTML;
}
