'use strict';
var MulticaThemeCatalog = (() => {
  const entries = [
    ['aurora','Aurora','dark','Azul da noite com luz violeta.', ['#101522','#171e2f','#202a3d','#28344a','#34425c','#edf2ff','#acbad3','#4a5874','#b5a3ff','#181029']],
    ['grafite','Grafite','dark','Cinza mineral com detalhes em turquesa.', ['#141719','#1c2124','#252c30','#303a3f','#3b484e','#edf5f5','#adbec1','#52646b','#74ddcb','#082c26']],
    ['oceano','Oceano','dark','Profundidade marinha com azul cristalino.', ['#081b2b','#10283c','#19354d','#21445c','#2c536d','#e8f5ff','#a8c5da','#466d89','#71ccff','#072b43']],
    ['floresta','Floresta','dark','Verde profundo com luz de menta.', ['#102019','#192c23','#223b2e','#2c4939','#385944','#ebf8ed','#b3cfbc','#54755e','#9bdd9c','#163619']],
    ['ametista','Ametista','dark','Ameixa escura com acentos lilás.', ['#21162c','#2c2039','#38294a','#463359','#554168','#f6edff','#c7b4d9','#735988','#d3a4ff','#341347']],
    ['cafe','Café','dark','Chocolate, madeira e âmbar suave.', ['#241b17','#30251f','#3d3028','#4b3b31','#5c493c','#fff2e4','#d1bca9','#806854','#f0bd7a','#38220e']],
    ['porcelana','Porcelana','light','Branco suave com índigo preciso.', ['#f4f5fa','#ffffff','#ffffff','#e9edf7','#dde4f7','#222b40','#53617c','#bdc6d9','#4338b0','#ffffff']],
    ['areia','Areia','light','Papel quente com detalhes em terracota.', ['#f6f0e7','#fffaf2','#fffdf8','#e9dfcf','#dfcfb9','#382a22','#665142','#c9b9a4','#934721','#ffffff']],
    ['jardim','Jardim','light','Sálvia clara e verde botânico.', ['#eff5f0','#fbfefb','#ffffff','#dfebe1','#cde2d2','#203b2c','#4b6756','#abc5b3','#256347','#ffffff']],
    ['ceu','Céu','light','Azul de manhã com contraste cobalto.', ['#edf4fb','#fbfdff','#ffffff','#dce9f6','#c8dff3','#183752','#456077','#a9c4dc','#1c559b','#ffffff']],
  ];
  const keys = ['canvas','surface','raised','hover','selected','text','muted','border','accent','accentText'];
  const themes = entries.map(([id,name,mode,description,values]) => Object.freeze({id,name,mode,description,palette:Object.freeze({
    ...Object.fromEntries(keys.map((key,index) => [key,values[index]])),
    ...(mode === 'dark' ? {danger:'#ffabb4',success:'#9ce6b0',warning:'#f4d18c',info:'#a5ceff'} : {danger:'#a9223b',success:'#22633d',warning:'#785100',info:'#235c89'}),
  })}));
  function find(id) { return themes.find(theme => theme.id === id) || null; }
  function valid(id) { return id === 'default' || Boolean(find(id)); }
  return Object.freeze({ themes:Object.freeze(themes), find, valid, storageKey:'multica-extensoes.theme.v1' });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MulticaThemeCatalog;
