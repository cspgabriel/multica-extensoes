'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Verified against Multica's packages/core/agents/mcp-support.ts. A binding
// alone is deliberately not reported as runtime support.
const NATIVE_PROVIDERS = new Set(['claude','codebuddy','codearts','codex','cursor','grok','hermes','kimi','reasonix','dsh','kiro','opencode','openclaw','pi','qoder','qoderclicn','qwen','qwenpaw','mcode','devin','traecli','dim','omp']);
const MARKER_START = '<!-- multica-composio-primary:start -->';
const MARKER_END = '<!-- multica-composio-primary:end -->';
const CONTEXT = `${MARKER_START}\nPara serviços externos, priorize as ferramentas MCP do Marketplace Composio (servidor multica-marketplace-*). Primeiro descubra ferramentas e contas conectadas com COMPOSIO_SEARCH_TOOLS; depois execute apenas o pedido autorizado. Não use CLI/API direta antes dessa descoberta, exceto por preferência explícita do usuário ou falha/ausência concreta da ferramenta. Se o runtime não carregar MCP, informe a limitação em vez de declarar acesso nativo. A conexão não amplia a autorização para mensagens, publicação, exclusão ou gastos.\n${MARKER_END}`;
const array = value => Array.isArray(value) ? value : value?.items || value?.agents || value?.servers || value?.skills || [];
const fingerprint = value => crypto.createHash('sha256').update(value).digest('hex');

