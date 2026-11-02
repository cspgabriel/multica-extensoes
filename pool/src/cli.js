// Wrappers dos CLIs cswap (Claude) e codex-auth (Codex) e das tarefas de failover.
const { execFile, spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const HOME = os.homedir();
const APPDATA = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
const CSWAP = path.join(HOME, '.local', 'bin', 'cswap.exe');
const CODEX_AUTH_JS = path.join(APPDATA, 'npm', 'node_modules', '@loongphy', 'codex-auth', 'bin', 'codex-auth.js');
const CSWAP_LOG = path.join(HOME, '.claude-swap-backup', 'claude-swap.log');
const CODEX_AUTO_DIR = path.join(HOME, '.codex-auth-auto');
const CODEX_LOG = path.join(CODEX_AUTO_DIR, 'codex-auth-auto.log');
const CODEX_CONFIG = path.join(CODEX_AUTO_DIR, 'config.json');
const CODEX_DEFAULT_THRESHOLD = 95;

const ANTIGRAVITY_AGENT_DB = path.join(HOME, '.antigravity-agent', 'cloud_accounts.db');
const ANTIGRAVITY_TOKEN_PATH = path.join(HOME, '.gemini', 'antigravity-cli', 'antigravity-oauth-token');
const GEMINI_DIR = path.join(HOME, '.gemini');
const ANTIGRAVITY_AUTO_DIR = path.join(HOME, '.antigravity-auto');
const ANTIGRAVITY_LOG = path.join(ANTIGRAVITY_AUTO_DIR, 'antigravity-auto.log');
const ANTIGRAVITY_CONFIG = path.join(ANTIGRAVITY_AUTO_DIR, 'config.json');
const ANTIGRAVITY_DEFAULT_THRESHOLD = 95;

const COPILOT_DATA_DB = path.join(HOME, '.copilot', 'data.db');
const COPILOT_SESSION_DB = path.join(HOME, '.copilot', 'session-store.db');
const COPILOT_AUTO_DIR = path.join(HOME, '.copilot-auto');
const COPILOT_LOG = path.join(COPILOT_AUTO_DIR, 'copilot-auto.log');
const COPILOT_CONFIG = path.join(COPILOT_AUTO_DIR, 'config.json');
const COPILOT_CLI_CONFIG = path.join(HOME, '.copilot', 'config.json');
const COPILOT_DEFAULT_THRESHOLD = 85;

const TASKS = { claude: 'cswap-auto', codex: 'codex-auth-auto', antigravity: 'antigravity-auto', copilot: 'copilot-auto' };
const TIMEOUT_MS = 60_000;
const LOG_TAIL_LINES = 60;

// Seletor de conta: número do slot, e-mail ou username.
const SELECTOR_RE = /^(\d{1,3}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[A-Za-z0-9_-]{1,64})$/;

function assertSelector(value) {
  const s = String(value ?? '');
  if (!SELECTOR_RE.test(s)) throw new Error(`Conta inválida: ${s}`);
  return s;
}

function run(file, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: TIMEOUT_MS, windowsHide: true, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, NO_COLOR: '1', ...extraEnv } },
      (err, stdout, stderr) => {
        if (err) {
          const detail = (stderr || stdout || err.message).toString().trim().split('\n').slice(-3).join(' ');
          reject(new Error(detail || err.message));
          return;
        }
        resolve(stdout.toString());
      },
    );
  });
}

function parseJson(text, source) {
  const start = text.indexOf('{');
  if (start < 0) throw new Error(`${source} não devolveu JSON`);
  return JSON.parse(text.slice(start));
}

const cswap = (args) => run(CSWAP, args);
const codexAuth = (args) => run('node', [CODEX_AUTH_JS, ...args]);

function powershell(script) {
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
}

// ---------- Claude ----------

