'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createMemory, register } = require('../src/main/chat-memory.cjs');
const { sync } = require('../src/ui/chat-memory-sync.js');
const { createMemoryPatch } = require('../lib/memory-patch.cjs');
const { encodeHeader, openArchive, digest } = require('../lib/asar.cjs');
const engine = require('../scripts/memory-engine.cjs');
const ownerId = '11111111-1111-4111-8111-111111111111', workspaceId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333', other = '44444444-4444-4444-8444-444444444444';
const scope = { ownerId, workspaceId };
const session = { id: sessionId, creator_id: ownerId, workspace_id: workspaceId, title: 'Projeto São João / retomada', status: 'active', updated_at: '2026-11-03T12:00:00Z' };
const message = (id, content, date = '2026-11-03T12:00:00Z') => ({ id, content, created_at: date, role: 'assistant', chat_session_id: sessionId });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'multica-memory-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const memory = createMemory({ root, taskContext: () => false });
  memory.configure({ ...scope, enabled: true });
  const invoke = async (method, input) => memory[method](input);
  const directory = memory.status(scope).directory;
  return { root, directory, memory, invoke };
}
const source = messages => ({ sessions: async () => [session], messages: async () => ({ messages, has_more: false }) });

test('all pages, archive inclusion, account/workspace isolation, chronological order and attachment references', async t => {
  const f = fixture(t), calls = [];
  const newest = message(other, 'Última decisão'), oldest = message(ownerId, 'Primeira decisão', '2026-11-01T12:00:00Z');
  newest.attachments = [{ id: other, filename: 'proposta.pdf', download_url: 'https://example.invalid/secret?token=never-store' }];
  const data = {
    sessions: async () => [{ ...session, status: 'archived' }, { ...session, id: other, creator_id: other }, { ...session, id: ownerId, workspace_id: other }],
    messages: async (id, before) => { calls.push({ id, before }); return before ? { messages: [oldest, newest], has_more: false } : { messages: [newest], has_more: true, next_cursor: { id: other, created_at: newest.created_at } }; }
  };
  const result = await sync({ ...scope, source: data, invoke: f.invoke });
  assert.equal(result.count, 1); assert.equal(calls.length, 2); assert.ok(result.lastCompleteSync);
  const text = fs.readFileSync(path.join(f.directory, 'conversas', sessionId + '.md'), 'utf8');
  assert.ok(text.indexOf('Primeira decisão') < text.indexOf('Última decisão'));
  assert.equal(text.split('Última decisão').length, 2); assert.match(text, /proposta.pdf/); assert.doesNotMatch(text, /never-store/); assert.match(text, /archived/);
  assert.match(fs.readFileSync(path.join(f.directory, 'INDEX.md'), 'utf8'), /Projeto São João/);
});

test('unchanged sync preserves file timestamp; old edits are detected without session timestamp changes', async t => {
  const f = fixture(t), filename = path.join(f.directory, 'conversas', sessionId + '.md');
  await sync({ ...scope, source: source([message(other, 'Antes')]), invoke: f.invoke });
  fs.utimesSync(filename, 1000, 1000);
  await sync({ ...scope, source: source([message(other, 'Antes')]), invoke: f.invoke });
  assert.equal(fs.statSync(filename).mtimeMs, 1000000);
  await sync({ ...scope, source: source([message(other, 'Depois')]), invoke: f.invoke });
  assert.match(fs.readFileSync(filename, 'utf8'), /Depois/);
});

test('pagination failure preserves last complete conversation and last successful timestamp', async t => {
  const f = fixture(t);
  const first = await sync({ ...scope, source: source([message(other, 'Original')]), invoke: f.invoke });
  let requests = 0;
  await assert.rejects(sync({ ...scope, invoke: f.invoke, source: {
    sessions: async () => [session], messages: async () => { if (++requests === 2) throw Error('Offline'); return { messages: [message(other, 'Incompleto')], has_more: true, next_cursor: { id: other, created_at: '2026-11-03T12:00:00Z' } }; }
  } }), /Offline/);
  assert.match(fs.readFileSync(path.join(f.directory, 'conversas', sessionId + '.md'), 'utf8'), /Original/);
  const status = f.memory.status(scope); assert.equal(status.lastCompleteSync, first.lastCompleteSync); assert.ok(status.error); assert.equal(status.busy, false);
});

test('a failed initial listing records the failed attempt on disk for agents', async t => {
  const f = fixture(t);
  await sync({ ...scope, source: source([message(other, 'Preservado')]), invoke: f.invoke });
  const previous = f.memory.status(scope).lastCompleteSync;
  await assert.rejects(sync({ ...scope, source: { sessions: async () => { throw Error('Offline'); } }, invoke: f.invoke }), /Offline/);
  const status = f.memory.status(scope);
  assert.ok(status.error); assert.equal(status.lastCompleteSync, previous); assert.equal(status.busy, false);
});

test('malformed pages, repeated cursors and foreign messages fail without claiming completeness', async t => {
  const f = fixture(t);
  for (const data of [
    { messages: [], has_more: true },
    { messages: [message(other, 'Repeat')], has_more: true, next_cursor: { id: other, created_at: '2026-11-03T12:00:00Z' } },
    { messages: [{ ...message(other, 'Foreign'), chat_session_id: other }], has_more: false },
    { messages: [message('../escape', 'Invalid')], has_more: false }
  ]) await assert.rejects(sync({ ...scope, invoke: f.invoke, source: { sessions: async () => [session], messages: async () => data } }));
  assert.equal(f.memory.status(scope).lastCompleteSync, null);
});

