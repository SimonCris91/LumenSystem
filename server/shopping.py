"""Local grocery offers and basket comparison.

Only offers with a source URL, validity window and explicit price are usable.
Missing data never becomes a zero price and no purchase or loyalty account is
accessed by this module.
"""

from __future__ import annotations

import hashlib
import json
import re
import urllib.error
import urllib.request
from html import unescape
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any


STORE_DEFINITIONS = (
    {
        "id": "conad-olbia",
        "name": "Conad Olbia",
        "city": "Olbia",
        "address": "Via Barcellona 130, 07026 Olbia",
        "source_url": "https://www.conad.it/ricerca-negozi/conad-via-barcellona-130-07026-olbia--008428",
        "source_label": "Pagina ufficiale punto vendita e volantini",
    },
    {
        "id": "lidl-olbia",
        "name": "Lidl Olbia",
        "city": "Olbia",
        "address": "Viale Aldo Moro 157-159-161, Olbia",
        "source_url": "https://www.lidl.it/s/it-IT/ricerca-negozio/olbia-ss/viale-aldo-moro-157-159-161/",
        "source_label": "Pagina ufficiale punto vendita e offerte",
    },
    {
        "id": "md-olbia",
        "name": "MD · zona Olbia",
        "city": "Olbia",
        "address": "Punto vendita da selezionare",
        "source_url": "https://www.mdspa.it/volantino/",
        "source_label": "Volantino ufficiale MD",
    },
    {
        "id": "eurospin-olbia",
        "name": "Eurospin · zona Olbia",
        "city": "Olbia",
        "address": "Punto vendita da verificare",
        "source_url": "https://www.eurospin.it/volantino/",
        "source_label": "Volantino ufficiale Eurospin",
    },
)


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def normalize(value: Any) -> str:
    value = str(value or "").casefold().replace("€", " euro ")
    return " ".join(re.sub(r"[^a-z0-9àèéìòù ]+", " ", value).split())


def price_cents(value: Any) -> int:
    text = str(value or "").strip().replace("€", "").replace(" ", "")
    if not text:
        raise ValueError("Il prezzo è obbligatorio")
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    else:
        text = text.replace(",", ".")
    try:
        amount = Decimal(text).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except InvalidOperation as exc:
        raise ValueError("Prezzo non valido") from exc
    if amount < 0 or amount > Decimal("100000"):
        raise ValueError("Prezzo fuori intervallo")
    return int(amount * 100)


def ensure_sources(connection: Any, timestamp: str | None = None) -> None:
    timestamp = timestamp or now()
    for store in STORE_DEFINITIONS:
        connection.execute(
            """INSERT INTO shopping_stores(id,name,city,address,source_url,source_label,active,created_at,updated_at)
               VALUES(?,?,?,?,?,?,1,?,?)
               ON CONFLICT(id) DO UPDATE SET name=excluded.name,city=excluded.city,address=excluded.address,
                 source_url=excluded.source_url,source_label=excluded.source_label,updated_at=excluded.updated_at""",
            (store["id"], store["name"], store["city"], store["address"], store["source_url"], store["source_label"], timestamp, timestamp),
        )


def _store(row: dict[str, Any]) -> dict[str, Any]:
    return dict(row)


def list_stores(store: Any) -> list[dict[str, Any]]:
    return [_store(row) for row in store.rows("SELECT * FROM shopping_stores WHERE active=1 ORDER BY name")]


def check_sources(store: Any) -> list[dict[str, Any]]:
    """Check that each official source is reachable without parsing prices."""
    checked_at = now()
    results = []
    for source in list_stores(store):
        error = ""
        status = "ok"
        try:
            request = urllib.request.Request(source["source_url"], headers={"User-Agent": "LumenSystem-RadarSpesa/1.0"})
            with urllib.request.urlopen(request, timeout=15) as response:
                code = int(getattr(response, "status", response.getcode()))
                if code < 200 or code >= 400:
                    raise RuntimeError(f"HTTP {code}")
                response.read(4096)
        except (OSError, urllib.error.URLError, RuntimeError) as exc:
            status = "errore"
            error = str(exc)[:300]
        with store.lock, store.connect() as connection:
            connection.execute("UPDATE shopping_stores SET last_checked_at=?, last_error=?, updated_at=? WHERE id=?", (checked_at, error, checked_at, source["id"]))
        results.append({"store_id": source["id"], "store_name": source["name"], "status": status, "error": error, "checked_at": checked_at, "source_url": source["source_url"]})
    return results


