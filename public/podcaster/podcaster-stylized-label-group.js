const TEXT_TYPES = new Set(['i-text', 'text', 'textbox']);

export function getSelectedStylizedText(canvas) {
  const selected = canvas?.getActiveObject?.();
  if (TEXT_TYPES.has(selected?.type)) return selected;
  if (selected?.type === 'group' && selected.assetRole === 'label-group') {
    return selected.getObjects().find((item) => TEXT_TYPES.has(item.type)) || null;
  }
  return null;
}

export function refreshStylizedTextGroup(text, canvas) {
  if (text?.group?.assetRole === 'label-group') text.group.addWithUpdate();
  text?.setCoords?.();
  canvas?.requestRenderAll?.();
}

export function detachSelectedStylizedLabel(canvas) {
  const selected = canvas?.getActiveObject?.();
  if (selected?.assetRole === 'label-background') {
    canvas.remove(selected);
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    return null;
  }
  if (selected?.type === 'group' && selected.assetRole === 'label-group') {
    const children = selected.getObjects();
    const text = children.find((item) => TEXT_TYPES.has(item.type)) || null;
    const label = children.find((item) => item.assetRole === 'label-background') || null;
    selected.toActiveSelection();
    canvas.discardActiveObject();
    if (label) canvas.remove(label);
    if (text) canvas.setActiveObject(text);
    canvas.requestRenderAll();
    return text;
  }
  return getSelectedStylizedText(canvas);
}

export function attachStylizedLabel(canvas, fabricApi, label, text) {
  if (!canvas || !fabricApi?.Group || !label || !text) return null;
  canvas.discardActiveObject();
  canvas.remove(label, text);
  const group = new fabricApi.Group([label, text], {
    assetRole: 'label-group',
    labelTemplate: label.labelTemplate || 'png',
    objectCaching: false
  });
  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();
  return group;
}

export function countStylizedImageObjects(objects = []) {
  return (Array.isArray(objects) ? objects : []).reduce((count, item) =>
    count + (item?.type === 'image' ? 1 : 0) + countStylizedImageObjects(item?.objects), 0);
}
