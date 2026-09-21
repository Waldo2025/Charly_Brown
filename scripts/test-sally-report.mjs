import assert from "node:assert/strict";
import {collectCourseInventories} from "../public/js/sally-workflow.js";
import {courseReport} from "../public/js/sally-report.js";
const saved=[];
const inventory={title:"Modelo",sections:[{title:"Tema",modules:[{type:"page",url:"/1",title:"Lectura"}]}],pages:[{title:"Lectura",text:"Objetivos del aprendizaje",design:[{font:"Inter"}]}],coverage:{analyzed:1,discovered:1,complete:true}};
await assert.rejects(()=>collectCourseInventories({available:true,modelUrl:"https://moodle.test/course/view.php?id=1",targetUrl:"https://moodle.test/course/view.php?id=2",
  open:async view=>{if(view==="target")throw Error("Inicia sesión");},inspect:async()=>inventory,progress:()=>{},onInventory:async(data,view)=>saved.push({data,view})}),/Inicia sesión/);
assert.equal(saved.length,1);assert.equal(saved[0].view,"model");
const report=courseReport(saved[0].data);
assert.match(report,/Lectura completada/);assert.match(report,/Inter/);assert.match(report,/Objetivos del aprendizaje/);
assert.match(courseReport({...inventory,coverage:{complete:false,analyzed:1,discovered:218}}),/Lectura parcial/);
console.log("PASS: first course survives second-course login failure; report includes coverage, structure and observed content.");
