import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window ??= {location:{origin:'https://example.test',href:'https://example.test'}};
const {PodcasterPlaybackController}=await import('../public/podcaster/podcaster-playback-controller.js');
test('immutable regeneration prepares the changed row without evicting old or new resources',async()=>{
 const controller=new PodcasterPlaybackController();const old={downloadUrl:'https://test/old.mp4'},next={downloadUrl:'https://test/new.mp4'};
 const session={id:'s',dialogueVideoMap:{r:next}};controller.state.session=session;
 const evicted=[],prepared=[];controller.getBlobUrlSync=url=>url;controller.invalidateBlobUrl=async url=>evicted.push(url);controller.invalidateAuthorizedAssetSource=()=>{};
 controller.prepareSessionMedia=async options=>{prepared.push(options);return true;};
 assert.equal(await controller.invalidateRowMediaCache('r',session,{previousClip:old,nextClip:next,preserveSources:true}),true);
 assert.deepEqual(evicted,[]);assert.deepEqual(prepared[0].onlyRowIds,['r']);assert.equal(prepared[0].includeDialogue,false);assert.equal(prepared[0].includeBackground,false);
});
