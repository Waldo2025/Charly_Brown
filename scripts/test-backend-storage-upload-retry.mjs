import { readFileSync } from "node:fs";

const source = readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

if (/await withRetry\(\(\) => file\.save\(buffer, \{/.test(source)) {
  throw new Error("uploadScreenshotAsset ya no debe depender de file.save; usa el uploader non-resumable endurecido.");
}

if (!/await uploadFileToBucketNonResumable\(\{[\s\S]*destination: assetPath,[\s\S]*filePath: tempUploadPath/m.test(source)) {
  throw new Error("uploadScreenshotAsset debe subir buffers con uploadFileToBucketNonResumable.");
}

if (!/const tempUploadPath = path\.join\(os\.tmpdir\(\), `cb-storage-upload-\$\{token\}`\);/.test(source)) {
  throw new Error("uploadScreenshotAsset debe materializar el buffer a un archivo temporal para reutilizar el uploader non-resumable.");
}

if (!/await fs\.promises\.rm\(tempUploadPath, \{ force: true \}\)\.catch\(\(\) => \{\}\);/.test(source)) {
  throw new Error("uploadScreenshotAsset debe limpiar el archivo temporal aunque falle el upload.");
}

if (!/await withRetry\(\(\) => new Promise\(\(resolve, reject\) => \{[\s\S]*file\.createWriteStream\(/m.test(source)) {
  throw new Error("uploadBinaryFileAsset sigue dependiendo de createWriteStream con retry; revisar si se migra en otro cambio.");
}

console.log("Backend storage upload retry OK.");
