'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
const stage = path.join(dist, 'memory-package-' + crypto.randomUUID());
fs.mkdirSync(stage, { recursive: true });
const files = ['Instalar-Memoria.cmd', 'Instalar-Memoria.ps1', 'scripts/Common.ps1', 'scripts/memory-engine.cjs', 'lib/asar.cjs', 'lib/memory-patch.cjs', 'src/main/chat-memory.cjs', 'src/ui/chat-memory-sync.js', 'src/ui/chat-memory-native.js', 'docs/memoria-local.md', 'LICENSE'];
for (const file of files) {
  const target = path.join(stage, file); fs.mkdirSync(path.dirname(target), { recursive: true });
  if (file.endsWith('.ps1')) fs.writeFileSync(target, '\uFEFF' + fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''));
  else if (file.endsWith('.cmd')) fs.writeFileSync(target, fs.readFileSync(path.join(root, file), 'utf8').replace(/\r?\n/g, '\r\n'));
  else fs.copyFileSync(path.join(root, file), target);
}
fs.copyFileSync(path.join(root, 'docs/memoria-local.md'), path.join(stage, 'LEIA-ME.md'));
const archive = path.join(dist, 'multica-memoria-local-1.0.0-windows-x64.zip');
execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; Get-ChildItem -LiteralPath $env:MEXT_MEMORY_STAGE | Compress-Archive -DestinationPath $env:MEXT_MEMORY_ZIP -Force"], { windowsHide: true, env: { ...process.env, MEXT_MEMORY_STAGE: stage, MEXT_MEMORY_ZIP: archive } });
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
fs.writeFileSync(archive + '.sha256', sha256 + '  ' + path.basename(archive) + '\n');
console.log(JSON.stringify({ archive, sha256 }));
