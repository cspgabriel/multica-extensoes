'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createAgentAccess}=require('../src/main/agent-access.cjs');
const {createService}=require('../src/main/modules.cjs');
const OWNER='11111111-1111-4111-8111-111111111111';
const WORKSPACE='22222222-2222-4222-8222-222222222222';
const SERVER='33333333-3333-4333-8333-333333333333';
const SKILL='44444444-4444-4444-8444-444444444444';
const A='55555555-5555-4555-8555-555555555555';
const B='66666666-6666-4666-8666-666666666666';
const C='77777777-7777-4777-8777-777777777777';
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mext-agents-'));
  const stateRoot=path.join(root,'data');
  const sourceRoot=path.resolve(__dirname,'..');
  const calls=[];
  const apiCalls=[];
  const agents=[{id:A,owner_id:OWNER,name:'Native agent',runtime_id:'native'},{id:B,owner_id:OWNER,name:'Unsupported agent',runtime_id:'copilot'},{id:C,owner_id:OWNER,name:'Unbound agent',runtime_id:null},{id:'foreign',owner_id:'another-owner',name:'Not mine',runtime_id:'native'}];
  const assignments=new Map();
  let library=[];
  let skills=[];
  let context='Original workspace context';
  const runCli=async(args,cwd,stdin)=>{
    assert.ok(!args.some(x=>String(x).includes('PROJECT-SECRET')));
    calls.push({args,cwd,stdin});
    const body=args.slice(2);
    if(body[0]==='user')return{id:OWNER};
    if(body[0]==='runtime')return[{id:'native',provider:'codex'},{id:'copilot',provider:'copilot'}];
    if(body[0]==='workspace'&&body[1]==='get')return{id:WORKSPACE,context};
    if(body[0]==='workspace'&&body[1]==='update'){context=stdin;return{id:WORKSPACE,context};}
    if(body[0]==='workspace'&&body[1]==='mcp'){
      if(body[2]==='list')return library;
      if(body[2]==='add'){assert.ok(JSON.parse(stdin).headers['x-api-key']==='PROJECT-SECRET');const result={id:SERVER,name:body[3]};library.push(result);return result;}
      if(body[2]==='update')return{id:SERVER};
    }
    if(body[0]==='skill'){
      if(body[1]==='list')return skills;
      if(body[1]==='create'){skills=[{id:SKILL,name:'multica-marketplace-composio'}];return skills[0];}
      if(body[1]==='update')return{id:SKILL};
    }
    if(body[0]==='agent'){
      if(body[1]==='list')return agents;
      if(body[1]==='skills')return[];
      if(body[1]==='mcp'){
        if(body[2]==='list')return assignments.get(body[3])||[];
        if(body[2]==='add'){assignments.set(body[3],[{id:SERVER,enabled:true}]);return assignments.get(body[3]);}
        if(body[2]==='enable'){assignments.set(body[3],[{id:SERVER,enabled:true}]);return assignments.get(body[3]);}
      }
    }
    throw Error('Unexpected CLI '+JSON.stringify(body));
  };
  const api=async(route,params,method,body)=>{apiCalls.push({route,params,method,body});return{session_id:'trs_fixture',mcp:{url:'https://backend.composio.dev/tool_router/fixture/mcp'}};};
  const credentials=()=>({apiKey:'PROJECT-SECRET',userId:'test-user'});
  return{root,stateRoot,sourceRoot,calls,apiCalls,agents,assignments,runCli,api,credentials};
}
test('activation assigns additively to all owned agents and reports unsupported and unbound runtimes',async()=>{
  const f=fixture();const access=createAgentAccess(f);
  const preview=await access.preview(WORKSPACE);
  assert.equal(preview.total,3);
  assert.equal(preview.nativeCapable,1);
  assert.equal(f.apiCalls.length,0);
  const result=await access.sync({workspaceId:WORKSPACE,activate:true,force:true});
  assert.equal(result.assigned,3);
  assert.equal(result.nativeConfigured,1);
  assert.equal(result.pending.length,2);
  assert.ok(!f.assignments.has('foreign'));
  assert.ok(f.calls.some(x=>x.args.includes('--context-stdin')&&x.stdin.includes('Original workspace context')));
  assert.ok(!f.calls.some(x=>x.args.includes('--mcp-config')||x.args.includes('--instructions')||x.args.includes('set')));
  assert.equal(f.apiCalls[0].body.user_id,'test-user');
  assert.equal(f.apiCalls[0].body.instant,false);
  assert.equal(f.apiCalls[0].body.connected_accounts,undefined);
  assert.equal(f.apiCalls[0].body.toolkits,undefined);
  assert.ok(!JSON.stringify(access.status(WORKSPACE)).includes('PROJECT-SECRET'));
  assert.ok(!fs.readFileSync(path.join(f.stateRoot,'agent-access.json'),'utf8').includes('PROJECT-SECRET'));
});
test('subsequent synchronization enrolls a new agent without new session or replacing existing MCP servers',async()=>{
  const f=fixture();const access=createAgentAccess(f);
  await access.sync({workspaceId:WORKSPACE,activate:true});
  const created=f.apiCalls.length;
  const start=f.calls.length;
  const id='88888888-8888-4888-8888-888888888888';
  f.agents.push({id,owner_id:OWNER,name:'New agent',runtime_id:'native'});
  const result=await access.sync({workspaceId:WORKSPACE});
  assert.equal(result.assigned,4);
  assert.equal(f.apiCalls.length,created);
  const modifications=f.calls.slice(start).filter(x=>x.args.slice(2,5).join(' ')==='agent mcp add');
  assert.equal(modifications.length,1);
  assert.equal(modifications[0].args[5],id);
});
test('a cross-origin MCP URL is rejected before any secret is sent to the workspace',async()=>{
  const f=fixture();f.api=async()=>({session_id:'bad',mcp:{url:'https://untrusted.example/mcp'}});
  await assert.rejects(createAgentAccess(f).sync({workspaceId:WORKSPACE,activate:true}),/mesma origem/);
  assert.ok(!f.calls.some(x=>x.args.includes('--server-config-stdin')));
});
test('activation is blocked in agent execution context before any administrative CLI call',async()=>{
  const f=fixture();let calls=0;
  const previous=process.env.MULTICA_TASK_ID;
  process.env.MULTICA_TASK_ID='fixture-task';
  try{
    const h=createService({...f,runCli:async()=>{calls++;throw Error('Must not call');}}).handlers;
    await assert.rejects(h['composio:agents-enable']({workspaceId:WORKSPACE,confirmAllAgents:true}),/bloqueia alterações de MCP por agentes/);
    assert.equal(calls,0);
  }finally{if(previous===undefined)delete process.env.MULTICA_TASK_ID;else process.env.MULTICA_TASK_ID=previous;}
});
test('a denied registration is retained as an actionable failure and never reported as enabled',async()=>{
  const f=fixture();const original=f.runCli;
  f.runCli=async(args,cwd,stdin)=>{if(args.includes('--server-config-stdin'))throw Error('Permission denied by platform');return original(args,cwd,stdin);};
  const access=createAgentAccess(f);
  await assert.rejects(access.sync({workspaceId:WORKSPACE,activate:true}),/Permission denied/);
  const status=access.status(WORKSPACE);
  assert.equal(status.enabled,false);
  assert.equal(status.assigned,0);
  assert.match(status.lastError,/Permission denied/);
});

