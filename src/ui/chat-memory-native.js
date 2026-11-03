// Injected into the supported desktop renderer. Uses the human's existing authenticated client.
function MulticaMemoryWorkspaceLayout() {
  const R = import_react, h = R.createElement;
  const { workspaceSlug } = useParams();
  const user = useAuthStore(s => s.user);
  const { data: workspace } = useQuery({ ...workspaceBySlugOptions(workspaceSlug || ''), enabled: Boolean(user && workspaceSlug) });
  return h(R.Fragment, null, h(WorkspaceRouteLayout), user && workspace ? h(MulticaMemoryPanel, { key: user.id + ':' + workspace.id, user, workspace }) : null);
}
function MulticaMemoryPanel({ user, workspace }) {
  const R = import_react, h = R.createElement;
  const [open, setOpen] = R.useState(false), [status, setStatus] = R.useState(null);
  const [error, setError] = R.useState(''), [busy, setBusy] = R.useState(false), [progress, setProgress] = R.useState('');
  const live = R.useRef(false), running = R.useRef(false), enabled = R.useRef(false), dialog = R.useRef(null);
  const scope = { ownerId: user.id, workspaceId: workspace.id };
  const invoke = async (method, input = scope) => {
    const result = await window.electron.ipcRenderer.invoke('multica-memory:' + method, input);
    if (!result.ok) throw Error(result.error);
    return result.data;
  };
  const current = () => live.current && enabled.current && useAuthStore.getState().user?.id === user.id;
  async function sync() {
    if (running.current || !current()) return;
    running.current = true; setBusy(true); setError('');
    try {
      const result = await MulticaMemorySync.sync({ ...scope, invoke, active: current,
        source: {
          sessions: () => api.fetch('/api/chat/sessions?status=all', { headers: workspaceHeader(workspace.slug) }),
          messages: (id, before) => {
            const query = new URLSearchParams({ limit: '100' });
            if (before) { query.set('before_id', before.id); query.set('before_created_at', before.created_at); }
            return api.fetch('/api/chat/sessions/' + id + '/messages/page?' + query, { headers: workspaceHeader(workspace.slug) });
          }
        },
        progress: value => { if (live.current) setProgress(value.completed + ' de ' + value.total + ' conversas'); }
      });
      if (live.current) { setStatus(result); setProgress('Sincronização completa.'); }
    } catch (failure) { if (live.current) { setError(failure.message); setStatus(await invoke('status').catch(() => null)); } }
    finally { running.current = false; if (live.current) setBusy(false); }
  }
  R.useEffect(() => {
    live.current = true;
    invoke('status').then(value => { if (live.current) { setStatus(value); enabled.current = value.enabled; if (value.enabled) sync(); } }).catch(failure => { if (live.current) setError(failure.message); });
    const timer = setInterval(sync, 5 * 60 * 1000);
    return () => { live.current = false; enabled.current = false; clearInterval(timer); };
  }, [workspace.id, user.id]);
  R.useEffect(() => { if (open && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [open]);
  async function configure(value) {
    try {
      const result = await invoke('configure', { ...scope, enabled: value });
      enabled.current = value; setStatus(result); setError('');
      if (value) await sync();
    } catch (failure) { setError(failure.message); }
  }
  const buttonStyle = { padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border, #555)', background: 'var(--secondary, #252935)', color: 'var(--foreground, #eee)', cursor: 'pointer' };
  const button = (title, onClick, disabled = false) => h('button', { type: 'button', style: buttonStyle, onClick, disabled }, title);
  return h(R.Fragment, null,
    h('button', { type: 'button', onClick: () => setOpen(true), style: { ...buttonStyle, position: 'fixed', right: 24, bottom: 80, zIndex: 45 }, 'aria-label': 'Memória local das conversas' }, 'Memória local'),
    open ? h('dialog', { ref: dialog, onClose: () => setOpen(false), 'aria-labelledby': 'multica-memory-title', style: { width: 'min(620px, 90vw)', padding: 28, borderRadius: 14, border: '1px solid var(--border, #555)', background: 'var(--background, #151820)', color: 'var(--foreground, #eee)' } },
      h('h2', { id: 'multica-memory-title' }, 'Suas conversas em Markdown'),
      h('p', null, 'Exporte seus chats ativos e arquivados deste workspace para uma pasta do PC. Os agentes locais poderão pesquisar os arquivos e recuperar o contexto.'),
      h('p', null, 'A atualização acontece a cada 5 minutos enquanto este workspace estiver aberto no Multica. Anexos ficam como referências; mensagens completas ficam em texto legível no disco.'),
      status ? h('p', null, 'Pasta: ', h('code', { style: { overflowWrap: 'anywhere' } }, status.directory)) : null,
      h('p', { role: 'status', 'aria-live': 'polite' }, busy ? progress || 'Sincronizando…' : status?.lastCompleteSync ? status.count + ' conversas na pasta · Última conclusão: ' + new Date(status.lastCompleteSync).toLocaleString('pt-BR') : 'Ainda não houve uma exportação completa.'),
      error || status?.error ? h('p', { role: 'alert' }, error || status.error) : null,
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 10 } },
        button(status?.enabled ? 'Pausar atualização' : 'Ativar e exportar', () => configure(!status?.enabled), !status),
        button('Sincronizar agora', sync, busy || !status?.enabled),
        button('Abrir pasta', () => invoke('open').catch(failure => setError(failure.message)), !status),
        button('Fechar', () => dialog.current.close())
      ),
      h('p', null, 'Para o agente: leia INDEX.md, confira manifest.json e pesquise na pasta conversas. Pausar mantém as cópias já exportadas. Chats apagados no Multica também permanecem no histórico local, sinalizados no índice.')
    ) : null
  );
}
