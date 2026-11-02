'use strict';
const {ipcMain,shell}=require('electron');
const path=require('node:path');
const {fileURLToPath}=require('node:url');
const cli=require('./src/cli');
const hermes=require('./src/hermes');
const opencode=require('./src/opencode');
const HANDLERS = {
  'claude:list': () => cli.claude.list(),
  'claude:config': () => cli.claude.config(),
  'claude:switch': (sel) => cli.claude.switch(sel),
  'claude:switchBest': () => cli.claude.switchBest(),
  'claude:enable': (sel) => cli.claude.enable(sel),
  'claude:disable': (sel) => cli.claude.disable(sel),
  'claude:remove': (sel) => cli.claude.remove(sel),
  'claude:setThreshold': (v) => cli.claude.setThreshold(v),
  'claude:log': () => cli.claude.log(),
  'codex:list': () => cli.codex.list(),
  'codex:config': () => cli.codex.config(),
  'codex:switch': (sel) => cli.codex.switch(sel),
  'codex:redeemReset': (sel) => cli.codex.redeemReset(sel),
  'codex:remove': (sel) => cli.codex.remove(sel),
  'codex:setThreshold': (v) => cli.codex.setThreshold(v),
  'codex:log': () => cli.codex.log(),
  'antigravity:list': () => cli.antigravity.list(),
  'antigravity:config': () => cli.antigravity.config(),
  'antigravity:switch': (sel) => cli.antigravity.switch(sel),
  'antigravity:remove': (sel) => cli.antigravity.remove(sel),
  'antigravity:setThreshold': (v) => cli.antigravity.setThreshold(v),
  'antigravity:log': () => cli.antigravity.log(),
  'copilot:list': () => cli.copilot.list(),
  'copilot:config': () => cli.copilot.config(),
  'copilot:switch': (sel) => cli.copilot.switch(sel),
  'copilot:remove': (sel) => cli.copilot.remove(sel),
  'copilot:setThreshold': (v) => cli.copilot.setThreshold(v),
  'copilot:log': () => cli.copilot.log(),
  'hermes:list': () => hermes.list(),
  'hermes:prefer': (provider, id) => hermes.prefer(provider, id),
  'hermes:reset': (provider, id) => hermes.reset(provider, id),
  'hermes:refresh': (provider, id) => hermes.refresh(provider, id),
  'hermes:remove': (provider, id) => hermes.remove(provider, id),
  'hermes:status': () => hermes.status(),
  'opencode:list': () => opencode.list(),
  'opencode:agyUse': (ref) => opencode.agyUse(ref),
  'opencode:agyToggle': (ref) => opencode.agyToggle(ref),
  'opencode:agyClearLimits': (ref) => opencode.agyClearLimits(ref),
  'opencode:logout': (provider, id) => opencode.logout(provider, id),
  'auto:status': () => cli.autoStatus(),
  'auto:set': (which, enabled) => cli.setAuto(which, Boolean(enabled)),
  'auto:runNow': (which) => cli.runAutoNow(which),
  'login:open': (which) => cli.openLogin(which),
  'terminal:open': (which) => cli.openTerminal(which),
  'folder:open': async (which) => {
    const dir = cli.FOLDERS[which];
    if (!dir) throw new Error(`Pasta desconhecida: ${which}`);
    const err = await shell.openPath(dir);
    if (err) throw new Error(err);
  },
};

exports.register=function(rendererEntry){const expected=path.resolve(rendererEntry).toLowerCase();for(const [channel,handler]of Object.entries(HANDLERS)){ipcMain.handle('pool-contas-ia:'+channel,async(event,...args)=>{try{const frame=event.senderFrame;if(!frame||frame!==frame.top||path.resolve(fileURLToPath(frame.url)).toLowerCase()!==expected)return{ok:false,error:'Origem não autorizada.'};return{ok:true,data:await handler(...args)}}catch(error){return{ok:false,error:error.message}}})}};
