'use strict';
var MulticaThemeGallery = (() => {
  const C = MulticaThemeCatalog;
  function node(tag, props = {}, children = []) {
    const element = document.createElement(tag);
    for (const [key,value] of Object.entries(props)) {
      if (key === 'text') element.textContent = value;
      else if (key === 'class') element.className = value;
      else if (key.startsWith('on')) element.addEventListener(key.slice(2),value);
      else element.setAttribute(key,value);
    }
    for (const child of children) element.append(child);
    return element;
  }
  function preview(theme) {
    return node('div', {class:'theme-preview','data-theme-preview':theme.id,'aria-hidden':'true'}, [
      node('aside',{class:'theme-mini-sidebar'},[
        node('b',{class:'theme-mini-mark',text:'✳'}),node('span',{text:'Workspace'}),
        node('span',{text:'Caixa de entrada'}),node('span',{class:'is-selected',text:'Agentes'}),node('span',{text:'Conversas'}),
      ]),
      node('div',{class:'theme-mini-main'},[
        node('header',{},[node('b',{text:'Meu workspace'}),node('span',{class:'theme-mini-avatar',text:'G'})]),
        node('div',{class:'theme-mini-message'},[node('b',{text:'Tudo pronto para começar.'}),node('span',{text:'O que vamos criar hoje?'})]),
        node('div',{class:'theme-mini-task'},[node('span',{class:'theme-mini-dot'}),node('span',{text:'Revisar próxima campanha'}),node('small',{text:'Em andamento'})]),
        node('div',{class:'theme-mini-task'},[node('span',{class:'theme-mini-dot done'}),node('span',{text:'Organizar o projeto'}),node('small',{text:'Concluído'})]),
        node('div',{class:'theme-mini-compose'},[node('span',{text:'Escreva uma mensagem…'}),node('span',{class:'theme-mini-send',text:'↑'})]),
      ]),
    ]);
  }
  function render(target) {
    let mode = 'all', search = '', busy = false;
    const feedback = node('p',{class:'theme-feedback',role:'status','aria-live':'polite'});
    const current = node('span',{class:'theme-current'});
    const count = node('span',{class:'theme-count'});
    const grid = node('div',{class:'theme-grid'});
    const filters = node('div',{class:'theme-filters','aria-label':'Filtrar temas'});
    function button(label, action, primary = false) { return node('button',{type:'button',class:'button'+(primary?' primary':''),text:label,onclick:action}); }
    async function apply(id) {
      if (busy) return;
      busy = true; feedback.textContent = 'Salvando aparência…'; feedback.setAttribute('role','status'); update();
      try { const confirmed = await MulticaThemes.select(id); feedback.textContent = confirmed === 'default' ? 'Aparência original restaurada.' : `${C.find(confirmed).name} salvo neste desktop.`; }
      catch (error) { feedback.textContent = error.message; feedback.setAttribute('role','alert'); }
      finally { busy = false; update(); }
    }
    function update() {
      const chosen = MulticaThemes.current();
      current.textContent = chosen === 'default' ? 'Em uso: aparência original' : 'Em uso: '+C.find(chosen).name;
      const visible = C.themes.filter(theme => (mode === 'all' || theme.mode === mode) && (theme.name+' '+theme.description).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(search));
      count.textContent = `${visible.length} de ${C.themes.length} temas`;
      grid.replaceChildren(...visible.map(theme => {
        const active = theme.id === chosen;
        const use = button(active ? 'Em uso' : 'Aplicar '+theme.name,()=>apply(theme.id),!active);
        use.disabled = busy || active;
        use.setAttribute('aria-label',active ? theme.name+' em uso' : 'Aplicar '+theme.name);
        use.setAttribute('aria-pressed',String(active));
        return node('article',{class:'theme-card'+(active?' is-active':''),'data-theme-card':theme.id},[
          preview(theme),
          node('div',{class:'theme-card-body'},[
            node('div',{class:'theme-card-title'},[node('h2',{text:theme.name}),node('span',{class:'theme-mode',text:theme.mode==='dark'?'Escuro':'Claro'})]),
            node('p',{text:theme.description}),use,
          ]),
        ]);
      }));
      if (!visible.length) grid.append(node('p',{class:'empty',text:'Nenhum tema encontrado. Altere a busca ou o filtro.'}));
      filters.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
      reset.disabled = busy || chosen === 'default';
    }
    const reset = button('Voltar ao tema original',()=>apply('default'));
    for (const [id,label] of [['all','Todos'],['dark','Escuros'],['light','Claros']]) {
      const filter = button(label,()=>{mode=id;update();}); filter.dataset.mode=id;filters.append(filter);
    }
    const input = node('input',{class:'theme-search',type:'search','aria-label':'Buscar tema',placeholder:'Buscar um tema…',oninput:event=>{search=event.target.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();update();}});
    target.replaceChildren(node('section',{class:'theme-page'},[
      node('header',{class:'theme-page-header'},[
        node('div',{},[node('p',{class:'eyebrow',text:'APARÊNCIA DO MULTICA'}),node('h1',{text:'Seu espaço, sua cor.'}),node('p',{class:'theme-intro',text:'Dez paletas para acompanhar seu jeito de trabalhar. Escolha uma e veja a mudança no aplicativo e nas extensões.'})]),
        node('div',{class:'theme-current-actions'},[current,reset]),
      ]),
      node('div',{class:'theme-toolbar'},[filters,input,count]),
      feedback,grid,
      node('p',{class:'theme-note',text:'Preferência local deste desktop. Voltar ao tema original retoma a seleção clara, escura ou do sistema definida no Multica.'}),
    ]));
    window.addEventListener('multica-theme-change',update);
    target.setAttribute('aria-busy','false'); update();
  }
  return {render};
})();
