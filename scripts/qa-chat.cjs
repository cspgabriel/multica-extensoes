const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist', 'qa-chat');
fs.mkdirSync(output, {recursive:true});
const pkgRoot = name => path.dirname(require.resolve(name));
const modules = {
  react: fs.readFileSync(path.join(pkgRoot('react'), 'cjs/react.production.js'), 'utf8'),
  'react-dom': fs.readFileSync(path.join(pkgRoot('react-dom'), 'cjs/react-dom.production.js'), 'utf8'),
  'react-dom/client': fs.readFileSync(path.join(pkgRoot('react-dom'), 'cjs/react-dom-client.production.js'), 'utf8'),
  scheduler: fs.readFileSync(path.join(pkgRoot('scheduler'), 'cjs/scheduler.production.js'), 'utf8'),
};
let browserBundle = `var process={env:{NODE_ENV:'production'}};const modules={},cache={};function require(name){if(cache[name])return cache[name].exports;const m=cache[name]={exports:{}};modules[name](require,m,m.exports);return m.exports;}\n`;
for (const [name,body] of Object.entries(modules)) browserBundle += `modules[${JSON.stringify(name)}]=function(require,module,exports){\n${body}\n};\n`;
browserBundle += `
const import_react=require('react');const R=import_react;
const W='11111111-1111-4111-8111-111111111111', A='22222222-2222-4222-8222-222222222222';
const listeners=new Set();const calls=[];
const qa={user:{id:'owner'},role:'owner',provider:'codex',errors:{},draft:'Pedido já escrito\\n[Anexo](https://example.invalid/anexo)',
 native:[{id:'native-on',name:'Relatórios Multica',plugin_key:'reports',enabled:true},{id:'native-off',name:'Pesquisa Multica',plugin_key:'research',enabled:false}],
 library:[{id:'composio-server',name:'marketplace-demo'},{id:'router',name:'MCP-Router'}],
 assigned:[{id:'composio-server',name:'marketplace-demo',enabled:false}],
 connections:[{id:'ca_demo',toolkit:'gmail',name:'Gmail',status:'ACTIVE'},{id:'ca_expired',toolkit:'gmail',name:'Gmail antiga',status:'EXPIRED'}]};
const refresh=()=>listeners.forEach(fn=>fn(n=>n+1));
function useQuery(o){const [,update]=R.useState(0);R.useEffect(()=>{listeners.add(update);return()=>listeners.delete(update);},[]);const key=o.queryKey[0];let data={agents:[{id:A,owner_id:'owner',name:'Agente de demonstração',runtime_id:'runtime'}],sessions:[],native:{plugins:qa.native},library:qa.library,assigned:qa.assigned,runtimes:[{id:'runtime',provider:qa.provider}]}[key];if(key==='desktop-plugins')data=o.queryKey[2]==='connections'?{items:qa.connections}:{serverName:'marketplace-demo'};const error=qa.errors[key];return{data,isError:!!error,error:error?new Error(error):null,isPending:false,isLoading:false,refetch:()=>{delete qa.errors[key];refresh();}};}
const agentListOptions=()=>({queryKey:['agents']}),chatSessionsOptions=()=>({queryKey:['sessions']}),pluginInstallationsOptions=()=>({queryKey:['native']}),workspaceMcpServersOptions=()=>({queryKey:['library']}),agentMcpServersOptions=()=>({queryKey:['assigned']}),runtimeListOptions=()=>({queryKey:['runtimes']});
const useWorkspaceId=()=>W,useWorkspacePaths=()=>({settings:()=>'/settings',marketplace:()=>'/marketplace'}),useNavigation$1=()=>({push:p=>calls.push({navigate:p})}),useAuthStore=selector=>selector({user:qa.user}),useChatStore=selector=>selector({selectedAgentId:A,activeSessionId:null}),useCurrentMember=()=>({role:qa.role}),canAssignAgent=()=>true,providerSupportsMcpConfig=p=>p==='codex';
const Button$1=({variant,size,children,...props})=>R.createElement('button',{...props,className:'button '+(props.className||'')},children);
const toast$6={error:message=>calls.push({error:message}),success:message=>calls.push({success:message})};
const useSetPluginEnabled=()=>({mutateAsync:async value=>{calls.push({enablePlugin:value});qa.native.find(x=>x.id===value.installationId).enabled=value.enabled;refresh();}});
const useAddAgentMcpServer=()=>({mutateAsync:async id=>{if(qa.failAssignment)throw Error('Falha simulada ao ativar servidor');calls.push({addServer:id});qa.assigned.push({...qa.library.find(x=>x.id===id),enabled:true});refresh();}});
const useSetAgentMcpServerEnabled=()=>({mutateAsync:async value=>{calls.push({enableServer:value});qa.assigned.find(x=>x.id===value.serverId).enabled=value.enabled;refresh();}});
`;
browserBundle += fs.readFileSync(path.join(root,'src/ui/chat-plugin-model.js'),'utf8') + '\n' + fs.readFileSync(path.join(root,'src/ui/chat-plugins.js'),'utf8');
browserBundle += `
function App(){const [,paint]=R.useState(0);R.useEffect(()=>{listeners.add(paint);return()=>listeners.delete(paint);},[]);return R.createElement('main',{className:'p-4 space-y-4'},R.createElement('h1',null,'Conversa de demonstração'),R.createElement('p',null,'Validação isolada: dados simulados e nenhuma alteração em contas reais.'),R.createElement(DesktopChatPlugins,{draftKey:'__new__',disabled:false,onUse:prompt=>{qa.draft=DesktopPluginModel.appendDraft(qa.draft,prompt);refresh();return true;}}),R.createElement('textarea',{'aria-label':'Rascunho',value:qa.draft,readOnly:true,style:{width:'100%',height:160}}));}
window.qa={state:qa,calls,refresh};require('react-dom/client').createRoot(document.getElementById('root')).render(R.createElement(App));
`;
const marketFixture = `
window.calls=[];window.addEventListener('message',event=>{if(event.data?.source==='agenciar-desktop-modules')window.calls.push(event.data);});
window.electron={ipcRenderer:{invoke:async(channel,input)=>{const route=channel.replace('desktop-modules:','');let data;switch(route){
case 'composio:catalogue':data={setup:'direct',items:[{slug:'gmail',name:'Gmail',description:'E-mail conectado de demonstração.',categories:[],toolsCount:12,setup:'direct'},{slug:'open',name:'Sem conta',description:'Ferramenta pública de demonstração.',categories:[],toolsCount:1,setup:'direct',noAuth:true}],total:2,nextCursor:null};break;
case 'composio:connections':data={items:[{id:'ca_demo',toolkit:'gmail',name:'Gmail',status:'ACTIVE'},{id:'ca_expired',toolkit:'gmail',name:'Gmail antiga',status:'EXPIRED'}],nextCursor:null};break;
case 'composio:categories':data=[];break;
case 'composio:agents-status':data={enabled:false,total:1,nativeCapable:1,pending:[]};break;
case 'ai:agents':data=[{id:'22222222-2222-4222-8222-222222222222',name:'Agente de demonstração'}];break;
default:throw Error('Unexpected IPC '+route);}
return {ok:true,data};}}};`;
// Optional browser QA tools are separate from the extension's runtime dependencies.
const archivePath = process.env.MEXT_QA_ARCHIVE || (process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs/@multicadesktop/resources/app.asar'));
let nativeCss = fs.readFileSync(path.join(root, 'src/ui/styles.css'));
if (archivePath && fs.existsSync(archivePath)) {
  const asar = require(path.join(root, 'lib/asar.cjs')).openArchive(archivePath);
  const html = asar.read('out/renderer/index.html').toString();
  const cssPath = 'out/renderer/' + html.match(/href="\.\/([^"]+\.css)"/)[1];
  nativeCss = asar.read(cssPath);
}
const server=http.createServer((req,res)=>{
  const route=new URL(req.url,'http://localhost').pathname;
  if(route==='/chat'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/native.css"><style>body{margin:0;font:14px system-ui;background:#fafafa;color:#252735}.button{padding:8px 12px;border:1px solid #ddd;border-radius:6px;background:var(--background,white);color:inherit;font:inherit;cursor:pointer}.button:disabled{opacity:.45;cursor:default}dialog::backdrop{background:#0005}section{margin-top:24px}article{margin-top:12px}textarea{border:1px solid #ddd;border-radius:8px;padding:12px}</style><div id="root"></div><script src="/bundle.js"></script></html>');}
  if(route==='/bundle.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');return res.end(browserBundle);}
  if(route==='/native.css'){res.setHeader('Content-Type','text/css');return res.end(nativeCss);}
  if(route==='/market-fixture.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');return res.end(marketFixture);}
  if(route==='/marketplace'){res.setHeader('Content-Type','text/html');return res.end(fs.readFileSync(path.join(root,'src/ui/index.html'),'utf8').replace('<script src="catalogue-client.js"','<script src="/market-fixture.js"></script><script src="catalogue-client.js"'));}
  const files={'/app.js':'src/ui/app.js','/styles.css':'src/ui/styles.css','/catalogue-client.js':'src/ui/catalogue-client.js','/chat-plugin-model.js':'src/ui/chat-plugin-model.js'};
  if(files[route]){res.setHeader('Content-Type',route.endsWith('.css')?'text/css':'text/javascript; charset=utf-8');return res.end(fs.readFileSync(path.join(root,files[route])));}
  res.statusCode=404;res.end();
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1200,height:900}});
 page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const base='http://127.0.0.1:'+server.address().port;
 const results=[];
 try{
  await page.goto(base+'/marketplace?workspace=11111111-1111-4111-8111-111111111111&slug=demo');
  await page.locator('[data-toolkit="gmail"]').getByRole('button',{name:'Conversar com agente'}).click();
  await page.getByRole('button',{name:'Abrir chat',exact:true}).click();
  await page.waitForFunction(()=>window.calls.length===1);
  const message=await page.evaluate(()=>window.calls[0]);
  assert.equal(message.page,'chat');assert.equal(message.connectionId,'ca_demo');assert.equal(message.toolkit,'gmail');assert.equal(message.agentId,'22222222-2222-4222-8222-222222222222');
  await page.locator('.connections summary').click();
  assert.equal(await page.locator('.connection-item').filter({hasText:'Gmail antiga'}).getByRole('button').count(),0);
  await page.locator('.connection-item').filter({hasText:'Gmailca_demo'}).count();
  results.push('Marketplace: card opens chat with chosen agent and exact account; expired connection has no CTA.');
  await page.screenshot({path:path.join(output,'marketplace.png'),fullPage:true});
  await page.goto(base+'/chat');
  await page.getByRole('button',{name:'Plugins',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'visible'});
  const native=page.getByRole('region',{name:'Plugins Multica',exact:true});
  await native.locator('article').filter({hasText:'Pesquisa Multica'}).getByRole('button',{name:'Ativar no workspace'}).click();
  await page.waitForFunction(()=>window.qa.calls.some(x=>x.enablePlugin?.installationId==='native-off'));
  assert.equal(await native.locator('article').filter({hasText:'Pesquisa Multica'}).getByRole('button',{name:'Usar na conversa'}).count(),1);
  results.push('Native Multica plugin activation uses the workspace scope and refreshes its status.');
  const composio=page.getByRole('region',{name:'Integrações Composio',exact:true});
  assert.ok(await composio.locator('article').filter({hasText:'ca_demo'}).getByRole('button',{name:'Usar na conversa'}).isDisabled());
  await composio.locator('article').filter({hasText:'ca_demo'}).getByRole('button',{name:'Ativar neste agente'}).click();
  await page.waitForFunction(()=>window.qa.state.assigned[0].enabled);
  await composio.locator('article').filter({hasText:'ca_demo'}).getByRole('button',{name:'Usar na conversa'}).click();
  const draft=await page.getByRole('textbox',{name:'Rascunho'}).inputValue();
  assert.match(draft,/Pedido já escrito/);assert.match(draft,/https:\/\/example.invalid\/anexo/);assert.match(draft,/gmail.*ca_demo/);
  results.push('Composio: disabled binding blocks use; enabling it unlocks the exact account and appends a draft without sending.');
  await page.getByRole('button',{name:'Plugins',exact:true}).click();
  await page.getByRole('searchbox').fill('Relatórios');
  assert.equal(await native.locator('article').count(),1);
  await page.getByRole('button',{name:'Fechar',exact:true}).focus();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'hidden'});
  results.push('Search and keyboard dismissal work.');
  await page.getByRole('button',{name:'Plugins',exact:true}).click();
  await page.getByRole('searchbox').fill('');
  await page.evaluate(()=>{window.qa.state.native[1].enabled=false;window.qa.state.user={id:'member'};window.qa.state.role='member';window.qa.refresh();});
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Plugins',exact:true}).click();
  const servers=page.getByRole('region',{name:'Servidores do Multica',exact:true});
  assert.ok(await native.locator('article').filter({hasText:'Pesquisa Multica'}).getByRole('button',{name:'Ativar no workspace'}).isDisabled());
  assert.ok(await servers.locator('article').filter({hasText:'MCP-Router'}).getByRole('button',{name:'Ativar neste agente'}).isDisabled());
  results.push('A non-owner cannot assign a workspace MCP server to another user’s agent.');
  await page.evaluate(()=>{window.qa.state.user={id:'owner'};window.qa.state.role='owner';window.qa.state.provider='copilot';window.qa.refresh();});
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Plugins',exact:true}).click();
  assert.ok(await composio.locator('article').filter({hasText:'ca_demo'}).getByRole('button',{name:'Usar na conversa'}).isDisabled());
  results.push('Unsupported runtime cannot use Composio through a managed assignment.');
  await page.evaluate(()=>{window.qa.state.provider='codex';window.qa.state.errors.native='Falha simulada ao carregar plugins';window.qa.refresh();});
  await native.getByRole('alert').waitFor();
  assert.equal(await native.locator('article').count(),0);
  await native.getByRole('button',{name:'Tentar novamente'}).click();
  await native.locator('article').first().waitFor();
  results.push('A failed native-plugin query shows an error, suppresses stale actions, and can be retried.');
  await page.evaluate(()=>{window.qa.state.failAssignment=true;});
  await servers.locator('article').filter({hasText:'MCP-Router'}).getByRole('button',{name:'Ativar neste agente'}).click();
  await page.getByRole('alert').filter({hasText:'Falha simulada ao ativar servidor'}).waitFor();
  assert.equal(await page.evaluate(()=>window.qa.state.assigned.some(item=>item.id==='router')),false);
  await page.evaluate(()=>{window.qa.state.failAssignment=false;});
  await servers.locator('article').filter({hasText:'MCP-Router'}).getByRole('button',{name:'Ativar neste agente'}).click();
  await page.waitForFunction(()=>window.qa.state.assigned.some(item=>item.id==='router'));
  results.push('An assignment failure remains visible in the dialog, reports no false success, and permits a retry.');
  await page.screenshot({path:path.join(output,'plugins-chat.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(output,'plugins-chat-mobile.png'),fullPage:true});
  const overflow=await page.getByRole('dialog').evaluate(node=>node.scrollWidth>node.clientWidth+1);
  assert.equal(overflow,false);
  results.push('390px mobile dialog has no horizontal overflow.');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({passed:results.length,results,consoleErrors:errors},null,2));
  console.log(JSON.stringify({passed:results.length,results,output},null,2));
 }catch(error){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});fs.writeFileSync(path.join(output,'failure.html'),await page.content());console.log(JSON.stringify({results,pageErrors:errors,text:await page.locator('body').innerText()},null,2));throw error;}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
