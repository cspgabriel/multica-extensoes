Set-StrictMode -Version 2

function Find-Multica([string]$RequestedPath) {
    $candidates = @()
    if ($RequestedPath) { $candidates += $RequestedPath }
    else {
        $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\@multicadesktop\Multica.exe')
        $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\Multica\Multica.exe')
    }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Container) { $candidate = Join-Path $candidate 'Multica.exe' }
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            $resolved = (Resolve-Path -LiteralPath $candidate).Path
            if ([IO.Path]::GetFileName($resolved) -ine 'Multica.exe') { throw 'Selecione o arquivo Multica.exe.' }
            if (-not (Test-Path -LiteralPath (Join-Path (Split-Path -Parent $resolved) 'resources\app.asar'))) { throw 'O Multica selecionado não contém resources\app.asar.' }
            return $resolved
        }
    }
    throw 'Multica não encontrado. Execute novamente com -MulticaPath apontando para Multica.exe.'
}

function Get-EngineRuntime([string]$DesktopExe) {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($node) {
        $nodeVersion = & $node.Source -p 'process.versions.node'
        if ($LASTEXITCODE -eq 0 -and [int]($nodeVersion.Split('.')[0]) -ge 22) { return @{ Path=$node.Source; Electron=$false } }
    }
    # Read, never change, the Electron fuse wire before using its Node runtime.
    $bytes = [IO.File]::ReadAllBytes($DesktopExe)
    $text = [Text.Encoding]::ASCII.GetString($bytes)
    $sentinel = 'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'
    $index = $text.IndexOf($sentinel, [StringComparison]::Ordinal)
    if ($index -lt 0 -or $index -ne $text.LastIndexOf($sentinel, [StringComparison]::Ordinal)) { throw 'Instale Node.js 22 ou superior para verificar este executável.' }
    $start = $index + $sentinel.Length
    if ($bytes[$start] -ne 1 -or $bytes[$start+1] -lt 5 -or $bytes[$start+2] -ne 49) { throw 'O Node embutido não está disponível. Instale Node.js 22 ou superior; nenhuma proteção será desativada.' }
    return @{ Path=$DesktopExe; Electron=$true }
}

function Invoke-ExtensionEngine($Runtime, [string]$EnginePath, $Request) {
    $requestFile = Join-Path ([IO.Path]::GetTempPath()) ('multica-extensoes-' + [Guid]::NewGuid().ToString('N') + '.json')
    $oldElectron = [Environment]::GetEnvironmentVariable('ELECTRON_RUN_AS_NODE','Process')
    try {
        [IO.File]::WriteAllText($requestFile, ($Request | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
        if ($Runtime.Electron) { [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE','1','Process') }
        $output = & $Runtime.Path $EnginePath --request $requestFile
        $exitCode = $LASTEXITCODE
        $result = ($output -join "`n") | ConvertFrom-Json
        if ($exitCode -ne 0 -or -not $result.ok) { throw $result.error }
        return $result.data
    } finally {
        [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE',$oldElectron,'Process')
        if (Test-Path -LiteralPath $requestFile) { Remove-Item -LiteralPath $requestFile -Force }
    }
}

function Get-DesktopProcesses([string]$DesktopExe) {
    @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $DesktopExe -and $_.CommandLine -notmatch '--type=' })
}

function Stop-VerifiedDesktop([string]$DesktopExe, [string]$Profile) {
    $interfaces = @(Get-DesktopProcesses $DesktopExe)
    if (-not $interfaces.Count) { return $null }
    if ($interfaces.Count -ne 1) { throw 'Mais de uma interface principal foi encontrada. Nenhum processo foi encerrado.' }
    $cli = Join-Path (Split-Path -Parent $DesktopExe) 'resources\app.asar.unpacked\resources\bin\multica.exe'
    if (-not (Test-Path -LiteralPath $cli)) { throw 'Não foi possível verificar o daemon. Feche a interface quando suas tarefas terminarem e tente novamente.' }
    $output = & $cli --profile $Profile daemon status --output json
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível verificar o daemon. A instalação não encerrará nenhum processo.' }
    $daemon = ($output -join "`n") | ConvertFrom-Json
    if ($daemon.status -ne 'running' -or -not $daemon.pid) { throw 'O daemon não pôde ser confirmado. Feche a interface quando suas tarefas terminarem e tente novamente.' }
    $desktopProcessId = [int]$interfaces[0].ProcessId
    if ($desktopProcessId -eq [int]$daemon.pid) { throw 'PID protegido: daemon. Operação recusada.' }
    $verified = Get-CimInstance Win32_Process -Filter "ProcessId=$desktopProcessId"
    if ($verified.ExecutablePath -ne $DesktopExe -or $verified.CommandLine -match '--type=') { throw 'O processo da interface mudou. Operação recusada.' }
    Stop-Process -Id $desktopProcessId -Force
    Wait-Process -Id $desktopProcessId -ErrorAction SilentlyContinue
    return [int]$daemon.pid
}

function Open-MulticaDesktop([string]$DesktopExe, [string]$InstallRoot) {
    Start-Process -FilePath $DesktopExe -WorkingDirectory $InstallRoot -PassThru -RedirectStandardOutput (Join-Path $InstallRoot 'desktop.stdout.log') -RedirectStandardError (Join-Path $InstallRoot 'desktop.stderr.log')
}

function Assert-DaemonPreserved([string]$DesktopExe, [string]$Profile, $BeforePid) {
    if ($null -eq $BeforePid) { return }
    $cli = Join-Path (Split-Path -Parent $DesktopExe) 'resources\app.asar.unpacked\resources\bin\multica.exe'
    $output = & $cli --profile $Profile daemon status --output json
    if ($LASTEXITCODE -ne 0) { throw 'A instalação terminou, mas não foi possível confirmar o daemon. Consulte os logs.' }
    $after = ($output -join "`n") | ConvertFrom-Json
    if ([int]$after.pid -ne [int]$BeforePid -or $after.status -ne 'running') { throw 'O PID do daemon mudou durante a instalação. Consulte os logs antes de iniciar novas tarefas.' }
}
