import assert from "node:assert/strict";
import imageSecurity from "../backend/security/image-upload-security.js";

const { buildOwnedSupportGraphicPath, detectSupportedRasterImage } = imageSecurity;
const padded = (bytes) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(16)]);

assert.deepEqual(
  detectSupportedRasterImage(padded([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  { mimeType: "image/png", extension: "png" }
);
assert.deepEqual(detectSupportedRasterImage(padded([0xff, 0xd8, 0xff])), { mimeType: "image/jpeg", extension: "jpg" });
assert.deepEqual(detectSupportedRasterImage(Buffer.from("RIFF0000WEBP0000")), { mimeType: "image/webp", extension: "webp" });
assert.deepEqual(detectSupportedRasterImage(Buffer.from("GIF89a0000000000")), { mimeType: "image/gif", extension: "gif" });
assert.equal(detectSupportedRasterImage(Buffer.from('<svg onload="alert(1)"></svg>')), null);
assert.equal(detectSupportedRasterImage(Buffer.from("not-an-image-file")), null);

const fixedId = () => "12345678-abcd-9999-abcd-123456789000";
assert.equal(
  buildOwnedSupportGraphicPath(
    "unidadesGeneradasAssets/Primaria/3/uid-owner/../../../evil.svg",
    "uid-owner",
    "png",
    fixedId
  ),
  ""
);
assert.equal(
  buildOwnedSupportGraphicPath("unidadesGeneradasAssets/uid-other/image.png", "uid-owner", "png", fixedId),
  ""
);
assert.equal(
  buildOwnedSupportGraphicPath(
    "unidadesGeneradasAssets/Primaria/Tercero/uid-owner/mi imagen.PNG",
    "uid-owner",
    "webp",
    fixedId
  ),
  "unidadesGeneradasAssets/uid-owner/Primaria/Tercero/mi-imagen-12345678abcd.webp"
);

console.log("PigPen image upload security OK.");
