const { resolveAccess } = require("./controller.js");
const { lookup } = require("node:dns/promises");
const { isIP } = require("node:net");
function failure(status,message){return Object.assign(new Error(message),{status});}
function permittedProfile(profile,claims){
  const p=profile||claims||{};
  if(p.approved===false||p.isApproved===false||p.aprobado===false)return false;
  return resolveAccess(p,{}).allowed;
}
function privateAddress(ip){
  if(ip.includes(":"))return true;
  const [a,b]=ip.split(".").map(Number);
  return a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||
    a===192&&b===168||a===100&&b>=64&&b<=127||a>=224;
}
function createNetworkPolicy(origins,resolve=lookup){
  const allowed=new Set(origins);
  return async raw=>{
    let url;try{url=new URL(raw);}catch{return false;}
    if(url.protocol!=="https:"||url.username||url.password||!allowed.has(url.origin)||isIP(url.hostname))return false;
    try{const addresses=await resolve(url.hostname,{all:true,family:4});return addresses.length>0&&addresses.every(entry=>!privateAddress(entry.address));}
    catch{return false;}
  };
}
function assertSession(data,uid){
  if(!data||!(data.ownerId===uid||Array.isArray(data.collaborators)&&data.collaborators.includes(uid)))
    throw failure(403,"No tienes acceso a esta sesión.");
}
module.exports={failure,permittedProfile,createNetworkPolicy,assertSession};
