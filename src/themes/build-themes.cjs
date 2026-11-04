'use strict';
// Gera src/themes/themes.css a partir de src/themes/catalogue.js.
// Uso: node src/themes/build-themes.cjs   (apenas escreve themes.css ao lado deste arquivo)
const fs = require('node:fs');
const path = require('node:path');
const C = require('./catalogue.js');

// Mapeamento fixo dos tokens do Multica e das superfícies das extensões (módulos e Pool).
const STATIC_TAIL = String.raw`
:root[data-multica-theme]:not([data-theme-surface]) {
  --app-shell: var(--mext-palette-canvas);
  --page-canvas: var(--mext-palette-canvas);
  --background: var(--mext-palette-canvas);
  --foreground: var(--mext-palette-text);
  --surface: var(--mext-palette-surface);
  --surface-foreground: var(--mext-palette-text);
  --surface-raised: var(--mext-palette-raised);
  --surface-hover: var(--mext-palette-hover);
  --surface-selected: var(--mext-palette-selected);
  --surface-selected-foreground: var(--mext-palette-text);
  --surface-border: var(--mext-palette-border);
  --card: var(--mext-palette-surface);
  --card-foreground: var(--mext-palette-text);
  --popover: var(--mext-palette-raised);
  --popover-foreground: var(--mext-palette-text);
  --primary: var(--mext-palette-accent);
  --primary-foreground: var(--mext-palette-accent-text);
  --secondary: var(--mext-palette-hover);
  --secondary-foreground: var(--mext-palette-text);
  --muted: var(--mext-palette-hover);
  --muted-foreground: var(--mext-palette-muted);
  --faint-foreground: var(--mext-palette-muted);
  --accent: var(--mext-palette-selected);
  --accent-foreground: var(--mext-palette-text);
  --border: var(--mext-palette-border);
  --input: var(--mext-palette-border);
  --ring: var(--mext-palette-accent);
  --sidebar: var(--mext-palette-surface);
  --sidebar-foreground: var(--mext-palette-text);
  --sidebar-primary: var(--mext-palette-accent);
  --sidebar-primary-foreground: var(--mext-palette-accent-text);
  --sidebar-accent: var(--mext-palette-selected);
  --sidebar-accent-foreground: var(--mext-palette-text);
  --sidebar-border: var(--mext-palette-border);
  --sidebar-ring: var(--mext-palette-accent);
  --brand: var(--mext-palette-accent);
  --brand-foreground: var(--mext-palette-accent-text);
  --destructive: var(--mext-palette-danger);
  --success: var(--mext-palette-success);
  --warning: var(--mext-palette-warning);
  --info: var(--mext-palette-info);
  --priority-high: var(--mext-palette-warning);
  --tooltip: var(--mext-palette-accent);
  --chart-1: var(--mext-palette-accent);
  --chart-2: var(--mext-palette-info);
  --chart-3: var(--mext-palette-success);
  --chart-4: var(--mext-palette-warning);
  --chart-5: var(--mext-palette-danger);
  --sidebar-wrapper-fill: var(--sidebar);
}
:root[data-multica-theme][data-theme-surface="module"] {
  --ink: var(--mext-palette-text);
  --muted: var(--mext-palette-muted);
  --line: var(--mext-palette-border);
  --accent: var(--mext-palette-accent);
  --soft: var(--mext-palette-selected);
}
:root[data-multica-theme][data-theme-surface="pool"] {
  --bg: var(--mext-palette-canvas);
  --surface: var(--mext-palette-surface);
  --surface-2: var(--mext-palette-hover);
  --border: var(--mext-palette-border);
  --text: var(--mext-palette-text);
  --muted: var(--mext-palette-muted);
  --accent: var(--mext-palette-accent);
  --ok: var(--mext-palette-success);
  --warn: var(--mext-palette-warning);
  --bad: var(--mext-palette-danger);
}
:root[data-multica-theme][data-theme-surface] { background: var(--mext-palette-canvas); color: var(--mext-palette-text); }
:root[data-multica-theme][data-theme-surface] body { background: var(--mext-palette-canvas); color: var(--mext-palette-text); }
:root[data-multica-theme][data-theme-surface="module"] :is(.topbar,.app-card,.connections,.empty,.search,.field input,.field select,.field textarea,.setup-filters select,.editor,dialog,.docs-main) { background: var(--mext-palette-surface); color: var(--ink); border-color: var(--line); }
:root[data-multica-theme][data-theme-surface="module"] :is(.button,.chip,.doc-link) { background: transparent; color: var(--ink); border-color: var(--line); }
:root[data-multica-theme][data-theme-surface="module"] :is(.button:hover,.chip:hover,.doc-link:hover) { background: var(--mext-palette-hover); }
:root[data-multica-theme][data-theme-surface="module"] .button.primary { background: var(--accent); color: var(--mext-palette-accent-text); border-color: var(--accent); }
:root[data-multica-theme][data-theme-surface="module"] .button.danger { color: var(--mext-palette-danger); }
:root[data-multica-theme][data-theme-surface="module"] :is(.eyebrow,.brand-icon) { color: var(--accent); }
:root[data-multica-theme][data-theme-surface="module"] :is(.setup-tag,.setup-tag.panel-tag) { background: var(--mext-palette-hover); color: var(--muted); border-color: var(--line); }
:root[data-multica-theme][data-theme-surface="module"] :is(.chip.active,.doc-link.active) { background: var(--soft); color: var(--ink); }
:root[data-multica-theme][data-theme-surface="module"] :is(.docs-nav,.connection-item,.local-badge,.prose pre,.prose code) { background: var(--mext-palette-hover); color: var(--ink); border-color: var(--line); }
:root[data-multica-theme][data-theme-surface="module"] :is(.help,.brand,.hero p,.app-card p,.app-card small,.connection-item span,.connection-item small,.field,.prose,.doc-meta,.doc-meta small,.doc-meta span,.editor-hint,.card-tags,.tag,.footer-note,.catalogue-toolbar,.tool-list p,.detail-description,.modal-state,.modal-head p,.close,.history-row) { color: var(--muted); }
:root[data-multica-theme][data-theme-surface="module"] :is(h1,h2,h3,.section-heading,.prose h1,.prose h2,.prose h3,.agent-access-head strong,.catalogue-toolbar strong,.setup-filters label,.connections summary) { color: var(--ink); }
:root[data-multica-theme][data-theme-surface="module"] :is(.card-footer,.doc-toolbar,.tool-list li,.history-row,.tag,.logo) { border-color: var(--line); }
:root[data-multica-theme][data-theme-surface="module"] :is(.catalogue-state,.logo-fallback) { background: var(--mext-palette-hover); color: var(--ink); border-color: var(--line); }
:root[data-multica-theme][data-theme-surface="module"] .connected { background: color-mix(in srgb,var(--mext-palette-success) 12%,var(--mext-palette-surface)); color: var(--mext-palette-success); }
:root[data-multica-theme][data-theme-surface="module"] .error { background: color-mix(in srgb,var(--mext-palette-danger) 10%,var(--mext-palette-surface)); color: var(--mext-palette-danger); border-color: var(--mext-palette-danger); }
:root[data-multica-theme][data-theme-surface="module"] .skeleton { background: var(--mext-palette-hover); border-color: var(--line); }
:root[data-multica-theme][data-theme-surface] :is(button,input,textarea,select,a):focus-visible { outline-color: var(--mext-palette-accent); }
:root[data-multica-theme][data-theme-surface="pool"] .btn.primary { background: var(--accent); color: var(--mext-palette-accent-text); }
:root[data-multica-theme][data-theme-surface="pool"] .badge.active { color: var(--mext-palette-accent-text); }
:root[data-multica-theme][data-theme-surface="pool"] .toast.bad { color: var(--mext-palette-canvas); }
:root[data-multica-theme][data-theme-surface="pool"] .track::after { background: var(--mext-palette-text); }
:root[data-multica-theme][data-theme-surface="pool"] .switch input:checked + .track::after { background: var(--mext-palette-canvas); }
`;

