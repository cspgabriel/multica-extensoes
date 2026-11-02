'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { encodeHeader, openArchive, repack, readFuses, digest } = require('../lib/asar.cjs');
const engine = require('../lib/engine.cjs');
const compatibility = require('../compatibility.json');
const nativeI18n = require('./native-i18n-fixture.cjs');
const fixtureBundle = `
var known=[
\t["runtimes"],
];
function scoped(ws){return{
\t\truntimes: () => \x60\x24{ws}/runtimes\x60,
};}
var WORKSPACE_PAGES = {};
function title(subject){const page = WORKSPACE_PAGES[subject.page];return page;}
var aiTeamNav=[{
\t\tkey: "runtimes",
\t\tlabelKey: "runtimes"
\t}
];
var sidebar={children: aiTeamNav.map((item) => {
return {children: t(($) => $.nav[item.labelKey])};
})};
/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SidebarFooter, {});
function ThemeProvider({ children, ...props }) {
return (0, import_jsx_runtime.jsx)(J$4, {
\t\t...props,
children
});
}
//#endregion
var appRoutes = [{
\t\t\t\tpath: "runtimes",
element: null
}];
`;
function writeArchive(filename, files) {
  const header = { files: {} };
  let offset = 0;
  const buffers = [];
  for (const [filename, text] of Object.entries(files)) {
    const value = Buffer.from(text);
    let parent = header;
    const parts = filename.split('/');
    for (const part of parts.slice(0,-1)) parent = parent.files[part] ||= { files: {} };
    parent.files[parts.at(-1)] = { offset: String(offset), size: value.length };
    offset += value.length;
    buffers.push(value);
  }
  header.files.native = { files: { 'binary.node': { size: 5, unpacked: true } }, unpacked: true };
  fs.writeFileSync(filename, Buffer.concat([encodeHeader(header), ...buffers]));
}
function fixture() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mext-test-'));
  const app = path.join(temporary, 'App com espaços ç');
  const resources = path.join(app, 'resources');
  const root = path.join(temporary, 'Extensões locais');
  fs.mkdirSync(resources, { recursive: true });
  const archive = path.join(resources, 'app.asar');
  const executable = path.join(app, 'Multica.exe');
  fs.writeFileSync(executable, Buffer.concat([Buffer.from('FAKE-PE-FOR-TESTS\0dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'), Buffer.from([1,9,49,48,49,49,48,48,48,49,49])]));
  writeArchive(archive, { 'package.json': JSON.stringify({ name: '@multica/desktop', version: '0.7.2' }), 'out/main/index.js': nativeI18n.main, 'out/renderer/index.html': '<link rel="stylesheet" href="./assets/fixture.css"><script type="module" src="./assets/index-fixture.js"></script>', 'out/renderer/assets/fixture.css': ':root{--background:white}', 'out/renderer/assets/index-fixture.js': fixtureBundle+nativeI18n.renderer, 'unchanged.txt': 'payload preservado' });
  const originalHash = digest(fs.readFileSync(archive));
  const sourceRoot=path.join(root,'versions','1.0.0');
  const catalogueRoot=path.join(sourceRoot,'src/i18n/pt-BR');
  fs.mkdirSync(catalogueRoot,{recursive:true});
  for(const name of fs.readdirSync(path.resolve(__dirname,'../src/i18n/pt-BR')))fs.copyFileSync(path.resolve(__dirname,'../src/i18n/pt-BR',name),path.join(catalogueRoot,name));
  return { temporary, root, archive, executable, originalHash, sourceRoot, profile: 'test-profile' };
}
test('ASAR rebuild preserves payloads and unpacked metadata', () => {
  const data = fixture();
  const output = repack(data.archive, data.archive + '.next', new Map([['unchanged.txt','nova versão'], ['added/file.js','module.exports=1;']]));
  assert.equal(output.read('unchanged.txt').toString(), 'nova versão');
  assert.equal(output.read('added/file.js').toString(), 'module.exports=1;');
  assert.equal(output.entry('native/binary.node').unpacked, true);
  assert.equal(output.read('out/main/index.js').toString(), openArchive(data.archive).read('out/main/index.js').toString());
  assert.equal(output.entry('unchanged.txt').integrity.hash, digest(Buffer.from('nova versão')));
});
test('unknown build is rejected without changing application', () => {
  const data = fixture();
  assert.throws(() => engine.inspect(data), /Build desconhecido/);
  assert.equal(digest(fs.readFileSync(data.archive)), data.originalHash);
  assert.equal(fs.existsSync(path.join(data.root,'installation.json')), false);
});
test('fuses are read and embedded-integrity builds are rejected without flipping bits', () => {
  const data = fixture();
  const binary = fs.readFileSync(data.executable);
  const start = binary.indexOf('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX') + 32;
  binary[start + 6] = 49;
  fs.writeFileSync(data.executable,binary);
  assert.equal(readFuses(data.executable).embeddedAsarIntegrityValidation,true);
  assert.throws(()=>engine.inspect(data), /integridade embutida/);
  assert.ok(fs.readFileSync(data.executable).equals(binary));
});
test('prepare, atomic apply, idempotent inspect and exact restore with personal data preserved', () => {
  const data = fixture();
  compatibility.originalArchiveSha256.push(data.originalHash);
  const prepared = engine.prepare(data);
  assert.equal(digest(fs.readFileSync(data.archive)),data.originalHash);
  assert.equal(fs.existsSync(prepared.transaction),true);
  const result = engine.apply({transaction:prepared.transaction});
  assert.equal(result.installed,true);
  const modified = openArchive(data.archive);
  assert.match(modified.read('out/renderer/assets/index-fixture.js').toString(),/DesktopLocalFrame/);
  assert.match(modified.read('out/renderer/assets/index-fixture.js').toString(),/forcedTheme: extensionTheme/);
  assert.match(modified.read('out/renderer/assets/fixture.css').toString(),/data-multica-theme="aurora"/);
  assert.match(modified.read('out/main/index.js').toString(),/bootstrap\.cjs/);
  assert.equal(modified.entry('native/binary.node').unpacked,true);
  assert.equal(engine.inspect(data).alreadyInstalled,true);
  assert.equal(engine.prepare(data).alreadyInstalled,true);
  fs.mkdirSync(path.join(data.root,'data','docs'),{recursive:true});
  fs.writeFileSync(path.join(data.root,'data','docs','personal.md'),'texto pessoal');
  assert.equal(engine.restore(data).restored,true);
  assert.equal(digest(fs.readFileSync(data.archive)),data.originalHash);
  assert.equal(fs.readFileSync(path.join(data.root,'data','docs','personal.md'),'utf8'),'texto pessoal');
});
test('apply refuses a changed archive; restore refuses a subsequent official update', () => {
  const data = fixture();
  compatibility.originalArchiveSha256.push(data.originalHash);
  const prepared=engine.prepare(data);
  fs.appendFileSync(data.archive,'changed');
  assert.throws(()=>engine.apply({transaction:prepared.transaction}),/mudou/);
  const second=fixture();
  const ready=engine.prepare(second);
  engine.apply({transaction:ready.transaction});
  fs.appendFileSync(second.archive,'new official version');
  const preserved=digest(fs.readFileSync(second.archive));
  assert.throws(()=>engine.restore(second),/atualizado ou modificado/);
  assert.equal(digest(fs.readFileSync(second.archive)),preserved);
});
test('discard only removes its verified prepared file and leaves the application intact',()=>{
  const data=fixture();
  compatibility.originalArchiveSha256.push(data.originalHash);
  const prepared=engine.prepare(data);
  const transaction=JSON.parse(fs.readFileSync(prepared.transaction));
  assert.ok(fs.existsSync(transaction.next));
  assert.equal(engine.discard({transaction:prepared.transaction}).discarded,true);
  assert.equal(fs.existsSync(transaction.next),false);
  assert.equal(digest(fs.readFileSync(data.archive)),data.originalHash);
});
