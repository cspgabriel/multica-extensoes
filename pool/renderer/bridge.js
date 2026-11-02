(function(){


const call = (channel) => (...args) => window.parent.electron.ipcRenderer.invoke('pool-contas-ia:' + channel, ...args);

window.pool = {
  claude: {
    list: call('claude:list'),
    config: call('claude:config'),
    switch: call('claude:switch'),
    switchBest: call('claude:switchBest'),
    enable: call('claude:enable'),
    disable: call('claude:disable'),
    remove: call('claude:remove'),
    setThreshold: call('claude:setThreshold'),
    log: call('claude:log'),
  },
  codex: {
    list: call('codex:list'),
    config: call('codex:config'),
    switch: call('codex:switch'),
    redeemReset: call('codex:redeemReset'),
    remove: call('codex:remove'),
    setThreshold: call('codex:setThreshold'),
    log: call('codex:log'),
  },
  antigravity: {
    list: call('antigravity:list'),
    config: call('antigravity:config'),
    switch: call('antigravity:switch'),
    remove: call('antigravity:remove'),
    setThreshold: call('antigravity:setThreshold'),
    log: call('antigravity:log'),
  },
  copilot: {
    list: call('copilot:list'),
    config: call('copilot:config'),
    switch: call('copilot:switch'),
    remove: call('copilot:remove'),
    setThreshold: call('copilot:setThreshold'),
    log: call('copilot:log'),
  },
  hermes: {
    list: call('hermes:list'),
    prefer: call('hermes:prefer'),
    reset: call('hermes:reset'),
    refresh: call('hermes:refresh'),
    remove: call('hermes:remove'),
    status: call('hermes:status'),
  },
  opencode: {
    list: call('opencode:list'),
    agyUse: call('opencode:agyUse'),
    agyToggle: call('opencode:agyToggle'),
    agyClearLimits: call('opencode:agyClearLimits'),
    logout: call('opencode:logout'),
  },
  auto: { status: call('auto:status'), set: call('auto:set'), runNow: call('auto:runNow') },
  login: { open: call('login:open') },
  terminal: { open: call('terminal:open') },
  folder: { open: call('folder:open') },
};

})();
