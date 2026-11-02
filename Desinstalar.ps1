[CmdletBinding()]
param(
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'MulticaExtensoes'),
    [switch]$Yes,
    [switch]$NoRestart
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\Common.ps1')
if ($env:MULTICA_TASK_ID -or $env:MULTICA_TASK_CONFIG_ROOT) { throw 'Execute a desinstalação manualmente na sessão do Windows, fora de uma tarefa de agente.' }
$state = Get-Content -LiteralPath (Join-Path $InstallRoot 'installation.json') -Raw | ConvertFrom-Json
$desktopExe = [IO.Path]::GetFullPath($state.executable)
$runtime = Get-EngineRuntime $desktopExe
$engine = Join-Path $PSScriptRoot 'lib\engine.cjs'
Invoke-ExtensionEngine $runtime $engine @{operation='restore-plan';root=$InstallRoot;archive=$state.archive;executable=$desktopExe} | Out-Null
if (-not $Yes) {
    $answer = Read-Host 'Restaurar o Multica original? Seus docs e configurações locais serão mantidos. [s/N]'
    if ($answer -notmatch '^[sS]$') { Write-Host 'Desinstalação cancelada.'; return }
}
if ($NoRestart -and @(Get-DesktopProcesses $desktopExe).Count) { throw 'Com -NoRestart a interface precisa estar fechada.' }
$daemonPid=$null
try {
    if (-not $NoRestart) { $daemonPid=Stop-VerifiedDesktop $desktopExe $state.profile }
    if (@(Get-DesktopProcesses $desktopExe).Count) { throw 'A interface está aberta. Nenhum pacote será restaurado.' }
    Invoke-ExtensionEngine $runtime $engine @{operation='restore';root=$InstallRoot;archive=$state.archive;executable=$desktopExe} | Out-Null
    if (-not $NoRestart) { Open-MulticaDesktop $desktopExe $InstallRoot | Out-Null }
    Assert-DaemonPreserved $desktopExe $state.profile $daemonPid
    Write-Host 'Multica original restaurado. Seus documentos e configurações permanecem na pasta data.'
} catch {
    if (-not $NoRestart -and -not @(Get-DesktopProcesses $desktopExe).Count) { Open-MulticaDesktop $desktopExe $InstallRoot | Out-Null }
    throw
}
