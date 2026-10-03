param(
  [string]$SourceRoot = 'C:\LumenSystem\source',
  [string]$ProductionRoot = 'C:\LumenSystem',
  [string]$Branch = 'main'
)

$ErrorActionPreference = 'Stop'
$logRoot = Join-Path $ProductionRoot 'logs'
$logPath = Join-Path $logRoot 'github-sync.log'
$lockPath = Join-Path $ProductionRoot 'github-sync.lock'
New-Item -ItemType Directory -Force $logRoot | Out-Null

function Log([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  Add-Content -LiteralPath $logPath -Value $line
}

if (Test-Path $lockPath) { Log 'Sync già in esecuzione; uscita.'; exit 0 }
New-Item -ItemType File -Path $lockPath -Force | Out-Null
try {
  if (-not (Test-Path (Join-Path $SourceRoot '.git'))) { throw "Checkout GitHub mancante: $SourceRoot" }
  $git = (Get-Command git -ErrorAction Stop).Source
  $savedPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $fetchOutput = @(& $git -C $SourceRoot fetch --prune origin $Branch 2>&1)
  $fetchExit = $LASTEXITCODE
  $ErrorActionPreference = $savedPreference
  $fetchOutput | ForEach-Object { Log ([string]$_) }
  if ($fetchExit -ne 0) { throw 'Fetch GitHub non riuscito.' }

  $local = (& $git -C $SourceRoot rev-parse HEAD).Trim()
  $remote = (& $git -C $SourceRoot rev-parse "origin/$Branch").Trim()
  if ($local -eq $remote) { Log "Nessun aggiornamento ($local)."; exit 0 }
  $ancestor = & $git -C $SourceRoot merge-base --is-ancestor HEAD "origin/$Branch"
  if ($LASTEXITCODE -ne 0) { throw 'Checkout locale divergente: nessun force reset eseguito.' }
  $savedPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $resetOutput = @(& $git -C $SourceRoot reset --hard "origin/$Branch" 2>&1)
  $resetExit = $LASTEXITCODE
  $ErrorActionPreference = $savedPreference
  $resetOutput | ForEach-Object { Log ([string]$_) }
  if ($resetExit -ne 0) { throw 'Aggiornamento checkout non riuscito.' }

  $serverSource = Join-Path $SourceRoot 'server'
  $webSource = Join-Path $SourceRoot 'web'
  if (-not (Test-Path (Join-Path $serverSource 'app.py')) -or -not (Test-Path (Join-Path $webSource 'index.html'))) { throw 'Il commit non contiene server/app.py e web/index.html.' }
  $port = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($port) { Stop-Process -Id $port.OwningProcess -Force; Start-Sleep -Seconds 2 }
  $backup = Join-Path $ProductionRoot ('backup-code-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Force $backup | Out-Null
  Copy-Item (Join-Path $ProductionRoot 'server') (Join-Path $backup 'server') -Recurse -Force -ErrorAction SilentlyContinue
  Copy-Item (Join-Path $ProductionRoot 'web') (Join-Path $backup 'web') -Recurse -Force -ErrorAction SilentlyContinue
  Copy-Item $serverSource (Join-Path $ProductionRoot 'server') -Recurse -Force
  Copy-Item $webSource (Join-Path $ProductionRoot 'web') -Recurse -Force
  $db = Join-Path $ProductionRoot 'data\lumen-system.sqlite3'
  $start = Join-Path $ProductionRoot 'server\start-server.ps1'
  $proc = Start-Process powershell.exe -WindowStyle Hidden -PassThru -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$start,'-Port','8787','-Database',$db)
  $healthy = $false
  for ($i=0; $i -lt 30; $i++) { Start-Sleep -Milliseconds 500; try { if ((Invoke-RestMethod 'http://127.0.0.1:8787/health' -TimeoutSec 2).ok) { $healthy=$true; break } } catch {} }
  if (-not $healthy) { throw "Server aggiornato non risponde; backup codice: $backup" }
  Log "Aggiornato da $local a $remote. Processo $($proc.Id). Database e file condivisi preservati."
} catch { Log "ERRORE: $($_.Exception.Message)"; exit 1 }
finally { Remove-Item $lockPath -Force -ErrorAction SilentlyContinue }