const paletteVars = [
  ['canvas','canvas'],['surface','surface'],['raised','raised'],['hover','hover'],['selected','selected'],
  ['text','text'],['muted','muted'],['border','border'],['accent','accent'],['accent-text','accentText'],
  ['danger','danger'],['success','success'],['warning','warning'],['info','info'],
];
// Barra lateral (chrome). Temas clássicos reproduzem a própria paleta, para que a prévia
// de um tema nunca herde o gradiente do tema ativo na página.
function chromeOf(theme) {
  const p = theme.palette, c = theme.chrome;
  if (!c) return {bg:p.canvas,solid:p.surface,sidebar:p.surface,text:p.text,muted:p.muted,hover:p.hover,selected:p.selected,border:p.border,accent:p.accent,'accent-text':p.accentText};
  return {bg:c.background,solid:c.solid,sidebar:'transparent',text:c.text,muted:c.muted,hover:c.hover,selected:c.selected,border:c.border,accent:c.accent,'accent-text':c.accentText};
}
function themeBlock(theme) {
  const lines = paletteVars.map(([css,key]) => `  --mext-palette-${css}: ${theme.palette[key]};`);
  for (const [key,value] of Object.entries(chromeOf(theme))) lines.push(`  --mext-chrome-${key}: ${value};`);
  lines.push(`  color-scheme: ${theme.mode};`);
  return `:root[data-multica-theme="${theme.id}"], [data-theme-preview="${theme.id}"] {\n${lines.join('\n')}\n}`;
}

