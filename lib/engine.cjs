'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { openArchive, repack, readFuses, digest } = require('./asar.cjs');
const { createPatches } = require('./patch.cjs');
const compatibility = require('../compatibility.json');

function json(filename) { return JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, '')); }
function hash(filename) { return digest(fs.readFileSync(filename)); }
function atomicJson(filename, value) {
  const temporary = filename + '.' + crypto.randomUUID() + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { flag: 'wx' });
  try { fs.renameSync(temporary, filename); } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function within(directory, filename) {
  const relative = path.relative(path.resolve(directory), path.resolve(filename));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
function validatePaths(request) {
  const root = path.resolve(request.root);
  const archive = path.resolve(request.archive);
  const executable = path.resolve(request.executable);
  if (path.basename(archive).toLowerCase() !== 'app.asar' || path.basename(executable).toLowerCase() !== 'multica.exe' || path.dirname(archive) !== path.join(path.dirname(executable), 'resources')) throw new Error('O pacote deve pertencer à pasta resources do Multica.exe selecionado.');
  if (root === path.parse(root).root || within(path.dirname(executable), root) || within(root, executable)) throw new Error('A pasta das extensões precisa ser separada da instalação do Multica.');
  return { root, archive, executable };
}
function inspect(request) {
  const paths = validatePaths(request);
  const fuses = readFuses(paths.executable);
  if (!fuses.integrityKnown || fuses.embeddedAsarIntegrityValidation) throw new Error('Este build exige integridade embutida do ASAR. A instalação foi recusada; nenhuma proteção será desativada.');
  const current = openArchive(paths.archive);
  const pkg = JSON.parse(current.read('package.json'));
  if (pkg.version !== compatibility.multicaVersion || pkg.name !== '@multica/desktop') throw new Error(`Versão não suportada: ${pkg.version || 'desconhecida'}. Esta versão da extensão suporta Multica ${compatibility.multicaVersion} Windows x64.`);
  const statePath = path.join(paths.root, 'installation.json');
  const previous = fs.existsSync(statePath) ? json(statePath) : null;
  let baseline = paths.archive;
  if (previous && current.sha256 === previous.installedSha256) {
    if (previous.archive !== paths.archive || !within(path.join(paths.root, 'backups'), previous.backup)) throw new Error('O backup registrado não corresponde a esta instalação.');
    baseline = previous.backup;
  }
  const baselineHash = hash(baseline);
  if (!compatibility.originalArchiveSha256.includes(baselineHash)) throw new Error('Build desconhecido ou pacote alterado por outra ferramenta. Nenhum arquivo do Multica foi modificado.');
  return { ...paths, multicaVersion: pkg.version, currentSha256: current.sha256, baseline, baselineHash, previous, fuses, alreadyInstalled: previous?.version === compatibility.extensionVersion && previous?.installedSha256 === current.sha256 };
}
function prepare(request) {
  const info = inspect(request);
  if (info.alreadyInstalled && !request.reinstall) return { alreadyInstalled: true, version: compatibility.extensionVersion };
  const sourceRoot = path.resolve(request.sourceRoot);
  if (!within(info.root, sourceRoot)) throw new Error('Os fontes instalados devem estar dentro da pasta de extensões.');
  if (!/^[a-zA-Z0-9._-]+$/.test(request.profile || '')) throw new Error('Perfil Multica inválido.');
  const backupRoot = path.join(info.root, 'backups');
  fs.mkdirSync(backupRoot, { recursive: true });
  const backup = path.join(backupRoot, info.baselineHash + '.asar');
  if (!fs.existsSync(backup)) fs.copyFileSync(info.baseline, backup, fs.constants.COPYFILE_EXCL);
  if (hash(backup) !== info.baselineHash) throw new Error('O backup não passou na verificação.');
  const original = openArchive(backup);
  const { replacements, bundle } = createPatches(original, sourceRoot, info.root, request.profile);
  const transactionDirectory = path.join(info.root, 'transactions', crypto.randomUUID());
  fs.mkdirSync(transactionDirectory, { recursive: true });
  const checkPath = path.join(transactionDirectory, 'renderer-check.mjs');
  fs.writeFileSync(checkPath, bundle);
  const syntax = spawnSync(process.execPath, ['--check', checkPath], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 45000, encoding: 'utf8' });
  if (syntax.status !== 0) throw new Error('O código gerado não passou na validação de sintaxe. O Multica foi preservado.');
  const next = info.archive + '.extensoes-' + crypto.randomUUID() + '.next';
  let output;
  try { output = repack(original, next, replacements); }
  catch (error) { if (fs.existsSync(next)) fs.unlinkSync(next); throw error; }
  const transaction = { version: compatibility.extensionVersion, root: info.root, archive: info.archive, executable: info.executable, backup, originalSha256: info.baselineHash, beforeSha256: info.currentSha256, installedSha256: output.sha256, next, sourceRoot, profile: request.profile, createdAt: new Date().toISOString() };
  const filename = path.join(transactionDirectory, 'transaction.json');
  atomicJson(filename, transaction);
  return { transaction: filename, originalSha256: info.baselineHash, installedSha256: output.sha256, filesPatched: replacements.size };
}
function replaceArchive(next, target) {
  const previous = target + '.extensoes-swap-' + crypto.randomUUID();
  const existed = fs.existsSync(target);
  if (existed) fs.renameSync(target, previous);
  try { fs.renameSync(next, target); }
  catch (error) { if (existed) fs.renameSync(previous, target); throw error; }
  return { previous: existed ? previous : null };
}
function apply(request) {
  const transaction = json(request.transaction);
  const { root, archive, executable } = validatePaths(transaction);
  if (!within(path.join(root, 'transactions'), request.transaction) || !within(path.join(root, 'backups'), transaction.backup)) throw new Error('Transação fora da instalação.');
  if (hash(archive) !== transaction.beforeSha256 || hash(transaction.next) !== transaction.installedSha256 || hash(transaction.backup) !== transaction.originalSha256 || !compatibility.originalArchiveSha256.includes(transaction.originalSha256)) throw new Error('Um arquivo mudou depois da preparação. Instalação cancelada.');
  if (path.dirname(transaction.next) !== path.dirname(archive) || !path.basename(transaction.next).startsWith('app.asar.extensoes-')) throw new Error('Pacote temporário fora do local permitido.');
  const statePath = path.join(root, 'installation.json');
  const oldState = fs.existsSync(statePath) ? fs.readFileSync(statePath) : null;
  const swapped = replaceArchive(transaction.next, archive);
  try {
    if (hash(archive) !== transaction.installedSha256) throw new Error('O pacote instalado não passou na verificação.');
    atomicJson(statePath, { ...transaction, next: undefined, executable, installedAt: new Date().toISOString() });
  } catch (error) {
    fs.renameSync(archive, transaction.next);
    if (swapped.previous) fs.renameSync(swapped.previous, archive);
    if (oldState) fs.writeFileSync(statePath, oldState);
    throw error;
  }
  if (swapped.previous) fs.unlinkSync(swapped.previous);
  return { installed: true, version: transaction.version, root, executable, backup: transaction.backup };
}
function restorePlan(request) {
  const { root, archive, executable } = validatePaths(request);
  const statePath = path.join(root, 'installation.json');
  if (!fs.existsSync(statePath)) throw new Error('Nenhuma instalação registrada nesta pasta.');
  const state = json(statePath);
  if (state.archive !== archive || !within(path.join(root, 'backups'), state.backup) || !compatibility.originalArchiveSha256.includes(state.originalSha256) || hash(state.backup) !== state.originalSha256) throw new Error('Backup inválido; a desinstalação foi recusada.');
  if (fs.existsSync(archive) && hash(archive) !== state.installedSha256) throw new Error('O Multica foi atualizado ou modificado depois da instalação. O pacote atual foi preservado.');
  return { root, archive, executable, statePath, state };
}
function restore(request) {
  const { root, archive, executable, statePath, state } = restorePlan(request);
  const next = archive + '.extensoes-restore-' + crypto.randomUUID();
  fs.copyFileSync(state.backup, next, fs.constants.COPYFILE_EXCL);
  const swapped = replaceArchive(next, archive);
  try {
    if (hash(archive) !== state.originalSha256) throw new Error('A restauração não passou na verificação.');
    fs.renameSync(statePath, path.join(root, 'uninstalled-' + Date.now() + '.json'));
  } catch (error) {
    if (swapped.previous) { fs.renameSync(archive, next); fs.renameSync(swapped.previous, archive); }
    throw error;
  }
  if (swapped.previous) fs.unlinkSync(swapped.previous);
  return { restored: true, executable, dataPreserved: path.join(root, 'data') };
}
function discard(request) {
  const transaction = json(request.transaction);
  const { root, archive } = validatePaths(transaction);
  if (!within(path.join(root, 'transactions'), request.transaction) || path.dirname(transaction.next) !== path.dirname(archive) || !path.basename(transaction.next).startsWith('app.asar.extensoes-')) throw new Error('Transação temporária inválida.');
  if (fs.existsSync(transaction.next)) {
    if (hash(transaction.next) !== transaction.installedSha256) throw new Error('O temporário foi modificado e foi preservado.');
    fs.unlinkSync(transaction.next);
  }
  return { discarded: true };
}
function run(request) {
  if (request.operation === 'inspect') return inspect(request);
  if (request.operation === 'prepare') return prepare(request);
  if (request.operation === 'apply') return apply(request);
  if (request.operation === 'restore') return restore(request);
  if (request.operation === 'restore-plan') return restorePlan(request);
  if (request.operation === 'discard') return discard(request);
  throw new Error('Operação inválida.');
}
module.exports = { inspect, prepare, apply, restore, restorePlan, discard, run };
if (require.main === module) {
  try {
    const index = process.argv.indexOf('--request');
    if (index < 0 || !process.argv[index + 1]) throw new Error('Informe --request arquivo.json.');
    const result = run(json(process.argv[index + 1]));
    console.log(JSON.stringify({ ok: true, data: result }));
  } catch (error) { console.log(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1; }
}
