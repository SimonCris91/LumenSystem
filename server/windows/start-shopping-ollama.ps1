param([switch]$PullModel)
$ErrorActionPreference = 'Stop'
$ollamaExecutable = 'D:\CodexTools\Ollama\ollama.exe'
$env:OLLAMA_MODELS = 'D:\CodexTools\Ollama\models'
$env:OLLAMA_HOST = '127.0.0.1:11434'
$env:TEMP = 'D:\CodexTools\Ollama\temp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Path $env:OLLAMA_MODELS,$env:TEMP -Force | Out-Null
if (!(Test-Path -LiteralPath $ollamaExecutable)) { throw 'Ollama portatile non installato in D:\CodexTools\Ollama' }
try { Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3 | Out-Null }
catch {
    Start-Process -FilePath $ollamaExecutable -ArgumentList 'serve' -WorkingDirectory 'D:\CodexTools\Ollama' -WindowStyle Hidden
    for ($attempt=0; $attempt -lt 15; $attempt++) {
        Start-Sleep -Seconds 1
        try { Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2 | Out-Null; break } catch {}
    }
}
if ($PullModel) {
    & $ollamaExecutable pull 'qwen3-vl:4b-instruct'
    if ($LASTEXITCODE -ne 0) { throw 'Scaricamento modello Ollama non completato' }
}
Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' | Select-Object -ExpandProperty models | Select-Object name,size
