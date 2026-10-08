const {createHash,randomUUID}=require("node:crypto");

const FIELD_ALIASES=Object.freeze({
  username:["username","usuario","user","matricula","matrícula"],
  firstname:["firstname","nombre","nombres","first_name"],
  lastname:["lastname","apellido","apellidos","last_name"],
  email:["email","correo","correo_electronico","correo electrónico"],
  password:["password","contrasena","contraseña","clave"],
  course1:["course1","curso","curso1","shortname","nombre_corto"],
  role1:["role1","rol","rol1"]
});

function key(value){return String(value||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[\s-]+/g,"_");}
function csvCell(value){const text=String(value??"").replace(/\r?\n/g," ");return /[",\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;}
function mappedValue(row,name){for(const alias of FIELD_ALIASES[name]){const found=Object.keys(row||{}).find(candidate=>key(candidate)===key(alias));if(found)return String(row[found]??"").trim();}return "";}
function normalizeRole(value){const role=key(value);if(["teacher","profesor","docente","noneditingteacher","profesor_sin_edicion"].includes(role))return "teacher";return "student";}
function normalizeUsername(value){return key(value).replace(/[^a-z0-9._@-]/g,"");}

function prepareUserImport(rows,{defaultCourse=""}={}){
  if(!Array.isArray(rows)||!rows.length||rows.length>1000)throw Error("Incluye entre 1 y 1000 usuarios.");
  const normalized=rows.map((source,index)=>{
    const row={username:normalizeUsername(mappedValue(source,"username")),firstname:mappedValue(source,"firstname"),lastname:mappedValue(source,"lastname"),email:mappedValue(source,"email").toLowerCase(),password:mappedValue(source,"password"),course1:mappedValue(source,"course1")||String(defaultCourse||"").trim(),role1:normalizeRole(mappedValue(source,"role1"))};
    const missing=["username","firstname","lastname","email","password","course1"].filter(field=>!row[field]);
    if(row.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))missing.push("email válido");
    return {...row,rowNumber:index+1,errors:[...new Set(missing)].map(field=>`Falta ${field}`)};
  });
  const usernames=new Set(),emails=new Set();
  for(const row of normalized){if(usernames.has(row.username))row.errors.push("Usuario duplicado");if(emails.has(row.email))row.errors.push("Correo duplicado");usernames.add(row.username);emails.add(row.email);}
  const headers=["username","firstname","lastname","email","password","course1","role1"];
  const csv=[headers.join(","),...normalized.map(row=>headers.map(field=>csvCell(row[field])).join(","))].join("\r\n")+"\r\n";
  const hash=createHash("sha256").update(csv).digest("hex");
  return {id:randomUUID(),hash,csv,createdAt:Date.now(),expiresAt:Date.now()+10*60*1000,preview:normalized.map(({password,...row})=>({...row,passwordMasked:password?"••••••••":""})),blocked:normalized.some(row=>row.errors.length>0),rowCount:normalized.length};
}

function publicImport(value){return {id:value.id,hash:value.hash,batchHash:value.hash,expiresAt:new Date(value.expiresAt).toISOString(),preview:value.preview,blocked:value.blocked,rowCount:value.rowCount};}

module.exports={prepareUserImport,publicImport};
