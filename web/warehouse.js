(function () {
  "use strict";
  var DB_NAME = "lumen-system-magazzino", DB_VERSION = 1;
  var TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js";
  var PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs";
  var PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs";
  var cache = { products: [], movements: [], documents: [], draft: null, error: "", loading: false, query: "", warehouseOpen: false };
  var dbPromise;

  function serverMode() {
    return !!(window.LMServer && window.LMServer.isActive && window.LMServer.isActive() && window.LMServer.request);
  }

  function openDatabase() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains("products")) db.createObjectStore("products", { keyPath: "id" });
        if (!db.objectStoreNames.contains("movements")) {
          var movements = db.createObjectStore("movements", { keyPath: "id" });
          movements.createIndex("documentId", "documentId", { unique: false });
          movements.createIndex("productId", "productId", { unique: false });
        }
        if (!db.objectStoreNames.contains("documents")) db.createObjectStore("documents", { keyPath: "id" });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("Database non disponibile.")); };
      request.onblocked = function () { reject(new Error("Chiudi le altre schede del sito e riprova.")); };
    });
    return dbPromise;
  }
  function requestResult(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }
  async function readAll(storeName) {
    var db = await openDatabase();
    return requestResult(db.transaction(storeName, "readonly").objectStore(storeName).getAll());
  }
  async function refreshData() {
    if (serverMode()) return refreshServerData();
    var results = await Promise.all([readAll("products"), readAll("movements"), readAll("documents")]);
    cache.products = results[0].sort(function (a, b) { return a.name.localeCompare(b.name, "it"); });
    cache.movements = results[1].sort(function (a, b) { return (b.savedAt || "").localeCompare(a.savedAt || ""); });
    cache.documents = results[2].sort(function (a, b) { return (b.savedAt || "").localeCompare(a.savedAt || ""); });
  }

  async function refreshServerData() {
    var api = window.LMServer.request;
    var responses = await Promise.all([api("/products"), api("/documents")]);
    cache.products = (responses[0].products || []).map(function (product) {
      return {
        id: product.id, name: product.name, code: product.code || "", unit: product.unit || "",
        orderedQty: Number(product.ordered_milli || 0) / 1000,
        receivedQty: Number(product.received_milli || 0) / 1000,
        lastSupplier: product.last_supplier || "", lastDate: product.last_date || "", lastRegisteredAt: product.last_registered_at || ""
      };
    }).sort(function (a, b) { return a.name.localeCompare(b.name, "it"); });
    var details = await Promise.all((responses[1].documents || []).map(function (summary) {
      return api("/documents/" + encodeURIComponent(summary.id)).then(function (payload) {
        return { summary: summary, detail: payload };
      });
    }));
    cache.documents = details.map(function (entry) {
      var summary = entry.summary, document = entry.detail.document;
      return {
        id: document.id, type: document.type, direction: summary.direction || "review",
        supplier: document.supplier || "", number: document.number || "", date: document.document_date || "",
        fileName: document.original_filename || "", itemCount: entry.detail.items.length,
        savedAt: document.created_at || ""
      };
    });
    cache.movements = [];
    details.forEach(function (entry) {
      var summary = entry.summary, document = entry.detail.document;
      var typeLabels = { invoice: "Fattura", ddt: "DDT", order: "Ordine", other: "Documento" };
      (entry.detail.items || []).forEach(function (line) {
        cache.movements.push({
          id: line.id, documentId: document.id, productId: line.product_id || "", name: line.name,
          code: line.code || "", unit: line.unit || "", quantity: Number(line.quantity_milli || 0) / 1000,
          unitPrice: line.unit_price_micros == null ? null : Number(line.unit_price_micros) / 1000000,
          supplier: document.supplier || "", date: document.document_date || "",
          documentTypeLabel: typeLabels[document.type] || "Documento", direction: line.registration,
          directionLabel: ({ review: "Da verificare", received: "Ricevuto", ordered: "Ordinato" })[line.registration] || line.registration, savedAt: document.created_at || ""
        });
      });
    });
    cache.documents.sort(function (a, b) { return (b.savedAt || "").localeCompare(a.savedAt || ""); });
    cache.movements.sort(function (a, b) { return (b.savedAt || "").localeCompare(a.savedAt || ""); });
  }
  function newId(prefix) {
    return prefix + "-" + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2));
  }
  function stableId(value) {
    var hash = 2166136261;
    for (var i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return "product-" + (hash >>> 0).toString(16);
  }
  function normalize(value) {
    return String(value || "").trim().toLocaleLowerCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  }
  function escHtml(value) {
    return window.esc ? window.esc(value == null ? "" : value) : String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function numberValue(value) {
    var text = String(value == null ? "" : value).trim().replace(/[€\s]/g, "");
    if (!text) return null;
    if (text.indexOf(",") >= 0) text = text.replace(/\./g, "").replace(",", ".");
    var result = Number(text);
    return Number.isFinite(result) ? result : null;
  }
  function displayNumber(value) { return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3 }).format(Number(value) || 0); }

  function registrationLabel(value) {
    if (!value) return "Non registrata";
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Non registrata" : new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Rome" }).format(date);
  }

  function renderWarehousePage() {
    var products = cache.products;
    var pending = cache.movements.filter(function (row) { return row.direction === "review"; });
    var search = normalize(cache.query);
    var visibleProducts = products.filter(function (p) { return !search || normalize([p.name, p.code, p.unit, p.lastSupplier].join(" ")).includes(search); });
    var receivedCount = cache.movements.filter(function (row) { return row.direction === "received"; }).length;
    var orderedCount = cache.movements.filter(function (row) { return row.direction === "ordered"; }).length;
    var productRows = visibleProducts.length ? visibleProducts.map(function (p) {
      return "<tr><td><strong>" + escHtml(p.name) + "</strong><small>" + (p.code ? "Cod. " + escHtml(p.code) : "Articolo") + "</small></td>" +
        "<td>" + escHtml(p.unit || "—") + "</td><td>" + displayNumber(p.orderedQty) + "</td><td>" + displayNumber(p.receivedQty) + "</td>" +
        "<td>" + escHtml(p.lastSupplier || "—") + "</td><td>" + escHtml(p.lastDate || "—") + "</td><td>" + escHtml(registrationLabel(p.lastRegisteredAt)) + "</td></tr>";
    }).join("") : '<tr><td class="wh-empty-cell" colspan="7">Nessun articolo salvato. Carica un documento o inserisci una riga manualmente.</td></tr>';
    var recentDocs = cache.documents.slice(0, 6).map(function (doc) {
      var label = doc.type === "invoice" ? "Fattura" : doc.type === "ddt" ? "DDT" : doc.type === "order" ? "Ordine" : "Documento";
      var stateLabel = doc.direction === "received" ? "Ricevuto" : doc.direction === "ordered" ? "Ordinato" : "Da verificare";
      var items = cache.movements.filter(function (row) { return row.documentId === doc.id; });
      var itemList = items.map(function (row) {
        return '<li><strong>' + escHtml(row.name) + '</strong><span>' + (row.code ? 'Cod. ' + escHtml(row.code) + ' · ' : '') + displayNumber(row.quantity) + ' ' + escHtml(row.unit || 'pz') + (row.unitPrice == null ? '' : ' · € ' + displayNumber(row.unitPrice)) + '</span></li>';
      }).join("");
      return "<tr><td><strong>" + escHtml(doc.supplier || "Fornitore da indicare") + "</strong><small>" + escHtml(doc.fileName || label) + "</small></td>" +
        "<td>" + label + (doc.number ? " · " + escHtml(doc.number) : "") + "</td><td>" + escHtml(doc.date || "—") + "</td>" +
        "<td>" + escHtml(registrationLabel(doc.savedAt)) + "</td><td>" + stateLabel + "</td><td><details class=\"wh-doc-items\"><summary>" + items.length + " voci · Apri elenco</summary><ul>" + (itemList || '<li>Voci non disponibili</li>') + "</ul></details></td></tr>";
    }).join("");
    var movementRows = pending.slice(0, 8).map(function (row) {
      return "<tr><td>" + escHtml(row.name) + "<small>" + escHtml(row.supplier || "Fornitore da indicare") + "</small></td>" +
        "<td>" + displayNumber(row.quantity) + " " + escHtml(row.unit || "") + "</td><td>" + escHtml(row.documentTypeLabel || "Documento") + "</td>" +
        '<td><div class="wh-review-actions"><button class="button button-quiet" type="button" data-wh-action="mark-review" data-id="' + escHtml(row.id) + '" data-direction="received">Ricevuto</button>' +
        '<button class="button button-quiet" type="button" data-wh-action="mark-review" data-id="' + escHtml(row.id) + '" data-direction="ordered">Ordinato</button></div></td></tr>';
    }).join("");
    return '<details class="wh-page-dropdown"' + (cache.warehouseOpen ? " open" : "") + '><summary><span class="eyebrow">SEZIONE MAGAZZINO</span><strong>Magazzino</strong><span class="wh-page-dropdown-hint">Apri i documenti e l’inventario <b aria-hidden="true">⌄</b></span></summary><div class="wh-page-dropdown-content">' +
      '<div class="page-heading"><div><span class="eyebrow">ACQUISTI E MATERIALI</span><h1>Magazzino</h1><p class="page-subtitle">Leggi fatture, DDT e ordini, verifica le righe e aggiorna l’inventario.</p></div>' +
      '<button class="button button-quiet" type="button" data-wh-action="export">Esporta CSV</button></div>' +
      '<div class="wh-notice"><strong>' + (serverMode() ? "Database centrale Lumen System." : "Documento elaborato nel browser.") + '</strong> ' + (serverMode() ? "La foto o il PDF viene inviato temporaneamente al PC del server e letto con un modello locale. Quando confermi, l’originale viene conservato nei File condivisi; non viene inviato a OpenAI. Controlla i dati estratti prima di caricarli nel magazzino." : "Per la prima lettura serve internet per scaricare il motore OCR; la foto o il PDF non viene caricato né conservato. Nel database vengono registrate solo le righe che confermi; i dati restano in questo browser e non si sincronizzano con altri dispositivi.") + '</div>' +
      '<section class="wh-stats"><article class="wh-stat"><span>Articoli in archivio</span><strong>' + products.length + '</strong></article><article class="wh-stat"><span>Righe registrate come ordinate</span><strong>' + orderedCount + '</strong></article><article class="wh-stat"><span>Righe registrate come ricevute</span><strong>' + receivedCount + '</strong></article><article class="wh-stat"><span>Da verificare</span><strong>' + pending.length + '</strong></article></section>' +
      '<section class="wh-panel wh-import-panel"><div class="wh-panel-heading"><div><span class="eyebrow">NUOVO DOCUMENTO</span><h2>Carica fattura, DDT o ordine</h2><p>Foto JPG/PNG/WEBP oppure PDF, massimo 20 MB.</p></div><button class="button button-quiet" type="button" data-wh-action="manual">Inserisci manualmente</button></div>' +
      '<div class="wh-upload-row"><label class="wh-upload-zone" for="whFile"><span class="wh-upload-icon">↑</span><span><strong>Scegli un file</strong><small id="whFileName">' + (serverMode() ? "Letto temporaneamente sul PC del server" : "Il documento resta sul dispositivo") + '</small></span></label><input id="whFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf,.jpg,.jpeg,.png,.webp" />' +
      '<button class="button button-primary" id="whAnalyze" type="button" data-wh-action="analyze" disabled>Leggi documento</button></div>' +
      '<div class="wh-progress hidden" id="whProgress"><div class="wh-progress-track"><span id="whProgressBar"></span></div><span id="whProgressLabel">Preparazione…</span></div>' +
      '<p class="wh-error" id="whError" role="alert">' + escHtml(cache.error) + '</p></section>' +
      (cache.draft ? renderDraft(cache.draft) : "") +
      '<section class="wh-panel"><div class="wh-panel-heading"><div><span class="eyebrow">INVENTARIO</span><h2>Articoli</h2><p>Quantità ordinate e ricevute, secondo i documenti verificati.</p></div><input class="wh-search" id="whSearch" type="search" placeholder="Cerca articolo o codice" value="' + escHtml(cache.query) + '" /></div>' +
      '<div class="wh-table-wrap"><table class="wh-table"><thead><tr><th>Articolo / codice</th><th>Unità</th><th>Ordinato</th><th>Ricevuto</th><th>Ultimo fornitore</th><th>Data documento</th><th>Ultimo caricamento (Italia)</th></tr></thead><tbody>' + productRows + '</tbody></table></div></section>' +
      (pending.length ? '<section class="wh-panel"><div class="wh-panel-heading"><div><span class="eyebrow">REVISIONE</span><h2>Righe da verificare</h2><p>Scegli se registrare ciascuna riga come ricevuta o ordinata.</p></div></div><div class="wh-table-wrap"><table class="wh-table"><thead><tr><th>Articolo / fornitore</th><th>Quantità</th><th>Documento</th><th>Registra come</th></tr></thead><tbody>' + movementRows + '</tbody></table></div></section>' : "") +
      (cache.documents.length ? '<section class="wh-panel"><div class="wh-panel-heading"><div><span class="eyebrow">ARCHIVIO</span><h2>Documenti inseriti</h2><p>Apri l’elenco per vedere le voci associate a ogni documento. I nuovi allegati caricati vengono salvati anche nei File condivisi.</p></div></div><div class="wh-table-wrap"><table class="wh-table"><thead><tr><th>Fornitore / file</th><th>Tipo e numero</th><th>Data documento</th><th>Caricato il (Italia)</th><th>Registrazione</th><th>Righe</th></tr></thead><tbody>' + recentDocs + '</tbody></table></div></section>' : "") + '</div></details>';
  }

  function renderDraft(draft) {
    var rows = draft.items.map(function (item, index) {
      return '<tr><td><input class="wh-row-input" data-wh-field="name" data-index="' + index + '" aria-label="Descrizione articolo" value="' + escHtml(item.name) + '" required /></td>' +
        '<td><input class="wh-row-input wh-code-input" data-wh-field="code" data-index="' + index + '" aria-label="Codice articolo" value="' + escHtml(item.code) + '" /></td>' +
        '<td><input class="wh-row-input wh-number-input" data-wh-field="quantity" data-index="' + index + '" inputmode="decimal" aria-label="Quantità" value="' + escHtml(item.quantity) + '" required /></td>' +
        '<td><input class="wh-row-input wh-unit-input" data-wh-field="unit" data-index="' + index + '" aria-label="Unità di misura" value="' + escHtml(item.unit) + '" placeholder="pz, kg, m…" /></td>' +
        '<td><input class="wh-row-input wh-number-input" data-wh-field="unitPrice" data-index="' + index + '" inputmode="decimal" aria-label="Prezzo unitario" value="' + escHtml(item.unitPrice) + '" /></td>' +
        '<td><button class="wh-remove-row" type="button" data-wh-action="remove-row" data-index="' + index + '" aria-label="Rimuovi riga">×</button></td></tr>';
    }).join("");
    var typeOptions = [["invoice", "Fattura"], ["ddt", "DDT"], ["order", "Ordine"], ["other", "Altro"]].map(function (entry) {
      return '<option value="' + entry[0] + '"' + (draft.type === entry[0] ? " selected" : "") + ">" + entry[1] + "</option>";
    }).join("");
    var directionOptions = [["review", "Da verificare"], ["received", "Ricevuto"], ["ordered", "Ordinato"]].map(function (entry) {
      return '<option value="' + entry[0] + '"' + (draft.direction === entry[0] ? " selected" : "") + ">" + entry[1] + "</option>";
    }).join("");
    return '<form class="wh-panel wh-draft" id="whDraftForm"><div class="wh-panel-heading"><div><span class="eyebrow">CONTROLLO DATI</span><h2>Verifica prima di registrare</h2><p>Il riconoscimento può sbagliare: controlla ogni campo e correggi i valori.</p></div><button class="button button-quiet" type="button" data-wh-action="discard-draft">Annulla</button></div>' +
      '<div class="wh-meta-grid"><label>Tipo documento<select class="text-input" name="type" id="whDocType" required>' + typeOptions + '</select></label>' +
      '<label>Fornitore<input class="text-input" name="supplier" maxlength="120" value="' + escHtml(draft.supplier) + '" placeholder="Da compilare se non leggibile" /></label>' +
      '<label>Numero documento<input class="text-input" name="number" maxlength="60" value="' + escHtml(draft.number) + '" /></label>' +
      '<label>Data documento<input class="text-input" name="date" type="date" value="' + escHtml(draft.date) + '" /></label>' +
      '<label>Registrazione<select class="text-input" id="whDirectionSelect" name="direction">' + directionOptions + '</select></label>' +
      '<label>File caricato<input class="text-input" value="' + escHtml(draft.fileName || "Inserimento manuale") + '" readonly /></label></div>' +
      '<p>Data e ora di caricamento vengono salvate automaticamente quando premi «Carica articoli», anche per l’inserimento manuale.</p>' +
      ((draft.warnings || []).length ? '<div class="wh-notice" role="status">' + draft.warnings.map(escHtml).join('<br>') + '</div>' : '') +
      '<div class="wh-table-wrap wh-edit-table"><table class="wh-table"><thead><tr><th>Descrizione *</th><th>Codice</th><th>Quantità *</th><th>Unità</th><th>Prezzo unitario (€)</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="wh-draft-actions"><button class="button button-quiet" type="button" data-wh-action="add-row">Aggiungi riga</button><span class="wh-draft-note">Conferma solo quando hai controllato le righe.</span><button class="button button-primary" type="submit">Carica articoli</button></div>' +
      (draft.rawText ? '<details class="wh-raw-text"><summary>Testo riconosciuto: confronta con il documento</summary><pre>' + escHtml(draft.rawText) + '</pre></details>' : "") + "</form>";
  }

  async function loadWarehousePage() {
    if (cache.loading) return;
    cache.loading = true;
    try { await refreshData(); cache.error = ""; }
    catch (error) { cache.error = error && error.message ? error.message : "Impossibile aprire il database in questo browser."; }
    finally {
      cache.loading = false;
      if (typeof state !== "undefined" && state.page === "warehouse") document.querySelector("#appContent").innerHTML = renderWarehousePage();
    }
  }
  function updateDraftField(event) {
    if (cache.draft) {
      var target = event.target, field = target.dataset.whField;
      if (target.id === "whDocType") cache.draft.type = target.value;
      if (target.id === "whDirectionSelect") cache.draft.direction = target.value;
      if (["supplier", "number", "date"].includes(target.name)) cache.draft[target.name] = target.value;
      if (field && cache.draft.items[target.dataset.index]) cache.draft.items[target.dataset.index][field] = target.value;
    }
    if (event.target.id === "whSearch") {
      cache.query = event.target.value;
      var pos = event.target.selectionStart;
      document.querySelector("#appContent").innerHTML = renderWarehousePage();
      var search = document.querySelector("#whSearch");
      if (search) { search.focus(); search.setSelectionRange(pos, pos); }
    }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-wh-script="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === "true") return resolve();
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", function () { reject(new Error("Impossibile caricare il motore OCR. Verifica la connessione.")); }, { once: true });
        return;
      }
      var script = document.createElement("script");
      script.src = src; script.async = true; script.dataset.whScript = src;
      script.onload = function () { script.dataset.loaded = "true"; resolve(); };
      script.onerror = function () { reject(new Error("Impossibile caricare il motore OCR. Verifica la connessione.")); };
      document.head.appendChild(script);
    });
  }
  function progress(message, percent) {
    var wrapper = document.querySelector("#whProgress"), label = document.querySelector("#whProgressLabel"), bar = document.querySelector("#whProgressBar");
    if (wrapper) wrapper.classList.remove("hidden");
    if (label) label.textContent = message;
    if (bar) bar.style.width = Math.max(3, Math.min(100, percent || 0)) + "%";
  }
  async function makeOcrWorker() {
    await loadScript(TESSERACT_URL);
    return window.Tesseract.createWorker(["ita", "eng"], 1, {
      workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js",
      corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0",
      logger: function (m) {
        if (m.status === "recognizing text") progress("Lettura testo… " + Math.round(m.progress * 100) + "%", 45 + m.progress * 50);
        else if (m.status === "loading language traineddata") progress("Scarico il modello italiano per la prima lettura…", 35);
      }
    });
  }
  async function canvasForImage(file) {
    var bitmap = await createImageBitmap(file), scale = Math.min(1, 3000 / Math.max(bitmap.width, bitmap.height));
    var canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d", { willReadFrequently: true }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas;
  }
  async function readPdf(file, worker) {
    var pdfjs = await import(PDFJS_URL);
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    var pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    var pages = Math.min(pdf.numPages, 15), extracted = [];
    for (var i = 1; i <= pages; i++) {
      progress("Controllo pagina " + i + " di " + pages + "…", 8 + i / pages * 20);
      var page = await pdf.getPage(i), content = await page.getTextContent(), lines = window.LMDocumentReader.pdfPage(content.items);
      if (lines.map(function (line) { return line.text; }).join(" ").trim().length > 25) extracted.push(lines);
      else {
        var viewport = page.getViewport({ scale: 2 }), canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;
        progress("OCR pagina " + i + " di " + pages + "…", 30 + i / pages * 15);
        extracted.push(window.LMDocumentReader.ocrPage((await worker.recognize(canvas, {}, { text: true, tsv: true })).data));
      }
      page.cleanup();
    }
    await pdf.destroy();
    return { pages: extracted, truncated: pdf.numPages > pages };
  }
  function typeFromText(text) {
    if (/\b(d\.?\s*d\.?\s*t\.?|documento di trasporto|bolla di consegna)\b/i.test(text)) return "ddt";
    if (/\b(ordine|conferma d.?ordine|order confirmation)\b/i.test(text)) return "order";
    if (/\b(fattura|invoice)\b/i.test(text)) return "invoice";
    return "other";
  }
  function dateFromText(text) {
    var m = text.match(/\bdata(?:\s+(?:documento|fattura|ddt|bolla|ordine))?\s*[:.]?\s*(0?[1-9]|[12]\d|3[01])[\/.-](0?[1-9]|1[0-2])[\/.-](20\d{2})\b/i);
    return m ? m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0") : "";
  }
  function numberFromText(text) {
    var m = text.match(/\b(?:numero\s+(?:documento|fattura|ddt|bolla|ordine)|(?:documento|fattura|ddt|bolla|ordine)\s*(?:n(?:umero)?\.?|n°)?)\s*[:.]?\s*([A-Z0-9/-]*\d[A-Z0-9/.-]*)\b/i);
    return m ? m[1] : "";
  }
  function guessedDirection(type) { return type === "ddt" ? "received" : type === "order" ? "ordered" : "review"; }
  function readAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || ""), comma = result.indexOf(",");
        if (comma < 0) return reject(new Error("Impossibile preparare il documento."));
        resolve(result.slice(comma + 1));
      };
      reader.onerror = function () { reject(new Error("Impossibile leggere il file selezionato.")); };
      reader.readAsDataURL(file);
    });
  }
  async function renderPdfImages(file) {
    var pdfjs = await import(PDFJS_URL);
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    var pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    var pageCount = Math.min(pdf.numPages, 5), images = [];
    for (var i = 1; i <= pageCount; i++) {
      progress("Preparo la pagina " + i + " di " + pageCount + " per la lettura locale…", 10 + Math.round(i / pageCount * 30));
      var page = await pdf.getPage(i), baseViewport = page.getViewport({ scale: 1 });
      var scale = Math.min(2, 1800 / Math.max(baseViewport.width, baseViewport.height));
      var viewport = page.getViewport({ scale: scale }), canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;
      images.push(canvas.toDataURL("image/jpeg", 0.88).split(",")[1]);
      canvas.width = 0; canvas.height = 0; page.cleanup();
    }
    var truncated = pdf.numPages > pageCount;
    await pdf.destroy();
    return { images: images, truncated: truncated };
  }
  async function analyzeFileWithServer(file) {
    var isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name), images, truncated = false;
    var mimeType = isPdf ? "image/jpeg" : file.type || (/\.png$/i.test(file.name) ? "image/png" : /\.webp$/i.test(file.name) ? "image/webp" : "image/jpeg");
    if (isPdf) {
      var rendered = await renderPdfImages(file); images = rendered.images; truncated = rendered.truncated;
    } else {
      progress("Invio al PC del server per la lettura locale…", 25);
      images = [await readAsBase64(file)];
    }
    var response = await window.LMServer.request("/documents/recognize", {
      method: "POST",
      body: JSON.stringify({ file_name: file.name, mime_type: mimeType, images: images })
    });
    var data = response.extraction || {}, type = ["ddt", "invoice", "order", "other"].includes(data.document_type) ? data.document_type : "other";
    var rows = Array.isArray(data.items) ? data.items.map(function (item) {
      return {
        name: String(item.description || "").trim(), code: String(item.code || "").trim(),
        quantity: item.quantity == null ? "" : String(item.quantity), unit: String(item.unit || "").trim(),
        unitPrice: item.unit_price == null ? "" : String(item.unit_price)
      };
    }).filter(function (item) { return item.name || item.code || item.quantity; }) : [];
    var date = /^20\d\d-\d\d-\d\d$/.test(String(data.date || "")) ? data.date : "";
    var warnings = Array.isArray(data.warnings) ? data.warnings.map(String) : [];
    if (truncated) warnings.push("Sono state lette solo le prime 5 pagine del PDF; carica le pagine restanti separatamente.");
    if (!rows.length) warnings.push("Non sono state riconosciute righe articolo: controlla il documento e inserisci i dati manualmente.");
    cache.draft = {
      fileName: file.name, attachment: file, type: type, direction: guessedDirection(type),
      supplier: String(data.supplier || "").trim(), number: String(data.number || "").trim(), date: date,
      items: rows.length ? rows : [{ name: "", code: "", quantity: "", unit: "", unitPrice: "" }],
      rawText: "", extractedRows: rows.length, warnings: warnings
    };
    cache.error = "";
  }
  async function analyzeFile() {
    var fileInput = document.querySelector("#whFile"), file = fileInput && fileInput.files[0], error = document.querySelector("#whError");
    if (!file) return;
    error.textContent = "";
    if (file.size > 20 * 1024 * 1024) { error.textContent = "Il file supera il limite di 20 MB."; return; }
    var isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    var isImage = /^image\/(jpeg|png|webp)$/i.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
    if (!isPdf && !isImage) { error.textContent = "Formato non supportato. Scegli un PDF, JPG, PNG o WEBP."; return; }
    var button = document.querySelector("#whAnalyze"), worker;
    button.disabled = true;
    try {
      if (serverMode()) {
        await analyzeFileWithServer(file);
        document.querySelector("#appContent").innerHTML = renderWarehousePage();
        progress("Lettura locale completata. Controlla ogni campo prima di caricare.", 100);
        window.setTimeout(function () { var p = document.querySelector("#whProgress"); if (p) p.classList.add("hidden"); }, 6000);
        return;
      }
      progress("Avvio della lettura nel browser…", 3);
      worker = await makeOcrWorker();
      var extraction;
      if (isPdf) extraction = await readPdf(file, worker);
      else {
        progress("Preparazione immagine…", 20);
        var canvas = await canvasForImage(file);
        extraction = { pages: [window.LMDocumentReader.ocrPage((await worker.recognize(canvas, {}, { text: true, tsv: true })).data)] };
        canvas.width = 0; canvas.height = 0;
      }
      var text = extraction.pages.map(function (page) { return page.map(function (line) { return line.text; }).join("\n"); }).join("\n\n");
      var parsed = window.LMDocumentReader.parse(extraction.pages), type = typeFromText(text), rows = parsed.items;
      if (extraction.truncated) parsed.warnings.push("Lettura limitata alle prime 15 pagine del PDF: carica separatamente le pagine successive.");
      cache.draft = {
        fileName: file.name, attachment: file, type: type, direction: guessedDirection(type), supplier: "",
        number: numberFromText(text), date: dateFromText(text),
        items: rows.length ? rows : [{ name: "", code: "", quantity: "", unit: "", unitPrice: "" }],
        rawText: text, extractedRows: rows.length, warnings: parsed.warnings
      };
      cache.error = "";
      document.querySelector("#appContent").innerHTML = renderWarehousePage();
      progress("Lettura completata. Controlla e correggi i dati.", 100);
      window.setTimeout(function () { var p = document.querySelector("#whProgress"); if (p) p.classList.add("hidden"); }, 5000);
    } catch (failure) {
      cache.error = "Non è stato possibile leggere il documento. " + (failure && failure.message || "") + " Puoi inserirlo manualmente.";
      if (document.querySelector("#whError")) document.querySelector("#whError").textContent = cache.error;
      if (document.querySelector("#whProgress")) document.querySelector("#whProgress").classList.add("hidden");
    } finally {
      if (worker) { try { await worker.terminate(); } catch (_) {} }
      if (document.querySelector("#whAnalyze")) document.querySelector("#whAnalyze").disabled = false;
    }
  }
  function draftFromForm(form) {
    var data = new FormData(form), direction = form.querySelector("#whDirectionSelect").value;
    var items = cache.draft.items.map(function (item) {
      return { name: String(item.name || "").trim(), code: String(item.code || "").trim(), quantity: numberValue(item.quantity), unit: String(item.unit || "").trim(), unitPrice: numberValue(item.unitPrice) };
    }).filter(function (item) { return item.name || item.quantity != null; });
    if (!items.length) throw new Error("Aggiungi almeno una riga prodotto.");
    if (items.some(function (item) { return !item.name || !(item.quantity > 0); })) throw new Error("Ogni riga deve avere una descrizione e una quantità maggiore di zero.");
    var type = data.get("type"), directionLabels = { received: "Ricevuto", ordered: "Ordinato", review: "Da verificare" };
    var typeLabels = { invoice: "Fattura", ddt: "DDT", order: "Ordine", other: "Documento" };
    return {
      id: newId("doc"), type: type, typeLabel: typeLabels[type] || "Documento", direction: direction,
      supplier: String(data.get("supplier") || "").trim(), number: String(data.get("number") || "").trim(),
      date: String(data.get("date") || ""), fileName: cache.draft.fileName || "",
      itemCount: items.length, savedAt: new Date().toISOString(), items: items,
      directionLabel: directionLabels[direction] || direction
    };
  }
  async function saveDraftServer(doc) {
    var response = await window.LMServer.request("/documents/drafts", {
      method: "POST",
      body: JSON.stringify({
        id: doc.id, type: doc.type, supplier: doc.supplier, number: doc.number, date: doc.date,
        file_name: doc.fileName, items: doc.items.map(function (item) {
          return {
            name: item.name, code: item.code, quantity: item.quantity, unit: item.unit,
            unit_price_micros: item.unitPrice == null ? null : Math.round(item.unitPrice * 1000000),
            registration: doc.direction
          };
        })
      })
    });
    var draft = response.document;
    var documentId = draft.document.id;
    var items = draft.items.map(function (line) {
      return {
        id: line.id, name: line.name, code: line.code, unit: line.unit,
        quantity_milli: line.quantity_milli, registration: doc.direction
      };
    });
    var confirmed = await window.LMServer.request("/documents/" + encodeURIComponent(documentId) + "/confirm", {
      method: "POST", body: JSON.stringify({ items: items })
    });
    if (cache.draft && cache.draft.attachment) {
      var file = cache.draft.attachment;
      var fileLabel = doc.type === "ddt" ? "DDT magazzino" : doc.type === "invoice" ? "Fattura magazzino" : doc.type === "order" ? "Ordine magazzino" : "Documento magazzino";
      var description = fileLabel + (doc.supplier ? " — " + doc.supplier : "") + (doc.number ? " · n. " + doc.number : "") + (doc.date ? " · del " + doc.date : "");
      try {
        var content = await new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () { var value = String(reader.result || ""); resolve(value.slice(value.indexOf(",") + 1)); };
          reader.onerror = function () { reject(new Error("Impossibile leggere il file originale.")); };
          reader.readAsDataURL(file);
        });
        await window.LMServer.request("/files", { method: "POST", body: JSON.stringify({ name: file.name, mime: file.type, description: description || fileLabel, category: fileLabel, content_base64: content }) });
      } catch (error) {
        var attachmentError = new Error("Le voci del documento sono state registrate, ma l’allegato non è stato salvato nei File condivisi: " + (error && error.message || "errore del server"));
        attachmentError.documentSaved = true;
        attachmentError.cause = error;
        throw attachmentError;
      }
    }
    return confirmed;
  }
  async function saveDraft(form) {
    var doc = draftFromForm(form);
    if (serverMode()) return saveDraftServer(doc);
    var db = await openDatabase();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(["products", "movements", "documents"], "readwrite");
      tx.objectStore("documents").put({ id: doc.id, type: doc.type, direction: doc.direction, supplier: doc.supplier, number: doc.number, date: doc.date, fileName: doc.fileName, itemCount: doc.itemCount, savedAt: doc.savedAt });
      doc.items.forEach(function (item) {
        var key = normalize(item.code || item.name) + (item.code ? "" : "|" + normalize(item.unit)), productId = stableId(key);
        var movement = { id: newId("move"), documentId: doc.id, productId: productId, name: item.name, code: item.code, unit: item.unit, quantity: item.quantity, unitPrice: item.unitPrice, supplier: doc.supplier, date: doc.date, documentTypeLabel: doc.typeLabel, direction: doc.direction, directionLabel: doc.directionLabel, savedAt: doc.savedAt };
        tx.objectStore("movements").put(movement);
        var store = tx.objectStore("products"), getProduct = store.get(productId);
        getProduct.onsuccess = function () {
          var p = getProduct.result || { id: productId, name: item.name, code: item.code, unit: item.unit, orderedQty: 0, receivedQty: 0, lastSupplier: "", lastDate: "" };
          if (item.name) p.name = item.name;
          if (item.code) p.code = item.code;
          if (item.unit) p.unit = item.unit;
          if (doc.supplier) p.lastSupplier = doc.supplier;
          if (doc.date) p.lastDate = doc.date;
          p.lastRegisteredAt = doc.savedAt;
          if (doc.direction === "ordered") p.orderedQty = Number(p.orderedQty || 0) + item.quantity;
          if (doc.direction === "received") p.receivedQty = Number(p.receivedQty || 0) + item.quantity;
          p.updatedAt = doc.savedAt;
          store.put(p);
        };
      });
      tx.oncomplete = resolve;
      tx.onerror = function () { reject(tx.error || new Error("Salvataggio non riuscito.")); };
      tx.onabort = function () { reject(tx.error || new Error("Salvataggio annullato.")); };
    });
  }
  async function markMovement(id, direction) {
    if (serverMode()) {
      var serverMove = cache.movements.find(function (row) { return row.id === id; });
      if (!serverMove) return;
      return window.LMServer.request("/documents/" + encodeURIComponent(serverMove.documentId) + "/confirm", {
        method: "POST",
        body: JSON.stringify({ items: [{
          id: serverMove.id, name: serverMove.name, code: serverMove.code, unit: serverMove.unit,
          quantity_milli: Math.round(Number(serverMove.quantity || 0) * 1000), registration: direction
        }] })
      });
    }
    var db = await openDatabase();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(["products", "movements"], "readwrite"), store = tx.objectStore("movements"), request = store.get(id);
      request.onsuccess = function () {
        var move = request.result;
        if (!move || move.direction !== "review") return;
        move.direction = direction; move.directionLabel = direction === "received" ? "Ricevuto" : "Ordinato"; store.put(move);
        var products = tx.objectStore("products"), productReq = products.get(move.productId);
        productReq.onsuccess = function () {
          var p = productReq.result;
          if (!p) return;
          var field = direction === "received" ? "receivedQty" : "orderedQty";
          p[field] = Number(p[field] || 0) + Number(move.quantity || 0); p.updatedAt = new Date().toISOString(); products.put(p);
        };
      };
      tx.oncomplete = resolve;
      tx.onerror = function () { reject(tx.error || new Error("Aggiornamento non riuscito.")); };
    });
  }
  function exportCsv() {
    var rows = [["Articolo", "Codice", "Unità", "Ordinato", "Ricevuto", "Ultimo fornitore", "Data documento", "Ultimo caricamento (Italia)"]];
    cache.products.forEach(function (p) { rows.push([p.name, p.code, p.unit, p.orderedQty, p.receivedQty, p.lastSupplier, p.lastDate, registrationLabel(p.lastRegisteredAt)]); });
    var csv = "\uFEFF" + rows.map(function (row) { return row.map(function (cell) { return '"' + String(cell == null ? "" : cell).replace(/"/g, '""') + '"'; }).join(";"); }).join("\r\n");
    var url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    var link = document.createElement("a"); link.href = url; link.download = "lumen-system-magazzino.csv"; link.click(); URL.revokeObjectURL(url);
  }

  document.addEventListener("change", function (event) {
    if (event.target.id === "whFile") {
      var file = event.target.files && event.target.files[0];
      var label = document.querySelector("#whFileName"), button = document.querySelector("#whAnalyze");
      if (label) label.textContent = file ? file.name : "Il documento resta sul dispositivo";
      if (button) button.disabled = !file;
    }
    updateDraftField(event);
  });
  document.addEventListener("input", updateDraftField);
  document.addEventListener("toggle", function (event) {
    if (event.target.matches && event.target.matches(".wh-page-dropdown")) cache.warehouseOpen = event.target.open;
  }, true);
  document.addEventListener("click", async function (event) {
    var button = event.target.closest("[data-wh-action]");
    if (!button) return;
    var action = button.dataset.whAction;
    try {
      if (action === "analyze") await analyzeFile();
      else if (action === "manual") {
        cache.draft = { fileName: "", type: "other", direction: "review", supplier: "", number: "", date: "", items: [{ name: "", code: "", quantity: "", unit: "", unitPrice: "" }], rawText: "" };
        document.querySelector("#appContent").innerHTML = renderWarehousePage();
      } else if (action === "discard-draft") {
        cache.draft = null; cache.error = ""; document.querySelector("#appContent").innerHTML = renderWarehousePage();
      } else if (action === "add-row") {
        cache.draft.items.push({ name: "", code: "", quantity: "", unit: "", unitPrice: "" });
        document.querySelector("#appContent").innerHTML = renderWarehousePage();
      } else if (action === "remove-row") {
        if (cache.draft.items.length > 1) cache.draft.items.splice(Number(button.dataset.index), 1);
        document.querySelector("#appContent").innerHTML = renderWarehousePage();
      } else if (action === "export") exportCsv();
      else if (action === "mark-review") {
        await markMovement(button.dataset.id, button.dataset.direction); await refreshData();
        document.querySelector("#appContent").innerHTML = renderWarehousePage();
      }
    } catch (error) {
      cache.error = error && error.message ? error.message : "Operazione non riuscita.";
      if (document.querySelector("#whError")) document.querySelector("#whError").textContent = cache.error;
    }
  });
  document.addEventListener("submit", async function (event) {
    if (event.target.id !== "whDraftForm") return;
    event.preventDefault();
    var button = event.target.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      await saveDraft(event.target); cache.draft = null; cache.error = ""; await refreshData();
      document.querySelector("#appContent").innerHTML = renderWarehousePage();
    } catch (error) {
      cache.error = error && error.message ? error.message : "Non è stato possibile registrare i dati.";
      if (error && error.documentSaved) { cache.draft = null; await refreshData(); document.querySelector("#appContent").innerHTML = renderWarehousePage(); }
      if (document.querySelector("#whError")) document.querySelector("#whError").textContent = cache.error;
      if (button) button.disabled = false;
    }
  });
  window.renderWarehousePage = renderWarehousePage;
  window.loadWarehousePage = loadWarehousePage;
})();