function createAgentAccess({ root, stateRoot, sourceRoot, runCli, api, credentials, report = () => {}, now = () => Date.now() }) {
  const filename = path.join(stateRoot, 'agent-access.json');
  const locks = new Map();
  let cachedPreview=null;
  function readState() {
    try { return JSON.parse(fs.readFileSync(filename, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return { workspaces: {} }; throw new Error('Não foi possível ler o estado de acesso dos agentes.'); }
  }
  function saveState(state) {
    fs.mkdirSync(stateRoot, { recursive: true });
    const temporary = filename + '.' + crypto.randomUUID() + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, filename);
  }
  const cli = (workspaceId, args, stdin) => runCli(['--workspace-id', workspaceId, ...args], root, stdin);
  function status(workspaceId) {
    const value = readState().workspaces[workspaceId];
    if (!value) return { enabled: false, total: 0, nativeConfigured: 0, assigned: 0, pending: [], note: 'Ative pela sessão do proprietário do desktop.' };
    return { enabled: Boolean(value.enabled), total: value.total || 0, assigned: value.assigned?.length || 0, nativeConfigured: value.nativeConfigured || 0, pending: value.pending || [], errors: value.errors || [], lastSync: value.lastSync, lastError: value.lastError, serverName: value.serverName, policyInstalled: Boolean(value.policyInstalled), skillInstalled: Boolean(value.skillId), automatic: Boolean(value.automatic), nextSyncSeconds: 60 };
  }
  async function preview(workspaceId){
    if(!UUID.test(workspaceId||''))throw new Error('Workspace inválido.');
    if(cachedPreview?.workspaceId===workspaceId&&cachedPreview.until>now())return cachedPreview.value;
    const [profile,rawAgents,rawRuntimes]=await Promise.all([
      cli(workspaceId,['user','profile','get','--output','json']),
      cli(workspaceId,['agent','list','--output','json']),
      cli(workspaceId,['runtime','list','--output','json']),
    ]);
    if(!UUID.test(profile.id||''))throw new Error('A sessão do proprietário não pôde ser confirmada.');
    const runtimes=new Map(array(rawRuntimes).map(x=>[x.id,x]));
    const agents=array(rawAgents).filter(x=>x.owner_id===profile.id&&!x.archived_at&&!x.archived);
    const pending=agents.filter(x=>!x.runtime_id||!NATIVE_PROVIDERS.has(runtimes.get(x.runtime_id)?.provider)).map(x=>({id:x.id,name:x.name,provider:runtimes.get(x.runtime_id)?.provider||'sem runtime',reason:x.runtime_id?'Este provider não recebe MCP gerenciado.':'Agente sem runtime vinculado.'}));
    const value={...status(workspaceId),total:agents.length,nativeCapable:agents.length-pending.length,pending};
    cachedPreview={workspaceId,until:now()+30000,value};
    return value;
  }
  async function sync(input) {
    if (!UUID.test(input.workspaceId || '')) throw new Error('Workspace inválido.');
    if (locks.has(input.workspaceId)) return locks.get(input.workspaceId);
    fs.mkdirSync(stateRoot,{recursive:true});
    const lockPath=path.join(stateRoot,'agent-access.lock');
    const token=crypto.randomUUID();
    if(fs.existsSync(lockPath)){
      let previous;
      try{previous=JSON.parse(fs.readFileSync(lockPath,'utf8'));}catch{}
      let alive=false;
      if(previous?.pid){try{process.kill(previous.pid,0);alive=true;}catch{}}
      if(!alive||now()-(previous?.at||0)>10*60*1000)fs.unlinkSync(lockPath);
      else throw new Error('Uma sincronização já está em andamento. Aguarde a atualização do painel.');
    }
    fs.writeFileSync(lockPath,JSON.stringify({token,pid:process.pid,at:now()}),{flag:'wx',mode:0o600});
    const operation = perform(input).finally(() => {
      locks.delete(input.workspaceId);
      try{if(JSON.parse(fs.readFileSync(lockPath,'utf8')).token===token)fs.unlinkSync(lockPath);}catch{}
    });
    locks.set(input.workspaceId, operation);
    return operation;
  }
  async function perform(input) {
    const workspaceId = input.workspaceId;
    const state = readState();
    const previous = state.workspaces[workspaceId] || {};
    if (!input.activate && !previous.enabled) return status(workspaceId);
    const value = { ...previous, assigned: previous.assigned || [], pending: [], errors: [] };
    const commit = () => { state.workspaces[workspaceId] = value; saveState(state); };
    try {
      const { apiKey, userId } = credentials();
      if (!apiKey || !userId) throw new Error('Configure a chave e o ID de usuário do Composio antes de habilitar os agentes.');
      const [profile, rawAgents, rawRuntimes, workspace] = await Promise.all([
        cli(workspaceId, ['user','profile','get','--output','json']),
        cli(workspaceId, ['agent','list','--output','json']),
        cli(workspaceId, ['runtime','list','--output','json']),
        cli(workspaceId, ['workspace','get','--output','json']),
      ]);
      if (!UUID.test(profile.id || '')) throw new Error('A sessão do proprietário não pôde ser confirmada.');
      if (previous.ownerId && previous.ownerId !== profile.id) throw new Error('Esta configuração pertence a outro proprietário. Use uma instalação separada para esta conta.');
      const agents = array(rawAgents).filter(x => x.owner_id === profile.id && !x.archived_at && !x.archived);
      const runtimes = new Map(array(rawRuntimes).map(x => [x.id, x]));
      const credentialFingerprint = fingerprint(apiKey + '\0' + userId);
      value.total = agents.length;
      value.userId = userId;
      value.ownerId = profile.id;
      value.serverName = previous.serverName || 'multica-marketplace-' + fingerprint(profile.id).slice(0, 10);
      value.pending = agents.filter(x => !x.runtime_id || !NATIVE_PROVIDERS.has(runtimes.get(x.runtime_id)?.provider)).map(x => ({ id: x.id, name: x.name, provider: runtimes.get(x.runtime_id)?.provider || 'sem runtime', reason: x.runtime_id ? 'O provider não recebe MCP gerenciado nesta versão do Multica.' : 'Agente sem runtime vinculado.' }));
      report({ phase: 'preflight', total: agents.length, pending: value.pending.length });
      if (!value.sessionId || value.credentialFingerprint !== credentialFingerprint) {
        const session = await api('tool_router/session', {}, 'POST', { user_id: userId, instant: false, multi_account: { enable: true, require_explicit_selection: true }, manage_connections: { enable: false, enable_connection_removal: false } });
        if (!session.session_id || !session.mcp?.url) throw new Error('O Composio não retornou uma sessão MCP.');
        if (new URL(session.mcp.url).origin !== 'https://backend.composio.dev') throw new Error('O endpoint MCP retornado não tem a mesma origem da API Composio.');
        value.sessionId = session.session_id;
        value.mcpUrl = session.mcp.url;
        value.credentialFingerprint = credentialFingerprint;
        value.serverNeedsUpdate = true;
        commit();
      }
      const library = array(await cli(workspaceId, ['workspace','mcp','list','--output','json']));
      let server = library.find(x => x.id === value.serverId) || library.find(x => x.name === value.serverName);
      const serverConfig = JSON.stringify({ type: 'http', url: value.mcpUrl, headers: { 'x-api-key': apiKey } });
      if (!server) {
        const created = await cli(workspaceId, ['workspace','mcp','add',value.serverName,'--server-config-stdin','--output','json'], serverConfig);
        server = created.server || created;
        if (!UUID.test(server.id || '')) throw new Error('O Multica não confirmou o ID do servidor. Confira a biblioteca MCP antes de reenviar.');
      } else if (value.serverNeedsUpdate || value.serverId !== server.id) {
        await cli(workspaceId, ['workspace','mcp','update',server.id,'--name',value.serverName,'--server-config-stdin','--output','json'], serverConfig);
      }
      value.serverId = server.id;
      value.serverNeedsUpdate = false;
      commit();
      const policy = fs.readFileSync(path.join(sourceRoot, 'src','policies','composio-first.md'), 'utf8');
      if (!value.skillId) {
        const skills = array(await cli(workspaceId, ['skill','list','--output','json']));
        const found = skills.find(x => x.name === 'multica-marketplace-composio');
        if (found) value.skillId = found.id;
        else {
          const result = await cli(workspaceId, ['skill','create','--name','multica-marketplace-composio','--description','Priorize descoberta e execução pelas ferramentas Composio conectadas ao Marketplace.','--content-stdin','--output','json'], policy);
          value.skillId = (result.skill || result).id;
        }
        if (!UUID.test(value.skillId || '')) throw new Error('O ID da skill Composio não foi confirmado.');
        commit();
      }
      const policyFingerprint=fingerprint(policy);
      if(value.policyFingerprint!==policyFingerprint){
        await cli(workspaceId,['skill','update',value.skillId,'--content-stdin','--output','json'],policy);
        value.policyFingerprint=policyFingerprint;
        commit();
      }
      let context = workspace.context || '';
      const start = context.indexOf(MARKER_START), end = context.indexOf(MARKER_END);
      const updatedContext = start >= 0 && end >= start ? context.slice(0,start) + CONTEXT + context.slice(end + MARKER_END.length) : (context.trim() ? context.trimEnd() + '\n\n' : '') + CONTEXT;
      if (updatedContext !== context) await cli(workspaceId, ['workspace','update','--context-stdin','--output','json'], updatedContext);
      value.policyInstalled = true;
      const fullAudit = input.force || !value.fullAuditAt || now() - value.fullAuditAt > 5 * 60 * 1000;
      const done = new Set(value.assigned);
      let cursor = 0;
      async function worker() {
        while (cursor < agents.length) {
          const agent = agents[cursor++];
          try {
            if (fullAudit || !done.has(agent.id)) {
              const assignments = array(await cli(workspaceId, ['agent','mcp','list',agent.id,'--output','json']));
              const existing = assignments.find(x => (x.server_id || x.id) === server.id);
              if (!existing) await cli(workspaceId, ['agent','mcp','add',agent.id,server.id,'--output','json']);
              else if (existing.enabled === false) await cli(workspaceId, ['agent','mcp','enable',agent.id,server.id,'--output','json']);
              await cli(workspaceId, ['agent','skills','add',agent.id,'--skill-ids',value.skillId,'--output','json']);
              done.add(agent.id);
              if(done.size%10===0){value.assigned=[...done];commit();}
            }
            report({ phase: 'assigning', assigned: done.size, total: agents.length });
          } catch (error) { value.errors.push({ id: agent.id, name: agent.name, error: error.message }); done.delete(agent.id); }
        }
      }
      await Promise.all(Array.from({length:Math.min(4,agents.length)},worker));
      value.assigned = [...done].filter(id => agents.some(x => x.id === id));
      value.nativeConfigured = agents.filter(x => done.has(x.id) && x.runtime_id && NATIVE_PROVIDERS.has(runtimes.get(x.runtime_id)?.provider)).length;
      value.enabled = true;
      value.lastSync = new Date(now()).toISOString();
      value.lastError = null;
      if (fullAudit) value.fullAuditAt = now();
      commit();
      return status(workspaceId);
    } catch (error) {
      value.lastError = error.message;
      commit();
      throw error;
    }
  }
  function setAutomatic(workspaceId, enabled) {
    const state = readState();
    if (!state.workspaces[workspaceId]) return;
    state.workspaces[workspaceId].automatic = enabled;
    saveState(state);
  }
  return { sync, status, preview, readState, setAutomatic };
}
module.exports = { createAgentAccess, NATIVE_PROVIDERS };