test('forced audit repairs a disabled binding and identity rotation updates the same server',async()=>{
  const f=fixture();let identity='test-user';
  f.credentials=()=>({apiKey:'PROJECT-SECRET',userId:identity});
  const access=createAgentAccess(f);
  await access.sync({workspaceId:WORKSPACE,activate:true});
  f.assignments.set(A,[{id:SERVER,enabled:false}]);
  identity='replacement-user';
  const start=f.calls.length;
  const result=await access.sync({workspaceId:WORKSPACE,force:true});
  assert.equal(result.assigned,3);
  assert.equal(f.apiCalls.length,2);
  assert.equal(f.apiCalls[1].body.user_id,'replacement-user');
  const calls=f.calls.slice(start).map(x=>x.args.slice(2));
  assert.equal(calls.filter(x=>x.slice(0,3).join(' ')==='workspace mcp add').length,0);
  assert.equal(calls.filter(x=>x.slice(0,3).join(' ')==='workspace mcp update').length,1);
  assert.ok(calls.some(x=>x.slice(0,3).join(' ')==='agent mcp enable'&&x[3]===A));
  assert.equal(f.assignments.get(A)[0].enabled,true);
});

test('a different authenticated owner cannot reuse the previous owner session',async()=>{
  const f=fixture();const access=createAgentAccess(f);
  await access.sync({workspaceId:WORKSPACE,activate:true});
  const initial=f.runCli;
  const other=createAgentAccess({...f,runCli:async(args,cwd,stdin)=>args[2]==='user'?{id:'99999999-9999-4999-8999-999999999999'}:initial(args,cwd,stdin)});
  const start=f.calls.length;
  await assert.rejects(other.sync({workspaceId:WORKSPACE,force:true}),/outro proprietário/);
  assert.ok(!f.calls.slice(start).some(x=>x.args.includes('--server-config-stdin')));
  assert.equal(f.apiCalls.length,1);
});
