(function (root) {
  "use strict";
  // Parsing conservativo: le colonne si identificano dalle intestazioni,
  // mai dalla posizione degli ultimi numeri nella riga.
  function numeric(value) {
    var text = String(value || "").trim().replace(/€/g, "").replace(/\s/g, "");
    if (!/^(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[,.]\d+)?)$/.test(text)) return "";
    if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) text = text.replace(/\./g, "");
    return Number.isFinite(Number(text)) ? String(Number(text)) : "";
  }
  function linesFromWords(words) {
    var lines = [];
    words.slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; }).forEach(function (word) {
      if (!word.text.trim()) return;
      var line = lines.find(function (entry) { return Math.abs(entry.y - word.y) <= Math.max(2, Math.min(entry.height, word.height) * 0.45); });
      if (!line) { line = { y: word.y, height: word.height || 10, words: [] }; lines.push(line); }
      line.words.push(word);
    });
    return lines.map(function (line) {
      line.words.sort(function (a, b) { return a.x - b.x; });
      line.text = line.words.map(function (w) { return w.text; }).join(" ");
      return line;
    });
  }
  function pdfPage(items) {
    return linesFromWords(items.filter(function (item) { return item.str && item.transform; }).map(function (item) {
      return { text: item.str, x: item.transform[4], y: -item.transform[5], width: item.width || 0, height: item.height || 10, confidence: 100 };
    }));
  }
  function ocrPage(data) {
    var words = [];
    String(data.tsv || "").split(/\r?\n/).slice(1).forEach(function (line) {
      var cells = line.split("\t");
      if (cells[0] !== "5" || !cells[11]) return;
      words.push({ text: cells.slice(11).join(" "), x: Number(cells[6]), y: Number(cells[7]) + Number(cells[9]), width: Number(cells[8]), height: Number(cells[9]), confidence: Number(cells[10]) });
    });
    return words.length ? linesFromWords(words) : String(data.text || "").split(/\r?\n/).map(function (text) { return { text: text, words: [] }; });
  }
  var headerPattern = /\b(descrizione(?:\s+(?:articolo|merce|prodotto))?|articolo|codice(?:\s+articolo)?|cod\.?|quantit[aà]|q[.']?t[aà][.']?|qty|u\.?\s*m\.?|unit[aà](?:\s+di\s+misura)?|prezzo(?:\s+unitario)?|importo|totale|scont[ooi]|iva)(?=\s|$|[:|])/gi;
  function keyFor(label) {
    if (/^descr|^articolo/i.test(label)) return "name";
    if (/^cod/i.test(label)) return "code";
    if (/^q/i.test(label)) return "quantity";
    if (/^u/i.test(label)) return "unit";
    if (/^prezzo/i.test(label)) return "unitPrice";
    return "ignore";
  }
  function headers(line) {
    var found = [], text = line.text, matches = Array.from(text.matchAll(headerPattern));
    matches.forEach(function (match) {
      var offset = 0, x = match.index;
      for (var word of line.words) {
        if (match.index < offset + word.text.length) {
          x = word.x + (match.index - offset) / word.text.length * word.width;
          break;
        }
        offset += word.text.length + 1;
      }
      found.push({ key: keyFor(match[0]), x: x, index: match.index });
    });
    return found.some(function (h) { return h.key === "name"; }) && found.some(function (h) { return h.key === "quantity"; }) ? found : null;
  }
  function parse(pages) {
    var items = [], warnings = [], skipped = 0;
    pages.forEach(function (lines) {
      var columns = null;
      lines.forEach(function (line) {
        var text = line.text.trim(), detected = headers(line);
        if (detected) { columns = detected; return; }
        // Stops and metadata never become inventory, even inside a detected table.
        if (/^(?:totale\b|subtotale\b|imponibile\b|riepilogo\b|netto a pagare\b|pagamento\b|scadenza\b|iban\b|firma\b|causale\b|annotazioni\b)/i.test(text)) { columns = null; return; }
        if (!text || /^(?:via\b|viale\b|piazza\b|tel\b|fax\b|p\.?\s*iva\b|partita iva\b|codice fiscale\b|data\b|pagina\b|documento di trasporto\b|bolla\b|fattura\b|destinatario\b|mittente\b)/i.test(text)) return;
        var row = { name: "", code: "", quantity: "", unit: "", unitPrice: "" }, mapped = false;
        if (columns && line.words.length) {
          var cells = columns.map(function () { return []; });
          line.words.forEach(function (word) {
            // Left edge bands preserve digits inside descriptions and product codes.
            var index = 0;
            for (var i = 1; i < columns.length; i++) if (word.x >= columns[i].x - 3) index = i;
            cells[index].push(word);
          });
          columns.forEach(function (column, i) {
            if (column.key === "ignore") return;
            var value = cells[i].map(function (w) { return w.text; }).join(" ").trim();
            if (column.key === "quantity" || column.key === "unitPrice") {
              row[column.key] = cells[i].some(function (w) { return w.confidence < 60; }) ? "" : numeric(value);
            } else row[column.key] = value;
          });
          mapped = true;
        } else if (columns && /\t| {2,}/.test(line.text)) {
          var fields = line.text.trim().split(/\t+| {2,}/);
          if (fields.length === columns.length) {
            columns.forEach(function (column, i) {
              if (column.key !== "ignore") row[column.key] = /^(quantity|unitPrice)$/.test(column.key) ? numeric(fields[i]) : fields[i];
            });
            mapped = true;
          }
        }
        if (!mapped) {
          // Explicit unit + quantity is the only safe fallback without column positions.
          // No prices are inferred from totals, tax rates or discounts.
          var match = text.match(/^(.+?)\s+(pz|nr|kg|mt|m|mq|m2|m²|ml|lt|l)\.?\s+(\d+(?:[,.]\d+)?)(?:\s|$)/i);
          if (!match || !/[a-zà-ü]/i.test(match[1])) { if (/\d/.test(text)) skipped++; return; }
          row.name = match[1]; row.unit = match[2]; row.quantity = numeric(match[3]);
        }
        if (!row.name || !/[a-zà-ü]/i.test(row.name)) return;
        if (!row.quantity && !row.unit && !row.code && !row.unitPrice) {
          // Description-only continuation remains visible in the raw text; do not invent a row.
          skipped++; return;
        }
        if (!(Number(row.quantity) > 0)) row.quantity = "";
        if (!row.quantity) warnings.push("Quantità non leggibile per «" + row.name + "»: compilala dal documento.");
        items.push(row);
      });
    });
    if (skipped) warnings.push("Alcune righe non hanno colonne riconoscibili: confronta il testo originale e aggiungi gli articoli mancanti.");
    if (!items.length) warnings.push("Nessuna riga articolo riconosciuta con sufficiente affidabilità. Compila le righe dal documento.");
    if (items.length > 100) warnings.push("Sono mostrate le prime 100 righe: inserisci separatamente le rimanenti.");
    return { items: items.slice(0, 100), warnings: warnings };
  }
  var api = { parse: parse, pdfPage: pdfPage, ocrPage: ocrPage, numeric: numeric };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LMDocumentReader = api;
})(typeof window !== "undefined" ? window : globalThis);
