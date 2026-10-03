param(
  [int]$Port = 8787,
  [string]$Database = ""
)

$ErrorActionPreference = "Stop"

# Load private server settings from C:\LumenSystem\.env. Existing process
# environment variables take precedence; never print secret values.
$envFile = Join-Path (Split-Path -Parent $PSScriptRoot) '.env'
if (Test-Path -LiteralPath $envFile) {
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
}

if (-not $env:LUMEN_API_TOKEN) {
  throw "Imposta prima LUMEN_API_TOKEN con un valore lungo e casuale."
}

$args = @("$PSScriptRoot\app.py", "--port", "$Port")
if ($Database) { $args += @("--db", $Database) }
if ($env:LUMEN_SKIP_DB_INIT -eq "1") { $args += "--skip-db-init" }

if (Get-Command py -ErrorAction SilentlyContinue) {
  & py -3 @args
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
  & python @args
} else {
  throw "Python 3.11 o successivo non è installato su questo PC."
}
