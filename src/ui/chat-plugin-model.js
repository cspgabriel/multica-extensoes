'use strict';
var DesktopPluginModel = (() => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const slug = /^[a-z0-9][a-z0-9_-]{0,100}$/;
  const account = /^[a-zA-Z0-9_-]{1,100}$/;
  function composioPrompt(item) {
    if (!slug.test(item.toolkit || '')) throw new Error('Integração inválida.');
    if (item.id && !account.test(item.id)) throw new Error('Conta inválida.');
    return `Quero usar a integração Composio ${item.toolkit}${item.id ? ` com a conta ${item.id}` : ''} nesta conversa. Descubra as ferramentas e confirme o acesso do agente antes de executar. Meu pedido: `;
  }
  function nativePrompt(item) {
    const name = String(item.name || item.plugin_key || '').replace(/[\r\n]/g, ' ').slice(0, 120);
    return `Quero usar o plugin Multica ${name} nesta conversa. Verifique quais ferramentas estão habilitadas e aprovadas para este agente. Meu pedido: `;
  }
  function chatIntent(message, workspaceId, now = Date.now()) {
    if (!uuid.test(workspaceId || '') || !uuid.test(message.agentId || '')) throw new Error('Agente ou workspace inválido.');
    return { workspaceId, agentId: message.agentId, prompt: composioPrompt({ toolkit: message.toolkit, id: message.connectionId }), expires: now + 10 * 60 * 1000 };
  }
  function matchesIntent(intent, workspaceId, agentId, draftKey, now = Date.now()) {
    return Boolean(intent && intent.expires > now && intent.workspaceId === workspaceId && intent.agentId === agentId && draftKey === '__new__');
  }
  function appendDraft(current, prompt) { return current.trim() ? current.trimEnd() + '\n\n' + prompt : prompt; }
  function servers(library, assigned) {
    const all = new Map(library.map(item => [item.id, { ...item, assigned: false, enabled: false }]));
    for (const item of assigned) all.set(item.id, { ...all.get(item.id), ...item, assigned: true, enabled: item.enabled !== false });
    return [...all.values()];
  }
  return { composioPrompt, nativePrompt, chatIntent, matchesIntent, appendDraft, servers };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = DesktopPluginModel;
