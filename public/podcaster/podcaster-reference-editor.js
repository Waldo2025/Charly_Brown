import { createRegionEditor, buildLocalizedEditPrompt, buildLocalizedTextEditPrompt, buildTextRemovalPrompt } from "../imagecreator/region-editor.js?v=reference-edit-2";
import { dataUrlToAttachment, resultImageToAttachment } from "../imagecreator/attachments.js";
import { createDefaultImageCreatorOptions } from "../imagecreator/constants.js";
import { overlayExactTextOnImage } from "../imagecreator/text-overlay.js";
import { getPodcasterLocalMediaBlob, putPodcasterLocalMediaBlob, getPodcasterLocalMediaDataUrl } from "./podcaster-local-media-cache.js";
import { captureReferenceEdit, referenceIdentity, referenceList, referenceScope } from "./podcaster-reference-edit-state.js?v=reference-edit-2";

export async function generateReferenceEdit(source, edit, generate = null) {
  // Only generation needs the API/auth dependency tree; the viewer does not.
  if (!generate) ({ generateImagesViaGemini: generate } = await import("../imagecreator/api.js"));
  const attachments = [await resultImageToAttachment({ dataUrl: source, fileName: "imagen-original" }, { maxDimension: 3072, targetBytes: 3 * 1024 * 1024 })];
  let prompt = String(edit.instruction || "").trim();
  if (edit.annotatedDataUrl) {
    attachments.push(await dataUrlToAttachment(edit.annotatedDataUrl, { name: "zona-marcada", source: "region-markup" }));
    prompt = edit.editorMode === "text"
      ? edit.textRenderMode === "exact" ? buildTextRemovalPrompt(edit) : buildLocalizedTextEditPrompt(edit)
      : buildLocalizedEditPrompt(prompt, edit.tool);
  }
  if (!prompt) throw new Error("Describe el cambio que quieres realizar.");
  const results = await generate({ mode: "edit", prompt, attachments, options: { ...createDefaultImageCreatorOptions(), mode: "edit", count: 1 } });
  const result = results[0];
  if (!result?.dataUrl?.startsWith("data:image/")) throw new Error("No se recibió una imagen válida. Puedes reintentarlo.");
  return edit.editorMode === "text" && edit.textRenderMode === "exact"
    ? { ...result, ...await overlayExactTextOnImage(result.dataUrl, { text: edit.newText, bounds: edit.regionBounds, fontStyle: edit.fontStyle, color: edit.textColor }) }
    : result;
}

