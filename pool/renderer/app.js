// Painel do pool de contas: lê o estado via window.pool (preload) e redesenha os cards.
const REFRESH_MS = 60_000;
const WARN_PCT = 70;
const BAD_PCT = 90;

const POOLS = ['claude', 'codex', 'antigravity', 'copilot', 'hermes', 'opencode'];
const POOL_NAMES = { claude: 'Claude', codex: 'Codex', antigravity: 'Antigravity', copilot: 'Copilot', hermes: 'Hermes', opencode: 'OpenCode' };
const FAILOVER_POOLS = ['claude', 'codex', 'antigravity', 'copilot'];

const state = { claude: null, codex: null, antigravity: null, copilot: null, hermes: null, opencode: null, auto: null, config: { claude: null, codex: null, antigravity: null, copilot: null } };
const busy = new Set();

// ---------- helpers de DOM (sem innerHTML para dados vindos dos CLIs) ----------

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

function toast(message, isError = false) {
  const node = el('div', { class: `toast${isError ? ' bad' : ''}`, text: message });
  document.getElementById('toasts').append(node);
  setTimeout(() => node.remove(), isError ? 8000 : 4000);
}

const dialog = document.getElementById('dialog');

function showDialog(title, body, { confirm = null } = {}) {
  document.getElementById('dialog-title').textContent = title;
  document.getElementById('dialog-body').textContent = body;
  const ok = document.getElementById('dialog-ok');
  ok.hidden = !confirm;
  ok.textContent = confirm || 'Confirmar';
  document.getElementById('dialog-cancel').textContent = confirm ? 'Cancelar' : 'Fechar';
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true }));
}

function formatReset(iso) {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'reiniciando';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const rel = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  const abs = new Date(iso).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return `reinicia em ${rel} (${abs})`;
}

function maxUsed(account) {
  const measured = account.windows.filter((w) => typeof w.pct === 'number');
  if (account.status !== 'ok' || !measured.length) return null;
  return Math.max(...measured.map((w) => w.pct));
}

// ---------- chamadas ----------

