"""Import .SKP models from configured network shares into the server archive."""

from __future__ import annotations

import hashlib
import os
import shutil
import tempfile
from pathlib import Path
from typing import Callable


def digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def import_sketchup(sources: list[tuple[str, Path]], destination: Path,
                    report: Callable[[str, str, int, int], None]) -> None:
    """Copy new models only; report(source label, issue, imported, skipped)."""
    destination.mkdir(parents=True, exist_ok=True)
    known: set[str] = set()
    for candidate in destination.iterdir():
        if candidate.is_file() and not candidate.is_symlink() and candidate.suffix.casefold() == ".skp":
            known.add(digest(candidate))

    for label, source in sources:
        imported = skipped = 0
        issue = ""
        if not source.is_dir():
            report(label, "Cartella non raggiungibile o non configurata.", imported, skipped)
            continue

        def walk_error(error: OSError) -> None:
            nonlocal issue
            issue = "Impossibile leggere alcune sottocartelle: " + str(error)

        try:
            for folder, dirs, files in os.walk(source, followlinks=False, onerror=walk_error):
                dirs[:] = [name for name in dirs if not (Path(folder) / name).is_symlink()]
                for name in files:
                    candidate = Path(folder) / name
                    if candidate.suffix.casefold() != ".skp" or candidate.is_symlink():
                        continue
                    try:
                        temporary = None
                        with tempfile.NamedTemporaryFile(dir=destination, prefix=".sketchup-import-", suffix=".tmp", delete=False) as output:
                            temporary = Path(output.name)
                            with candidate.open("rb") as input_file:
                                shutil.copyfileobj(input_file, output, length=1024 * 1024)
                        fingerprint = digest(temporary)
                        if fingerprint in known:
                            skipped += 1
                            continue
                        target = destination / name
                        index = 2
                        while True:
                            try:
                                os.link(temporary, target)
                                known.add(fingerprint)
                                imported += 1
                                break
                            except FileExistsError:
                                target = destination / f"{candidate.stem} ({index}){candidate.suffix}"
                                index += 1
                    except OSError as error:
                        issue = "Alcuni file non sono stati copiati: " + str(error)
                    finally:
                        if temporary is not None:
                            temporary.unlink(missing_ok=True)
        except OSError as error:
            issue = "Lettura della cartella non riuscita: " + str(error)
        report(label, issue, imported, skipped)
