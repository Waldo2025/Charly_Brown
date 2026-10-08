// SVG diagrams are derived from the same measurements as telemetry. Raster artwork
// remains a backdrop and can never replace these scales, data or geometry.
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const fmt=value=>!Number.isFinite(value)?"—":Math.abs(value)>=1e5||Math.abs(value)>0&&Math.abs(value)<.001?value.toExponential(2):Number(value.toFixed(3)).toString();
const text=(x,y,value,anchor="middle",color="var(--sim-text)")=>`<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${color}" font-size="20" font-family="system-ui,sans-serif">${esc(value)}</text>`;
const line=(x1,y1,x2,y2,color="var(--sim-line)",width=2)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"/>`;
const point=(x,y,color="var(--sim-secondary)",radius=6)=>`<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}"/>`;
const clean=points=>(points||[]).filter(p=>Array.isArray(p)&&p.length>=2&&p.every(Number.isFinite));
function plot(visual){
  const points=clean(visual.points),second=clean(visual.second),marker=clean([visual.marker]),all=[...points,...second,...marker];
  if(!all.length)return text(320,200,"No hay puntos válidos en este dominio.");
  let xmin=Math.min(0,...all.map(p=>p[0])),xmax=Math.max(0,...all.map(p=>p[0])),ymin=Math.min(0,...all.map(p=>p[1])),ymax=Math.max(0,...all.map(p=>p[1]));
  if(xmin===xmax){xmin-=1;xmax+=1;}if(ymin===ymax){ymin-=1;ymax+=1;}
  const sx=x=>85+(x-xmin)/(xmax-xmin)*510,sy=y=>315-(y-ymin)/(ymax-ymin)*250;
  let svg="";
  for(let i=0;i<=4;i++){const x=xmin+(xmax-xmin)*i/4,y=ymin+(ymax-ymin)*i/4;svg+=line(sx(x),65,sx(x),315)+line(85,sy(y),595,sy(y))+text(sx(x),342,fmt(x))+text(73,sy(y)+7,fmt(y),"end");}
  svg+=line(sx(0),65,sx(0),315,"var(--sim-muted)")+line(85,sy(0),595,sy(0),"var(--sim-muted)");
  const path=(data,color)=>visual.discrete?data.map(p=>point(sx(p[0]),sy(p[1]),color,4)).join(""):`<polyline points="${data.map(p=>`${sx(p[0])},${sy(p[1])}`).join(" ")}" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round"/>`;
  svg+=path(points,"var(--sim-accent)")+path(second,"var(--sim-secondary)");
  marker.forEach(p=>{svg+=point(sx(p[0]),sy(p[1]))+text(320,38,`P = (${fmt(p[0])}, ${fmt(p[1])})`);});
  return svg+text(340,380,visual.xLabel||"x")+text(90,32,visual.yLabel||"y","start");
}
function barChart(visual){
  const entries=(visual.entries||[]).filter(entry=>Number.isFinite(entry[1]));
  const max=Math.max(1,...entries.map(entry=>Math.abs(entry[1]))),row=270/Math.max(1,entries.length),zero=350;
  return line(zero,55,zero,335,"var(--sim-muted)")+entries.map(([label,value],i)=>{const y=65+i*row,width=Math.abs(value)/max*180;return text(24,y+23,label,"start")+`<rect x="${value<0?zero-width:zero}" y="${y}" width="${width}" height="${Math.min(32,row-8)}" rx="4" fill="${value<0?"var(--sim-secondary)":"var(--sim-accent)"}"/>`+text(610,y+23,fmt(value),"end");}).join("")+text(zero,365,`0 · ${visual.unit||"valores"}`);
}
function geometry(visual,time){
  if(visual.type==="circuit"){
    const wire=(x1,y1,x2,y2)=>line(x1,y1,x2,y2,"var(--sim-accent)",4);
    const resistor=(x,y,value,vertical=false)=>`<rect x="${x-(vertical?15:45)}" y="${y-(vertical?38:15)}" width="${vertical?30:90}" height="${vertical?76:30}" fill="var(--sim-panel)" stroke="var(--sim-secondary)" stroke-width="4"/>`+text(x+(vertical?25:0),y+(vertical?6:-30),value,vertical?"start":"middle");
    let svg=wire(90,85,90,170)+wire(90,215,90,300)+wire(90,300,550,300)+wire(550,300,550,85);
    svg+=line(60,175,120,175,"var(--sim-secondary)",5)+line(73,207,107,207,"var(--sim-secondary)",5)+text(40,172,"+")+text(40,217,"−")+text(90,350,`${fmt(visual.voltage)} V`);
    if(visual.parallel){
      svg+=wire(90,85,550,85);
      for(const [x,resistance,index,current] of [[300,visual.r1,1,visual.i1],[550,visual.r2,2,visual.i2]]){
        svg+=wire(x,85,x,150)+wire(x,230,x,300)+resistor(x,190,`R${index}`,true)+point(x,85,"var(--sim-accent)",5)+point(x,300,"var(--sim-accent)",5)+text(x-12,135,`${fmt(current)} A`,"end")+text(x,335,`${fmt(resistance)} Ω`);
      }
    }else{
      svg+=wire(90,85,180,85)+wire(270,85,365,85)+wire(455,85,550,85)+resistor(225,85,"R₁")+resistor(410,85,"R₂")+text(225,140,`${fmt(visual.r1)} Ω`)+text(410,140,`${fmt(visual.r2)} Ω`)+text(325,225,`I₁ = I₂ = ${fmt(visual.current)} A`);
    }
    return svg+text(320,385,visual.parallel?`Paralelo: I = I₁ + I₂ = ${fmt(visual.current)} A`:`Serie: R = R₁ + R₂ = ${fmt(visual.r1+visual.r2)} Ω`);
  }
  if(visual.type==="circle"||visual.type==="orbit"){
    const radius=125,angle=visual.type==="orbit"?time/1000*(visual.speed||0)/Math.max(.001,visual.radius):0;
    return `<circle cx="320" cy="190" r="${radius}" fill="none" stroke="var(--sim-accent)" stroke-width="4"/>`+line(320,190,320+Math.cos(angle)*radius,190-Math.sin(angle)*radius,"var(--sim-secondary)",4)+point(320+Math.cos(angle)*radius,190-Math.sin(angle)*radius)+text(320,365,`r = ${fmt(visual.radius)}${visual.type==="orbit"?` m; rapidez = ${fmt(visual.speed)} m/s`:""}`);
  }
  if(visual.type==="angle"||visual.type==="reflection"){
    const angle=visual.angle*Math.PI/180,cx=320,cy=220;
    if(visual.type==="reflection")return line(70,cy,570,cy,"var(--sim-muted)",5)+line(cx,55,cx,cy)+line(cx-Math.sin(angle)*160,cy-Math.cos(angle)*160,cx,cy,"var(--sim-accent)",5)+line(cx,cy,cx+Math.sin(angle)*160,cy-Math.cos(angle)*160,"var(--sim-secondary)",5)+text(cx,330,`Incidencia = reflexión = ${fmt(visual.angle)}°`)+text(cx,38,"Normal");
    return line(cx,cy,cx+170,cy,"var(--sim-accent)",5)+line(cx,cy,cx+170*Math.cos(angle),cy-170*Math.sin(angle),"var(--sim-secondary)",5)+`<path d="M ${cx+55} ${cy} A 55 55 0 ${visual.angle>180?1:0} 0 ${cx+55*Math.cos(angle)} ${cy-55*Math.sin(angle)}" fill="none" stroke="var(--sim-secondary)" stroke-width="3"/>`+text(320,370,`${fmt(visual.angle)}°`);
  }
  if(visual.type==="triangle"){
    const points=clean(visual.points);if(points.length!==3)return "";
    const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1])),scale=Math.min(410/Math.max(.001,maxX-minX),235/Math.max(.001,maxY-minY));
    const mapped=points.map(([x,y])=>[100+(x-minX)*scale,305-(y-minY)*scale]);
    return `<polygon points="${mapped.map(p=>p.join(",")).join(" ")}" fill="var(--sim-panel)" fill-opacity=".8" stroke="var(--sim-accent)" stroke-width="4"/>`+mapped.map((p,i)=>text(p[0],p[1]+(i===2?-16:28),["A","B","C"][i])).join("");
  }
  if(visual.type==="interval"){
    if(!Number.isFinite(visual.boundary))return "";
    return line(65,200,575,200)+line(visual.less?65:320,200,visual.less?320:575,200,"var(--sim-accent)",7)+point(320,200)+text(320,245,fmt(visual.boundary))+text(visual.less?100:540,175,visual.less?"←":"→")+text(320,340,visual.less?"Todos los valores a la izquierda, incluido el límite":"Todos los valores a la derecha, incluido el límite");
  }
  const width=Math.max(.001,visual.width),height=Math.max(.001,visual.height),other=visual.secondScale||1,scale=Math.min(390/(width*Math.max(1,other)),210/(height*Math.max(1,other))),w=width*scale,h=height*scale,x=(640-w)/2,y=210-h/2;
  let svg=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="var(--sim-panel)" fill-opacity=".8" stroke="var(--sim-accent)" stroke-width="4"/>`+text(320,y+h+28,`Base = ${fmt(width)}`)+text(320,45,`Altura = ${fmt(height)}`);
  if(visual.type==="box"){const d=Math.min(80,visual.depth*scale*.4);svg+=`<path d="M ${x} ${y} l ${d} ${-d} h ${w} v ${h} l ${-d} ${d} M ${x+w} ${y} l ${d} ${-d}" fill="none" stroke="var(--sim-secondary)" stroke-width="3"/>`+text(320,370,`Profundidad = ${fmt(visual.depth)}`);}
  if(visual.secondScale)svg+=`<rect x="${(640-w*other)/2}" y="${210-h*other/2}" width="${w*other}" height="${h*other}" fill="none" stroke="var(--sim-secondary)" stroke-width="3" stroke-dasharray="8 6"/>`;
  return svg+(visual.caption?text(320,385,visual.caption):"");
}
export function modelDiagramMarkup(measurement,time=0){
  if(measurement.valid===false)return text(320,180,measurement.label)+text(320,225,"Ajusta los controles para obtener una configuración válida.");
  const visual=measurement.visual;
  if(!visual)return "";
  return visual.type==="graph"?plot(visual):visual.type==="bars"?barChart(visual):geometry(visual,time);
}
export function createModelDiagram(parent){
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.classList.add("science-number-line-vector");svg.dataset.scientificDiagram="true";
  svg.setAttribute("viewBox","0 0 640 400");svg.setAttribute("preserveAspectRatio","xMidYMid meet");svg.setAttribute("role","img");parent.append(svg);
  let previous="";
  return {update(measurement,time=0){const markup=modelDiagramMarkup(measurement,time);if(markup!==previous){svg.innerHTML=markup;previous=markup;}svg.setAttribute("aria-label",`${measurement.label}. ${measurement.formula}. ${measurement.displayValue||fmt(measurement.value)} ${measurement.unit||""}`);},destroy(){svg.remove();}};
}
