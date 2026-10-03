# Installazione Lumen System sul PC2

Questa procedura usa solo il repository Lumen System e non modifica LavorMetal.

## 1. Clona il repository

Apri PowerShell sul PC2 e usa:

```powershell
New-Item -ItemType Directory -Force C:\LumenSystem | Out-Null
git clone --branch main https://github.com/SimonCris91/LumenSystem.git C:\LumenSystem\source
```

## 2. Prepara la produzione

```powershell
New-Item -ItemType Directory -Force C:\LumenSystem\data,C:\LumenSystem\Condivisa | Out-Null
Copy-Item C:\LumenSystem\source\web C:\LumenSystem\web -Recurse -Force
Copy-Item C:\LumenSystem\source\server C:\LumenSystem\server -Recurse -Force
```

## 3. Crea il token locale

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$token = [Convert]::ToBase64String($bytes)
[Environment]::SetEnvironmentVariable('LUMEN_API_TOKEN',$token,'Machine')
```

Non stampare né condividere il valore del token.

## 4. Inizializza il database vuoto

```powershell
$env:LUMEN_API_TOKEN = [Environment]::GetEnvironmentVariable('LUMEN_API_TOKEN','Machine')
py -3 C:\LumenSystem\server\app.py --db C:\LumenSystem\data\lumen-system.sqlite3 --init
```

## 5. Crea il primo amministratore

```powershell
py -3 C:\LumenSystem\server\app.py --db C:\LumenSystem\data\lumen-system.sqlite3 --create-admin --login admin
```

## 6. Avvia il server

```powershell
PowerShell -ExecutionPolicy Bypass -File C:\LumenSystem\server\start-server.ps1 -Database C:\LumenSystem\data\lumen-system.sqlite3
```

Verifica:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

## 7. Dominio

Il dominio previsto è `lumensystem.aquariusageai.com`. Il record DNS e il tunnel Cloudflare verranno configurati dopo che il server locale risponde correttamente.

Non usare il tunnel LavorMetal e non modificare i record DNS degli altri progetti.
