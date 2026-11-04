'use strict';
// Backup de conversas (patch "chat-workbench"): grava a sessão do chat em um
// clone local de um repositório GitHub privado dedicado a backups e faz
// commit + push. O renderer envia a conversa já com segredos mascarados.
// Config opcional em data/session-backup.json: { "repoDir": "...", "remote": "owner/nome" }.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { fileURLToPath } = require('node:url');

const CONFIG_FILE = path.join(__dirname, '../../data/session-backup.json');
const DEFAULT_REPO_DIR = path.join(os.homedir(), 'multica-sessoes-backup');
const GIT_TIMEOUT_MS = 60000;

function loadConfig() {
  let config = {};
  // Windows PowerShell 5 writes UTF-8 with BOM, which JSON.parse rejects.
  try { config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8').replace(/^﻿/, '')); } catch {}
  return { repoDir: config.repoDir || DEFAULT_REPO_DIR, remote: config.remote || '' };
}

function git(repoDir, args) {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', repoDir, ...args], { timeout: GIT_TIMEOUT_MS, windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(new Error((stderr || error.message).trim().split('\n').slice(-2).join(' ')));
      else resolve(stdout.trim());
    });
  });
}

const slug = (text) => String(text || 'conversa').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'conversa';
const safeId = (id) => String(id || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
const oneLine = (text, max) => String(text ?? '').replace(/\s+/g, ' ').slice(0, max);

function eventLine(event) {
  const tool = event.tool ? ` \`${event.tool}\`` : '';
  if (event.type === 'tool_use') return `- ferramenta${tool}: \`${oneLine(JSON.stringify(event.input ?? {}), 400)}\``;
  if (event.type === 'tool_result') return `  - resultado: ${oneLine(event.output, 300)}`;
  if (event.type === 'thinking') return `- raciocínio: ${oneLine(event.content, 300)}`;
  if (event.type === 'error') return `- erro: ${oneLine(event.content ?? event.output, 300)}`;
  return null;
}

function toMarkdown(payload) {
  const { session, agent, messages = [], tasks = {} } = payload;
  const lines = [
    `# ${session.title || 'Conversa'}`,
    '',
    `- Sessão: \`${session.id}\``,
    `- Agente: ${agent?.name ?? '—'} (\`${agent?.id ?? '—'}\`)`,
    `- Backup: ${new Date().toISOString()}`,
    `- Mensagens: ${messages.length} · Execuções: ${Object.keys(tasks).length}`,
    '',
  ];
  for (const m of messages) {
    lines.push(`## ${m.role === 'user' ? 'Usuário' : 'Agente'} · ${m.created_at || ''}`, '', String(m.content ?? ''), '');
    const events = m.task_id ? tasks[m.task_id] : null;
    if (events?.length) {
      lines.push(`<details><summary>Execução ${m.task_id} (${events.length} eventos)</summary>`, '');
      for (const e of events) { const line = eventLine(e); if (line) lines.push(line); }
      lines.push('', '</details>', '');
    }
  }
  return lines.join('\n');
}

async function backupSession(payload) {
  const session = payload?.session;
  if (!session?.id) throw new Error('Sessão inválida.');
  const { repoDir, remote } = loadConfig();
  if (!fs.existsSync(path.join(repoDir, '.git'))) {
    throw new Error(`Repositório de backup não encontrado em ${repoDir}. Rode scripts/setup-backup-repo.ps1.`);
  }
  const month = (session.created_at || new Date().toISOString()).slice(0, 7);
  const dir = path.join(repoDir, 'sessoes', month, `${slug(session.title)}-${safeId(session.id).slice(0, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  const jsonPath = path.join(dir, 'sessao.json');
  try {
    const { backedUpAt, host, ...previous } = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (JSON.stringify(previous) === JSON.stringify(payload)) return { path: dir, committed: false, pushed: false, message: 'Nada mudou desde o último backup.' };
  } catch {}
  fs.writeFileSync(path.join(dir, 'conversa.md'), toMarkdown(payload));
  fs.writeFileSync(path.join(dir, 'sessao.json'), JSON.stringify({ ...payload, backedUpAt: new Date().toISOString(), host: os.hostname() }, null, 2));
  const rel = path.relative(repoDir, dir).replaceAll('\\', '/');
  await git(repoDir, ['add', '--', rel]);
  const staged = await git(repoDir, ['diff', '--cached', '--name-only']);
  if (!staged) return { path: dir, committed: false, pushed: false, message: 'Nada mudou desde o último backup.' };
  await git(repoDir, ['commit', '-m', `backup: ${oneLine(session.title || 'conversa', 72)} (${safeId(session.id).slice(0, 8)})`]);
  let pushed = false;
  let pushError = '';
  try { await git(repoDir, ['push', '-q']); pushed = true; } catch (error) { pushError = error.message; }
  return { path: dir, committed: true, pushed, remote, message: pushed ? 'Backup enviado ao GitHub.' : `Commit local feito; push falhou: ${pushError}` };
}

function register(rendererEntry, electron = require('electron')) {
  const expected = path.resolve(rendererEntry).toLowerCase();
  const authorized = (event) => {
    const frame = event.senderFrame;
    if (!frame || frame !== frame.top || !String(frame.url).startsWith('file:')) return false;
    return path.resolve(fileURLToPath(frame.url)).toLowerCase() === expected;
  };
  const handlers = {
    status: () => { const { repoDir, remote } = loadConfig(); return { repoDir, remote, ready: fs.existsSync(path.join(repoDir, '.git')) }; },
    session: (event, input) => backupSession(input),
    openRepo: async () => {
      const error = await electron.shell.openPath(loadConfig().repoDir);
      if (error) throw new Error(error);
      return true;
    },
  };
  for (const [channel, handler] of Object.entries(handlers)) {
    electron.ipcMain.handle('mc-backup:' + channel, async (event, input = {}) => {
      try {
        if (!authorized(event)) return { ok: false, error: 'Origem não autorizada.' };
        return { ok: true, data: await handler(event, input ?? {}) };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    });
  }
}

module.exports = { register, backupSession, toMarkdown };