async function claudeList() {
  const data = parseJson(await cswap(['list', '--json']), 'cswap');
  return {
    activeNumber: data.activeAccountNumber,
    accounts: (data.accounts || []).map((a) => ({
      number: a.number,
      email: a.email,
      alias: a.alias || null,
      org: a.organizationName || null,
      active: Boolean(a.active),
      disabled: Boolean(a.disabled),
      status: a.usageStatus,
      error: a.usageError || null,
      loginExpiresAt: a.loginExpiresAt || null,
      fetchedAgeSeconds: a.usageAgeSeconds ?? null,
      windows: [
        a.usage?.fiveHour && { label: '5h', pct: a.usage.fiveHour.pct, resetsAt: a.usage.fiveHour.resetsAt },
        a.usage?.sevenDay && { label: '7d', pct: a.usage.sevenDay.pct, resetsAt: a.usage.sevenDay.resetsAt },
      ].filter(Boolean),
    })),
  };
}

async function claudeConfig() {
  const out = await cswap(['config']);
  const match = out.match(/autoswitch\.threshold\s+(\d+)/);
  return { threshold: match ? Number(match[1]) : null };
}

const claude = {
  list: claudeList,
  config: claudeConfig,
  switch: (sel) => cswap(['switch', assertSelector(sel)]),
  switchBest: () => cswap(['switch', '--strategy', 'best']),
  enable: (sel) => cswap(['enable', assertSelector(sel)]),
  disable: (sel) => cswap(['disable', assertSelector(sel)]),
  remove: (sel) => cswap(['remove', assertSelector(sel)]),
  setThreshold: (value) => cswap(['config', 'set', 'autoswitch.threshold', String(clampThreshold(value))]),
  log: () => tail(CSWAP_LOG),
};

// ---------- Codex ----------

function codexWindow(w) {
  if (!w) return null;
  const label = w.window_minutes <= 300 ? '5h' : w.window_minutes >= 10080 ? '7d' : `${Math.round(w.window_minutes / 60)}h`;
  return { label, pct: w.used_percent, resetsAt: w.resets_at ? new Date(w.resets_at * 1000).toISOString() : null };
}

async function codexList() {
  const data = parseJson(await codexAuth(['list', '--json']), 'codex-auth');
  return {
    accounts: (data.accounts || []).map((a) => {
      const refresh = a.usage?.refresh || {};
      return {
        number: a.number,
        email: a.email,
        alias: a.alias || null,
        plan: a.plan,
        active: Boolean(a.active),
        status: refresh.status === 'ok' ? 'ok' : 'error',
        error: refresh.status === 'ok' ? null : `${refresh.http_status || ''} ${refresh.error_code || refresh.status || 'sem leitura'}`.trim(),
        lastUsedAt: a.last_used_at ? new Date(a.last_used_at * 1000).toISOString() : null,
        resetCredits: Number(a.usage?.reset_credits) || 0,
        windows: [codexWindow(a.usage?.primary), codexWindow(a.usage?.secondary)].filter(Boolean),
      };
    }),
  };
}

function codexConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CODEX_CONFIG, 'utf8'));
    return { threshold: Number(cfg.threshold) || CODEX_DEFAULT_THRESHOLD };
  } catch {
    return { threshold: CODEX_DEFAULT_THRESHOLD };
  }
}

function codexSetThreshold(value) {
  fs.mkdirSync(CODEX_AUTO_DIR, { recursive: true });
  fs.writeFileSync(CODEX_CONFIG, JSON.stringify({ threshold: clampThreshold(value) }, null, 2));
}

