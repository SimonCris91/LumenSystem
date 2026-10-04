(function () {
  "use strict";

  const modules = [
    { id: "aegis", name: "AEGIS Invest AI", kind: "Finanza Demo", state: "isolato", description: "Dashboard Demo-first per stato portafoglio, scanner, rischio e risultati verificati. Nessun accesso Real.", owner: "aegis-engineering" },
    { id: "account-finder", name: "Account Finder", kind: "Privacy e account", state: "browser-local", description: "Raccoglie indizi di portali collegati alle email senza trasformare un indizio in prova e senza conservare credenziali.", owner: "account-finder-privacy" },
    { id: "inbox", name: "Inbox personale", kind: "Email e scadenze", state: "read-only", description: "Classifica email, bollette, fatture, avvisi e notifiche; prepara scadenze e riepiloghi senza inviare o pagare automaticamente.", owner: "personal-inbox-operations" },
    { id: "nexus", name: "NEXUS AI", kind: "Memoria e finanza", state: "modulo", description: "Organizza memoria, decisioni, finanze e contesto personale mantenendo fonti, timestamp e confidenza.", owner: "nexus-ai-engineering" },
    { id: "ai-remote", name: "AI Remote", kind: "Voce e dispositivi", state: "modulo", description: "Controller voice-first per comandi personali e dispositivi remoti con backend autenticato.", owner: "ai-remote-engineering" },
    { id: "signum", name: "Signum Aura AI", kind: "Mobile", state: "modulo", description: "Esperienza mobile simbolica e personale, richiamabile come servizio specialistico senza fondere il suo archivio.", owner: "signum-aura-delivery" },
    { id: "yachting", name: "Yachting Agent AI", kind: "Nautica", state: "modulo", description: "Agente nautico intelligente per percorsi, servizi e contenuti della Costa Smeralda.", owner: "olbia-yachting-delivery" },
    { id: "numeri", name: "Numeri Lab AI", kind: "Ricerca dati", state: "modulo", description: "Analisi statistiche trasparenti di Lotto e SuperEnalotto con storico e test prospettici separati da promesse di previsione.", owner: "superenalotto-research" },
    { id: "simoncris", name: "SimonCris Content", kind: "Contenuti", state: "modulo", description: "Coordina musica, gaming e contenuti del brand SimonCris con tracciamento delle decisioni.", owner: "simoncris-content" },
    { id: "lumen", name: "Lumen System", kind: "Centro operativo", state: "attivo", description: "Questo gestionale: calendario, attività, documenti, magazzino, mezzi e routing dell'ecosistema.", owner: "lumen-system" },
  ];

  const esc = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const label = { attivo: "Attivo", isolato: "Separato", "browser-local": "Locale", "read-only": "Sola lettura", modulo: "Modulo" };

  window.renderModulesPage = function renderModulesPage() {
    return `<section class="modules-page">
      <div class="page-heading modules-heading"><div><span class="eyebrow">CONTROL ROOM · PERSONAL AI</span><h1>Ecosistema AI</h1><p class="page-subtitle">Lumen coordina i progetti senza fondere repository, database o credenziali. Ogni modulo conserva il proprio perimetro e viene richiamato dalla skill corretta.</p></div><span class="module-count">${modules.length} moduli</span></div>
      <div class="module-notice"><strong>Routing controllato</strong><span>Account Finder → portali riconosciuti → email e documenti → scadenze → calendario e riepilogo.</span><small>Gli indizi restano distinti dalle prove; le azioni esterne richiedono conferma.</small></div>
      <div class="module-grid">${modules.map((module) => `<article class="module-card module-${esc(module.state)}"><div class="module-top"><span class="module-kind">${esc(module.kind)}</span><span class="module-state">${esc(label[module.state] || module.state)}</span></div><h2>${esc(module.name)}</h2><p>${esc(module.description)}</p><div class="module-footer"><code>${esc(module.owner)}</code><span aria-hidden="true">↗</span></div></article>`).join("")}</div>
    </section>`;
  };
})();
