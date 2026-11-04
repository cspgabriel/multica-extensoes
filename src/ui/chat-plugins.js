// Included in the verified desktop renderer by lib/chat-patch.cjs.
// Native hooks keep the current user's authorization and query cache semantics.
var desktopPluginIntent = null;
function DesktopChatPlugins({ onUse, disabled, draftKey }) {
  const R = import_react;
  const h = R.createElement;
  const wsId = useWorkspaceId();
  const wsPaths = useWorkspacePaths();
  const { push } = useNavigation$1();
  const user = useAuthStore(s => s.user);
  const selectedAgentId = useChatStore(s => s.selectedAgentId);
  const sessionId = useChatStore(s => s.activeSessionId);
  const { role } = useCurrentMember(wsId);
  const agents = useQuery(agentListOptions(wsId)).data || [];
  const sessions = useQuery(chatSessionsOptions(wsId)).data || [];
  const session = sessions.find(item => item.id === sessionId);
  const agent = agents.find(item => item.id === (sessionId ? session?.agent_id : selectedAgentId)) || (!sessionId ? agents.find(item => !item.archived_at && canAssignAgent(item, user?.id, role)) : null);
  const canManage = role === 'owner' || role === 'admin';
  const ownsAgent = Boolean(agent && agent.owner_id === user?.id);
  const [open, setOpen] = R.useState(false);
  const [search, setSearch] = R.useState('');
  const [actionError, setActionError] = R.useState('');
  const dialog = R.useRef(null);
  const titleId = R.useId();
  const busyRef = R.useRef(false);
  const [busy, setBusy] = R.useState(false);
  const invoke = async (channel, input = {}) => {
    const response = await window.electron.ipcRenderer.invoke('desktop-modules:' + channel, input);
    if (!response.ok) throw new Error(response.error);
    return response.data;
  };
  const native = useQuery({ ...pluginInstallationsOptions(wsId), enabled: open && Boolean(wsId) });
  const library = useQuery({ ...workspaceMcpServersOptions(wsId), enabled: open && Boolean(wsId) });
  const assignments = useQuery({ ...agentMcpServersOptions(agent?.id || ''), enabled: open && ownsAgent });
  const runtimes = useQuery({ ...runtimeListOptions(wsId), enabled: open && Boolean(wsId) });
  const connections = useQuery({ queryKey: ['desktop-plugins', wsId, 'connections'], queryFn: () => invoke('composio:connections'), enabled: open, retry: false });
  const access = useQuery({ queryKey: ['desktop-plugins', wsId, 'access'], queryFn: () => invoke('composio:agents-status', { workspaceId: wsId }), enabled: open, retry: false });
  const enablePlugin = useSetPluginEnabled(wsId);
  const addServer = useAddAgentMcpServer(agent?.id || '');
  const enableServer = useSetAgentMcpServerEnabled(agent?.id || '');
  const runtime = (runtimes.data || []).find(item => item.id === agent?.runtime_id);
  const supportsMcp = Boolean(agent?.runtime_id && providerSupportsMcpConfig(runtime?.provider));
  const servers = DesktopPluginModel.servers(library.data || [], assignments.data || []);
  const composioServer = servers.find(item => item.name === access.data?.serverName);
  const composioReady = ownsAgent && supportsMcp && !assignments.isError && !library.isError && !access.isError && composioServer?.assigned && composioServer.enabled;
  R.useEffect(() => {
    if (DesktopPluginModel.matchesIntent(desktopPluginIntent, wsId, agent?.id, draftKey) && !disabled) {
      const intent = desktopPluginIntent;
      if (onUse(intent.prompt) !== false) desktopPluginIntent = null;
    }
  }, [wsId, agent?.id, draftKey, disabled, onUse]);
  R.useEffect(() => { setOpen(false); setSearch(''); setActionError(''); }, [wsId, user?.id, agent?.id, draftKey]);
  R.useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);
  const act = async work => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setActionError('');
    try { await work(); } catch (error) { setActionError(error.message || 'Não foi possível concluir a operação.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const usePrompt = prompt => { if (!disabled && onUse(prompt) !== false) setOpen(false); };
  const matches = item => `${item.name || ''} ${item.toolkit || ''} ${item.plugin_key || ''}`.toLowerCase().includes(search.toLowerCase());
  const btn = (label, onClick, unavailable = false) => h(Button$1, { key: label, type: 'button', variant: 'outline', size: 'sm', disabled: unavailable || busy, onClick }, label);
  const row = (key, name, status, children) => h('article', { key, className: 'rounded-lg border border-border p-4 space-y-2' },
    h('div', { className: 'flex flex-wrap items-center justify-between gap-2' }, h('strong', null, name), h('span', { className: 'text-caption text-muted-foreground' }, status)),
    h('div', { className: 'flex flex-wrap items-center gap-2' }, children));
  const state = (query, empty, count) => query.isError ? h('div', { role: 'alert', className: 'text-caption text-destructive' }, query.error?.message || 'Não foi possível carregar.', ' ', btn('Tentar novamente', () => query.refetch())) : query.isPending || query.isLoading ? h('p', { role: 'status' }, 'Carregando…') : !count ? h('p', { className: 'text-caption text-muted-foreground' }, empty) : null;
  const nativeItems = (native.data?.plugins || []).filter(matches);
  const connectionItems = (connections.data?.items || []).filter(matches);
  const serverItems = servers.filter(matches);
  const go = path => { setOpen(false); push(path); };
  const assign = server => act(async () => {
    if (server.assigned) await enableServer.mutateAsync({ serverId: server.id, enabled: true });
    else await addServer.mutateAsync(server.id);
    toast$6.success('Acesso ativado para as próximas execuções deste agente.');
  });
  return h('div', { className: 'px-3 pt-2' },
    btn('Plugins', () => setOpen(true)),
    h('dialog', { ref: dialog, 'aria-labelledby': titleId, onCancel: () => setOpen(false), onClose: () => setOpen(false), className: 'bg-background text-foreground border border-border rounded-xl p-0', style: { width: 'min(880px, calc(100vw - 32px))', maxHeight: '85vh', margin: 'auto', overflowY: 'auto' } },
      h('div', { className: 'p-4 space-y-4' },
        h('header', { className: 'flex items-center justify-between gap-3' }, h('h2', { id: titleId, className: 'text-body font-semibold' }, 'Plugins da conversa'), btn('Fechar', () => setOpen(false))),
        h('p', { className: 'text-caption text-muted-foreground' }, `Agente: ${agent?.name || 'Selecione um agente'}. Usar adiciona o pedido ao rascunho para você revisar e enviar.`),
        h('p', { className: 'text-caption text-muted-foreground' }, 'Ativar um servidor vale para as próximas execuções do agente. Plugins nativos são habilitados no workspace.'),
        h('input', { type: 'search', 'aria-label': 'Buscar plugins da conversa', placeholder: 'Buscar plugins, integrações ou servidores…', value: search, onChange: event => setSearch(event.target.value), className: 'w-full rounded-md border border-border bg-background px-3 py-2' }),
        actionError ? h('p', { role: 'alert', className: 'text-caption text-destructive' }, actionError) : null,
        h('section', { className: 'space-y-3', 'aria-label': 'Plugins Multica' },
          h('h3', { className: 'font-semibold' }, 'Plugins Multica'),
          state(native, search ? 'Nenhum plugin corresponde à busca.' : 'Nenhum plugin instalado neste workspace.', nativeItems.length),
          !native.isError && nativeItems.map(item => row(item.id, item.name || item.plugin_key, item.enabled ? 'Habilitado no workspace' : 'Desativado', [
            item.enabled ? btn('Usar na conversa', () => usePrompt(DesktopPluginModel.nativePrompt(item)), disabled || !agent) : btn('Ativar no workspace', () => act(() => enablePlugin.mutateAsync({ installationId: item.id, enabled: true })), !canManage),
            btn('Configurar plugin', () => go(wsPaths.settings() + '?tab=plugins'))
          ]))),
        h('section', { className: 'space-y-3', 'aria-label': 'Integrações Composio' },
          h('h3', { className: 'font-semibold' }, 'Integrações Composio'),
          state(connections, search ? 'Nenhuma conexão corresponde à busca.' : 'Nenhuma conexão cadastrada para o usuário Composio desta instalação.', connectionItems.length),
          state(access, '', 1),
          !connections.isError && connectionItems.map(item => row(item.id, item.name || item.toolkit, `${({ ACTIVE: 'Conectada no Composio', EXPIRED: 'Expirada', REVOKED: 'Revogada' })[item.status] || item.status} · ${item.id}`, [
            btn('Usar na conversa', () => usePrompt(DesktopPluginModel.composioPrompt(item)), disabled || !agent || item.status !== 'ACTIVE' || !composioReady),
            !composioReady && composioServer ? btn('Ativar neste agente', () => assign(composioServer), !ownsAgent || !supportsMcp || assignments.isError || library.isError) : null
          ])),
          !composioReady ? h('p', { className: 'text-caption text-muted-foreground' }, !ownsAgent ? 'O proprietário do agente precisa disponibilizar o acesso às conexões desta instalação.' : !supportsMcp ? 'O runtime deste agente ainda não confirmou suporte a estas integrações.' : 'Configure o acesso ao marketplace ou ative o servidor Composio neste agente.') : null,
          connections.data?.nextCursor ? btn('Ver todas as conexões no marketplace', () => go(wsPaths.marketplace())) : null,
          btn('Abrir marketplace', () => go(wsPaths.marketplace()))),
        h('section', { className: 'space-y-3', 'aria-label': 'Servidores do Multica' },
          h('h3', { className: 'font-semibold' }, 'Servidores do Multica'),
          state(library, search ? 'Nenhum servidor corresponde à busca.' : 'Nenhum servidor cadastrado na biblioteca do workspace.', serverItems.length),
          ownsAgent ? state(assignments, '', 1) : h('p', { className: 'text-caption text-muted-foreground' }, 'Somente o proprietário pode alterar os servidores deste agente.'),
          !library.isError && !assignments.isError && serverItems.map(item => row(item.id, item.name, item.assigned && item.enabled ? 'Ativo no agente' : 'Disponível no workspace', [
            item.assigned && item.enabled ? btn('Usar na conversa', () => usePrompt(`Quero usar o servidor ${item.name} nesta conversa. Descubra as ferramentas disponíveis. Meu pedido: `), disabled || !supportsMcp) : btn('Ativar neste agente', () => assign(item), !ownsAgent || !supportsMcp)
          ])),
          runtimes.isError ? state(runtimes, '', 1) : null,
          !supportsMcp && agent ? h('p', { className: 'text-caption text-muted-foreground' }, 'Ativação indisponível: o runtime está ausente ou não confirmou suporte a MCP.') : null)
      )));
}
