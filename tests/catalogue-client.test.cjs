'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCatalogueClient}=require('../src/ui/catalogue-client.js');

test('current catalogue protocol passes filtered results and cursors through',async()=>{
  const calls=[];
  const response={items:[],setup:'panel',total:0,nextCursor:null};
  const load=createCatalogueClient(async input=>{calls.push(input);return response;});
  assert.equal(await load({setup:'panel',search:'test'}),response);
  await load({setup:'panel',cursor:'server-cursor'});
  assert.equal(calls[1].cursor,'server-cursor');
});

test('legacy IPC filters across pages, preserves overflow and marks incomplete counts',async()=>{
  const apps=Array.from({length:144},(_,i)=>({slug:'app-'+i,name:'App '+i,managedSchemes:i>=48&&i<120?['OAUTH2']:[],noAuth:i>=120,authSchemes:['API_KEY']}));
  let requests=0;
  const load=createCatalogueClient(async input=>{
    requests++;
    const offset=Number(input.cursor||0);
    assert.ok(!String(input.cursor||'').startsWith('legacy:'));
    return{items:apps.slice(offset,offset+48),total:144,nextCursor:offset+48<144?String(offset+48):null};
  });
  const first=await load({setup:'direct'});
  assert.equal(first.items.length,48);assert.equal(first.items[0].slug,'app-48');assert.equal(first.totalIsEstimate,true);
  const second=await load({setup:'direct',cursor:first.nextCursor});
  assert.equal(second.items.length,48);assert.equal(second.total,96);assert.equal(second.totalIsEstimate,false);assert.equal(second.nextCursor,null);
  assert.equal(new Set([...first.items,...second.items].map(x=>x.slug)).size,96);
  assert.ok(second.items.filter(x=>x.noAuth).every(x=>x.setup==='direct'));
  assert.equal((await load({setup:'panel'})).total,48);
  assert.equal((await load({setup:'all'})).total,144);
  assert.equal(requests,3);
  await assert.rejects(load({setup:'panel',cursor:first.nextCursor}),/filtro mudou/);
});

test('a transient legacy page failure can be retried without losing the page',async()=>{
  let fail=true;
  const load=createCatalogueClient(async input=>{
    if(input.cursor&&fail){fail=false;throw Error('Transient network failure');}
    return input.cursor?{items:[{slug:'ready',name:'Ready',noAuth:true}],nextCursor:null,total:2}:{items:[{slug:'manual',name:'Manual'}],nextCursor:'second',total:2};
  });
  await assert.rejects(load({setup:'direct'}),/Transient network failure/);
  const result=await load({setup:'direct'});
  assert.equal(result.items[0].slug,'ready');assert.equal(result.total,1);assert.equal(result.totalIsEstimate,false);
});
