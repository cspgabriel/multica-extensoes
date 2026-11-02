'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {gzipSync}=require('node:zlib');
const MARKER='/* multica-extensoes:pt-BR:1 */';
const REGION='//#region ../../packages/views/locales/en/common.json';
function once(source,before,after){if(source.split(before).length!==2)throw new Error('Build incompatível com PT-BR: '+before.slice(0,75));return source.replace(before,after);}
function readNative(source){
 const start=source.indexOf(REGION),resources=source.indexOf('var RESOURCES =',start),end=source.indexOf('//#endregion',resources);
 if(start<0||resources<0||end<0)throw new Error('Os catálogos nativos de idioma não foram encontrados.');
 const context={};vm.runInNewContext(source.slice(start,end),context,{timeout:10000});
 return{start,end,context,resources:context.RESOURCES};
}
function placeholders(value){return(value.match(/{{[^}]*}}/g)||[]).sort().join('|');}
function loadCatalogues(english,directory){
 const result={};let count=0;
 for(const[namespace,original]of Object.entries(english)){
  const translated=JSON.parse(fs.readFileSync(path.join(directory,namespace+'.json'),'utf8'));
  function validate(a,b,key){
   if(typeof a==='string'){
    if(typeof b!=='string'||!b.trim()&&a.trim())throw new Error('Tradução ausente: '+key);
    if(placeholders(a)!==placeholders(b))throw new Error('Variáveis alteradas na tradução: '+key);
    count++;return;
   }
   if(!b||typeof b!=='object')throw new Error('Catálogo inválido: '+key);
   for(const[k,v]of Object.entries(a))validate(v,b[k],key+'.'+k);
  }
  validate(original,translated,namespace);result[namespace]=translated;
 }
 return{catalogues:result,count};
}
function packResources(native,translated,context){
 const resources={...native,'pt-BR':translated};
 const paths=new Map();
 function visit(value,parts){if(!paths.has(value))paths.set(value,parts);if(value&&typeof value==='object')for(const[k,v]of Object.entries(value))visit(v,[...parts,k]);}
 visit(native,[]);
 const encoded=gzipSync(Buffer.from(JSON.stringify(resources)),{level:9}).toString('base64');
 let code=`${MARKER}\nvar RESOURCES = await new Response(new Blob([Uint8Array.from(atob(${JSON.stringify(encoded)}),c=>c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream("gzip"))).json();\n`;
 // Keep all original bindings, including aliases used by the bundled modules.
 for(const[name,value]of Object.entries(context))if(name!=='RESOURCES'){
  const parts=paths.get(value);
  code+='var '+name+' = '+(parts?'RESOURCES'+parts.map(x=>'['+JSON.stringify(x)+']').join(''):JSON.stringify(value))+';\n';
 }
 return code;
}
const LITERALS={
 'No priority':'Sem prioridade','In Progress':'Em andamento','Start date':'Data de início','Due date':'Prazo','Created date':'Data de criação','Updated date':'Data de atualização','Sub-issue progress':'Progresso das subtarefas',
 'Up Arrow':'Seta para cima','Down Arrow':'Seta para baixo','Left Arrow':'Seta para a esquerda','Right Arrow':'Seta para a direita','Write something …':'Escreva algo…','All members':'Todos os membros','More emojis...':'Mais emojis...',
 'Cache read':'Leitura do cache','Cache write':'Gravação no cache','Run time':'Tempo de execução',
 "This page doesn't exist":'Esta página não existe','This address is unavailable. Check the link or go back.':'Este endereço está indisponível. Verifique o link ou volte.','Go to issues':'Ir para tarefas','Something went wrong in this tab':'Ocorreu um erro nesta aba','This tab could not load. Reload it, or send a report if the problem continues.':'Não foi possível carregar esta aba. Recarregue-a ou envie um relato se o problema continuar.',
 'Update ready':'Atualização pronta','See changelog':'Ver novidades','Restart now':'Reiniciar agora','Issue unavailable':'Tarefa indisponível','This workspace is no longer available in your account.':'Este espaço de trabalho não está mais disponível na sua conta.','Close window':'Fechar janela','Something went wrong':'Ocorreu um erro','Desktop configuration error':'Erro de configuração do desktop','Multica Desktop could not load ':'O Multica Desktop não conseguiu carregar ','. Fix or remove the file and restart the app.':'. Corrija ou remova o arquivo e reinicie o aplicativo.',
 'Multica Desktop hit an unexpected error and could not keep rendering. Reloading usually recovers — your work is stored on the server.':'O Multica Desktop encontrou um erro inesperado e não conseguiu continuar exibindo a interface. Recarregue a janela; seu trabalho está salvo no servidor.',
 'Pool de Contas IA':'Contas de IA','Docs':'Documentação'
};
function translateRenderer(source,directory){
 if(source.includes(MARKER))throw new Error('PT-BR já foi aplicado a este pacote.');
 const native=readNative(source),loaded=loadCatalogues(native.resources.en,directory);
 source=source.slice(0,native.start)+packResources(native.resources,loaded.catalogues,native.context)+source.slice(native.end);
 source=once(source,'var SUPPORTED_LOCALES = [','var SUPPORTED_LOCALES = [\n\t"pt-BR",');
 source=once(source,'var HTML_LANG = {','var HTML_LANG = {\n\t"pt-BR": "pt-BR",');
 source=once(source,'var CONTENT_LANG_BY_LOCALE = {','var CONTENT_LANG_BY_LOCALE = {\n\t"pt-BR": "en",');
 source=once(source,'function createDesktopLocaleAdapter(systemLocale) {',`function createDesktopLocaleAdapter(systemLocale) {
 try { if (!window.localStorage.getItem("multica-pt-br-enabled")) { window.localStorage.setItem("multica-locale","pt-BR"); window.localStorage.setItem("multica-pt-br-enabled","1"); } } catch {}`);
 source=once(source,'const userLanguage = useAuthStore((s) => s.user?.language ?? null);','const userLanguage = useAuthStore((s) => s.user?.language ?? null);');
 const syncStart=source.indexOf('function UserLocaleSync()'),syncEnd=source.indexOf('//#endregion',syncStart);
 let sync=source.slice(syncStart,syncEnd);
 sync=once(sync,'if (!userLanguage) return;','if (adapter.getUserChoice?.() === "pt-BR") return;\n\t\tif (!userLanguage) return;');
 source=source.slice(0,syncStart)+sync+source.slice(syncEnd);
 const languageStart=source.indexOf('function LanguageRow()'),languageEnd=source.indexOf('function StickyCommentBarRow()',languageStart);
 let language=source.slice(languageStart,languageEnd);
 language=once(language,'const languageOptions = [','const languageOptions = [\n\t\t{ value: "pt-BR", label: "Português (Brasil)" },');
 // Server 0.7.2 does not advertise pt-BR. Persist this choice on the desktop.
 language=once(language,'if (user) try {','if (user && next !== "pt-BR") try {');
 source=source.slice(0,languageStart)+language+source.slice(languageEnd);
 const calendarStart=source.indexOf('function Calendar({'),calendarEnd=source.indexOf('function CalendarDayButton(',calendarStart);
 let calendar=source.slice(calendarStart,calendarEnd);
 calendar=once(calendar,'const defaultClassNames = getDefaultClassNames();',`const defaultClassNames = getDefaultClassNames();
 const ptBR = document.documentElement.lang === "pt-BR";
 const ptFormatters = ptBR ? { formatCaption: date => new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric"}).format(date), formatWeekdayName: date => new Intl.DateTimeFormat("pt-BR",{weekday:"short"}).format(date), formatMonthDropdown: date => new Intl.DateTimeFormat("pt-BR",{month:"short"}).format(date) } : {};
 const ptLabels = ptBR ? { labelNext:()=>"Próximo mês",labelPrevious:()=>"Mês anterior",labelMonthDropdown:()=>"Selecionar mês",labelYearDropdown:()=>"Selecionar ano",labelDayButton:date=>new Intl.DateTimeFormat("pt-BR",{dateStyle:"full"}).format(date) } : undefined;`);
 calendar=once(calendar,'\t\tcaptionLayout,\n\t\tlocale,\n\t\tformatters:','\t\tcaptionLayout,\n\t\tlocale,\n\t\tlabels: ptLabels,\n\t\tformatters:');
 calendar=once(calendar,'\t\t\t...formatters','\t\t\t...ptFormatters,\n\t\t\t...formatters');
 source=source.slice(0,calendarStart)+calendar+source.slice(calendarEnd);
 for(const[from,to]of Object.entries(LITERALS))source=source.split(JSON.stringify(from)).join(JSON.stringify(to));
 return{source,count:loaded.count,namespaces:Object.keys(loaded.catalogues).length};
}
function translateMain(source){
 source=once(source,'var labels = {',`var labels = {
 "pt-BR": { title:"Sair do Multica",activeRuns:count=>count===1?"Há 1 execução ativa neste dispositivo.":"Há "+count+" execuções ativas neste dispositivo.",unknownRuns:"Não foi possível confirmar se há execuções ativas neste dispositivo.",interruptRuns:"Parar o serviço agora interromperá as execuções ativas.",interruptUnknownRuns:"Parar o serviço pode interromper execuções neste dispositivo.",cancel:"Cancelar",stopAndQuit:"Parar agora e sair",failureTitle:"Não foi possível confirmar o encerramento",daemonStopped:"O serviço parou, mas não foi possível confirmar o encerramento de todas as execuções.",shutdownUnknown:"Não foi possível confirmar se o serviço e suas execuções pararam.",cancelAfterStop:"Ao cancelar, o Multica permanece aberto e o serviço continua parado. Execuções em segundo plano podem continuar.",cancelUnconfirmed:"Ao cancelar, o Multica permanece aberto com a reinicialização automática do serviço desativada. Execuções em segundo plano podem continuar.",cancelQuit:"Cancelar saída",ignoreAndQuit:"Ignorar e sair" },`);
 source=once(source,'const preferred = preferredLanguage.toLowerCase();','const preferred = preferredLanguage.toLowerCase();\n\tif (preferred.startsWith("pt")) return labels["pt-BR"];');
 source=once(source,'var labelsByLocale = {','var labelsByLocale = {\n "pt-BR": {openLink:"Abrir link no navegador",copyLinkAddress:"Copiar endereço do link",copyImage:"Copiar imagem",addToDictionary:"Adicionar ao dicionário"},');
 source=once(source,'const preferred = electron.app.getPreferredSystemLanguages()[0]?.toLowerCase() ?? "";','const preferred = electron.app.getPreferredSystemLanguages()[0]?.toLowerCase() ?? "";\n\tif (preferred.startsWith("pt")) return labelsByLocale["pt-BR"];');
 const extra={'Reload':'Recarregar','Dismiss':'Dispensar','Multica needs to reload':'O Multica precisa recarregar','The desktop window stopped unexpectedly.':'A janela do aplicativo parou inesperadamente.','The desktop window could not finish starting.':'A janela do aplicativo não conseguiu concluir a inicialização.','The desktop window has been stuck for a few seconds.':'A janela do aplicativo não responde há alguns segundos.','Click Reload to refresh this window and keep using Multica.':'Clique em Recarregar para atualizar esta janela e continuar usando o Multica.','If this keeps happening, please tell us what you were doing right before this message appeared and whether Reload recovered the window.':'Se o problema continuar, informe o que você estava fazendo antes desta mensagem e se recarregar recuperou a janela.','Diagnostic details:':'Detalhes do diagnóstico:'};
 for(const[from,to]of Object.entries(extra))source=source.split(JSON.stringify(from)).join(JSON.stringify(to));
 // Remove only documentation at two known file boundaries to retain file size.
 for(const region of ['linux-file-dialog','renderer-web-preferences']){
  const start=source.indexOf('//#region src/main/'+region+'.ts\n'),doc=start<0?-1:source.indexOf('/**',start),end=doc<0?-1:source.indexOf('*/',doc);
  if(start>=0&&doc>=0&&end>=0&&source.slice(start,doc).trim()==='//#region src/main/'+region+'.ts')source=source.slice(0,doc)+source.slice(end+2);
 }
 new vm.Script(source);return source;
}
function padToSize(source,size){const data=Buffer.from(source);if(data.length>size)throw new Error('A tradução excede o espaço reservado no pacote.');return Buffer.concat([data,Buffer.alloc(size-data.length,32)]);}
module.exports={MARKER,readNative,loadCatalogues,translateRenderer,translateMain,padToSize};
