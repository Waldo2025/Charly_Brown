import {sanitizeHtml} from "./security-utils.js";

export function renderSafePreview(host,html=""){
  const root=host.shadowRoot||host.attachShadow({mode:"open"});
  const style=document.createElement("style");
  style.textContent=":host{display:block}article{font:15px/1.6 system-ui;padding:16px;overflow-wrap:anywhere;color:#182033}img{max-width:100%;height:auto}";
  const content=document.createElement("article");
  content.innerHTML=sanitizeHtml(html);
  root.replaceChildren(style,content);
}
