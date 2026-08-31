const test = require("node:test");
const assert = require("node:assert/strict");
const {
  WordPressClient,
  buildPublicationSlug,
  buildWordPressPostPayload,
  isPrivateIp,
  readWordPressConfig,
  renderArticleToWordPressHtml
} = require("../src/marcie-wordpress-core.js");

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => String(name).toLowerCase() === "content-type" ? "application/json" : "" },
    json: async () => data,
    text: async () => JSON.stringify(data)
  };
}

const publicDns = async () => [{ address: "93.184.216.34", family: 4 }];

test("readWordPressConfig keeps credentials server-side and supports a JSON secret", () => {
  const config = readWordPressConfig({
    MARCIE_WORDPRESS_CONFIG_JSON: JSON.stringify({
      baseUrl: "https://blog.example.com",
      username: "marcie-publisher",
      applicationPassword: "secret application password"
    })
  });
  assert.equal(config.configured, true);
  assert.equal(config.baseUrl, "https://blog.example.com");
  assert.equal(config.username, "marcie-publisher");
  assert.equal(config.applicationPassword, "secret application password");
});

test("renderArticleToWordPressHtml escapes untrusted content and renders structured blocks", () => {
  const html = renderArticleToWordPressHtml({
    subtitle: "Una guía <segura>",
    blocks: [
      { type: "heading", level: "h2", text: "Introducción" },
      { type: "paragraph", text: "Texto <script>alert(1)</script>" },
      { type: "bulletList", items: ["Uno", "Dos"] },
      { type: "quote", text: "Aprender importa", attribution: "Marcie" }
    ],
    sources: [{ title: "Fuente fiable", url: "https://example.edu/research" }]
  });
  assert.match(html, /<h2>Introducción<\/h2>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /<ul><li>Uno<\/li><li>Dos<\/li><\/ul>/);
  assert.match(html, /Fuentes consultadas/);
});

test("buildWordPressPostPayload creates a deterministic draft with taxonomy and cover IDs", () => {
  const payload = buildWordPressPostPayload({
    sessionId: "session ABC",
    audience: "educators",
    article: { title: "Artículo aprobado", excerpt: "Resumen", blocks: [{ type: "paragraph", text: "Contenido" }] },
    featuredMediaId: 31,
    categoryIds: [4],
    tagIds: [7, 9]
  });
  assert.equal(payload.status, "draft");
  assert.equal(payload.slug, buildPublicationSlug("session ABC", "educators"));
  assert.equal(payload.featured_media, 31);
  assert.deepEqual(payload.categories, [4]);
  assert.deepEqual(payload.tags, [7, 9]);
});

test("private and metadata-network IP addresses are rejected", () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "172.20.2.3", "192.168.1.2", "169.254.169.254", "::1", "fd00::1"]) {
    assert.equal(isPrivateIp(address), true, address);
  }
  assert.equal(isPrivateIp("93.184.216.34"), false);
});

test("WordPressClient preserves subdirectory installs, authenticates, and blocks redirects", async () => {
  const calls = [];
  const client = new WordPressClient({
    config: {
      configured: true,
      baseUrl: "https://example.com/blog",
      username: "publisher",
      applicationPassword: "app pass",
      allowInsecureLocal: false
    },
    resolveHost: publicDns,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return jsonResponse(200, { id: 42, name: "Editor", slug: "editor", capabilities: { edit_posts: true, upload_files: true, publish_posts: true, manage_categories: true } });
    }
  });
  const user = await client.testConnection();
  assert.equal(user.id, 42);
  assert.equal(calls[0].url, "https://example.com/blog/wp-json/wp/v2/users/me?context=edit");
  assert.match(calls[0].options.headers.Authorization, /^Basic /);
  assert.doesNotMatch(calls[0].options.headers.Authorization, /app pass/);
  assert.equal(calls[0].options.redirect, "manual");
});

test("WordPressClient rejects a configured hostname that resolves to a private network", async () => {
  const client = new WordPressClient({
    config: {
      configured: true,
      baseUrl: "https://wordpress.example.com",
      username: "publisher",
      applicationPassword: "app pass",
      allowInsecureLocal: false
    },
    resolveHost: async () => [{ address: "169.254.169.254", family: 4 }],
    fetchImpl: async () => {
      throw new Error("fetch should not run");
    }
  });
  await assert.rejects(() => client.testConnection(), (error) => error.code === "wordpress_private_host_blocked");
});

test("WordPressClient verifies the capabilities required by the complete publishing flow", async () => {
  const client = new WordPressClient({
    config: {
      configured: true,
      baseUrl: "https://example.com",
      username: "author",
      applicationPassword: "app pass",
      allowInsecureLocal: false
    },
    resolveHost: publicDns,
    fetchImpl: async () => jsonResponse(200, { id: 4, name: "Author", capabilities: { edit_posts: true } })
  });
  await assert.rejects(() => client.testConnection(), (error) => error.code === "wordpress_capabilities_missing");
});

test("createOrUpdateDraft reuses a deterministic remote post instead of creating a duplicate", async () => {
  const calls = [];
  const client = new WordPressClient({
    config: {
      configured: true,
      baseUrl: "https://example.com",
      username: "publisher",
      applicationPassword: "app pass",
      allowInsecureLocal: false
    },
    resolveHost: publicDns,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), method: options.method });
      if (String(url).includes("posts?")) return jsonResponse(200, [{ id: 77, status: "draft", slug: "marcie-session-educators" }]);
      return jsonResponse(200, { id: 77, status: "draft", slug: "marcie-session-educators", link: "https://example.com/?p=77" });
    }
  });
  const remote = await client.createOrUpdateDraft({ title: "Título", content: "<p>Texto</p>", slug: "marcie-session-educators", status: "draft" });
  assert.equal(remote.id, 77);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /\/wp-json\/wp\/v2\/posts\/77$/);
  assert.equal(calls[1].method, "POST");
});
