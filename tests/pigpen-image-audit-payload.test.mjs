import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import workers from '../functions/src/pigpen-generation-workers.js';

test('the reviewer receives the brief and actual compressed images',async()=>{
  const original=await sharp({create:{width:2000,height:1500,channels:3,background:'#445566'}}).png().toBuffer();
  const room={room:{generated_room:{}},mission:{contexto:'El triángulo tiene lados 3, 4 y 5.',preguntas:[]}};
  const image={key:'room',questionIndex:null,path:'escaperooms/u/s/t/test.webp',url:'https://example.test/test.webp'};
  const values={master:{rooms:[]},room,image};let request;
  const worker=workers.createWorkers({bucket:{file:()=>({download:async()=>[original]})},artifacts:{get:async key=>structuredClone(values[key])},
    client:{models:{generateContent:async input=>{request=input;return {candidates:[{content:{parts:[{text:JSON.stringify({approved:true,issues:[],checks:[]})}]}}]};}}}});
  const result=await worker({ownerId:'u',sessionId:'s',topicId:'t',config:{modelo:'gemini-2.5-flash'}},{stage:'review',input:{masterRef:'master',roomRef:'room',imageRefs:['image']}},new AbortController().signal);
  assert.equal(result.approved,true);
  assert.match(request.contents[0].parts[0].text,/triángulo tiene lados 3, 4 y 5/);
  const encoded=request.contents[0].parts.find(p=>p.inlineData).inlineData;
  const meta=await sharp(Buffer.from(encoded.data,'base64')).metadata();assert.ok(meta.width<=768&&meta.height<=768);assert.equal(encoded.mimeType,'image/jpeg');
  assert.equal(result.room.mission.imagen,image.url);
});
test('review cannot read an image outside the authorized topic',async()=>{
  const values={master:{rooms:[]},room:{mission:{preguntas:[]}},image:{path:'escaperooms/other/s/t/image.webp'}};
  const worker=workers.createWorkers({bucket:{file:()=>{throw Error('Must not access bucket');}},artifacts:{get:async key=>values[key]},client:{models:{}}});
  await assert.rejects(worker({ownerId:'u',sessionId:'s',topicId:'t',config:{}},{stage:'review',input:{masterRef:'master',roomRef:'room',imageRefs:['image']}},new AbortController().signal),{status:403});
});
