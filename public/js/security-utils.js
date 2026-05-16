import createDOMPurify from "../vendor/dompurify/purify.es.mjs";

const DOMPurify = createDOMPurify(window);

const FORBID_TAGS = Object.freeze([
  "SCRIPT",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "LINK",
  "META",
  "FORM",
  "INPUT",
  "BUTTON",
  "TEXTAREA",
  "SELECT",
  "BASE",
  "FRAME",
  "FRAMESET"
]);

const RICH_TEXT_ALLOWED_TAGS = Object.freeze([
  "A",
  "ABBR",
  "B",
  "BLOCKQUOTE",
  "BR",
  "CAPTION",
  "CODE",
  "COL",
  "COLGROUP",
  "DEL",
  "DIV",
  "EM",
  "FIGCAPTION",
  "FIGURE",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HR",
  "I",
  "IMG",
  "LI",
  "MARK",
  "OL",
  "P",
  "PRE",
  "S",
  "SMALL",
  "SPAN",
  "STRONG",
  "SUB",
  "SUP",
  "TABLE",
  "TBODY",
  "TD",
  "TH",
  "THEAD",
  "TR",
  "U",
  "UL"
]);

const ASSISTANT_ALLOWED_TAGS = Object.freeze([
  "A",
  "B",
  "BLOCKQUOTE",
  "BR",
  "CODE",
  "DIV",
  "EM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HR",
  "I",
  "LI",
  "OL",
  "P",
  "PRE",
  "S",
  "SMALL",
  "SPAN",
  "STRONG",
  "SUB",
  "SUP",
  "TABLE",
  "TBODY",
  "TD",
  "TH",
  "THEAD",
  "TR",
  "U",
  "UL"
]);

const ALLOWED_ATTR = Object.freeze([
  "alt",
  "class",
  "colspan",
  "data-language",
  "height",
  "href",
  "rel",
  "rowspan",
  "src",
  "style",
  "target",
  "title",
  "width"
]);

let hooksInstalled = false;

export function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizeTextInput(value = "", {maxLength = 5000, preserveNewlines = false} = {}) {
  let text = String(value ?? "");
  text = text.replace(/\u0000/g, "");
  text = preserveNewlines ? text.replace(/\r\n/g, "\n") : text.replace(/\s+/g, " ");
  text = text.trim();
  if (Number.isFinite(maxLength) && maxLength > 0) {
    text = text.slice(0, maxLength);
  }
  return text;
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

function isSafeCssValue(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;
  return !(
    normalized.includes("expression(") ||
    normalized.includes("javascript:") ||
    normalized.includes("vbscript:") ||
    normalized.includes("data:text/html") ||
    normalized.includes("url(")
  );
}

function shouldKeepDataUrl(tagName = "", attrName = "", value = "") {
  const normalizedTag = String(tagName || "").toUpperCase();
  const normalizedAttr = String(attrName || "").toLowerCase();
  const normalizedValue = String(value || "").trim().toLowerCase();
  if (!(normalizedAttr === "src" || normalizedAttr === "href" || normalizedAttr === "xlink:href")) {
    return false;
  }
  if (!normalizedValue.startsWith("data:")) return false;
  if (normalizedTag !== "IMG") return false;
  return /^data:image\/(?:png|jpeg|jpg|gif|webp|bmp|svg\+xml);/i.test(normalizedValue);
}

function buildAllowedTagList(allowedTags) {
  if (!allowedTags) return null;
  const source = Array.isArray(allowedTags) ? allowedTags : Array.from(allowedTags);
  const normalized = source
    .map((tag) => String(tag || "").trim().toUpperCase())
    .filter(Boolean);
  return normalized.length ? normalized : null;
}

function getProfileAllowedTags(profile = "rich") {
  if (profile === "assistant") return ASSISTANT_ALLOWED_TAGS;
  return RICH_TEXT_ALLOWED_TAGS;
}

function ensureHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;

  DOMPurify.addHook("uponSanitizeElement", (node, data) => {
    if (FORBID_TAGS.includes(String(data.tagName || "").toUpperCase())) {
      node.remove();
    }
  });

  DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
    const attrName = String(data.attrName || "").toLowerCase();
    const attrValue = String(data.attrValue || "");
    const normalizedValue = attrValue.trim().toLowerCase();

    if (attrName.startsWith("on") || attrName === "srcdoc") {
      data.keepAttr = false;
      return;
    }

    if (attrName === "style" && !isSafeCssValue(attrValue)) {
      data.keepAttr = false;
      return;
    }

    if (attrName === "rel" && /\bopener\b/i.test(attrValue)) {
      node.setAttribute("rel", attrValue.replace(/\bopener\b/gi, "").trim());
      return;
    }

    if (attrName === "target" && normalizedValue === "_blank") {
      const rel = String(node.getAttribute("rel") || "").toLowerCase();
      const next = new Set(rel.split(/\s+/).filter(Boolean));
      next.add("noopener");
      next.add("noreferrer");
      node.setAttribute("rel", Array.from(next).join(" "));
      return;
    }

    if (attrName === "href" || attrName === "src" || attrName === "xlink:href") {
      if (
        normalizedValue.startsWith("javascript:") ||
        normalizedValue.startsWith("vbscript:") ||
        normalizedValue.startsWith("data:text/html") ||
        (normalizedValue.startsWith("data:") && !shouldKeepDataUrl(node.tagName, attrName, attrValue))
      ) {
        data.keepAttr = false;
      }
    }
  });
}

