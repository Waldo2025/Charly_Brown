function parseHttpByteRange(rangeHeader = "", total = 0) {
  const raw = String(rangeHeader || "").trim();
  const totalBytes = Math.max(0, Number(total || 0) || 0);
  if (!raw || !totalBytes) return null;
  const match = raw.match(/^bytes=(\d*)-(\d*)$/i);
  if (!match) return null;
  const start = match[1] ? Math.max(0, Number(match[1] || 0)) : 0;
  const end = match[2] ? Math.min(totalBytes - 1, Number(match[2] || (totalBytes - 1))) : totalBytes - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= totalBytes) return null;
  return { start, end };
}

function buildBufferedMediaPayload(buffer, options = {}) {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || "");
  const mimeType = String(options?.mimeType || "application/octet-stream").trim() || "application/octet-stream";
  const total = Math.max(0, Number(source.length || 0) || 0);
  const range = parseHttpByteRange(options?.rangeHeader || "", total);
  const headers = {
    "Content-Type": mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=120"
  };

  if (range) {
    const body = source.subarray(range.start, range.end + 1);
    headers["Content-Range"] = `bytes ${range.start}-${range.end}/${total}`;
    headers["Content-Length"] = String(body.length);
    return { status: 206, headers, body };
  }

  headers["Content-Length"] = String(total);
  return { status: 200, headers, body: source };
}

module.exports = {
  buildBufferedMediaPayload,
  parseHttpByteRange
};
