// Illustrated artwork is contextual. Only measured or explicitly schematic motion
// belongs here; arbitrary looping artwork must not imply a physical prediction.
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const finite=(x,f=0)=>Number.isFinite(Number(x))?Number(x):f;
export function illustratedLayerTransform({model,layer,measurement={},values={},time=0,width,height,reduced=false}){
  const mobile=width<600,anchor=mobile?(layer.mobileAnchor||layer.anchor):layer.anchor;
  let x=anchor.x*width,y=anchor.y*height,rotation=0,alpha=1;
  const scale=mobile?(layer.mobileScale??layer.scale):layer.scale;
  const seconds=reduced?0:Math.max(0,time)/1000;
  let semantic="contextual-static";
  if(model==="physics-motion"){
    x=width*(.5+.4*clamp(finite(measurement.position)/100,-1,1));semantic="position-snapshot";
  }else if(model==="physics-buoyancy"){
    const fraction=clamp(finite(measurement.submergedFraction),0,1);
    y=height*(.48+.17*fraction+(finite(measurement.netForce)<0?.14:0));semantic="equilibrium-submersion";
  }else if(model==="physics-motion"||model==="physics-kinetic"||model==="friction"){
    const velocity=finite(values.velocity,finite(values.initialVelocity)),acceleration=finite(measurement.acceleration,finite(values.acceleration));
    const distance=velocity*seconds+.5*acceleration*seconds*seconds;
    x=width*(.16+.68*clamp(distance/100,0,1));semantic="displacement-100m-track";
  }else if(model==="gravity"){
    const fall=.5*finite(values.gravity,9.8)*seconds*seconds;
    y=height*(.18+.6*clamp(fall/Math.max(.001,finite(values.height,10)),0,1));semantic="free-fall";
  }else if(/^(physics-)?projectile(-motion)?$/.test(model)){
    semantic="launch-platform";
  }else if(model==="physics-hydraulic"){
    y=height*(measurement.lifts?.5:.66);semantic="force-balance-state";
  }else if(model==="cell-division"){
    alpha=.8+.2*clamp(finite(measurement.effectivePhase,finite(values.phase))/4,0,1);semantic="illustrative-phase";
  }
  return{x,y,rotation,alpha,scale,semantic};
}
export function drawIllustratedScienceOverlay(g,{model,measurement,values,width:w,height:h,time,reduced,palette,hero}){
  const markers=[];
  if(model==="physics-buoyancy"&&hero){
    const cx=hero.x,cy=hero.y;g.lineStyle(2,palette.accent,.6).lineBetween(w*.08,h*.53,w*.92,h*.53);
    for(const [sign,force,color] of [[-1,measurement.value,palette.accent],[1,measurement.weight,palette.secondary]]){
      const length=45*clamp(finite(force)/Math.max(1,finite(measurement.weight)),0,1.4),end=cy+sign*length;
      g.lineStyle(3,color,1).lineBetween(cx,cy,cx,end).lineBetween(cx,end,cx-6,end-sign*8).lineBetween(cx,end,cx+6,end-sign*8);
    }markers.push({kind:"forces",buoyancy:measurement.value,weight:measurement.weight});
  }
  if(model==="optics"||model==="physics-reflection"){
    const incident=finite(values.angle,35)*Math.PI/180,output=finite(measurement.value)*Math.PI/180,cx=w*.5,cy=h*.52,length=Math.min(w,h)*.33;
    g.lineStyle(1,0xffffff,.65).lineBetween(cx,cy-length,cx,cy+length);
    g.lineStyle(4,palette.secondary,1).lineBetween(cx-Math.sin(incident)*length,cy-Math.cos(incident)*length,cx,cy);
    g.lineStyle(4,palette.accent,1).lineBetween(cx,cy,cx+Math.sin(output)*length,cy+(model==="physics-reflection"?-1:1)*Math.cos(output)*length);
    markers.push({kind:"angles",incident:finite(values.angle),output:measurement.value});
  }
  if(/^(physics-)?projectile(-motion)?$/.test(model)&&hero){
    const speed=finite(values.initialVelocity,finite(values.velocity,finite(values.power,20))),angle=finite(values.angle,45)*Math.PI/180,gravityValue=Math.max(.01,finite(values.gravity,9.8)),duration=2*speed*Math.sin(angle)/gravityValue,elapsed=reduced?0:(Math.max(0,time)/1000)%Math.max(.01,duration),range=Math.max(1,speed*speed*Math.sin(2*angle)/gravityValue),apex=Math.max(1,speed*speed*Math.sin(angle)**2/(2*gravityValue)),originX=hero.x+hero.width*.38*Math.cos(angle),originY=hero.y-hero.height*.38*Math.sin(angle),travelX=w*.76,travelY=h*.5;
    g.lineStyle(3,palette.accent,.8).beginPath();
    for(let i=0;i<=32;i++){const q=i/32,flight=duration*q,px=originX+travelX*(speed*Math.cos(angle)*flight/range),py=originY-travelY*Math.max(0,speed*Math.sin(angle)*flight-gravityValue*flight*flight/2)/apex;i?g.lineTo(px,py):g.moveTo(px,py)}
    g.strokePath();
    const x=originX+travelX*(speed*Math.cos(angle)*elapsed/range),y=originY-travelY*Math.max(0,speed*Math.sin(angle)*elapsed-gravityValue*elapsed*elapsed/2)/apex;
    g.fillStyle(palette.secondary,1).fillCircle(x,y,9);markers.push({kind:"ballistic-trajectory",range,flightTime:duration,maxHeight:apex,x:Math.round(x),y:Math.round(y)});
  }
  if(hero&&values.light!=null&&(measurement.photosynthesisRate!=null||measurement.plantGrowth!=null)){
    const count=Math.round(clamp(finite(values.light)/10,0,12)),progress=reduced?.5:(Math.max(0,time)/2500)%1;
    for(let i=0;i<count;i++){
      const startX=w*(.12+i*.055),startY=h*.12,q=(progress+i/count)%1;
      g.fillStyle(palette.secondary,.8).fillCircle(startX+(hero.x-startX)*q,startY+(hero.y-startY)*q,4);
    }
    markers.push({kind:"illustrative-light-input",light:values.light,relativeRate:measurement.photosynthesisRate??measurement.plantGrowth});
  }
  // Circuit current is conveyed in the exact diagram, never by moving the bench.
  return markers;
}

