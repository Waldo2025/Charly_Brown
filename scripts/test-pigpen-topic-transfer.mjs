import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import * as sdk from 'firebase/firestore';
import * as storageSdk from 'firebase/storage';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import { buildEditorialWorkbook, readEditorialWorkbook, previewEditorialImport } from '../public/js/escape-room-editorial-workbook.mjs';
import { createTopicTransferService, topicAcademic, topicSummary, matchingSessionTopics, copyTopicResources, ownedStoragePath } from '../public/js/pigpen-topic-transfer.mjs';
import { buildEscapeRoomPackage } from '../public/js/escape-room-package-builder.mjs';

assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/, 'This test NEVER runs against production');
const app = initializeApp({ projectId:'demo-pigpen-transfer',storageBucket:'demo-pigpen-transfer.appspot.com',apiKey:'demo' });
const db = sdk.getFirestore(app);
sdk.connectFirestoreEmulator(db,'127.0.0.1',8185,{mockUserToken:{sub:'owner',user_id:'owner',email:'owner@example.test'}});
const storage = storageSdk.getStorage(app);
storageSdk.connectStorageEmulator(storage,'127.0.0.1',9295,{mockUserToken:{sub:'owner',user_id:'owner'}});
const tag = crypto.randomUUID();
const XLSX = createRequire(import.meta.url)('../public/vendor/xlsx/xlsx.full.min.js');
const parent = id => sdk.doc(db,'escapeRoom',tag+id);
const topic = (id,t='one') => sdk.doc(db,'escapeRoom',tag+id,'topics',t);
const data = {title:'Original',academicNumber:1,createdAt:sdk.Timestamp.fromMillis(1000),
  extra:{unknown:'keep',nested:[{array:[1,2]}]},formState:{nivelSelect:'Secundaria',gradoSelect:'Segundo',materiaSelect:'Inglés',trimestreSelect:'2',unidadTemaSelect:'1',__objectiveBlueprint:{keep:true}},
  project:{titulo:'Original',idioma:'en',clave_final:'SOL',misiones:[{id:'room-1',titulo:'Room',preguntas:[{id:'q1',tipo_interaccion:'texto',respuesta_correcta:'SUN',respuestas_aceptadas:['SUN','THE SUN']}]}]}};
async function seed(id, status='draft', payload=data) {
  await sdk.setDoc(parent(id),{ownerId:'owner',status,title:id,activeTopicId:'one',topicCount:payload?1:0,topicSummaries:payload?[topicSummary({...payload,id:'one'})]:[],updatedAt:sdk.Timestamp.fromMillis(1000)});
  if(payload)await sdk.setDoc(topic(id),payload);
}
const creator = fs.readFileSync('public/js/PigPenCreator.js','utf8');
const copyFunction = creator.slice(creator.indexOf('async function copyTransferResources('),creator.indexOf('function getTopicTransferService('));
const ctx=vm.createContext({getStorage:()=>storage, storageRef:storageSdk.ref, getMetadata:storageSdk.getMetadata,getBytes:storageSdk.getBytes,
  uploadBytes:storageSdk.uploadBytes,getDownloadURL:storageSdk.getDownloadURL,copyTopicResources,crypto:webcrypto,app,fetch,Uint8Array});