const markup = `
  <nav class="snoopy-reference-gallery" aria-label="Galería de referencias">
    <button type="button" data-ref="previous" aria-label="Referencia anterior">←</button>
    <span data-ref="position"></span>
    <button type="button" data-ref="next" aria-label="Referencia siguiente">→</button>
    <button type="button" data-ref="edit" class="snoopy-reference-float" aria-label="Editar imagen" title="Editar imagen"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19H5v-7L16 1l7 7-11 11ZM14 3l7 7M5 12l7 7"/></svg></button>
    <button type="button" data-ref="dismiss" class="snoopy-reference-float" aria-label="Cerrar imagen" title="Cerrar imagen"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    <button type="button" data-ref="restore" hidden>Restaurar original</button>
    <button type="button" data-ref="pending" hidden>Resultado pendiente</button>
  </nav>
  <section data-ref="workspace" class="snoopy-reference-workspace" hidden>
    <div class="snoopy-reference-modes">
      <button type="button" data-ref="back" aria-label="Volver a la imagen" title="Volver a la imagen"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7"/></svg></button>
      <button type="button" data-ref="general">Imagen completa</button>
      <button type="button" data-ref="region">Marcar zona</button>
      <button type="button" data-ref="text">Editar texto</button>
    </div>
    <div data-ref="generalPanel" class="snoopy-reference-prompt">
      <textarea data-ref="instruction" rows="3" aria-label="Instrucciones para editar la imagen" placeholder="Describe los cambios que quieres hacer en esta imagen…"></textarea>
      <button type="button" data-ref="generate" class="snoopy-reference-primary">Generar cambios</button>
    </div>
    <section data-ref="regionRoot" class="snoopy-reference-region hidden" aria-label="Edición por zonas">
      <div class="snoopy-reference-tools" role="toolbar" aria-label="Herramientas de marcado">
        <button type="button" data-region-tool="pencil" aria-label="Lápiz" title="Lápiz"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5"/></svg></button><button type="button" data-region-tool="marker" aria-label="Marcador" title="Marcador"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 3 7 7-9 9-7-7 9-9ZM5 12l-2 5 4 4 5-2M2 22h9"/></svg></button>
        <button type="button" data-ref="undo" aria-label="Deshacer" title="Deshacer"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10h10a7 7 0 0 1 0 14M8 5l-5 5 5 5"/></svg></button><button type="button" data-ref="clear" aria-label="Limpiar marcas" title="Limpiar marcas"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 3 6 6-11 12H5l-4-4L15 3ZM8 10l8 8M10 21h12"/></svg></button>
      </div>
      <canvas data-ref="canvas" tabindex="0" aria-label="Imagen de referencia: dibuja sobre la zona que quieres cambiar"></canvas>
      <p data-ref="regionStatus" role="status"></p>
      <div data-ref="regionPrompt" class="snoopy-reference-prompt hidden">
        <label class="ic-region-instruction">¿Qué quieres cambiar?<textarea data-ref="regionInstruction" rows="2"></textarea></label>
        <div data-ref="textFields" class="snoopy-reference-text-fields hidden">
          <label>Texto actual (opcional)<input data-ref="currentText" type="text"></label>
          <label>Texto nuevo<input data-ref="newText" type="text"></label>
          <label>Estilo<select data-ref="font"><option value="sans">Sans serif</option><option value="serif">Serif</option><option value="display">Gruesa</option><option value="handwritten">Manuscrita</option></select></label>
          <label>Color<input data-ref="color" type="color" value="#ffffff"></label>
          <label><input type="radio" name="snoopyReferenceTextMode" value="integrated" checked> Integrado en la imagen</label>
          <label><input type="radio" name="snoopyReferenceTextMode" value="exact"> Texto exacto</label>
        </div>
        <button type="button" data-ref="regionApply" class="snoopy-reference-primary">Generar cambios</button>
      </div>
    </section>
  </section>
  <section data-ref="comparison" class="snoopy-reference-comparison" hidden>
    <div class="snoopy-reference-compare-images"><figure><figcaption>Original</figcaption><img data-ref="original" alt="Referencia original"></figure><figure><figcaption>Resultado</figcaption><img data-ref="result" alt="Resultado de la edición"></figure></div>
    <div class="snoopy-reference-toolbar"><button type="button" data-ref="adjust">Ajustar instrucciones</button><a data-ref="download" download="referencia-editada.png">Descargar resultado</a><button type="button" data-ref="apply" class="snoopy-reference-primary">Usar como referencia</button></div>
  </section>
  <p data-ref="status" class="snoopy-reference-status" role="status" aria-live="polite"></p>`;

