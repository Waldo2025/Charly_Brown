const dns = require("node:dns").promises;
const net = require("node:net");

const DEFAULT_TIMEOUT_MS = 20_000;
const ALLOWED_AUDIENCES = new Set(["educators", "students", "parents", "coordinators"]);

function clampText(value, max = 500) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function escapeHtml(value = "") {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHttpsUrl(value = "") {
  try {
    const parsed = new URL(String(value || "").trim());
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch (_) {
    return "";
  }
}

function isPrivateIp(address = "") {
  const value = String(address || "").trim().toLowerCase();
  if (!value) return true;
  if (net.isIPv4(value)) {
    const octets = value.split(".").map(Number);
    return octets[0] === 10
      || octets[0] === 127
      || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
      || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 0 && [0, 2].includes(octets[2]))
      || (octets[0] === 192 && octets[1] === 168)
      || (octets[0] === 198 && [18, 19, 51].includes(octets[1]))
      || (octets[0] === 203 && octets[1] === 0 && octets[2] === 113)
      || octets[0] === 0
      || octets[0] >= 224;
  }
  if (net.isIPv6(value)) {
    return value === "::1"
      || value === "::"
      || value.startsWith("fc")
      || value.startsWith("fd")
      || value.startsWith("fe8")
      || value.startsWith("fe9")
      || value.startsWith("fea")
      || value.startsWith("feb")
      || value.startsWith("ff")
      || value.startsWith("2001:db8")
      || value.startsWith("::ffff:127.")
      || value.startsWith("::ffff:10.")
      || value.startsWith("::ffff:192.168.");
  }
  return true;
}

function normalizeWordPressBaseUrl(value = "", { allowInsecureLocal = false } = {}) {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch (_) {
    throw Object.assign(new Error("wordpress_base_url_invalid"), { status: 503, code: "wordpress_not_configured" });
  }
  const localHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(allowInsecureLocal && localHost && parsed.protocol === "http:")) {
    throw Object.assign(new Error("wordpress_https_required"), { status: 503, code: "wordpress_https_required" });
  }
  if ((localHost || parsed.hostname.endsWith(".local")) && !allowInsecureLocal) {
    throw Object.assign(new Error("wordpress_private_host_blocked"), { status: 503, code: "wordpress_private_host_blocked" });
  }
  parsed.username = "";
  parsed.password = "";
  parsed.search = "";
  parsed.hash = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed;
}

function readWordPressConfig(env = process.env) {
  let json = {};
  const rawJson = String(env.MARCIE_WORDPRESS_CONFIG_JSON || "").trim();
  if (rawJson) {
    try {
      json = JSON.parse(rawJson);
    } catch (_) {
      throw Object.assign(new Error("wordpress_config_json_invalid"), { status: 503, code: "wordpress_config_invalid" });
    }
  }
  const baseUrl = clampText(json.baseUrl || env.MARCIE_WORDPRESS_BASE_URL, 1000);
  const username = clampText(json.username || env.MARCIE_WORDPRESS_USERNAME, 240);
  const applicationPassword = String(json.applicationPassword || env.MARCIE_WORDPRESS_APPLICATION_PASSWORD || "").trim();
  const allowInsecureLocal = String(env.MARCIE_WORDPRESS_ALLOW_INSECURE_LOCAL || "").trim().toLowerCase() === "true";
  if (!baseUrl || !username || !applicationPassword) {
    return { configured: false, baseUrl: "", username: "", applicationPassword: "", allowInsecureLocal };
  }
  const parsed = normalizeWordPressBaseUrl(baseUrl, { allowInsecureLocal });
  return {
    configured: true,
    baseUrl: parsed.toString().replace(/\/+$/, ""),
    username,
    applicationPassword,
    allowInsecureLocal
  };
}

async function assertPublicWordPressHost(config, resolveHost = dns.lookup) {
  const parsed = normalizeWordPressBaseUrl(config.baseUrl, { allowInsecureLocal: config.allowInsecureLocal });
  const localAllowed = config.allowInsecureLocal && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (localAllowed) return parsed;
  if (net.isIP(parsed.hostname)) {
    if (isPrivateIp(parsed.hostname)) {
      throw Object.assign(new Error("wordpress_private_host_blocked"), { status: 403, code: "wordpress_private_host_blocked" });
    }
    return parsed;
  }
  let records;
  try {
    records = await resolveHost(parsed.hostname, { all: true, verbatim: true });
  } catch (_) {
    throw Object.assign(new Error("wordpress_dns_failed"), { status: 502, code: "wordpress_dns_failed" });
  }
  if (!Array.isArray(records) || !records.length || records.some((record) => isPrivateIp(record?.address))) {
    throw Object.assign(new Error("wordpress_private_host_blocked"), { status: 403, code: "wordpress_private_host_blocked" });
  }
  return parsed;
}

