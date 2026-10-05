(function () {
  "use strict";

  var state = { items: [], summary: null, status: "all", category: "", project: "", query: "", loading: false };
  var esc = function (value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]; }); };
  var labels = { verificata: "Verificata", da_verificare: "Da verificare", non_confermata: "Non confermata", obsoleta: "Obsoleta" };
  var actionLabels = { solo_informativa: "Solo informativa", da_verificare: "Da verificare", pronta_analisi: "Pronta per analisi", pronta_implementazione: "Pronta per implementazione", in_attesa_conferma: "In attesa di conferma" };

  function api(path, options) {
    if (!window.LMServer || !window.LMServer.request) return Promise.reject(new Error("Server Lumen non disponibile."));
    return window.LMServer.request(path, options || {});
  }

  function dateLabel(value) {
    if (!value) return "data non indicata";
    return value.replace("T", " ").replace("Z", " UTC");
  }

  function renderItems() {
    var target = document.querySelector("#radarItems");
    if (!target) return;
    if (state.loading) { target.innerHTML = '<div class="radar-empty">Controllo delle fonti ufficiali…</div>'; return; }
    if (!state.items.length) { target.innerHTML = '<div class="radar-empty">Nessuna notizia nella vista corrente. Il monitoraggio attivo continua in background.</div>'; return; }
    target.innerHTML = state.items.map(function (item) {
      var projects = (item.projects || []).map(function (project) { return '<span class="radar-tag">' + esc(project) + '</span>'; }).join("");
      return '<article class="radar-card"><div class="radar-meta"><span>' + esc(item.source_name) + '</span><span>·</span><span>' + esc(dateLabel(item.published_at || item.received_at)) + '</span><span class="radar-badge" data-status="' + esc(item.verification_status) + '">' + esc(labels[item.verification_status] || item.verification_status) + '</span><span class="radar-badge">' + esc(actionLabels[item.action_status] || item.action_status) + '</span></div><h3><a href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer">' + esc(item.title) + ' ↗</a></h3><p class="radar-summary-text">' + esc(item.summary || "Estratto originale non disponibile.") + '</p><div class="radar-tags">' + projects + '<span class="radar-tag">' + esc(item.category) + '</span></div><div class="radar-actions"><button class="button button-quiet" data-radar-action="verify" data-id="' + esc(item.id) + '">Segna verificata</button><button class="button button-quiet" data-radar-action="analysis" data-id="' + esc(item.id) + '">Pronta per analisi</button><button class="button button-quiet" data-radar-action="activity" data-id="' + esc(item.id) + '">Crea proposta</button></div></article>';
    }).join("");
  }

  function renderSummary() {
    var summary = state.summary || { counts: {}, unread: 0, sources: [], monitor: {} };
    var monitor = summary.monitor || {};
    var monitorNode = document.querySelector("#radarMonitor");
    if (monitorNode) {
      monitorNode.dataset.state = monitor.last_error ? "error" : monitor.last_scan ? "active" : "pending";
      monitorNode.innerHTML = '<strong>' + (monitor.last_error ? 'Monitoraggio con errore' : monitor.last_scan ? 'Ultimo controllo ricevuto' : 'Monitoraggio da verificare') + '</strong> · ultimo controllo: ' + esc(dateLabel(monitor.last_scan)) + (monitor.last_error ? ' · <span>' + esc(monitor.last_error) + '</span>' : '');
    }
    var unread = document.querySelector("#radarUnread"); if (unread) unread.textContent = summary.unread || 0;
    var total = Object.values(summary.counts || {}).reduce(function (sum, value) { return sum + Number(value || 0); }, 0);
    var totalNode = document.querySelector("#radarTotal"); if (totalNode) totalNode.textContent = total;
    var pending = document.querySelector("#radarPending"); if (pending) pending.textContent = summary.counts?.da_verificare || 0;
    var verified = document.querySelector("#radarVerified"); if (verified) verified.textContent = summary.counts?.verificata || 0;
    var sources = document.querySelector("#radarSources");
    if (sources) sources.innerHTML = (summary.sources || []).map(function (source) { return '<span class="radar-source" data-error="' + Boolean(source.last_error) + '"><strong>' + esc(source.name) + '</strong><br><small>' + esc(source.last_error || "attiva") + '</small></span>'; }).join("");
  }

  function renderPage() {
    return '<section class="radar-page"><div class="page-heading"><div><span class="eyebrow">RADAR AI · MONITORAGGIO ATTIVO</span><h1>Novità da verificare</h1><p class="radar-intro">Fonti ufficiali su OpenAI, Anthropic, Cloudflare, GitHub e Google. La ricezione non equivale a verifica tecnica, deduzione architetturale o implementazione.</p></div><button class="button button-primary" data-radar-action="scan">Controlla ora</button></div><div id="radarMonitor" class="radar-monitor">Monitoraggio attivo in avvio…</div><div class="radar-summary"><div class="radar-stat"><small>Non lette</small><strong id="radarUnread">–</strong></div><div class="radar-stat"><small>Ricevute</small><strong id="radarTotal">–</strong></div><div class="radar-stat"><small>Da verificare</small><strong id="radarPending">–</strong></div><div class="radar-stat"><small>Verificate</small><strong id="radarVerified">–</strong></div></div><div id="radarSources" class="radar-sources"></div><div class="radar-toolbar"><select id="radarStatus"><option value="all">Tutti gli stati</option><option value="da_verificare">Da verificare</option><option value="verificata">Verificate</option><option value="non_confermata">Non confermate</option></select><input id="radarQuery" placeholder="Cerca notizia o fonte" maxlength="80" /><button class="button button-quiet" data-radar-action="refresh">Aggiorna elenco</button></div><div id="radarItems" class="radar-grid"><div class="radar-empty">Caricamento Radar AI…</div></div></section>';
  }

  async function load() {
    var target = document.querySelector("#radarItems");
    if (!target) return;
    state.loading = true; renderItems();
    var loadError = null;
    try {
      var query = new URLSearchParams();
      if (state.status !== "all") query.set("status", state.status);
      if (state.query) query.set("q", state.query);
      var payload = await Promise.all([api("/radar/summary"), api("/radar/items?" + query.toString())]);
      state.summary = payload[0]; state.items = payload[1].items || [];
      renderSummary();
    } catch (error) {
      loadError = error.message || "Accedi al server per leggere Radar AI.";
    } finally {
      state.loading = false;
      if (loadError) {
        target.innerHTML = '<div class="radar-empty">' + esc(loadError) + '</div>';
        var monitorNode = document.querySelector("#radarMonitor");
        if (monitorNode) { monitorNode.dataset.state = "error"; monitorNode.textContent = "Stato del monitoraggio non disponibile: " + loadError; }
      } else { renderItems(); }
    }
  }

  async function handle(action, id) {
    if (action === "refresh") return load();
    if (action === "scan") {
      var button = document.querySelector('[data-radar-action="scan"]'); if (button) button.disabled = true;
      try { await api("/radar/scan", { method: "POST", body: "{}" }); } catch (error) { window.alert(error.message); }
      if (button) button.disabled = false;
      return load();
    }
    if (!id) return;
    if (action === "activity") {
      try { await api("/radar/items/" + encodeURIComponent(id) + "/actions", { method: "POST", body: JSON.stringify({ title: "Valutare notizia Radar", details: "Analizzare impatto sui progetti collegati prima di qualsiasi implementazione." }) }); } catch (error) { window.alert(error.message); }
      return load();
    }
    var status = action === "verify" ? "verificata" : "da_verificare";
    var actionStatus = action === "analysis" ? "pronta_analisi" : undefined;
    try { await api("/radar/items/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify({ verification_status: status, action_status: actionStatus, read: true }) }); } catch (error) { window.alert(error.message); }
    return load();
  }

  window.renderRadarPage = renderPage;
  window.loadRadarPage = load;
  document.addEventListener("click", function (event) { var button = event.target.closest("[data-radar-action]"); if (button) handle(button.dataset.radarAction, button.dataset.id); });
  document.addEventListener("change", function (event) { if (event.target.id === "radarStatus") { state.status = event.target.value; load(); } });
  document.addEventListener("input", function (event) { if (event.target.id === "radarQuery") { state.query = event.target.value.trim(); clearTimeout(window.__radarQueryTimer); window.__radarQueryTimer = setTimeout(load, 350); } });
})();
