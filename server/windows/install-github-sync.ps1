param(
  [string]$SourceRoot = 'C:\LumenSystem\source',
  [string]$ProductionRoot = 'C:\LumenSystem',
  [string]$GitHubUrl = 'https://github.com/SimonCris91/LumenSystem.git'
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git non installato sul portatile.' }
New-Item -ItemType Directory -Force $SourceRoot | Out-Null
if (-not (Test-Path (Join-Path $SourceRoot '.git'))) {
  git clone --branch main $GitHubUrl $SourceRoot
  if ($LASTEXITCODE -ne 0) { throw 'Clone GitHub non riuscito. Autentica GitHub e riprova.' }
}
$sync = Join-Path $SourceRoot 'server\windows\sync-from-github.ps1'
if (-not (Test-Path $sync)) { throw 'Script di sincronizzazione mancante nel repository.' }
$taskName = 'LumenSystem GitHub Sync'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$sync`" -SourceRoot `"$SourceRoot`" -ProductionRoot `"$ProductionRoot`""
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn
$triggerTimer = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($triggerLogon,$triggerTimer) -Description 'Sincronizza Lumen System da GitHub senza modificare database, ambiente o file condivisi.' -Force | Out-Null
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sync -SourceRoot $SourceRoot -ProductionRoot $ProductionRoot
Write-Output "Sincronizzazione GitHub installata: $taskName"
