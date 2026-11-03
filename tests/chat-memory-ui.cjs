'use strict';
// Optional browser smoke test: MEXT_UI_DEPS points to a folder with react, react-dom and esbuild.
// MEXT_PLAYWRIGHT and MEXT_BROWSER_CACHE can reuse an existing Playwright installation.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const deps = process.env.MEXT_UI_DEPS;
if (!deps) throw Error('Configure MEXT_UI_DEPS com a pasta de dependências de teste.');
if (process.env.MEXT_BROWSER_CACHE) process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.MEXT_BROWSER_CACHE;
const { chromium } = require(process.env.MEXT_PLAYWRIGHT || 'playwright');
const esbuild = require(path.join(deps, 'node_modules/esbuild'));
const { createMemory } = require('../src/main/chat-memory.cjs');
const ownerId = '11111111-1111-4111-8111-111111111111', workspaceId = '22222222-2222-4222-8222-222222222222', chatId = '33333333-3333-4333-8333-333333333333';
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-ui-'));
  const service = createMemory({ root, taskContext: () => false });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.exposeFunction('memoryInvoke', async (channel, input) => {
      try { return { ok: true, data: service[channel.split(':')[1]](input) }; }
      catch (error) { return { ok: false, error: error.message }; }
    });
    const sourceRoot = path.resolve(__dirname, '..');
    const source = `import * as React from 'react'; import {createRoot} from 'react-dom/client';
      var import_react=React;
      var user={id:${JSON.stringify(ownerId)}};
      var workspace={id:${JSON.stringify(workspaceId)},slug:'fixture'};
      var useAuthStore=Object.assign(fn=>fn({user}),{getState:()=>({user})});
      var workspaceHeader=slug=>({'X-Workspace-Slug':slug});
      window.electron={ipcRenderer:{invoke:window.memoryInvoke}};
      window.tick=null; window.setInterval=fn=>{window.tick=fn;return 1}; window.clearInterval=()=>{};
      window.revision='Primeira decisão'; window.fail=false; window.calls=0;
      var api={fetch:async url=>{window.calls++; if(window.fail)throw Error('Offline de teste');
        if(url.startsWith('/api/chat/sessions?'))return [{id:${JSON.stringify(chatId)},workspace_id:workspace.id,creator_id:user.id,title:'Projeto São João',status:'archived'}];
        return {messages:[{id:${JSON.stringify(ownerId)},chat_session_id:${JSON.stringify(chatId)},role:'user',content:window.revision,created_at:'2026-11-03T12:00:00Z'}],has_more:false};}};
      ${fs.readFileSync(path.join(sourceRoot, 'src/ui/chat-memory-sync.js'), 'utf8')}
      ${fs.readFileSync(path.join(sourceRoot, 'src/ui/chat-memory-native.js'), 'utf8')}
      createRoot(document.getElementById('app')).render(React.createElement(MulticaMemoryPanel,{user,workspace}));`;
    const bundle = await esbuild.build({ stdin: { contents: source, resolveDir: deps, loader: 'js' }, bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } });
    await page.setContent('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body><div id="app"></div></body></html>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole('button', { name: 'Memória local das conversas' }).click();
    await page.getByRole('button', { name: 'Ativar e exportar' }).click();
    await page.getByText(/1 conversas na pasta/).waitFor();
    const directory = service.status({ ownerId, workspaceId }).directory;
    const filename = path.join(directory, 'conversas', chatId + '.md');
    assert.match(fs.readFileSync(filename, 'utf8'), /Primeira decisão/);
    await page.getByRole('button', { name: 'Fechar', exact: true }).click();
    await page.evaluate(async () => { window.revision='Decisão atualizada'; await window.tick(); });
    assert.match(fs.readFileSync(filename, 'utf8'), /Decisão atualizada/);
    await page.getByRole('button', { name: 'Memória local das conversas' }).click();
    await page.getByRole('button', { name: 'Pausar atualização' }).click();
    const calls = await page.evaluate(() => window.calls);
    await page.evaluate(async () => { await window.tick(); });
    assert.equal(await page.evaluate(() => window.calls), calls);
    await page.evaluate(() => { window.fail=true; });
    await page.getByRole('button', { name: 'Ativar e exportar' }).click();
    await page.getByRole('alert').filter({ hasText: 'Offline de teste' }).waitFor();
    assert.match(fs.readFileSync(filename, 'utf8'), /Decisão atualizada/);
    assert.deepEqual(errors, []);
    const output = process.env.MEXT_UI_REPORT ? path.resolve(process.env.MEXT_UI_REPORT) : root;
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'memory-ui.png') });
    fs.writeFileSync(path.join(output, 'ui-verification.json'), JSON.stringify({ passed: true, activated: true, autoSyncWithPanelClosed: true, pause: true, failurePreservesData: true, realPlatformRequests: 0, errors }, null, 2));
    console.log(JSON.stringify({ passed: true, output }));
  } finally { await browser.close(); fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
