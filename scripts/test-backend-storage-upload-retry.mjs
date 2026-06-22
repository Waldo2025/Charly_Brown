import { readFileSync } from "node:fs";

const source = readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

if (!/await withRetry\(\(\) => file\.save\(buffer, \{/.test(source)) {
  throw new Error("uploadScreenshotAsset debe reintentar file.save ante fallos transitorios de Storage.");
}

if (!/await withRetry\(\(\) => new Promise\(\(resolve, reject\) => \{[\s\S]*file\.createWriteStream\(/m.test(source)) {
  throw new Error("uploadBinaryFileAsset debe reintentar createWriteStream ante fallos transitorios de Storage.");
}

console.log("Backend storage upload retry OK.");
