'use strict';
var MulticaMemorySync = (() => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  async function sync({ ownerId, workspaceId, source, invoke, active = () => true, progress = () => {} }) {
    const identity = { ownerId, workspaceId };
    const check = () => { if (!active()) throw Error('Sincronização interrompida: conta, workspace ou configuração mudou.'); };
    const call = (method, data = {}) => { check(); return invoke(method, { ...identity, ...data }); };
    let token;
    try {
      check();
      ({ token } = await call('begin'));
      // Fail closed on malformed responses, instead of interpreting schema fallbacks as an empty account.
      const sessions = await source.sessions();
      check();
      if (!Array.isArray(sessions) || sessions.some(s => !uuid.test(s.id || '') || !uuid.test(s.workspace_id || '') || !uuid.test(s.creator_id || ''))) throw Error('A listagem de chats não passou na validação.');
      const own = [...new Map(sessions.filter(s => s.workspace_id === workspaceId && s.creator_id === ownerId).map(s => [s.id, s])).values()];
      let completed = 0;
      for (const session of own) {
        await call('startChat', { token, session });
        let before = null;
        const cursors = new Set();
        let pages = 0;
        do {
          check();
          const page = await source.messages(session.id, before);
          check();
          if (!page || !Array.isArray(page.messages) || typeof page.has_more !== 'boolean') throw Error('Página de mensagens inválida.');
          if (++pages > 100000) throw Error('A paginação excedeu o limite de segurança.');
          await call('page', { token, sessionId: session.id, messages: page.messages });
          if (!page.has_more) break;
          const cursor = page.next_cursor;
          if (!page.messages.length || !cursor || !uuid.test(cursor.id || '') || !Number.isFinite(Date.parse(cursor.created_at))) throw Error('A paginação de mensagens está incompleta.');
          const key = cursor.id + ':' + cursor.created_at;
          if (cursors.has(key)) throw Error('O servidor repetiu o cursor de mensagens.');
          cursors.add(key);
          before = cursor;
        } while (true);
        await call('commitChat', { token, sessionId: session.id });
        progress({ completed: ++completed, total: own.length });
      }
      return await call('finish', { token });
    } catch (error) {
      // Abort is local only: release a previous-account job even after logout.
      if (token) await invoke('abort', { ...identity, token }).catch(() => {});
      throw error;
    }
  }
  return { sync };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MulticaMemorySync;
