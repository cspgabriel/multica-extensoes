const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { fileURLToPath } = require('node:url');
const { execFile } = require('node:child_process');
const { createAgentAccess } = require('./agent-access.cjs');
const { createStudio } = require('./studio.cjs');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOC_ID = /^[a-z0-9][a-z0-9-]{0,79}\.md$/;
const SLUG = /^[a-z0-9][a-z0-9_-]{0,100}$/;
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const clean = (value, max = 300) => String(value || '').slice(0, max);

function createService(options = {}) {
  const root = options.root || path.resolve(__dirname, '../..');
  const docsRoot = path.join(root, 'data', 'docs');
  const stateRoot = options.stateRoot || path.join(root, 'data');
  const request = options.fetch || globalThis.fetch;
  const electron = options.electron;
  const configPath = path.join(stateRoot, 'composio.json');
  fs.mkdirSync(docsRoot, { recursive: true });
  fs.mkdirSync(stateRoot, { recursive: true });
  const queues = new Map();
  const catalogueCache = new Map();
  const pendingConnections = new Map();
  let categoryCache = null;

  function loadConfig() {
    try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw new Error('A configuração local não pôde ser lida.'); }
  }
  function credentials() {
    if (options.credentials) return options.credentials();
    const config = loadConfig();
    let apiKey = '';
    if (config.encryptedApiKey) {
      if (!electron?.safeStorage.isEncryptionAvailable()) throw new Error('A chave salva não pode ser descriptografada neste usuário do Windows.');
      apiKey = electron.safeStorage.decryptString(Buffer.from(config.encryptedApiKey, 'base64'));
    } else apiKey = process.env.COMPOSIO_API_KEY || '';
    return { apiKey, userId: config.userId || process.env.COMPOSIO_USER_ID || '', source: config.encryptedApiKey ? 'Configuração protegida do Windows' : 'Configuração local do Composio' };
  }
  async function api(route, params = {}, method = 'GET', body) {
    const { apiKey } = credentials();
    if (!apiKey) throw new Error('Configure sua chave do Composio para carregar o marketplace.');
    const url = new URL('https://backend.composio.dev/api/v3.1/' + route);
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    let response;
    try { response = await request(url, { method, headers: { 'x-api-key': apiKey, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25000) }); }
    catch { throw new Error('O Composio não respondeu. Verifique a conexão e tente novamente.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('A chave do Composio foi recusada. Confira a configuração do projeto.');
      if (response.status === 429) throw new Error('O Composio atingiu o limite de consultas. Tente novamente em instantes.');
      throw new Error(`O Composio recusou a operação (${response.status}). Confira a configuração do aplicativo no Composio.`);
    }
    return data;
  }
  function toolkit(item) {
    const authSchemes = item.auth_schemes || [];
    const managedSchemes = item.composio_managed_auth_schemes || [];
    const noAuth = item.no_auth === true || authSchemes.some(scheme => /^no_auth$/i.test(scheme));
    const setup = noAuth || managedSchemes.some(scheme => /oauth/i.test(scheme)) ? 'direct' : 'panel';
    return { slug: clean(item.slug, 100), name: clean(item.name, 120), description: clean(item.meta?.description, 1400), logo: /^https:\/\/(?:logos|assets)\.composio\.dev\//.test(item.meta?.logo || '') ? item.meta.logo : '', categories: (item.meta?.categories || []).map(x => ({ id: clean(x.id || x.slug, 100), name: clean(x.name, 100) })), toolsCount: item.meta?.tools_count || 0, triggersCount: item.meta?.triggers_count || 0, authSchemes, managedSchemes, noAuth, setup };
  }
  function safeDocPath(id) {
    if (!DOC_ID.test(id || '')) throw new Error('Nome de documento inválido. Use letras minúsculas, números e hífens, terminando em .md.');
    const target = path.join(docsRoot, id);
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('Links simbólicos não são documentos editáveis.');
    return target;
  }
  function readDoc(id) {
    const target = safeDocPath(id);
    const content = fs.readFileSync(target, 'utf8');
    return { id, title: content.match(/^#\s+(.+)$/m)?.[1] || id, content, revision: sha(content), updatedAt: fs.statSync(target).mtime.toISOString() };
  }
  function writeAtomic(target, value) {
    const temporary = target + '.' + crypto.randomUUID() + '.tmp';
    try { fs.writeFileSync(temporary, value, { encoding: 'utf8', flag: 'wx' }); fs.renameSync(temporary, target); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  async function saveDoc(input) {
    const target = safeDocPath(input.id);
    if (typeof input.content !== 'string' || Buffer.byteLength(input.content) > 256 * 1024) throw new Error('O documento deve ter até 256 KB.');
    const previous = queues.get(input.id) || Promise.resolve();
    const operation = previous.catch(() => {}).then(() => {
      const current = fs.existsSync(target) ? readDoc(input.id) : null;
      if ((current?.revision || null) !== (input.revision || null)) throw new Error('Este documento mudou em outra janela ou pela IA. Recarregue antes de salvar para preservar as duas versões.');
      if (current && current.content !== input.content) {
        const historyRoot = path.join(docsRoot, '_history', input.id);
        fs.mkdirSync(historyRoot, { recursive: true });
        fs.writeFileSync(path.join(historyRoot, `${Date.now()}-${crypto.randomUUID()}.md`), current.content, 'utf8');
      }
      writeAtomic(target, input.content);
      return readDoc(input.id);
    });
    queues.set(input.id, operation);
    try { return await operation; } finally { if (queues.get(input.id) === operation) queues.delete(input.id); }
  }
  const runCli = options.runCli || ((args, cwd, stdin) => new Promise((resolve, reject) => {
    const executable = path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'bin', 'multica.exe');
    // Agent inventories include attached instructions; real workspaces exceed 16 MiB.
    const child=execFile(executable, ['--profile', options.profile || 'desktop-api.multica.ai', ...args], { cwd, windowsHide: true, timeout: 45000, maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
      if (error) return reject(new Error('O Multica não concluiu a operação. Confira a conexão, as permissões e se o agente está disponível.'));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('A resposta do CLI do Multica não era JSON válido.')); }
    });
    if(stdin!==undefined)child.stdin.end(stdin);
  }));
  const sourceRoot=options.sourceRoot||path.resolve(__dirname,'../..');
  const access=createAgentAccess({root,stateRoot,sourceRoot,runCli,api,credentials});
  function administrativeSession(input){
    if(process.env.MULTICA_TASK_ID||process.env.MULTICA_TASK_CONFIG_ROOT)throw new Error('O Multica bloqueia alterações de MCP por agentes. Ative pelo botão na sessão do proprietário do desktop.');
    if(!UUID.test(input.workspaceId||''))throw new Error('Workspace inválido.');
  }
  async function configureWorker(workspaceId){
    const file=path.join(stateRoot,'agent-worker.json');
    writeAtomic(file,JSON.stringify({root,stateRoot,sourceRoot,profile:options.profile||'desktop-api.multica.ai',executable:process.execPath},null,2));
    const script=path.join(sourceRoot,'src/main/agent-worker.ps1');
    const invoke=(mode,stdin)=>new Promise((resolve,reject)=>{
      const child=execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Mode',mode,'-ConfigPath',file],{windowsHide:true,encoding:'utf8',timeout:30000},(error,stdout)=>error?reject(new Error('O Windows não autorizou o sincronizador automático. As atribuições já feitas permanecem; verifique a sessão do proprietário.')):resolve(stdout.trim()));
      if(stdin!==undefined)child.stdin.end(stdin);
    });
    const {apiKey,userId}=credentials();
    await invoke('Protect',JSON.stringify({apiKey,userId}));
    await invoke('Register');
    access.setAutomatic(workspaceId,true);
  }
  function workspace(input) { if (!UUID.test(input.workspaceId || '')) throw new Error('Selecione um workspace antes de pedir alterações à IA.'); return input.workspaceId; }
  async function localAgents(input) {
    const workspaceId = workspace(input);
    const [agents, daemon] = await Promise.all([runCli(['--workspace-id', workspaceId, 'agent', 'list', '--output', 'json'], root), runCli(['daemon', 'status', '--output', 'json'], root)]);
    const ids = new Set(daemon.workspaces?.find(x => x.id === workspaceId)?.runtimes || []);
    return (Array.isArray(agents) ? agents : agents.items || []).filter(x => ids.has(x.runtime_id) && x.runtime_bound !== false && !x.archived_at && !x.archived).map(x => ({ id: x.id, name: x.name })).sort((a, b) => a.name.localeCompare(b.name));
  }
  async function requestAi(input) {
    const workspaceId = workspace(input);
    if (!UUID.test(input.agentId || '')) throw new Error('Escolha um agente local.');
    const agents = await localAgents(input);
    if (!agents.some(x => x.id === input.agentId)) throw new Error('O agente selecionado não está vinculado a este PC e workspace.');
    const instruction = clean(input.instruction, 12000).trim();
    if (!instruction) throw new Error('Descreva a alteração ou tarefa desejada.');
    const selected = input.docId ? readDoc(input.docId) : null;
    const requestId = crypto.randomUUID();
    const requestDirectory = path.join(root, 'requests', requestId);
    fs.mkdirSync(requestDirectory, { recursive: true });
    const body = `Solicitação feita pelo botão Editar com IA do Multica Desktop no Windows do usuário desta instalação.\n\n${instruction}\n\nContexto local: ${root}\nFontes editáveis: ${options.sourceRoot || path.resolve(__dirname, '../..')}\nLeia primeiro ${path.join(docsRoot, 'manutencao-ia.md')}.\n${selected ? `Documento selecionado: ${path.join(docsRoot, selected.id)}\n\nConteúdo atual:\n${selected.content}\n` : ''}${input.toolkit ? `Toolkit Composio: ${clean(input.toolkit, 100)}. Use a configuração local; não imprima credenciais. Descubra as ferramentas antes de executar.\n` : ''}\nImplemente somente o pedido acima, preserve trabalhos alheios, registre o que mudou e verifique o resultado. Mudanças na interface usam src/ui; backend em src/main. Não encerre o daemon Multica.\n`;
    const bodyPath = path.join(requestDirectory, 'solicitacao.md');
    fs.writeFileSync(bodyPath, body, 'utf8');
    // Never retry issue creation: a lost response can still have created a real task.
    const result = await runCli(['--workspace-id', workspaceId, 'issue', 'create', '--title', `Desktop: ${selected ? 'editar ' + selected.title : input.toolkit ? 'Composio · ' + clean(input.toolkit, 80) : 'alteração com IA'}`, '--description-file', bodyPath, '--assignee-id', input.agentId, '--status', 'todo', '--output', 'json'], requestDirectory);
    const issue = result.issue || result;
    if (!UUID.test(issue.id || '')) throw new Error('A resposta não confirmou o ID da tarefa. Confira as Issues antes de reenviar.');
    return { id: issue.id, identifier: clean(issue.identifier, 80), title: clean(issue.title, 200) };
  }
  function openHttps(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Link inválido.');
    return electron?.shell.openExternal(url.href);
  }
  const handlers = {
    'docs:list': () => fs.readdirSync(docsRoot).filter(x => DOC_ID.test(x) && fs.lstatSync(path.join(docsRoot, x)).isFile()).sort((a,b) => a === 'inicio.md' ? -1 : b === 'inicio.md' ? 1 : a.localeCompare(b)).map(id => { const { content, ...item } = readDoc(id); return item; }),
    'docs:read': input => readDoc(input.id),
    'docs:save': saveDoc,
    'docs:history': input => {
      safeDocPath(input.id);
      const history = path.join(docsRoot, '_history', input.id);
      if (!fs.existsSync(history)) return [];
      return fs.readdirSync(history).filter(x => /^\d+-[0-9a-f-]+\.md$/.test(x)).sort().reverse().slice(0, 50).map(id => ({ id, content: fs.readFileSync(path.join(history, id), 'utf8'), date: new Date(Number(id.split('-')[0])).toISOString() }));
    },
    'docs:folder': () => electron?.shell.openPath(docsRoot),
    'ai:agents': localAgents,
    'ai:request': requestAi,
    'composio:status': () => { const value = credentials(); return { configured: Boolean(value.apiKey), source: value.source, userId: value.userId }; },
    'composio:agents-status': input => { workspace(input); const status=access.status(input.workspaceId); return status.enabled?status:access.preview(input.workspaceId); },
    'composio:agents-enable': async input => {
      administrativeSession(input);
      if(input.confirmAllAgents!==true)throw new Error('Confirme a atribuição aos seus agentes antes de ativar.');
      await access.sync({...input,activate:true,force:true});
      try{await configureWorker(input.workspaceId);}catch(error){return {...access.status(input.workspaceId),automaticError:error.message};}
      return access.status(input.workspaceId);
    },
    'composio:agents-sync': async input => {
      administrativeSession(input);
      const result=await access.sync({...input,force:true});
      if(result.enabled&&!result.automatic){
        try{await configureWorker(input.workspaceId);}catch(error){return {...access.status(input.workspaceId),automaticError:error.message};}
      }
      return access.status(input.workspaceId);
    },
    'composio:configure': async input => {
      const userId = clean(input.userId, 200).trim();
      if (!userId || /[\x00-\x1f]/.test(userId)) throw new Error('Informe um ID de usuário válido para o Composio.');
      const next = { ...loadConfig(), userId };
      if (input.apiKey) {
        if (typeof input.apiKey !== 'string' || input.apiKey.length > 1000) throw new Error('Chave inválida.');
        if (!electron?.safeStorage.isEncryptionAvailable()) throw new Error('A proteção de credenciais do Windows não está disponível.');
        next.encryptedApiKey = electron.safeStorage.encryptString(input.apiKey.trim()).toString('base64');
      }
      writeAtomic(configPath, JSON.stringify(next, null, 2));
      catalogueCache.clear();
      categoryCache = null;
      if(UUID.test(input.workspaceId||'')&&access.status(input.workspaceId).enabled){
        administrativeSession(input);
        await access.sync({workspaceId:input.workspaceId,force:true});
        await configureWorker(input.workspaceId);
      }
      return handlers['composio:status']();
    },
    'composio:catalogue': async (input = {}) => {
      const setup = input.setup || 'direct';
      if (!['direct', 'panel', 'all'].includes(setup)) throw new Error('Filtro de configuração inválido.');
      const params = { limit: 1000, sort_by: 'usage', search: clean(input.search, 150), category: clean(input.category, 100), include_deprecated: false };
      const key = JSON.stringify(params);
      let snapshot = catalogueCache.get(key);
      let offset = 0;
      if (input.cursor) {
        let cursor;
        try { cursor = JSON.parse(Buffer.from(clean(input.cursor, 2000), 'base64url').toString('utf8')); } catch {}
        if (!snapshot || snapshot.expires <= Date.now() || input.refresh || cursor?.id !== snapshot.id || cursor.setup !== setup || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0) throw new Error('O catálogo ou filtro mudou. Atualize a busca para continuar.');
        offset = cursor.offset;
      }
      if (!snapshot || snapshot.expires <= Date.now() || input.refresh) {
        // The API has no auth-setup filter. Build the filtered pagination from
        // every source page so a manual-only page cannot hide eligible apps.
        const items = new Map(), seen = new Set();
        let cursor;
        do {
          if (seen.size >= 20 || seen.has(cursor)) throw new Error('Não foi possível concluir o catálogo. Refine a busca e tente novamente.');
          seen.add(cursor);
          const response = await api('toolkits', { ...params, ...(cursor ? { cursor } : {}) });
          for (const item of response.items || []) { const app = toolkit(item); if (app.slug) items.set(app.slug, app); }
          cursor = response.next_cursor || null;
        } while (cursor);
        snapshot = { id: crypto.randomUUID(), items: [...items.values()], fetchedAt: new Date().toISOString(), expires: Date.now() + 5 * 60 * 1000 };
        if (catalogueCache.size >= 10) catalogueCache.delete(catalogueCache.keys().next().value);
        catalogueCache.set(key, snapshot);
      }
      const items = setup === 'all' ? snapshot.items : snapshot.items.filter(app => app.setup === setup);
      const nextOffset = offset + 48;
      return { items: items.slice(offset, nextOffset), nextCursor: nextOffset < items.length ? Buffer.from(JSON.stringify({ id: snapshot.id, setup, offset: nextOffset })).toString('base64url') : null, total: items.length, setup, fetchedAt: snapshot.fetchedAt };
    },
    'composio:categories': async () => {
      if (categoryCache?.expires > Date.now()) return categoryCache.items;
      const response = await api('toolkits/categories');
      const unique = new Map();
      for (const item of response.items || response.categories || []) {
        const id = clean(item.id || item.slug || item.name, 100);
        if (!id) continue;
        const existing = unique.get(id);
        if (existing) existing.count++;
        else unique.set(id, { id, name: clean(item.name, 100), count: 1 });
      }
      const items = [...unique.values()].sort((a,b) => b.count - a.count).slice(0, 100).map(({count,...item}) => item);
      categoryCache = { items, expires: Date.now() + 5 * 60 * 1000 };
      return items;
    },
    'composio:connections': async (input = {}) => {
      const userId = credentials().userId;
      if (!userId) throw new Error('Configure o ID do usuário para consultar suas conexões.');
      const data = await api('connected_accounts', { user_ids: userId, limit: 100, cursor: clean(input.cursor, 2000) });
      // Return only metadata, and require an exact identity match even if the API ignores a filter.
      return { items: (data.items || []).filter(x => (x.user_id || x.userId) === userId).map(x => ({ id: clean(x.id, 100), toolkit: clean(x.toolkit?.slug, 100), name: clean(x.toolkit?.name || x.toolkit?.slug, 100), status: clean(x.status, 50), updatedAt: x.updated_at || x.created_at || '' })), nextCursor: data.next_cursor || null };
    },
    'composio:detail': async input => {
      if (!SLUG.test(input.slug || '')) throw new Error('Integração inválida.');
      const [info, tools] = await Promise.all([api('toolkits/' + input.slug), api('tools', { toolkit_slug: input.slug, toolkit_versions: 'latest', limit: 15, include_deprecated: false })]);
      return { ...toolkit(info), tools: (tools.items || []).map(x => ({ slug: clean(x.slug, 200), name: clean(x.name, 200), description: clean(x.description, 1400) })), moreTools: Boolean(tools.next_cursor) };
    },
    'composio:connect': async input => {
      if (!SLUG.test(input.slug || '')) throw new Error('Integração inválida.');
      if (pendingConnections.has(input.slug)) return pendingConnections.get(input.slug);
      const operation = (async () => {
        const userId = credentials().userId;
        if (!userId) throw new Error('Configure o ID do usuário antes de conectar.');
        const info = await api('toolkits/' + input.slug);
        if (toolkit(info).noAuth) return { noAuth: true, message: 'Esta integração pode ser usada sem conectar uma conta.' };
        const schemes = info.composio_managed_auth_schemes || [];
        const configs = await api('auth_configs', { toolkit_slug: input.slug, limit: 200 });
        let config = (configs.items || []).find(x => x.toolkit?.slug === input.slug && x.status !== 'DISABLED' && x.is_composio_managed && /OAUTH/i.test(x.auth_scheme));
        if (!config) {
          if (!schemes.some(x => /OAUTH/i.test(x))) return { manual: true, message: 'Esta integração exige configuração própria no Composio. Abra o painel para configurar e volte para atualizar as conexões.' };
          const created = await api('auth_configs', {}, 'POST', { toolkit: { slug: input.slug }, auth_config: { type: 'use_composio_managed_auth', credentials: {} } });
          config = created.auth_config;
        }
        if (!config?.id) throw new Error('O Composio não retornou uma configuração de autenticação.');
        const link = await api('connected_accounts/link', {}, 'POST', { auth_config_id: config.id, user_id: userId });
        const redirect = new URL(link.redirect_url);
        if (redirect.protocol !== 'https:' || !(redirect.hostname === 'composio.dev' || redirect.hostname.endsWith('.composio.dev'))) throw new Error('O Composio retornou um endereço de autorização inesperado.');
        await openHttps(redirect.href);
        return { opened: true, message: 'Conclua a autorização no navegador e clique em Atualizar conexões.' };
      })();
      pendingConnections.set(input.slug, operation);
      try { return await operation; } finally { pendingConnections.delete(input.slug); }
    },
    'composio:dashboard': () => openHttps('https://dashboard.composio.dev/'),
  };
  const studio=createStudio({...options,root,stateRoot,sourceRoot,runCli,electron,access,credentials});
  Object.assign(handlers,studio.handlers);
  return { handlers, root, docsRoot, studio };
}

function register(rendererEntry, options = {}) {
  const electron = options.electron || require('electron');
  const service = createService({ ...options, electron });
  const expected = path.resolve(rendererEntry).toLowerCase();
  service.studio.start();
  let quitting=false;
  electron.app?.on('before-quit',event=>{if(quitting)return;event.preventDefault();service.studio.close().then(()=>{quitting=true;electron.app.quit();}).catch(error=>{console.error('[studio]',error.message);electron.dialog?.showErrorBox('Processos do Estúdio',error.message);});});
  for (const [channel, handler] of Object.entries(service.handlers)) {
    electron.ipcMain.handle('desktop-modules:' + channel, async (event, input = {}) => {
      try {
        const frame = event.senderFrame;
        if (!frame || frame !== frame.top || path.resolve(fileURLToPath(frame.url)).toLowerCase() !== expected) return { ok: false, error: 'Origem não autorizada.' };
        return { ok: true, data: await handler(input) };
      } catch (error) { return { ok: false, error: error.message }; }
    });
  }
  return service;
}
module.exports = { createService, register };
