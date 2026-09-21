import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { prepareEscapeRoomCloudPayload } from '../public/js/escape-room-cloud-payload.mjs';

const image = 'data:image/png;base64,' + 'A'.repeat(1_510_424);
const source = {
  project: { titulo: 'Conservado', misiones: [{ preguntas: [{ imagen: image, respuesta_correcta: 'ORION' }] }] },
  formState: { __objectiveBlueprint: { source_contract: { original_objective: 'Objetivo intacto' }, image } },
  previewAsset: image
};
assert.ok(Buffer.byteLength(JSON.stringify(source)) > 4_531_271);
let uploads = 0;
const result = await prepareEscapeRoomCloudPayload(source, async () => { uploads++; return 'https://example.test/image.png'; });
assert.equal(uploads, 1, 'Duplicate embedded images upload once');
assert.ok(Buffer.byteLength(JSON.stringify(result)) < 1_000);
assert.equal(source.project.misiones[0].preguntas[0].imagen, image, 'Do not mutate editor');
assert.equal(result.project.misiones[0].preguntas[0].respuesta_correcta, 'ORION');
assert.equal(result.formState.__objectiveBlueprint.source_contract.original_objective, 'Objetivo intacto');
assert.deepEqual(JSON.parse(JSON.stringify(result)), result, 'Existing reload schema unchanged');
await assert.rejects(prepareEscapeRoomCloudPayload(source, async value => value), /contenido sigue en el editor/);
await assert.rejects(prepareEscapeRoomCloudPayload(source, async () => { throw Error('offline'); }), /offline/);
await assert.rejects(prepareEscapeRoomCloudPayload({ project: { text: 'á'.repeat(500_000) } }, async () => ''), /después de separar/);
const small = { project: { titulo: 'Legacy', imagen: 'https://example.test/existing.png' }, formState: {} };
assert.deepEqual(await prepareEscapeRoomCloudPayload(small, () => { throw Error('Should not upload'); }), small);
const creator = readFileSync(new URL('../public/js/PigPenCreator.js', import.meta.url), 'utf8');
const events = [];
const context = vm.createContext({
  prepareEscapeRoomCloudPayload, crypto: webcrypto, TextEncoder,
  ESCAPE_ROOM_COLLECTION: 'escapeRoom', state: { currentUser: { uid: 'owner' } },
  doc: ref => ({ path: `${ref.path}/allocated-id` }),
  uploadImageIfDataUrl: async () => { events.push('upload'); return 'https://example.test/stored.png'; },
  firestoreSetDoc: async (ref, payload) => { events.push('write'); assert.ok(Buffer.byteLength(JSON.stringify(payload)) < 900_000); },
  firestoreUpdateDoc: async () => { events.push('update'); },
  firestoreAddDoc: async () => { throw Error('Unprepared insert'); }
});
vm.runInContext(creator.slice(creator.indexOf('const cloudAssetUploads ='), creator.indexOf('async function uploadImageIfDataUrl')), context);
context.source = source;
await vm.runInContext("addDoc({path:'escapeRoom/session/topics'}, source)", context);
assert.deepEqual(events, ['upload', 'write'], 'Initial creation uploads BEFORE first Firestore write');
await vm.runInContext("updateDoc({path:'escapeRoom/session'}, source)", context);
assert.deepEqual(events, ['upload', 'write', 'update'], 'Session mirror reuses stored asset');
console.log('PASS: 4.5MB payload, nested/duplicate assets, no loss, legacy reload, failed upload and UTF-8 size guard.');
