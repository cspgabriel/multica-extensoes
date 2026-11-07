'use strict';
// Reuniões (patch "chat-workbench" 1.8): grava a reunião em trechos de ~30 s
// enviados pela janela, transcreve cada trecho localmente com faster-whisper
// (meetings-transcriber.py, processo persistente) e guarda tudo em
// ~/Multica-Reunioes/<id>/ (meta.json, transcricao.md e os trechos .webm).
// Nada é enviado para fora; mandar para um agente é ação explícita da tela.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { fileURLToPath } = require('node:url');

const ROOT = path.join(os.homedir(), 'Multica-Reunioes');
const TRANSCRIBER = path.join(__dirname, 'meetings-transcriber.py');
const MAX_CHUNK_BYTES = 25 * 1024 * 1024;
const ID = /^[0-9]{8}-[0-9]{6}-[0-9a-f]{6}$/;

const metaPath = (id) => path.join(ROOT, id, 'meta.json');
const readMeta = (id) => JSON.parse(fs.readFileSync(metaPath(id), 'utf8'));
function writeMeta(meta) {
  const file = metaPath(meta.id);
  fs.writeFileSync(file + '.tmp', JSON.stringify(meta, null, 2));
  fs.renameSync(file + '.tmp', file);
}
function checkId(id) {
  if (!ID.test(String(id)) || !fs.existsSync(metaPath(id))) throw new Error('Reunião não encontrada.');
  return id;
}
const transcript = (meta) => [...meta.segments].sort((a, b) => a.seq - b.seq).map((s) => s.text).filter(Boolean).join('\n');

function findPython() {
  if (process.env.MC_MEETINGS_PYTHON && fs.existsSync(process.env.MC_MEETINGS_PYTHON)) return process.env.MC_MEETINGS_PYTHON;
  const base = path.join(process.env.LOCALAPPDATA || '', 'Python');
  try {
    const found = fs.readdirSync(base).filter((d) => /^pythoncore-/.test(d)).sort().reverse()
      .map((d) => path.join(base, d, 'python.exe')).find((f) => fs.existsSync(f));
    if (found) return found;
  } catch {}
  return 'python';
}

function createTranscriber() {
  let proc = null;
  let ready = null;
  let buffer = '';
  let state = { status: 'parado', model: null, error: null };
  const pending = new Map();
  const start = () => {
    if (proc) return ready;
    state = { status: 'carregando', model: null, error: null };
    // Prefer the model downloaded next to the meetings: the Hugging Face cache on
    // this PC had 0-byte model.bin files (xet transport failing silently).
    const localModel = path.join(ROOT, '.modelos', 'faster-whisper-small');
    const model = process.env.MC_MEETINGS_MODEL || (fs.existsSync(path.join(localModel, 'model.bin')) ? localModel : 'small');
    proc = spawn(findPython(), [TRANSCRIBER], { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', HF_HUB_DISABLE_XET: '1', MC_MEETINGS_MODEL: model } });
    ready = new Promise((resolve, reject) => {
      proc.stdout.on('data', (data) => {
        buffer += data.toString('utf8');
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          let msg;
          try { msg = JSON.parse(line); } catch { continue; }
          if (msg.ready) { state = { status: 'pronto', model: msg.model, error: null }; resolve(); continue; }
          const job = pending.get(msg.id);
          if (!job) continue;
          pending.delete(msg.id);
          if (msg.error) job.reject(new Error(msg.error)); else job.resolve(msg.text || '');
        }
      });
      let stderr = '';
      proc.stderr.on('data', (d) => { stderr = (stderr + d.toString()).slice(-2000); });
      proc.on('exit', (code) => {
        const error = new Error(`Transcritor encerrou (código ${code}). ${stderr.split('\n').filter(Boolean).slice(-1)[0] ?? ''}`.trim());
        state = { status: 'erro', model: null, error: error.message };
        for (const job of pending.values()) job.reject(error);
        pending.clear();
        proc = null;
        reject(error);
      });
    });
    ready.catch(() => {});
    return ready;
  };
  const transcribe = async (file, language) => {
    await start();
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      proc.stdin.write(JSON.stringify({ id, path: file, language }) + '\n');
    });
  };
  const stop = () => { if (proc) { try { proc.kill(); } catch {} } };
  return { transcribe, stop, state: () => ({ ...state, queued: pending.size }) };
}

