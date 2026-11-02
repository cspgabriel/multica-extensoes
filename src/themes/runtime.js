'use strict';
var MulticaThemes = (() => {
  const C = MulticaThemeCatalog;
  const source = 'multica-extensoes-themes';
  const pending = new Map();
  let selected = 'default', started = false, host = false, sequence = 0;
  const isFrame = () => window.parent !== window;
  function apply(id) {
    if (!C.valid(id)) throw new Error('Tema desconhecido.');
    selected = id;
    const root = document.documentElement;
    if (id === 'default') root.removeAttribute('data-multica-theme');
    else root.setAttribute('data-multica-theme', id);
    if (!host) {
      root.classList.toggle('dark', C.find(id)?.mode === 'dark');
      root.classList.toggle('light', C.find(id)?.mode === 'light');
    }
    window.dispatchEvent(new CustomEvent('multica-theme-change', { detail:{id,theme:C.find(id)} }));
  }
  function read() {
    try { const value = localStorage.getItem(C.storageKey); return C.valid(value) ? value : 'default'; }
    catch { return 'default'; }
  }
  function select(id) {
    if (!C.valid(id)) return Promise.reject(new Error('Tema desconhecido.'));
    if (isFrame() && !host) return new Promise((resolve,reject) => {
      const requestId = `${Date.now()}-${++sequence}`;
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('Não foi possível salvar o tema. Abra esta página pelo Multica e tente novamente.')); }, 5000);
      pending.set(requestId,{resolve,reject,timer});
      window.parent.postMessage({source,action:'select',id,requestId}, '*');
    });
    try {
      if (id === 'default') localStorage.removeItem(C.storageKey);
      else localStorage.setItem(C.storageKey,id);
      apply(id);
      return Promise.resolve(id);
    } catch { return Promise.reject(new Error('Não foi possível salvar a aparência neste desktop.')); }
  }
  function start(options = {}) {
    if (started) return;
    started = true; host = options.host === true;
    if (isFrame() && !host) {
      window.addEventListener('message', event => {
        const message = event.data;
        if (event.source !== window.parent || message?.source !== source || message.action !== 'state' || !C.valid(message.id)) return;
        apply(message.id);
        const task = pending.get(message.requestId);
        if (task) {
          clearTimeout(task.timer); pending.delete(message.requestId);
          if (message.error) task.reject(new Error(message.error)); else task.resolve(message.id);
        }
      });
      window.parent.postMessage({source,action:'request'}, '*');
    } else {
      apply(read());
      window.addEventListener('storage', event => { if (event.key === C.storageKey || event.key === null) apply(read()); });
    }
  }
  function sendFrame(target, requestId, error) {
    target?.postMessage({source,action:'state',id:selected,requestId,error}, '*');
  }
  function bindFrame(getTarget) {
    const receive = event => {
      const target = getTarget(), message = event.data;
      if (!target || event.source !== target || message?.source !== source) return;
      if (message.action === 'request') sendFrame(target);
      if (message.action === 'select' && typeof message.requestId === 'string' && message.requestId.length < 100) {
        select(message.id).then(() => sendFrame(target,message.requestId)).catch(error => sendFrame(target,message.requestId,error.message));
      }
    };
    const update = () => sendFrame(getTarget());
    window.addEventListener('message',receive);
    window.addEventListener('multica-theme-change',update);
    return () => { window.removeEventListener('message',receive); window.removeEventListener('multica-theme-change',update); };
  }
  return Object.freeze({start,select,current:()=>selected,theme:()=>C.find(selected),source,sendFrame,bindFrame});
})();
if (typeof document !== 'undefined' && document.documentElement.hasAttribute('data-theme-surface')) MulticaThemes.start();
