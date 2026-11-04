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
  const fold = text => text.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  const groupName = theme => (C.groups && C.groups[theme.group]) || '';
  const modeName = theme => theme.mode === 'dark' ? 'Escuro' : 'Claro';
  const matches = (theme, mode) => mode === 'all' || theme.mode === mode || theme.group === mode;
  // O aplicativo principal valida o tema pelo catálogo embutido no pacote instalado.
  function friendly(error) {
    if (error && error.message === 'Tema desconhecido.') return 'Este tema já está na galeria, mas o Multica instalado ainda não o reconhece. Ele poderá ser aplicado depois da próxima atualização do pacote da integração.';
    return (error && error.message) || 'Não foi possível aplicar o tema.';
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
      catch (error) { feedback.textContent = friendly(error); feedback.setAttribute('role','alert'); }
      finally { busy = false; update(); }
    }
    function update() {
      const chosen = MulticaThemes.current();
      current.textContent = chosen === 'default' ? 'Em uso: aparência original' : 'Em uso: '+C.find(chosen).name;
      const visible = C.themes.filter(theme => matches(theme,mode) && fold(theme.name+' '+theme.description+' '+groupName(theme)).includes(search));
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
            node('div',{class:'theme-card-title'},[node('h2',{text:theme.name}),node('span',{class:'theme-badges'},[
              ...(groupName(theme) ? [node('span',{class:'theme-mode',text:groupName(theme)})] : []),
              node('span',{class:'theme-mode',text:modeName(theme)}),
            ])]),
            node('p',{text:theme.description}),use,
          ]),
        ]);
      }));
      if (!visible.length) grid.append(node('p',{class:'empty',text:'Nenhum tema encontrado. Altere a busca ou o filtro.'}));
      filters.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
      reset.disabled = busy || chosen === 'default';
    }
    const reset = button('Voltar ao tema original',()=>apply('default'));
    for (const [id,label] of [['all','Todos'],['gradiente','Gradientes'],['solida','Sidebar sólida'],['pastel','Pastel'],['dark','Escuros'],['light','Claros'],['classico','Clássicos']]) {
      if (id !== 'all' && !C.themes.some(theme => matches(theme,id))) continue;
      const filter = button(label,()=>{mode=id;update();}); filter.dataset.mode=id;filters.append(filter);
    }
    const input = node('input',{class:'theme-search',type:'search','aria-label':'Buscar tema',placeholder:'Buscar um tema…',oninput:event=>{search=fold(event.target.value).trim();update();}});
    target.replaceChildren(node('section',{class:'theme-page'},[
      node('header',{class:'theme-page-header'},[
        node('div',{},[node('p',{class:'eyebrow',text:'APARÊNCIA DO MULTICA'}),node('h1',{text:'Seu espaço, sua cor.'}),node('p',{class:'theme-intro',text:`${C.themes.length} paletas para acompanhar seu jeito de trabalhar: barras laterais em gradiente ou cor sólida com o conteúdo claro, tons pastel, escuros elegantes e os clássicos. Escolha uma e veja a mudança no aplicativo e nas extensões.`})]),
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