def discover_sources(store: Any) -> list[dict[str, Any]]:
    """Discover official flyer/PDF links; do not turn images into prices."""
    discovered_at = now()
    results = []
    for source in list_stores(store):
        documents = []
        try:
            request = urllib.request.Request(source["source_url"], headers={"User-Agent": "LumenSystem-RadarSpesa/1.0"})
            with urllib.request.urlopen(request, timeout=20) as response:
                html = unescape(response.read(2_000_000).decode("utf-8", errors="replace"))
            pattern = r"https://[^\"'<> ]+?\.pdf(?:\?[^\"'<> ]*)?"
            candidates = [re.sub(r"[)\\]+$", "", match) for match in re.findall(pattern, html, flags=re.IGNORECASE)]
            urls = list(dict.fromkeys(candidate.split("?", 1)[0] for candidate in candidates))[:20]
            for url in urls:
                fingerprint = hashlib.sha256(url.encode("utf-8")).hexdigest()
                document_id = "shopping-doc-" + fingerprint[:24]
                title = url.rsplit("/", 1)[-1].split("?", 1)[0][:240]
                with store.lock, store.connect() as connection:
                    connection.execute(
                        """INSERT INTO shopping_source_documents(id,store_id,document_url,title,discovered_at,content_hash)
                           VALUES(?,?,?,?,?,?) ON CONFLICT(document_url) DO UPDATE SET discovered_at=excluded.discovered_at""",
                        (document_id, source["id"], url, title, discovered_at, fingerprint),
                    )
                documents.append({"url": url, "title": title})
            error = "" if documents else "Nessun documento PDF individuato nella pagina ufficiale"
        except (OSError, urllib.error.URLError, UnicodeError) as exc:
            error = str(exc)[:300]
        results.append({"store_id": source["id"], "store_name": source["name"], "documents": documents, "error": error, "discovered_at": discovered_at})
    return results


def list_source_documents(store: Any) -> list[dict[str, Any]]:
    return store.rows("SELECT d.*, s.name AS store_name FROM shopping_source_documents d JOIN shopping_stores s ON s.id=d.store_id ORDER BY d.discovered_at DESC, s.name LIMIT 200")


def list_offers(store: Any, *, store_id: str = "", text: str = "") -> list[dict[str, Any]]:
    where = ["o.status IN ('verificata','da_verificare')"]
    params: list[Any] = []
    if store_id:
        where.append("o.store_id=?")
        params.append(store_id)
    if text:
        where.append("(o.normalized_name LIKE ? OR o.product_name LIKE ?)")
        needle = "%" + normalize(text) + "%"
        params.extend([needle, needle])
    today = date.today().isoformat()
    where.extend(["(o.valid_from='' OR o.valid_from<=?)", "(o.valid_to='' OR o.valid_to>=?)"])
    params.extend([today, today])
    rows = store.rows(
        "SELECT o.*, s.name AS store_name FROM shopping_offers o JOIN shopping_stores s ON s.id=o.store_id WHERE " +
        " AND ".join(where) + " ORDER BY o.valid_to, o.product_name LIMIT 300",
        tuple(params),
    )
    for row in rows:
        row["price_eur"] = f"{row['price_cents'] / 100:.2f}"
        row["unit_price_eur"] = f"{row['unit_price_cents'] / 100:.2f}" if row.get("unit_price_cents") is not None else ""
    return rows


