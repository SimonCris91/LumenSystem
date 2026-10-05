"""Radar AI: official-source monitoring, deduplication and review queue.

The monitor stores source material only. It never calls an external mutation
endpoint and never treats an ingested item as technically verified.
"""

from __future__ import annotations

import hashlib
import html
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from typing import Any


RADAR_VERIFICATION_STATES = {"verificata", "da_verificare", "non_confermata", "obsoleta"}
RADAR_ACTION_STATES = {
    "solo_informativa",
    "da_verificare",
    "pronta_analisi",
    "pronta_implementazione",
    "in_attesa_conferma",
    "completata",
    "rifiutata",
}

SOURCE_DEFINITIONS = (
    {
        "id": "openai-news",
        "name": "OpenAI News",
        "url": "https://openai.com/news/rss.xml",
        "source_type": "rss",
        "category": "OpenAI/Modelli",
        "projects": ["Personal AI", "Lumen System", "NEXUS", "AI Remote"],
        "skill": "openai-docs",
    },
    {
        "id": "anthropic-news",
        "name": "Anthropic Newsroom",
        "url": "https://www.anthropic.com/news",
        "source_type": "html",
        "category": "Coding Agent",
        "projects": ["Personal AI", "AI Remote", "NEXUS"],
        "skill": "personal-ai-operations",
    },
    {
        "id": "cloudflare-blog",
        "name": "Cloudflare Blog",
        "url": "https://blog.cloudflare.com/rss/",
        "source_type": "rss",
        "category": "Cloudflare",
        "projects": ["Lumen System", "Aquarius Age", "Personal AI"],
        "skill": "cloudflare-live-verification",
    },
    {
        "id": "github-changelog",
        "name": "GitHub Changelog",
        "url": "https://github.blog/changelog/feed/",
        "source_type": "rss",
        "category": "GitHub e repository",
        "projects": ["Personal AI", "Lumen System", "Aquarius Age"],
        "skill": "github-sync-verification",
    },
    {
        "id": "google-ai",
        "name": "Google AI Blog",
        "url": "https://blog.google/technology/ai/rss/",
        "source_type": "rss",
        "category": "OpenAI/Modelli",
        "projects": ["Personal AI", "AI Remote", "Signum Aura"],
        "skill": "personal-ai-operations",
    },
)


def _now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _clean(value: Any, limit: int = 12000) -> str:
    text = html.unescape(str(value or ""))
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].casefold()


def _child_text(element: ET.Element, names: set[str]) -> str:
    for child in element.iter():
        if _local_name(child.tag) in names and child.text:
            return _clean(child.text)
    return ""


def _child_link(element: ET.Element) -> str:
    for child in element.iter():
        if _local_name(child.tag) != "link":
            continue
        href = child.attrib.get("href", "").strip()
        if href:
            return href
        if child.text:
            return child.text.strip()
    return ""


def _parse_xml(payload: bytes, source: dict[str, Any]) -> list[dict[str, str]]:
    root = ET.fromstring(payload)
    entries: list[dict[str, str]] = []
    for element in root.iter():
        if _local_name(element.tag) not in {"item", "entry"}:
            continue
        title = _child_text(element, {"title"})
        url = _child_link(element)
        published = _child_text(element, {"pubdate", "published", "updated", "date"})
        content = _child_text(element, {"description", "summary", "content", "encoded"})
        if not title or not url:
            continue
        entries.append({"title": title, "url": url, "published_at": published, "content": content})
    return entries


class _NewsLinkParser(HTMLParser):
    def __init__(self, base_url: str):
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.href = ""
        self.text: list[str] = []
        self.items: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.casefold() != "a":
            return
        attributes = dict(attrs)
        self.href = urllib.parse.urljoin(self.base_url, attributes.get("href") or "")
        self.text = []

    def handle_data(self, data: str) -> None:
        if self.href:
            self.text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.casefold() != "a" or not self.href:
            return
        title = _clean(" ".join(self.text), 500)
        if title and "/news/" in urllib.parse.urlparse(self.href).path:
            self.items.append({"title": title, "url": self.href, "published_at": "", "content": ""})
        self.href = ""
        self.text = []


