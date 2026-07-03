import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

if (!/function isMissingBucketError\(error\)/.test(source)) {
  throw new Error("backend/server.js debe tener detector de bucket inexistente/permisos.");
}

const screenshotUploadBlock = source.match(/async function uploadScreenshotAsset[\s\S]*?return \{\s*path: assetPath,/)?.[0] || "";
if (!screenshotUploadBlock.includes("|| isMissingBucketError(error)")) {
  throw new Error("uploadScreenshotAsset debe continuar con el siguiente bucket cuando el candidato no existe.");
}

const exportUploadBlock = source.match(/export upload failed on bucket candidate[\s\S]*?if \(lastUploadError\) throw lastUploadError;/)?.[0] || "";
if (!exportUploadBlock.includes("|| isMissingBucketError(error)")) {
  throw new Error("El upload final de export debe continuar con el siguiente bucket cuando el candidato no existe.");
}

console.log("Backend storage bucket candidate retry OK.");
