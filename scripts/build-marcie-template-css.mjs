import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("public/MarcieBlogEditor/js/editor-app.js", "utf8");
const templatesStart = source.indexOf("const ARTICLE_TEMPLATES = Object.freeze(");
const templatesEnd = source.indexOf("function getArticleTemplate(", templatesStart);
const stylesStart = source.indexOf("function articleTemplateStyle(", templatesEnd);
const stylesEnd = source.indexOf("function ensureArticleTemplateFont(", stylesStart);
if ([templatesStart, templatesEnd, stylesStart, stylesEnd].some((position) => position < 0)) throw new Error("No se encontraron las plantillas editoriales de Marcie.");

const context = vm.createContext({});
vm.runInContext(`${source.slice(templatesStart, templatesEnd)}\n${source.slice(stylesStart, stylesEnd)}\nglobalThis.templates = ARTICLE_TEMPLATES; globalThis.templateStyle = articleTemplateStyle; globalThis.sharedCss = getArticleTemplateSharedCss;`, context);
const rules = context.templates.map((template) => {
  if (!/^[a-z0-9-]+$/.test(template.id)) throw new Error("ID de plantilla inválido.");
  return `[data-article-template="${template.id}"], [data-article-template-option="${template.id}"] { ${context.templateStyle(template)} }`;
});
const css = `${context.sharedCss(".article-template-surface")}\n${rules.join("\n")}\n.article-template-card__line--short { width: 68%; }\n`;
fs.writeFileSync("public/MarcieBlogEditor/css/marcie-templates.css", css);
