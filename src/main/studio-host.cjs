'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {secret}=require('./studio-projects.cjs');
const redact=text=>String(text).replace(/\x1b\[[0-9;]*m/g,'').replace(/\b(?:sk-|ak_|gh[pousr]_)[A-Za-z0-9_-]{16,}/g,'[credencial ocultada]').replace(/((?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret)\s*[:=]\s*)([^\s,;}]+)/gi,'$1[oculto]');
function createHost({projects,runCli,browserLoader}){
 const previews=new Map(),jobs=new Map();
 function publicPreview(item){return{id:item.id,projectId:item.projectId,url:item.url,folder:item.folder,startedAt:item.startedAt};}
 async function preview(input){const value=projects.project(input.projectId);const relative=input.folder?.trim()||'.';const folder=relative==='.'?value.path:projects.file(value,relative,{existing:true});if(!fs.statSync(folder).isDirectory())throw Error('Escolha uma pasta de arquivos estáticos ou um build, como dist.');if(previews.has(value.id))return publicPreview(previews.get(value.id));
  const server=http.createServer((request,response)=>{
   try{
    if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return;}
    const pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname),relative=pathname.replace(/^\/+/,'')||'index.html';
    if(relative.split('/').includes('..')||secret(relative))throw Error('blocked');
    let target=path.resolve(folder,relative);if(!projects.inside(folder,target)||!fs.existsSync(target)||!projects.inside(folder,fs.realpathSync(target)))throw Error('missing');
    if(fs.statSync(target).isDirectory())target=path.join(target,'index.html');if(!fs.existsSync(target)||!fs.statSync(target).isFile()||!projects.inside(folder,fs.realpathSync(target)))throw Error('missing');
    const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'}[path.extname(target)]||'application/octet-stream';
    response.writeHead(200,{'Content-Type':mime,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});if(request.method==='HEAD')response.end();else fs.createReadStream(target).pipe(response);
   }catch{response.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});response.end('Arquivo indisponível.');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const item={id:crypto.randomUUID(),projectId:value.id,url:'http://127.0.0.1:'+server.address().port,folder:relative,startedAt:new Date().toISOString(),server};previews.set(value.id,item);projects.event('preview-started',{project:value.id,url:item.url});return publicPreview(item);
 }
 async function stopPreview(input){projects.project(input.projectId);const item=previews.get(input.projectId);if(item){await new Promise(resolve=>item.server.close(resolve));previews.delete(input.projectId);}return{stopped:true};}
 function list(){return{previews:[...previews.values()].map(publicPreview),jobs:[...jobs.values()].map(({child,...job})=>job)};}
 async function command(input){const value=projects.project(input.projectId),status=await projects.status(input);if(!/^[a-zA-Z0-9:_-]{1,80}$/.test(input.script||'')||!Object.hasOwn(status.scripts,input.script))throw Error('Selecione um script existente no package.json.');if([...jobs.values()].some(x=>x.projectId===value.id&&x.script===input.script&&x.status==='running'))throw Error('Este script já está em execução.');
  const id=crypto.randomUUID(),log=path.join(projects.directory,'logs',id+'.log');fs.mkdirSync(path.dirname(log),{recursive:true});fs.writeFileSync(log,'');const job={id,projectId:value.id,script:input.script,status:'running',startedAt:new Date().toISOString(),log,output:'',exitCode:null};
  const environment={...process.env,npm_config_cache:path.join(projects.directory,'npm-cache')};
  const child=process.platform==='win32'?spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command','& npm.cmd run $env:MEXT_SCRIPT; exit $LASTEXITCODE'],{cwd:value.path,env:{...environment,MEXT_SCRIPT:input.script},windowsHide:true,stdio:['ignore','pipe','pipe']}):spawn('npm',['run',input.script],{cwd:value.path,env:environment,stdio:['ignore','pipe','pipe']});
  job.child=child;job.pid=child.pid;jobs.set(id,job);
  const append=data=>{const text=redact(data.toString('utf8'));job.output=(job.output+text).slice(-200000);if(fs.statSync(log).size>5*1024*1024)fs.writeFileSync(log,'[registro reiniciado após 5 MB]\n');fs.appendFileSync(log,text);};
  child.stdout.on('data',append);child.stderr.on('data',append);child.on('error',error=>{job.status='failed';append(error.message)});child.on('exit',(code,signal)=>{job.status=code===0?'completed':signal?'stopped':'failed';job.exitCode=code;job.finishedAt=new Date().toISOString();projects.event('script-finished',{project:value.id,id,status:job.status})});
  projects.event('script-started',{project:value.id,id,script:input.script});return{id,pid:child.pid,status:job.status};
 }
 async function stopCommand(input){const job=jobs.get(input.jobId);if(!job||job.status!=='running'||!job.child?.pid)throw Error('Este processo não foi iniciado por esta sessão do Estúdio ou já terminou.');const daemon=await runCli(['daemon','status','--output','json']);if(!daemon.pid||daemon.pid===job.pid)throw Error('Não foi possível confirmar a separação do serviço Multica.');
  if(process.platform==='win32'){
   const ancestry=await projects.execute('powershell.exe',['-NoProfile','-NonInteractive','-Command','$p=Get-CimInstance Win32_Process; $p|Select-Object ProcessId,ParentProcessId|ConvertTo-Json -Compress'],projects.directory);const parents=new Map(JSON.parse(ancestry).map(x=>[x.ProcessId,x.ParentProcessId]));let current=daemon.pid;const seen=new Set();while(current&&!seen.has(current)){if(current===job.pid)throw Error('O serviço está nesta árvore; encerramento recusado.');seen.add(current);current=parents.get(current)}
   await projects.execute('taskkill.exe',['/PID',String(job.pid),'/T','/F'],projects.directory);
  }else job.child.kill('SIGTERM');
  return{stopped:true,id:job.id};
 }
 async function qa(input){const value=projects.project(input.projectId),item=previews.get(value.id);if(!item)throw Error('Inicie a prévia estática deste projeto antes do teste visual.');const pathname=String(input.path||'/');if(!pathname.startsWith('/')||pathname.startsWith('//')||pathname.includes('://'))throw Error('Informe um caminho da prévia, como / ou /login.');const url=new URL(pathname,item.url);if(url.origin!==item.url)throw Error('Caminho fora da prévia.');
  let playwright;try{playwright=browserLoader?browserLoader():require('playwright');}catch{throw Error('Playwright não está disponível. Instale-o pelo botão Preparar teste visual.');}
  const id=crypto.randomUUID(),folder=path.join(projects.directory,'qa',id);fs.mkdirSync(folder,{recursive:true});const report={id,projectId:value.id,url:url.href,at:new Date().toISOString(),consoleErrors:[],pageErrors:[],failedRequests:[]};let browser;
  try{
   browser=await playwright.chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1365,height:900}});page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(redact(message.text()).slice(0,1500))});page.on('pageerror',error=>report.pageErrors.push(redact(error.message)));page.on('requestfailed',request=>report.failedRequests.push({url:request.url().split('?')[0],error:request.failure()?.errorText}));
   const response=await page.goto(url.href,{waitUntil:'networkidle',timeout:30000});report.httpStatus=response?.status()||0;report.title=await page.title();report.headings=await page.locator('h1').allTextContents();report.unlabeledInputs=await page.locator('input:not([type=hidden])').evaluateAll(nodes=>nodes.filter(node=>!node.getAttribute('aria-label')&&!node.getAttribute('aria-labelledby')&&!node.labels?.length).length);report.horizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);await page.screenshot({path:path.join(folder,'desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(folder,'mobile.png'),fullPage:true});report.passed=report.httpStatus>=200&&report.httpStatus<400&&!report.consoleErrors.length&&!report.pageErrors.length&&!report.failedRequests.length;report.note='Verificação automática de carregamento, console e layout; não substitui testes funcionais de todos os fluxos.';
  }catch(error){report.error=redact(error.message);report.passed=false;}finally{if(browser)await browser.close()}
  fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));projects.event('visual-qa',{project:value.id,id,passed:report.passed});return report;
 }
 function reports(input){projects.project(input.projectId);const dir=path.join(projects.directory,'qa');if(!fs.existsSync(dir))return[];return fs.readdirSync(dir).map(id=>{try{return JSON.parse(fs.readFileSync(path.join(dir,id,'report.json'),'utf8'))}catch{return null}}).filter(x=>x?.projectId===input.projectId).sort((a,b)=>b.at.localeCompare(a.at));}
 async function close(){for(const job of jobs.values())if(job.status==='running')await stopCommand({jobId:job.id});for(const item of previews.values())item.server.close();previews.clear();}
 return{preview,stopPreview,list,command,stopCommand,qa,reports,close,redact};
}
module.exports={createHost,redact};
