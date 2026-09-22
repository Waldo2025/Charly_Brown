import { saveMarcieSession, markMarcieSessionDirty } from "../services/marcie-session-store.js?v=20260922r1";
const pending = new Map();

function inlineText(node) {
  if (node.nodeType === 3) return node.textContent;
  if (node.hasAttribute?.("data-citation-link")) return node.dataset.citationToken ? "[" + node.dataset.citationToken + "]" : "";
  const text = Array.from(node.childNodes || []).map(inlineText).join("");
  if (/^(B|STRONG)$/.test(node.tagName)) return "**" + text + "**";
  if (/^(I|EM)$/.test(node.tagName)) return "*" + text + "*";
  if (node.tagName === "U") return "<u>" + text + "</u>";
  if (node.tagName === "BR") return "\n";
  return text;
}

export function readEditableBlocks(container, previous = []) {
  return Array.from(container.children).filter(node => !node.hasAttribute("data-editor-notice")).map((node, index) => {
    const old = previous.find(block => block.id && block.id === node.dataset.blockId) || previous[index] || {};
    const block = { ...old, id: node.dataset.blockId || old.id || "b-" + crypto.randomUUID() };
    const tag = node.tagName;
    if (/^H[1-6]$/.test(tag)) return { ...block, type: "heading", level: tag.toLowerCase(), text: inlineText(node).trim() };
    if (tag === "UL" || tag === "OL") return { ...block, type: "bulletList", listType: tag === "OL" ? "ordered" : "unordered", items: Array.from(node.children).filter(item => item.tagName === "LI").map(item => inlineText(item).trim()) };
    if (tag === "BLOCKQUOTE") return { ...block, type: "quote", text: inlineText(node.querySelector("p") || node).trim().replace(/^\*([\s\S]*)\*$/, "$1").replace(/^[“"]|[”"]$/g, ""), attribution: (node.querySelector("footer, cite")?.textContent || block.attribution || "").replace(/^—\s*/, "") };
    return { ...block, type: "paragraph", text: inlineText(node).trim() };
  });
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