def _parse_html(payload: bytes, source: dict[str, Any]) -> list[dict[str, str]]:
    parser = _NewsLinkParser(source["url"])
    parser.feed(payload.decode("utf-8", errors="replace"))
    seen: set[str] = set()
    result = []
    for item in parser.items:
        if item["url"] in seen:
            continue
        seen.add(item["url"])
        result.append(item)
    return result[:50]


def _request(source: dict[str, Any], metadata: dict[str, str]) -> tuple[int, bytes, dict[str, str]]:
    headers = {
        "User-Agent": "EcosistemaAI-Radar/1.0 (+local-monitor)",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/html;q=0.9",
    }
    if metadata.get("etag"):
        headers["If-None-Match"] = metadata["etag"]
    if metadata.get("last_modified"):
        headers["If-Modified-Since"] = metadata["last_modified"]
    request = urllib.request.Request(source["url"], headers=headers, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, response.read(2_000_000), {
                "etag": response.headers.get("ETag", ""),
                "last_modified": response.headers.get("Last-Modified", ""),
            }
    except urllib.error.HTTPError as error:
        if error.code == 304:
            return 304, b"", {}
        raise


def _item_hash(source_id: str, item: dict[str, str]) -> str:
    canonical = "\n".join((source_id, item["title"], item["url"], item["published_at"], item["content"]))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def ensure_sources(connection: Any, now: str | None = None) -> None:
    now = now or _now()
    for source in SOURCE_DEFINITIONS:
        connection.execute(
            """INSERT INTO radar_sources(id,name,url,source_type,category,projects_json,skill,active,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,1,?,?)
               ON CONFLICT(id) DO UPDATE SET name=excluded.name,url=excluded.url,source_type=excluded.source_type,
                 category=excluded.category,projects_json=excluded.projects_json,skill=excluded.skill,updated_at=excluded.updated_at""",
            (source["id"], source["name"], source["url"], source["source_type"], source["category"],
             json.dumps(source["projects"], ensure_ascii=False), source["skill"], now, now),
        )


def _source_dict(row: dict[str, Any]) -> dict[str, Any]:
    value = dict(row)
    try:
        value["projects"] = json.loads(value.pop("projects_json") or "[]")
    except json.JSONDecodeError:
        value["projects"] = []
        value.pop("projects_json", None)
    value["active"] = bool(value.get("active"))
    return value


def _item_dict(row: dict[str, Any]) -> dict[str, Any]:
    value = dict(row)
    for field in ("projects_json",):
        try:
            value["projects"] = json.loads(value.pop(field) or "[]")
        except json.JSONDecodeError:
            value["projects"] = []
            value.pop(field, None)
    value["confirmation_required"] = bool(value.get("confirmation_required"))
    return value


def list_sources(store: Any) -> list[dict[str, Any]]:
    return [_source_dict(row) for row in store.rows("SELECT * FROM radar_sources ORDER BY name")]


def list_items(store: Any, query: dict[str, list[str]]) -> list[dict[str, Any]]:
    where = []
    params: list[Any] = []
    status = query.get("status", [""])[0].strip()
    category = query.get("category", [""])[0].strip()
    project = query.get("project", [""])[0].strip()
    text = query.get("q", [""])[0].strip()
    if status in RADAR_VERIFICATION_STATES:
        where.append("i.verification_status=?")
        params.append(status)
    if category:
        where.append("i.category=?")
        params.append(category)
    if project:
        where.append("i.projects_json LIKE ?")
        params.append("%" + project + "%")
    if text:
        where.append("(i.title LIKE ? OR i.summary LIKE ? OR i.source_name LIKE ?)")
        needle = "%" + text + "%"
        params.extend([needle, needle, needle])
    clause = " WHERE " + " AND ".join(where) if where else ""
    params.append(min(max(int(query.get("limit", ["50"])[0]), 1), 100))
    rows = store.rows(
        "SELECT i.*, s.name AS source_name FROM radar_items i JOIN radar_sources s ON s.id=i.source_id" +
        clause + " ORDER BY COALESCE(i.published_at, i.created_at) DESC, i.created_at DESC LIMIT ?",
        tuple(params),
    )
    return [_item_dict(row) for row in rows]


def summary(store: Any, monitor_status: dict[str, Any]) -> dict[str, Any]:
    counts = {row["verification_status"]: row["count"] for row in store.rows("SELECT verification_status, COUNT(*) AS count FROM radar_items GROUP BY verification_status")}
    unread = store.row("SELECT COUNT(*) AS count FROM radar_items WHERE unread=1") or {"count": 0}
    return {"counts": counts, "unread": unread["count"], "sources": list_sources(store), "monitor": monitor_status}


def get_item(store: Any, item_id: str) -> dict[str, Any] | None:
    row = store.row("SELECT i.*, s.name AS source_name FROM radar_items i JOIN radar_sources s ON s.id=i.source_id WHERE i.id=?", (item_id,))
    return _item_dict(row) if row else None


def update_item(store: Any, item_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
    allowed = {}
    if data.get("verification_status") in RADAR_VERIFICATION_STATES:
        allowed["verification_status"] = data["verification_status"]
        if data["verification_status"] == "verificata":
            allowed["verified_at"] = _now()
    if data.get("action_status") in RADAR_ACTION_STATES:
        allowed["action_status"] = data["action_status"]
    for key in ("decision", "notes"):
        if key in data:
            allowed[key] = str(data[key] or "")[:4000]
    allowed["unread"] = 0 if data.get("read") else 1
    if not allowed:
        return get_item(store, item_id)
    assignments = ", ".join(f"{key}=?" for key in allowed)
    values = list(allowed.values()) + [_now(), item_id]
    with store.lock, store.connect() as connection:
        connection.execute(f"UPDATE radar_items SET {assignments}, updated_at=? WHERE id=?", tuple(values))
    return get_item(store, item_id)


def create_action(store: Any, item_id: str, data: dict[str, Any]) -> dict[str, Any]:
    item = get_item(store, item_id)
    if not item:
        raise KeyError("Notizia Radar non trovata")
    action_id = "radar-action-" + hashlib.sha256(f"{item_id}:{data.get('title','')}".encode()).hexdigest()[:24]
    now = _now()
    with store.lock, store.connect() as connection:
        connection.execute(
            """INSERT INTO radar_actions(id,item_id,title,details,status,confirmation_required,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET details=excluded.details,updated_at=excluded.updated_at""",
            (action_id, item_id, str(data.get("title") or "Valutare notizia Radar")[:240], str(data.get("details") or "")[:4000],
             "solo_informativa", 1, now, now),
        )
    return store.row("SELECT * FROM radar_actions WHERE id=?", (action_id,)) or {}


def scan_store(store: Any) -> dict[str, Any]:
    started = _now()
    new_items = 0
    checked = 0
    errors: list[dict[str, str]] = []
    for source_row in store.rows("SELECT * FROM radar_sources WHERE active=1 ORDER BY name"):
        source = _source_dict(source_row)
        checked += 1
        metadata = {"etag": source.get("etag", ""), "last_modified": source.get("last_modified", "")}
        try:
            status, payload, headers = _request(source, metadata)
            if status == 304:
                now = _now()
                with store.lock, store.connect() as connection:
                    connection.execute("UPDATE radar_sources SET last_checked_at=?,last_success_at=?,last_error='',last_new_items=0,updated_at=? WHERE id=?", (now, now, now, source["id"]))
                continue
            items = _parse_xml(payload, source) if source["source_type"] == "rss" else _parse_html(payload, source)
            now = _now()
            with store.lock, store.connect() as connection:
                connection.execute(
                    "UPDATE radar_sources SET last_checked_at=?,last_success_at=?,last_error='',etag=?,last_modified=?,last_new_items=?,updated_at=? WHERE id=?",
                    (now, now, headers.get("etag", ""), headers.get("last_modified", ""), len(items), now, source["id"]),
                )
                for item in items:
                    content_hash = _item_hash(source["id"], item)
                    inserted = connection.execute(
                        """INSERT OR IGNORE INTO radar_items
                           (id,source_id,source_name,title,url,published_at,received_at,verified_at,category,projects_json,skill,
                            verification_status,summary,impact,risk,cost_dependency,proposed_action,confirmation_required,decision,notes,
                            content_hash,parent_id,original_content,action_status,unread,created_at,updated_at)
                           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                        ("radar-" + content_hash[:24], source["id"], source["name"], item["title"], item["url"], item["published_at"],
                         now, None, source["category"], json.dumps(source["projects"], ensure_ascii=False), source["skill"],
                         "da_verificare", item["content"][:1200], "Da valutare dopo verifica tecnica.", "Da valutare.", "Nessun costo API previsto per la raccolta; verificare eventuali costi di implementazione.",
                         "Verificare la fonte ufficiale e valutare i progetti associati.", 1, "", "", content_hash, None, item["content"], "solo_informativa", 1, now, now),
                    )
                    if inserted.rowcount:
                        new_items += 1
        except urllib.error.HTTPError as error:
            errors.append({"source": source["name"], "error": f"HTTP {error.code}"})
            with store.lock, store.connect() as connection:
                connection.execute("UPDATE radar_sources SET last_checked_at=?,last_error=?,updated_at=? WHERE id=?", (_now(), f"HTTP {error.code}", _now(), source["id"]))
        except Exception as error:
            errors.append({"source": source["name"], "error": str(error)[:300]})
            with store.lock, store.connect() as connection:
                connection.execute("UPDATE radar_sources SET last_checked_at=?,last_error=?,updated_at=? WHERE id=?", (_now(), str(error)[:300], _now(), source["id"]))
    return {"started_at": started, "finished_at": _now(), "checked": checked, "new_items": new_items, "errors": errors}


class RadarMonitor:
    def __init__(self, store: Any, poll_seconds: int | None = None):
        self.store = store
        self.poll_seconds = max(60, int(poll_seconds or os.getenv("RADAR_POLL_SECONDS", "300")))
        self.stop_event = threading.Event()
        self.scan_lock = threading.Lock()
        self.thread: threading.Thread | None = None
        self._status: dict[str, Any] = {"active": False, "mode": "active", "poll_seconds": self.poll_seconds, "last_scan": None, "last_error": "", "last_new_items": 0}

    def start(self) -> None:
        if self.thread and self.thread.is_alive():
            return
        self.stop_event.clear()
        self.thread = threading.Thread(target=self._run, name="radar-ai-monitor", daemon=True)
        self.thread.start()

    def stop(self) -> None:
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=2)

    def status(self) -> dict[str, Any]:
        return dict(self._status)

    def scan_now(self) -> dict[str, Any]:
        if not self.scan_lock.acquire(blocking=False):
            return {"accepted": True, "running": True, "status": self.status()}
        try:
            result = scan_store(self.store)
            self._status.update({"active": True, "last_scan": result["finished_at"], "last_error": "; ".join(item["error"] for item in result["errors"]), "last_new_items": result["new_items"]})
            return {"accepted": True, "running": False, "result": result, "status": self.status()}
        finally:
            self.scan_lock.release()

    def _run(self) -> None:
        self._status["active"] = True
        self.scan_now()
        while not self.stop_event.wait(self.poll_seconds):
            self.scan_now()
