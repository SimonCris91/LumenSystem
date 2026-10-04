# Lumen System

Lumen System è un centro operativo riutilizzabile per calendario, persone, attività, magazzino, mezzi e file condivisi.

Questa copia è stata creata come progetto indipendente. Parte senza attività, personale, articoli, mezzi, file o credenziali. Non contiene il database, i token o i documenti di LavorMetal.

## Struttura

- `web/`: interfaccia responsive con il tema visivo Lumen.
- `server/`: API Python standard library e schema SQLite.
- `web/modules.js`: registry visuale dell'ecosistema Personal AI; coordina i progetti senza importare i loro repository, database o credenziali.
- `.env.example`: configurazione di esempio; non contiene segreti.

## Ecosistema Personal AI

La sezione **Ecosistema AI** del gestionale raccoglie i moduli specialistici di Lumen, Account Finder, NEXUS, AEGIS, AI Remote, Signum Aura, Yachting Agent AI, Numeri Lab AI, Inbox personale e SimonCris Content. Il registry è descrittivo e privacy-first: indica skill, perimetro e modalità d'accesso, ma non copia dati personali, token o database nei progetti collegati.

Il routing operativo resta separato: Account Finder produce indizi, l'Inbox classifica le fonti, NEXUS organizza il contesto e Lumen mostra calendario, scadenze e attività. Mutazioni esterne, ordini, email e pagamenti richiedono sempre il rispettivo gate del progetto.

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
