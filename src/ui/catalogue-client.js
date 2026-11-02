'use strict';

// Accept both the filtered catalogue protocol and the original Desktop IPC.
// Legacy backends are paged through IPC; credentials stay in the main process.
function createCatalogueClient(invoke, { now = () => Date.now() } = {}) {
  const cache = new Map();
  const pageSize = 48;
  let serial = 0;
  function outdated() { return new Error('O catálogo ou filtro mudou. Atualize a busca para continuar.'); }
  function project(app) {
    const auth = Array.isArray(app.authSchemes) ? app.authSchemes : [];
    const managed = Array.isArray(app.managedSchemes) ? app.managedSchemes : [];
    const noAuth = app.noAuth === true || auth.some(scheme => /^no_auth$/i.test(scheme));
    return { ...app, noAuth, setup: noAuth || managed.some(scheme => /oauth/i.test(scheme)) ? 'direct' : 'panel' };
  }
  return async function catalogue(input = {}) {
    const setup = input.setup || 'direct';
    if (!['direct', 'panel', 'all'].includes(setup)) throw new Error('Filtro de configuração inválido.');
    const key = JSON.stringify([input.search || '', input.category || '']);
    let entry = cache.get(key), offset = 0;
    const legacyCursor = String(input.cursor || '').startsWith('legacy:');
    if (legacyCursor) {
      const parts = input.cursor.split(':');
      offset = Number(parts[3]);
      if (!entry || entry.expires <= now() || parts.length !== 4 || parts[1] !== entry.id || parts[2] !== setup || !Number.isSafeInteger(offset) || offset < 0 || input.refresh) throw outdated();
    } else if (input.cursor || !entry || entry.expires <= now() || input.refresh) {
      const data = await invoke({ ...input, setup });
      if (data.setup !== undefined) {
        if (data.setup !== setup) throw outdated();
        return data;
      }
      if (input.cursor) throw outdated();
      entry = { id: String(++serial), expires: now() + 5 * 60 * 1000, items: new Map(), seen: new Set(), total: 0 };
      accept(data);
      if (cache.size >= 10) cache.delete(cache.keys().next().value);
      cache.set(key, entry);
    }
    function accept(data) {
      if (!Array.isArray(data.items)) throw new Error('O catálogo retornou uma lista inválida.');
      for (const app of data.items) if (app.slug) entry.items.set(app.slug, project(app));
      entry.total = Number(data.total) || 0;
      entry.cursor = data.nextCursor || null;
      entry.exhausted = !entry.cursor;
    }
    const matching = () => [...entry.items.values()].filter(app => setup === 'all' || app.setup === setup);
    let items = matching();
    while (items.length < offset + pageSize && !entry.exhausted) {
      if (entry.seen.has(entry.cursor) || entry.seen.size >= 500) throw new Error('Não foi possível concluir o catálogo. Refine a busca e tente novamente.');
      const sourceCursor = entry.cursor;
      const data = await invoke({ ...input, setup, cursor: sourceCursor });
      if (data.setup !== undefined) throw outdated();
      accept(data);
      entry.seen.add(sourceCursor);
      items = matching();
    }
    const nextOffset = offset + pageSize;
    const estimated = !entry.exhausted && (setup !== 'all' || !entry.total);
    return { items: items.slice(offset, nextOffset), total: setup === 'all' && !entry.exhausted && entry.total ? entry.total : items.length, totalIsEstimate: estimated, setup, nextCursor: items.length > nextOffset || !entry.exhausted ? `legacy:${entry.id}:${setup}:${nextOffset}` : null };
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createCatalogueClient };
