'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {loadCatalogues,translateRenderer,translateMain,padToSize}=require('../lib/pt-br.cjs');
const fixture=require('./native-i18n-fixture.cjs');
const directory=path.resolve(__dirname,'../src/i18n/pt-BR');
test('all 25 PT-BR namespaces preserve the 6942 original strings and interpolation variables',()=>{
 const english=Object.fromEntries(fs.readdirSync(path.resolve(__dirname,'../src/i18n/en')).map(name=>[name.slice(0,-5),JSON.parse(fs.readFileSync(path.resolve(__dirname,'../src/i18n/en',name)))]));
 const result=loadCatalogues(english,directory);assert.equal(result.count,6942);assert.equal(Object.keys(result.catalogues).length,25);assert.equal(result.catalogues.layout.nav.agents,'Agentes');
 assert.throws(()=>loadCatalogues({common:{save:'Save {{name}}'}},directory),/Variáveis alteradas/);
});
test('compressed native resources load, preserve English bindings and apply the local locale once',async()=>{
 const result=translateRenderer(fixture.renderer,directory);
 const storage=new Map(),window={localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}};
 const execute=new (Object.getPrototypeOf(async function(){}).constructor)('window',result.source+';createDesktopLocaleAdapter("en");return {resources:RESOURCES,alias:common_default,languages:SUPPORTED_LOCALES};');
 const loaded=await execute(window);assert.equal(loaded.resources['pt-BR'].common.save,'Salvar');assert.equal(loaded.resources.en.common.save,'Save');assert.equal(loaded.alias.save,'Save');assert.ok(loaded.languages.includes('pt-BR'));assert.equal(storage.get('multica-locale'),'pt-BR');
 storage.set('multica-locale','en');await execute(window);assert.equal(storage.get('multica-locale'),'en');
 assert.equal(padToSize('abc',5).length,5);assert.throws(()=>padToSize('abcdef',5),/excede/);
});
test('native quit and context menus use Portuguese without executing lifecycle operations',()=>{
 const context={require:()=>({app:{getPreferredSystemLanguages:()=>['pt-BR']}})};
 vm.runInNewContext(translateMain(fixture.main)+';globalThis.quit=quitLabels("pt-BR");globalThis.menu=pickLabels();',context);
 assert.equal(context.quit.cancel,'Cancelar');assert.match(context.quit.activeRuns(2),/2 execuções/);assert.equal(context.menu.copyImage,'Copiar imagem');
});
