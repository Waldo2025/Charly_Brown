const test=require('node:test'),assert=require('node:assert/strict');
const {readLocalDocument}=require('../src/local-document-reader.js');
function fixture(){const storagePath='charly_attachments/user/doc.pdf',extractionStoragePath=storagePath+'.extraction.json',files=new Map(),reads=[];
  const batches=[1,26].map(first=>({first,path:storagePath+`.pages-${first}.json`}));
  files.set(extractionStoragePath,{version:'pdf-local-1',sourcePath:storagePath,complete:true,pageCount:30,batches});
  for(const batch of batches)files.set(batch.path,Array.from({length:Math.min(25,31-batch.first)},(_,i)=>({page:batch.first+i,text:'Evidence '+(batch.first+i),status:'completed'})));
  const bucket={file:path=>({getMetadata:async()=>[{size:JSON.stringify(files.get(path)).length,generation:'1'}],download:async()=>{reads.push(path);return[Buffer.from(JSON.stringify(files.get(path)))];}})};
  return{attachment:{storagePath,extractionStoragePath},context:{uid:'user',bucket},files,reads};}
test('page retrieval downloads only the relevant batch and preserves page references',async()=>{const f=fixture();const result=await readLocalDocument(f.attachment,f.context,{first:27,last:29});assert.match(result.text,/Página 27/);assert.equal(f.reads.length,2);assert.equal(result.complete,true);});
test('ownership and ranges cannot be bypassed',async()=>{const f=fixture();await assert.rejects(readLocalDocument(f.attachment,{...f.context,uid:'other'}),/owner_required/);await assert.rejects(readLocalDocument(f.attachment,f.context,{first:0,last:20}),/page_range/);await assert.rejects(readLocalDocument(f.attachment,f.context,{first:1,last:30}),/page_range/);});
test('missing and duplicated pages never produce a complete result',async()=>{const f=fixture();f.files.get(f.attachment.storagePath+'.pages-1.json').pop();await assert.rejects(readLocalDocument(f.attachment,f.context),/invalid_local_document_batch/);});
