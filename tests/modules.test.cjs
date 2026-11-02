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
test('public source contains no original workstation paths, account IDs or credential literals',()=>{
  const root=path.resolve(__dirname,'..');
  const invalid=/C:[\\/]+Users[\\/]+cspga|D:[\\/]+pool-contas-ia|cspgabriel@outlook|(?:gh[pousr]_[A-Za-z0-9]{25,})|(?:ak_[A-Za-z0-9_-]{18,})/;
  function walk(directory){for(const file of fs.readdirSync(directory,{withFileTypes:true})){const full=path.join(directory,file.name);if(file.isDirectory())walk(full);else if(/\.(?:cjs|js|ps1|html|md|json)$/i.test(full))assert.doesNotMatch(fs.readFileSync(full,'utf8'),invalid,full);}}
  for(const directory of ['src','pool','lib','docs','scripts'])walk(path.join(root,directory));
});
