'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../src/themes/catalogue.js');
const {stylesheet,patchProvider} = require('../lib/themes.cjs');
function luminance(hex) {
  const [r,g,b] = hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
  return 0.2126*r+0.7152*g+0.0722*b;
}
function contrast(a,b) { const x=luminance(a),y=luminance(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); }
test('ten distinct complete palettes maintain text, secondary text, CTA and focus contrast',()=>{
  assert.equal(C.themes.length,10);
  assert.equal(new Set(C.themes.map(x=>x.id)).size,10);
  assert.equal(new Set(C.themes.map(x=>x.palette.canvas)).size,10);
  assert.equal(C.themes.filter(x=>x.mode==='dark').length,6);
  for (const theme of C.themes) {
    const p=theme.palette;
    assert.equal(Object.keys(p).length,14);
    for(const value of Object.values(p)) assert.match(value,/^#[0-9a-f]{6}$/);
    for(const background of ['canvas','surface','raised','hover','selected']) for(const text of ['text','muted']) assert.ok(contrast(p[text],p[background])>=4.5,`${theme.id}: ${text} / ${background}`);
    assert.ok(contrast(p.accent,p.accentText)>=4.5,theme.id+' CTA');
    assert.ok(contrast(p.accent,p.surface)>=4.5,theme.id+' accent');
    for(const signal of ['danger','success','warning','info']) assert.ok(contrast(p[signal],p.surface)>=4.5,theme.id+' '+signal);
  }
});
function runtime({saved={},parent=null,surface=false,blocked=false}={}) {
  const values=new Map(Object.entries(saved)),attrs=new Map(),classes=new Set(['dark']);
  const root={hasAttribute:key=>key==='data-theme-surface'&&surface,setAttribute:(key,value)=>attrs.set(key,value),removeAttribute:key=>attrs.delete(key),classList:{toggle:(key,on)=>on?classes.add(key):classes.delete(key)}};
  const window=new EventTarget();window.parent=parent||window;
  const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>{if(blocked)throw Error('denied');values.set(key,value);},removeItem:key=>{if(blocked)throw Error('denied');values.delete(key);}};
  const context=vm.createContext({window,document:{documentElement:root},localStorage:storage,CustomEvent,setTimeout,clearTimeout});
  for(const file of ['catalogue.js','runtime.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/themes',file),'utf8'),context);
  return {api:context.MulticaThemes,window,values,attrs,classes,context};
}
function message(window,source,data) { const event=new Event('message');Object.assign(event,{source,data});window.dispatchEvent(event); }
test('desktop selection persists independently, restores original preference, and handles corrupt or blocked storage',async()=>{
  const r=runtime({saved:{theme:'system'}});r.api.start({host:true});
  await r.api.select('aurora');
  assert.equal(r.attrs.get('data-multica-theme'),'aurora');assert.equal(r.values.get(C.storageKey),'aurora');
  assert.equal(r.values.get('theme'),'system');assert.ok(r.classes.has('dark'));
  await r.api.select('default');
  assert.equal(r.attrs.has('data-multica-theme'),false);assert.equal(r.values.has(C.storageKey),false);assert.equal(r.values.get('theme'),'system');
  const bad=runtime({saved:{[C.storageKey]:'<invalid>'}});bad.api.start({host:true});assert.equal(bad.api.current(),'default');
  const denied=runtime({blocked:true});denied.api.start({host:true});await assert.rejects(denied.api.select('ceu'),/salvar/);assert.equal(denied.api.current(),'default');
  await assert.rejects(r.api.select('not-a-theme'),/desconhecido/);
});
test('theme bridge accepts only the bound iframe and stops accepting requests after cleanup',async()=>{
  const r=runtime();r.api.start({host:true});const sent=[],frame={postMessage:msg=>sent.push(msg)};
  const remove=r.api.bindFrame(()=>frame);
  message(r.window,{}, {source:r.api.source,action:'select',id:'aurora',requestId:'wrong'});
  assert.equal(r.api.current(),'default');
  message(r.window,frame,{source:r.api.source,action:'select',id:'oceano',requestId:'right'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(r.api.current(),'oceano');assert.ok(sent.some(x=>x.requestId==='right'&&!x.error));
  message(r.window,frame,{source:r.api.source,action:'select',id:'invalid',requestId:'bad'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(r.api.current(),'oceano');assert.ok(sent.some(x=>x.requestId==='bad'&&x.error));
  remove();message(r.window,frame,{source:r.api.source,action:'select',id:'ceu',requestId:'after'});
  assert.equal(r.api.current(),'oceano');
});
test('iframe waits for a parent acknowledgement, ignores a forged sender and applies the confirmed mode',async()=>{
  const sent=[],parent={postMessage:value=>sent.push(value)};
  const r=runtime({parent,surface:true});
  assert.equal(sent[0].action,'request');
  const done=r.api.select('jardim'),request=sent.at(-1);
  assert.equal(r.api.current(),'default');
  const data={source:r.api.source,action:'state',id:'jardim',requestId:request.requestId};
  message(r.window,{},data);assert.equal(r.api.current(),'default');
  message(r.window,parent,data);await done;
  assert.equal(r.api.current(),'jardim');assert.ok(r.classes.has('light'));assert.equal(r.classes.has('dark'),false);
});
test('native provider forces the palette mode only while a custom theme is selected',async()=>{
  const r=runtime();r.api.start({host:true});
  r.context.import_react={useState:fn=>[fn(),()=>{}],useEffect:()=>{}};
  r.context.import_jsx_runtime={jsx:(type,props)=>({type,props})};r.context.J$4='native-provider';
  const source='function ThemeProvider({ children, ...props }) {\nreturn (0, import_jsx_runtime.jsx)(J$4, {\n\t\t...props,\nchildren\n});\n}\n//#endregion';
  vm.runInContext(patchProvider(source),r.context);
  assert.equal(r.context.ThemeProvider({children:null}).props.forcedTheme,undefined);
  await r.api.select('ametista');assert.equal(r.context.ThemeProvider({children:null}).props.forcedTheme,'dark');
  await r.api.select('ceu');assert.equal(r.context.ThemeProvider({children:null}).props.forcedTheme,'light');
  await r.api.select('default');assert.equal(r.context.ThemeProvider({children:null,forcedTheme:'dark'}).props.forcedTheme,'dark');
  assert.throws(()=>patchProvider('function Other(){}'),/aparência ausente/);
});
test('checked-in CSS is generated from the shared tokens and isolates native, module and pool aliases',()=>{
  assert.equal(fs.readFileSync(path.join(__dirname,'../src/themes/themes.css'),'utf8'),stylesheet());
  assert.match(stylesheet(),/data-theme-surface="module"/);assert.match(stylesheet(),/data-theme-surface="pool"/);
});
