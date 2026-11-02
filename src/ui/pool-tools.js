(function () {
  const header = document.querySelector('.topbar');
  if (!header) return;
  function navigate(ai) { window.parent.postMessage({ source: 'agenciar-desktop-modules', action: 'navigate', page: 'docs', doc: 'pool-contas-ia.md', ai }, '*'); }
  const docs = document.createElement('button');
  docs.className = 'btn'; docs.textContent = 'Docs'; docs.type = 'button'; docs.addEventListener('click', () => navigate(false));
  const edit = document.createElement('button');
  edit.className = 'btn'; edit.textContent = 'Editar com IA'; edit.type = 'button'; edit.addEventListener('click', () => navigate(true));
  header.insertBefore(docs, document.getElementById('refresh'));
  header.insertBefore(edit, document.getElementById('refresh'));
})();
