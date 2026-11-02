'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {createAgentAccess}=require('./agent-access.cjs');
function execute(file,args,options={},stdin){return new Promise((resolve,reject)=>{const child=execFile(file,args,{windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024,...options},(error,stdout)=>error?reject(new Error('O CLI ou a proteção de credenciais recusou a sincronização.')):resolve(stdout));if(stdin!==undefined)child.stdin.end(stdin);});}
(async()=>{
  if(process.env.MULTICA_TASK_ID||process.env.MULTICA_TASK_CONFIG_ROOT)throw new Error('O sincronizador deve executar na sessão do proprietário, fora de tarefas de agentes.');
  const configPath=process.argv[2];
  const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
  const secret=JSON.parse(await execute('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'agent-worker.ps1'),'-Mode','Read','-ConfigPath',configPath]));
  const cliPath=path.join(path.dirname(config.executable),'resources','app.asar.unpacked','resources','bin','multica.exe');
  const runCli=async(args,cwd,stdin)=>JSON.parse(await execute(cliPath,['--profile',config.profile,...args],{cwd},stdin));
  const api=async(route,params={},method='GET',body)=>{
    const url=new URL('https://backend.composio.dev/api/v3.1/'+route);
    for(const [key,value]of Object.entries(params))if(value!==undefined&&value!=='')url.searchParams.set(key,String(value));
    const response=await fetch(url,{method,headers:{'x-api-key':secret.apiKey,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
    if(!response.ok)throw new Error('O Composio recusou a sincronização ('+response.status+').');
    return response.json();
  };
  const access=createAgentAccess({...config,runCli,api,credentials:()=>secret});
  for(const [workspaceId,state]of Object.entries(access.readState().workspaces))if(state.enabled){
    try{const result=await access.sync({workspaceId});console.log(JSON.stringify({workspaceId,total:result.total,assigned:result.assigned,nativeConfigured:result.nativeConfigured,pending:result.pending.length,errors:result.errors?.length||0}));}
    catch(error){console.log(JSON.stringify({workspaceId,error:error.message}));}
  }
})().catch(error=>{console.error(error.message);process.exitCode=1});
