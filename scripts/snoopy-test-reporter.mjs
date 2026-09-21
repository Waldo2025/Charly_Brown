export default async function* reporter(source) {
 for await(const event of source) {
  if(event.type==='test:fail') {
   const d=event.data,e=d.details?.error,cause=e?.cause||e;
   yield JSON.stringify({type:'failure',name:d.name,file:d.file,line:d.line,error:String(cause?.message||e||'').slice(0,500),stack:String(cause?.stack||'').split('\n').filter(l=>/at /.test(l)).slice(0,3)})+'\n';
  }
  if(event.type==='test:summary') yield JSON.stringify({type:'summary',...event.data})+'\n';
 }
}
