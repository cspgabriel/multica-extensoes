// Hermes Agent: credenciais em pool por provedor (`hermes auth ...`).
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');

const HOME = os.homedir();
const HERMES = path.join(HOME, 'AppData', 'Local', 'hermes', 'bin', 'hermes.exe');
const HERMES_DIR = path.join(HOME, '.hermes');
const TIMEOUT_MS = 90_000;

// Provedor e alvo vêm do próprio `hermes auth list`; ainda assim só aceitamos caracteres seguros.
const PROVIDER_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const TARGET_RE = /^[A-Za-z0-9._-]{1,64}$/;

// "  #1  LABEL  api_key id=fd2ab3 priority=0 env:X rate-limited (429) (47m 38s left) ←"
const ENTRY_RE = /^\s+#(\d+)\s+(.+?)\s+(api_key|oauth)\s+id=(\S+)\s+priority=(\d+)\s*(.*?)\s*(←)?\s*$/;
const PROVIDER_LINE_RE = /^(\S+) \((\d+) credentials?\):\s*$/;
const STATUS_RE = /(rate-limited|exhausted|cooldown|expired|invalid|revoked|error).*$/i;

function hermes(args) {
  return new Promise((resolve, reject) => {
    execFile(HERMES, args, { timeout: TIMEOUT_MS, windowsHide: true, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, NO_COLOR: '1', PYTHONIOENCODING: 'utf-8' } }, (err, stdout, stderr) => {
      if (err) {
        const detail = (stderr || stdout || err.message).toString().trim().split('\n').slice(-3).join(' ');
        reject(new Error(detail || err.message));
        return;
      }
      resolve(stdout.toString());
    });
  });
}

function parseAuthList(text) {
  const accounts = [];
  let provider = null;
  for (const line of text.split(/\r?\n/)) {
    const head = line.match(PROVIDER_LINE_RE);
    if (head) { provider = head[1]; continue; }
    const m = provider && line.match(ENTRY_RE);
    if (!m) continue;
    const [, index, label, type, id, priority, rest, current] = m;
    const statusMatch = rest.match(STATUS_RE);
    const source = (statusMatch ? rest.slice(0, statusMatch.index) : rest).trim();
    accounts.push({
      number: accounts.length + 1,
      provider,
      index: Number(index),
      id,
      email: `${provider} · ${label}`,
      alias: source || null,
      plan: type === 'oauth' ? 'OAuth' : 'API key',
      type,
      priority: Number(priority),
      active: Boolean(current),
      disabled: false,
      status: statusMatch ? 'error' : 'ok',
      error: statusMatch ? statusMatch[0] : null,
      windows: [],
      info: `prioridade ${priority}`,
    });
  }
  return accounts;
}

function assertProvider(value) {
  const s = String(value ?? '');
  if (!PROVIDER_RE.test(s)) throw new Error(`Provedor inválido: ${s}`);
  return s;
}

function assertTarget(value) {
  const s = String(value ?? '');
  if (!TARGET_RE.test(s)) throw new Error(`Credencial inválida: ${s}`);
  return s;
}

module.exports = {
  dir: HERMES_DIR,
  list: async () => ({ accounts: parseAuthList(await hermes(['auth', 'list'])) }),
  // Prioridade 0 = tentada primeiro: é o "usar esta" do Hermes.
  prefer: (provider, id) => hermes(['auth', 'priority', assertProvider(provider), assertTarget(id), '0']),
  reset: (provider, id) => hermes(['auth', 'reset', assertProvider(provider), ...(id ? [assertTarget(id)] : [])]),
  refresh: (provider, id) => hermes(['auth', 'refresh', assertProvider(provider), assertTarget(id)]),
  remove: (provider, id) => hermes(['auth', 'remove', assertProvider(provider), assertTarget(id)]),
  status: () => hermes(['status']),
  _parseAuthList: parseAuthList,
};
