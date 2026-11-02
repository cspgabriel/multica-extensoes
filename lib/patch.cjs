'use strict';
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const vm=require('node:vm');
const {translateRenderer,translateMain}=require('./pt-br.cjs');
function editOnce(source,before,after){if(source.split(before).length!==2)throw new Error('Build incompatível: âncora ausente ou ambígua: '+before.slice(0,80));return source.replace(before,after);}
exports.createPatches=function(archive,moduleRoot,installationRoot,profile){
const replacements=new Map();
const extract=(_,filename)=>archive.read(filename);
const html = extract(null, 'out/renderer/index.html').toString();
const bundlePath = 'out/renderer/' + html.match(/src="\.\/([^\"]+\.js)"/)[1];
let bundle = extract(null, bundlePath).toString();
bundle = editOnce(bundle, '\t["runtimes"],', '\t["runtimes"],\n\t["pool-contas-ia"],\n\t["marketplace"],\n\t["docs"],');
bundle = editOnce(bundle, '\t\truntimes: () => `${ws}/runtimes`,', '\t\truntimes: () => `${ws}/runtimes`,\n\t\tpoolContasIA: () => `${ws}/pool-contas-ia`,\n\t\tmarketplace: () => `${ws}/marketplace`,\n\t\tdocs: () => `${ws}/docs`,');
bundle = editOnce(bundle, 'var WORKSPACE_PAGES = {', `var WORKSPACE_PAGES = {
  poolContasIA: { segment: "pool-contas-ia", icon: "Users", navKey: "pool_contas_ia", title: "Pool de Contas IA" },`);
bundle = editOnce(bundle, 'var WORKSPACE_PAGES = {', `var WORKSPACE_PAGES = {
  marketplace: { segment: "marketplace", icon: "Zap", navKey: "marketplace", title: "Marketplace Composio" },
  docs: { segment: "docs", icon: "BookOpenText", navKey: "docs", title: "Docs" },`);
bundle = editOnce(bundle, 'const page = WORKSPACE_PAGES[subject.page];', `const page = WORKSPACE_PAGES[subject.page];
      if (page.title) return { visual: { kind: "icon", icon: page.icon }, title: { kind: "text", text: page.title } };`);
bundle = editOnce(bundle, '\t\tkey: "runtimes",\n\t\tlabelKey: "runtimes"\n\t}\n];', '\t\tkey: "runtimes",\n\t\tlabelKey: "runtimes"\n\t},\n\t{ key: "poolContasIA", label: "Pool de Contas IA" },\n\t{ key: "marketplace", label: "Marketplace Composio" },\n\t{ key: "docs", label: "Docs" }\n];');
const navStart = bundle.indexOf('children: aiTeamNav.map((item) => {');
const navEnd = bundle.indexOf('/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SidebarFooter', navStart);
if (navStart < 0 || navEnd < 0) throw new Error('Sidebar AI team section not found');
const nav = bundle.slice(navStart, navEnd);
bundle = bundle.slice(0, navStart) + editOnce(nav, 'children: t(($) => $.nav[item.labelKey])', 'children: item.label || t(($) => $.nav[item.labelKey])') + bundle.slice(navEnd);
bundle = editOnce(bundle, '\t\t\t\tpath: "runtimes",', `                path: "pool-contas-ia",
                element: (0, import_jsx_runtime.jsx)(PoolContasIAPage, {}),
                handle: { title: "Pool de Contas IA" }
            },
            {
                path: "marketplace",
                element: (0, import_jsx_runtime.jsx)(DesktopLocalFrame, { page: "marketplace" }),
                handle: { title: "Marketplace Composio" }
            },
            {
                path: "docs",
                element: (0, import_jsx_runtime.jsx)(DesktopLocalFrame, { page: "docs" }),
                handle: { title: "Docs" }
            },
            {
                path: "runtimes",`);
bundle = editOnce(bundle, 'var appRoutes = [{', `function DesktopLocalFrame({ page }) {
  const frameRef = (0, import_react.useRef)(null);
  const workspace = useCurrentWorkspace();
  const { push, searchParams } = useNavigation$1();
  (0, import_react.useEffect)(() => {
    const receive = (event) => {
      if (event.source !== frameRef.current?.contentWindow || event.data?.source !== 'agenciar-desktop-modules' || event.data?.action !== 'navigate' || !workspace?.slug) return;
      const message = event.data;
      if (message.page === 'issue' && /^[0-9a-f-]{36}$/i.test(message.issueId || '')) {
        push(paths.workspace(workspace.slug).issueDetail(message.issueId));
      } else if (message.page === 'docs' || message.page === 'marketplace') {
        const query = new URLSearchParams();
        if (typeof message.doc === 'string' && /^[a-z0-9-]+\\.md$/.test(message.doc)) query.set('doc', message.doc);
        if (message.ai) query.set('ai', '1');
        push(paths.workspace(workspace.slug)[message.page]() + (query.size ? '?' + query.toString() : ''));
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [push, workspace?.id, workspace?.slug]);
  const target = page === 'pool' ? new URL(${JSON.stringify(pathToFileURL(path.join(moduleRoot, "pool/renderer/index.html")).href)}) : new URL(${JSON.stringify(pathToFileURL(path.join(moduleRoot, 'src/ui/index.html')).href)});
  target.searchParams.set('page', page);
  target.searchParams.set('workspace', workspace?.id || '');
  target.searchParams.set('slug', workspace?.slug || '');
  if (searchParams.get('doc')) target.searchParams.set('doc', searchParams.get('doc'));
  if (searchParams.get('ai')) target.searchParams.set('ai', searchParams.get('ai'));
  return (0, import_jsx_runtime.jsx)("iframe", {
    ref: frameRef,
    src: target.href,
    title: page === 'pool' ? "Pool de Contas IA" : page === 'docs' ? "Docs" : "Marketplace Composio",
    style: { width: "100%", height: "100%", flex: "1 1 0%", minHeight: 0, border: 0, background: "#0f1115" }
  });
}
function PoolContasIAPage() { return (0, import_jsx_runtime.jsx)(DesktopLocalFrame, { page: 'pool' }); }
var appRoutes = [{`);
bundle=translateRenderer(bundle,path.join(moduleRoot,'src/i18n/pt-BR')).source;
replacements.set(bundlePath, Buffer.from(bundle));

let main=archive.read('out/main/index.js').toString();
main=editOnce(main,'let electron = require("electron");', 'let electron = require("electron");\ntry { require('+JSON.stringify(path.join(moduleRoot,'src/main/bootstrap.cjs'))+').register(require("node:path").join(__dirname,"../renderer/index.html"),'+JSON.stringify({root:installationRoot,sourceRoot:moduleRoot,profile})+'); } catch(error) { console.error("[multica-extensoes]",error.message); }');
main=translateMain(main);
new vm.Script(main);
replacements.set('out/main/index.js',Buffer.from(main));
return {replacements,bundlePath,bundle};
};
