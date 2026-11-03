'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const MARKER = '/* multica-chat-memory-v1 */';
function once(source, before, after) {
  if (source.split(before).length !== 2) throw Error('Build incompatível com memória local: âncora ausente ou ambígua.');
  return source.replace(before, after);
}
function createMemoryPatch(archive, sourceRoot, installedRoot = sourceRoot) {
  if (JSON.parse(archive.read('package.json')).version !== '0.7.2') throw Error('A memória local suporta somente o Multica Desktop 0.7.2.');
  const html = archive.read('out/renderer/index.html').toString();
  const entry = html.match(/src="\.\/([^\"]+\.js)"/);
  if (!entry) throw Error('Renderer não reconhecido.');
  const bundlePath = 'out/renderer/' + entry[1];
  let bundle = archive.read(bundlePath).toString(), main = archive.read('out/main/index.js').toString();
  if (bundle.includes(MARKER) || main.includes(MARKER)) throw Error('A memória local já está instalada.');
  for (const anchor of ['function WorkspaceRouteLayout()', 'function workspaceHeader(', 'var ChatSessionSchema', 'async listChatMessagesPage(']) if (!bundle.includes(anchor)) throw Error('Contrato de chats incompatível: ' + anchor);
  const code = ['src/ui/chat-memory-sync.js', 'src/ui/chat-memory-native.js'].map(file => fs.readFileSync(path.join(sourceRoot, file), 'utf8')).join('\n');
  bundle = once(bundle, '(WorkspaceRouteLayout, {})', '(MulticaMemoryWorkspaceLayout, {})');
  bundle = once(bundle, 'var appRoutes = [{', MARKER + '\n' + code + '\nvar appRoutes = [{');
  const bootstrap = `\n${MARKER}\ntry { require(${JSON.stringify(path.join(installedRoot, 'src/main/chat-memory.cjs'))}).register(require('node:path').join(__dirname, '../renderer/index.html')); } catch (error) { console.error('[multica-memory]', error.message); }\n`;
  main = once(main, 'let electron = require("electron");', 'let electron = require("electron");' + bootstrap);
  new vm.Script(main);
  return { bundlePath, bundle, replacements: new Map([[bundlePath, Buffer.from(bundle)], ['out/main/index.js', Buffer.from(main)]]) };
}
module.exports = { createMemoryPatch, MARKER };
