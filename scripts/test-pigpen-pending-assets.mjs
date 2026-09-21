import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('public/js/PigPenCreator.js', 'utf8');
function extract(name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, `${name} must exist`);
  const tail = source.slice(start);
  const end = tail.slice(1).search(/\n(?:async )?function /);
  return end < 0 ? tail : tail.slice(0, end + 1);
}
const classSource = source.slice(
  source.indexOf('class AssetUploadPendingError'),
  source.indexOf('function openPendingAssetDatabase')
);

assert.match(source, /const PENDING_ASSET_DB_NAME = "PigPenCreator\.pendingAssets\.v1"/);
assert.match(source, /showPendingAssetStatus[\s\S]*Reintentar guardado/);
assert.match(source, /schedulePendingAssetRetry[\s\S]*5_000, 15_000, 30_000, 60_000, 120_000/);
assert.match(source, /replaceEmbeddedAsset\(state\.project[\s\S]*replaceEmbeddedAsset\(state\.objectiveBlueprint/);

const diagnostics = vm.createContext({
  normalizeString: (value, fallback = '') => String(value || fallback),
  window: { location: { hostname: 'app.example.test' } },
  app: {},
  getStorage: () => ({}),
  storageRef: (_storage, path) => ({ path }),
  parseDataUrl: () => ({ contentType: 'image/png' }),
  uploadString: async () => { throw new Error('storage/unauthorized'); },
  getDownloadURL: async () => '',
  uploadImageToBackendForFallback: async () => { throw new Error('fallback_http_503'); }
});
vm.runInContext(`${classSource}\n${extract('uploadImageDataUrlToRemote')}`, diagnostics);
await assert.rejects(
  vm.runInContext("uploadImageDataUrlToRemote('data:image/png;base64,AA', 'escaperooms/u/s/t/image.webp')", diagnostics),
  error => error.code === 'asset_upload_pending'
    && /storage\/unauthorized/.test(error.message)
    && /fallback_http_503/.test(error.message)
);

const events = [];
const queueing = vm.createContext({
  normalizeString: (value, fallback = '') => String(value || fallback),
  isDataUrl: () => true,
  state: { currentUser: { uid: 'u1' } },
  uploadImageDataUrlToRemote: async () => { throw new Error('offline'); },
  queuePendingAsset: async (_value, path) => events.push(`queue:${path}`),
  showPendingAssetStatus: error => events.push(`status:${error.code}`),
  removePendingAsset: async () => events.push('remove')
});
vm.runInContext(`${classSource}\n${extract('uploadImageIfDataUrl')}`, queueing);
await assert.rejects(
  vm.runInContext("uploadImageIfDataUrl('data:image/png;base64,AA', 'asset.webp')", queueing),
  error => error.code === 'asset_upload_pending'
);
assert.deepEqual(events, ['queue:asset.webp', 'status:asset_upload_pending']);

console.log('Pending assets: typed diagnostics, durable queue hooks and retry action passed.');
