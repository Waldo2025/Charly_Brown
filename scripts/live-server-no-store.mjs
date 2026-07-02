import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const liveServer = require("live-server");

const root = process.argv[2] || "public";
const host = process.env.WEB_HOST || "127.0.0.1";
const port = Number(process.env.WEB_PORT || process.argv[3] || 5010) || 5010;

function shouldDisableBrowserCache(url = "") {
  const cleanUrl = String(url || "").split("?")[0] || "";
  return cleanUrl === "/"
    || cleanUrl.endsWith(".html")
    || cleanUrl.endsWith("/version.json")
    || cleanUrl.endsWith("/js/cache-version-loader.js")
    || cleanUrl.startsWith("/podcaster/")
    || cleanUrl.startsWith("/js/api-client");
}

liveServer.start({
  root,
  host,
  port,
  open: false,
  noBrowser: true,
  middleware: [
    (req, res, next) => {
      if (shouldDisableBrowserCache(req.url)) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.setHeader("Surrogate-Control", "no-store");
      }
      next();
    }
  ]
});

setInterval(() => {}, 1 << 30);
