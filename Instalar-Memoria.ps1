[CmdletBinding()]
param(
    [string]$MulticaPath,
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'MulticaMemoria'),
    [string]$Profile = 'desktop-api.multica.ai',
    [switch]$PrepareOnly,
    [switch]$Restore
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\Common.ps1')
if (($env:MULTICA_TASK_ID -or $env:MULTICA_TASK_CONFIG_ROOT) -and (-not $PrepareOnly -or $Restore)) { throw 'Execute manualmente na sessão do Windows, fora de uma tarefa de agente.' }
$desktopExe = Find-Multica $MulticaPath
$runtime = Get-EngineRuntime $desktopExe
$engine = Join-Path $PSScriptRoot 'scripts\memory-engine.cjs'
$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
if ($Restore) {
    $answer = Read-Host 'Remover a memória local da interface, preservando os arquivos exportados? [s/N]'
    if ($answer -notmatch '^[sS]$') { return }
    $daemonPid = Stop-VerifiedDesktop $desktopExe $Profile
    try { Invoke-ExtensionEngine $runtime $engine @{ operation='restore'; root=$InstallRoot } | Out-Null }
    finally { Open-MulticaDesktop $desktopExe $InstallRoot | Out-Null }
    Assert-DaemonPreserved $desktopExe $Profile $daemonPid
    Write-Host 'Interface anterior restaurada. As conversas exportadas foram preservadas.'
    return
}
$request = @{ operation='inspect'; root=$InstallRoot; archive=(Join-Path (Split-Path -Parent $desktopExe) 'resources\app.asar'); executable=$desktopExe }
$inspection = Invoke-ExtensionEngine $runtime $engine $request
if ($inspection.alreadyInstalled) { Write-Host 'Memória local já instalada. Abra o botão Memória local no Multica.'; return }
if (-not $PrepareOnly) {
    Write-Host 'Será adicionado o botão Memória local, preservando as personalizações atuais. A exportação começa somente quando você clicar Ativar e exportar.'
    $answer = Read-Host 'Salve os rascunhos. Instalar e reabrir a interface sem encerrar o daemon? [s/N]'
    if ($answer -notmatch '^[sS]$') { return }
}
$sourceRoot = Join-Path $InstallRoot 'code-v1'
New-Item -ItemType Directory -Path $sourceRoot -Force | Out-Null
foreach ($directory in @('src','lib','scripts')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $directory) -Destination $sourceRoot -Recurse -Force }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Instalar-Memoria.ps1') -Destination $sourceRoot -Force
$request.operation='prepare'; $request.sourceRoot=$sourceRoot
$prepared = Invoke-ExtensionEngine $runtime $engine $request
if ($PrepareOnly) { Write-Host 'Pacote validado; o aplicativo em uso não foi alterado.'; $prepared | ConvertTo-Json; return }
$daemonPid = Stop-VerifiedDesktop $desktopExe $Profile
try { Invoke-ExtensionEngine $runtime $engine @{operation='apply';transaction=$prepared.transaction} | Out-Null }
finally { Open-MulticaDesktop $desktopExe $InstallRoot | Out-Null }
Assert-DaemonPreserved $desktopExe $Profile $daemonPid
Write-Host 'Instalado. No Multica, abra Memória local e clique Ativar e exportar.'