// Tokens do Multica que mudam dentro da moldura colorida (barra lateral, abas e barra de janela)
// e voltam à paleta do conteúdo dentro da área de trabalho.
const shellTokens = [
  // [token, valor na moldura, valor restaurado no conteúdo]
  ['--foreground','text','text'],
  ['--muted-foreground','muted','muted'],
  ['--faint-foreground','muted','muted'],
  ['--primary','accent','accent'],
  ['--primary-foreground','accent-text','accent-text'],
  ['--brand','accent','accent'],
  ['--brand-foreground','accent-text','accent-text'],
  ['--ring','text','accent'],
  ['--muted','hover','hover'],
  ['--secondary','hover','hover'],
  ['--secondary-foreground','text','text'],
  ['--accent','selected','selected'],
  ['--accent-foreground','text','text'],
  ['--background','hover','canvas'],
  ['--surface','hover','surface'],
  ['--surface-foreground','text','text'],
  ['--surface-raised','hover','raised'],
  ['--surface-hover','hover','hover'],
  ['--surface-selected','selected','selected'],
  ['--surface-selected-foreground','text','text'],
  ['--surface-border','border','border'],
  ['--border','border','border'],
  ['--input','border','border'],
  ['--sidebar','solid','surface'],
  ['--sidebar-foreground','text','text'],
  ['--sidebar-primary','accent','accent'],
  ['--sidebar-primary-foreground','accent-text','accent-text'],
  ['--sidebar-accent','selected','selected'],
  ['--sidebar-accent-foreground','text','text'],
  ['--sidebar-border','border','border'],
  ['--sidebar-ring','text','accent'],
];
function shellBlock(colored) {
  const list = colored.map(theme => `[data-multica-theme="${theme.id}"]`).join(',');
  const root = `:root:is(${list}):not([data-theme-surface])`;
  const frame = `${root} :is([data-slot="sidebar-wrapper"],[data-slot="sidebar"][data-mobile="true"])`;
  const content = `${root} [data-slot="sidebar-wrapper"] :is(.bg-page-canvas,[data-tab-frame]:has([data-tab-active="true"]))`;
  return [
    '/* Barra lateral colorida: gradiente ou cor sólida na moldura, conteúdo com a paleta clara/escura do tema. */',
    `${root} {\n  --app-shell: var(--mext-chrome-solid);\n  --sidebar: var(--mext-chrome-solid);\n}`,
    `${frame} {\n${shellTokens.map(([token,chrome]) => `  ${token}: var(--mext-chrome-${chrome});`).join('\n')}\n  color: var(--mext-chrome-text);\n}`,
    `${root} [data-slot="sidebar-wrapper"], ${root} [data-slot="sidebar-wrapper"] .bg-\\(--sidebar-wrapper-fill\\) {\n  background: var(--mext-chrome-bg);\n  background-attachment: fixed;\n}`,
    `${root} [data-slot="sidebar"][data-mobile="true"] { background: var(--mext-chrome-bg); }`,
    `${root} [data-slot="sidebar-wrapper"] [data-slot="sidebar-inner"] { background: transparent; }`,
    `${content} {\n${shellTokens.map(([token,,restore]) => `  ${token}: var(--mext-palette-${restore});`).join('\n')}\n  color: var(--mext-palette-text);\n}`,
  ].join('\n');
}

const colored = C.themes.filter(theme => theme.chrome);
const css = [
  '/* Gerado por node src/themes/build-themes.cjs. Edite src/themes/catalogue.js e rode o gerador. */',
  ...C.themes.map(themeBlock),
  '',
  STATIC_TAIL.trimEnd(),
  shellBlock(colored),
  '',
].join('\n');
fs.writeFileSync(path.join(__dirname, 'themes.css'), css);
console.log(`themes.css: ${C.themes.length} temas (${colored.length} com barra lateral colorida).`);
