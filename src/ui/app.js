'use strict';
(() => {
  const query = new URLSearchParams(location.search);
  const page = query.get('page') || 'marketplace';
  const context = { workspaceId: query.get('workspace') || '', workspaceSlug: query.get('slug') || '' };
  const content = document.getElementById('content');
  const modal = document.getElementById('modal');
  const modalContent = document.getElementById('modal-content');
  let currentDoc = null;
  let editing = false;
  let dirty = false;
  let catalogueSequence = 0;
  let cataloguePhase = 'idle';
  let catalogue = createCatalogueClient(input => call('composio:catalogue', input));
  let market = { search: '', category: '', setup: 'direct', items: [], nextCursor: null, total: 0, connections: [], connectionsCursor: null };

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (value !== false && value !== null && value !== undefined) node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of [].concat(children)) if (child !== null && child !== false && child !== undefined) node.append(child);
    return node;
  }
  function button(text, onclick, className = 'button') { return el('button', { text, onclick, class: className, type: 'button' }); }
  async function call(channel, payload = {}) {
    let response;
    try{response=await window.parent.electron.ipcRenderer.invoke('desktop-modules:' + channel, payload);}
    catch(error){if(/No handler registered/i.test(error.message))throw new Error('A atualização do acesso dos agentes está pronta. Reabra a interface do Multica quando puder e volte a este painel.');throw error;}
    if (!response.ok) throw new Error(response.error);
    return response.data;
  }
  function notify(text, bad = false) {
    const node = el('div', { class: 'toast' + (bad ? ' bad' : ''), text });
    document.getElementById('notices').append(node);
    setTimeout(() => node.remove(), bad ? 10000 : 5500);
  }
  function navigate(target, extra = {}) {
    if (dirty && !window.confirm('Há alterações sem salvar. Deseja sair deste documento?')) return;
    window.parent.postMessage({ source: 'agenciar-desktop-modules', action: 'navigate', page: target, ...extra }, '*');
  }
  function openModal(title, description) {
    modalContent.replaceChildren();
    const body = el('div', { class: 'modal-body' });
    body.append(el('div', { class: 'modal-head' }, [el('div', {}, [el('h2', { text: title }), description ? el('p', { text: description }) : null]), button('×', () => modal.close(), 'close')]));
    modalContent.append(body);
    if (!modal.open) modal.showModal();
    return body;
  }
  function field(label, control, help) { return el('label', { class: 'field' }, [el('span', { text: label }), control, help ? el('p', { class: 'help', text: help }) : null]); }
  async function withBusy(node, work) {
    node.disabled = true;
    try { return await work(); } catch (error) { notify(error.message, true); }
    finally { node.disabled = false; }
  }

  async function settings() {
    const body = openModal('Configurar Composio', 'Use o projeto Composio que você quer disponibilizar neste PC.');
    try {
      const status = await call('composio:status');
      if (!body.isConnected) return;
      body.append(el('p', { class: 'help', text: status.configured ? 'Chave disponível · ' + status.source : 'Nenhuma chave local encontrada.' }));
      const key = el('input', { type: 'password', autocomplete: 'new-password', placeholder: status.configured ? 'Deixe em branco para manter a chave atual' : 'Sua chave de projeto Composio', 'aria-label': 'Chave de API' });
      const userId = el('input', { value: status.userId, 'aria-label': 'ID de usuário Composio' });
      body.append(field('Chave de API', key, 'Uma nova chave é protegida pelo Windows. O painel nunca exibe a chave salva.'), field('ID de usuário Composio', userId, 'As conexões são filtradas por esta identidade. Para usar conexões existentes, informe o mesmo ID utilizado no seu projeto.'));
      const save = button('Salvar configuração', () => withBusy(save, async () => {
        await call('composio:configure', { ...context, userId: userId.value.trim(), apiKey: key.value.trim() });
        catalogue = createCatalogueClient(input => call('composio:catalogue', input));
        key.value = '';
        modal.close();
        notify('Configuração salva.');
        if (page === 'marketplace') await Promise.all([loadCatalogue(), loadConnections()]);
      }), 'button primary');
      body.append(el('div', { class: 'modal-actions' }, [button('Abrir painel Composio', () => call('composio:dashboard').catch(error => notify(error.message, true))), save]));
    } catch (error) { body.append(el('p', { class: 'error', text: error.message })); }
  }

  async function aiDialog(toolkit) {
    const body = openModal(toolkit ? `Usar ${toolkit.name} com IA` : 'Editar com IA', 'Descreva o pedido. Ao enviar, uma tarefa será criada e atribuída ao agente local escolhido.');
    const request = el('textarea', { 'aria-label': 'Pedido para a IA', placeholder: toolkit ? `O que você quer fazer com ${toolkit.name}?` : 'Ex.: adicione um filtro por conta ativa no Pool e atualize a documentação.' });
    const select = el('select', { 'aria-label': 'Agente local' }, [el('option', { value: '', text: 'Carregando agentes deste PC…' })]);
    body.append(field('Agente que vai executar', select), field('Seu pedido', request));
    body.append(el('p', { class: 'help', text: currentDoc ? `O documento “${currentDoc.title}” e as instruções de manutenção acompanham a solicitação. Salve antes de enviar para incluir suas últimas alterações.` : 'O pedido inclui a documentação de manutenção e os caminhos do módulo neste Windows.' }));
    const send = button('Criar tarefa para IA', () => withBusy(send, async () => {
      if (dirty) throw new Error('Salve o documento antes de pedir uma alteração à IA.');
      const result = await call('ai:request', { ...context, agentId: select.value, instruction: request.value.trim(), ...(currentDoc ? { docId: currentDoc.id } : {}), ...(toolkit ? { toolkit: toolkit.slug } : {}) });
      modal.close();
      notify(`Tarefa ${result.identifier || result.id} criada para a IA.`);
      navigate('issue', { issueId: result.id });
    }), 'button primary');
    send.disabled = true;
    body.append(el('div', { class: 'modal-actions' }, [button('Cancelar', () => modal.close()), send]));
    try {
      const agents = await call('ai:agents', context);
      if (!body.isConnected) return;
      select.replaceChildren(...agents.map(agent => el('option', { value: agent.id, text: agent.name })));
      if (!agents.length) select.append(el('option', { value: '', text: 'Nenhum agente local disponível neste workspace' }));
      send.disabled = !agents.length;
      request.focus();
    } catch (error) { body.append(el('p', { class: 'error', text: error.message })); }
  }

  function logo(app) {
    const fallback = el('span', { class: 'logo-fallback', text: app.name.slice(0, 1).toUpperCase(), 'aria-hidden': 'true' });
    if (!app.logo) return fallback;
    const image = el('img', { class: 'logo', src: app.logo, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    image.addEventListener('error', () => image.replaceWith(fallback), { once: true });
    return image;
  }
  async function connect(app, node) {
    await withBusy(node, async () => {
      const response = await call('composio:connect', { slug: app.slug });
      if (response.manual) {
        const body = openModal('Configuração necessária', response.message);
        body.append(el('div', { class: 'modal-actions' }, [button('Abrir painel Composio', () => call('composio:dashboard'), 'button primary')]));
      } else notify(response.message);
    });
  }
  function card(app) {
    const active = market.connections.filter(x => x.toolkit === app.slug && x.status === 'ACTIVE').length;
    const action = button(app.noAuth ? 'Usar com IA' : app.setup === 'panel' ? 'Configurar no painel' : active ? 'Conectar outra' : 'Conectar', () => app.noAuth ? aiDialog(app) : connect(app, action), 'button' + (!active && !app.noAuth ? ' primary' : ''));
    return el('article', { class: 'app-card', 'data-toolkit': app.slug }, [
      el('div', { class: 'card-head' }, [logo(app), el('div', {}, [el('h2', { text: app.name }), el('small', { text: app.slug })]), active ? el('span', { class: 'connected', text: `${active} conectada${active > 1 ? 's' : ''}` }) : null]),
      el('p', { text: app.description || 'Integração disponível no catálogo do Composio.' }),
      el('div', { class: 'card-tags' }, [el('span', { class: 'tag setup-tag' + (app.setup === 'panel' ? ' panel-tag' : ''), text: app.noAuth ? 'Sem autenticação' : app.setup === 'panel' ? 'Configuração no painel' : 'Conexão pelo marketplace' }), ...app.categories.slice(0, 2).map(category => el('span', { class: 'tag', text: category.name }))]),
      el('div', { class: 'card-footer' }, [el('small', { text: `${app.toolsCount.toLocaleString('pt-BR')} ferramentas` }), el('div', { class: 'card-actions' }, [button('Explorar', () => detail(app)), action])]),
    ]);
  }
  function renderCards() {
    const grid = document.getElementById('app-grid');
    if (!grid) return;
    grid.replaceChildren(...market.items.map(card));
    if (!market.items.length) grid.append(el('div', { class: 'empty', text: 'Nenhuma integração encontrada com estes filtros. Altere a configuração, o nome ou a categoria.' }));
    document.getElementById('catalogue-count').textContent = `${market.total.toLocaleString('pt-BR')}${market.totalIsEstimate ? '+' : ''} integrações${market.totalIsEstimate ? ' encontradas' : ''}`;
    document.getElementById('visible-count').textContent = `${market.items.length} integrações exibidas`;
    document.getElementById('more-apps').hidden = !market.nextCursor;
  }
  async function loadCatalogue(more = false) {
    const sequence = ++catalogueSequence;
    cataloguePhase = 'loading';
    const grid = document.getElementById('app-grid');
    if (!grid) return;
    if (!more) {
      market = { ...market, items: [], nextCursor: null, total: 0 };
      grid.replaceChildren(...Array.from({ length: 6 }, () => el('div', { class: 'skeleton', 'aria-hidden': 'true' })));
    }
    const load = document.getElementById('more-apps');
    load.disabled = true;
    document.getElementById('catalogue-live').textContent = 'Consultando catálogo…';
    try {
      const data = await catalogue({ search: market.search, category: market.category, setup: market.setup, ...(more ? { cursor: market.nextCursor } : {}) });
      if (sequence !== catalogueSequence) return;
      market = { ...market, items: more ? [...market.items, ...data.items.filter(x => !market.items.some(old => old.slug === x.slug))] : data.items, nextCursor: data.nextCursor, total: data.total, totalIsEstimate: Boolean(data.totalIsEstimate) };
      cataloguePhase = 'ready';
      renderCards();
      document.getElementById('catalogue-live').textContent = 'Catálogo Composio atualizado';
    } catch (error) {
      if (sequence !== catalogueSequence) return;
      cataloguePhase = 'error';
      grid.replaceChildren(el('div', { class: 'error' }, [el('p', { text: error.message }), button('Tentar novamente', () => loadCatalogue()), button('Configurar', settings)]));
      document.getElementById('catalogue-live').textContent = 'Não foi possível carregar o catálogo';
    } finally { if (sequence === catalogueSequence) { load.disabled = false; content.setAttribute('aria-busy', 'false'); } }
  }
  async function loadConnections(more = false) {
    const target = document.getElementById('connection-list');
    try {
      const data = await call('composio:connections', more ? { cursor: market.connectionsCursor } : {});
      market.connections = more ? [...market.connections, ...data.items] : data.items;
      market.connectionsCursor = data.nextCursor;
      target.replaceChildren(...market.connections.map(item => el('div', { class: 'connection-item' }, [el('b', { text: item.name }), el('span', { text: item.status === 'ACTIVE' ? 'Conectada' : item.status === 'EXPIRED' ? 'Expirada' : item.status })])));
      if (!market.connections.length) target.append(el('p', { class: 'help', text: 'Nenhuma conexão para a identidade configurada. Conecte um app ou ajuste o ID de usuário em Configurar Composio.' }));
      if (data.nextCursor) target.append(button('Carregar mais conexões', () => loadConnections(true)));
      document.getElementById('connections-title').textContent = `Minhas conexões · ${market.connections.length}${data.nextCursor ? '+' : ''}`;
      if (cataloguePhase === 'ready') renderCards();
    } catch (error) { target.replaceChildren(el('p', { class: 'help', text: error.message })); }
  }
  async function loadAgentAccess(){
    const target=document.getElementById('agent-access');
    if(!target)return;
    try{
      const status=await call('composio:agents-status',context);
      const info=el('div',{},[
        el('strong',{text:status.enabled?'Composio nos agentes':'Disponibilizar o marketplace para as IAs'}),
        el('p',{class:'help',text:status.enabled?`${status.assigned}/${status.total} agentes atribuídos · ${status.nativeConfigured} com runtime compatível · ${status.pending.length} exceções`:`${status.total} agentes seus neste workspace · ${status.nativeCapable||0} com runtime compatível. Ativar compartilha as conexões deste usuário Composio e define prioridade de descoberta pelo marketplace.`}),
        el('p',{class:'help',text:status.automatic?'Sincronização a cada minuto pelo Windows, com este PC ligado; os agentes já configurados acessam o Composio diretamente, inclusive em outros computadores.':status.enabled?'Atribuições feitas. A sincronização automática ainda não foi confirmada.':'Esta ativação precisa da sessão do proprietário do desktop. Não substitui servidores MCP ou instruções individuais.'}),
      ]);
      const action=button(status.enabled?'Verificar atribuições':'Ativar nos meus agentes',()=>withBusy(action,async()=>{
        const label=action.textContent;action.textContent='Configurando agentes…';
        const poll=setInterval(()=>call('composio:agents-status',context).then(current=>{action.textContent=`Configurando ${current.assigned||0}/${current.total||status.total}…`;}).catch(()=>{}),2500);
        try{
          const result=await call(status.enabled?'composio:agents-sync':'composio:agents-enable',{...context,confirmAllAgents:true});
          notify(result.automaticError||`${result.assigned} atribuições verificadas; ${result.pending.length} exceções de runtime.`,Boolean(result.automaticError));
          await loadAgentAccess();
        }finally{clearInterval(poll);action.textContent=label;}
      }),'button primary');
      target.replaceChildren(el('div',{class:'agent-access-head'},[info,action]));
      if(status.pending.length||status.lastError||status.errors?.length){
        const detail=el('details',{},[el('summary',{text:`Exceções e pendências (${status.pending.length+(status.errors?.length||0)})`})]);
        if(status.lastError)detail.append(el('p',{class:'error',text:status.lastError}));
        detail.append(el('ul',{class:'help'},[...status.pending,...(status.errors||[])].map(item=>el('li',{text:`${item.name} · ${item.provider||''}: ${item.reason||item.error}`}))));
        target.append(detail);
      }
    }catch(error){target.replaceChildren(el('p',{class:'help',text:error.message}),button('Tentar verificar agentes',loadAgentAccess));}
  }
  async function detail(app) {
    const body = openModal(app.name, 'Ferramentas disponíveis nesta integração.');
    const loading = el('p', { class: 'modal-state', text: 'Consultando ferramentas no Composio…' });
    body.append(loading);
    try {
      const data = await call('composio:detail', { slug: app.slug });
      if (!body.isConnected) return;
      loading.remove();
      body.append(el('p', { class: 'detail-description', text: data.description }), el('p', { class: 'help', text: `${data.toolsCount} ferramentas · ${data.triggersCount} gatilhos · ${data.noAuth ? 'Sem autenticação' : data.authSchemes.join(', ')}` }));
      body.append(el('ul', { class: 'tool-list' }, data.tools.map(tool => el('li', {}, [el('b', { text: tool.name }), el('p', { text: tool.description }), el('code', { text: tool.slug })]))));
      if (data.moreTools) body.append(el('p', { class: 'help', text: 'Exibindo as primeiras 15 ferramentas. A IA pode descobrir outras conforme a tarefa.' }));
      const connectButton = button(data.setup === 'panel' ? 'Configurar no painel' : 'Conectar conta', () => connect(data, connectButton), 'button primary');
      body.append(el('div', { class: 'modal-actions' }, [button('Pedir tarefa à IA', () => aiDialog(data)), !data.noAuth ? connectButton : null]));
    } catch (error) { loading.replaceWith(el('p', { class: 'error', text: error.message })); }
  }
  async function marketplace() {
    document.getElementById('breadcrumb').textContent = 'Marketplace / Composio';
    const search = el('input', { class: 'search', type: 'search', placeholder: 'Buscar apps, ferramentas ou serviços…', 'aria-label': 'Buscar integrações' });
    const setup = el('select', { id: 'setup-filter', 'aria-label': 'Configuração das integrações' }, [
      el('option', { value: 'direct', text: 'Sem painel Composio', selected: true }),
      el('option', { value: 'all', text: 'Todas as integrações' }),
      el('option', { value: 'panel', text: 'Exigem configuração no painel' }),
    ]);
    setup.addEventListener('change', () => { market.setup = setup.value; loadCatalogue(); });
    const setupFilter = el('div', { class: 'setup-filters' }, [el('label', { for: 'setup-filter', text: 'Como conectar' }), setup, el('p', { class: 'help', text: 'Por padrão, apps sem autenticação ou com OAuth gerenciado. O login da conta pode abrir no navegador.' })]);
    let debounce;
    search.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(() => { market.search = search.value.trim(); loadCatalogue(); }, 280); });
    const chips = el('div', { class: 'chips', 'aria-label': 'Categorias' });
    const all = button('Todas as categorias', () => chooseCategory('', all), 'chip active');
    chips.append(all);
    function chooseCategory(id, node) { market.category = id; chips.querySelectorAll('.chip').forEach(x => x.classList.remove('active')); node.classList.add('active'); loadCatalogue(); }
    const more = button('Carregar mais integrações', () => loadCatalogue(true));
    more.id = 'more-apps'; more.hidden = true;
    const connectionsList = el('div', { class: 'connection-list', id: 'connection-list' });
    content.replaceChildren(
      el('section', { class: 'hero' }, [el('div', { class: 'eyebrow', text: 'FERRAMENTAS PARA OS SEUS AGENTES' }), el('div', { class: 'hero-row' }, [el('div', {}, [el('h1', { text: 'Conecte seu próximo superpoder.' }), el('p', { text: 'Descubra integrações, conecte suas contas e leve mais ferramentas para o trabalho com IA.' })]), el('div', { class: 'catalogue-state' }, [el('span', { class: 'dot' }), el('span', { id: 'catalogue-live', text: 'Consultando catálogo…' })])]), el('div', { class: 'search-row' }, [el('div', { class: 'search-wrap' }, [el('span', { text: '⌕', 'aria-hidden': 'true' }), search]), button('Atualizar conexões', () => loadConnections())]), setupFilter, chips]),
      el('section', { class: 'catalogue-body' }, [el('section',{class:'connections',id:'agent-access','aria-label':'Acesso dos agentes'},[el('p',{class:'help',text:'Verificando acesso dos agentes…'})]),el('details', { class: 'connections' }, [el('summary', { id: 'connections-title', text: 'Minhas conexões' }), connectionsList]), el('div', { class: 'catalogue-toolbar' }, [el('strong', { id: 'catalogue-count', text: 'Integrações' }), el('span', { id: 'visible-count', text: 'Carregando…' })]), el('div', { class: 'grid', id: 'app-grid' }), el('div', { class: 'load-more' }, [more]), el('div', { class: 'footer-note', text: 'Catálogo oficial Composio · A autorização das contas é concluída no seu navegador.' })]),
    );
    call('composio:categories').then(categories => categories.slice(0, 12).forEach(category => { const chip = button(category.name, () => chooseCategory(category.id, chip), 'chip'); chips.append(chip); })).catch(() => {});
    await Promise.all([loadCatalogue(), loadConnections(),loadAgentAccess()]);
  }

  function inline(text) {
    const fragment = document.createDocumentFragment();
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https:\/\/[^\s)]+\))/g);
    for (const part of parts) {
      if (part.startsWith('`') && part.endsWith('`')) fragment.append(el('code', { text: part.slice(1, -1) }));
      else if (part.startsWith('**') && part.endsWith('**')) fragment.append(el('strong', { text: part.slice(2, -2) }));
      else if (/^\[.*\]\(https:\/\//.test(part)) { const match = part.match(/^\[(.*?)\]\((.*?)\)$/); fragment.append(el('a', { href: match[2], target: '_blank', rel: 'noopener noreferrer', text: match[1] })); }
      else fragment.append(document.createTextNode(part));
    }
    return fragment;
  }
  function markdown(text) {
    const article = el('article', { class: 'prose' });
    let code = null;
    let list = null;
    for (const line of text.split('\n')) {
      if (line.startsWith('```')) { if (code) { article.append(el('pre', {}, [el('code', { text: code.join('\n') })])); code = null; } else code = []; list = null; continue; }
      if (code) { code.push(line); continue; }
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      const bullet = line.match(/^\s*[-*]\s+(.+)$/);
      if (heading) { article.append(el('h' + heading[1].length, {}, [inline(heading[2])])); list = null; }
      else if (bullet) { if (!list) { list = el('ul'); article.append(list); } list.append(el('li', {}, [inline(bullet[1])])); }
      else if (line.trim()) { article.append(el('p', {}, [inline(line)])); list = null; }
      else list = null;
    }
    if (code) article.append(el('pre', {}, [el('code', { text: code.join('\n') })]));
    return article;
  }
  async function newDoc() {
    const body = openModal('Novo documento', 'Crie uma página local que você e a IA poderão manter.');
    const title = el('input', { placeholder: 'Ex.: Padrões de interface', 'aria-label': 'Título do documento' });
    body.append(field('Título', title));
    const create = button('Criar documento', () => withBusy(create, async () => {
      const name = title.value.trim();
      const id = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) + '.md';
      if (!name || id === '.md') throw new Error('Informe um título válido.');
      await call('docs:save', { id, content: `# ${name}\n\nEscreva a documentação aqui.\n`, revision: null });
      modal.close();
      await docs(id);
      editing = true;
      renderDoc();
    }), 'button primary');
    body.append(el('div', { class: 'modal-actions' }, [create]));
    title.focus();
  }
  async function history() {
    const doc = currentDoc;
    const body = openModal('Histórico do documento', 'Restaurar carrega a versão no editor. Salve para confirmar a restauração.');
    try {
      const versions = await call('docs:history', { id: doc.id });
      if (!body.isConnected) return;
      if (!versions.length) body.append(el('p', { class: 'help', text: 'As versões anteriores aparecerão depois da primeira alteração salva.' }));
      for (const version of versions) body.append(el('div', { class: 'history-row' }, [el('span', { text: new Date(version.date).toLocaleString('pt-BR') }), button('Restaurar no editor', () => { if (dirty && !confirm('Substituir o rascunho atual?')) return; modal.close(); editing = true; renderDoc(version.content); dirty = true; })]));
    } catch (error) { body.append(el('p', { class: 'error', text: error.message })); }
  }
  function renderDoc(draft) {
    const target = document.getElementById('doc-main');
    const save = button('Salvar alterações', () => withBusy(save, async () => {
      currentDoc = await call('docs:save', { id: currentDoc.id, content: document.getElementById('doc-editor').value, revision: currentDoc.revision });
      editing = false; dirty = false; renderDoc(); notify('Documento salvo com histórico.');
    }), 'button primary');
    const toolbar = el('div', { class: 'doc-toolbar' }, [el('div', {}, [el('h1', { text: currentDoc.title }), el('div', { class: 'doc-meta', text: 'DOCUMENTAÇÃO LOCAL · ' + new Date(currentDoc.updatedAt).toLocaleString('pt-BR') })]), el('div', { class: 'doc-buttons' }, [button('Histórico', history), button(editing ? 'Cancelar edição' : 'Editar documento', () => { if (dirty && !confirm('Descartar alterações não salvas?')) return; editing = !editing; dirty = false; renderDoc(); }), editing ? save : button('✧ Editar com IA', () => aiDialog(), 'button primary')])]);
    const editor = el('textarea', { id: 'doc-editor', class: 'editor', spellcheck: 'false', 'aria-label': 'Conteúdo Markdown', oninput: () => { dirty = true; } });
    editor.value = draft === undefined ? currentDoc.content : draft;
    target.replaceChildren(toolbar, editing ? editor : markdown(currentDoc.content), editing ? el('p', { class: 'editor-hint', text: 'Markdown · Até 256 KB · Cada alteração salva preserva a versão anterior.' }) : null);
  }
  async function docs(selectedId) {
    if (dirty && !confirm('Há alterações sem salvar. Deseja abrir outro documento?')) return;
    dirty = false; editing = false;
    document.getElementById('breadcrumb').textContent = 'Docs / Recursos locais';
    document.getElementById('settings-open').hidden = true;
    const list = await call('docs:list');
    const id = selectedId || query.get('doc') || list[0]?.id;
    if (!id) { content.replaceChildren(el('div', { class: 'empty' }, ['Nenhuma documentação criada.', button('Criar documento', newDoc)])); return; }
    currentDoc = await call('docs:read', { id });
    const navigation = el('aside', { class: 'docs-nav' }, [el('h2', { text: 'BASE DE CONHECIMENTO' }), ...list.map(doc => button(doc.title, () => docs(doc.id).catch(error => notify(error.message, true)), 'doc-link' + (doc.id === id ? ' active' : ''))), button('+ Novo documento', newDoc, 'button ghost full'), button('Abrir pasta', () => call('docs:folder'), 'button ghost full')]);
    content.replaceChildren(el('div', { class: 'docs-shell' }, [navigation, el('section', { class: 'docs-main', id: 'doc-main' })]));
    content.setAttribute('aria-busy', 'false');
    renderDoc();
  }
  document.getElementById('nav-docs').addEventListener('click', () => navigate('docs'));
  document.getElementById('ai-open').addEventListener('click', () => aiDialog());
  document.getElementById('settings-open').addEventListener('click', settings);
  const begin = page === 'studio' ? window.mountStudio({el,button,call,notify,content,context,navigate}) : page === 'docs' ? docs().then(() => { if (query.get('ai') === '1') return aiDialog(); }) : marketplace();
  begin.catch(error => { content.replaceChildren(el('div', { class: 'error', text: error.message })); content.setAttribute('aria-busy', 'false'); });
})();
