export function shouldSkipProyectoResourceNode({ className = "", innerHtml = "" } = {}) {
  const classText = String(className || "").trim().toLowerCase();
  const html = String(innerHtml || "");

  if (/(^|\s)(project-phases|phase)(\s|$)/i.test(classText)) {
    return true;
  }

  if (
    /class\s*=\s*["'][^"']*\bproject-phases\b/i.test(html)
    || /class\s*=\s*["'][^"']*\bphase\b/i.test(html)
  ) {
    return true;
  }

  if (/<h3[^>]*>\s*Lectura generadora\s*<\/h3>/i.test(html)) {
    return true;
  }

  if (/<h3[^>]*>\s*Preguntas de comprensi[oó]n\s*<\/h3>/i.test(html)) {
    return true;
  }

  return false;
}
