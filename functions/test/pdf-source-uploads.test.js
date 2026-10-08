const test=require('node:test'),assert=require('node:assert/strict');
const {input,MAX_BYTES,registerPdfSourceUploadRoutes}=require('../src/pdf-source-uploads.js');
test('source upload validates IDs and the 1 GiB bound',()=>{assert.equal(input({sessionId:'s',revisionId:'r',fileId:'f',size:MAX_BYTES}).size,MAX_BYTES);assert.throws(()=>input({sessionId:'../other',revisionId:'r',fileId:'f',size:5}),/identifier/);assert.throws(()=>input({sessionId:'s',revisionId:'r',fileId:'f',size:MAX_BYTES+1}),/size/);});
test('finalize validates ownership, PDF signature, size and attaches the source',async()=>{
  const records=new Map([['analizarPDF/s',{ownerId:'user'}],['analizarPDF/s/revisions/r',{files:[{id:'f'}]}]]),handlers={};
  const ref=path=>({collection:name=>collection(path+'/'+name),get:async()=>({data:()=>records.get(path)}),set:async data=>records.set(path,data),update:async data=>records.set(path,{...records.get(path),...data})});
  const collection=path=>({doc:id=>ref(path+'/'+id)}),db={collection,runTransaction:async fn=>fn({get:r=>r.get(),update:(r,d)=>r.update(d)})};
  let owner='user',size=5,magic='%PDF-',uploadId;
  const bucket={file:()=>({createResumableUpload:async options=>{uploadId=options.metadata.metadata.uploadId;return['https://storage.googleapis.com/fixture'];},getMetadata:async()=>[{size,metadata:{ownerId:owner,uploadId}}],download:async()=>[Buffer.from(magic)]})};
  registerPdfSourceUploadRoutes({post:(path,handler)=>handlers[path]=handler},{db,bucket,authenticate:async()=>({uid:owner})});
  const invoke=async(path,body)=>{let result;await handlers['/api/analizar-pdf/sources/'+path]({body,headers:{}},{json:value=>result=value},error=>{throw error;});return result;};
  const created=await invoke('create',{sessionId:'s',revisionId:'r',fileId:'f',size:5});
  magic='invalid';await assert.rejects(invoke('finalize',created),/signature/);
  magic='%PDF-';size=6;await assert.rejects(invoke('finalize',created),/metadata_mismatch/);
  size=5;const result=await invoke('finalize',created);assert.equal(records.get('analizarPDF/s/revisions/r').files[0].sourceStoragePath,result.storagePath);
  owner='other';await assert.rejects(invoke('finalize',created),/upload_not_found/);
});
