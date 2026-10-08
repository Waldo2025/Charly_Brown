const ALLOWED_TAGS = new Set(['p', 'br', 'strong', 'em', 'b', 'i', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'hr', 'div', 'button', 'table', 'thead', 'tbody', 'tr', 'th', 'td']);

export function sanitizeMarkdownHtml(html = '') {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  const visit = (parent) => {
    for (const node of [...parent.childNodes]) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = node.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        if (['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form'].includes(tag)) node.remove();
        else { visit(node); node.replaceWith(...node.childNodes); }
        continue;
      }
      for (const attr of [...node.attributes]) {
        const name = attr.name.toLowerCase();
        const href = tag === 'a' && name === 'href' && /^https?:\/\//i.test(attr.value.trim());
        const plan = tag === 'button' && name === 'data-plan-option';
        const cosmetic = (tag === 'div' || tag === 'button') && name === 'class' && /^cb-plan-options?$/.test(attr.value);
        if (!href && !plan && !cosmetic) node.removeAttribute(attr.name);
      }
      if (tag === 'a') node.setAttribute('rel', 'noopener noreferrer');
      visit(node);
    }
  };
  visit(template.content);
  return template.innerHTML;
}
