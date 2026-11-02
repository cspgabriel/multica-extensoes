'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const secret=relative=>relative.split(/[\\/]/).some(part=>/^(?:\.git|node_modules|\.next|\.cache|studio-data|\.ssh|\.aws|\.codex|\.claude|\.composio|\.hermes)$/i.test(part)||/^\.env(?:\.|$)/i.test(part)||/credentials?|secrets?/i.test(part)||/^(?:auth|tokens?)\.json$/i.test(part))||/\.(?:pem|key|pfx|p12)$/i.test(relative);
function execute(file,args,cwd,options={}){return new Promise((resolve,reject)=>execFile(file,args,{cwd,windowsHide:true,encoding:'utf8',maxBuffer:16*1024*1024,timeout:45000,...options},(error,stdout,stderr)=>error?reject(new Error((stderr||error.message).trim().slice(0,1600))):resolve(stdout)));}
function createProjects({directory}){
 fs.mkdirSync(directory,{recursive:true});const stateFile=path.join(directory,'state.json');
 function state(){try{return JSON.parse(fs.readFileSync(stateFile,'utf8'))}catch(error){if(error.code==='ENOENT')return{projects:[],flows:[],comparisons:[],events:[]};throw Error('Não foi possível ler os dados do Estúdio.')}}
 function save(value){const temporary=stateFile+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temporary,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(temporary,stateFile);}
 function event(kind,detail){const value=state();value.events=[{id:crypto.randomUUID(),at:new Date().toISOString(),kind,detail},...(value.events||[])].slice(0,300);save(value);}
 function project(id){const value=state().projects.find(x=>x.id===id);if(!value)throw Error('Cadastre e selecione um projeto local.');const real=fs.realpathSync(value.path);if(real!==value.path)throw Error('A pasta do projeto mudou. Cadastre-a novamente.');return value;}
 function inside(root,target){const relative=path.relative(root,target);return relative===''||!relative.startsWith('..')&&!path.isAbsolute(relative);}
 function file(value,relative,{existing=false}={}){
  if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||relative.includes('\0')||relative.split(/[\\/]/).includes('..')||secret(relative))throw Error('Arquivo fora do projeto ou protegido.');
  const output=path.resolve(value.path,relative);if(!inside(value.path,output)||inside(directory,output))throw Error('Arquivo fora do projeto ou reservado ao Estúdio.');
  let ancestor=output;while(!fs.existsSync(ancestor)){const parent=path.dirname(ancestor);if(parent===ancestor)throw Error('Pasta inválida.');ancestor=parent;}
  if(!inside(value.path,fs.realpathSync(ancestor)))throw Error('Links para fora do projeto não são permitidos.');
  if(existing&&!fs.existsSync(output))throw Error('Arquivo não encontrado.');
  if(fs.existsSync(output)&&fs.lstatSync(output).isSymbolicLink())throw Error('Links simbólicos não são editáveis pelo Estúdio.');return output;
 }
 const git=(value,args)=>execute('git',['-c','core.quotepath=false',...args],value.path);
 async function add(input){
  if(typeof input.path!=='string'||!path.isAbsolute(input.path))throw Error('Escolha uma pasta absoluta.');const location=fs.realpathSync(input.path);
  if(!fs.statSync(location).isDirectory()||location===path.parse(location).root||inside(directory,location)||inside(location,directory))throw Error('Selecione a pasta de um projeto, separada dos dados do Estúdio.');
  const value=state(),existing=value.projects.find(x=>x.path===location);if(existing)return existing;
  const item={id:crypto.randomUUID(),name:String(input.name||path.basename(location)).slice(0,120),path:location,createdAt:new Date().toISOString()};
  try{const top=fs.realpathSync((await git(item,['rev-parse','--show-toplevel'])).trim());if(top!==location)throw Error('Escolha a raiz do repositório Git.');item.git=true;}catch(error){if(/raiz do repositório/.test(error.message))throw error;item.git=false;}
  value.projects.push(item);save(value);event('project-added',{project:item.id});return item;
 }
 async function files(value){
  let names=[];
  if(value.git)names=(await git(value,['ls-files','-z','--cached','--others','--exclude-standard'])).split('\0').filter(Boolean);
  else{function walk(dir,prefix=''){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const relative=prefix+entry.name;if(secret(relative)||entry.isSymbolicLink())continue;if(entry.isDirectory())walk(path.join(dir,entry.name),relative+'/');else names.push(relative);if(names.length>5000)throw Error('Projeto muito grande; use um repositório Git ou uma pasta menor.');}}walk(value.path);}
  return [...new Set(names)].filter(x=>!secret(x));
 }
 async function status(input){const value=project(input.projectId);let scripts={};try{const pkg=JSON.parse(fs.readFileSync(file(value,'package.json',{existing:true}),'utf8'));scripts=Object.fromEntries(Object.entries(pkg.scripts||{}).filter(([key])=>/^[a-zA-Z0-9:_-]{1,80}$/.test(key)));}catch{}
  if(!value.git)return{project:value,branch:null,changes:[],scripts};
  const [branch,raw]=await Promise.all([git(value,['branch','--show-current']),git(value,['status','--porcelain=v1','-z'])]);const parts=raw.split('\0'),changes=[];
  for(let i=0;i<parts.length;i++){const entry=parts[i];if(!entry)continue;const code=entry.slice(0,2),relative=entry.slice(3);if(/[RC]/.test(code))i++;if(secret(relative))continue;changes.push({path:relative,status:code});}
  return{project:value,branch:branch.trim(),changes,scripts};
 }
 async function diff(input){const value=project(input.projectId),target=file(value,input.file);const exists=fs.existsSync(target),bytes=exists?fs.readFileSync(target):null;if(bytes&&bytes.length>512*1024)throw Error('Arquivo maior que 512 KB; abra no editor local.');if(bytes?.includes(0))throw Error('Arquivo binário; use a comparação de versões pelo nome e hash.');
  let before='';if(value.git){try{before=await git(value,['show','HEAD:'+input.file.replaceAll('\\','/')]);}catch{}}
  return{file:input.file,before,after:bytes?.toString('utf8')||'',revision:bytes?hash(bytes):null};
 }
 function snapshotPath(id){if(!/^[0-9a-f-]{36}$/.test(id||''))throw Error('Versão inválida.');return path.join(directory,'snapshots',id);}
 async function checkpoint(input){const value=project(input.projectId),id=crypto.randomUUID(),destination=snapshotPath(id);fs.mkdirSync(destination,{recursive:true});const manifest={id,projectId:value.id,name:String(input.name||'Ponto de restauração').slice(0,160),createdAt:new Date().toISOString(),files:[]};let bytes=0;
  for(const relative of await files(value)){const target=file(value,relative);if(!fs.existsSync(target)||!fs.statSync(target).isFile())continue;const size=fs.statSync(target).size;if(size>10*1024*1024)throw Error('Arquivo maior que 10 MB. Use Git para versionar este projeto.');bytes+=size;if(bytes>100*1024*1024||manifest.files.length>=5000)throw Error('Limite de 100 MB/5.000 arquivos por ponto de restauração.');const content=fs.readFileSync(target),digest=hash(content);const blob=path.join(destination,digest);if(!fs.existsSync(blob))fs.writeFileSync(blob,content,{mode:0o600});manifest.files.push({path:relative,hash:digest,size});}
  fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2));event('checkpoint',{project:value.id,id,files:manifest.files.length});return manifest;
 }
 function checkpoints(input){project(input.projectId);const dir=path.join(directory,'snapshots');if(!fs.existsSync(dir))return[];return fs.readdirSync(dir).map(id=>{try{return JSON.parse(fs.readFileSync(path.join(snapshotPath(id),'manifest.json'),'utf8'))}catch{return null}}).filter(x=>x?.projectId===input.projectId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(x=>({...x,count:x.files.length}));}
 function restore(input){const value=project(input.projectId),snapshot=JSON.parse(fs.readFileSync(path.join(snapshotPath(input.snapshotId),'manifest.json'),'utf8'));if(snapshot.projectId!==value.id)throw Error('Esta versão pertence a outro projeto.');const item=snapshot.files.find(x=>x.path===input.file);if(!item)throw Error('Arquivo não encontrado nesta versão.');const target=file(value,item.path),current=fs.existsSync(target)?fs.readFileSync(target):null;if((current?hash(current):null)!==input.revision)throw Error('O arquivo mudou. Atualize a comparação antes de restaurar.');const restored=fs.readFileSync(path.join(snapshotPath(input.snapshotId),item.hash));if(hash(restored)!==item.hash)throw Error('A cópia não passou na verificação de integridade.');
  const undo=path.join(directory,'restore-history',crypto.randomUUID());fs.mkdirSync(undo,{recursive:true});if(current)fs.writeFileSync(path.join(undo,'before'),current);fs.writeFileSync(path.join(undo,'manifest.json'),JSON.stringify({projectId:value.id,path:item.path,existed:!!current,at:new Date().toISOString()}));fs.mkdirSync(path.dirname(target),{recursive:true});const temporary=target+'.studio-'+crypto.randomUUID();fs.writeFileSync(temporary,restored);fs.renameSync(temporary,target);event('file-restored',{project:value.id,file:item.path,snapshot:input.snapshotId});return{restored:true,file:item.path,revision:item.hash};
 }
 function context(input){const value=project(input.projectId),name=path.join(directory,'contexts',value.id+'.md');const content=fs.existsSync(name)?fs.readFileSync(name,'utf8'):'';return{content,revision:hash(content)};}
 function saveContext(input){const current=context(input);if(current.revision!==input.revision)throw Error('O contexto mudou em outra janela. Atualize antes de salvar.');if(typeof input.content!=='string'||Buffer.byteLength(input.content)>128*1024)throw Error('O contexto deve ter até 128 KB.');const filename=path.join(directory,'contexts',input.projectId+'.md');fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,input.content);event('context-saved',{project:input.projectId});return context(input);}
 async function handoff(input){const value=project(input.projectId),current=await status(input),memory=context(input);const text=`# Continuidade do projeto ${value.name}\n\nPasta: ${value.path}\nBranch: ${current.branch||'sem Git'}\n\n## Objetivo e decisões\n${memory.content}\n\n## Pedido atual\n${String(input.prompt||'').slice(0,12000)}\n\n## Arquivos com alterações\n${current.changes.map(x=>'- '+x.status+' '+x.path).join('\n')||'Nenhuma alteração no Git.'}\n\nPreserve o trabalho existente. Este documento transfere contexto; não é uma retomada da sessão interna de outro provedor.\n`;const filename=path.join(directory,'handoffs',crypto.randomUUID()+'.md');fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,text);return{text,file:filename};}
 return{directory,state,save,event,project,inside,file,git,files,add,status,diff,checkpoint,checkpoints,restore,context,saveContext,handoff,execute};
}
module.exports={createProjects,execute,hash,secret};
