# Prepara o repositorio GitHub privado de backups das conversas do Multica
# (botao "Salvar conversa no GitHub" da sidebar do chat). Idempotente:
# cria o repo se nao existir, clona em $RepoDir e grava data/session-backup.json.
param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')][string]$Remote,
    [string]$RepoDir = (Join-Path $env:USERPROFILE 'multica-sessoes-backup')
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
# Windows PowerShell 5 turns native stderr into terminating errors under Stop.
function Invoke-Native([scriptblock]$Command) { $ErrorActionPreference = 'Continue'; & $Command 2>&1 | Out-Null; return $LASTEXITCODE }
if ((Invoke-Native { gh auth status }) -ne 0) { throw 'gh nao autenticado: rode "gh auth login" antes.' }
if ((Invoke-Native { gh repo view $Remote --json name }) -ne 0) {
    gh repo create $Remote --private --description 'Backups das conversas do Multica Desktop (gerado pelo botao da sidebar do chat).' | Out-Null
}
if (-not (Test-Path (Join-Path $RepoDir '.git'))) {
    if ((Invoke-Native { gh repo clone $Remote $RepoDir }) -ne 0) { throw "Falha ao clonar $Remote" }
    if (-not (Get-ChildItem $RepoDir -Force | Where-Object Name -ne '.git')) {
        Set-Content (Join-Path $RepoDir 'README.md') "# Backups das conversas do Multica`n`nCada pasta em sessoes/AAAA-MM/ tem conversa.md (legivel) e sessao.json (dados completos, segredos mascarados).`n" -Encoding utf8
        Invoke-Native { git -C $RepoDir add README.md } | Out-Null
        Invoke-Native { git -C $RepoDir commit -q -m 'chore: estrutura inicial dos backups' } | Out-Null
        Invoke-Native { git -C $RepoDir branch -M main } | Out-Null
        if ((Invoke-Native { git -C $RepoDir push -q -u origin main }) -ne 0) { throw 'Falha no push inicial' }
    }
}
New-Item -ItemType Directory -Force (Join-Path $root 'data') | Out-Null
@{ repoDir = $RepoDir; remote = $Remote } | ConvertTo-Json | Set-Content (Join-Path $root 'data\session-backup.json') -Encoding utf8
Write-Output "Backup pronto: $Remote -> $RepoDir"