def create_offer(store: Any, data: dict[str, Any]) -> dict[str, Any]:
    store_id = str(data.get("store_id") or "")
    if not store.row("SELECT id FROM shopping_stores WHERE id=? AND active=1", (store_id,)):
        raise ValueError("Punto vendita non configurato")
    product = " ".join(str(data.get("product_name") or "").split())[:180]
    source_url = str(data.get("source_url") or "").strip()[:1000]
    if not product or not source_url.startswith("https://"):
        raise ValueError("Prodotto e fonte HTTPS sono obbligatori")
    price = price_cents(data.get("price"))
    unit_price = price_cents(data["unit_price"]) if data.get("unit_price") not in (None, "") else None
    valid_from = str(data.get("valid_from") or "")[:10]
    valid_to = str(data.get("valid_to") or "")[:10]
    for value in (valid_from, valid_to):
        if value and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise ValueError("Le date devono essere YYYY-MM-DD")
    fingerprint = hashlib.sha256(json.dumps({"store": store_id, "product": normalize(product), "price": price, "from": valid_from, "to": valid_to, "source": source_url}, sort_keys=True).encode()).hexdigest()
    offer_id = "offer-" + fingerprint[:24]
    timestamp = now()
    with store.lock, store.connect() as connection:
        connection.execute(
            """INSERT INTO shopping_offers(id,store_id,product_name,normalized_name,brand,package_text,price_cents,unit_price_cents,
               valid_from,valid_to,source_url,source_text,status,confidence,content_hash,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(content_hash) DO UPDATE SET source_text=excluded.source_text,status=excluded.status,confidence=excluded.confidence,updated_at=excluded.updated_at""",
            (offer_id, store_id, product, normalize(product), str(data.get("brand") or "")[:100], str(data.get("package_text") or "")[:100], price, unit_price,
             valid_from, valid_to, source_url, str(data.get("source_text") or "")[:2000],
             str(data.get("status") or "da_verificare") if data.get("status") in {"verificata", "da_verificare"} else "da_verificare",
             str(data.get("confidence") or "media")[:30], fingerprint, timestamp, timestamp),
        )
    return store.row("SELECT o.*, s.name AS store_name FROM shopping_offers o JOIN shopping_stores s ON s.id=o.store_id WHERE o.id=?", (offer_id,)) or {}


def compare_basket(store: Any, items: list[dict[str, Any]]) -> dict[str, Any]:
    cleaned = []
    for item in items[:50]:
        name = " ".join(str(item.get("name") or "").split())[:180]
        if not name:
            continue
        try:
            quantity = Decimal(str(item.get("quantity", 1))).quantize(Decimal("0.01"))
        except InvalidOperation as exc:
            raise ValueError("Quantità non valida") from exc
        if quantity <= 0 or quantity > 1000:
            raise ValueError("Quantità fuori intervallo")
        cleaned.append({"name": name, "normalized": normalize(name), "quantity": quantity})
    if not cleaned:
        raise ValueError("Inserisci almeno un prodotto")
    stores = list_stores(store)
    results = []
    for market in stores:
        offers = list_offers(store, store_id=market["id"])
        total = Decimal("0")
        matched = []
        missing = []
        for item in cleaned:
            candidates = [offer for offer in offers if offer["status"] == "verificata" and offer["valid_from"] and offer["valid_to"] and item["normalized"] == offer["normalized_name"]]
            if not candidates:
                missing.append(item["name"])
                continue
            chosen = min(candidates, key=lambda offer: offer["price_cents"])
            cents = chosen["price_cents"]
            line_total = (Decimal(cents) / Decimal(100) * item["quantity"]).quantize(Decimal("0.01"))
            total += line_total
            matched.append({"requested": item["name"], "offer": chosen["product_name"], "price_eur": f"{chosen['price_cents'] / 100:.2f}", "line_total_eur": f"{line_total:.2f}", "source_url": chosen["source_url"], "status": chosen["status"]})
        results.append({"store_id": market["id"], "store_name": market["name"], "address": market["address"], "total_eur": f"{total:.2f}" if not missing else None, "matched": matched, "missing": missing, "complete": not missing})
    complete = [result for result in results if result["complete"]]
    complete.sort(key=lambda result: Decimal(result["total_eur"]))
    return {"items": [{"name": item["name"], "quantity": str(item["quantity"])} for item in cleaned], "recommendation": complete[0] if complete else None, "results": results, "confidence": "media" if complete else "insufficiente"}
