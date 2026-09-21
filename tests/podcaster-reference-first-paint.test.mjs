import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {sourceFunctions} from './helpers/snoopy-source.mjs';
const code=sourceFunctions(new URL('../public/podcaster/podcaster.js',import.meta.url),['openPodcastPortraitViewer','closePodcastPortraitViewer']);
function fixture(){
 const classes=new Set();const paints=[];
 const viewer={dataset:{},classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name),remove:(...names)=>names.forEach(name=>classes.delete(name))},querySelector:()=>({setAttribute(){},focus(){}}),set hidden(value){if(!value)paints.push({reference:classes.has('has-reference-editor'),mode:this.dataset.referenceMode});}};
 const c=vm.createContext({els:{podcastPortraitViewer:viewer,podcastPortraitViewerImage:{removeAttribute(){}},podcastPortraitViewerCloseBtn:{focus(){}}},referenceViewerEpoch:0,referenceImageEditor:null,document:{activeElement:null},HTMLElement:class {},podcastPortraitViewerLastFocus:null});
 vm.runInContext(code,c);return {c,classes,paints,viewer};
}
test('first paint uses reference styling before the lazy editor exists',()=>{
 const {c,paints}=fixture();c.openPodcastPortraitViewer({src:'image.png',referenceGallery:true});assert.deepEqual(paints,[{reference:true,mode:'gallery'}]);
});
test('closing during module loading clears reference presentation',()=>{
 const {c,classes,viewer}=fixture();c.openPodcastPortraitViewer({src:'image.png',referenceGallery:true});c.closePodcastPortraitViewer();assert.equal(classes.has('has-reference-editor'),false);assert.equal(viewer.dataset.referenceMode,undefined);
});
test('normal portraits do not inherit the reference layout',()=>{
 const {c,paints}=fixture();c.openPodcastPortraitViewer({src:'image.png',referenceGallery:true});c.openPodcastPortraitViewer({src:'portrait.png'});assert.deepEqual(paints[1],{reference:false,mode:undefined});
});