// Resgate de redefinição: o app-server do Codex consome o crédito da conta ativa em ~/.codex/auth.json.
const CODEX_JS = path.join(APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
const RESET_OUTCOMES = {
  reset: 'Redefinição usada: a janela de uso foi zerada.',
  nothingToReset: 'Nada para zerar agora: nenhuma janela está elegível. O crédito não foi gasto.',
  noCredit: 'A conta não tem redefinições disponíveis.',
  alreadyRedeemed: 'Essa tentativa já tinha sido resgatada.',
};

function codexAppServerRequest(method, params) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [CODEX_JS, 'app-server'], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, NO_COLOR: '1' } });
    let buffer = '';
    let settled = false;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      err ? reject(err) : resolve(value);
    };
    const send = (msg) => child.stdin.write(`${JSON.stringify(msg)}\n`);
    const timer = setTimeout(() => finish(new Error('codex app-server não respondeu a tempo')), TIMEOUT_MS);

    child.on('error', (err) => finish(err));
    child.on('exit', (code) => finish(new Error(`codex app-server encerrou (código ${code})`)));
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 1) {
          send({ method: 'initialized' });
          send({ id: 2, method, params });
        } else if (msg.id === 2) {
          if (msg.error) finish(new Error(msg.error.message || JSON.stringify(msg.error)));
          else finish(null, msg.result);
        }
      }
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'pool-contas-ia', version: '1' }, capabilities: { experimentalApi: true } } });
  });
}

async function codexRedeemReset(sel) {
  const selector = assertSelector(sel);
  const before = parseJson(await codexAuth(['list', '--json', '--skip-api']), 'codex-auth');
  const previous = (before.accounts || []).find((a) => a.active);
  const target = (before.accounts || []).find((a) => String(a.number) === selector || a.email === selector);
  if (!target) throw new Error(`Conta Codex não encontrada: ${selector}`);

  const mustSwitch = !target.active;
  if (mustSwitch) await codexAuth(['switch', String(target.number), '--json']);
  try {
    const result = await codexAppServerRequest('account/rateLimitResetCredit/consume', { idempotencyKey: crypto.randomUUID() });
    const outcome = result?.outcome;
    return { email: target.email, outcome, message: RESET_OUTCOMES[outcome] || `Resposta: ${outcome}` };
  } finally {
    // Devolve a conta ativa que estava antes, para não mexer no rodízio.
    if (mustSwitch && previous) await codexAuth(['switch', String(previous.number), '--json']).catch(() => {});
  }
}

const codex = {
  list: codexList,
  config: async () => codexConfig(),
  redeemReset: (sel) => codexRedeemReset(sel),
  switch: (sel) => codexAuth(['switch', assertSelector(sel), '--json']),
  remove: (sel) => codexAuth(['remove', assertSelector(sel), '--json']),
  setThreshold: async (value) => codexSetThreshold(value),
  log: () => tail(CODEX_LOG),
};

// ---------- Antigravity CLI ----------

function getAntigravityDb(readOnly = true) {
  if (!fs.existsSync(ANTIGRAVITY_AGENT_DB)) {
    throw new Error(`Banco de contas Antigravity não encontrado em ${ANTIGRAVITY_AGENT_DB}`);
  }
  const { DatabaseSync } = require('node:sqlite');
  return new DatabaseSync(ANTIGRAVITY_AGENT_DB, { readOnly });
}

async function antigravityList() {
  if (!fs.existsSync(ANTIGRAVITY_AGENT_DB)) {
    return { accounts: [] };
  }
  const db = getAntigravityDb(true);
  try {
    const rows = db.prepare('SELECT id, provider, email, name, token_json, quota_json, is_active, status, status_reason, last_used FROM accounts').all();
    return {
      accounts: rows.map((r, idx) => {
        let quota = {};
        try { quota = JSON.parse(r.quota_json || '{}'); } catch {}

        const windows = [];
        if (Array.isArray(quota.quota_groups)) {
          for (const group of quota.quota_groups) {
            const isGemini = (group.display_name || '').toLowerCase().includes('gemini');
            const prefix = isGemini ? 'Gemini' : 'Claude/GPT';
            for (const bucket of group.buckets || []) {
              const remaining = typeof bucket.remaining_fraction === 'number' ? bucket.remaining_fraction : 1;
              const pct = Math.max(0, Math.min(100, Math.round((1 - remaining) * 100)));
              const winLabel = bucket.window === '5h' ? '5h' : '7d';
              windows.push({
                label: `${prefix} ${winLabel}`,
                pct,
                resetsAt: bucket.reset_time || null,
              });
            }
          }
        }

        if (!windows.length && quota.models) {
          const claudeModel = quota.models['claude-opus-4-6-thinking'] || quota.models['claude-sonnet-4-6'];
          const geminiModel = quota.models['gemini-3.8-flash-high'] || quota.models['gemini-2.5-flash'];
          if (claudeModel && typeof claudeModel.percentage === 'number') {
            windows.push({ label: 'Claude', pct: 100 - claudeModel.percentage, resetsAt: claudeModel.resetTime });
          }
          if (geminiModel && typeof geminiModel.percentage === 'number') {
            windows.push({ label: 'Gemini', pct: 100 - geminiModel.percentage, resetsAt: geminiModel.resetTime });
          }
        }

        return {
          number: idx + 1,
          id: r.id,
          email: r.email,
          alias: r.name || null,
          plan: quota.subscription_tier || 'Antigravity',
          active: Boolean(r.is_active),
          disabled: r.status !== 'active',
          status: r.status === 'active' ? 'ok' : 'error',
          error: r.status === 'active' ? null : (r.status_reason || 'Reautenticação necessária'),
          lastUsedAt: r.last_used ? new Date(r.last_used * 1000).toISOString() : null,
          windows,
        };
      }),
    };
  } finally {
    db.close();
  }
}

function antigravityConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(ANTIGRAVITY_CONFIG, 'utf8'));
    return { threshold: Number(cfg.threshold) || ANTIGRAVITY_DEFAULT_THRESHOLD };
  } catch {
    return { threshold: ANTIGRAVITY_DEFAULT_THRESHOLD };
  }
}

function antigravitySetThreshold(value) {
  fs.mkdirSync(ANTIGRAVITY_AUTO_DIR, { recursive: true });
  fs.writeFileSync(ANTIGRAVITY_CONFIG, JSON.stringify({ threshold: clampThreshold(value) }, null, 2));
}

async function antigravitySwitch(sel) {
  const selector = String(sel ?? '').trim();
  const db = getAntigravityDb(false);
  try {
    const rows = db.prepare('SELECT id, email, name, token_json, is_active FROM accounts').all();
    let targetAccount = null;

    if (/^\d+$/.test(selector)) {
      const num = Number(selector);
      targetAccount = rows[num - 1] || null;
    } else {
      targetAccount = rows.find(r => r.email.toLowerCase() === selector.toLowerCase() || r.id === selector) || null;
    }

    if (!targetAccount) {
      throw new Error(`Conta Antigravity não encontrada: ${selector}`);
    }

    let token = {};
    try { token = JSON.parse(targetAccount.token_json || '{}'); } catch {}
    if (!token.access_token || !token.refresh_token) {
      throw new Error(`Token inválido para ${targetAccount.email}`);
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const expiry = new Date((token.expiry_timestamp || (nowSec + 3600)) * 1000).toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');
    const payload = JSON.stringify({
      token: {
        access_token: token.access_token,
        token_type: 'Bearer',
        refresh_token: token.refresh_token,
        expiry,
        ...(token.id_token ? { id_token: token.id_token } : {}),
        ...(token.project_id ? { project_id: token.project_id } : {}),
      },
      auth_method: 'consumer',
    }, null, 2);

    // Atualiza token do Antigravity CLI
    fs.mkdirSync(path.dirname(ANTIGRAVITY_TOKEN_PATH), { recursive: true });
    fs.writeFileSync(ANTIGRAVITY_TOKEN_PATH, payload, 'utf8');

    // Atualiza oauth_creds.json e google_accounts.json se a pasta existir
    try {
      if (fs.existsSync(GEMINI_DIR)) {
        const oauthCredsPath = path.join(GEMINI_DIR, 'oauth_creds.json');
        const googleAccountsPath = path.join(GEMINI_DIR, 'google_accounts.json');
        const oauthCreds = {
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          token_type: 'Bearer',
          expiry_date: (token.expiry_timestamp ? token.expiry_timestamp * 1000 : Date.now() + 3600000),
          scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/cloud-platform',
          ...(token.id_token ? { id_token: token.id_token } : {}),
        };
        fs.writeFileSync(oauthCredsPath, JSON.stringify(oauthCreds, null, 2), 'utf8');

        let googleAccs = { active: targetAccount.email, old: [] };
        try {
          if (fs.existsSync(googleAccountsPath)) {
            const prev = JSON.parse(fs.readFileSync(googleAccountsPath, 'utf8'));
            const old = (prev.old || []).filter(e => e !== targetAccount.email);
            if (prev.active && prev.active !== targetAccount.email && !old.includes(prev.active)) {
              old.push(prev.active);
            }
            googleAccs = { active: targetAccount.email, old };
          }
        } catch {}
        fs.writeFileSync(googleAccountsPath, JSON.stringify(googleAccs, null, 2), 'utf8');
      }
    } catch (err) {
      console.warn('Erro ao atualizar arquivos auxiliares do Gemini:', err);
    }

    // Atualiza banco SQLite
    db.prepare('UPDATE accounts SET is_active = 0').run();
    db.prepare('UPDATE accounts SET is_active = 1, last_used = ? WHERE id = ?').run(nowSec, targetAccount.id);

    // Log da troca
    fs.mkdirSync(ANTIGRAVITY_AUTO_DIR, { recursive: true });
    const logLine = `[${new Date().toISOString()}] Conta ativa alternada para ${targetAccount.email} (${targetAccount.name || 'sem nome'})\n`;
    fs.appendFileSync(ANTIGRAVITY_LOG, logLine, 'utf8');

    return { switchedTo: targetAccount.email };
  } finally {
    db.close();
  }
}

async function antigravityRemove(sel) {
  const selector = String(sel ?? '').trim();
  const db = getAntigravityDb(false);
  try {
    const rows = db.prepare('SELECT id, email FROM accounts').all();
    let target = null;
    if (/^\d+$/.test(selector)) {
      target = rows[Number(selector) - 1] || null;
    } else {
      target = rows.find(r => r.email.toLowerCase() === selector.toLowerCase() || r.id === selector) || null;
    }
    if (!target) throw new Error(`Conta não encontrada: ${selector}`);
    db.prepare('DELETE FROM accounts WHERE id = ?').run(target.id);
    return { removed: target.email };
  } finally {
    db.close();
  }
}

const antigravity = {
  list: antigravityList,
  config: async () => antigravityConfig(),
  switch: (sel) => antigravitySwitch(sel),
  remove: (sel) => antigravityRemove(sel),
  setThreshold: async (value) => antigravitySetThreshold(value),
  log: () => tail(ANTIGRAVITY_LOG),
};

// ---------- GitHub Copilot CLI ----------

function getCopilotDb(readOnly = true) {
  if (!fs.existsSync(COPILOT_DATA_DB)) {
    throw new Error(`Banco do Copilot não encontrado em ${COPILOT_DATA_DB}`);
  }
  const { DatabaseSync } = require('node:sqlite');
  return new DatabaseSync(COPILOT_DATA_DB, { readOnly });
}

async function copilotList() {
  if (!fs.existsSync(COPILOT_DATA_DB)) {
    return { accounts: [] };
  }
  const { DatabaseSync } = require('node:sqlite');
  const db = getCopilotDb(true);
  let usage7d = 0;
  let usage24h = 0;
  let hasRecentError = false;
  let recentErrorMsg = null;

  try {
    if (fs.existsSync(COPILOT_SESSION_DB)) {
      const sdb = new DatabaseSync(COPILOT_SESSION_DB, { readOnly: true });
      try {
        const row7d = sdb.prepare("SELECT sum(total_nano_aiu)/1000000000.0 as aiu FROM assistant_usage_events WHERE created_at > datetime('now', '-7 days')").get();
        const row24h = sdb.prepare("SELECT sum(total_nano_aiu)/1000000000.0 as aiu FROM assistant_usage_events WHERE created_at > datetime('now', '-1 day')").get();
        usage7d = row7d?.aiu ? Math.round(row7d.aiu * 10) / 10 : 0;
        usage24h = row24h?.aiu ? Math.round(row24h.aiu * 10) / 10 : 0;

        const errRow = sdb.prepare("SELECT id, created_at, finish_reason FROM assistant_usage_events WHERE finish_reason = 'error' AND created_at > datetime('now', '-30 minutes') ORDER BY id DESC LIMIT 1").get();
        if (errRow) {
          hasRecentError = true;
          recentErrorMsg = 'Erro/limite detectado na sessão Copilot';
        }
      } finally {
        sdb.close();
      }
    }

    try {
      const logsDir = path.join(HOME, '.copilot', 'logs');
      if (fs.existsSync(logsDir)) {
        const files = fs.readdirSync(logsDir)
          .filter((f) => f.startsWith('process-') && f.endsWith('.log'))
          .map((f) => ({ name: f, time: fs.statSync(path.join(logsDir, f)).mtimeMs }))
          .sort((a, b) => b.time - a.time);
        if (files.length > 0 && Date.now() - files[0].time < 15 * 60 * 1000) {
          const logContent = fs.readFileSync(path.join(logsDir, files[0].name), 'utf8');
          if (/429|rate\s*limit|quota\s*exceeded|usage\s*limit|credit\s*limit/i.test(logContent)) {
            hasRecentError = true;
            recentErrorMsg = 'Limite atingido no Copilot (429 / Quota)';
          }
        }
      }
    } catch {}

    let lastLoggedInLogin = null;
    if (fs.existsSync(COPILOT_CLI_CONFIG)) {
      try {
        const raw = fs.readFileSync(COPILOT_CLI_CONFIG, 'utf8');
        const match = raw.match(/"lastLoggedInUser"\s*:\s*\{[\s\S]*?"login"\s*:\s*"([^"]+)"/);
        if (match) lastLoggedInLogin = match[1];
      } catch {}
    }

    const rows = db.prepare('SELECT id, login, name, is_default, host, token_updated_at, settings_json FROM accounts').all();
    return {
      accounts: rows.map((r, idx) => {
        const isActive = lastLoggedInLogin
          ? r.login.toLowerCase() === lastLoggedInLogin.toLowerCase()
          : Boolean(r.is_default);

        const isExhausted = isActive && hasRecentError;
        const pct24 = isExhausted ? 100 : (isActive ? Math.min(100, Math.round((usage24h / 50) * 100)) : 0);
        const pct7d = isExhausted ? 100 : (isActive ? Math.min(100, Math.round((usage7d / 300) * 100)) : 0);

        const windows = [
          {
            label: isActive ? `24h (${usage24h} cr)` : '24h',
            pct: pct24,
            resetsAt: null,
          },
          {
            label: isActive ? `7d (${usage7d} cr)` : '7d',
            pct: pct7d,
            resetsAt: null,
          },
        ];
        return {
          number: idx + 1,
          id: r.id,
          email: r.login,
          alias: r.name || r.login,
          plan: 'GitHub Copilot',
          active: isActive,
          disabled: false,
          status: isExhausted ? 'error' : 'ok',
          error: isExhausted ? recentErrorMsg : null,
          lastUsedAt: r.token_updated_at ? new Date(r.token_updated_at).toISOString() : null,
          windows,
        };
      }),
    };
  } finally {
    db.close();
  }
}

function copilotConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(COPILOT_CONFIG, 'utf8'));
    return { threshold: Number(cfg.threshold) || COPILOT_DEFAULT_THRESHOLD };
  } catch {
    return { threshold: COPILOT_DEFAULT_THRESHOLD };
  }
}