export function createReferenceEditor(viewer, deps) {
  const card = viewer.querySelector(".podcast-portrait-viewer-card");
  const stage = viewer.querySelector(".podcast-portrait-viewer-stage");
  const image = stage.querySelector("img");
  const panel = document.createElement("div");
  panel.className = "snoopy-reference-editor";
  panel.hidden = true;
  panel.innerHTML = markup;
  card.append(panel);
  const el = name => panel.querySelector(`[data-ref="${name}"]`);
  const sidebar = document.createElement("aside");
  sidebar.className = "snoopy-reference-sidebar";
  sidebar.setAttribute("aria-label", "Chat de edición de imagen");
  const chat = document.createElement("div");
  chat.className = "snoopy-reference-chat";
  chat.setAttribute("role", "log");
  chat.setAttribute("aria-label", "Conversación de edición");
  const greeting = document.createElement("p");
  greeting.textContent = "¿Qué quieres cambiar? Describe tu idea o marca una zona de la imagen.";
  chat.append(greeting);
  const tools = panel.querySelector(".snoopy-reference-tools");
  sidebar.append(panel.querySelector(".snoopy-reference-modes"), chat, tools, el("generalPanel"), el("regionStatus"), el("regionPrompt"), el("status"));
  el("workspace").append(sidebar);

  let view = null, draft = null, busy = false, epoch = 0, mode = "gallery";
  const sources = new Map();
  const drafts = new Map();
  const draftKey = target => `reference-edit:${target.ownerUid}:${target.sessionId}:${target.threadId}:${target.rowId}`;
  const currentKey = () => view && draftKey(view);
  const setStatus = (message, error = false) => { el("status").textContent = message; el("status").classList.toggle("is-error", error); };
  const friendlyError = error => String(error?.message || "No se pudo completar la edición. Puedes reintentarlo.").replace(/Gemini(?:\s+[\d.]+(?:\s+Pro\s+Image)?)?/gi, "el servicio de edición");
  function reflectBusy() {
    panel.setAttribute("aria-busy", String(busy));
    for (const name of ["edit", "generate", "region", "text", "general", "restore", "apply", "adjust", "undo", "clear", "regionApply"]) el(name).disabled = busy;
  }
  function showMode(next) {
    mode = next;
    viewer.dataset.referenceMode = next;
    el("dismiss").hidden = next !== "gallery";
    sidebar.hidden = next === "gallery" || next === "compare";
    (next === "gallery" || next === "compare" ? panel : sidebar).append(el("status"));
    tools.hidden = next !== "region" && next !== "text";
    el("regionStatus").hidden = next !== "region" && next !== "text";
    el("regionPrompt").hidden = next !== "region" && next !== "text";
    for (const name of ["general", "region", "text"]) el(name).setAttribute("aria-pressed", String(next === name));
    stage.hidden = next === "compare" || next === "region" || next === "text";
    el("workspace").hidden = next === "gallery" || next === "compare";
    el("generalPanel").hidden = next !== "general";
    el("comparison").hidden = next !== "compare";
    if (next !== "region" && next !== "text") region.close({ restoreFocus: false });
  }
  async function sourceData(record) {
    const key = [record.storagePath || record.downloadUrl || record.localMediaCacheKey || record.dataUrl, record.referenceRevision || record.updatedAt || ""].join("|");
    if (!sources.has(key)) sources.set(key, (async () => {
      if (record.dataUrl?.startsWith("data:image/")) return record.dataUrl;
      if (record.localMediaCacheKey && !record.storagePath) {
        const cached = await getPodcasterLocalMediaDataUrl(record.localMediaCacheKey).catch(() => "");
        if (cached?.startsWith("data:image/")) return cached;
      }
      const response = await deps.fetchImage(record);
      if (!response.ok) throw new Error("No se pudo cargar la imagen original.");
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) throw new Error("El recurso no contiene una imagen válida.");
      return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
    })().catch(error => { sources.delete(key); throw error; }));
    return sources.get(key);
  }
  async function saveDraft(value) {
    const key = draftKey(value.context);
    drafts.set(key, value);
    await putPodcasterLocalMediaBlob(key, new Blob([JSON.stringify(value)], { type: "application/json" }));
  }
  function compare(value) {
    draft = value;
    el("original").src = value.source;
    el("result").src = value.result.dataUrl;
    el("download").href = value.result.dataUrl;
    el("download").download = `referencia-editada.${value.result.mimeType?.includes("jpeg") ? "jpg" : value.result.mimeType?.includes("webp") ? "webp" : "png"}`;
    showMode("compare");
    el("pending").hidden = false;
    reflectBusy();
    if (!busy) el("apply").focus();
  }
  async function generate(edit) {
    if (busy || !view) return;
    const origin = { ...view }, token = epoch;
    const record = origin.record;
    // The canvas and request must refer to the same immutable selection.
    const context = { ...origin.context, requestId: crypto.randomUUID() };
    const message = document.createElement("p");
    message.className = "is-user";
    message.textContent = edit.instruction || (edit.newText ? `Cambiar el texto por «${edit.newText}»` : "Editar la zona marcada");
    chat.append(message);
    chat.scrollTop = chat.scrollHeight;
    busy = true; reflectBusy(); setStatus("Generando cambios… Puedes cerrar el visor; el resultado se conservará.");
    try {
      const source = await sourceData(record);
      const result = await generateReferenceEdit(source, edit, deps.generate);
      const value = { context, original: record, source, result, edit };
      let cached = true;
      try { await saveDraft(value); } catch (_) { cached = false; }
      if (epoch === token && view) {
        compare(value);
        setStatus(cached ? "Revisa el resultado antes de usarlo como referencia." : "Resultado listo. No se pudo guardar la copia local; descarga la imagen antes de recargar.", !cached);
      } else if (currentKey() === draftKey(context)) {
        draft = value; el("pending").hidden = false; setStatus("La edición terminó. Abre Resultado pendiente para revisarla.");
      }
    } catch (error) { if (epoch === token) setStatus(friendlyError(error), true); }
    finally { busy = false; reflectBusy(); if (epoch === token && mode === "compare") el("apply").focus(); }
  }
  const region = createRegionEditor({
    regionEditor: el("regionRoot"), regionCanvas: el("canvas"), regionInstruction: el("regionInstruction"), regionStatus: el("regionStatus"),
    regionApplyBtn: el("regionApply"), regionToolButtons: [...panel.querySelectorAll("[data-region-tool]")], regionUndoBtn: el("undo"), regionClearBtn: el("clear"),
    regionPromptPanel: el("regionPrompt"), regionTextFields: el("textFields"), regionCurrentText: el("currentText"), regionNewText: el("newText"),
    regionFontStyle: el("font"), regionTextColor: el("color"), regionTextModeInputs: [...panel.querySelectorAll('[name="snoopyReferenceTextMode"]')]
  }, { onApply: generate, embedded: true });
  async function startEdit(next = "general") {
    if (!view || busy) return;
    const token = epoch;
    if (next === "general") { showMode(next); el("instruction").focus(); return; }
    busy = true; reflectBusy(); setStatus("Preparando imagen…");
    try {
      const source = await sourceData(view.record);
      if (token !== epoch) return;
      showMode(next);
      await region.open({ dataUrl: source, mode: next, trigger: el(next) });
      if (token !== epoch) region.close({ restoreFocus: false });
      else setStatus("");
    } catch (error) { if (token === epoch) setStatus(friendlyError(error), true); }
    finally { busy = false; reflectBusy(); }
  }
  async function apply(value) {
    if (busy || !value) return;
    const token = epoch;
    busy = true; reflectBusy(); setStatus("Guardando referencia…");
    try {
      const result = await deps.apply(value);
      if (result.status !== "applied") throw new Error(result.message);
      drafts.delete(draftKey(value.context));
      await putPodcasterLocalMediaBlob(draftKey(value.context), new Blob(["null"], { type: "application/json" })).catch(() => {});
      if (token === epoch) {
        const scope = referenceScope(deps.getSession(value.context.sessionId), value.context.threadId);
        const index = referenceList(scope, value.context.rowId).findIndex(item => item.referenceEditId === value.context.requestId);
        const activeView = { ...view, index: index < 0 ? view.index : index };
        await open(activeView);
        setStatus("Referencia actualizada.");
      }
    } catch (error) {
      // Preserve uploaded resource and generated pixels for a save-only retry.
      await saveDraft(value).catch(() => {});
      if (token === epoch) setStatus(friendlyError(error), true);
    } finally { busy = false; reflectBusy(); }
  }
  async function open(target) {
    const token = ++epoch;
    view = { ...target, ownerUid: target.ownerUid || deps.uid() };
    const scope = referenceScope(deps.getSession(view.sessionId), view.threadId);
    const list = referenceList(scope, view.rowId);
    view.index = Math.max(0, Math.min(list.length - 1, Number(view.index) || 0));
    view.record = list[view.index];
    if (!view.record) { close(); return; }
    view.context = { ...captureReferenceEdit({ ...scope, id: view.sessionId, activeThreadId: view.threadId }, view.rowId, view.index, ""), ownerUid: view.ownerUid };
    image.removeAttribute("src");
    const previewSource = String(await Promise.resolve(deps.preview(view.record)) || "").trim();
    if (token !== epoch) return;
    if (!previewSource) throw new Error("No se pudo cargar la imagen de referencia.");
    draft = null;
    viewer.classList.add("has-reference-editor");
    card.setAttribute("aria-label", "Imagen de referencia");
    panel.hidden = false;
    image.src = previewSource;
    image.alt = view.record.name || "Imagen de referencia";
    viewer.querySelector("#podcastPortraitViewerTitle").textContent = "Imagen de referencia";
    viewer.querySelector("#podcastPortraitViewerMeta").textContent = `Escena ${view.sceneNumber || ""}`;
    for (const name of ["position", "previous", "next"]) el(name).hidden = list.length < 2;
    chat.replaceChildren(greeting);
    el("position").textContent = `${view.index + 1} de ${list.length}`;
    el("previous").disabled = view.index <= 0;
    el("next").disabled = view.index >= list.length - 1;
    el("restore").hidden = !view.record.referenceEditHistory?.length;
    el("pending").hidden = true;
    showMode("gallery"); setStatus(""); reflectBusy();
    let saved = drafts.get(currentKey());
    if (!saved) try { const blob = await getPodcasterLocalMediaBlob(currentKey()); saved = blob && JSON.parse(await blob.text()); } catch (_) { }
    if (token !== epoch) return;
    if (saved?.result) { draft = saved; el("pending").hidden = false; setStatus("Hay un resultado pendiente de aplicar en esta escena."); }
  }
  function close() {
    ++epoch; view = null; draft = null;
    panel.hidden = true; stage.hidden = false; region.close({ restoreFocus: false });
    viewer.classList.remove("has-reference-editor");
    delete viewer.dataset.referenceMode;
    card.setAttribute("aria-label", "Visor de retrato");
  }
  const on = (name, action) => el(name).addEventListener("click", () => Promise.resolve().then(action).catch(error => setStatus(friendlyError(error), true)));
  on("dismiss", () => viewer.querySelector(".podcast-portrait-viewer-head button")?.click());
  on("edit", () => startEdit()); on("general", () => startEdit()); on("region", () => startEdit("region")); on("text", () => startEdit("text"));
  on("generate", () => generate({ instruction: el("instruction").value }));
  on("back", () => { showMode("gallery"); el("edit").focus(); });
  on("adjust", () => {
    if (!draft || busy) return;
    // A pending result may belong to another image in this scene's gallery.
    view = { ...view, ...draft.context, context: draft.context, record: draft.original };
    const list = referenceList(referenceScope(deps.getSession(view.sessionId), view.threadId), view.rowId);
    const index = list.findIndex(item => referenceIdentity(item) === draft.context.identity);
    if (index >= 0) view.index = index;
    image.src = draft.source;
    el("instruction").value = draft.edit?.instruction || (draft.edit?.newText ? `Cambiar el texto por «${draft.edit.newText}»` : "");
    return startEdit();
  });
  on("previous", () => open({ ...view, index: view.index - 1 })); on("next", () => open({ ...view, index: view.index + 1 }));
  on("pending", () => draft && compare(draft)); on("apply", () => apply(draft));
  on("restore", async () => {
    const origin = { ...view }, token = epoch;
    const previous = origin.record.referenceEditHistory[0];
    const context = { ...origin.context, requestId: crypto.randomUUID() };
    busy = true; reflectBusy();
    try {
      const [source, dataUrl] = await Promise.all([sourceData(origin.record), sourceData(previous)]);
      if (token !== epoch) return;
      const value = { context, original: origin.record, source, result: { ...previous, dataUrl } };
      await saveDraft(value); compare(value); setStatus("Revisa la imagen original y pulsa Usar como referencia para restaurarla.");
    } finally { busy = false; reflectBusy(); }
  });
  viewer.addEventListener("keydown", event => {
    if (!view || panel.hidden) return;
    if (event.key === "Escape" && mode !== "gallery") { event.preventDefault(); event.stopImmediatePropagation(); showMode("gallery"); el("edit").focus(); return; }
    const typing = /INPUT|TEXTAREA|SELECT|CANVAS/.test(event.target.tagName);
    if (!typing && mode === "gallery" && /ArrowLeft|ArrowRight/.test(event.key)) {
      const button = el(event.key === "ArrowLeft" ? "previous" : "next");
      if (!button.disabled) { event.preventDefault(); button.click(); }
    }
    if (event.key === "Tab") {
      const focusable = [...card.querySelectorAll('button:not(:disabled), a[href], input, textarea, select, canvas[tabindex]')].filter(node => node.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }, true);
  return { open, close };
}
