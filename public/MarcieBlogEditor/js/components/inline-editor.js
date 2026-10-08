import { saveMarcieSession, markMarcieSessionDirty } from "../services/marcie-session-store.js?v=20260923r4";
const pending = new Map();

function inlineText(node) {
  if (node.nodeType === 3) return node.textContent;
  if (node.hasAttribute?.("data-citation-link")) {
    const token = node.dataset?.citationToken || Array.from(node.querySelectorAll?.('a[href^="#source-"]') || [])
      .map(link => link.getAttribute("href").slice("#source-".length)).filter(Boolean).join(", ");
    return token ? "[" + token + "]" : (node.textContent || "");
  }
  const text = Array.from(node.childNodes || []).map(inlineText).join("");
  if (/^(B|STRONG)$/.test(node.tagName)) return "**" + text + "**";
  if (/^(I|EM)$/.test(node.tagName)) return "*" + text + "*";
  if (node.tagName === "U") return "<u>" + text + "</u>";
  if (node.tagName === "BR") return "\n";
  return text;
}

export function readEditableBlocks(container, previous = []) {
  return Array.from(container.children).filter(node => !node.matches("[data-editor-notice], [data-empty-section-notice], .article-ai-disclaimer")).map((node, index) => {
    const old = previous.find(block => block.id && block.id === node.dataset.blockId) || previous[index] || {};
    const block = { ...old, id: node.dataset.blockId || old.id || "b-" + crypto.randomUUID() };
    const tag = node.tagName;
    if (/^H[1-6]$/.test(tag)) return { ...block, type: "heading", level: tag.toLowerCase(), text: inlineText(node).trim() };
    delete block.level;
    if (tag === "UL" || tag === "OL") return { ...block, type: "bulletList", listType: tag === "OL" ? "ordered" : "unordered", items: Array.from(node.children).filter(item => item.tagName === "LI").map(item => inlineText(item).trim()) };
    if (tag === "BLOCKQUOTE") return { ...block, type: "quote", text: inlineText(node.querySelector("p") || node).trim().replace(/^\*([\s\S]*)\*$/, "$1").replace(/^[“"]|[”"]$/g, ""), attribution: (node.querySelector("footer, cite")?.textContent || block.attribution || "").replace(/^—\s*/, "") };
    return { ...block, type: "paragraph", text: inlineText(node).trim() };
  });
}

// Replace only the block shell. Moving the existing children preserves citation
// tokens, links, emphasis and the exact position of each reference in the text.
export function formatSelectedArticleBlocks(container, tagName, className = "") {
  if (!container || !["P", "H2", "H3"].includes(tagName)) return false;
  const selection = window.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return false;
  const selected = Array.from(container.children).filter(node => {
    if (!/^(P|H[1-6])$/.test(node.tagName) || node.matches("[data-editor-notice], [data-empty-section-notice]")) return false;
    if (range.collapsed) return node.contains(range.startContainer);
    if (!range.intersectsNode(node)) return false;
    const contents = document.createRange();
    contents.selectNodeContents(node);
    const overlap = range.cloneRange();
    if (overlap.compareBoundaryPoints(Range.START_TO_START, contents) < 0) overlap.setStart(node, 0);
    if (overlap.compareBoundaryPoints(Range.END_TO_END, contents) > 0) overlap.setEnd(node, node.childNodes.length);
    return !overlap.collapsed;
  });
  if (!selected.length) return false;
  const start = [range.startContainer, range.startOffset];
  const end = [range.endContainer, range.endOffset];
  const replacements = new Map();
  for (const node of selected) {
    const replacement = document.createElement(tagName.toLowerCase());
    replacement.className = className;
    if (node.dataset.blockId) replacement.dataset.blockId = node.dataset.blockId;
    while (node.firstChild) replacement.appendChild(node.firstChild);
    node.replaceWith(replacement);
    replacements.set(node, replacement);
  }
  container.focus({ preventScroll: true });
  const restored = document.createRange();
  restored.setStart(replacements.get(start[0]) || start[0], start[1]);
  restored.setEnd(replacements.get(end[0]) || end[0], end[1]);
  selection.removeAllRanges();
  selection.addRange(restored);
  container.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

export function makeArticleEditable({ getSession, onSaved, onMaterialChange }) {
  const title = document.getElementById("article-title");
  const subtitle = document.getElementById("article-subtitle");
  const body = document.getElementById("article-body-container");
  if (!title || !body) return;
  const capture = () => {
    const session = getSession();
    if (!session?.article) return;
    const audience = session.audience;
    session.title = session.article.title = title.innerText.trim();
    session.article.subtitle = subtitle?.innerText.trim() || "";
    session.article.blocks = readEditableBlocks(body, session.article.blocks);
    session.article.revision = Number(session.article.revision || 0) + 1;
    session.articlesByAudience = { ...session.articlesByAudience, [audience]: session.article };
    delete session.audit;
    if (session.auditsByAudience) delete session.auditsByAudience[audience];
    onMaterialChange?.(session);
    markMarcieSessionDirty(session);
    const indicator = document.getElementById("sync-status");
    if (indicator) indicator.textContent = "Guardando cambios…";
    clearTimeout(pending.get(session.id));
    pending.set(session.id, setTimeout(async () => {
      pending.delete(session.id);
      try {
        await saveMarcieSession(session);
        if (indicator) indicator.textContent = "Sincronizado";
        onSaved?.();
      } catch (error) {
        if (indicator) indicator.textContent = "Guardado pendiente: " + error.message;
      }
    }, 450));
  };
  [title, subtitle, body].filter(Boolean).forEach(element => {
    element.contentEditable = "true";
    element.oninput = capture;
  });
}
