const {randomUUID}=require('node:crypto');
const {getAdminServices,resolveAuthContext,asyncRoute}=require('./common.js');
const MAX_BYTES=1024**3;
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const identifier=value=>{if(typeof value!=='string'||value==='.'||value==='..'||!/^[\w.-]{1,120}$/.test(value))throw fail('invalid_pdf_source_identifier');return value;};
function input(body){const value={sessionId:identifier(body.sessionId),revisionId:identifier(body.revisionId),fileId:identifier(body.fileId),size:Number(body.size)};if(!Number.isSafeInteger(value.size)||value.size<5||value.size>MAX_BYTES)throw fail('invalid_pdf_source_size',413);return value;}
async function owned(db,uid,value){const sessionRef=db.collection('analizarPDF').doc(value.sessionId),session=await sessionRef.get();if(session.data()?.ownerId!==uid)throw fail('pdf_source_forbidden',403);const revisionRef=sessionRef.collection('revisions').doc(value.revisionId),revision=await revisionRef.get();if(!revision.data()?.files?.some(file=>file.id===value.fileId))throw fail('pdf_source_file_not_found',404);return{sessionRef,revisionRef};}
function registerPdfSourceUploadRoutes(app,dependencies={}){
  const services=()=>dependencies.db?dependencies:getAdminServices(),authenticate=dependencies.authenticate||resolveAuthContext;
  app.post('/api/analizar-pdf/sources/create',asyncRoute(async(req,res)=>{
    const auth=await authenticate(req),value=input(req.body||{}),{db,bucket}=services();await owned(db,auth.uid,value);
    const uploadId=randomUUID(),storagePath=`analizar-pdf/sources/${auth.uid}/${value.sessionId}/${value.revisionId}/${value.fileId}-${uploadId}.pdf`;
    const [uploadUrl]=await bucket.file(storagePath).createResumableUpload({origin:req.headers.origin||undefined,metadata:{contentType:'application/pdf',cacheControl:'private, no-store',metadata:{ownerId:auth.uid,uploadId}}});
    await db.collection('analizarPdfSourceUploads').doc(uploadId).set({...value,ownerId:auth.uid,storagePath,expiresAt:Date.now()+3600000});res.json({uploadId,uploadUrl});
  }));
  app.post('/api/analizar-pdf/sources/finalize',asyncRoute(async(req,res)=>{
    const auth=await authenticate(req),{db,bucket}=services(),uploadRef=db.collection('analizarPdfSourceUploads').doc(identifier(req.body?.uploadId)),record=(await uploadRef.get()).data();
    if(!record||record.ownerId!==auth.uid||record.expiresAt<Date.now())throw fail('pdf_source_upload_not_found',404);
    const {sessionRef,revisionRef}=await owned(db,auth.uid,record),file=bucket.file(record.storagePath),[metadata]=await file.getMetadata();
    if(Number(metadata.size)!==record.size||record.size>MAX_BYTES||metadata.metadata?.ownerId!==auth.uid||metadata.metadata?.uploadId!==req.body.uploadId)throw fail('pdf_source_metadata_mismatch');
    const [magic]=await file.download({start:0,end:4});if(magic.toString()!=='%PDF-')throw fail('invalid_pdf_source_signature');
    await db.runTransaction(async tx=>{const session=(await tx.get(sessionRef)).data(),revision=(await tx.get(revisionRef)).data();if(session?.ownerId!==auth.uid)throw fail('pdf_source_forbidden',403);if(!revision?.files?.some(f=>f.id===record.fileId))throw fail('pdf_source_file_not_found',404);tx.update(revisionRef,{files:revision.files.map(f=>f.id===record.fileId?{...f,sourceStoragePath:record.storagePath}:f)});});
    res.json({storagePath:record.storagePath,size:record.size});
  }));
}
module.exports={registerPdfSourceUploadRoutes,input,MAX_BYTES};
