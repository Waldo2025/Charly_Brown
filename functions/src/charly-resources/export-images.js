const sharp = require('sharp');
async function hydrateImages(documentData, session, loadAsset) {
  const owner = session.ownerUid || session.ownerId || session.userId;
  const prefix = `charly-resources/${owner}/${session.id}/`;
  const assets = new Map();
  for (const unit of session.units || []) for (const resource of unit.accepted?.resources || []) {
    for (const asset of resource.assets || resource.artifact?.assets || []) {
      if (asset.storagePath?.startsWith(prefix) && asset.mimeType?.startsWith('image/')) assets.set(asset.url, asset);
    }
  }
  const cache = new Map();
  for (const section of documentData.sections) for (const block of section.blocks) {
    if (block.type !== 'image') continue;
    const inline = /^data:image\/(png|jpeg|webp);base64,([a-z0-9+/=]+)$/i.exec(block.src || '');
    const inlineBytes = inline && inline[2].length <= 120000 ? Buffer.from(inline[2], 'base64') : null;
    const asset = assets.get(block.src) || (inlineBytes ? { storagePath: block.src } : null);
    if (!asset) { block.type = 'paragraph'; block.text = `${block.alt || 'Imagen'}: ${block.src}`; continue; }
    if (!cache.has(asset.storagePath)) {
      const read = loadAsset || (async path => {
        const services = require('../common.js').getAdminServices();
        const bucket = process.env.CHARLY_RESOURCE_BUCKET ? require('firebase-admin/storage').getStorage().bucket(process.env.CHARLY_RESOURCE_BUCKET) : services.bucket;
        const file = bucket.file(path); const [metadata] = await file.getMetadata();
        if (Number(metadata.size) > 15000000) throw new Error('La imagen supera el límite de exportación.');
        return (await file.download())[0];
      });
      const data = await sharp(inlineBytes || await read(asset.storagePath), { limitInputPixels: 30000000 }).resize({ width: 1400, height: 1800, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      const metadata = await sharp(data).metadata();
      cache.set(asset.storagePath, { data, width: metadata.width, height: metadata.height });
    }
    Object.assign(block, cache.get(asset.storagePath));
    block.text = `${block.alt || 'Recurso visual'}: ${block.src}`;
  }
  return documentData;
}
module.exports = { hydrateImages };
