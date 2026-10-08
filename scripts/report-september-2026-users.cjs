const path=require('node:path'),{createRequire}=require('node:module'),rf=createRequire(path.resolve(__dirname,'../functions/package.json'));
const {initializeApp,cert,deleteApp}=rf('firebase-admin/app'),{getFirestore}=rf('firebase-admin/firestore');
const app=initializeApp({credential:cert(path.resolve(__dirname,'../charly-brown-firebase-adminsdk-fbsvc-6c32e4f96b.json')),projectId:'charly-brown'});
getFirestore(app).collection('users').select('email').get().then(s=>console.log(JSON.stringify(Object.fromEntries(s.docs.map(d=>[d.id,d.data().email||''])),null,2))).catch(e=>{console.error(e.code||e.message);process.exitCode=1;}).finally(()=>deleteApp(app));
