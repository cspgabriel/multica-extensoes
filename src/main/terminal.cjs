'use strict';
// Terminal do chat (patch "chat-workbench"): PTYs do node-pty no processo
// main, expostos ao renderer principal por IPC "mc-terminal:*". A saida vai
// por webContents.send em lotes curtos para nao inundar o IPC.
// node-pty 1.1.0 e N-API, entao o prebuilt win32-x64 roda no Electron 44
// sem rebuild. Dependencia em vendor/terminal (fora do app.asar).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const PTY_MODULE = path.join(__dirname, '../../vendor/terminal/node_modules/node-pty');
const FLUSH_MS = 16;
const MAX_TERMINALS = 8;
// Backslash paths: cmd.exe parses its own argv[0], and "C:/Windows/..." made
// it read "/W..." as a switch and exit immediately.
const SHELLS = [
  { id: 'pwsh', label: 'PowerShell 7', file: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', args: ['-NoLogo'] },
  { id: 'powershell', label: 'Windows PowerShell', file: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', args: ['-NoLogo'] },
  { id: 'cmd', label: 'Prompt de Comando', file: 'C:\\Windows\\System32\\cmd.exe', args: [] },
  { id: 'bash', label: 'Git Bash', file: 'C:\\Program Files\\Git\\bin\\bash.exe', args: ['--login', '-i'] },
];
const MAX_DIR_ENTRIES = 400;

let pty = null;
const loadPty = () => (pty ??= require(PTY_MODULE));
const availableShells = () => SHELLS.filter((s) => fs.existsSync(s.file));
const clampSize = (value, min, max, fallback) => Math.max(min, Math.min(max, Number(value) || fallback));

function shellEnv() {
  const env = { ...process.env, TERM_PROGRAM: 'multica', COLORTERM: 'truecolor' };
  for (const key of Object.keys(env)) if (/^ELECTRON_/.test(key)) delete env[key];
  return env;
}

function resolveCwd(cwd) {
  const candidate = typeof cwd === 'string' ? cwd.trim() : '';
  if (candidate && path.isAbsolute(candidate)) {
    try { if (fs.statSync(candidate).isDirectory()) return candidate; } catch {}
  }
  return os.homedir();
}

function register(rendererEntry, electron = require('electron')) {
  const expected = path.resolve(rendererEntry).toLowerCase();
  const terminals = new Map();
  const watchedSenders = new Set();
  let nextId = 1;

  const authorized = (event) => {
    const frame = event.senderFrame;
    if (!frame || frame !== frame.top || !String(frame.url).startsWith('file:')) return false;
    return path.resolve(fileURLToPath(frame.url)).toLowerCase() === expected;
  };
  const own = (event, id) => {
    const term = terminals.get(Number(id));
    if (!term || term.ownerId !== event.sender.id) throw new Error('Terminal inexistente.');
    return term;
  };
  const dispose = (id) => {
    const term = terminals.get(id);
    if (!term) return;
    terminals.delete(id);
    clearTimeout(term.timer);
    try { term.proc.kill(); } catch {}
  };
  const watchSender = (sender) => {
    if (watchedSenders.has(sender.id)) return;
    watchedSenders.add(sender.id);
    const senderId = sender.id;
    sender.once('destroyed', () => {
      watchedSenders.delete(senderId);
      for (const [id, term] of terminals) if (term.ownerId === senderId) dispose(id);
    });
  };

  const handlers = {
    shells: () => ({ shells: availableShells().map(({ id, label }) => ({ id, label })), home: os.homedir() }),
    spawn: (event, input) => {
      const owned = [...terminals.values()].filter((t) => t.ownerId === event.sender.id).length;
      if (owned >= MAX_TERMINALS) throw new Error(`Limite de ${MAX_TERMINALS} terminais abertos.`);
      const shells = availableShells();
      const shell = shells.find((s) => s.id === input.shell) ?? shells[0];
      if (!shell) throw new Error('Nenhum shell encontrado neste PC.');
      const cwd = resolveCwd(input.cwd);
      const proc = loadPty().spawn(shell.file, shell.args, {
        name: 'xterm-256color',
        cols: clampSize(input.cols, 20, 500, 100),
        rows: clampSize(input.rows, 5, 200, 24),
        cwd,
        env: shellEnv(),
        useConpty: true,
      });
      const id = nextId++;
      const sender = event.sender;
      const term = { proc, ownerId: sender.id, buffer: '', timer: null };
      terminals.set(id, term);
      watchSender(sender);
      proc.onData((data) => {
        term.buffer += data;
        term.timer ??= setTimeout(() => {
          term.timer = null;
          const chunk = term.buffer;
          term.buffer = '';
          if (!sender.isDestroyed()) sender.send('mc-terminal:data', { id, data: chunk });
        }, FLUSH_MS);
      });
      proc.onExit(({ exitCode }) => {
        clearTimeout(term.timer);
        if (!sender.isDestroyed()) {
          if (term.buffer) sender.send('mc-terminal:data', { id, data: term.buffer });
          sender.send('mc-terminal:exit', { id, exitCode });
        }
        terminals.delete(id);
      });
      return { id, pid: proc.pid, cwd, shell: shell.id, shellLabel: shell.label };
    },
    write: (event, input) => { own(event, input.id).proc.write(String(input.data ?? '')); return true; },
    resize: (event, input) => {
      own(event, input.id).proc.resize(clampSize(input.cols, 20, 500, 100), clampSize(input.rows, 5, 200, 24));
      return true;
    },
    kill: (event, input) => { own(event, input.id); dispose(Number(input.id)); return true; },
    openPath: async (event, input) => {
      const target = typeof input.path === 'string' ? input.path.trim() : '';
      if (!target || !path.isAbsolute(target) || !fs.existsSync(target)) throw new Error('Caminho inexistente neste PC.');
      const error = await electron.shell.openPath(target);
      if (error) throw new Error(error);
      return true;
    },
    listDir: (event, input) => {
      const target = typeof input.path === 'string' ? input.path.trim() : '';
      if (!target || !path.isAbsolute(target)) throw new Error('Pasta inválida.');
      const entries = fs.readdirSync(target, { withFileTypes: true })
        .filter((e) => e.isDirectory() || e.isFile())
        .map((e) => ({ name: e.name, dir: e.isDirectory() }))
        .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
      return { path: path.resolve(target), parent: path.dirname(path.resolve(target)), entries: entries.slice(0, MAX_DIR_ENTRIES), truncated: entries.length > MAX_DIR_ENTRIES };
    },
    exists: (event, input) => {
      const target = typeof input.path === 'string' ? input.path.trim() : '';
      return !!target && path.isAbsolute(target) && fs.existsSync(target);
    },
  };

  for (const [channel, handler] of Object.entries(handlers)) {
    electron.ipcMain.handle('mc-terminal:' + channel, async (event, input = {}) => {
      try {
        if (!authorized(event)) return { ok: false, error: 'Origem não autorizada.' };
        return { ok: true, data: await handler(event, input ?? {}) };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    });
  }
  electron.app?.on('before-quit', () => { for (const id of [...terminals.keys()]) dispose(id); });
  return { terminals };
}

module.exports = { register, availableShells };
