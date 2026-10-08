import { installScriptCopyButtons } from './video-script-copy.js';

let activeDialog;

/** A resource is a draft until its asynchronous approval has been persisted. */
export function openResourceReview({ title = 'Revisar recurso', html = '', approved = false, onApprove, onRegenerate, onEdit, onSave } = {}) {
  activeDialog?.close();
  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'cb-resource-review cb-modal-panel';
  dialog.setAttribute('aria-labelledby', 'cbResourceReviewTitle');
  dialog.innerHTML = `<header class="cb-modal-header"><div><p class="cb-panel-kicker">${approved ? 'Aprobado · Sigue editando' : 'Material de la actividad · Por aprobar'}</p><h2 id="cbResourceReviewTitle"></h2></div><button type="button" class="cb-modal-close" aria-label="Cerrar">×</button></header><div class="cb-resource-review-body"><div class="cb-resource-review-tools"></div><div class="cb-approved-html cb-resource-review-content"></div></div><footer class="cb-modal-footer"><p role="status" aria-live="polite"></p><div class="cb-resource-review-actions"></div></footer>`;
  dialog.querySelector('h2').textContent = title;
  const content = dialog.querySelector('.cb-resource-review-content');
  content.innerHTML = html;
  const status = dialog.querySelector('[role="status"]');
  const actions = dialog.querySelector('.cb-resource-review-actions');
  let busy = false;
  const action = (label, callback, primary = false, host = actions) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `cb-chip-action${primary ? ' cb-chip-action--primary' : ''}`;
    button.textContent = label;
    button.onclick = async () => {
      if (busy) return;
      busy = true;
      dialog.setAttribute('aria-busy', 'true');
      dialog.querySelectorAll('button').forEach(item => { item.disabled = true; });
      status.textContent = 'Guardando…';
      try { await callback(); }
      catch (error) { status.textContent = error.message || 'No se pudo completar. Inténtalo de nuevo.'; }
      finally {
        busy = false;
        dialog.removeAttribute('aria-busy');
        dialog.querySelectorAll('button').forEach(item => { item.disabled = false; });
      }
    };
    host.append(button);
  };
  if (onEdit) action('Editar contenido', async () => { dialog.close(); onEdit(); });
  if (onRegenerate) action('Regenerar', async () => { status.textContent = 'El especialista está regenerando el recurso…'; await onRegenerate(); dialog.close(); });
  if (!approved && onApprove) action('Aprobar y pasar al panel', async () => { await onApprove(); dialog.close(); }, true);
  if (approved) action('Listo', () => dialog.close(), true);
  if (onSave && content.querySelector('img')) {
    const tools = dialog.querySelector('.cb-resource-review-tools');
    const images = [...content.querySelectorAll('img')];
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Imagen para editar');
    images.forEach((img, index) => select.add(new Option(img.alt || `Imagen ${index + 1}`, String(index))));
    tools.append(select);
    const saveImage = async source => {
      const img = images[Number(select.value)];
      const before = img.src;
      try {
        img.src = source;
        await img.decode();
        const savedContent = content.cloneNode(true);
        savedContent.querySelectorAll('[data-copy-video-script]').forEach(button => button.remove());
        if (savedContent.innerHTML.length > 110000) throw new Error('El recurso es demasiado grande. Usa una imagen más pequeña.');
        await onSave(savedContent.innerHTML);
        status.textContent = 'Imagen actualizada. Puedes seguir editando el recurso.';
      } catch (error) { img.src = before; throw error; }
    };
    const transformImage = async flip => {
      const original = images[Number(select.value)];
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = original.src;
      await image.decode();
      const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.round(image.naturalWidth * scale), height = Math.round(image.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = flip ? width : height;
      canvas.height = flip ? height : width;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (flip) { ctx.translate(width, 0); ctx.scale(-1, 1); }
      else { ctx.translate(height, 0); ctx.rotate(Math.PI / 2); }
      ctx.drawImage(image, 0, 0, width, height);
      let source;
      for (const quality of [.85, .65, .4, .2]) {
        source = canvas.toDataURL('image/jpeg', quality);
        if (source.length < 90000) break;
      }
      await saveImage(source);
    };
    action('Girar imagen', () => transformImage(false), false, tools);
    action('Reflejar imagen', () => transformImage(true), false, tools);
    const file = document.createElement('input');
    file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp'; file.hidden = true;
    tools.append(file);
    action('Editar imagen: reemplazar', () => { file.click(); status.textContent = 'Elige una imagen PNG, JPEG o WebP (máximo 80 KB).'; }, false, tools);
    file.onchange = async () => {
      const selected = file.files?.[0];
      if (!selected) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) || selected.size > 80000) {
        status.textContent = 'Usa PNG, JPEG o WebP de hasta 80 KB.'; return;
      }
      try {
        const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(selected); });
        await saveImage(data);
      } catch (error) { status.textContent = error.message || 'No se pudo guardar la imagen.'; }
      file.value = '';
    };
  }
  installScriptCopyButtons(content);
  dialog.querySelector('.cb-modal-close').onclick = () => dialog.close();
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => { dialog.remove(); if (activeDialog === dialog) activeDialog = null; previousFocus?.focus(); }, { once: true });
  document.body.append(dialog);
  activeDialog = dialog;
  dialog.showModal();
  return dialog;
}
