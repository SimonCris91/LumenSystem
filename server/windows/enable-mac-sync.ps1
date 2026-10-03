param(
  [string]$ServerRoot = 'C:\LumenSystem'
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$sourceApp = Join-Path $projectRoot 'server\app.py'
$liveApp = Join-Path $ServerRoot 'server\app.py'
$envFile = Join-Path $ServerRoot '.env'
$python = 'C:\Program Files\Python313\python.exe'
$database = Join-Path $ServerRoot 'data\lumen-system.sqlite3'
$packageRoot = Join-Path $ServerRoot 'mac-setup'
$packageDir = Join-Path $packageRoot 'package'
$zipFile = Join-Path $packageRoot 'Lumen System-SketchUp-Mac.zip'

foreach ($file in @($sourceApp, $liveApp, $envFile, $python, $database)) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "File richiesto mancante: $file" }
}
if (-not (Select-String -LiteralPath $sourceApp -Pattern 'sketchup-agent/request' -Quiet)) {
  throw 'La sorgente del server non contiene il servizio Mac.'
}

$health = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/health' -TimeoutSec 5
if ($health.service -ne 'lumen-system-api') { throw 'La porta 8787 non appartiene a Lumen System.' }
$listener = Get-NetTCPConnection -LocalPort 8787 -State Listen | Select-Object -First 1
if (-not $listener) { throw 'Processo Lumen System non trovato sulla porta 8787.' }

$backup = Join-Path $ServerRoot ('backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-mac-sync')
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item -LiteralPath $liveApp -Destination (Join-Path $backup 'app.py')
Copy-Item -LiteralPath $envFile -Destination (Join-Path $backup '.env')

$existing = Select-String -LiteralPath $envFile -Pattern '^LUMEN_SKETCHUP_AGENT_TOKEN=(.*)$' | Select-Object -Last 1
if ($existing) {
  $agentToken = $existing.Matches[0].Groups[1].Value.Trim().Trim('"', "'")
  if (-not $agentToken) { throw 'La chiave Mac presente in .env e vuota.' }
} else {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  $agentToken = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  [System.IO.File]::AppendAllText($envFile, [Environment]::NewLine + 'LUMEN_SKETCHUP_AGENT_TOKEN=' + $agentToken + [Environment]::NewLine)
}

# Load private server settings without displaying them. Existing environment
# variables keep precedence, as in start-server.ps1.
foreach ($line in Get-Content -LiteralPath $envFile) {
  $entry = ([string]$line).Trim()
  if (-not $entry -or $entry.StartsWith('#') -or $entry -notmatch '=') { continue }
  $name, $value = $entry -split '=', 2
  $name = $name.Trim()
  $value = $value.Trim()
  if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  if ($name -match '^[A-Za-z_][A-Za-z0-9_]*$' -and -not (Test-Path "Env:$name")) {
    Set-Item -Path "Env:$name" -Value $value
  }
}
if (-not $env:LUMEN_API_TOKEN) { throw 'Chiave API del server non disponibile: riavvio annullato.' }
$env:LUMEN_SKETCHUP_AGENT_TOKEN = $agentToken
Copy-Item -LiteralPath $sourceApp -Destination $liveApp -Force

$serverProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'python.exe' OR Name = 'pythonw.exe'" | Where-Object {
  $_.CommandLine -and $_.CommandLine.IndexOf($liveApp, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
})
if (-not ($serverProcesses.ProcessId -contains $listener.OwningProcess)) {
  throw "Impossibile identificare il processo sulla porta 8787 (PID $($listener.OwningProcess)): arresto annullato."
}
foreach ($serverProcess in $serverProcesses) {
  Stop-Process -Id $serverProcess.ProcessId -Force -ErrorAction Stop
}
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  if (-not (Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 500
}
if (Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue) {
  throw 'La porta 8787 e ancora occupata dopo l arresto: riavvio annullato.'
}
$arguments = @($liveApp, '--bind', '0.0.0.0', '--port', '8787', '--db', $database, '--skip-db-init')
Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $ServerRoot -WindowStyle Hidden

$ready = $false
for ($attempt = 0; $attempt -lt 15; $attempt++) {
  Start-Sleep -Seconds 1
  try {
    $check = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/health' -TimeoutSec 2
    if ($check.service -eq 'lumen-system-api') { $ready = $true; break }
  } catch { }
}
if (-not $ready) {
  $failedListener = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($failedListener) { Stop-Process -Id $failedListener.OwningProcess -ErrorAction SilentlyContinue }
  Copy-Item -LiteralPath (Join-Path $backup 'app.py') -Destination $liveApp -Force
  Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $ServerRoot -WindowStyle Hidden
  throw "Nuovo server non avviato; ripristinato il codice precedente. Backup in $backup"
}
$agentCheck = Invoke-WebRequest -Uri 'http://127.0.0.1:8787/api/v1/sketchup-agent/request' -Headers @{'X-LM-Sketchup-Agent' = $agentToken} -UseBasicParsing -TimeoutSec 5
if ($agentCheck.StatusCode -ne 200 -or $agentCheck.Content -notmatch '^\d+ \d+$') {
  throw 'Il servizio Mac non ha risposto correttamente dopo il riavvio.'
}

New-Item -ItemType Directory -Path $packageDir -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'mac\install.command') -Destination (Join-Path $packageDir 'install.command') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'mac\sketchup-sync.sh') -Destination (Join-Path $packageDir 'sketchup-sync.sh') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'mac\README.md') -Destination (Join-Path $packageDir 'README.md') -Force
[System.IO.File]::WriteAllText((Join-Path $packageDir 'agent-token.txt'), $agentToken + "`n", (New-Object System.Text.UTF8Encoding($false)))
if (Test-Path -LiteralPath $zipFile) { Remove-Item -LiteralPath $zipFile -Force }
Compress-Archive -Path (Join-Path $packageDir '*') -DestinationPath $zipFile -CompressionLevel Optimal

Write-Output "Server Mac pronto. Pacchetto riservato: $zipFile"
Write-Output 'Trasferisci il pacchetto sul Mac ed estrailo. In Terminale esegui bash install.command, poi inserisci l indirizzo HTTPS attuale del server.'
Write-Output "Backup: $backup"
