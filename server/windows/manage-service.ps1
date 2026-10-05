param(
  [ValidateSet('Start', 'Stop', 'Restart', 'Status', 'Uninstall')]
  [string]$Action = 'Status',
  [string]$TaskName = 'LumenSystem Calendar Server',
  [int]$Port = 8789
)

$ErrorActionPreference = 'Stop'
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

switch ($Action) {
  'Start' {
    if (-not $task) { throw "Attività '$TaskName' non installata. Esegui install-service.ps1 come amministratore." }
    Start-ScheduledTask -TaskName $TaskName
    Write-Output "Avvio richiesto per '$TaskName'."
  }
  'Stop' {
    if ($task) { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }
    Write-Output "Arresto richiesto per '$TaskName'."
  }
  'Restart' {
    if (-not $task) { throw "Attività '$TaskName' non installata." }
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Start-ScheduledTask -TaskName $TaskName
    Write-Output "Riavvio richiesto per '$TaskName'."
  }
  'Status' {
    if (-not $task) { Write-Output "Attività '$TaskName' non installata."; exit 1 }
    $taskState = (Get-ScheduledTask -TaskName $TaskName).State
    $health = $null
    try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 3 } catch { }
    [pscustomobject]@{
      Task = $TaskName
      TaskState = $taskState
      ApiHealthy = ($health.ok -eq $true)
      ApiUrl = "http://127.0.0.1:$Port"
    }
  }
  'Uninstall' {
    if ($task) {
      Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
      Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }
    Write-Output "Attività '$TaskName' rimossa. Database e file non sono stati toccati."
  }
}
