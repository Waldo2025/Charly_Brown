import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('public');
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/fixture') {res.setHeader('Content-Type','text/html');res.end('<html><body>Media fixture</body></html>');return;}
 if(url.pathname==='/loader-fixture') {res.setHeader('Content-Type','text/html');res.end(`<script src="/js/cache-version-loader.js"></script><script data-cache-src="/delayed-support.js?v=old"></script><script data-cache-src="/check-app.js" data-cache-type="module" data-cache-role="app"></script>`);return;}
 if(url.pathname==='/delayed-support.js'){res.setHeader('Content-Type','text/javascript');setTimeout(()=>res.end('window.supportReady=true;'),250);return;}
 if(url.pathname==='/check-app.js'){res.setHeader('Content-Type','text/javascript');res.end('window.appSawSupport=window.supportReady===true;');return;}
 try {const file=path.join(root,decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))throw new Error();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});const page=await browser.newPage();
const evidence={};
try {
 const loaded=[];page.on('request',req=>{if(req.url().includes('delayed-support'))loaded.push(req.url());});
 await page.goto(base+'/loader-fixture');await page.waitForFunction(()=>typeof window.appSawSupport==='boolean');
 evidence.loader=await page.evaluate(()=>window.appSawSupport);assert.equal(evidence.loader,true);
 assert.equal(new URL(loaded[0]).searchParams.getAll('v').length,1);assert.notEqual(new URL(loaded[0]).searchParams.get('v'),'old');
 await page.goto(base+'/fixture');
 evidence.media=await page.evaluate(async()=>{
  const {PodcasterPlaybackController:Controller}=await import('/podcaster/podcaster-playback-controller.js');
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;document.body.appendChild(canvas);
  const ctx=canvas.getContext('2d'),stream=canvas.captureStream(20),chunks=[];const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});
  recorder.ondataavailable=e=>chunks.push(e.data);const stopped=new Promise(r=>recorder.onstop=r);recorder.start();
  for(let i=0;i<8;i++){ctx.fillStyle=i%2?'#00ff00':'#0000ff';ctx.fillRect(0,0,160,90);await new Promise(r=>setTimeout(r,50));}recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());
  const video=document.createElement('video');video.muted=true;video.preload='auto';video.src=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));document.body.appendChild(video);
  await new Promise(r=>video.addEventListener('loadeddata',r,{once:true}));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const c=new Controller();video.dataset.src='logical-video';video.dataset.mediaSourceGeneration=String(c.getMediaSourceGeneration('logical-video'));
  const at=performance.now();const ready=await c.waitForStageVideoFrame(video,'logical-video');const frameWaitMs=performance.now()-at;
  // A WAV with audible signal from its first sample verifies a decoded real source.
  const rate=24000,n=rate*2,buf=new ArrayBuffer(44+n*2),view=new DataView(buf);const str=(p,s)=>[...s].forEach((ch,i)=>view.setUint8(p+i,ch.charCodeAt(0)));
  str(0,'RIFF');view.setUint32(4,36+n*2,true);str(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,n*2,true);
  for(let i=0;i<n;i++)view.setInt16(44+i*2,Math.round(16000*Math.sin(2*Math.PI*440*i/rate)),true);
  const source=URL.createObjectURL(new Blob([buf],{type:'audio/wav'}));const audio=new Audio(source);document.body.appendChild(audio);await new Promise(r=>audio.addEventListener('canplay',r,{once:true}));
  const clip={downloadUrl:source,durationSec:2},segment={rowId:'r',startMs:1000,durationMs:500,trimInMs:0,trimOutMs:500};
  c.state.session={id:'s'};c.state.isPlaying=true;c.dialoguePlayers.r=audio;c.dialogueAudioSourceKeys.r=c.resolveAudioSourceKey(clip);audio.dataset.initialized='true';
  c.deps={getPodcastVideoConfig:()=>({geminiDialogueTrack:{enabled:true,segments:[segment]}}),resolveDialogueAudioForRow:()=>clip,resolveDialogueAudioPlaybackRate:()=>1,resolveTimelineClipMix:()=>({voiceVolume:1}),buildTimelineRuntimeEntries:()=>[]};
  c.syncBackgroundMusic=async()=>{};c.prepareDialogueRow=async()=>({player:audio,ready:true});
  await c.syncAudio(999,1);const pausedBefore=audio.paused;
  await c.syncAudio(1000,1);const sourceOffsetAtStart=audio.currentTime,playingAfterStart=!audio.paused;
  await new Promise(r=>setTimeout(r,50));await c.syncAudio(1500,1);const pausedAtTrim=audio.paused;
  audio.pause();video.remove();audio.remove();URL.revokeObjectURL(source);URL.revokeObjectURL(video.src);
  return {ready,frameWaitMs,pausedBefore,sourceOffsetAtStart,playingAfterStart,pausedAtTrim};
 });
 assert.equal(evidence.media.ready,true);assert.ok(evidence.media.frameWaitMs<350,JSON.stringify(evidence.media));
 assert.equal(evidence.media.pausedBefore,true);assert.equal(evidence.media.playingAfterStart,true);assert.ok(evidence.media.sourceOffsetAtStart<.025);assert.equal(evidence.media.pausedAtTrim,true);
 if (process.env.SNOOPY_FULL_SMOKE === '1') {
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(base+'/podcaster.html');await page.waitForTimeout(12000);
   evidence.startup={errors,title:await page.title(),mediaApi:await page.evaluate(()=>typeof window.PodcasterSceneMedia)};
 }
 console.log(JSON.stringify(evidence,null,2));await mkdir('artifacts/snoopy-media',{recursive:true});await writeFile('artifacts/snoopy-media/chromium.json',JSON.stringify(evidence,null,2)+'\n');
} finally {await browser.close();server.close();}
