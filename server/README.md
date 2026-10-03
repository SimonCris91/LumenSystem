# Server locale Lumen System

Questo è il componente eseguibile del server che viene installato sul PC dell'officina. Il server può servire anche la copia locale dell'interfaccia in `C:\LumenSystem\web`; il sito pubblico Sites resta separato finché non viene completata la migrazione.

## Avvio sul PC dell'officina

Serve Python 3.11 o successivo. Il server usa solo librerie standard.

PowerShell:

```powershell
$env:LUMEN_API_TOKEN = "crea-una-stringa-lunga-e-casuale"
python server\app.py --init
python server\app.py
```

La prima volta crea l'account centrale senza scrivere la password nella riga di comando:

```powershell
py -3 C:\LumenSystem\server\app.py --db C:\LumenSystem\data\lumen-system.sqlite3 --create-admin --login simone
```

Il comando chiede la password due volte. Non usare il PIN di Windows e non riportare la password nella chat.

### Avvio automatico e gestione manuale su Windows

Per installare l'avvio automatico **sul PC che ospita davvero `C:\LumenSystem`**, apri PowerShell come amministratore ed esegui:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& 'C:\LumenSystem\server\windows\install-service.ps1'
```

Lo script verifica Python 3.11+, interfaccia web e token in `C:\LumenSystem\.env`, poi registra nell'Utilità di pianificazione l'attività `LumenSystem Calendar Server`, avviata a ogni boot come `SYSTEM`. Usa il database `C:\LumenSystem\data\lumen-system.sqlite3`; non tocca dati esistenti. Il PC deve essere acceso e Windows deve completare l'avvio. Per avviarlo subito senza riavviare:

```powershell
& 'C:\LumenSystem\server\windows\manage-service.ps1' -Action Start
```

Le altre operazioni manuali sono `-Action Stop`, `Restart`, `Status` e `Uninstall`. Per stato e salute API:

```powershell
& 'C:\LumenSystem\server\windows\manage-service.ps1' -Action Status
```

È disponibile anche il pannello grafico `C:\LumenSystem\Lumen System-Calendar.exe`: apre il calendario e offre i pulsanti **Avvia**, **Ferma**, **Riavvia** e **Installa avvio Windows**. Le operazioni amministrative mostrano la richiesta UAC di Windows. Per ricreare il piccolo eseguibile dal sorgente con il compilatore .NET già incluso in Windows:

```powershell
& 'C:\LumenSystem\server\windows\build-manager.ps1' -OutputPath 'C:\LumenSystem\Lumen System-Calendar.exe'
```

L'attività avvia API e interfaccia del calendario sulla porta 8787. Il tunnel HTTPS o l'accesso dalla rete esterna sono componenti separati: per dispositivi fuori dal PC devono essere già configurati e avviati separatamente. Ollama serve solo alla lettura AI dei documenti di magazzino, non al calendario.

Per un PC dell'officina il bind predefinito `127.0.0.1` è intenzionale. Impostare `LUMEN_BIND=0.0.0.0` solo quando sarà stato definito un firewall e un reverse proxy/tunnel. Non aprire mai la porta SQLite o la porta API direttamente su Internet.

Variabili:

- `LUMEN_API_TOKEN`: token temporaneo di bootstrap per le chiamate API.
- `LUMEN_DB`: percorso del file SQLite (predefinito `server/data/lumen-system.sqlite3`).
- `LUMEN_PORT`: porta API (predefinita `8787`).
- `LUMEN_ALLOWED_ORIGIN`: origine web autorizzata per CORS; lasciarla vuota finché sito e API non condividono un dominio controllato.
- `LUMEN_WA_WABA_ID`, `LUMEN_WA_PHONE_NUMBER_ID`, `LUMEN_WA_BUSINESS_ID`, `LUMEN_WA_APP_ID`: identificativi Meta.
- `LUMEN_WA_ACCESS_TOKEN`: token Cloud API, solo nell'ambiente server.
- `LUMEN_WA_VERIFY_TOKEN`: valore casuale creato da Lumen System e inserito anche nella configurazione webhook Meta.
- `LUMEN_WA_APP_SECRET`: App Secret Meta usato per controllare `X-Hub-Signature-256`.
- `LUMEN_WA_GRAPH_VERSION`: versione Graph API (predefinita `v23.0`).
- `LUMEN_SHARED_DIR`: cartella dei file condivisi; predefinita a `C:\\Lumen System\\Condivisa`.
- `LUMEN_SKETCHUP_SOURCE_DIR`: percorso della condivisione SketchUp configurato localmente; non inserire percorsi interni nel repository.
- `LUMEN_SKETCHUP_MAC_DIR`: seconda condivisione SketchUp opzionale, configurata localmente; non inserire percorsi interni nel repository.
- `LUMEN_SKETCHUP_AGENT_TOKEN`: chiave dedicata al sincronizzatore macOS; consente soltanto polling delle richieste, lettura delle impronte `.SKP` e caricamento di nuovi file SketchUp.
- `LUMEN_DOCUMENTI_WINDOWS_DIR`: percorso assoluto della cartella Documenti accessibile dal server, locale o UNC.
- `OLLAMA_BASE_URL`: indirizzo locale del servizio Ollama (predefinito `http://127.0.0.1:11434`).
- `OLLAMA_DOCUMENT_MODEL`: modello locale per leggere immagini e PDF del Magazzino (predefinito `qwen3-vl:4b`).

### Configurare la lettura AI dei documenti

Installa Ollama sul PC che ospita il server e scarica `qwen3-vl:4b`. Il modello viene eseguito localmente e non richiede una chiave API né crediti a consumo. La foto viene inviata al server Lumen System per l'analisi locale; il file originale non viene conservato. Le righe estratte restano una bozza da verificare e vengono salvate nel database solo dopo la conferma nel Magazzino.

