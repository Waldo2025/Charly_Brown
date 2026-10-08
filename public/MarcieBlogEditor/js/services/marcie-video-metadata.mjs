const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function videoId(value = "") {
  try {
    const url = new URL(String(value));
    if (!/^(?:www\.)?(?:youtube\.com|m\.youtube\.com|youtu\.be)$/.test(url.hostname)) return "";
    const id = url.hostname === "youtu.be" ? url.pathname.slice(1).split("/")[0] : url.searchParams.get("v");
    return VIDEO_ID.test(id || "") ? id : "";
  } catch (_) { return ""; }
}

function sourceId(value = {}) {
  const id = String(value.videoId || value.id || "").replace(/^youtube-/, "");
  return VIDEO_ID.test(id) ? id : videoId(value.url || value.finalUrl);
}

function genericTitle(value = "") {
  return !String(value || "").trim() || /^Video de YouTube\s+[A-Za-z0-9_-]{11}$/i.test(String(value).trim());
}

function missingChannel(value = {}) {
  return !String(value.channel || "").trim() || /canal no identificado/i.test(String(value.channel));
}

function eachVideoRecord(session, visit) {
  const eachSources = owner => {
    if (!owner || typeof owner !== "object") return;
    for (const key of ["usedSources", "sources", "supplementarySources", "researchSources", "bibliographySources"]) {
      for (const source of Array.isArray(owner[key]) ? owner[key] : []) {
        if (source?.sourceType === "youtube_video" || sourceId(source)) visit(source);
      }
    }
  };
  eachSources(session.videoResearch);
  for (const video of session.videoResearch?.videos || []) {
    visit(video);
    if (video.bibliographySource) visit(video.bibliographySource);
  }
  const articles = [session.article, ...Object.values(session.articlesByAudience || {})];
  for (const article of articles) {
    eachSources(article);
    eachSources(article?.researchDossier);
  }
  for (const dossier of Object.values(session.researchByAudience || {})) eachSources(dossier);
}

export function videosNeedingMetadata(session) {
  const found = new Map();
  eachVideoRecord(session, source => {
    const id = sourceId(source);
    if (!id) return;
    if (genericTitle(source.title) || missingChannel(source) || !String(source.publishedAt || source.datePublished || "").trim()) {
      found.set(id, `https://www.youtube.com/watch?v=${id}`);
    }
  });
  return [...found.values()].slice(0, 5);
}

export function mergeVideoMetadata(session, videos = []) {
  const byId = new Map(videos.filter(video => VIDEO_ID.test(String(video?.videoId || ""))).map(video => [video.videoId, video]));
  let changed = false;
  eachVideoRecord(session, source => {
    const metadata = byId.get(sourceId(source));
    if (!metadata) return;
    const assign = (key, value) => {
      if (value && source[key] !== value) { source[key] = value; changed = true; }
    };
    if (genericTitle(source.title)) assign("title", metadata.title);
    if (missingChannel(source) && metadata.channel) {
      assign("channel", metadata.channel);
      const author = Array.isArray(source.authors) ? source.authors[0] : source.author;
      if (!author || /^(?:YouTube|\[?Canal no identificado\]?)$/i.test(String(author).trim())) assign("authors", [metadata.channel]);
    }
    if (!source.publishedAt && !source.datePublished) assign("publishedAt", metadata.publishedAt);
  });
  return changed;
}
