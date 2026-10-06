"""Central registry and runtime status for the Personal AI ecosystem.

This module deliberately contains descriptive metadata only. It never imports
another project's repository, database, credentials or secrets.
"""

from __future__ import annotations

from typing import Any


MODULES: tuple[dict[str, Any], ...] = (
    {
        "id": "radar",
        "name": "Radar AI",
        "kind": "Monitoraggio news",
        "state": "attivo",
        "description": "Controlla fonti ufficiali e conserva evidenze senza applicare automaticamente azioni esterne.",
        "owner": "personal-ai-operations",
        "capabilities": ["official-source-monitoring", "evidence-tracking", "action-proposals"],
        "integration_mode": "local_service",
        "access_mode": "authenticated_api",
    },
    {
        "id": "shopping",
        "name": "Radar Spesa Locale",
        "kind": "Offerte e carrello",
        "state": "attivo",
        "description": "Confronta offerte locali verificate e supporta il carrello senza acquistare automaticamente.",
        "owner": "personal-ai-operations",
        "capabilities": ["receipt-reading", "flyer-reading", "verified-offer-comparison", "basket"],
        "integration_mode": "local_service",
        "access_mode": "authenticated_api",
    },
    {
        "id": "aquarius-age",
        "name": "Aquarius Age",
        "kind": "Portfolio",
        "state": "modulo",
        "description": "Portfolio centrale per presentare prodotti digitali, applicazioni e progetti senza esporre dati operativi.",
        "owner": "aquarius-age-delivery",
        "public_url": "https://aquariusageai.com",
        "url_label": "Portfolio pubblico",
        "capabilities": ["portfolio", "project-discovery"],
        "integration_mode": "public_link",
        "access_mode": "public_web",
    },
    {
        "id": "aegis",
        "name": "AEGIS Invest AI",
        "kind": "Finanza Demo",
        "state": "isolato",
        "description": "Dashboard Demo-first per portafoglio, scanner, rischio e risultati verificati. Nessun accesso Real da Lumen.",
        "owner": "aegis-engineering",
        "public_url": "https://aegis.aquariusageai.com",
        "url_label": "Protetto · accesso richiesto",
        "capabilities": ["demo-portfolio", "scanner", "risk-monitoring", "verified-results"],
        "integration_mode": "isolated_public",
        "access_mode": "protected_web",
    },
    {
        "id": "account-finder",
        "name": "Account Finder",
        "kind": "Privacy e account",
        "state": "browser-local",
        "description": "Raccoglie indizi di portali collegati alle email senza trasformare un indizio in prova.",
        "owner": "account-finder-privacy",
        "capabilities": ["account-clue-discovery", "privacy-first-review"],
        "integration_mode": "browser_local",
        "access_mode": "browser_local",
    },
    {
        "id": "inbox",
        "name": "Inbox personale",
        "kind": "Email e scadenze",
        "state": "read-only",
        "description": "Classifica email, bollette, fatture, avvisi e notifiche e prepara scadenze senza inviare o pagare automaticamente.",
        "owner": "personal-inbox-operations",
        "capabilities": ["email-classification", "deadline-extraction", "summaries"],
        "integration_mode": "read_only",
        "access_mode": "read_only",
    },
    {
        "id": "nexus",
        "name": "NEXUS AI",
        "kind": "Memoria e finanza",
        "state": "modulo",
        "description": "Organizza memoria, decisioni, finanze e contesto personale mantenendo fonti, timestamp e confidenza.",
        "owner": "nexus-ai-engineering",
        "capabilities": ["memory-organization", "decision-context", "finance-context"],
        "integration_mode": "internal_module",
        "access_mode": "not_configured",
    },
    {
        "id": "ai-remote",
        "name": "AI Remote",
        "kind": "Voce e dispositivi",
        "state": "modulo",
        "description": "Controller voice-first per comandi personali e dispositivi remoti con backend autenticato.",
        "owner": "ai-remote-engineering",
        "capabilities": ["voice-control", "remote-device-control"],
        "integration_mode": "internal_module",
        "access_mode": "not_configured",
    },
    {
        "id": "signum",
        "name": "Signum Aura AI",
        "kind": "Mobile",
        "state": "modulo",
        "description": "Esperienza mobile simbolica e personale, richiamabile come servizio specialistico senza fondere il suo archivio.",
        "owner": "signum-aura-delivery",
        "public_url": "https://signum.aquariusageai.com",
        "url_label": "Sito pubblico",
        "capabilities": ["mobile-experience", "specialist-service"],
        "integration_mode": "public_link",
        "access_mode": "public_web",
    },
    {
        "id": "yachting",
        "name": "Yachting Agent AI",
        "kind": "Nautica",
        "state": "modulo",
        "description": "Agente nautico intelligente per percorsi, servizi e contenuti della Costa Smeralda.",
        "owner": "olbia-yachting-delivery",
        "public_url": "https://yachting.aquariusageai.com",
        "url_label": "Sito pubblico",
        "capabilities": ["nautical-routes", "local-services", "yachting-content"],
        "integration_mode": "public_link",
        "access_mode": "public_web",
    },
    {
        "id": "numeri",
        "name": "Numeri Lab AI",
        "kind": "Ricerca dati",
        "state": "modulo",
        "description": "Analisi statistiche trasparenti di Lotto e SuperEnalotto con storico e test prospettici separati da promesse di previsione.",
        "owner": "superenalotto-research",
        "public_url": "https://numeri.aquariusageai.com",
        "url_label": "Sito pubblico",
        "capabilities": ["historical-analysis", "prospective-testing", "statistics"],
        "integration_mode": "public_link",
        "access_mode": "public_web",
    },
    {
        "id": "simoncris",
        "name": "SimonCris Content",
        "kind": "Contenuti",
        "state": "modulo",
        "description": "Coordina musica, gaming e contenuti del brand SimonCris con tracciamento delle decisioni.",
        "owner": "simoncris-content",
        "capabilities": ["content-coordination", "decision-tracking"],
        "integration_mode": "internal_module",
        "access_mode": "not_configured",
    },
    {
        "id": "lavormetal",
        "name": "LavorMetal Operations",
        "kind": "Operazioni",
        "state": "isolato",
        "description": "Skill operativa separata; Lumen coordina soltanto riferimenti senza importare dati o database.",
        "owner": "lavormetal-operations",
        "public_url": "https://lavormetal.aquariusageai.com",
        "url_label": "Sito pubblico",
        "capabilities": ["workshop-operations", "daily-reporting"],
        "integration_mode": "isolated_public",
        "access_mode": "public_web",
    },
    {
        "id": "personal-operations",
        "name": "Personal Operations",
        "kind": "Decisioni",
        "state": "modulo",
        "description": "Priorità, decisioni, scadenze e follow-up personali con evidenze e stato verificabile.",
        "owner": "personal-operations",
        "capabilities": ["priorities", "decisions", "deadlines", "follow-up"],
        "integration_mode": "internal_module",
        "access_mode": "not_configured",
    },
    {
        "id": "lumen",
        "name": "Lumen System",
        "kind": "Centro operativo",
        "state": "attivo",
        "description": "Centro operativo per calendario, attività, documenti, magazzino, mezzi e routing dell'ecosistema.",
        "owner": "lumen-system",
        "public_url": "https://lumensystem.aquariusageai.com",
        "url_label": "Centro operativo",
        "capabilities": ["calendar", "activities", "documents", "warehouse", "vehicles", "files", "ecosystem-routing"],
        "integration_mode": "local_service",
        "access_mode": "authenticated_api",
    },
)


