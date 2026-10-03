# Mezzi: collegamento del Calendario Operativo

Questo documento e per il PC che gestisce ChatGPT Sites. Il backend e nel server Lumen System; il sito va aggiornato separatamente. Non inserire token API nel codice del sito. Tutte le richieste vanno fatte con la sessione utente (`credentials: "include"`) verso l'indirizzo HTTPS del server gia configurato.

## Schermate

- Aggiungere la sezione **Mezzi** con schede **Furgone 1**, **Furgone 2**, **Furgone 3**. Le targhe partono vuote; l'utente potra inserirle in seguito. Mostrare attrezzature associate, quantita, codice, numero di serie, note e stato attivo. Consentire aggiunta e modifica a operatori e amministratori.
- Nel dettaglio di ogni lavoro/uscita del calendario, permettere di scegliere mezzo, conducente fra gli operatori gia assegnati al lavoro, attrezzature inventariate e materiali necessari. Un materiale puo essere collegato a un prodotto di Magazzino oppure inserito con descrizione libera.
- Mostrare una **checklist di bordo** per segnare attrezzature e materiali caricati, partenza del mezzo, attrezzature e materiali rientrati e rientro del mezzo. Mostrare chi e quando ha spuntato ogni voce. Aggiornare la schermata dopo ogni operazione usando il payload restituito dall'API.
- Mostrare gli errori `409` come conflitto di modifica, ricaricare le risorse e chiedere di ripetere l'azione. Il piano di uscita puo essere sostituito solo prima dell'inizio della checklist.

## API

Le letture richiedono autenticazione; le modifiche richiedono ruolo `admin` o `operator`.

| Metodo | Rotta | Scopo |
| --- | --- | --- |
| GET | `/api/v1/vehicles` | Elenco mezzi attivi |
| GET | `/api/v1/vehicles/{id}` | Mezzo con attrezzature |
| POST | `/api/v1/vehicles` | Nuovo mezzo: `{ "name": "Furgone 4", "plate": null }` |
| PATCH | `/api/v1/vehicles/{id}` | Modifica: `{ "version": 1, "plate": "...", "notes": "..." }` |
| GET | `/api/v1/equipment?vehicle_id={id}` | Attrezzature attive, opzionalmente filtrate per mezzo |
| POST | `/api/v1/equipment` | Nuova attrezzatura: `{ "vehicle_id": "vehicle-1", "name": "Trapano", "quantity": 1 }` |
| PATCH | `/api/v1/equipment/{id}` | Modifica con `version`, campi desiderati e/o `active: false` |
| GET | `/api/v1/activities/{id}/resources` | Piano e stato checklist; restituisce `activity`, `vehicles`, `equipment`, `materials`, `ready_to_depart`, `equipment_to_return` |
| PATCH | `/api/v1/activities/{id}/resources` | Sostituisce il piano prima del primo carico o della partenza |
| PATCH | `/api/v1/activities/{id}/checklist` | Registra un'azione della checklist |

Per creare o sostituire il piano inviare la `version` di `activity` appena letta. Esempio:

```json
{
  "version": 3,
  "vehicles": [{"vehicle_id": "vehicle-1", "driver_person_id": "person-roberto"}],
  "equipment": [{"equipment_id": "equipment-...", "quantity": 1}],
  "materials": [{"product_id": "product-...", "quantity_milli": 10000}, {"description": "Viti speciali", "quantity_milli": 20000, "unit": "pz"}]
}
```

`quantity_milli` usa millesimi: 10000 significa 10 unita. La risposta fornisce gli `id` creati per le righe materiali. Una sostituzione cancella le assegnazioni precedenti, quindi includere sempre l'intero piano. Il conducente deve essere assegnato al lavoro. Una targa non e necessaria per pianificare un mezzo.

Per ogni spunta usare sempre la `version` corrente di `activity`:

```json
{"version": 4, "kind": "equipment", "id": "equipment-...", "action": "load", "quantity": 1}
```

Le azioni sono `vehicle: depart/return`, `equipment: load/return`, `material: load/return`. Per `material` inviare `quantity_milli` invece di `quantity`; l'`id` e quello della riga in `materials`. Una partenza richiede che tutti gli elementi previsti risultino caricati. Le quantita di rientro non possono superare quelle caricate. Per i materiali collegati a `product_id`, il carico scala la giacenza e il rientro la riaccredita automaticamente; il carico viene respinto con `insufficient_stock` quando la giacenza non basta. Le righe con descrizione libera restano nella checklist senza modificare il Magazzino.

## Deploy del server

Sul PC Windows che ospita `C:\LumenSystem`, dal checkout aggiornato, lo script `server/windows/deploy-vehicles.ps1` esegue backup del codice e database, crea le tabelle, inserisce i tre mezzi senza targa e riavvia il server. GitHub e la pubblicazione di Sites da soli non aggiornano il server. Il database e le credenziali restano esclusivamente sul PC server.

## Correzione urgente dell'interfaccia Sites (2 ottobre 2026)

La versione pubblicata di `vehicles.js?v=1` ha un difetto verificato: `load()` termina chiamando `render()` ma `render()` restituisce solo una stringa HTML, senza inserirla in `#appContent`. La selezione di un mezzo aggiorna `selectedId` ma non la scheda a destra. In `app.js?v=20261001-5`, `LMCalendar.replaceActivities(tasks, true)` evita il ridisegno completo solo per `warehouse` e `files`: il refresh periodico del calendario ridisegna invece tutta la pagina `vehicles` e cancella targa/note in corso di digitazione. Il server risponde a `GET /api/v1/vehicles` in circa 56 ms dalla rete locale.

Nel progetto Sites autorevole sul PC che lo gestisce:

1. In `app.js`, nel ramo `preserveView` di `LMCalendar.replaceActivities`, aggiungere `"vehicles"` all'elenco di pagine che chiamano soltanto `renderSidebar()`. Non ricreare `#appContent` durante la digitazione nella pagina Mezzi.
2. In `vehicles.js`, far sì che ogni cambio di selezione aggiorni immediatamente `#appContent` con `render()` e poi carichi le attrezzature del nuovo mezzo. Se una risposta di rete arriva dopo una selezione successiva, ignorarla. Fare lo stesso aggiornamento del DOM dopo il caricamento dell'elenco e dopo il salvataggio.
3. Nei titoli delle schede e del dettaglio usare `vehicle.plate || vehicle.name`. Quando la targa esiste, non mostrare più il segnaposto `Furgone 1/2/3`; mantenere `id` e `name` originali nel database. Il campo targa deve continuare a mostrare il valore salvato. Dopo `PATCH /vehicles/{id}`, usare la risposta o ricaricare il mezzo senza sovrascrivere una nuova modifica già iniziata.
4. Incrementare il parametro versione di `vehicles.js` nell'HTML pubblicato, in modo che i browser non usino la copia in cache. Verificare clic su tutti e tre i mezzi, scrittura lenta di targa e note senza perdita del testo, salvataggio e cambio del titolo in targa.

Queste modifiche riguardano Sites e vanno pubblicate dal PC che gestisce quel progetto. Non richiedono una nuova migrazione del database o un riavvio del server Windows.