function sanitizeWithProfile(value = "", {allowedTags = null, profile = "rich"} = {}) {
  ensureHooks();
  const resolvedAllowedTags = buildAllowedTagList(allowedTags) || getProfileAllowedTags(profile);
  return DOMPurify.sanitize(String(value || ""), {
    ALLOWED_TAGS: resolvedAllowedTags,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
    ALLOW_ARIA_ATTR: true,
    FORBID_TAGS,
    RETURN_TRUSTED_TYPE: false
  });
}

export function sanitizeHtml(value = "", {allowedTags = null} = {}) {
  return sanitizeWithProfile(value, {allowedTags, profile: "rich"});
}

export function sanitizeRichText(value = "", {fallback = "<p></p>"} = {}) {
  const clean = sanitizeWithProfile(value, {profile: "rich"}).trim();
  
  // Si después de sanitizar no queda nada, devolvemos el fallback
  if (!clean) return fallback;

  // Verificamos si tiene contenido real: ya sea texto o etiquetas (como <img>, <table>, etc)
  // Eliminamos solo espacios en blanco y etiquetas vacías comunes para ver si hay algo sustancial
  const contentCheck = clean
    .replace(/&nbsp;/g, " ")
    .replace(/<br\s*\/?>/g, " ")
    .replace(/<p>\s*<\/p>/g, " ")
    .trim();

  // Si después de la limpieza profunda no queda nada (ni texto ni etiquetas con contenido), 
  // pero la cadena original tenía algo que DOMPurify mantuvo (como una imagen), la mantenemos.
  // Solo devolvemos fallback si el resultado es realmente una estructura vacía.
  const isEmptyStructure = clean === "<p></p>" || clean === "<div></div>" || clean === "<p>&nbsp;</p>";
  
  return isEmptyStructure ? fallback : clean;
}

export function sanitizeAssistantHtml(value = "") {
  return sanitizeWithProfile(value, {profile: "assistant"});
}

export function setSanitizedHtml(el, html = "", options = {}) {
  if (!el) return "";
  const sanitized = sanitizeHtml(html, options);
  el.innerHTML = sanitized;
  return sanitized;
}

export function appendSanitizedHtml(el, html = "", options = {}) {
  if (!el) return "";
  const sanitized = sanitizeHtml(html, options);
  const template = document.createElement("template");
  template.innerHTML = sanitized;
  el.appendChild(template.content);
  return sanitized;
}

export function renderTrustedTemplate(el, html) {
  if (!el) return;
  el.innerHTML = sanitizeHtml(html);
}