function copilotSetThreshold(value) {
  fs.mkdirSync(COPILOT_AUTO_DIR, { recursive: true });
  fs.writeFileSync(COPILOT_CONFIG, JSON.stringify({ threshold: clampThreshold(value) }, null, 2));
}

async function copilotSwitch(sel) {
  const selector = String(sel ?? '').trim();
  const db = getCopilotDb(false);
  try {
    const rows = db.prepare('SELECT id, login, name, is_default FROM accounts').all();
    let target = null;
    if (/^\d+$/.test(selector)) {
      target = rows[Number(selector) - 1] || null;
    } else {
      target = rows.find((r) => r.login.toLowerCase() === selector.toLowerCase() || r.id === selector) || null;
    }
    if (!target) {
      throw new Error(`Conta Copilot não encontrada: ${selector}`);
    }

    db.prepare('UPDATE accounts SET is_default = 0').run();
    db.prepare("UPDATE accounts SET is_default = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(target.id);

    if (fs.existsSync(COPILOT_CLI_CONFIG)) {
      try {
        const raw = fs.readFileSync(COPILOT_CLI_CONFIG, 'utf8');
        const updated = raw.replace(
          /"lastLoggedInUser"\s*:\s*\{[\s\S]*?"login"\s*:\s*"[^"]*"[\s\S]*?\}/,
          `"lastLoggedInUser": {\n    "host": "https://github.com",\n    "login": "${target.login}"\n  }`
        );
        if (updated !== raw) {
          fs.writeFileSync(COPILOT_CLI_CONFIG, updated, 'utf8');
        }
      } catch {}
    }

    try {
      await powershell(`Remove-Item Env:\\GH_TOKEN -ErrorAction SilentlyContinue; gh auth switch --hostname github.com --user '${target.login}'`);
    } catch {}

    fs.mkdirSync(COPILOT_AUTO_DIR, { recursive: true });
    const logLine = `[${new Date().toISOString()}] Conta ativa alternada para ${target.login} (${target.name || 'sem nome'})\n`;
    fs.appendFileSync(COPILOT_LOG, logLine, 'utf8');

    return { switchedTo: target.login };
  } finally {
    db.close();
  }
}

async function copilotRemove(sel) {
  const selector = String(sel ?? '').trim();
  const db = getCopilotDb(false);
  try {
    const rows = db.prepare('SELECT id, login FROM accounts').all();
    let target = null;
    if (/^\d+$/.test(selector)) {
      target = rows[Number(selector) - 1] || null;
    } else {
      target = rows.find((r) => r.login.toLowerCase() === selector.toLowerCase() || r.id === selector) || null;
    }
    if (!target) throw new Error(`Conta não encontrada: ${selector}`);
    db.prepare('DELETE FROM accounts WHERE id = ?').run(target.id);
    return { removed: target.login };
  } finally {
    db.close();
  }
}

const copilot = {
  list: copilotList,
  config: async () => copilotConfig(),
  switch: (sel) => copilotSwitch(sel),
  remove: (sel) => copilotRemove(sel),
  setThreshold: async (value) => copilotSetThreshold(value),
  log: () => tail(COPILOT_LOG),
};

// ---------- Failover automático (tarefas agendadas) ----------

async function autoStatus() {
  const out = await powershell(
    `$r=@{}; foreach($n in '${TASKS.claude}','${TASKS.codex}','${TASKS.antigravity}','${TASKS.copilot}'){ $t=Get-ScheduledTask -TaskName $n -EA SilentlyContinue; ` +
      `$i=if($t){Get-ScheduledTaskInfo -TaskName $n}; $r[$n]=@{exists=[bool]$t; state="$($t.State)"; lastRun="$($i.LastRunTime.ToString('o'))"; lastResult=$i.LastTaskResult} }; ` +
      `$r['cswapRunning']=[bool](Get-Process cswap -EA SilentlyContinue); $r | ConvertTo-Json -Compress`,
  );
  const data = JSON.parse(out);
  const codexTask = data[TASKS.codex] || {};
  const agyTask = data[TASKS.antigravity] || {};
  const copilotTask = data[TASKS.copilot] || {};
  return {
    claude: { ...data[TASKS.claude], running: data.cswapRunning },
    codex: { ...codexTask, running: codexTask.state === 'Ready' || codexTask.state === 'Running' },
    antigravity: { ...agyTask, running: agyTask.state === 'Ready' || agyTask.state === 'Running' },
    copilot: { ...copilotTask, running: copilotTask.state === 'Ready' || copilotTask.state === 'Running' },
  };
}

async function setAuto(which, enabled) {
  const task = TASKS[which];
  if (!task) throw new Error(`Failover desconhecido: ${which}`);
  if (enabled) {
    await powershell(`Enable-ScheduledTask -TaskName '${task}' | Out-Null; Start-ScheduledTask -TaskName '${task}'`);
    return;
  }
  // O cswap auto é um processo contínuo: desabilitar a tarefa não basta, é preciso encerrá-lo.
  const stopProcess = which === 'claude' ? '; Get-Process cswap -EA SilentlyContinue | Stop-Process -Force' : '';
  await powershell(`Disable-ScheduledTask -TaskName '${task}' | Out-Null${stopProcess}`);
}

// ---------- Login em terminal visível ----------

const LOGIN_COMMANDS = {
  claude: 'start "Login Claude (cswap)" cmd /k "claude auth login && cswap add && echo. && echo Conta adicionada. Pode fechar."',
  codex: 'start "Login Codex (codex-auth)" cmd /k "codex-auth login && echo. && echo Conta adicionada. Pode fechar."',
  antigravity: `start "" "${path.join(process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local'), 'antigravity_manager', 'antigravity-manager.exe')}"`,
  copilot: 'start "Login GitHub Copilot" cmd /k "copilot /login && echo. && echo Conclua a autorização e feche o terminal."',
  hermes: 'start "Hermes - credenciais" cmd /k "hermes auth list & echo. & echo Para adicionar: hermes auth add ^<provedor^>   (ex.: hermes auth add openrouter)"',
  opencode: 'start "Login OpenCode" cmd /k "opencode auth login && echo. && echo Conexão salva. Pode fechar."',
};

// Abre um terminal já rodando o CLI, para uso manual.
const TERMINAL_COMMANDS = {
  claude: 'start "Claude Code" cmd /k "cswap list"',
  codex: 'start "Codex" cmd /k "codex-auth list"',
  antigravity: 'start "Antigravity CLI" cmd /k "agy"',
  copilot: 'start "Copilot CLI" cmd /k "copilot"',
  hermes: 'start "Hermes" cmd /k "hermes status"',
  opencode: 'start "OpenCode" cmd /k "opencode"',
};

function openTerminal(which) {
  const command = TERMINAL_COMMANDS[which];
  if (!command) throw new Error(`Terminal desconhecido: ${which}`);
  spawn('cmd.exe', ['/d', '/c', command], { detached: true, windowsVerbatimArguments: true, stdio: 'ignore' }).unref();
}

// Roda a tarefa de failover na hora, sem esperar o próximo ciclo.
async function runAutoNow(which) {
  const task = TASKS[which];
  if (!task) throw new Error(`Failover desconhecido: ${which}`);
  await powershell(`Start-ScheduledTask -TaskName '${task}'`);
}

const FOLDERS = {
  claude: path.join(HOME, '.claude-swap-backup'),
  codex: path.join(HOME, '.codex'),
  antigravity: path.join(HOME, '.antigravity-agent'),
  copilot: path.join(HOME, '.copilot'),
  hermes: path.join(HOME, '.hermes'),
  opencode: path.join(HOME, '.config', 'opencode'),
};

function openLogin(which) {
  const command = LOGIN_COMMANDS[which];
  if (!command) throw new Error(`Login desconhecido: ${which}`);
  // Strings fixas, sem entrada do usuário: windowsVerbatimArguments preserva as aspas do título do start.
  spawn('cmd.exe', ['/d', '/c', command], { detached: true, windowsVerbatimArguments: true, stdio: 'ignore' }).unref();
}

// ---------- utilitários ----------

function clampThreshold(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 50 || n > 100) throw new Error('O limite deve ficar entre 50 e 100%');
  return n;
}

function tail(file) {
  try {
    const lines = fs.readFileSync(file, 'utf8').trimEnd().split(/\r?\n/);
    return lines.slice(-LOG_TAIL_LINES).join('\n');
  } catch {
    return '(sem log ainda)';
  }
}

module.exports = { claude, codex, antigravity, copilot, autoStatus, setAuto, openLogin, openTerminal, runAutoNow, FOLDERS };