async function call(fn, ...args) {
  const res = await fn(...args);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

async function act(key, label, fn, { reload = true } = {}) {
  if (busy.has(key)) return;
  busy.add(key);
  render();
  try {
    await fn();
    toast(label);
    if (reload) await loadAll();
  } catch (err) {
    toast(`${label}: falhou — ${err.message}`, true);
  } finally {
    busy.delete(key);
    render();
  }
}

async function loadPool(pool) {
  try {
    state[pool] = await call(window.pool[pool].list);
  } catch (err) {
    state[pool] = { error: err.message, accounts: [] };
  }
}

async function loadAll() {
  const refreshBtn = document.getElementById('refresh');
  refreshBtn.disabled = true;
  await Promise.all([
    loadPool('claude'),
    loadPool('codex'),
    loadPool('antigravity'),
    loadPool('copilot'),
    loadPool('hermes'),
    loadPool('opencode'),
    call(window.pool.auto.status).then((d) => { state.auto = d; }).catch(() => { state.auto = null; }),
    call(window.pool.claude.config).then((d) => { state.config.claude = d; }).catch(() => {}),
    call(window.pool.codex.config).then((d) => { state.config.codex = d; }).catch(() => {}),
    call(window.pool.antigravity.config).then((d) => { state.config.antigravity = d; }).catch(() => {}),
    call(window.pool.copilot.config).then((d) => { state.config.copilot = d; }).catch(() => {}),
  ]);
  refreshBtn.disabled = false;
  document.getElementById('updated').textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR')} · renova a cada ${REFRESH_MS / 1000}s`;
  render();
}

// ---------- ações ----------

function switchTo(pool, account) {
  return act(`${pool}:switch:${account.number}`, `${account.email} agora é a conta ativa`, () => call(window.pool[pool].switch, String(account.number)));
}

async function removeAccount(pool, account) {
  const poolName = pool === 'claude' ? 'cswap' : pool === 'codex' ? 'codex-auth' : pool === 'antigravity' ? 'Antigravity' : 'Copilot';
  const confirmed = await showDialog(
    'Remover conta do pool',
    `Remover ${account.email} do ${poolName}?\n\nO login salvo é apagado; para voltar será preciso logar de novo.`,
    { confirm: 'Remover' },
  );
  if (!confirmed) return;
  await act(`${pool}:remove:${account.number}`, `${account.email} removida`, () => call(window.pool[pool].remove, account.email));
}

async function redeemReset(account) {
  const usage = maxUsed(account);
  const confirmed = await showDialog(
    'Usar redefinição de limite',
    `Usar 1 das ${account.resetCredits} redefinições de ${account.email}?` +
      `\n\nUso atual: ${usage ?? '?'}%. A janela de uso dessa conta é zerada e o crédito é consumido (não tem volta).` +
      (account.active ? '' : '\n\nA conta vira ativa por alguns segundos para o resgate e depois a conta ativa anterior volta.'),
    { confirm: 'Usar redefinição' },
  );
  if (!confirmed) return;
  const key = `codex:reset:${account.number}`;
  if (busy.has(key)) return;
  busy.add(key);
  render();
  try {
    const result = await call(window.pool.codex.redeemReset, String(account.number));
    toast(`${result.email}: ${result.message}`, result.outcome !== 'reset');
    await loadAll();
  } catch (err) {
    toast(`Redefinição de ${account.email}: falhou — ${err.message}`, true);
  } finally {
    busy.delete(key);
    render();
  }
}

function toggleRotation(account) {
  const enable = account.disabled;
  return act(
    `claude:rot:${account.number}`,
    enable ? `${account.email} voltou para o rodízio` : `${account.email} saiu do rodízio`,
    () => call(enable ? window.pool.claude.enable : window.pool.claude.disable, String(account.number)),
  );
}

function switchBest(pool) {
  const data = state[pool];
  if (!data?.accounts?.length) return;
  if (pool === 'claude') {
    return act('claude:best', 'Claude trocou para a conta com mais cota', () => call(window.pool.claude.switchBest));
  }
  const best = data.accounts
    .filter((a) => !a.active && maxUsed(a) !== null)
    .sort((a, b) => maxUsed(a) - maxUsed(b))[0];
  const poolName = pool === 'codex' ? 'Codex' : pool === 'antigravity' ? 'Antigravity' : 'Copilot';
  if (!best) return toast(`Nenhuma outra conta do ${poolName} com leitura válida`, true);
  return switchTo(pool, best);
}

async function showLog(pool) {
  try {
    const text = await call(window.pool[pool].log);
    const titleMap = {
      claude: 'Claude (cswap)',
      codex: 'Codex (codex-auth-auto)',
      antigravity: 'Antigravity CLI (antigravity-auto)',
      copilot: 'GitHub Copilot (copilot-auto)',
    };
    showDialog(`Log do failover · ${titleMap[pool] || pool}`, text);
  } catch (err) {
    toast(`Não abriu o log: ${err.message}`, true);
  }
}

async function addAccount(pool) {
  try {
    await call(window.pool.login.open, pool);
    const helpText = {
      claude: 'Abri um terminal com "claude auth login" seguido de "cswap add".\n\nFaça o login no navegador com a conta nova; quando o terminal disser "Conta adicionada", clique em Atualizar.\n\nAtenção: o login troca a conta ativa do Claude nesta máquina.',
      codex: 'Abri um terminal com "codex-auth login".\n\nFaça o login no navegador com a conta nova; quando o terminal disser "Conta adicionada", clique em Atualizar.',
      antigravity: 'Abri o Antigravity Manager para adicionar ou autorizar contas Google.\n\nApós adicionar sua conta no manager, clique em Atualizar no Pool de Contas.',
      copilot: 'Abri um terminal com "copilot /login" para autorizar uma conta GitHub.\n\nConclua a autorização no navegador e depois clique em Atualizar no Pool de Contas.',
      hermes: 'Abri um terminal com a lista de credenciais do Hermes.\n\nPara adicionar, rode "hermes auth add <provedor>" (ex.: openrouter, anthropic, openai-codex) e depois clique em Atualizar.',
      opencode: 'Abri um terminal com "opencode auth login" para conectar um provedor.\n\nContas Google do plugin Antigravity entram pelo login do próprio plugin no OpenCode. Depois clique em Atualizar.',
    };
    showDialog('Adicionar conta', helpText[pool] || 'Conclua o login e clique em Atualizar.');
  } catch (err) {
    toast(`Não abriu o terminal: ${err.message}`, true);
  }
}

// ---------- render ----------

function meter(window_) {
  // Janela só informativa (sem limite conhecido): mostra o texto, sem barra.
  if (typeof window_.pct !== 'number') return el('div', { class: 'meter info' }, [el('div', { class: 'meter-row' }, [el('span', { text: window_.label })])]);
  const pct = Math.max(0, Math.min(100, Math.round(window_.pct)));
  const level = pct >= BAD_PCT ? 'bad' : pct >= WARN_PCT ? 'warn' : '';
  const fill = el('span', { class: level });
  fill.style.width = `${pct}%`;
  return el('div', { class: 'meter' }, [
    el('div', { class: 'meter-row' }, [
      el('span', { text: [window_.label, formatReset(window_.resetsAt)].filter(Boolean).join(' · ') }),
      el('b', { text: `${pct}% usado` }),
    ]),
    el('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, [fill]),
  ]);
}

// Botões específicos do Hermes (credencial por provedor) e do OpenCode (provedor / plugin Antigravity).
function hermesActions(account, btn) {
  const target = account.id;
  const out = [];
  if (account.priority !== 0) out.push(btn('prefer', 'Prioridade 1ª', 'Põe esta credencial para ser tentada primeiro', () =>
    act(`hermes:prefer:${account.number}`, `${account.email} agora é a 1ª do provedor`, () => call(window.pool.hermes.prefer, account.provider, target))));
  if (account.status !== 'ok') out.push(btn('reset', 'Limpar bloqueio', 'Zera o status de 429/cooldown desta credencial', () =>
    act(`hermes:reset:${account.number}`, `Bloqueio de ${account.email} limpo`, () => call(window.pool.hermes.reset, account.provider, target))));
  if (account.type === 'oauth') out.push(btn('refresh', 'Renovar token', 'Renova o token OAuth e limpa o cooldown', () =>
    act(`hermes:refresh:${account.number}`, `Token de ${account.email} renovado`, () => call(window.pool.hermes.refresh, account.provider, target))));
  out.push(btn('remove', 'Remover', null, async () => {
    const ok = await showDialog('Remover credencial do Hermes', `Remover ${account.email} do pool do Hermes?\n\nPara voltar será preciso adicionar de novo (hermes auth add ${account.provider}).`, { confirm: 'Remover' });
    if (ok) await act(`hermes:remove:${account.number}`, `${account.email} removida`, () => call(window.pool.hermes.remove, account.provider, target));
  }, 'danger'));
  return out;
}

function opencodeActions(account, btn) {
  const out = [];
  if (account.kind === 'agy') {
    if (!account.active) out.push(btn('switch', 'Usar esta', 'Vira a conta ativa do plugin Antigravity no OpenCode', () =>
      act(`opencode:switch:${account.number}`, `${account.email} agora é a ativa no OpenCode`, () => call(window.pool.opencode.agyUse, account.ref))));
    out.push(btn('rot', account.disabled ? 'Pôr no rodízio' : 'Tirar do rodízio', null, () =>
      act(`opencode:rot:${account.number}`, account.disabled ? `${account.email} voltou ao rodízio` : `${account.email} saiu do rodízio`, () => call(window.pool.opencode.agyToggle, account.ref))));
    if (account.status !== 'ok') out.push(btn('reset', 'Limpar bloqueio', 'Apaga os horários de rate limit salvos pelo plugin', () =>
      act(`opencode:reset:${account.number}`, `Bloqueio de ${account.email} limpo`, () => call(window.pool.opencode.agyClearLimits, account.ref))));
  } else if (account.kind === 'credential') {
    out.push(btn('remove', 'Desconectar', null, async () => {
      const ok = await showDialog('Desconectar do OpenCode', `Desconectar ${account.email}?\n\nA chave salva no OpenCode é apagada; para voltar use "+ Conexão".`, { confirm: 'Desconectar' });
      if (ok) await act(`opencode:remove:${account.number}`, `${account.email} desconectada`, () => call(window.pool.opencode.logout, account.provider, account.ref));
    }, 'danger'));
  }
  return out;
}

function standardActions(pool, account, key) {
  const actions = [];
  if (!account.active) {
    actions.push(el('button', { class: 'btn small', type: 'button', disabled: key('switch'), text: key('switch') ? 'Trocando…' : 'Usar esta', onclick: () => switchTo(pool, account) }));
  }
  if (pool === 'codex' && account.resetCredits > 0) {
    actions.push(el('button', { class: 'btn small', type: 'button', disabled: key('reset'), text: key('reset') ? 'Redefinindo…' : 'Usar redefinição', onclick: () => redeemReset(account) }));
  }
  if (pool === 'claude') {
    actions.push(el('button', { class: 'btn small ghost', type: 'button', disabled: key('rot'), text: account.disabled ? 'Pôr no rodízio' : 'Tirar do rodízio', onclick: () => toggleRotation(account) }));
  }
  if (account.status !== 'ok') {
    actions.push(el('button', { class: 'btn small', type: 'button', text: 'Relogar', onclick: () => addAccount(pool) }));
  }
  actions.push(el('button', { class: 'btn small danger', type: 'button', disabled: key('remove'), text: 'Remover', onclick: () => removeAccount(pool, account) }));
  return actions;
}

function card(pool, account) {
  const lightPool = pool === 'hermes' || pool === 'opencode';
  const badges = [];
  if (account.active) badges.push(el('span', { class: 'badge active', text: pool === 'hermes' ? 'em uso' : 'ativa' }));
  if (account.disabled) badges.push(el('span', { class: 'badge off', text: 'fora do rodízio' }));
  if (account.status !== 'ok') badges.push(el('span', { class: 'badge bad', text: lightPool ? 'bloqueada' : 'precisa de login' }));
  if (typeof account.resetCredits === 'number') {
    const n = account.resetCredits;
    badges.push(el('span', {
      class: `badge${n > 0 ? ' reset' : ''}`,
      title: 'Redefinições de limite disponíveis (zeram a janela de uso da conta)',
      text: `${n} ${n === 1 ? 'redefinição' : 'redefinições'}`,
    }));
  }
  if (account.plan) badges.push(el('span', { class: 'badge', text: account.plan }));

  const sub = [`#${account.number}`, account.alias, account.org, account.info].filter(Boolean).join(' · ');
  const key = (suffix) => busy.has(`${pool}:${suffix}:${account.number}`);
  const btn = (suffix, text, title, onclick, variant = '') =>
    el('button', { class: `btn small${variant ? ` ${variant}` : ''}`, type: 'button', title, disabled: key(suffix), text: key(suffix) ? '…' : text, onclick });
  const actions = pool === 'hermes' ? hermesActions(account, btn)
    : pool === 'opencode' ? opencodeActions(account, btn)
      : standardActions(pool, account, key);

  const extra = [];
  if (account.loginExpiresAt) {
    extra.push(el('div', { class: 'sub', text: `Login vale até ${new Date(account.loginExpiresAt).toLocaleDateString('pt-BR')}` }));
  }

  return el('article', { class: `card${account.active ? ' active' : ''}${account.disabled ? ' disabled' : ''}` }, [
    el('div', { class: 'card-head' }, [
      el('div', {}, [el('div', { class: 'email', text: account.email }), el('div', { class: 'sub', text: sub })]),
      el('div', { class: 'badges' }, badges),
    ]),
    ...(account.status === 'ok'
      ? account.windows.map(meter)
      : [el('div', { class: 'error-box', text: account.error || 'Sem leitura de uso — o login dessa conta expirou ou foi revogado.' })]),
    ...extra,
    el('div', { class: 'actions' }, actions),
  ]);
}

function renderPool(pool) {
  const section = document.getElementById(`pool-${pool}`);
  const cards = section.querySelector('[data-role="cards"]');
  const data = state[pool];
  cards.replaceChildren();

  if (!data) cards.append(el('div', { class: 'loading', text: 'Lendo contas…' }));
  else if (data.error) cards.append(el('div', { class: 'error-box', text: `Erro ao ler: ${data.error}` }));
  else if (!data.accounts.length) cards.append(el('div', { class: 'empty', text: 'Nenhuma conta no pool.' }));
  else data.accounts.forEach((a) => cards.append(card(pool, a)));

  // Hermes e OpenCode não têm tarefa de failover nem limite: esses controles só existem nos 4 primeiros.
  const toggle = section.querySelector('[data-role="auto"]');
  if (toggle) {
    const auto = state.auto?.[pool];
    const label = section.querySelector('[data-role="auto-label"]');
    toggle.checked = Boolean(auto?.running);
    toggle.disabled = !auto?.exists || busy.has(`${pool}:auto`);
    label.textContent = !auto ? 'Failover ?' : !auto.exists ? 'Failover (tarefa ausente)' : auto.running ? 'Failover ligado' : 'Failover desligado';
  }

  const threshold = section.querySelector('[data-role="threshold"]');
  if (threshold && document.activeElement !== threshold && state.config[pool]?.threshold) threshold.value = state.config[pool].threshold;

  const best = section.querySelector('[data-action="best"]');
  if (best) best.disabled = busy.has(`${pool}:best`) || !data?.accounts?.length;
  const resetAll = section.querySelector('[data-action="reset-all"]');
  if (resetAll) resetAll.disabled = busy.has(`${pool}:reset-all`) || !data?.accounts?.some((a) => a.status !== 'ok');
}

function renderSummary() {
  const stats = [];
  for (const pool of POOLS) {
    const accounts = state[pool]?.accounts || [];
    if (!accounts.length) continue;
    const name = POOL_NAMES[pool];
    const healthy = accounts.filter((a) => a.status === 'ok');
    if (pool === 'hermes' || pool === 'opencode') {
      stats.push(el('div', { class: 'stat' }, [el('b', { text: `${healthy.length}/${accounts.length}` }), `${name} livres`]));
      continue;
    }
    const free = healthy.filter((a) => maxUsed(a) < BAD_PCT);
    const active = accounts.find((a) => a.active);
    stats.push(el('div', { class: 'stat' }, [el('b', { text: `${free.length}/${accounts.length}` }), `${name} com cota`]));
    if (active) stats.push(el('div', { class: 'stat' }, [el('b', { text: `${maxUsed(active) ?? '?'}%` }), `${name} ativa`]));
    if (pool === 'codex') {
      const resets = accounts.reduce((sum, a) => sum + (a.resetCredits || 0), 0);
      stats.push(el('div', { class: 'stat' }, [el('b', { text: String(resets) }), 'Codex redefinições']));
    }
  }
  document.getElementById('summary').replaceChildren(...stats);
}

function render() {
  POOLS.forEach(renderPool);
  renderSummary();
}

// ---------- eventos ----------

document.getElementById('refresh').addEventListener('click', loadAll);

async function resetAllHermes() {
  const blocked = (state.hermes?.accounts || []).filter((a) => a.status !== 'ok');
  if (!blocked.length) return;
  await act('hermes:reset-all', `${blocked.length} bloqueio(s) do Hermes limpos`, async () => {
    for (const provider of new Set(blocked.map((a) => a.provider))) await call(window.pool.hermes.reset, provider);
  });
}

async function showHermesStatus() {
  try {
    showDialog('Hermes · status', await call(window.pool.hermes.status));
  } catch (err) {
    toast(`Status do Hermes falhou: ${err.message}`, true);
  }
}

function on(section, selector, event, handler) {
  const node = section.querySelector(selector);
  if (node) node.addEventListener(event, handler);
}

for (const pool of POOLS) {
  const section = document.getElementById(`pool-${pool}`);
  on(section, '[data-action="best"]', 'click', () => switchBest(pool));
  on(section, '[data-action="add"]', 'click', () => addAccount(pool));
  on(section, '[data-action="log"]', 'click', () => showLog(pool));
  on(section, '[data-action="terminal"]', 'click', () => call(window.pool.terminal.open, pool).catch((err) => toast(`Terminal: ${err.message}`, true)));
  on(section, '[data-action="folder"]', 'click', () => call(window.pool.folder.open, pool).catch((err) => toast(`Pasta: ${err.message}`, true)));
  on(section, '[data-action="run"]', 'click', () => act(`${pool}:run`, `Failover do ${POOL_NAMES[pool]} rodando agora`, () => call(window.pool.auto.runNow, pool)));
  on(section, '[data-action="reset-all"]', 'click', resetAllHermes);
  on(section, '[data-action="status"]', 'click', showHermesStatus);
  on(section, '[data-role="auto"]', 'change', (e) => {
    const enabled = e.target.checked;
    act(`${pool}:auto`, enabled ? 'Failover ligado' : 'Failover desligado', () => call(window.pool.auto.set, pool, enabled));
  });
  on(section, '[data-role="threshold"]', 'change', (e) => {
    const value = Number(e.target.value);
    act(`${pool}:threshold`, `Limite de troca agora é ${value}%`, () => call(window.pool[pool].setThreshold, value));
  });
}

render();
loadAll();
setInterval(loadAll, REFRESH_MS);
