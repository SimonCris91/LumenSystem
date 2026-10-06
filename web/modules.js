(function () {
  "use strict";

  const fallbackModules = [
    { id: "radar", name: "Radar AI", kind: "Monitoraggio news", state: "attivo", description: "Controlla fonti ufficiali e conserva evidenze senza applicare automaticamente azioni esterne.", owner: "personal-ai-operations", connection_state: "unknown" },
    { id: "shopping", name: "Radar Spesa Locale", kind: "Offerte e carrello", state: "attivo", description: "Confronta offerte locali verificate e supporta il carrello senza acquistare automaticamente.", owner: "personal-ai-operations", connection_state: "unknown" },
    { id: "aquarius-age", name: "Aquarius Age", kind: "Portfolio", state: "modulo", description: "Portfolio centrale per presentare prodotti digitali, applicazioni e progetti senza esporre dati operativi.", owner: "aquarius-age-delivery", public_url: "https://aquariusageai.com", url_label: "Portfolio pubblico", connection_state: "external" },
    { id: "aegis", name: "AEGIS Invest AI", kind: "Finanza Demo", state: "isolato", description: "Dashboard Demo-first per portafoglio, scanner, rischio e risultati verificati. Nessun accesso Real da Lumen.", owner: "aegis-engineering", public_url: "https://aegis.aquariusageai.com", url_label: "Protetto · accesso richiesto", connection_state: "external" },
    { id: "account-finder", name: "Account Finder", kind: "Privacy e account", state: "browser-local", description: "Raccoglie indizi di portali collegati alle email senza trasformare un indizio in prova.", owner: "account-finder-privacy", connection_state: "external" },
    { id: "inbox", name: "Inbox personale", kind: "Email e scadenze", state: "read-only", description: "Classifica email, bollette, fatture, avvisi e notifiche e prepara scadenze senza inviare o pagare automaticamente.", owner: "personal-inbox-operations", connection_state: "unknown" },
    { id: "nexus", name: "NEXUS AI", kind: "Memoria e finanza", state: "modulo", description: "Organizza memoria, decisioni, finanze e contesto personale mantenendo fonti, timestamp e confidenza.", owner: "nexus-ai-engineering", connection_state: "not_configured" },
    { id: "ai-remote", name: "AI Remote", kind: "Voce e dispositivi", state: "modulo", description: "Controller voice-first per comandi personali e dispositivi remoti con backend autenticato.", owner: "ai-remote-engineering", connection_state: "not_configured" },
    { id: "signum", name: "Signum Aura AI", kind: "Mobile", state: "modulo", description: "Esperienza mobile simbolica e personale, richiamabile come servizio specialistico senza fondere il suo archivio.", owner: "signum-aura-delivery", public_url: "https://signum.aquariusageai.com", url_label: "Sito pubblico", connection_state: "external" },
    { id: "yachting", name: "Yachting Agent AI", kind: "Nautica", state: "modulo", description: "Agente nautico intelligente per percorsi, servizi e contenuti della Costa Smeralda.", owner: "olbia-yachting-delivery", public_url: "https://yachting.aquariusageai.com", url_label: "Sito pubblico", connection_state: "external" },
    { id: "numeri", name: "Numeri Lab AI", kind: "Ricerca dati", state: "modulo", description: "Analisi statistiche trasparenti di Lotto e SuperEnalotto con storico e test prospettici separati da promesse di previsione.", owner: "superenalotto-research", public_url: "https://numeri.aquariusageai.com", url_label: "Sito pubblico", connection_state: "external" },
    { id: "simoncris", name: "SimonCris Content", kind: "Contenuti", state: "modulo", description: "Coordina musica, gaming e contenuti del brand SimonCris con tracciamento delle decisioni.", owner: "simoncris-content", connection_state: "not_configured" },
    { id: "lavormetal", name: "LavorMetal Operations", kind: "Operazioni", state: "isolato", description: "Skill operativa separata; Lumen coordina soltanto riferimenti senza importare dati o database.", owner: "lavormetal-operations", public_url: "https://lavormetal.aquariusageai.com", url_label: "Sito pubblico", connection_state: "external" },
    { id: "personal-operations", name: "Personal Operations", kind: "Decisioni", state: "modulo", description: "Priorità, decisioni, scadenze e follow-up personali con evidenze e stato verificabile.", owner: "personal-operations", connection_state: "not_configured" },
    { id: "lumen", name: "Lumen System", kind: "Centro operativo", state: "attivo", description: "Centro operativo per calendario, attività, documenti, magazzino, mezzi e routing dell'ecosistema.", owner: "lumen-system", public_url: "https://lumensystem.aquariusageai.com", url_label: "Centro operativo", connection_state: "unknown" },
  ];

  let modules = fallbackModules.slice();
  let source = "fallback";
  let refreshing = false;
  let lastRefresh = 0;
  const apiBase = String(window.LM_API_BASE || "").replace(/\/+$/, "");
  const esc = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const stateLabel = { attivo: "Attivo", isolato: "Separato", "browser-local": "Locale", "read-only": "Sola lettura", modulo: "Modulo" };
  const connectionLabel = {
    connected: "Collegato",
    external: "Esterno",
    not_configured: "Non configurato",
    not_connected: "Non collegato",
    unreachable: "Non raggiungibile",
    unknown: "Stato sconosciuto",
  };

  function api(path) {
    return fetch(apiBase + "/api/v1/ecosystem/" + path, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    }).then(async (response) => {
      let payload = null;
      try { payload = await response.json(); } catch (_) {}
      if (!response.ok) throw new Error(payload && payload.message || "Ecosistema non disponibile.");
      return payload;
    });
  }

  function markup() {
    const sourceText = source === "server" ? "Registry Lumen aggiornato dal server" : "Registry locale di fallback";
    return `<section class="modules-page">
      <div class="page-heading modules-heading"><div><span class="eyebrow">CONTROL ROOM · PERSONAL AI</span><h1>Ecosistema AI</h1><p class="page-subtitle">Lumen coordina i progetti senza fondere repository, database o credenziali. Ogni modulo conserva il proprio perimetro e viene richiamato dalla skill corretta.</p></div><div class="module-heading-meta"><span class="module-count">${modules.length} moduli</span><small class="ecosystem-source">${esc(sourceText)}</small></div></div>
      <div class="module-notice"><strong>Routing controllato</strong><span>Account Finder → portali riconosciuti → email e documenti → scadenze → calendario e riepilogo.</span><small>Gli indizi restano distinti dalle prove; le azioni esterne richiedono conferma. “Esterno” indica un collegamento conosciuto, non una verifica di disponibilità.</small><button class="button button-quiet" data-action="navigate" data-page="controller">Apri Controller Codex</button></div>
      <div class="module-grid">${modules.map((module) => {
        const connection = module.connection_state || "unknown";
        const url = module.public_url || module.url || "";
        const urlLabel = module.url_label || module.urlLabel || "Apri modulo";
        const localPage = ["radar", "shopping"].includes(module.id) ? module.id : "";
        return `<article class="module-card module-${esc(module.state)}"><div class="module-top"><span class="module-kind">${esc(module.kind)}</span><div class="module-badges"><span class="module-state">${esc(stateLabel[module.state] || module.state)}</span><span class="connection-pill connection-${esc(connection)}">${esc(connectionLabel[connection] || connection)}</span></div></div><h2>${esc(module.name)}</h2><p>${esc(module.description)}</p><div class="module-footer"><code>${esc(module.owner)}</code>${localPage ? `<button class="button button-quiet" data-action="navigate" data-page="${esc(localPage)}">Apri modulo</button>` : url ? `<a class="module-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(urlLabel)} ↗</a>` : `<span class="module-link muted">URL non configurato</span>`}</div></article>`;
      }).join("")}</div>
    </section>`;
  }

  function repaint() {
    const current = document.querySelector(".modules-page");
    if (current) current.outerHTML = markup();
  }

  async function refresh() {
    const now = Date.now();
    if (refreshing || now - lastRefresh < 30000) return;
    refreshing = true;
    lastRefresh = now;
    try {
      const [registry, status] = await Promise.all([api("modules"), api("status")]);
      const statusById = new Map((status.modules || []).map((item) => [item.id, item.connection_state]));
      modules = (registry.modules || fallbackModules).map((module) => ({
        ...module,
        connection_state: statusById.get(module.id) || module.connection_state || "unknown",
      }));
      source = "server";
      repaint();
    } catch (_) {
      source = "fallback";
    } finally {
      refreshing = false;
    }
  }

  window.renderModulesPage = function renderModulesPage() {
    window.setTimeout(refresh, 0);
    return markup();
  };
})();