## Rotte iniziali

- `GET /health` non richiede token.
- `POST /api/v1/session`, `GET /api/v1/me` e `DELETE /api/v1/session` gestiscono la sessione web con cookie HttpOnly.
- `POST /api/v1/register` crea un profilo in stato `pending`.
- `GET /api/v1/admin/users`, `PATCH /api/v1/admin/users/{id}` e `POST /api/v1/admin/users/{id}/approve` gestiscono i profili per gli amministratori.
- `GET /api/v1/people`, `GET /api/v1/activities`, `POST/PATCH /api/v1/activities` gestiscono il calendario.
- `GET/POST/PATCH /api/v1/vehicles` e `GET/POST/PATCH /api/v1/equipment` gestiscono mezzi e inventario attrezzature. `GET/PATCH /api/v1/activities/{id}/resources` pianifica mezzi, attrezzature e materiali per un lavoro; `PATCH /api/v1/activities/{id}/checklist` registra carico, partenza e rientro. I dettagli per il PC che gestisce Sites sono in `server/MEZZI-SITE.md`.
- `GET /api/v1/products` restituisce i totali derivati dai movimenti.
- `GET /api/v1/documents` e `GET /api/v1/documents/{id}` leggono archivio e righe dei documenti.
- `POST /api/v1/documents/drafts`, `POST /api/v1/documents/{id}/confirm` gestiscono l'inserimento verificato di righe da fatture/DDT/ordini.
- `GET /api/v1/files`, `POST /api/v1/files` gestiscono elenco, download e caricamento nella cartella condivisa (massimo 50 MB per file).
- `POST /api/v1/files/refresh` avvia una scansione in background delle due sorgenti configurate; `GET /api/v1/files/refresh` restituisce avanzamento ed errori. Importa ricorsivamente solo i file `.skp` nuovi in `Condivisa\SketchUp`, senza sovrascrivere quelli esistenti. Il server deve poter leggere le condivisioni con l'identità usata dal processo. Le unità di rete mappate nell'account interattivo non sono visibili al servizio: usare percorsi UNC e verificare accesso SMB con lo stesso account Windows che avvia il server.
- `GET /api/v1/sketchup-agent/request`, `GET /api/v1/sketchup-agent/hashes`, `POST /api/v1/sketchup-agent/files` e `POST /api/v1/sketchup-agent/status` sono rotte ristrette al token del servizio Mac. Il pulsante Aggiorna richiede la scansione dal Mac; il servizio la esegue con una connessione HTTPS in uscita dopo la scansione Windows. Il token non concede accesso alle altre API. Istruzioni d'installazione in `mac/README.md`.
- `POST /api/v1/imports/preview` analizza un export senza scrivere; `POST /api/v1/imports/commit` importa per ora le attività con ID stabili.

Il comando `--create-admin` crea un amministratore. Durante la migrazione, un
account esistente chiamato `simone` viene promosso ad amministratore. Un nuovo
profilo non può accedere finché un amministratore non lo approva.

Per il bootstrap le chiamate protette possono usare:

```text
Authorization: Bearer <LUMEN_API_TOKEN>
```

Il token resta sul server. L'interfaccia locale usa l'accesso account e un cookie HttpOnly; non inserire il token nel JavaScript o nel sito pubblico. Il token è ancora disponibile per diagnostica e bootstrap, ma prima dell'uso remoto va mantenuto fuori dal browser e affiancato da account con permessi separati per calendario, magazzino e documenti.

## Dati e backup

Il database viene creato sotto `server/data/` se non si specifica un percorso. Questa cartella non va pubblicata come sito statico. Il backup di produzione deve essere effettuato con un metodo coerente per SQLite e copiato su una destinazione separata dal PC; una semplice copia mentre il file è in uso non è il piano definitivo.

### WhatsApp Business Cloud API

Configura le variabili WhatsApp nell'ambiente del servizio Windows, non nel browser. `GET /api/v1/whatsapp/webhook` valida `hub.verify_token`; `POST` valida la firma HMAC-SHA256 Meta con l'App Secret. Conversazioni e messaggi sono aggiunti al database tramite nuove tabelle, senza cambiare quelle esistenti. `GET /api/v1/whatsapp/conversations` e `POST /api/v1/whatsapp/messages` richiedono una sessione approvata di un utente `admin` o `operator`; il token bootstrap API non autorizza queste rotte.

Il webhook non è raggiungibile dall'esterno con il bind predefinito `127.0.0.1`. Prima di registrarlo in Meta serve un endpoint HTTPS pubblico stabile: un dominio con reverse proxy oppure un tunnel Cloudflare nominato/permanente. Non usare URL temporanei `trycloudflare.com` per l'installazione definitiva. Dopo il deploy, la sezione Chat del Calendario Operativo può leggere le conversazioni dalle API; questa modifica non cambia l'interfaccia del calendario.

## Passi successivi

1. Copiare anche la cartella `web` accanto a `server` sul PC dell'officina.
2. Creare l'account centrale e servire l'interfaccia con `start-server.ps1`.
3. Il calendario e il Magazzino della copia locale usano ora il database centrale; il file originale della fattura/DDT resta nel dispositivo e vengono inviati solo i dati confermati.
4. L'archivio File condivisi consente ora caricamento e download autenticati dalla cartella comune.
5. Importare eventuali documenti già presenti in IndexedDB dai browser esistenti.
6. Configurare account individuali, tunnel HTTPS nominato, backup e avvio automatico.
7. Solo dopo, aggiungere il collegamento MCP per i resoconti ChatGPT.