def list_modules() -> list[dict[str, Any]]:
    """Return a defensive copy of the descriptive registry."""
    return [
        {
            **module,
            "capabilities": list(module.get("capabilities", [])),
            "connection_state": _default_connection_state(module),
        }
        for module in MODULES
    ]


def _default_connection_state(module: dict[str, Any]) -> str:
    mode = module.get("integration_mode")
    if mode in {"public_link", "isolated_public", "browser_local"}:
        return "external"
    if module.get("access_mode") == "not_configured":
        return "not_configured"
    return "unknown"


def build_status(store: Any, *, timestamp: str, runtime: dict[str, bool] | None = None) -> dict[str, Any]:
    """Build status from facts observable inside the Lumen process only.

    External URLs are deliberately not probed here. A public link being present
    does not prove that the remote application is online.
    """
    runtime = runtime or {}
    database_available = False
    try:
        with store.connect() as connection:
            database_available = connection.execute("SELECT 1").fetchone() is not None
    except Exception:
        database_available = False

    modules = list_modules()
    for module in modules:
        module_id = module["id"]
        if module_id == "lumen":
            module["connection_state"] = "connected" if database_available else "unreachable"
        elif module_id == "radar":
            module["connection_state"] = "connected" if runtime.get("radar", False) else "not_connected"
        elif module_id == "shopping":
            module["connection_state"] = "connected" if runtime.get("shopping", False) else "not_connected"

    return {
        "service": "lumen-system-api",
        "status": "ok" if database_available else "degraded",
        "timestamp": timestamp,
        "api": {"available": True, "version": "v1"},
        "database": {"available": database_available},
        "capabilities": ["ecosystem-registry", "ecosystem-status", "authenticated-api"],
        "modules": modules,
    }