test('disappeared chats remain marked historical and malformed listing never clears inventory', async t => {
  const f = fixture(t);
  await sync({ ...scope, source: source([message(other, 'Histórico')]), invoke: f.invoke });
  await sync({ ...scope, source: { sessions: async () => [], messages: async () => assert.fail() }, invoke: f.invoke });
  assert.match(fs.readFileSync(path.join(f.directory, 'INDEX.md'), 'utf8'), /ausente da última listagem/);
  await assert.rejects(sync({ ...scope, source: { sessions: async () => ({}) }, invoke: f.invoke }), /validação/);
  assert.equal(f.memory.status(scope).count, 1);
});

test('account switching and disabling cancel in-flight sync; single flight and traversal guards', async t => {
  const f = fixture(t); let active = true;
  await assert.rejects(sync({ ...scope, invoke: f.invoke, active: () => active, source: { sessions: async () => [session], messages: async () => { active = false; return { messages: [message(other, 'private')], has_more: false }; } } }), /interrompida/);
  assert.equal(f.memory.status(scope).busy, false);
  const { token } = f.memory.begin(scope);
  assert.throws(() => f.memory.begin(scope), /andamento/);
  assert.throws(() => f.memory.startChat({ ...scope, token, session: { ...session, creator_id: other } }), /pertence/);
  assert.throws(() => f.memory.status({ ...scope, workspaceId: '../escape' }), /inválido/);
  f.memory.configure({ ...scope, enabled: false });
  assert.throws(() => f.memory.finish({ ...scope, token }), /cancelada/);
  assert.throws(() => createMemory({ root: f.root, taskContext: () => true }).status(scope), /humana/);
});

test('symlink/junction target is refused', t => {
  const f = fixture(t), target = path.join(f.root, 'other'), link = path.join(f.root, other);
  fs.mkdirSync(target);
  fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => f.memory.status({ ...scope, ownerId: other }), /junções/);
});

test('IPC rejects child frames and foreign top-level origins', async t => {
  const f = fixture(t), handlers = new Map();
  const electron = { ipcMain: { handle: (key, handler) => handlers.set(key, handler) }, shell: { openPath: async () => '' } };
  register(path.join(f.root, 'index.html'), { root: f.root, electron });
  const foreign = { url: 'https://example.invalid/' }; foreign.top = foreign;
  assert.equal((await handlers.get('multica-memory:status')({ senderFrame: foreign }, scope)).ok, false);
  assert.equal((await handlers.get('multica-memory:status')({ senderFrame: { url: 'file:///index.html', top: foreign } }, scope)).ok, false);
});

function writeArchive(filename, files) {
  const header = { files: {} }, buffers = []; let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    let node = header; const parts = name.split('/'), buffer = Buffer.from(text);
    for (const part of parts.slice(0, -1)) node = node.files[part] ||= { files: {} };
    node.files[parts.at(-1)] = { offset: String(offset), size: buffer.length }; offset += buffer.length; buffers.push(buffer);
  }
  fs.writeFileSync(filename, Buffer.concat([encodeHeader(header), ...buffers]));
}
test('additive installer preserves custom code, validates generated syntax, detects concurrent changes and restores exact backup', t => {
  const f = fixture(t), app = path.join(f.root, 'app'), resources = path.join(app, 'resources'); fs.mkdirSync(resources, { recursive: true });
  const archive = path.join(resources, 'app.asar'), executable = path.join(app, 'Multica.exe');
  fs.writeFileSync(executable, Buffer.concat([Buffer.from('FAKE\0dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'), Buffer.from([1,9,49,48,49,49,48,48,48,49,49])]));
  const bundle = 'function WorkspaceRouteLayout(){}\nfunction workspaceHeader(){}\nvar ChatSessionSchema={};\nvar client={async listChatMessagesPage(){}};\nvar customTheme="preserved";\nvar appRoutes = [{element: jsx(WorkspaceRouteLayout, {})}];';
  writeArchive(archive, { 'package.json': '{"version":"0.7.2"}', 'out/main/index.js': 'let electron = require("electron");\nvar customPlugins=1;', 'out/renderer/index.html': '<script src="./assets/index.js"></script>', 'out/renderer/assets/index.js': bundle, 'custom.txt': 'keep-me' });
  const original = fs.readFileSync(archive), originalHash = digest(original);
  engine.KNOWN.add(originalHash); t.after(() => engine.KNOWN.delete(originalHash));
  const request = { archive, executable, root: path.join(f.root, 'addon'), sourceRoot: path.resolve(__dirname, '..') };
  const prepared = engine.prepare(request);
  assert.ok(fs.readFileSync(archive).equals(original));
  fs.appendFileSync(archive, 'concurrent');
  assert.throws(() => engine.apply(prepared), /mudou/);
  fs.writeFileSync(archive, original);
  engine.apply(prepared);
  const patched = openArchive(archive);
  assert.equal(patched.read('custom.txt').toString(), 'keep-me');
  assert.match(patched.read('out/renderer/assets/index.js').toString(), /customTheme="preserved"/);
  assert.throws(() => createMemoryPatch(patched, request.sourceRoot), /já está instalada/);
  assert.equal(engine.inspect(request).alreadyInstalled, true);
  engine.restore(request);
  assert.ok(fs.readFileSync(archive).equals(original));
});
