(function () {
  "use strict";

  var state = { stores: [], offers: [], comparison: null, loading: false, error: "", flyerBusy: false };
  var esc = function (value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]; }); };

  function api(path, options) {
    if (!window.LMServer || !window.LMServer.request) return Promise.reject(new Error("Server Lumen non disponibile."));
    return window.LMServer.request(path, options || {});
  }

  function parseItems(value) {
    return String(value || "").split(/\n/).map(function (line) {
      var parts = line.trim().split(/\s*;\s*/);
      if (!parts[0]) return null;
      var quantity = parts[1] || "1";
      return { name: parts[0].trim(), quantity: quantity.trim().replace(",", ".") };
    }).filter(Boolean);
  }

  function sourceCards() {
    return state.stores.map(function (store) {
      var status = store.last_error ? "Errore fonte: " + store.last_error : (store.last_checked_at ? "Fonte raggiungibile · controllo " + store.last_checked_at.replace("T", " ").replace("Z", " UTC") : "Non ancora controllata");
      return '<article class="shopping-source"><strong>' + esc(store.name) + '</strong><span>' + esc(store.address || store.city) + '</span><small>' + esc(store.source_label || "Fonte ufficiale") + '</small><small>' + esc(status) + '</small><a href="' + esc(store.source_url) + '" target="_blank" rel="noopener noreferrer">Apri fonte ufficiale ↗</a></article>';
    }).join("");
  }

  function resultMarkup() {
    if (state.loading) return '<div class="shopping-empty">Confronto delle offerte disponibili…</div>';
    if (state.error) return '<div class="shopping-empty shopping-error">' + esc(state.error) + '</div>';
    if (!state.comparison) return '<div class="shopping-empty">Inserisci il carrello per confrontare le offerte verificabili.</div>';
    var comparison = state.comparison;
    var recommendation = comparison.recommendation;
    var recommendationMarkup = recommendation ? '<div class="shopping-recommendation"><strong>Oggi conviene: ' + esc(recommendation.store_name) + '</strong><div>Totale stimato del carrello: <strong>' + esc(recommendation.total_eur) + ' €</strong></div><small>' + esc(recommendation.address || "") + '</small></div>' : '<div class="shopping-empty">Dati insufficienti: manca un’offerta verificata per completare il carrello.</div>';
    var rows = (comparison.results || []).map(function (result) {
      var missing = result.missing && result.missing.length ? '<div class="shopping-missing">Mancano: ' + esc(result.missing.join(", ")) + '</div>' : '<div>Carrello completo</div>';
      var total = result.total_eur ? '<strong>' + esc(result.total_eur) + ' €</strong>' : '<strong>non calcolabile</strong>';
      return '<div class="shopping-store-row"><div><strong>' + esc(result.store_name) + '</strong><small>' + esc(result.address || "") + '</small>' + missing + '</div><div>' + total + '</div></div>';
    }).join("");
    return recommendationMarkup + '<div class="shopping-store-list">' + rows + '</div><p class="shopping-note">I prezzi dipendono da validità e fonte pubblicata; non provano la disponibilità in negozio. Verificare prima di partire.</p>';
  }

  function render() {
    var target = document.querySelector("#shoppingResults");
    var sources = document.querySelector("#shoppingSources");
    var pending = document.querySelector("#shoppingOfferDrafts");
    var storeSelect = document.querySelector("#shoppingFlyerStore");
    if (target) target.innerHTML = resultMarkup();
    if (sources) sources.innerHTML = sourceCards();
    if (storeSelect) storeSelect.innerHTML = state.stores.map(function (store) { return '<option value="' + esc(store.id) + '">' + esc(store.name) + '</option>'; }).join("");
    if (pending) pending.innerHTML = state.offers.length ? state.offers.map(function (offer) {
      return '<article class="shopping-source"><strong>' + esc(offer.product_name) + '</strong><span>' + esc(offer.brand || "") + ' ' + esc(offer.package_text || "") + ' · ' + (Number(offer.price_cents) / 100).toFixed(2) + ' €</span><small>' + esc(offer.store_name) + ' · ' + esc(offer.valid_from) + ' – ' + esc(offer.valid_to) + ' · da verificare</small><small>Ollama: ' + esc(offer.source_text || "bozza estratta") + ' · <a href="' + esc(offer.source_url) + '" target="_blank" rel="noopener noreferrer">Apri fonte ufficiale</a></small><button class="button button-quiet" data-shopping-action="verify-offer" data-offer-id="' + esc(offer.id) + '">Verificata sul volantino</button></article>';
    }).join("") : '<p class="shopping-help">Nessuna bozza da verificare.</p>';
  }

  function renderPage() {
    return '<section class="shopping-page"><div class="page-heading"><div><span class="eyebrow">RADAR SPESA LOCALE · FASE SOURCE-BACKED</span><h1>Confronta il carrello</h1><p class="shopping-intro">Controlla volantini e pagine ufficiali per stimare quale punto vendita conviene oggi. La città è configurabile; nessuna geolocalizzazione, carta fedeltà, acquisto o pagamento automatico.</p></div><button class="button button-quiet" data-shopping-action="refresh">Aggiorna fonti</button></div><div class="shopping-layout"><div><article class="shopping-panel"><h2>Il tuo carrello</h2><p class="shopping-help">Un prodotto per riga. Quantità opzionale dopo il punto e virgola, per esempio: pasta; 2</p><form id="shoppingForm" class="shopping-form"><label class="field-label" for="shoppingCity">Zona</label><input class="text-input" id="shoppingCity" value="Olbia" maxlength="80" /><label class="field-label" for="shoppingItems">Prodotti</label><textarea class="text-input" id="shoppingItems" placeholder="pasta\nlatte\nolio extravergine; 2" required></textarea><div class="shopping-actions"><button class="button button-primary" type="submit">Confronta carrello</button></div></form></article><div id="shoppingSources" class="shopping-sources"></div></div><article class="shopping-result"><h2>Risultato</h2><div id="shoppingResults" class="shopping-results"><div class="shopping-empty">Caricamento fonti ufficiali…</div></div></article></div></section>';
  }

  async function load() {
    var target = document.querySelector("#shoppingResults");
    if (!target) return;
    state.loading = true; state.error = ""; render();
    try { state.stores = (await api("/shopping/stores")).stores || []; state.offers = (await api("/shopping/offers?status=da_verificare")).offers || []; } catch (error) { state.error = error.message || "Accedi al server per leggere le fonti."; }
    state.loading = false; render();
  }

  async function scan() {
    state.loading = true; state.error = ""; render();
    try { await api("/shopping/scan", { method: "POST", body: "{}" }); await api("/shopping/discover", { method: "POST", body: "{}" }); await load(); }
    catch (error) { state.error = error.message || "Controllo delle fonti non disponibile."; state.loading = false; render(); }
  }

  async function compare() {
    var itemsNode = document.querySelector("#shoppingItems");
    if (!itemsNode) return;
    state.loading = true; state.error = ""; state.comparison = null; render();
    try { state.comparison = (await api("/shopping/compare", { method: "POST", body: JSON.stringify({ city: document.querySelector("#shoppingCity")?.value || "", items: parseItems(itemsNode.value) }) })).comparison; }
    catch (error) { state.error = error.message || "Confronto non disponibile."; }
    state.loading = false; render();
  }

  window.renderShoppingPage = renderPage;
  var originalRender = renderPage;
  window.renderShoppingPage = function () {
    return originalRender().replace('<div id="shoppingSources"', '<article class="shopping-panel"><h2>Scontrino e carrello demo</h2><p class="shopping-help">Carrello dimostrativo per due adulti e una bimba di 9 mesi. Quantità in confezioni; i prodotti infantili sono accessori, non un piano alimentare.</p><button type="button" class="button button-quiet" data-shopping-action="demo">Carica carrello famiglia</button><label class="field-label" for="shoppingReceipt">Foto dello scontrino (JPEG, PNG, WEBP)</label><input id="shoppingReceipt" type="file" accept="image/jpeg,image/png,image/webp" /><button type="button" class="button button-quiet" data-shopping-action="receipt">Leggi con Ollama</button><p id="shoppingReceiptStatus" role="status"></p><textarea id="shoppingReceiptDraft" class="text-input" placeholder="Bozza estratta: prodotto; quantità" aria-label="Bozza scontrino modificabile"></textarea><button type="button" class="button button-quiet" data-shopping-action="apply-receipt">Aggiungi bozza al carrello</button></article><div id="shoppingSources"');
  };
  var renderWithReceipt = window.renderShoppingPage;
  window.renderShoppingPage = function () {
    return renderWithReceipt().replace('<div id="shoppingSources"', '<article class="shopping-panel"><h2>Leggi un volantino con Ollama</h2><p class="shopping-help">Carica una foto o uno screenshot nitido di un volantino ufficiale. Ollama prepara offerte da verificare, senza attivare prezzi da solo.</p><label class="field-label" for="shoppingFlyerStore">Negozio</label><select class="text-input" id="shoppingFlyerStore"></select><label class="field-label" for="shoppingFlyer">Immagine del volantino (JPEG, PNG, WEBP)</label><input id="shoppingFlyer" type="file" accept="image/jpeg,image/png,image/webp" /><button type="button" class="button button-quiet" data-shopping-action="flyer">Estrai offerte in locale</button><p id="shoppingFlyerStatus" role="status"></p><div id="shoppingOfferDrafts"></div></article><div id="shoppingSources"');
  };
  function demo() {
    var node = document.querySelector("#shoppingItems");
    if (node) node.value = "pasta 500 g; 2\nriso 1 kg; 1\nlatte 1 l; 4\nyogurt naturale 4 vasetti; 2\nuova 6 pezzi; 2\npollo 500 g; 2\npane 500 g; 2\nmele 1 kg; 1\nbanane 1 kg; 1\ncarote 1 kg; 1\nzucchine 1 kg; 1\npatate 1 kg; 2\nolio extravergine 1 l; 1\npannolini confezione; 1\nsalviette confezione; 2";
  }
  async function receipt() {
    var file = document.querySelector("#shoppingReceipt")?.files[0];
    var status = document.querySelector("#shoppingReceiptStatus");
    if (!file || file.size > 20 * 1024 * 1024) { status.textContent = "Seleziona una foto fino a 20 MB."; return; }
    status.textContent = "Lettura locale dello scontrino in corso…";
    try {
      var encoded = await new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(String(reader.result).split(",")[1]); }; reader.onerror = reject; reader.readAsDataURL(file); });
      var result = await api("/shopping/receipt", { method: "POST", body: JSON.stringify({ file_name: file.name, mime_type: file.type, images: [encoded] }) });
      var items = result.extraction.items || [];
      document.querySelector("#shoppingReceiptDraft").value = items.map(function (item) { return item.description + "; " + (item.quantity || 1); }).join("\n");
      status.textContent = items.length + " righe estratte. Controlla prodotti e quantità prima di aggiungerli. " + (result.extraction.warnings || []).join(" ");
    } catch (error) { status.textContent = error.message; }
  }
  async function flyer() {
    var file = document.querySelector("#shoppingFlyer")?.files[0];
    var status = document.querySelector("#shoppingFlyerStatus");
    if (!file || file.size > 20 * 1024 * 1024) { status.textContent = "Seleziona una foto del volantino fino a 20 MB."; return; }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { status.textContent = "Formato non supportato: usa JPEG, PNG o WEBP."; return; }
    status.textContent = "Ollama sta leggendo il volantino in locale…";
    try {
      var encoded = await new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(String(reader.result).split(",")[1]); }; reader.onerror = reject; reader.readAsDataURL(file); });
      var result = await api("/shopping/flyer", { method: "POST", body: JSON.stringify({ file_name: file.name, mime_type: file.type, images: [encoded], store_id: document.querySelector("#shoppingFlyerStore")?.value || "" }) });
      status.textContent = (result.offers || []).length + " offerte salvate come bozze da verificare. " + (result.warnings || []).join(" ");
      state.offers = (await api("/shopping/offers?status=da_verificare")).offers || []; render();
    } catch (error) { status.textContent = error.message || "Lettura del volantino non riuscita."; }
  }
  async function verifyOffer(button) {
    button.disabled = true;
    try {
      await api("/shopping/offers/" + encodeURIComponent(button.dataset.offerId) + "/verify", { method: "POST", body: "{}" });
      state.offers = (await api("/shopping/offers?status=da_verificare")).offers || [];
      state.comparison = null; render();
    } catch (error) { window.alert(error.message || "Offerta non verificata."); button.disabled = false; }
  }
  window.loadShoppingPage = async function () { demo(); await load(); };
  document.addEventListener("submit", function (event) { if (event.target.id === "shoppingForm") { event.preventDefault(); compare(); } });
  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-shopping-action]");
    if (!button) return;
    if (button.dataset.shoppingAction === "refresh") scan();
    if (button.dataset.shoppingAction === "demo") demo();
    if (button.dataset.shoppingAction === "receipt") receipt();
    if (button.dataset.shoppingAction === "flyer") flyer();
    if (button.dataset.shoppingAction === "verify-offer") verifyOffer(button);
    if (button.dataset.shoppingAction === "apply-receipt") { var draft = document.querySelector("#shoppingReceiptDraft").value.trim(); if (draft) document.querySelector("#shoppingItems").value += "\n" + draft; }
  });
})();
