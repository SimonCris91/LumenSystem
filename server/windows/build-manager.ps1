param(
  [string]$OutputPath = (Join-Path $PSScriptRoot 'Lumen System-Calendar.exe')
)

$ErrorActionPreference = 'Stop'
$compilerCandidates = @(
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $compiler) { throw 'Compilatore C# di Windows (.NET Framework) non trovato.' }
$source = Join-Path $PSScriptRoot 'CalendarManager.cs'
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Sorgente mancante: $source" }
$target = [System.IO.Path]::GetFullPath($OutputPath)
$null = New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force
& $compiler /nologo /target:winexe /optimize+ /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "/out:$target" $source
if ($LASTEXITCODE -ne 0) { throw 'Compilazione del pannello non riuscita.' }
Get-Item -LiteralPath $target | Select-Object FullName,Length,LastWriteTime
