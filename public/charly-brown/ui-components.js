export function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function stripHtml(value = "") {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function createId(prefix = "cb") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function setBusy(element, busy = false, label = "") {
  if (!element) return;
  element.disabled = !!busy;
  element.setAttribute("aria-busy", busy ? "true" : "false");
  if (label) element.textContent = label;
}

export function toast(message = "") {
  const text = String(message || "").trim();
  if (!text) return;
  let el = document.querySelector(".cb-toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "cb-toast";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add("is-visible");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.remove("is-visible"), 2600);
}
