[CmdletBinding()]
param(
    [string]$MulticaPath,
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'MulticaExtensoes'),
    [string]$Profile = 'desktop-api.multica.ai',
    [switch]$Yes,
    [switch]$NoRestart,
    [switch]$PrepareOnly
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\Common.ps1')
if (-not [Environment]::Is64BitProcess) { throw 'Abra o PowerShell de 64 bits.' }
if (-not $PrepareOnly -and ($env:MULTICA_TASK_ID -or $env:MULTICA_TASK_CONFIG_ROOT)) { throw 'Execute este instalador manualmente na sessão do Windows, fora de uma tarefa de agente. Agentes podem validar com -PrepareOnly.' }
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'compatibility.json') -Raw | ConvertFrom-Json
$desktopExe = Find-Multica $MulticaPath
$runtime = Get-EngineRuntime $desktopExe
$engine = Join-Path $PSScriptRoot 'lib\engine.cjs'
$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
$request = @{operation='inspect';root=$InstallRoot;archive=(Join-Path (Split-Path -Parent $desktopExe) 'resources\app.asar');executable=$desktopExe}
$inspection = Invoke-ExtensionEngine $runtime $engine $request
if ($inspection.alreadyInstalled) { Write-Host "Multica Extensões $($manifest.extensionVersion) já está instalado e verificado."; return }
if ($NoRestart -and -not $PrepareOnly -and @(Get-DesktopProcesses $desktopExe).Count) { throw 'Com -NoRestart a interface do Multica precisa estar fechada.' }
Write-Host "Multica $($inspection.multicaVersion) compatível."
Write-Host "Extensões: $InstallRoot"
Write-Host 'Serão adicionados Pool de Contas IA, Marketplace Composio e Docs. Contas e credenciais não acompanham o pacote.'
if (-not $Yes -and -not $PrepareOnly) {
    $answer = Read-Host 'Salve os rascunhos na interface. Ela será reaberta sem encerrar o daemon verificado. Continuar? [s/N]'
    if ($answer -notmatch '^[sS]$') { Write-Host 'Instalação cancelada.'; return }
}
New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
$versionRoot = Join-Path $InstallRoot ('versions\' + $manifest.extensionVersion)
New-Item -ItemType Directory -Path $versionRoot -Force | Out-Null
foreach ($directory in @('src','pool','lib','scripts')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $directory) -Destination $versionRoot -Recurse -Force }
foreach ($filename in @('package.json','compatibility.json','Instalar.ps1','Desinstalar.ps1','README.md','LICENSE','NOTICE.md')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $filename) -Destination $versionRoot -Force }
$docsRoot = Join-Path $InstallRoot 'data\docs'
New-Item -ItemType Directory -Path $docsRoot -Force | Out-Null
foreach ($document in Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'docs') -Filter '*.md') {
    $target = Join-Path $docsRoot $document.Name
    if (-not (Test-Path -LiteralPath $target)) { Copy-Item -LiteralPath $document.FullName -Destination $target }
}
$request.operation='prepare';$request.sourceRoot=$versionRoot;$request.profile=$Profile
$prepared = Invoke-ExtensionEngine $runtime $engine $request
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Desinstalar.ps1') -Destination $InstallRoot -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'scripts') -Destination $InstallRoot -Recurse -Force
New-Item -ItemType Directory -Path (Join-Path $InstallRoot 'lib') -Force | Out-Null
foreach ($file in Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'lib') -File) { Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $InstallRoot 'lib') -Force }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'compatibility.json') -Destination $InstallRoot -Force
if ($PrepareOnly) {
    Write-Host 'Pacote preparado e validado. O app.asar em uso não foi alterado.'
    $prepared | ConvertTo-Json
    return
}
$daemonPid = $null
$reopen = -not $NoRestart
$applied = $false
try {
    if ($NoRestart -and @(Get-DesktopProcesses $desktopExe).Count) { throw 'Com -NoRestart a interface do Multica precisa estar fechada.' }
    if (-not $NoRestart) { $daemonPid = Stop-VerifiedDesktop $desktopExe $Profile }
    if (@(Get-DesktopProcesses $desktopExe).Count) { throw 'A interface está aberta. O pacote em uso foi preservado.' }
    $result = Invoke-ExtensionEngine $runtime $engine @{operation='apply';transaction=$prepared.transaction}
    $applied = $true
    if ($reopen) { $desktop = Open-MulticaDesktop $desktopExe $InstallRoot; Write-Host "Interface reaberta: PID $($desktop.Id)." }
    Assert-DaemonPreserved $desktopExe $Profile $daemonPid
    Write-Host 'Instalação concluída. Abra Docs e configure seu próprio Composio no Marketplace.'
    Write-Host "Desinstalação: $InstallRoot\Desinstalar.ps1"
} catch {
    $originalFailure = $_
    if (-not $applied) {
        try { Invoke-ExtensionEngine $runtime $engine @{operation='discard';transaction=$prepared.transaction} | Out-Null }
        catch { Write-Warning 'O temporário não pôde ser removido; consulte a transação na pasta de extensões.' }
    }
    if ($reopen -and -not @(Get-DesktopProcesses $desktopExe).Count) { Open-MulticaDesktop $desktopExe $InstallRoot | Out-Null }
    throw $originalFailure
}
