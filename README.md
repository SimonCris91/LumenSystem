# Lumen System

Lumen System è un centro operativo riutilizzabile per calendario, persone, attività, magazzino, mezzi e file condivisi.

Questa copia è stata creata come progetto indipendente. Parte senza attività, personale, articoli, mezzi, file o credenziali. Non contiene il database, i token o i documenti di LavorMetal.

## Struttura

- `web/`: interfaccia responsive con il tema visivo Lumen.
- `server/`: API Python standard library e schema SQLite.
- `.env.example`: configurazione di esempio; non contiene segreti.

## Avvio locale

```powershell
$env:LUMEN_API_TOKEN = "inserisci-un-token-locale"
py -3 .\server\app.py --db .\data\lumen-system.sqlite3 --init
py -3 .\server\app.py --db .\data\lumen-system.sqlite3
```

Per creare il primo amministratore:

```powershell
py -3 .\server\app.py --db .\data\lumen-system.sqlite3 --create-admin --login admin
```

La pubblicazione, il dominio e l'integrazione con WhatsApp saranno configurati in una fase separata. Non usare mai questo progetto per modificare LavorMetal.