vm.runInContext(copyFunction,ctx);
const service = createTopicTransferService({db,sdk,copyResources:ctx.copyTransferResources});
const args=(from,to,mode='copy')=>({uid:'owner',sourceId:tag+from,destinationId:tag+to,topicId:'one',mode,operationId:crypto.randomUUID()});
try {
  await seed('source');await seed('dest');
  const original= (await sdk.getDoc(topic('source'))).data();
  const copy=args('source','dest');
  await service.transfer(copy);
  const copied=(await sdk.getDoc(topic('dest',copy.operationId))).data();
  assert.deepEqual(copied.extra,original.extra);assert.deepEqual(copied.project,original.project);assert.deepEqual(copied.formState,original.formState);
  assert.equal(copied.createdAt.toMillis(),1000);assert.equal(copied.academicNumber,1);
  assert.deepEqual((await sdk.getDoc(topic('source'))).data(),original);
  assert.equal((await sdk.getDocs(sdk.collection(db,parent('dest').path,'topics'))).size,2,'Duplicate academic number does not overwrite');
  assert.equal((await service.transfer(copy)).alreadyCompleted,true);
  const double=args('source','dest');
  const beforeDouble=(await sdk.getDocs(sdk.collection(db,parent('dest').path,'topics'))).size;
  await Promise.all([service.transfer(double),service.transfer(double)]);
  assert.equal((await sdk.getDocs(sdk.collection(db,parent('dest').path,'topics'))).size,beforeDouble+1,'Concurrent retries create one document');
  const lostAck=createTopicTransferService({db,sdk:{...sdk,runTransaction:async(...args)=>{await sdk.runTransaction(...args);throw Error('response lost');}},copyResources:async raw=>raw});
  const ack=await lostAck.transfer(args('source','dest'));
  assert.equal(ack.alreadyCompleted,true,'Unknown commit outcome is resolved from the destination');
  const move=args('source','dest','move');await service.transfer(move);
  assert.equal((await sdk.getDoc(topic('source'))).exists(),false);
  assert.equal((await sdk.getDoc(parent('source'))).data().topicCount,0);
  assert.equal((await sdk.getDoc(parent('source'))).exists(),true,'Empty session retained');
  assert.equal((await service.transfer(move)).alreadyCompleted,true,'Lost response replay works after source removal');
  await seed('published','published');const beforePublished=(await sdk.getDoc(parent('published'))).data();
  await service.transfer(args('published','dest'));
  assert.deepEqual((await sdk.getDoc(parent('published'))).data(),beforePublished);
  await assert.rejects(service.transfer(args('published','dest','move')),/borrador/);
  await assert.rejects(service.transfer(args('dest','published')),/borrador/);
  await seed('foreign');await sdk.updateDoc(parent('foreign'),{title:'Still ours'});
  await assert.rejects(service.transfer({...args('foreign','dest'),uid:'other'}),/propias/);
  await seed('failure');
  const failing=createTopicTransferService({db,sdk,copyResources:async()=>{throw Error('missing asset');}});
  await assert.rejects(failing.transfer(args('failure','dest','move')),/missing asset/);
  assert.ok((await sdk.getDoc(topic('failure'))).exists());
  const changing=createTopicTransferService({db,sdk,copyResources:async raw=>{await sdk.updateDoc(topic('failure'),{title:'Concurrent edit'});return raw;}});
  await assert.rejects(changing.transfer(args('failure','dest','move')),/cambió/);
  assert.equal((await sdk.getDoc(topic('failure'))).data().title,'Concurrent edit');
  const readRace=createTopicTransferService({db,sdk:{...sdk,getDocs:async ref=>{
    if(ref.path===`${parent('failure').path}/topics`)await sdk.updateDoc(topic('failure'),{title:'Edited between reads'});
    return sdk.getDocs(ref);
  }},copyResources:async raw=>raw});
  await assert.rejects(readRace.transfer(args('failure','dest','move')),/cambió/);
  assert.ok((await sdk.getDoc(topic('failure'))).exists());
  await seed('legacyDest','draft',null);await sdk.updateDoc(parent('legacyDest'),{project:{titulo:'Legacy retained'},formState:{unidadTemaSelect:'3'}});
  await service.transfer(args('published','legacyDest'));
  const legacyTopics=(await sdk.getDocs(sdk.collection(db,parent('legacyDest').path,'topics'))).docs.map(s=>s.data());
  assert.ok(legacyTopics.some(t=>t.project.titulo==='Legacy retained'));
  await seed('legacySource','published',null);await sdk.updateDoc(parent('legacySource'),{project:original.project,formState:original.formState});
  await service.transfer({...args('legacySource','dest'),topicId:'legacy'});

  // Actual binary upload/copy/readback against Storage emulator, including video.
  await seed('media');
  const mediaBytes=fs.readFileSync('public/pigpen.png');
  const sourceAsset=storageSdk.ref(storage,`escaperooms/owner/${tag}media/original.png`);
  await storageSdk.uploadBytes(sourceAsset,mediaBytes,{contentType:'image/png'});
  const mediaUrl=await storageSdk.getDownloadURL(sourceAsset);
  const videoAsset=storageSdk.ref(storage,`escaperooms/owner/${tag}media/clip.bin`);
  await storageSdk.uploadBytes(videoAsset,new Uint8Array([1,2,3,4]),{contentType:'video/mp4'});
  const mediaData=structuredClone(data);mediaData.project.misiones[0].imagen=mediaUrl;
  mediaData.extra.video=await storageSdk.getDownloadURL(videoAsset);mediaData.extra.external='https://example.org/movie.mp4';
  await sdk.setDoc(topic('media'),mediaData);
  const mediaMove=args('media','dest','move');await service.transfer(mediaMove);
  const mediaCopy=(await sdk.getDoc(topic('dest',mediaMove.operationId))).data();
  const newPath=ownedStoragePath(mediaCopy.project.misiones[0].imagen,storageSdk.ref(storage).bucket);
  assert.ok(newPath.includes(mediaMove.operationId));
  assert.deepEqual(Buffer.from(await storageSdk.getBytes(storageSdk.ref(storage,newPath))),mediaBytes);
  assert.equal(mediaCopy.extra.external,mediaData.extra.external);
  await seed('corrupt','draft',mediaData);
  const corruptArgs=args('corrupt','dest','move');
  ctx.getBytes=async(ref,...rest)=>ref.fullPath.includes(corruptArgs.operationId)?new Uint8Array([99]).buffer:storageSdk.getBytes(ref,...rest);
  await assert.rejects(service.transfer(corruptArgs),/no coincide/);
  ctx.getBytes=storageSdk.getBytes;
  assert.ok((await sdk.getDoc(topic('corrupt'))).exists(),'Checksum failure never removes the original');
  await sdk.deleteDoc(parent('media'));
  assert.deepEqual(Buffer.from(await storageSdk.getBytes(storageSdk.ref(storage,newPath))),mediaBytes);
  const exportProject=structuredClone(mediaCopy.project);
  exportProject.misiones[0].imagen=`data:image/png;base64,${mediaBytes.toString('base64')}`;
  const pkg=buildEscapeRoomPackage(exportProject);
  assert.ok(pkg.files['assets/game.js']);assert.match(pkg.files['assets/escape-room.json'],/q1/);
  const zip=new JSZip();
  for(const [path,content] of Object.entries(pkg.files)) {
    if(typeof content==='string'&&content.startsWith('data:'))zip.file(path,content.split(',')[1],{base64:true});
    else zip.file(path,content);
  }
  const archive=await JSZip.loadAsync(await zip.generateAsync({type:'nodebuffer'}));
  const packagedProject=JSON.parse(await archive.file('assets/escape-room.json').async('string'));
  assert.deepEqual(await archive.file(packagedProject.misiones[0].imagen).async('nodebuffer'),mediaBytes);
  const topics=[{...mediaCopy,id:mediaMove.operationId}];
  const workbook=buildEditorialWorkbook(XLSX,{sessionId:mediaMove.destinationId,topics});
  const review=readEditorialWorkbook(XLSX,XLSX.write(workbook,{type:'array',bookType:'xlsx'}));
  assert.equal(previewEditorialImport(review,{sessionId:mediaMove.destinationId,topics}).errors.length,0);
  assert.ok(previewEditorialImport(review,{sessionId:mediaMove.sourceId,topics}).errors.some(error=>/otra sesión/.test(error)));
  const mixed={topicSummaries:[{id:'a',academicNumber:1,nivel:'Secundaria',grado:'Segundo',materia:'Inglés',trimestre:'1'},
    {id:'b',academicNumber:1,nivel:'Primaria',grado:'Primero',materia:'Español',trimestre:'2'}]};
  assert.equal(matchingSessionTopics(mixed,{grado:'Segundo',materia:'Español'}).length,0);
  assert.equal(matchingSessionTopics(mixed,{grado:'Segundo',materia:'Inglés',trimestre:'1'}).length,1);
  assert.equal(topicAcademic(copied).trimestre,'2');
  console.log('PASS: emulator transfers, atomic failures, lost response, duplicates, legacy, published protection, binary integrity, filters and runtime package.');
} finally {await sdk.terminate(db);await deleteApp(app);}
