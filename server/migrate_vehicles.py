"""Add the fleet tables to an existing Lumen System database without changing existing records."""

from __future__ import annotations

import argparse
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent
FLEET_SCHEMA = ROOT / "fleet_schema.sql"


def main() -> None:
    parser = argparse.ArgumentParser(description="Add vehicle and outing tables to Lumen System")
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--backup-dir", type=Path, required=True)
    args = parser.parse_args()
    database = args.db.resolve()
    if not database.is_file():
        raise SystemExit(f"Database esistente non trovato: {database}")
    args.backup_dir.mkdir(parents=True, exist_ok=True)
    backup = args.backup_dir / ("lumen-system-before-vehicles-" + datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S") + ".sqlite3")
    schema = FLEET_SCHEMA.read_text(encoding="utf-8")
    with sqlite3.connect(database) as source, sqlite3.connect(backup) as target:
        source.backup(target)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with sqlite3.connect(database) as connection:
        connection.execute("PRAGMA foreign_keys=ON")
        connection.executescript(schema)
        for number in (1, 2, 3):
            connection.execute(
                "INSERT OR IGNORE INTO vehicles(id,name,plate,notes,active,version,created_at,updated_at) VALUES(?,?,NULL,'',1,1,?,?)",
                (f"vehicle-{number}", f"Furgone {number}", now, now),
            )
        connection.execute("PRAGMA user_version=3")
    print(f"Mezzi pronti. Backup del database: {backup}")


if __name__ == "__main__":
    main()
