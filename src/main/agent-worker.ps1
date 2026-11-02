[CmdletBinding()]
param([ValidateSet('Protect','Read','Register','Run','Unregister')][string]$Mode,[string]$ConfigPath)
$ErrorActionPreference='Stop'
if($env:MULTICA_TASK_ID -or $env:MULTICA_TASK_CONFIG_ROOT){throw 'A ativação administrativa deve ser feita pelo proprietário na interface do desktop, não por uma tarefa de agente.'}
$config=Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8|ConvertFrom-Json
$entropy=[Text.Encoding]::UTF8.GetBytes('multica-extensoes-composio-v1')
$cipherPath=Join-Path (Split-Path -Parent $ConfigPath) 'agent-worker-key.dpapi'
$hash=[Security.Cryptography.SHA256]::Create()
try{$suffix=([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($ConfigPath)))).Replace('-','').Substring(0,12)}finally{$hash.Dispose()}
$taskName='MulticaExtensoes-Composio-'+$suffix
if($Mode -eq 'Protect' -or $Mode -eq 'Read'){
    Add-Type -AssemblyName System.Security
    [Console]::InputEncoding=[Text.Encoding]::UTF8
    [Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
    if($Mode -eq 'Protect'){
        $plain=[Console]::In.ReadToEnd()
        $protected=[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($plain),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
        [IO.File]::WriteAllBytes($cipherPath,$protected)
    }else{
        $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($cipherPath),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
        [Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))
    }
    return
}
$arguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$PSCommandPath+'" -Mode Run -ConfigPath "'+$ConfigPath+'"'
if($Mode -eq 'Register'){
    $existing=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if($existing -and $existing.Actions.Arguments -ne $arguments){throw 'Já existe uma tarefa com esse nome e outra configuração.'}
    if(-not $existing){
        $action=New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $arguments -WorkingDirectory $config.root
        $trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
        $principal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
        $settings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Sincroniza o MCP do Marketplace nos agentes do proprietário; não executa tarefas de agentes e não controla o daemon.'|Out-Null
    }
    [Console]::Out.Write($taskName)
    return
}
if($Mode -eq 'Unregister'){
    $existing=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if($existing -and $existing.Actions.Arguments -eq $arguments){Unregister-ScheduledTask -TaskName $taskName -Confirm:$false}
    return
}
$process=New-Object Diagnostics.Process
try{
    $process.StartInfo.FileName=$config.executable
    $process.StartInfo.Arguments='"'+(Join-Path $config.sourceRoot 'src\main\agent-worker.cjs')+'" "'+$ConfigPath+'"'
    $process.StartInfo.UseShellExecute=$false
    $process.StartInfo.CreateNoWindow=$true
    $process.StartInfo.RedirectStandardOutput=$true
    $process.StartInfo.RedirectStandardError=$true
    $process.StartInfo.StandardOutputEncoding=[Text.Encoding]::UTF8
    $process.StartInfo.StandardErrorEncoding=[Text.Encoding]::UTF8
    $process.StartInfo.EnvironmentVariables['ELECTRON_RUN_AS_NODE']='1'
    $process.StartInfo.EnvironmentVariables['ELECTRON_NO_ASAR']='1'
    if(-not $process.Start()){throw 'Não foi possível iniciar o sincronizador.'}
    $output=$process.StandardOutput.ReadToEndAsync()
    $errors=$process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $log=Join-Path (Split-Path -Parent $ConfigPath) 'agent-worker.log'
    $text=$output.GetAwaiter().GetResult()+$errors.GetAwaiter().GetResult()
    if((Test-Path -LiteralPath $log) -and (Get-Item -LiteralPath $log).Length -gt 1MB){[IO.File]::WriteAllText($log,'')}
    [IO.File]::AppendAllText($log,([DateTime]::UtcNow.ToString('o')+' '+$text+"`r`n"),(New-Object Text.UTF8Encoding($false)))
}finally{$process.Dispose()}
