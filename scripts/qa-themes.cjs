'use strict';
// Optional UI checks: requires Playwright and its Chromium browser in the developer environment.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const C=require('../src/themes/catalogue.js');
require('./preview-themes.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'dist/qa-themes');
fs.mkdirSync(output,{recursive:true});
const host=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><link rel="stylesheet" href="/src/themes/themes.css"><link rel="stylesheet" href="/host.css"><body><aside><b>✳ Multica</b><p>Workspace de demonstração</p><p>Agentes</p><p>Conversas</p><p>Temas</p><button>Nova tarefa</button></aside><iframe title="Temas" name="themes" id="themes" src="/src/ui/index.html?page=themes"></iframe><iframe title="Pool" name="pool" id="pool" src="/pool-fixture" hidden></iframe><script src="/src/themes/catalogue.js"></script><script src="/src/themes/runtime.js"></script><script src="/host.js"></script></body></html>`;
const hostCss=`:root{--background:#fafbfc;--foreground:#242733;--sidebar:#f2f3f6;--sidebar-foreground:#242733;--brand:#4338b0;--brand-foreground:white}*{box-sizing:border-box}body{margin:0;display:flex;height:100vh;background:var(--background);color:var(--foreground);font:14px system-ui}aside{width:200px;flex-shrink:0;padding:28px 20px;background:var(--sidebar);color:var(--sidebar-foreground)}aside b{font-size:23px}aside p{margin:24px 0}button{border:0;border-radius:7px;padding:10px;background:var(--brand);color:var(--brand-foreground)}iframe:not([hidden]){flex:1;min-width:0;border:0}`;
const hostJs=`MulticaThemes.start({host:true});for(const id of ['themes','pool']){const frame=document.getElementById(id);MulticaThemes.bindFrame(()=>frame.contentWindow);frame.addEventListener('load',()=>MulticaThemes.sendFrame(frame.contentWindow));}`;
const pool=`<!doctype html><html lang="pt-BR" data-theme-surface="pool"><meta charset="utf-8"><link rel="stylesheet" href="/pool/renderer/styles.css"><link rel="stylesheet" href="/src/themes/themes.css"><body><div class="topbar"><h1>Pool de demonstração</h1></div><button class="btn primary">Atualizar</button><script src="/src/themes/catalogue.js"></script><script src="/src/themes/runtime.js"></script></body></html>`;
const server=http.createServer((req,res)=>{
  const route=new URL(req.url,'http://localhost').pathname;
  const fixtures={'/host':['text/html',host],'/host.js':['text/javascript',hostJs],'/host.css':['text/css',hostCss],'/pool-fixture':['text/html',pool]};
  if(fixtures[route]){res.setHeader('Content-Type',fixtures[route][0]+'; charset=utf-8');return res.end(fixtures[route][1]);}
  const filename=path.resolve(root,'.'+decodeURIComponent(route));
  const relative=path.relative(root,filename);
  if(relative.startsWith('..')||path.isAbsolute(relative)||!['src','pool','dist'].includes(relative.split(path.sep)[0])||!fs.existsSync(filename)||!fs.statSync(filename).isFile()){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',({'js':'text/javascript','css':'text/css','html':'text/html'})[path.extname(filename).slice(1)]+'; charset=utf-8');
  res.end(fs.readFileSync(filename));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1480,height:1000}});page.setDefaultTimeout(6000);
  const errors=[],violations=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>console.error('CSP:'+event.violatedDirective)));
  page.on('console',event=>{if(event.type()==='error'&&event.text().startsWith('CSP:'))violations.push(event.text());});
  const base='http://127.0.0.1:'+server.address().port,results=[];
  try{
    await page.goto(base+'/src/ui/index.html?page=themes');
    await page.locator('[data-theme-card]').first().waitFor();
    assert.equal(await page.locator('[data-theme-card]').count(),10);
    await page.getByRole('button',{name:'Escuros',exact:true}).click();assert.equal(await page.locator('[data-theme-card]').count(),6);
    await page.getByRole('button',{name:'Claros',exact:true}).click();assert.equal(await page.locator('[data-theme-card]').count(),4);
    await page.getByRole('button',{name:'Todos',exact:true}).click();
    await page.getByRole('searchbox').fill('cafe');assert.equal(await page.locator('[data-theme-card]').count(),1);
    await page.getByRole('searchbox').fill('inexistente');assert.equal(await page.locator('[data-theme-card]').count(),0);
    await page.getByRole('searchbox').fill('');
    results.push('10 cards; 6 dark/4 light filters; accent-insensitive search and empty state.');
    for(const theme of C.themes){
      await page.getByRole('button',{name:'Aplicar '+theme.name,exact:true}).click();
      await page.waitForFunction(id=>document.documentElement.dataset.multicaTheme===id,theme.id);
      const actual=await page.evaluate(()=>({background:getComputedStyle(document.body).backgroundColor,text:getComputedStyle(document.body).color,scheme:getComputedStyle(document.documentElement).colorScheme,stored:localStorage.getItem(MulticaThemeCatalog.storageKey),buttonBackground:getComputedStyle(document.querySelector('.theme-card .button.primary')).backgroundColor,buttonText:getComputedStyle(document.querySelector('.theme-card .button.primary')).color}));
      const rgb=hex=>'rgb('+hex.slice(1).match(/../g).map(x=>parseInt(x,16)).join(', ')+')';
      assert.equal(actual.background,rgb(theme.palette.canvas));assert.equal(actual.text,rgb(theme.palette.text));assert.equal(actual.scheme,theme.mode);assert.equal(actual.stored,theme.id);
      assert.equal(actual.buttonBackground,rgb(theme.palette.accent));assert.equal(actual.buttonText,rgb(theme.palette.accentText));
      await page.locator(`[data-theme-card="${theme.id}"]`).screenshot({path:path.join(output,theme.id+'.png')});
    }
    results.push('Every palette applies its own canvas, foreground, color-scheme and persisted ID.');
    await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.multicaTheme==='ceu');
    await page.getByRole('button',{name:'Voltar ao tema original'}).click();
    await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-multica-theme'));
    await page.screenshot({path:path.join(output,'10-temas.png'),fullPage:true});
    results.push('Selection survives reload and the original appearance can be restored.');
    await page.goto(base+'/host',{waitUntil:'domcontentloaded'});
    await page.frameLocator('#themes').locator('[data-theme-card]').first().waitFor();
    await page.frameLocator('#pool').locator('h1').waitFor({state:'attached'});
    const frame=page.frame({name:'themes'}),poolFrame=page.frame({name:'pool'});
    await page.evaluate(()=>localStorage.setItem('theme','system'));
    await frame.getByRole('button',{name:'Aplicar Aurora',exact:true}).click();
    await page.waitForFunction(()=>document.documentElement.dataset.multicaTheme==='aurora');
    await poolFrame.waitForFunction(()=>document.documentElement.dataset.multicaTheme==='aurora');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(16, 21, 34)');
    assert.equal(await poolFrame.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(16, 21, 34)');
    assert.equal(await poolFrame.evaluate(()=>getComputedStyle(document.querySelector('.btn.primary')).color),'rgb(24, 16, 41)');
    assert.equal(await page.evaluate(()=>localStorage.getItem('theme')),'system');
    results.push('A selection from the theme iframe synchronizes native shell and Pool without overwriting the native system preference.');
    await page.evaluate(()=>window.postMessage({source:MulticaThemes.source,action:'select',id:'areia',requestId:'untrusted'},'*'));
    assert.equal(await page.evaluate(()=>MulticaThemes.current()),'aurora');
    await page.screenshot({path:path.join(output,'multica-aurora.png'),fullPage:true});
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>MulticaThemes.current()==='aurora');
    await page.frameLocator('#themes').locator('[data-theme-card]').first().waitFor();
    const refreshed=page.frame({name:'themes'});await refreshed.waitForFunction(()=>document.documentElement.dataset.multicaTheme==='aurora');
    await refreshed.getByRole('button',{name:'Voltar ao tema original'}).click();
    await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-multica-theme'));
    assert.equal(await page.evaluate(()=>localStorage.getItem('theme')),'system');
    results.push('The host ignores an unbound message sender; saved themes reload into the iframe and reset leaves native preference intact.');
    await page.goto(base+'/src/ui/index.html?page=themes');await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Aplicar Oceano',exact:true}).click();
    await page.getByRole('button',{name:'Oceano em uso',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(output,'temas-mobile.png'),fullPage:true});
    results.push('390px mobile gallery has no horizontal overflow.');
    await page.setViewportSize({width:1480,height:1000});
    await page.goto(require('node:url').pathToFileURL(path.join(root,'dist/temas-multica-preview.html')).href);
    assert.equal(await page.locator('[data-theme-card]').count(),10);
    await page.getByRole('button',{name:'Aplicar Floresta',exact:true}).click();
    await page.getByRole('button',{name:'Floresta em uso',exact:true}).waitFor();
    await page.reload();await page.getByRole('button',{name:'Floresta em uso',exact:true}).waitFor();
    await page.getByRole('button',{name:'Voltar ao tema original'}).click();
    await page.getByRole('button',{name:'Aplicar Floresta',exact:true}).waitFor();
    await page.screenshot({path:path.join(output,'previa-10-temas.png'),fullPage:true});
    results.push('The standalone HTML works from a file URL, applies and persists a theme, and restores the original preview.');
    assert.deepEqual(errors,[]);assert.deepEqual(violations,[]);
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({passed:results.length,results,pageErrors:errors,cspViolations:violations},null,2));
    console.log(JSON.stringify({passed:results.length,results,output},null,2));
  }catch(error){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw error;}
  finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
