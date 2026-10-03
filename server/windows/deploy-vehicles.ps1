param(
  [string]$ServerRoot = 'C:\LumenSystem'
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$serverDir = Join-Path $ServerRoot 'server'
$liveApp = Join-Path $serverDir 'app.py'
$database = Join-Path $ServerRoot 'data\lumen-system.sqlite3'
$envFile = Join-Path $ServerRoot '.env'
$python = 'C:\Program Files\Python313\python.exe'
$files = @('app.py', 'schema.sql', 'fleet_schema.sql', 'migrate_vehicles.py')

foreach ($path in @($liveApp, $database, $envFile, $python)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "File richiesto mancante: $path" }
}
foreach ($name in $files) {
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "server\$name") -PathType Leaf)) { throw "Sorgente mancante: $name" }
}
$health = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/health' -TimeoutSec 5
if ($health.service -ne 'lumen-system-api') { throw 'La porta 8787 non appartiene a Lumen System.' }
$listener = Get-NetTCPConnection -LocalPort 8787 -State Listen | Select-Object -First 1
$serverProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'python.exe' OR Name = 'pythonw.exe'" | Where-Object {
  $_.CommandLine -and $_.CommandLine.IndexOf($liveApp, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
})
if (-not ($serverProcesses.ProcessId -contains $listener.OwningProcess)) {
  throw "Impossibile leggere il comando del server sulla porta 8787 (PID $($listener.OwningProcess)). Apri PowerShell come amministratore sul PC server e ripeti. Nessun processo e stato arrestato."
}

$backup = Join-Path $ServerRoot ('backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-vehicles')
New-Item -ItemType Directory -Path $backup | Out-Null
foreach ($name in $files) {
  $current = Join-Path $serverDir $name
  if (Test-Path -LiteralPath $current) { Copy-Item -LiteralPath $current -Destination (Join-Path $backup $name) }
}

# Load private settings into this process without printing them. Existing
# environment variables have precedence, as in start-server.ps1.
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
if (-not $env:LUMEN_API_TOKEN) { throw 'Chiave API del server non disponibile: deploy annullato.' }

foreach ($serverProcess in $serverProcesses) { Stop-Process -Id $serverProcess.ProcessId -Force -ErrorAction Stop }
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  if (-not (Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 500
}
if (Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue) {
  throw 'La porta 8787 e ancora occupata: aggiornamento interrotto.'
}

foreach ($name in $files) {
  Copy-Item -LiteralPath (Join-Path $projectRoot "server\$name") -Destination (Join-Path $serverDir $name) -Force
}
& $python (Join-Path $serverDir 'migrate_vehicles.py') --db $database --backup-dir $backup
if ($LASTEXITCODE -ne 0) { throw "Migrazione non riuscita. Backup in $backup; server fermo per proteggere i dati." }

$arguments = @($liveApp, '--bind', '0.0.0.0', '--port', '8787', '--db', $database, '--skip-db-init')
Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $ServerRoot -WindowStyle Hidden
$ready = $false
for ($attempt = 0; $attempt -lt 15; $attempt++) {
  Start-Sleep -Seconds 1
  try {
    $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8787/api/v1/vehicles' -Headers @{Authorization=('Bearer ' + $env:LUMEN_API_TOKEN)} -UseBasicParsing -TimeoutSec 3
    $vehicles = @((ConvertFrom-Json $response.Content).vehicles)
    if ($response.StatusCode -eq 200 -and $vehicles.Count -ge 3) { $ready = $true; break }
  } catch { }
}
if (-not $ready) { throw "Il nuovo server non risponde con i tre mezzi. Backup in $backup" }
Write-Output "Sezione Mezzi pronta sul server: $($vehicles.Count) mezzi."
Write-Output "Backup: $backup"
