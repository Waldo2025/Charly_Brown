export function normalizeStylizedPreviewAsset(raw = null, fallbackKind = "video") {
  if (!raw || typeof raw !== "object") return null;
  const storagePath = String(raw.storagePath || "").trim();
  const mimeType = String(raw.mimeType || "").trim().toLowerCase();
  const explicitType = String(raw.type || raw.mediaKind || fallbackKind || "").trim().toLowerCase();
  const proxyKind = explicitType === "image" || mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(storagePath)
    ? "image" : "media";
  const src = String(raw.downloadUrl || raw.url || raw.dataUrl || (storagePath ? `/api/assets/proxy-${proxyKind}?storagePath=${encodeURIComponent(storagePath)}` : "")).trim();
  if (!src) return null;
  const combined = `${src} ${storagePath}`.toLowerCase();
  const isImage = explicitType === "image" || mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif)(\?|$|\s)/i.test(combined);
  return { src, kind: isImage ? "image" : "video", mimeType };
}

export function resolveStylizedScenePreviewMedia(session = null, rowId = "") {
  const key = String(rowId || "").trim();
  if (!session || !key) return null;
  const selected = session?.podcastVideoConfig?.timelineClipsByRowId?.[key] || session?.timelineClipMap?.[key] || null;
  const selectedSegments = Array.isArray(selected?.segments) ? selected.segments.filter(Boolean) : [];
  const selectedAsset = selectedSegments.find((item) => normalizeStylizedPreviewAsset(item, selected?.type || "video")) || selected;
  const fromSelected = normalizeStylizedPreviewAsset(selectedAsset, selected?.type || "video");
  if (fromSelected) return fromSelected;

  const clip = session?.dialogueVideoMap?.[key] && typeof session.dialogueVideoMap[key] === "object"
    ? session.dialogueVideoMap[key] : null;
  const segments = Array.isArray(clip?.segments) ? clip.segments.filter(Boolean) : [];
  const primarySegment = segments.find((item) => normalizeStylizedPreviewAsset(item, clip?.type || "video")) || clip;
  const fromClip = normalizeStylizedPreviewAsset(primarySegment, clip?.type || "video");
  if (fromClip) return fromClip;

  const imageList = Array.isArray(session?.rowReferenceImageListMap?.[key]) ? session.rowReferenceImageListMap[key] : [];
  const fromImage = normalizeStylizedPreviewAsset(imageList[0] || session?.rowReferenceImageMap?.[key], "image");
  if (fromImage) return fromImage;
  return normalizeStylizedPreviewAsset(session?.rowReferenceVideoMap?.[key], "video");
}
