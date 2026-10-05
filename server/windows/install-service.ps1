param(
  [string]$TaskName = 'LumenSystem Calendar Server',
  [string]$Database = (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'data\lumen-system.sqlite3'),
  [int]$Port = 8789
)

$ErrorActionPreference = 'Stop'
$serverDirectory = Split-Path -Parent $PSScriptRoot
$installRoot = Split-Path -Parent $serverDirectory
$appPath = Join-Path $serverDirectory 'app.py'
$envPath = Join-Path $installRoot '.env'

if (-not (Test-Path -LiteralPath $appPath -PathType Leaf)) { throw "Server non trovato: $appPath" }
if (-not (Test-Path -LiteralPath (Join-Path $installRoot 'web\index.html') -PathType Leaf)) {
  throw "Interfaccia web non trovata sotto $installRoot\web"
}
if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
  throw "Configurazione privata mancante: $envPath. Crea .env con LUMEN_API_TOKEN prima di installare il servizio."
}

$envEntries = @{}
foreach ($line in Get-Content -LiteralPath $envPath) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$' -and $Matches[1] -notmatch '^\s*#') {
    $envEntries[$Matches[1]] = $Matches[2].Trim([char]34, [char]39)
  }
}
$apiToken = $envEntries['LUMEN_API_TOKEN']
if (-not $apiToken) { $apiToken = [Environment]::GetEnvironmentVariable('LUMEN_API_TOKEN', 'Machine') }
if (-not $apiToken) { throw 'LUMEN_API_TOKEN non è configurato né in .env né tra le variabili di sistema.' }

$python = $null
if (Get-Command py -ErrorAction SilentlyContinue) {
  $candidate = (& py -3 -c "import sys; print(sys.executable)" 2>$null | Select-Object -Last 1)
  if ($LASTEXITCODE -eq 0 -and $candidate -and (Test-Path -LiteralPath $candidate)) { $python = $candidate.Trim() }
}
if (-not $python -and (Get-Command python -ErrorAction SilentlyContinue)) { $python = (Get-Command python).Source }
if (-not $python) { throw 'Python 3.11 o successivo non trovato. Installa Python e ripeti.' }

$version = & $python -c "import sys; print('%s.%s' % sys.version_info[:2])"
if ($LASTEXITCODE -ne 0 -or [version]$version -lt [version]'3.11') { throw "È richiesto Python 3.11 o successivo (rilevato $version)." }

$databasePath = [System.IO.Path]::GetFullPath($Database)
$null = New-Item -ItemType Directory -Path (Split-Path -Parent $databasePath) -Force
$actionArgs = '"{0}" --port {1} --db "{2}"' -f $appPath, $Port, $databasePath
$bindAddress = $envEntries['LUMEN_BIND']
if (-not $bindAddress) { $bindAddress = [Environment]::GetEnvironmentVariable('LUMEN_BIND', 'Machine') }
if ($bindAddress) { $actionArgs += ' --bind "{0}"' -f $bindAddress }
$action = New-ScheduledTaskAction -Execute $python -Argument $actionArgs -WorkingDirectory $installRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Avvia il server locale API e calendario Lumen System all'avvio di Windows."
Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null

# If the calendar is already running manually, hand the port to the scheduled
# task so the same task remains its owner after this installation.
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
  if (-not $owner -or $owner.CommandLine -notmatch [regex]::Escape($appPath)) {
    throw "La porta $Port è occupata da un processo diverso dal server Lumen System; non è stato terminato."
  }
  Stop-Process -Id $owner.ProcessId -Force
  for ($i = 0; $i -lt 40; $i++) {
    if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 250
  }
  if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    throw "La porta $Port è ancora occupata; il servizio è stato registrato ma non avviato."
  }
}

Start-ScheduledTask -TaskName $TaskName

$healthy = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2
    if ($response.ok -eq $true) { $healthy = $true; break }
  } catch { }
}
if (-not $healthy) { throw "Attività registrata ma il server non risponde su 127.0.0.1:$Port. Controlla la cronologia delle attività Windows." }

Write-Output ("Attività pianificata {0} installata e avviata." -f $TaskName)
Write-Output "Database: $databasePath"
Write-Output "Verifica: powershell -ExecutionPolicy Bypass -File `"$PSScriptRoot\manage-service.ps1`" -Action Status"
