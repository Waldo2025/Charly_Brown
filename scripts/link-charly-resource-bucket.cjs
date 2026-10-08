const {execFileSync}=require('node:child_process');
const token=execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8'}).trim();
fetch('https://firebasestorage.googleapis.com/v1beta/projects/128488238449/buckets/charly-brown-mcp-resources:addFirebase',{method:'POST',headers:{Authorization:`Bearer ${token}`,'x-goog-user-project':'charly-brown'}}).then(async res=>{ if(!res.ok) throw Error(`${res.status}: ${await res.text()}`); console.log('Bucket MCP vinculado a Firebase.'); }).catch(error=>{console.error(error.message);process.exitCode=1;});
