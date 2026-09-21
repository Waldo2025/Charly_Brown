/**
 * mindmapImageTransparency.js
 * Utilidad modular para procesar imágenes de stickers generadas con IA o subidas,
 * removiendo el fondo blanco/claro y produciendo un PNG con fondo 100% transparente.
 */
import { removeConnectedImageBackground, keepPrimaryImageComponent } from './science-image-cutout.mjs';

/**
 * Convierte una imagen con fondo blanco o claro en un PNG con transparencia real,
 * recortando bordes vacíos y suavizando los contornos para evitar halos blancos.
 * 
 * @param {string} sourceDataUrl - Data URL de la imagen original (ej. data:image/png;base64,...)
 * @returns {Promise<string>} Data URL de la imagen en formato PNG transparente
 */
export async function procesarStickerTransparente(sourceDataUrl) {
  if (!sourceDataUrl || typeof sourceDataUrl !== "string") {
    return sourceDataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        if (!width || !height) {
          resolve(sourceDataUrl);
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, width, height);

        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;

        // Comprobar si la imagen ya tiene suficiente transparencia previa (> 5% de píxeles)
        let transparentCount = 0;
        const sampleStep = Math.max(1, Math.floor((width * height) / 1000));
        for (let i = 3; i < data.length; i += sampleStep * 4) {
          if (data[i] < 128) transparentCount++;
        }
        const alreadyTransparent = transparentCount > (1000 * 0.05);

        if (!alreadyTransparent) {
          // Remover fondo conectado a los bordes usando matte blanco puro [255, 255, 255]
          const cutout = removeConnectedImageBackground(data, width, height, [255, 255, 255]);
          data.set(cutout.data);

          // Filtrar artefactos aislados en el fondo conservando el componente principal
          const primary = keepPrimaryImageComponent(data, width, height, { strict: false });
          data.set(primary.data);

          // Suavizado / desvanecimiento de bordes claros para eliminar halos blancos en líneas de tinta
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const pos = y * width + x;
              const off = pos * 4;
              if (data[off + 3] === 0) continue;

              const hasTransparentNeighbor = (
                (x > 0 && data[(pos - 1) * 4 + 3] === 0) ||
                (x + 1 < width && data[(pos + 1) * 4 + 3] === 0) ||
                (y > 0 && data[(pos - width) * 4 + 3] === 0) ||
                (y + 1 < height && data[(pos + width) * 4 + 3] === 0)
              );

              if (hasTransparentNeighbor) {
                const r = data[off], g = data[off + 1], b = data[off + 2];
                const sat = Math.max(r, g, b) - Math.min(r, g, b);
                const brightness = (r + g + b) / 3;
                // Si es un pixel de borde neutro y claro (halo blanco/grisáceo de anti-alias)
                if (sat < 28 && brightness > 120) {
                  const alpha = Math.max(0, Math.min(255, Math.round(255 * (1 - (brightness - 120) / 135))));
                  data[off + 3] = alpha;
                  // Teñir hacia tinta oscura para fusionar limpiamente
                  data[off] = Math.round(r * 0.15);
                  data[off + 1] = Math.round(g * 0.15);
                  data[off + 2] = Math.round(b * 0.15);
                }
              }
            }
          }
        }

        // Calcular caja delimitadora del objeto
        let minX = width, minY = height, maxX = -1, maxY = -1;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const off = (y * width + x) * 4;
            if (data[off + 3] >= 16) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        // Si no quedó objeto visible, retornar original por seguridad
        if (maxX < minX || maxY < minY) {
          resolve(sourceDataUrl);
          return;
        }

        ctx.putImageData(imgData, 0, 0);

        // Añadir margen proporcional alrededor del objeto recortado
        const objW = maxX - minX + 1;
        const objH = maxY - minY + 1;
        const padding = Math.max(12, Math.round(Math.max(objW, objH) * 0.05));

        const cropX = Math.max(0, minX - padding);
        const cropY = Math.max(0, minY - padding);
        const cropW = Math.min(width - cropX, objW + padding * 2);
        const cropH = Math.min(height - cropY, objH + padding * 2);

        // Enmarcar en lienzo cuadrado centrado para stickers
        const side = Math.max(cropW, cropH);
        const outCanvas = document.createElement("canvas");
        outCanvas.width = side;
        outCanvas.height = side;
        const outCtx = outCanvas.getContext("2d", { alpha: true });
        outCtx.imageSmoothingEnabled = true;
        outCtx.imageSmoothingQuality = "high";

        const destX = Math.round((side - cropW) / 2);
        const destY = Math.round((side - cropH) / 2);
        outCtx.drawImage(canvas, cropX, cropY, cropW, cropH, destX, destY, cropW, cropH);

        const transparentPngDataUrl = outCanvas.toDataURL("image/png");
        resolve(transparentPngDataUrl);
      } catch (err) {
        console.warn("Fallo al procesar transparencia de sticker:", err);
        resolve(sourceDataUrl);
      }
    };

    img.onerror = () => {
      resolve(sourceDataUrl);
    };

    img.src = sourceDataUrl;
  });
}