function register(rendererEntry, electron = require('electron')) {
  const expected = path.resolve(rendererEntry).toLowerCase();
  const transcriber = createTranscriber();
  const authorized = (event) => {
    const frame = event.senderFrame;
    if (!frame || frame !== frame.top || !String(frame.url).startsWith('file:')) return false;
    return path.resolve(fileURLToPath(frame.url)).toLowerCase() === expected;
  };
  const summary = (meta) => ({
    id: meta.id, title: meta.title, createdAt: meta.createdAt, endedAt: meta.endedAt, language: meta.language,
    chunks: meta.chunks, transcribed: meta.segments.length, failed: meta.failed ?? 0,
    preview: transcript(meta).slice(0, 220),
  });
  const handlers = {
    status: () => ({ root: ROOT, transcriber: transcriber.state() }),
    list: () => {
      let dirs = [];
      try { dirs = fs.readdirSync(ROOT).filter((d) => ID.test(d)); } catch {}
      return dirs.map((d) => { try { return summary(readMeta(d)); } catch { return null; } }).filter(Boolean)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    create: (event, input) => {
      const now = new Date();
      const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
      const id = `${stamp}-${crypto.randomBytes(3).toString('hex')}`;
      fs.mkdirSync(path.join(ROOT, id, 'trechos'), { recursive: true });
      const title = String(input.title || '').trim().slice(0, 140) || `Reunião ${now.toLocaleString('pt-BR')}`;
      const meta = { id, title, createdAt: now.toISOString(), endedAt: null, language: input.language === 'auto' ? null : (input.language || 'pt'), chunks: 0, segments: [], failed: 0 };
      writeMeta(meta);
      return summary(meta);
    },
    chunk: async (event, input) => {
      const id = checkId(input.id);
      const seq = Number(input.seq);
      if (!Number.isInteger(seq) || seq < 0) throw new Error('Trecho inválido.');
      const data = Buffer.from(String(input.data || ''), 'base64');
      if (!data.length || data.length > MAX_CHUNK_BYTES) throw new Error('Trecho de áudio vazio ou grande demais.');
      const file = path.join(ROOT, id, 'trechos', `${String(seq).padStart(4, '0')}.webm`);
      fs.writeFileSync(file, data);
      const meta = readMeta(id);
      meta.chunks = Math.max(meta.chunks, seq + 1);
      writeMeta(meta);
      transcriber.transcribe(file, meta.language).then((text) => {
        const fresh = readMeta(id);
        fresh.segments = fresh.segments.filter((s) => s.seq !== seq).concat({ seq, text, at: input.at ?? null });
        writeMeta(fresh);
      }).catch((error) => {
        const fresh = readMeta(id);
        fresh.failed = (fresh.failed ?? 0) + 1;
        fresh.lastError = error.message;
        writeMeta(fresh);
      });
      return { queued: true };
    },
    get: (event, input) => {
      const meta = readMeta(checkId(input.id));
      return { ...summary(meta), transcript: transcript(meta), lastError: meta.lastError ?? null, transcriber: transcriber.state() };
    },
    finish: (event, input) => {
      const meta = readMeta(checkId(input.id));
      meta.endedAt = meta.endedAt || new Date().toISOString();
      writeMeta(meta);
      return summary(meta);
    },
    save: (event, input) => {
      const meta = readMeta(checkId(input.id));
      if (typeof input.title === 'string' && input.title.trim()) meta.title = input.title.trim().slice(0, 140);
      writeMeta(meta);
      fs.writeFileSync(path.join(ROOT, meta.id, 'transcricao.md'), `# ${meta.title}\n\n${meta.createdAt}\n\n${transcript(meta)}\n`);
      return summary(meta);
    },
    remove: (event, input) => {
      const id = checkId(input.id);
      fs.rmSync(path.join(ROOT, id), { recursive: true, force: true });
      return true;
    },
    openFolder: async (event, input) => {
      const dir = input.id ? path.join(ROOT, checkId(input.id)) : ROOT;
      fs.mkdirSync(dir, { recursive: true });
      const error = await electron.shell.openPath(dir);
      if (error) throw new Error(error);
      return true;
    },
  };
  for (const [channel, handler] of Object.entries(handlers)) {
    electron.ipcMain.handle('mc-meetings:' + channel, async (event, input = {}) => {
      try {
        if (!authorized(event)) return { ok: false, error: 'Origem não autorizada.' };
        return { ok: true, data: await handler(event, input ?? {}) };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    });
  }
  electron.app?.on('before-quit', () => transcriber.stop());
  return { transcriber };
}

module.exports = { register, ROOT };
