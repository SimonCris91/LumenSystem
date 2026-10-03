(function () {
  "use strict";

  var cache = { files: [], error: "", loading: false, previewUrl: "", folder: "all", refresh: null };

  function active() {
    return !!(window.LMServer && window.LMServer.isActive && window.LMServer.isActive() && window.LMServer.request);
  }

  function esc(value) {
    return window.esc ? window.esc(value == null ? "" : value) : String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function downloadUrl(path) {
    var value = String(path || "");
    if (/^https?:\/\//i.test(value)) return value;
    var base = String(window.LM_API_BASE || "").replace(/\/+$/, "");
    return base + (value.charAt(0) === "/" ? value : "/" + value);
  }
  function sizeLabel(bytes) {
    var value = Number(bytes) || 0;
    if (value < 1024) return value + " B";
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
    return (value / (1024 * 1024)).toFixed(1) + " MB";
  }

  function dateLabel(value) {
    if (!value) return "—";
    try { return new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Rome" }).format(new Date(value)); }
    catch (_) { return value; }
  }

  function fileType(name) {
    var extension = (String(name).match(/\.[^.]+$/) || [""])[0].toLowerCase();
    var labels = { ".skp": "File del progetto SketchUp (.SKP)", ".pdf": "Documento PDF", ".jpg": "Immagine JPEG", ".jpeg": "Immagine JPEG", ".png": "Immagine PNG", ".webp": "Immagine WEBP", ".xlsx": "Foglio Excel", ".xls": "Foglio Excel", ".docx": "Documento Word", ".zip": "Archivio ZIP", ".dwg": "Disegno CAD (.DWG)", ".dxf": "Disegno CAD (.DXF)" };
    return { description: labels[extension] || (extension ? "File " + extension.toUpperCase() : "File senza estensione"), category: extension === ".skp" ? "Programma SketchUp" : "" };
  }

  function previewKind(file) {
    var name = String(file.name || "").toLowerCase();
    var mime = String(file.mime || "").toLowerCase().split(";")[0];
    if (/\.pdf$/.test(name) || mime === "application/pdf") return "pdf";
    if (/\.(jpe?g|png|gif|webp|bmp)$/.test(name) || /^image\/(jpeg|png|gif|webp|bmp)$/.test(mime)) return "image";
    if (/\.(txt|csv|log|md|ngc)$/.test(name) || /^(text\/(plain|csv)|application\/(csv|x-csv))$/.test(mime)) return "text";
    return "";
  }

  function renderFileRows(files, emptyText) {
    return files.length ? files.map(function (file) {
      var preview = previewKind(file);
      return '<article class="rosetta-file"><div class="rosetta-file-main"><strong>' + esc(file.name) + '</strong><div class="rosetta-file-details"><span>Modificato il ' + esc(dateLabel(file.modified_at)) + '</span><span>' + esc(sizeLabel(file.size)) + '</span></div></div>' +
        '<div class="shared-file-actions">' + (preview ? '<button class="button button-quiet" type="button" data-file-action="preview" data-name="' + esc(file.name) + '" data-kind="' + preview + '" data-url="' + esc(downloadUrl(file.download)) + '">Anteprima</button>' : '') + '<button class="button button-quiet" type="button" data-file-action="download" data-name="' + esc(file.name) + '" data-url="' + esc(downloadUrl(file.download)) + '">Scarica</button></div></article>';
    }).join("") : '<div class="rosetta-empty">' + emptyText + '</div>';
  }

  function renderFilesPage() {
    if (!active()) {
      return '<div class="page-heading"><div><span class="eyebrow">ARCHIVIO CONDIVISO</span><h1>File condivisi</h1><p class="page-subtitle">Accedi al server Lumen System per caricare e scaricare i file dell’officina.</p></div></div>' +
        '<section class="wh-panel"><div class="wh-notice"><strong>Server non collegato.</strong> Apri l’indirizzo del server e accedi prima di usare l’archivio condiviso.</div></section>';
    }
    var folderLabels = { all: "Tutti i file", rosetta: "Rosetta", sketchup: "SketchUp" };
    var folder = folderLabels[cache.folder] ? cache.folder : "all";
    var emptyLabels = { all: "Nessun file condiviso.", rosetta: "Nessun file .NGC nella cartella Rosetta.", sketchup: "Nessun file .SKP nella cartella SketchUp." };
    var rows = renderFileRows(cache.files, emptyLabels[folder]);
    return '<div class="page-heading"><div><span class="eyebrow">ARCHIVIO CONDIVISO</span><h1>File condivisi</h1><p class="page-subtitle">Carica e scarica documenti accessibili ai dispositivi autorizzati.</p></div></div>' +
      '<div class="file-folder-tabs"><button class="button button-quiet file-folder-tab ' + (folder === "all" ? "is-active" : "") + '" type="button" data-file-action="all">Tutti i file</button><button class="button button-quiet file-folder-tab ' + (folder === "rosetta" ? "is-active" : "") + '" type="button" data-file-action="rosetta">Rosetta · CNC</button><button class="button button-quiet file-folder-tab ' + (folder === "sketchup" ? "is-active" : "") + '" type="button" data-file-action="sketchup">SketchUp</button></div>' +
      '<section class="wh-panel rosetta-upload-panel"><div class="wh-panel-heading"><div><span class="eyebrow">CARICAMENTO AUTOMATICO</span><h2>' + esc(folderLabels[folder]) + '</h2><p>Usa un solo caricamento: i file .NGC vanno in Rosetta, i .SKP in SketchUp; gli altri restano nei File condivisi.</p></div></div>' +
      '<div class="wh-upload-row rosetta-upload-row"><label class="wh-upload-zone" for="sharedFile"><span class="wh-upload-icon">↑</span><span><strong>Scegli un file</strong><small id="sharedFileName">Nessun file selezionato</small></span></label><input id="sharedFile" type="file" />' +
      '<button class="button button-primary" type="button" data-file-action="upload">Conferma</button></div><p class="wh-error" id="sharedFileError" role="alert">' + esc(cache.error) + '</p></section>' +
      '<section class="wh-panel"><div class="wh-panel-heading"><div><span class="eyebrow">ARCHIVIO</span><h2>' + esc(folderLabels[folder]) + '</h2><p>' + cache.files.length + ' file, dal più recente al più vecchio.</p></div><button class="button button-primary" type="button" data-file-action="refresh"' + (cache.refresh && cache.refresh.running ? ' disabled' : '') + '>Aggiorna</button></div>' +
      '<p class="wh-notice" id="sharedRefreshStatus" role="status">' + esc(refreshLabel()) + '</p>' +
      '<div class="rosetta-file-list">' + rows + '</div></section>' +
      '<dialog class="shared-preview-dialog" id="sharedPreviewDialog" aria-labelledby="sharedPreviewTitle"><div class="shared-preview-head"><div><span class="eyebrow">FILE ROSETTA</span><h2 id="sharedPreviewTitle">Anteprima</h2></div><button class="icon-button" type="button" data-file-action="close-preview" aria-label="Chiudi anteprima">×</button></div><div class="shared-preview-body" id="sharedPreviewBody" aria-live="polite"><p>Caricamento anteprima…</p></div><div class="shared-preview-actions"><button class="button button-quiet" id="sharedPreviewDownload" type="button" data-file-action="download">Scarica</button><button class="button button-primary" type="button" data-file-action="close-preview">Chiudi</button></div></dialog>';
  }

  function refreshLabel() {
    var result = cache.refresh;
    if (!result) return "Aggiorna importa i nuovi file .SKP dall'ufficio e dal Mac, quando il servizio è collegato.";
    if (result.running) return "Scansione delle cartelle condivise in corso… Puoi continuare a usare il calendario.";
    var parts = (result.sources || []).map(function (source) {
      return source.name + ": " + (source.error || (source.imported + " nuovi, " + source.skipped + " già presenti"));
    });
    return "Aggiornamento terminato. " + (result.imported || 0) + " nuovi file, " + (result.skipped || 0) + " già presenti. " + parts.join(" · ");
  }

  function showRefreshStatus() {
    var status = document.querySelector("#sharedRefreshStatus");
    if (status) status.textContent = refreshLabel();
  }

  async function refreshSharedFiles() {
    cache.refresh = await window.LMServer.request("/files/refresh", { method: "POST" });
    showRefreshStatus();
    while (cache.refresh.running) {
      await new Promise(function (resolve) { setTimeout(resolve, 1500); });
      cache.refresh = await window.LMServer.request("/files/refresh");
      showRefreshStatus();
    }
    await loadFilesPage();
    showRefreshStatus();
  }

  function closePreview() {
    var dialog = document.querySelector("#sharedPreviewDialog");
    if (dialog && dialog.open) dialog.close();
    var body = document.querySelector("#sharedPreviewBody");
    if (body) body.replaceChildren();
    if (cache.previewUrl) URL.revokeObjectURL(cache.previewUrl);
    cache.previewUrl = "";
  }

  async function previewFile(button) {
    closePreview();
    var dialog = document.querySelector("#sharedPreviewDialog");
    var body = document.querySelector("#sharedPreviewBody");
    var title = document.querySelector("#sharedPreviewTitle");
    var download = document.querySelector("#sharedPreviewDownload");
    dialog.onclose = function () {
      var content = document.querySelector("#sharedPreviewBody");
      if (content) content.replaceChildren();
      if (cache.previewUrl) URL.revokeObjectURL(cache.previewUrl);
      cache.previewUrl = "";
    };
    title.textContent = button.dataset.name || "Anteprima";
    download.dataset.url = button.dataset.url;
    download.dataset.name = button.dataset.name || "file";
    body.innerHTML = "<p>Caricamento anteprima…</p>";
    dialog.showModal();
    button.disabled = true;
    try {
      var response = await fetch(button.dataset.url, { credentials: "include", headers: { Accept: "application/pdf,image/*,text/plain,text/csv" } });
      if (!response.ok) throw new Error(response.status === 401 ? "La sessione è scaduta. Accedi di nuovo al server." : "Il server non riesce a leggere questo file.");
      var blob = await response.blob();
      var kind = button.dataset.kind;
      if ((kind === "pdf" && blob.type !== "application/pdf") || (kind === "image" && !blob.type.toLowerCase().startsWith("image/")) || (kind === "text" && !blob.type.toLowerCase().startsWith("text/"))) {
        throw new Error("Il formato ricevuto dal server non è compatibile con l’anteprima.");
      }
      cache.previewUrl = URL.createObjectURL(blob);
      body.replaceChildren();
      if (kind === "pdf") {
        var frame = document.createElement("iframe");
        frame.className = "shared-preview-frame";
        frame.title = "Anteprima PDF: " + title.textContent;
        frame.src = cache.previewUrl;
        body.appendChild(frame);
      } else if (kind === "image") {
        var image = document.createElement("img");
        image.className = "shared-preview-image";
        image.alt = "Anteprima di " + title.textContent;
        image.src = cache.previewUrl;
        body.appendChild(image);
      } else {
        var pre = document.createElement("pre");
        pre.className = "shared-preview-text";
        pre.textContent = await blob.text();
        body.appendChild(pre);
      }
    } catch (error) {
      body.textContent = error && error.message || "Anteprima non disponibile.";
    } finally {
      button.disabled = false;
    }
  }

  async function downloadFile(button) {
    var url = button.dataset.url;
    if (!url) throw new Error("File non disponibile.");
    button.disabled = true;
    try {
      var response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error(response.status === 401 ? "La sessione è scaduta. Accedi di nuovo al server." : "Il server non riesce a scaricare questo file.");
      var blob = await response.blob();
      var objectUrl = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = objectUrl;
      link.download = button.dataset.name || "download";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
    } finally {
      button.disabled = false;
    }
  }

  function fileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || "");
        resolve(result.indexOf(",") >= 0 ? result.slice(result.indexOf(",") + 1) : result);
      };
      reader.onerror = function () { reject(new Error("Impossibile leggere il file.")); };
      reader.readAsDataURL(file);
    });
  }

  async function loadFilesPage() {
    if (!active()) return;
    cache.loading = true;
    document.querySelectorAll(".file-folder-tab").forEach(function (tab) { tab.classList.toggle("is-loading", tab.dataset.fileAction === cache.folder); });
    try {
      var routes = { all: "/files", rosetta: "/rosetta/files", sketchup: "/sketchup/files" };
      if (cache.folder === "all") {
        var payloads = await Promise.all([window.LMServer.request("/files"), window.LMServer.request("/rosetta/files"), window.LMServer.request("/sketchup/files")]);
        cache.files = payloads.reduce(function (all, payload) { return all.concat(Array.isArray(payload.files) ? payload.files : []); }, []).sort(function (a, b) {
          return (Date.parse(b.uploaded_at || b.modified_at) || 0) - (Date.parse(a.uploaded_at || a.modified_at) || 0);
        });
      } else {
        var payload = await window.LMServer.request(routes[cache.folder] || routes.all);
        cache.files = Array.isArray(payload.files) ? payload.files : [];
      }
      cache.error = "";
    } catch (error) {
      cache.error = error && error.message ? error.message : "Impossibile leggere la cartella condivisa.";
    } finally {
      cache.loading = false;
      document.querySelectorAll(".file-folder-tab").forEach(function (tab) { tab.classList.remove("is-loading"); });
      if (typeof state !== "undefined" && state.page === "files") document.querySelector("#appContent").innerHTML = renderFilesPage();
    }
  }

  async function uploadFile() {
    var input = document.querySelector("#sharedFile"), file = input && input.files[0];
    if (!file) throw new Error("Scegli prima un file.");
    if (file.size > 50 * 1024 * 1024) throw new Error("Il file supera il limite di 50 MB.");
    var extension = (String(file.name).match(/\.[^.]+$/) || [""])[0].toLowerCase();
    var routes = { ".ngc": ["/rosetta/files", "rosetta", "text/plain"], ".skp": ["/sketchup/files", "sketchup", "application/octet-stream"] };
    var route = routes[extension] || ["/files", "all", file.type || "application/octet-stream"];
    var button = document.querySelector('[data-file-action="upload"]');
    if (button) button.disabled = true;
    try {
      var content = await fileAsBase64(file);
      var result = await window.LMServer.request(route[0], { method: "POST", body: JSON.stringify({ name: file.name, mime: route[2], description: fileType(file.name).description, category: fileType(file.name).category, content_base64: content }) });
      if (!result.file || !result.file.name) throw new Error("Il server non ha confermato il caricamento del file.");
      cache.error = "";
      cache.folder = route[1];
      await loadFilesPage();
    } finally {
      if (button) button.disabled = false;
    }
  }

  document.addEventListener("change", function (event) {
    if (event.target.id === "sharedFile") {
      var label = document.querySelector("#sharedFileName");
      if (label) label.textContent = event.target.files[0] ? event.target.files[0].name : "Nessun file selezionato";
    }
  });
  document.addEventListener("click", async function (event) {
    var button = event.target.closest("[data-file-action]");
    if (!button) return;
    try {
      if (button.dataset.fileAction === "all" || button.dataset.fileAction === "rosetta" || button.dataset.fileAction === "sketchup") {
        cache.folder = button.dataset.fileAction;
        window.LMFilesFolder = cache.folder;
        document.querySelectorAll(".nav-files-cta").forEach(function (item) { item.classList.toggle("is-active", item.dataset.folder === cache.folder); });
        await loadFilesPage();
      }
      else if (button.dataset.fileAction === "upload") await uploadFile();
      else if (button.dataset.fileAction === "refresh") {
        button.disabled = true;
        try { await refreshSharedFiles(); }
        finally { button.disabled = false; }
      }
      else if (button.dataset.fileAction === "preview") await previewFile(button);
      else if (button.dataset.fileAction === "download") await downloadFile(button);
      else if (button.dataset.fileAction === "close-preview") closePreview();
    }
    catch (error) {
      cache.error = error && error.message ? error.message : "Caricamento non riuscito.";
      var target = document.querySelector("#sharedFileError");
      if (target) target.textContent = cache.error;
      var refreshStatus = document.querySelector("#sharedRefreshStatus");
      if (refreshStatus && button.dataset.fileAction === "refresh") refreshStatus.textContent = cache.error;
    }
  });

  window.renderFilesPage = renderFilesPage;
  window.setFilesFolder = function (folder) {
    cache.folder = folder === "rosetta" || folder === "sketchup" ? folder : "all";
    cache.files = [];
    window.LMFilesFolder = cache.folder;
  };
  window.LMFilesFolder = cache.folder;
  window.loadFilesPage = loadFilesPage;
})();
