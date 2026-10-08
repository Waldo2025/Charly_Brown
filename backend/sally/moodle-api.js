function nestedParams(prefix,value,out){if(Array.isArray(value)){value.forEach((entry,index)=>nestedParams(`${prefix}[${index}]`,entry,out));return;}if(value&&typeof value==="object"){for(const [key,entry] of Object.entries(value))nestedParams(prefix?`${prefix}[${key}]`:key,entry,out);return;}if(value!==undefined&&value!==null)out.append(prefix,String(value));}
function createMoodleApi({token=process.env.SALLY_MOODLE_TOKEN,allowedOrigins=[],fetchImpl=fetch}={}){
  const origins=new Set(allowedOrigins.map(value=>String(value).trim()).filter(Boolean));
  function endpoint(raw){const url=new URL(raw);if(!origins.has(url.origin))throw Error("El servicio web Moodle no pertenece a un origen autorizado.");return new URL("/webservice/rest/server.php",url.origin);}
  async function call(rawUrl,wsfunction,args={}){
    if(!token)return null;const body=new URLSearchParams({wstoken:token,wsfunction,moodlewsrestformat:"json"});for(const [key,value] of Object.entries(args))nestedParams(key,value,body);
    const response=await fetchImpl(endpoint(rawUrl),{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body,signal:AbortSignal.timeout(30000)});const data=await response.json().catch(()=>null);if(!response.ok||data?.exception)throw Error(data?.message||`Moodle Web Service respondió ${response.status}.`);return data;
  }
  function courseId(url){const id=new URL(url).searchParams.get("id");if(!/^\d+$/.test(id||""))throw Error("La URL no contiene un identificador de curso Moodle.");return Number(id);}
  return {available:Boolean(token),async readCourse(url){return call(url,"core_course_get_contents",{courseid:courseId(url)});},async findUsers(url,query){return call(url,"core_user_get_users",{criteria:[{key:"email",value:`%${query}%`} ]});},async executeCourse(url,operation){const p=operation.payload||{};if(p.courseId)return call(url,"core_course_update_courses",{courses:[{id:Number(p.courseId),fullname:p.fullname,shortname:p.shortname,idnumber:p.idnumber||"",summary:p.summary||""}]});return call(url,"core_course_create_courses",{courses:[{fullname:p.fullname,shortname:p.shortname,categoryid:Number(p.categoryId||1),idnumber:p.idnumber||"",summary:p.summary||"",summaryformat:1,format:"topics"}]});}};
}
module.exports={createMoodleApi,nestedParams};
