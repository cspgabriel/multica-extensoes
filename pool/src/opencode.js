// OpenCode: credenciais de provedores (opencode.db) e contas do plugin Antigravity (antigravity-accounts.json).
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');

const HOME = os.homedir();
const DATA_DIR = path.join(HOME, '.local', 'share', 'opencode');
const CONFIG_DIR = path.join(HOME, '.config', 'opencode');
const DB_PATH = path.join(DATA_DIR, 'opencode.db');
const AGY_ACCOUNTS = path.join(CONFIG_DIR, 'antigravity-accounts.json');
const TIMEOUT_MS = 60_000;
const DAY_MS = 86_400_000;

const ID_RE = /^[A-Za-z0-9._-]{1,80}$/;

function assertId(value, what) {
  const s = String(value ?? '');
  if (!ID_RE.test(s)) throw new Error(`${what} inválido: ${s}`);
  return s;
}

function openDb() {
  const { DatabaseSync } = require('node:sqlite');
  return new DatabaseSync(DB_PATH, { readOnly: true });
}

function formatTokens(n) {
  if (!n) return '0';
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n);
}

// Uso por provedor nas últimas 24h e 7d, somado das sessões (não há limite conhecido: só informativo).
function usageByProvider(db) {
  const query = db.prepare(
    "SELECT json_extract(model, '$.providerID') AS provider, SUM(tokens_input + tokens_output) AS tokens, SUM(cost) AS cost " +
      'FROM session WHERE time_updated > ? GROUP BY provider',
  );
  const usage = {};
  for (const [label, ms] of [['24h', DAY_MS], ['7d', 7 * DAY_MS]]) {
    for (const row of query.all(Date.now() - ms)) {
      const key = String(row.provider || '').toLowerCase();
      usage[key] = usage[key] || {};
      usage[key][label] = { tokens: row.tokens || 0, cost: row.cost || 0 };
    }
  }
  return usage;
}

function infoWindows(u) {
  return ['24h', '7d'].map((label) => {
    const w = u?.[label] || { tokens: 0, cost: 0 };
    const cost = w.cost ? ` · US$ ${w.cost.toFixed(2)}` : '';
    return { label: `${label}: ${formatTokens(w.tokens)} tokens${cost}`, pct: null, resetsAt: null };
  });
}

function readAgyAccounts() {
  if (!fs.existsSync(AGY_ACCOUNTS)) return null;
  return JSON.parse(fs.readFileSync(AGY_ACCOUNTS, 'utf8'));
}

function writeAgyAccounts(data) {
  // Escrita atômica: grava ao lado e renomeia, para o plugin nunca ler um JSON pela metade.
  const tmp = `${AGY_ACCOUNTS}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, AGY_ACCOUNTS);
}

function agyCards(data, usage) {
  const now = Date.now();
  return (data?.accounts || []).map((a, idx) => {
    const blocked = Object.entries(a.rateLimitResetTimes || {}).filter(([, t]) => Number(t) > now);
    return {
      kind: 'agy',
      ref: String(idx),
      email: a.email,
      alias: 'plugin Antigravity',
      plan: 'Google (Antigravity)',
      active: idx === data.activeIndex,
      disabled: a.enabled === false,
      status: blocked.length ? 'error' : 'ok',
      error: blocked.length ? `Rate limit em ${blocked.map(([f]) => f).join(', ')} até ${new Date(Math.max(...blocked.map(([, t]) => Number(t)))).toLocaleString('pt-BR')}` : null,
      lastUsedAt: a.lastUsed ? new Date(a.lastUsed).toISOString() : null,
      windows: infoWindows(usage.google),
    };
  });
}

async function list() {
  const accounts = [];
  let usage = {};
  if (fs.existsSync(DB_PATH)) {
    const db = openDb();
    try {
      usage = usageByProvider(db);
      for (const c of db.prepare('SELECT id, integration_id, label, active FROM credential ORDER BY time_created').all()) {
        accounts.push({
          kind: 'credential',
          ref: c.id,
          provider: c.integration_id,
          email: `${c.integration_id} · ${c.label || 'credencial'}`,
          alias: null,
          plan: 'Provedor',
          active: c.active !== 0,
          disabled: false,
          status: 'ok',
          error: null,
          windows: infoWindows(usage[String(c.integration_id).toLowerCase()]),
        });
      }
    } finally {
      db.close();
    }
  }
  accounts.push(...agyCards(readAgyAccounts(), usage));
  // Modelos gratuitos do próprio OpenCode (provedor "opencode") não têm credencial, mas mostram uso.
  if (usage.opencode) {
    accounts.push({
      kind: 'builtin', ref: 'opencode', email: 'opencode · modelos gratuitos (Zen)', alias: null, plan: 'Grátis',
      active: false, disabled: false, status: 'ok', error: null, windows: infoWindows(usage.opencode),
    });
  }
  return { accounts: accounts.map((a, i) => ({ ...a, number: i + 1 })) };
}

function updateAgy(ref, mutate) {
  const data = readAgyAccounts();
  const idx = Number(assertId(ref, 'Conta'));
  if (!data?.accounts?.[idx]) throw new Error(`Conta do plugin Antigravity não encontrada: ${ref}`);
  mutate(data, idx);
  writeAgyAccounts(data);
  return { email: data.accounts[idx].email };
}

function opencodeCli(args) {
  // O opencode é um shim npm (.cmd): roda via cmd com argumentos já validados.
  return new Promise((resolve, reject) => {
    execFile('cmd.exe', ['/d', '/c', 'opencode', ...args], { timeout: TIMEOUT_MS, windowsHide: true, env: { ...process.env, NO_COLOR: '1' } }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || stdout || err.message).toString().trim().split('\n').slice(-3).join(' ')));
      else resolve(stdout.toString());
    });
  });
}

module.exports = {
  dirs: { data: DATA_DIR, config: CONFIG_DIR },
  list,
  agyUse: (ref) => updateAgy(ref, (data, idx) => {
    data.activeIndex = idx;
    data.activeIndexByFamily = Object.fromEntries(Object.keys(data.activeIndexByFamily || { claude: 0, gemini: 0 }).map((k) => [k, idx]));
  }),
  agyToggle: (ref) => updateAgy(ref, (data, idx) => { data.accounts[idx].enabled = data.accounts[idx].enabled === false; }),
  agyClearLimits: (ref) => updateAgy(ref, (data, idx) => { data.accounts[idx].rateLimitResetTimes = {}; }),
  logout: (provider, credentialId) => opencodeCli(['auth', 'logout', assertId(provider, 'Provedor'), assertId(credentialId, 'Credencial')]),
};
