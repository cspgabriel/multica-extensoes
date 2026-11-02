'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {createService,register}=require('../src/main/modules.cjs');
test('documents preserve history, reject traversal and prevent lost concurrent edits',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mext-docs-'));
  const h=createService({root}).handlers;
  const original=await h['docs:save']({id:'example.md',content:'# Example',revision:null});
  const next=await h['docs:save']({id:'example.md',content:'# Changed',revision:original.revision});
  await assert.rejects(h['docs:save']({id:'example.md',content:'Stale',revision:original.revision}),/mudou/);
  assert.equal(h['docs:history']({id:'example.md'})[0].content,original.content);
  assert.throws(()=>h['docs:read']({id:'../escape.md'}),/inválido/);
  const results=await Promise.allSettled([h['docs:save']({id:'example.md',content:'A',revision:next.revision}),h['docs:save']({id:'example.md',content:'B',revision:next.revision})]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
});
test('Composio identity filtering and response projection exclude another user and credentials',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mext-api-'));
  let url;
  const h=createService({root,credentials:()=>({apiKey:'fixture-key',userId:'user-a'}),fetch:async input=>{url=input;return{ok:true,json:async()=>({items:[{id:'mine',user_id:'user-a',toolkit:{slug:'gmail'},status:'ACTIVE',state:{token:'never-expose'}},{id:'someone-else',user_id:'user-b',toolkit:{slug:'gmail'},status:'ACTIVE'}]})}}}).handlers;
  const response=await h['composio:connections']();
  assert.equal(url.searchParams.get('user_ids'),'user-a');
  assert.equal(response.items.length,1);
  assert.equal(response.items[0].id,'mine');
  assert.doesNotMatch(JSON.stringify(response),/never-expose|someone-else/);
  assert.doesNotMatch(JSON.stringify(h['composio:status']()),/fixture-key/);
});
test('IPC rejects a non-main-frame sender and a different page',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mext-ipc-'));
  const captured=new Map();
  register(path.join(root,'trusted.html'),{root,electron:{ipcMain:{handle:(name,fn)=>captured.set(name,fn)}}});
  const frame={url:'https://untrusted.example'};frame.top=frame;
  assert.equal((await captured.get('desktop-modules:docs:list')({senderFrame:frame})).ok,false);
  const child={url:require('node:url').pathToFileURL(path.join(root,'trusted.html')).href,top:frame};
  assert.equal((await captured.get('desktop-modules:docs:list')({senderFrame:child})).ok,false);
});

test('setup filtering covers later API pages and paginates eligible apps without loss',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mext-filter-'));
  const manual=Array.from({length:12},(_,i)=>({slug:'manual-'+i,name:'Manual '+i,auth_schemes:['API_KEY'],composio_managed_auth_schemes:[]}));
  const oauth=Array.from({length:51},(_,i)=>({slug:'oauth-'+i,name:'OAuth '+i,auth_schemes:['OAUTH2'],composio_managed_auth_schemes:[i%2?'oauth2':'OAUTH1']}));
  const open=[{slug:'open-flag',name:'Open flag',no_auth:true},{slug:'open-upper',name:'Open upper',auth_schemes:['NO_AUTH']},{slug:'open-lower',name:'Open lower',auth_schemes:['no_auth']}];
  let calls=0;
  const h=createService({root,credentials:()=>({apiKey:'fixture-key',userId:'user-a'}),fetch:async(url,options)=>{
    calls++;assert.equal(options.method,'GET');assert.equal(url.searchParams.get('limit'),'1000');
    return {ok:true,json:async()=>url.searchParams.get('cursor')?{items:[...oauth,...open],next_cursor:null}:{items:manual,next_cursor:'source-page-2'}};
  }}).handlers;
  const first=await h['composio:catalogue']();
  assert.equal(first.setup,'direct');assert.equal(first.total,54);assert.equal(first.items.length,48);
  assert.ok(first.items.every(x=>x.setup==='direct'));
  const second=await h['composio:catalogue']({cursor:first.nextCursor});
  assert.equal(second.items.length,6);assert.equal(second.nextCursor,null);
  assert.equal(new Set([...first.items,...second.items].map(x=>x.slug)).size,54);
  assert.ok(second.items.filter(x=>x.slug.startsWith('open')).every(x=>x.noAuth));
  const all=await h['composio:catalogue']({setup:'all'});
  const panel=await h['composio:catalogue']({setup:'panel'});
  assert.equal(all.total,66);assert.equal(panel.total,12);assert.ok(panel.items.every(x=>x.setup==='panel'));
  assert.equal(calls,2,'filter changes and pagination reuse the complete snapshot');
  await assert.rejects(h['composio:catalogue']({setup:'all',cursor:first.nextCursor}),/filtro mudou/);
  await assert.rejects(h['composio:catalogue']({search:'different query',cursor:first.nextCursor}),/filtro mudou/);
});

test('an unknown auth setup stays out of the default view and repeated source cursors fail safely',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mext-filter-failure-'));
  let repeat=false;
  const h=createService({root,credentials:()=>({apiKey:'fixture-key',userId:'user-a'}),fetch:async()=>({ok:true,json:async()=>({items:[{slug:'unknown',name:'Unknown',auth_schemes:['CUSTOM']}],next_cursor:repeat?'repeat':null})})}).handlers;
  const direct=await h['composio:catalogue']();
  assert.equal(direct.total,0);assert.equal(direct.nextCursor,null);
  assert.equal((await h['composio:catalogue']({setup:'panel'})).total,1);
  repeat=true;
  await assert.rejects(h['composio:catalogue']({refresh:true}),/concluir o catálogo/);
});
test('public source contains no original workstation paths, account IDs or credential literals',()=>{
  const root=path.resolve(__dirname,'..');
  const invalid=/C:[\\/]+Users[\\/]+cspga|D:[\\/]+pool-contas-ia|cspgabriel@outlook|(?:gh[pousr]_[A-Za-z0-9]{25,})|(?:ak_[A-Za-z0-9_-]{18,})/;
  function walk(directory){for(const file of fs.readdirSync(directory,{withFileTypes:true})){const full=path.join(directory,file.name);if(file.isDirectory())walk(full);else if(/\.(?:cjs|js|ps1|html|md|json)$/i.test(full))assert.doesNotMatch(fs.readFileSync(full,'utf8'),invalid,full);}}
  for(const directory of ['src','pool','lib','docs','scripts'])walk(path.join(root,directory));
});