const escapeText=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const number=value=>Number.isFinite(value)?Number(value.toPrecision(4)).toString():"—";
const label=(x,y,value,size=20)=>`<text x="${x}" y="${y}" text-anchor="middle" fill="var(--sim-text)" font-family="system-ui,sans-serif" font-weight="600" font-size="${size}">${escapeText(value)}</text>`;
const path=(d,color="var(--sim-accent)",width=4)=>`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const block=(x,y,w,h)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="url(#science-material)" stroke="var(--sim-accent)" stroke-width="3"/>`;
export function illustratedApparatusMarkup(model,m,v,time=0,controlLabels={}){
  let body="",kind="";
  if(model.startsWith("math-")&&["bars","graph"].includes(m.visual?.type)){
    kind="mathematical-materials";
    if(model==="math-fractions"){
      const fractions=[[finite(v.a),Math.max(1,finite(v.b,1))],[finite(v.c),Math.max(1,finite(v.d,1))],[finite(m.value),1]];
      fractions.forEach(([numerator,denominator],row)=>{
        const value=numerator/denominator,y=95+row*90,unitWidth=260,filled=(Math.abs(value)>1?Math.abs(value)%1:Math.abs(value))*unitWidth;
        body+=`<rect x="210" y="${y}" width="${unitWidth}" height="45" rx="3" fill="var(--sim-panel)" stroke="var(--sim-accent)" stroke-width="2"/><rect x="210" y="${y}" width="${filled}" height="45" fill="var(--sim-accent)" fill-opacity=".7"/>`;
        if(denominator<=20)for(let i=1;i<denominator;i++)body+=path(`M${210+i*unitWidth/denominator} ${y} V${y+45}`,'var(--sim-muted)',1);
        if(Math.abs(value)>1)body+=label(340,y-9,`${Math.floor(Math.abs(value))} unidades completas + fracción`,13);
        body+=label(110,y+29,row===2?"Resultado":`${number(numerator)}/${number(denominator)}`,18)+label(550,y+29,row===2?m.displayValue:number(value),18);
      });body+=label(320,385,"Cada tira completa representa una unidad; valor exacto a la derecha",15);
    }else if(m.visual.type==="bars"){
      const entries=m.visual.entries||[];const magnitude=Math.max(1,...entries.map(e=>Math.abs(e[1]))),unit=magnitude>20?magnitude/20:1;
      entries.slice(0,4).forEach(([name,value],row)=>{const count=Math.min(20,Math.floor(Math.abs(value)/unit)),remainder=Math.abs(value)/unit-count,y=95+row*65;
        body+=label(110,y+21,name,17);
        for(let i=0;i<count;i++)body+=block(205+i%10*29,y+Math.floor(i/10)*24,23,19);
        if(remainder>.001)body+=block(205+count%10*29,y+Math.floor(count/10)*24,23*remainder,19);
        body+=label(550,y+21,`${value<0?"− ":""}${number(value)}`,18);
      });body+=label(320,375,`Una ficha = ${number(unit)} · signo indicado junto al valor`,16);
    }else{
      const terms=Object.entries(v).filter(([key,value])=>!key.startsWith('_')&&!/^(operation|group|inverse|quantity|relation)$/.test(key)&&typeof value==="number").slice(0,6);
      terms.forEach(([key,value],i)=>{const x=85+i%3*180,y=110+Math.floor(i/3)*105;body+=block(x,y,145,78)+label(x+72,y+27,controlLabels[key]||key,13)+label(x+72,y+58,number(value),24);});
      body+=label(320,60,m.formula,19)+label(320,370,`${m.label}: ${m.displayValue||number(m.value)} ${m.unit||""}`,18);
    }
  }else if(model.startsWith("physics-")&&["bars","graph"].includes(m.visual?.type)){
    kind="physical-apparatus";
    if(model==="physics-buoyancy"){
      const fraction=clamp(finite(m.submergedFraction),0,1),y=180+fraction*75+(finite(m.netForce)<0?45:0);
      body=`<path d="M60 235 H580 V340 H60Z" fill="var(--sim-accent)" fill-opacity=".2"/>`+path('M60 235 H580','var(--sim-accent)',3)+`<path d="M210 ${y} H440 L400 ${y+65} H250Z" fill="url(#science-material)" stroke="var(--sim-secondary)" stroke-width="4"/>`+label(320,90,`Fracción sumergida ${number(fraction)}`)+label(320,380,m.label,18);
    }else if(/temperature|heat|convection|radiation|phase/.test(model)){
      const temperature=finite(v.temperature,finite(v.surface,finite(v.deltaTemperature))),fill=clamp((temperature+50)/550,0,1)*190;
      body=path('M 100 90 V 310 Q 100 345 145 345 H 330 Q 365 345 365 310 V 90','var(--sim-muted)',6)+`<path d="M105 210 H360 V310 Q360 340 330 340 H145 Q105 340 105 310Z" fill="var(--sim-accent)" fill-opacity=".28"/>`+block(465,75,30,220)+`<rect x="471" y="${285-fill}" width="18" height="${fill}" rx="7" fill="var(--sim-secondary)"/>`+`<circle cx="480" cy="310" r="24" fill="var(--sim-secondary)"/>`+label(235,180,`${number(temperature)} ${v.deltaTemperature!=null?"ΔK":"°C"}`)+label(320,380,m.label,18);
    }else if(model==="physics-hydraulic"){
      const y=m.lifts?140:210;
      body=path('M100 90 V310 H500 V90','var(--sim-muted)',7)+path('M150 180 V265 H425 V190','var(--sim-accent)',38)+block(80,170,115,20)+block(380,y,160,20)+path(`M460 ${y} V${y-48}`)+block(410,y-98,100,50)+label(130,115,`${number(v.inputForce)} N`)+label(465,335,`${number(m.outputForce)} N`);
    }else if(model==="physics-spring"){
      const end=360+finite(v.extension)*65;
      body=path('M90 70 V290','var(--sim-muted)',9)+path('M90 175 '+Array.from({length:14},(_,i)=>`L${110+i*(end-140)/13} ${175+(i%2?22:-22)}`).join(' ')+` L${end} 175`)+block(end,135,75,80)+label(320,325,`Elongación ${number(v.extension)} m · F ${number(m.value)} N`);
    }else if(model==="physics-charge"||model==="physics-magnetism"){
      const current=finite(v.current),charge1=finite(v.q1),charge2=finite(v.q2);
      if(model==="physics-charge")body=`<circle cx="190" cy="195" r="48" fill="url(#science-material)" stroke="var(--sim-accent)" stroke-width="4"/><circle cx="450" cy="195" r="48" fill="url(#science-material)" stroke="var(--sim-secondary)" stroke-width="4"/>`+label(190,204,`${charge1>0?"+":""}${number(charge1)}`)+label(450,204,`${charge2>0?"+":""}${number(charge2)}`)+path('M190 285 H450')+label(320,325,`${number(v.distance)} m · ${m.label}`);
      else body=path('M320 60 V335','var(--sim-secondary)',12)+[60,100,145].map(r=>`<ellipse cx="320" cy="205" rx="${r}" ry="${r*.4}" fill="none" stroke="var(--sim-accent)" stroke-width="2"/>`).join('')+label(320,375,`${number(current)} A · sentido ${current>=0?"positivo":"negativo"}`);
    }else if(model==="physics-expansion"){
      const original=finite(v.length,1),final=original+finite(m.value)/1000;
      body=block(110,130,380,45)+block(110,225,380*final/Math.max(.001,original),45)+label(320,110,`L₀ = ${number(original)} m`)+label(320,320,`L = ${number(final)} m · variación a escala`);
    }else if(model==="physics-weight"){
      body=path('M150 75 H480 M320 75 V160','var(--sim-muted)',7)+block(265,160,110,100)+label(320,217,`${number(v.mass)} kg`)+path('M320 270 V325 M310 315 L320 325 L330 315','var(--sim-secondary)',4)+label(320,370,`Peso = ${number(m.value)} N`);
    }else if(model==="physics-pressure"){
      const width=clamp(Math.sqrt(finite(v.area))*90,40,360);
      body=path('M70 300 H570','var(--sim-muted)',8)+block(320-width/2,220,width,75)+path('M320 110 V200 M310 190 L320 200 L330 190','var(--sim-secondary)',5)+label(320,80,`${number(v.force)} N`)+label(320,355,`Área de apoyo = ${number(v.area)} m²`);
    }else if(model==="physics-conservation"){
      const fraction=clamp(finite(v.fraction),0,1),y=85+fraction*220;
      body=path('M140 70 V325 H510','var(--sim-muted)',4)+block(270,y,65,55)+label(450,115,`Ep ${number(m.potential)} J`)+label(450,170,`Ec ${number(m.kinetic)} J`)+label(320,380,`Altura inicial ${number(v.initialHeight)} m`);
    }else if(["physics-work","physics-impulse","physics-power"].includes(model)){
      const angle=finite(v.angle)*Math.PI/180,dx=Math.cos(angle)*100,dy=-Math.sin(angle)*100;
      body=path('M70 305 H570','var(--sim-muted)',7)+block(260,220,100,75)+path(`M310 220 l${dx} ${dy}`,'var(--sim-secondary)',5)+label(320,100,v.force!=null?`F = ${number(v.force)} N`:`Trabajo = ${number(v.work)} J`)+label(320,365,v.distance!=null?`Recorrido = ${number(v.distance)} m`:`Duración = ${number(v.duration??v.time)} s`);
    }else{
      // A tangible cart/weight bench complements the precise plot below.
      const mass=finite(v.mass,finite(v.loadMass,1)),size=clamp(48+Math.cbrt(Math.abs(mass))*12,48,95),x=240;
      body=path('M65 300 H575','var(--sim-muted)',8)+block(x,300-size-25,120,size)+`<circle cx="265" cy="290" r="15" fill="var(--sim-secondary)"/><circle cx="335" cy="290" r="15" fill="var(--sim-secondary)"/>`+label(300,245-size,`${number(mass)} kg`)+label(320,365,`${m.label}: ${number(m.value)} ${m.unit||""}`,18);
    }
  }
  return body?`<defs><linearGradient id="science-material" x2="1" y2="1"><stop stop-color="var(--sim-panel)"/><stop offset="1" stop-color="var(--sim-accent)" stop-opacity=".4"/></linearGradient></defs><g data-apparatus="${kind}">${body}</g>`:"";
}
export function createIllustratedApparatus(parent,model,controls=[]){
  const controlLabels=Object.fromEntries(controls.map(c=>[c.id,c.label]));
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.classList.add("science-number-line-vector");svg.dataset.illustratedApparatus="true";svg.setAttribute("viewBox","0 0 640 400");svg.setAttribute("role","img");parent.append(svg);
  let previous="";
  return{update(m,v,time){const markup=illustratedApparatusMarkup(model,m,v,time,controlLabels);if(markup!==previous){svg.innerHTML=markup;previous=markup;}svg.setAttribute("aria-label",`Material didáctico. ${m.label}. ${m.formula}`)},destroy(){svg.remove()}};
}