function normalizeAudience(value = "") {
  const audience = clampText(value, 40).toLowerCase();
  if (!ALLOWED_AUDIENCES.has(audience)) {
    throw Object.assign(new Error("marcie_audience_invalid"), { status: 400, code: "marcie_audience_invalid" });
  }
  return audience;
}

function slugify(value = "") {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180) || "articulo-marcie";
}

function buildPublicationSlug(sessionId = "", audience = "educators") {
  return slugify(`marcie-${clampText(sessionId, 100)}-${normalizeAudience(audience)}`);
}

function renderBlock(block = {}) {
  const type = clampText(block.type, 40);
  const text = escapeHtml(block.text || "");
  if (type === "heading") {
    const level = block.level === "h3" ? "h3" : "h2";
    return text ? `<${level}>${text}</${level}>` : "";
  }
  if (type === "paragraph") return text ? `<p>${text}</p>` : "";
  if (type === "bulletList" || type === "numberedList") {
    const tag = type === "numberedList" ? "ol" : "ul";
    const items = (Array.isArray(block.items) ? block.items : []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    return items ? `<${tag}>${items}</${tag}>` : "";
  }
  if (type === "quote") {
    const attribution = clampText(block.attribution, 500);
    return text ? `<blockquote><p>${text}</p>${attribution ? `<cite>${escapeHtml(attribution)}</cite>` : ""}</blockquote>` : "";
  }
  if (type === "callout") return text ? `<aside class="marcie-callout"><p>${text}</p></aside>` : "";
  if (type === "statistic") {
    const value = escapeHtml(block.value || "");
    const label = escapeHtml(block.label || block.text || "");
    return value || label ? `<figure class="marcie-statistic"><strong>${value}</strong>${label ? `<figcaption>${label}</figcaption>` : ""}</figure>` : "";
  }
  if (type === "definition") {
    const term = escapeHtml(block.term || "");
    return term && text ? `<dl><dt>${term}</dt><dd>${text}</dd></dl>` : "";
  }
  if (type === "question") return text ? `<p class="marcie-question"><strong>${text}</strong></p>` : "";
  if (type === "image") {
    const url = safeHttpsUrl(block.url || block.src || "");
    return url ? `<figure><img src="${escapeHtml(url)}" alt="${escapeHtml(block.alt || "")}" loading="lazy"></figure>` : "";
  }
  return text ? `<p>${text}</p>` : "";
}

function renderArticleToWordPressHtml(article = {}) {
  const subtitle = clampText(article.subtitle, 2000);
  const blocks = (Array.isArray(article.blocks) ? article.blocks : []).map(renderBlock).filter(Boolean).join("\n");
  const sources = (Array.isArray(article.sources) ? article.sources : [])
    .map((source) => {
      const url = safeHttpsUrl(source?.url || source?.canonicalUrl || "");
      if (!url) return "";
      const title = clampText(source?.apaCitation || source?.title || new URL(url).hostname, 1200);
      return `<li><a href="${escapeHtml(url)}" rel="noopener noreferrer">${escapeHtml(title)}</a></li>`;
    })
    .filter(Boolean);
  return [
    subtitle ? `<p class="marcie-article-lead"><em>${escapeHtml(subtitle)}</em></p>` : "",
    blocks,
    sources.length ? `<hr><section class="marcie-sources"><h2>Fuentes consultadas</h2><ul>${sources.join("")}</ul></section>` : ""
  ].filter(Boolean).join("\n");
}

function buildWordPressPostPayload({ article = {}, sessionId = "", audience = "educators", status = "draft", featuredMediaId = 0, categoryIds = [], tagIds = [] } = {}) {
  const normalizedAudience = normalizeAudience(audience);
  const allowedStatus = ["draft", "pending", "publish", "future"].includes(status) ? status : "draft";
  return {
    title: clampText(article.seo?.title || article.title, 500) || "Artículo educativo",
    content: renderArticleToWordPressHtml(article),
    excerpt: clampText(article.seo?.description || article.excerpt, 3000),
    slug: clampText(article.seo?.slug, 180) ? slugify(article.seo.slug) : buildPublicationSlug(sessionId, normalizedAudience),
    status: allowedStatus,
    ...(Number(featuredMediaId) > 0 ? { featured_media: Number(featuredMediaId) } : {}),
    ...(Array.isArray(categoryIds) && categoryIds.length ? { categories: categoryIds.map(Number).filter((id) => id > 0) } : {}),
    ...(Array.isArray(tagIds) && tagIds.length ? { tags: tagIds.map(Number).filter((id) => id > 0) } : {})
  };
}

function sanitizeRemotePost(post = {}) {
  return {
    id: Number(post.id || 0),
    status: clampText(post.status, 40),
    slug: clampText(post.slug, 220),
    link: safeHttpsUrl(post.link || ""),
    modifiedGmt: clampText(post.modified_gmt || post.modified || "", 80),
    title: clampText(post.title?.rendered || post.title?.raw || "", 500)
  };
}

class WordPressClient {
  constructor({ config, fetchImpl = globalThis.fetch, resolveHost = dns.lookup, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (!config?.configured) {
      throw Object.assign(new Error("wordpress_not_configured"), { status: 503, code: "wordpress_not_configured" });
    }
    if (typeof fetchImpl !== "function") throw new Error("fetch_unavailable");
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.resolveHost = resolveHost;
    this.timeoutMs = Math.max(1000, Math.min(60_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
  }

  async request(apiPath, { method = "GET", json = undefined, body = undefined, headers = {} } = {}) {
    const base = await assertPublicWordPressHost(this.config, this.resolveHost);
    const path = String(apiPath || "");
    if (!path.startsWith("/wp-json/wp/v2/")) throw new Error("wordpress_api_path_invalid");
    const url = new URL(path.replace(/^\/+/, ""), `${base.toString().replace(/\/+$/, "")}/`);
    if (url.origin !== base.origin) throw new Error("wordpress_api_origin_mismatch");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    const auth = Buffer.from(`${this.config.username}:${this.config.applicationPassword}`, "utf8").toString("base64");
    try {
      const response = await this.fetchImpl(url, {
        method,
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${auth}`,
          ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
          ...headers
        },
        ...(json !== undefined ? { body: JSON.stringify(json) } : body !== undefined ? { body } : {})
      });
      if (response.status >= 300 && response.status < 400) {
        throw Object.assign(new Error("wordpress_redirect_blocked"), { status: 502, code: "wordpress_redirect_blocked" });
      }
      const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();
      const data = contentType.includes("json")
        ? await response.json().catch(() => ({}))
        : { message: clampText(await response.text().catch(() => ""), 1000) };
      if (!response.ok) {
        const detail = clampText(data?.message || data?.code || `WordPress HTTP ${response.status}`, 1000);
        throw Object.assign(new Error(detail || "wordpress_request_failed"), {
          status: response.status === 401 || response.status === 403 ? 502 : Math.max(400, Math.min(599, response.status || 502)),
          code: `wordpress_http_${response.status || 502}`
        });
      }
      return data;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw Object.assign(new Error("wordpress_timeout"), { status: 504, code: "wordpress_timeout" });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async testConnection() {
    const user = await this.request("/wp-json/wp/v2/users/me?context=edit");
    const capabilities = user?.capabilities && typeof user.capabilities === "object" ? user.capabilities : {};
    const requiredCapabilities = ["edit_posts", "upload_files", "publish_posts", "manage_categories"];
    const missingCapabilities = requiredCapabilities.filter((capability) => capabilities[capability] !== true);
    if (missingCapabilities.length) {
      const error = Object.assign(new Error("wordpress_capabilities_missing"), {
        status: 403,
        code: "wordpress_capabilities_missing",
        missingCapabilities
      });
      throw error;
    }
    return {
      id: Number(user.id || 0),
      name: clampText(user.name, 240),
      slug: clampText(user.slug, 240),
      capabilities: Object.fromEntries(requiredCapabilities.map((capability) => [capability, true]))
    };
  }

  async uploadMedia({ buffer, filename = "marcie-portada.jpg", mimeType = "image/jpeg", altText = "" } = {}) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error("wordpress_media_buffer_required");
    const media = await this.request("/wp-json/wp/v2/media", {
      method: "POST",
      body: buffer,
      headers: {
        "Content-Type": clampText(mimeType, 120) || "image/jpeg",
        "Content-Disposition": `attachment; filename="${slugify(filename).slice(0, 120)}.${mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg"}"`
      }
    });
    if (altText && media?.id) {
      await this.request(`/wp-json/wp/v2/media/${Number(media.id)}`, { method: "POST", json: { alt_text: clampText(altText, 500) } });
    }
    return { id: Number(media.id || 0), sourceUrl: safeHttpsUrl(media.source_url || "") };
  }

  async findPostBySlug(slug) {
    const query = new URLSearchParams({ slug: clampText(slug, 180), context: "edit", per_page: "1" });
    ["draft", "pending", "future", "publish", "private"].forEach((status) => query.append("status[]", status));
    const posts = await this.request(`/wp-json/wp/v2/posts?${query.toString()}`);
    return Array.isArray(posts) && posts[0] ? sanitizeRemotePost(posts[0]) : null;
  }

  async ensureTerms(taxonomy = "tags", names = []) {
    if (!["tags", "categories"].includes(taxonomy)) throw new Error("wordpress_taxonomy_invalid");
    const uniqueNames = [...new Set((Array.isArray(names) ? names : []).map((name) => clampText(name, 120)).filter(Boolean))].slice(0, 12);
    const ids = [];
    for (const name of uniqueNames) {
      const query = new URLSearchParams({ search: name, context: "edit", per_page: "100" });
      const existing = await this.request(`/wp-json/wp/v2/${taxonomy}?${query.toString()}`);
      const exact = Array.isArray(existing)
        ? existing.find((term) => String(term?.name || "").trim().toLocaleLowerCase("es") === name.toLocaleLowerCase("es"))
        : null;
      if (exact?.id) {
        ids.push(Number(exact.id));
        continue;
      }
      try {
        const created = await this.request(`/wp-json/wp/v2/${taxonomy}`, { method: "POST", json: { name } });
        if (created?.id) ids.push(Number(created.id));
      } catch (error) {
        if (error?.code !== "wordpress_http_400") throw error;
        const retry = await this.request(`/wp-json/wp/v2/${taxonomy}?${query.toString()}`);
        const recovered = Array.isArray(retry)
          ? retry.find((term) => String(term?.name || "").trim().toLocaleLowerCase("es") === name.toLocaleLowerCase("es"))
          : null;
        if (recovered?.id) ids.push(Number(recovered.id));
      }
    }
    return ids.filter((id) => id > 0);
  }

  async createOrUpdateDraft(payload) {
    const existing = await this.findPostBySlug(payload.slug);
    if (existing?.id) {
      if (existing.status === "publish") return existing;
      return sanitizeRemotePost(await this.request(`/wp-json/wp/v2/posts/${existing.id}`, { method: "POST", json: { ...payload, status: "draft" } }));
    }
    return sanitizeRemotePost(await this.request("/wp-json/wp/v2/posts", { method: "POST", json: { ...payload, status: "draft" } }));
  }

  async updateDraft(remoteId, payload) {
    const id = Number(remoteId || 0);
    if (!id) throw Object.assign(new Error("wordpress_remote_id_required"), { status: 400, code: "wordpress_remote_id_required" });
    return sanitizeRemotePost(await this.request(`/wp-json/wp/v2/posts/${id}`, { method: "POST", json: { ...payload, status: "draft" } }));
  }

  async publishPost(remoteId) {
    const id = Number(remoteId || 0);
    if (!id) throw Object.assign(new Error("wordpress_remote_id_required"), { status: 400, code: "wordpress_remote_id_required" });
    return sanitizeRemotePost(await this.request(`/wp-json/wp/v2/posts/${id}`, { method: "POST", json: { status: "publish" } }));
  }

  async schedulePost(remoteId, { payload = {}, date = "", dateGmt = "" } = {}) {
    const id = Number(remoteId || 0);
    if (!id) throw Object.assign(new Error("wordpress_remote_id_required"), { status: 400, code: "wordpress_remote_id_required" });
    return sanitizeRemotePost(await this.request(`/wp-json/wp/v2/posts/${id}`, {
      method: "POST",
      json: { ...payload, status: "future", date: clampText(date, 80), date_gmt: clampText(dateGmt, 80) }
    }));
  }

  async cancelScheduledPost(remoteId) {
    const id = Number(remoteId || 0);
    if (!id) throw Object.assign(new Error("wordpress_remote_id_required"), { status: 400, code: "wordpress_remote_id_required" });
    return sanitizeRemotePost(await this.request(`/wp-json/wp/v2/posts/${id}`, { method: "POST", json: { status: "draft" } }));
  }

  async getPost(remoteId) {
    const id = Number(remoteId || 0);
    if (!id) throw Object.assign(new Error("wordpress_remote_id_required"), { status: 400, code: "wordpress_remote_id_required" });
    return sanitizeRemotePost(await this.request(`/wp-json/wp/v2/posts/${id}?context=edit`));
  }
}

module.exports = {
  ALLOWED_AUDIENCES,
  WordPressClient,
  assertPublicWordPressHost,
  buildPublicationSlug,
  buildWordPressPostPayload,
  escapeHtml,
  isPrivateIp,
  normalizeAudience,
  normalizeWordPressBaseUrl,
  readWordPressConfig,
  renderArticleToWordPressHtml,
  sanitizeRemotePost,
  slugify
};
