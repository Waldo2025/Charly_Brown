// Cloud Run smoke test: open Moodle's public login only, never authenticate.
const {createSallyBrownController}=require("./controller.js");
const {createNetworkPolicy}=require("./policy.js");
const {mkdtemp,rm}=require("node:fs/promises");
const {tmpdir}=require("node:os");
const path=require("node:path");
(async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),"sally-smoke-"));
  const controller=createSallyBrownController({getPath:()=>directory,sendEvent:()=>{},
    requestAllowed:createNetworkPolicy(["https://aprende.asc.education","https://fonts.googleapis.com","https://fonts.gstatic.com","https://cdn.jsdelivr.net"])});
  const actor={uid:"infrastructure-smoke"};
  try{
    const snapshot=await controller.start({url:"https://aprende.asc.education/login/index.php"},actor);
    if(!snapshot?.image?.startsWith("data:image/jpeg;base64,"))throw Error("Chromium did not produce a screenshot");
    console.log(JSON.stringify({ok:true,chromium:true,moodleReachable:true,screenshotBytes:snapshot.image.length}));
  }finally{await controller.close({},actor);await rm(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
