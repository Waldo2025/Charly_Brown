const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const express = require('express');
const { createScienceOAuthProvider, registerScienceOAuthRoutes, validRedirect } = require('../src/science-oauth.js');
const { memoryDb } = require('./helpers/science-memory-db.js');
const verifier = 'a'.repeat(64), challenge = createHash('sha256').update(verifier).digest('base64url');
async function setup() {
  const provider = createScienceOAuthProvider({ db: memoryDb(), clock: () => 1000 });
  const client = await provider.clientsStore.registerClient({ token_endpoint_auth_method: 'none', redirect_uris: ['http://127.0.0.1:8123/callback'], client_name: 'Test' });
  let location; await provider.authorize(client, { redirectUri: client.redirect_uris[0], codeChallenge: challenge, scopes: ['science:read'], state: 'state' }, { redirect: value => { location=value; } });
  const request = new URL(location).searchParams.get('request');
  const redirect = await provider.consent(request, 'owner', true);
  return { provider, client, request, code: new URL(redirect).searchParams.get('code') };
}
test('OAuth binds single-use consent, redirect, client, resource and scope', async () => {
  const {provider,client,request,code} = await setup();
  await assert.rejects(provider.consent(request, 'other', true));
  await assert.rejects(provider.exchangeAuthorizationCode(client, code, undefined, 'https://evil.invalid'));
  await assert.rejects(provider.exchangeAuthorizationCode(client, code, undefined, client.redirect_uris[0], new URL('https://evil.invalid')));
  const results=await Promise.allSettled([1,2].map(()=>provider.exchangeAuthorizationCode(client,code,undefined,client.redirect_uris[0])));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const tokens=results.find(r=>r.status==='fulfilled').value;
  const verified=await provider.verifyAccessToken(tokens.access_token); assert.equal(verified.extra.uid,'owner');assert.deepEqual(verified.scopes,['science:read']);
  await assert.rejects(provider.exchangeRefreshToken(client,tokens.refresh_token,['science:execute']));
  const refreshed=await provider.exchangeRefreshToken(client,tokens.refresh_token);
  await assert.rejects(provider.exchangeRefreshToken(client,tokens.refresh_token));
  await provider.revokeToken(client,{token:refreshed.refresh_token});
  await assert.rejects(provider.verifyAccessToken(refreshed.access_token));
  await assert.rejects(provider.verifyAccessToken(tokens.access_token));
});
test('OAuth rejects unsafe redirects and confidential registration', async () => {
  for(const url of ['javascript:alert(1)','http://remote.invalid/cb','https://user:pass@example.com/cb','https://example.com/#cb'])assert.equal(validRedirect(url),false);
  const {provider}=await setup();await assert.rejects(provider.clientsStore.registerClient({redirect_uris:['https://example.com/cb'],token_endpoint_auth_method:'client_secret_post'}));
});
test('SDK HTTP token endpoint enforces PKCE and exposes discovery', async t => {
  const db=memoryDb(),app=express();app.use(express.json());
  const oauth=registerScienceOAuthRoutes(app,{getAdminServices:()=>({db}),resolveAuthContext:async req=>{if(!req.headers.authorization && req.path.includes('/mcp'))throw Object.assign(Error('auth_required'),{status:401});return {uid:'owner'};}});
  require('../src/science-mcp.js').registerScienceMcpRoutes(app,{coordinator:{store:{list:async uid=>[{id:'run',owner:uid}]}},resolveAuthContext:oauth.resolveMcpAuth,resourceMetadataUrl:oauth.resourceMetadataUrl});
  const server=app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());
  const base=`http://127.0.0.1:${server.address().port}`,prefix='/api/science-activities/oauth';
  const post=async(path,body)=>fetch(base+prefix+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const client=await (await post('/register',{client_name:'Reference MCP',redirect_uris:['http://localhost:8123/callback'],token_endpoint_auth_method:'none'})).json();
  const auth=await fetch(base+prefix+'/authorize?'+new URLSearchParams({client_id:client.client_id,response_type:'code',redirect_uri:client.redirect_uris[0],code_challenge:challenge,code_challenge_method:'S256',scope:'science:read',resource:'https://charly-brown.web.app/api/science-activities/mcp'}),{redirect:'manual'});
  assert.equal(auth.status,302); const request=new URL(auth.headers.get('location')).searchParams.get('request');
  const consent=await(await post('/consent',{request,allow:true})).json();const code=new URL(consent.redirect).searchParams.get('code');
  const exchange=code_verifier=>fetch(base+prefix+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client.client_id,redirect_uri:client.redirect_uris[0],code,code_verifier})});
  assert.equal((await exchange('b'.repeat(64))).status,400);const exchanged=await exchange(verifier);assert.equal(exchanged.status,200);const tokens=await exchanged.json();
  const {Client}=require('@modelcontextprotocol/sdk/client/index.js'),{StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const reference=new Client({name:'science-reference',version:'1.0.0'});
  try {
    await reference.connect(new StreamableHTTPClientTransport(new URL(base+'/api/science-activities/mcp'),{requestInit:{headers:{Authorization:'Bearer '+tokens.access_token}}}));
    const listed=await reference.callTool({name:'list_generations',arguments:{}});assert.equal(listed.isError,undefined);assert.equal(JSON.parse(listed.content[0].text).runs[0].owner,'owner');
    const denied=await reference.callTool({name:'plan_activity',arguments:{config:{},activity:{}}});assert.equal(denied.isError,true);
  }finally{await reference.close();}
  const anonymous=await fetch(base+'/api/science-activities/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(anonymous.status,401);assert.match(anonymous.headers.get('www-authenticate'),/resource_metadata/);
  const metadata=await(await fetch(base+'/.well-known/oauth-protected-resource/api/science-activities/mcp')).json();assert.deepEqual(metadata.scopes_supported,['science:read','science:plan','science:execute']);
});
