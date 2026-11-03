'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { openArchive, repack, readFuses, digest } = require('../lib/asar.cjs');
const { createMemoryPatch } = require('../lib/memory-patch.cjs');
const KNOWN = new Set([
  '024ea5d9e22d04f41663171d1ba6edef60fe1631c3a0b32d828473de28b38f37',
  // Existing personalized Desktop inspected for this additive release (themes, plugins, performance fixes).
  'ed5ab72c67fe51b906799c7fae1f6af59f7d9c54e17c944f9418f881eeb85309'
]);
const hash = filename => digest(fs.readFileSync(filename));
const json = filename => JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
function paths(request) {
  const archive = path.resolve(request.archive), root = path.resolve(request.root), executable = path.resolve(request.executable);
  if (path.basename(executable).toLowerCase() !== 'multica.exe' || archive !== path.join(path.dirname(executable), 'resources', 'app.asar')) throw Error('Instalação Multica inválida.');
  const relative = path.relative(root, archive);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) throw Error('A pasta de memória deve ser separada do aplicativo.');
  return { archive, root, executable };
}
function inspect(request) {
  const p = paths(request), fuses = readFuses(p.executable);
  if (!fuses.integrityKnown || fuses.embeddedAsarIntegrityValidation) throw Error('Build com integridade ASAR embutida não é suportado.');
  const current = openArchive(p.archive), previous = fs.existsSync(path.join(p.root, 'installation.json')) ? json(path.join(p.root, 'installation.json')) : null;
  if (previous?.installedSha256 === current.sha256 && previous.archive === p.archive) return { ...p, alreadyInstalled: true };
  if (previous) throw Error('O aplicativo mudou após a instalação de memória. Preserve as personalizações e prepare uma versão compatível antes de reinstalar.');
  if (!KNOWN.has(current.sha256)) throw Error('Build não verificado. Nenhum arquivo foi alterado.');
  return { ...p, alreadyInstalled: false, beforeSha256: current.sha256 };
}
function prepare(request) {
  const p = inspect(request);
  if (p.alreadyInstalled) return p;
  const sourceRoot = path.resolve(request.sourceRoot);
  const transactionRoot = path.join(p.root, 'prepared', crypto.randomUUID());
  fs.mkdirSync(transactionRoot, { recursive: true });
  const original = openArchive(p.archive);
  const patched = createMemoryPatch(original, sourceRoot);
  const check = path.join(transactionRoot, 'renderer.mjs');
  fs.writeFileSync(check, patched.bundle);
  const result = spawnSync(process.execPath, ['--check', check], { encoding: 'utf8', windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  if (result.status !== 0) throw Error('O renderer gerado contém sintaxe inválida.');
  const next = path.join(transactionRoot, 'app.asar');
  repack(original, next, patched.replacements);
  const transaction = { ...p, next, sourceRoot, installedSha256: hash(next), backup: path.join(transactionRoot, 'before.asar'), at: new Date().toISOString() };
  fs.copyFileSync(p.archive, transaction.backup, fs.constants.COPYFILE_EXCL);
  const filename = path.join(transactionRoot, 'transaction.json');
  fs.writeFileSync(filename, JSON.stringify(transaction, null, 2));
  return { transaction: filename, beforeSha256: p.beforeSha256, installedSha256: transaction.installedSha256 };
}
function swap(source, archive) {
  const next = archive + '.' + crypto.randomUUID() + '.memory-next';
  const previous = archive + '.' + crypto.randomUUID() + '.memory-old';
  fs.copyFileSync(source, next, fs.constants.COPYFILE_EXCL);
  try {
    fs.renameSync(archive, previous);
    try { fs.renameSync(next, archive); }
    catch (error) { fs.renameSync(previous, archive); throw error; }
    fs.unlinkSync(previous);
  } finally { if (fs.existsSync(next)) fs.unlinkSync(next); }
}
function apply(request) {
  const t = json(request.transaction); paths(t);
  if (hash(t.archive) !== t.beforeSha256 || hash(t.backup) !== t.beforeSha256 || hash(t.next) !== t.installedSha256) throw Error('O aplicativo ou o pacote mudou após a preparação.');
  swap(t.next, t.archive);
  try { fs.writeFileSync(path.join(t.root, 'installation.json'), JSON.stringify(t, null, 2), { flag: 'wx' }); }
  catch (error) { swap(t.backup, t.archive); throw error; }
  return { installed: true };
}
function restore(request) {
  const t = json(path.join(path.resolve(request.root), 'installation.json')); paths(t);
  if (hash(t.archive) !== t.installedSha256 || hash(t.backup) !== t.beforeSha256) throw Error('O aplicativo mudou. A restauração foi recusada para preservar as alterações posteriores.');
  swap(t.backup, t.archive);
  fs.renameSync(path.join(t.root, 'installation.json'), path.join(t.root, 'restored-' + Date.now() + '.json'));
  return { restored: true, copiesPreserved: true };
}
if (require.main === module) {
  try {
    const request = json(process.argv[process.argv.indexOf('--request') + 1]);
    if ((process.env.MULTICA_TASK_ID || process.env.MULTICA_TASK_CONFIG_ROOT) && !['inspect', 'prepare'].includes(request.operation)) throw Error('Execute o instalador manualmente na sessão do Windows.');
    const operation = { inspect, prepare, apply, restore }[request.operation];
    if (!operation) throw Error('Operação inválida.');
    console.log(JSON.stringify({ ok: true, data: operation(request) }));
  } catch (error) { console.log(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1; }
}
module.exports = { inspect, prepare, apply, restore, KNOWN };
