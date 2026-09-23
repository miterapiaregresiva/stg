#!/usr/bin/env python3
"""Actualiza la disponibilidad de RED BICA para la biblioteca estática.

Solo realiza GET públicos contra páginas de detalle de OpacDiscovery. No usa,
acepta ni persiste cookies de sesión, CSRF ni credenciales de usuario.
"""

from __future__ import annotations

import base64
import argparse
import json
import random
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
CONTACTS_PATH = ROOT / "data/bica/library-contacts.json"
LAZOS_PATH = ROOT / "data/books/lazos-de-amor.json"

BASE = "https://red-bica.bibliotecadecanarias.org/OpacDiscovery/public/catalog/detail/"
USER_AGENT = "miterapiaregresiva.com-library-refresh/1.0 (+static bibliography availability check)"
ISLANDS = {
    "TF": "Tenerife",
    "GC": "Gran Canaria",
    "LZ": "Lanzarote",
    "FV": "Fuerteventura",
    "LP": "La Palma",
    "LG": "La Gomera",
    "EH": "El Hierro",
}
CONTACT_FIELDS = ("address", "phone", "email", "opening_hours", "source_url", "last_verified")


def permalink(bica_id: str) -> str:
    raw = f"oai:bibliographic:es.baratz.bica/{bica_id}".encode("utf-8")
    encoded = base64.b64encode(raw).decode("ascii").rstrip("=")
    return BASE + encoded


def text(node) -> str | None:
    if node is None:
        return None
    value = " ".join(node.get_text(" ", strip=True).split())
    return value or None


def parse_int(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"\d+", value)
    return int(match.group()) if match else None


def hidden_value(scope, name: str) -> str | None:
    node = scope.select_one(f'input[name="{name}"]')
    value = node.get("value") if node else None
    return value.strip() if isinstance(value, str) and value.strip() else None


def labelled_value(scope, label: str) -> str | None:
    wanted = label.casefold()
    for dt in scope.select("dt"):
        if wanted in (text(dt) or "").casefold():
            dd = dt.find_next_sibling("dd")
            return text(dd)
    return None


def fetch_html(url: str, attempts: int = 3) -> str:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            request = Request(
                url,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "text/html,application/xhtml+xml",
                    "Accept-Language": "es-ES,es;q=0.9",
                    "Cache-Control": "no-cache",
                },
                method="GET",
            )
            with urlopen(request, timeout=35) as response:
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status}")
                charset = response.headers.get_content_charset() or "utf-8"
                return response.read().decode(charset, errors="replace")
        except (HTTPError, URLError, TimeoutError, RuntimeError) as exc:
            last_error = exc
            if attempt < attempts:
                time.sleep(1.5 * attempt)
    raise RuntimeError(f"No se pudo descargar {url}: {last_error}")


def infer_library_id(location) -> str | None:
    value = hidden_value(location, "selectedLibraryId")
    if value:
        return value
    accordion = location.select_one('.accordion[id^="accordion"]')
    if accordion:
        ident = accordion.get("id", "")
        return ident.removeprefix("accordion") or None
    return None


def infer_branch_id(card) -> str | None:
    value = hidden_value(card, "selectedBranchId")
    if value:
        return value
    toggle = card.select_one('[data-target^="#copy-table_"]')
    if toggle:
        target = toggle.get("data-target", "")
        match = re.search(r"#copy-table_(\d+)", target)
        if match:
            return match.group(1)
    table = card.select_one('[id^="copy-table_"]')
    if table:
        match = re.search(r"copy-table_(\d+)", table.get("id", ""))
        if match:
            return match.group(1)
    return None


def island_from_library_id(library_id: str | None) -> tuple[str | None, str | None]:
    if not library_id:
        return None, None
    prefix = library_id[:2].upper()
    return (prefix, ISLANDS.get(prefix)) if prefix in ISLANDS else (None, None)


def contact_for(directory: dict, branch_id: str | None) -> dict:
    source = directory.get("branches", {}).get(str(branch_id), {}) if branch_id else {}
    return {field: source.get(field) for field in CONTACT_FIELDS}


def parse_record(html: str, bica_id: str, work_slug: str, url: str, directory: dict) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    copies: list[dict] = []
    locations = soup.select(".copy-location")

    # A 200 response with neither holdings markup nor an identifiable catalog page
    # is treated as a structural failure rather than silently publishing zero copies.
    body = soup.body
    if body is None or not (locations or soup.select_one("#copias") or "Opac Discovery" in soup.get_text(" ", strip=True)):
        raise RuntimeError(f"Estructura inesperada en BICA {bica_id}")

    for location in locations:
        library_name = text(location.select_one("h3.copy-locationH > span"))
        library_id = infer_library_id(location)
        island_code, island_name = island_from_library_id(library_id)

        for card in location.select(".accordion .card"):
            branch_id = infer_branch_id(card)
            branch_name = text(card.select_one(".card-header .copias-btnCollapse > .txt"))
            if not branch_name:
                branch_name = text(card.select_one(".card-header .txt"))

            rows = card.select("tbody > tr")
            for row in rows:
                status = text(row.select_one("td.availability .badge")) or text(row.select_one(".availability .badge"))
                status_folded = (status or "").strip().casefold()
                available = status_folded == "disponible"

                row_library_id = hidden_value(row, "selectedLibraryId") or library_id
                row_branch_id = hidden_value(row, "selectedBranchId") or branch_id
                row_island_code, row_island_name = island_from_library_id(row_library_id)
                if row_island_code:
                    island_code, island_name = row_island_code, row_island_name

                copies.append(
                    {
                        "copy_id": hidden_value(row, "selectedCopyId"),
                        "title_id": hidden_value(row, "selectedTitleId") or bica_id,
                        "library_id": row_library_id,
                        "library_name": library_name,
                        "branch_id": row_branch_id,
                        "location_code": f"S-{str(row_branch_id).zfill(3)}" if row_branch_id and str(row_branch_id).isdigit() else None,
                        "branch_name": branch_name,
                        "island_code": island_code,
                        "island": island_name,
                        "status": status,
                        "available": available,
                        "reserves": parse_int(text(row.select_one(".numberOfReserves .txt"))),
                        "location": text(row.select_one(".locationDescription .txt")),
                        "signature": text(row.select_one(".signature .txt")),
                        "type": text(row.select_one(".typeDescription .txt")),
                        "media": text(row.select_one(".mediaDescription .txt")),
                        "situation": labelled_value(row, "Situación ejemplar"),
                        "contact": contact_for(directory, row_branch_id),
                    }
                )

    return {
        "bica_id": bica_id,
        "work_slug": work_slug,
        "permalink": url,
        "copies_total": len(copies),
        "copies_available": sum(1 for item in copies if item["available"]),
        "copies": copies,
    }


def aggregate(records: list[dict]) -> dict:
    works: dict[str, dict] = {}

    for record in records:
        work = works.setdefault(
            record["work_slug"],
            {"copies": 0, "available": 0, "islands": {}},
        )
        work["copies"] += record["copies_total"]
        work["available"] += record["copies_available"]

        for copy in record["copies"]:
            island_code = copy.get("island_code") or "UNKNOWN"
            island = work["islands"].setdefault(
                island_code,
                {
                    "name": copy.get("island") or "Sin clasificar",
                    "copies": 0,
                    "available": 0,
                    "libraries": {},
                },
            )
            island["copies"] += 1
            island["available"] += int(bool(copy.get("available")))

            library_id = copy.get("library_id") or "UNKNOWN"
            library = island["libraries"].setdefault(
                library_id,
                {
                    "name": copy.get("library_name"),
                    "copies": 0,
                    "available": 0,
                    "branches": {},
                },
            )
            library["copies"] += 1
            library["available"] += int(bool(copy.get("available")))

            branch_id = copy.get("branch_id") or "UNKNOWN"
            branch = library["branches"].setdefault(
                branch_id,
                {
                    "name": copy.get("branch_name"),
                    "location_code": copy.get("location_code"),
                    "copies": 0,
                    "available": 0,
                    "contact": copy.get("contact"),
                },
            )
            branch["copies"] += 1
            branch["available"] += int(bool(copy.get("available")))

    return works


def public_island_summary(work: dict) -> dict:
    return {
        code: {
            "name": island["name"],
            "copies": island["copies"],
            "available": island["available"],
        }
        for code, island in work.get("islands", {}).items()
        if code != "UNKNOWN"
    }


def update_catalog(catalog_path: Path, works: dict, checked_at: str, seed_works: dict) -> dict:
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    catalog["generated_at"] = checked_at[:10]
    catalog["last_checked"] = checked_at
    catalog["availability_note"] = (
        "Disponibilidad actualizada una vez al día desde RED BICA. "
        "Recomendamos llamar a la biblioteca antes de desplazarse."
    )
    for item in catalog.get("works", []):
        current = works.get(item.get("slug"))
        if not current:
            continue
        seed_work = seed_works.get(item.get("slug"), {})
        item["bica_records"] = current["bica_records"]
        item["copies"] = current["copies"]
        item["available"] = current["available"]
        item["isbn_count"] = len(seed_work.get("isbns", []))
        item["islands"] = public_island_summary(current)
        item["last_checked"] = checked_at
    return catalog


def update_lazos(works: dict, records: list[dict], checked_at: str, availability_source: str) -> dict | None:
    if not LAZOS_PATH.exists() or "lazos-de-amor" not in works:
        return None
    data = json.loads(LAZOS_PATH.read_text(encoding="utf-8"))
    current = works["lazos-de-amor"]
    data["generated_at"] = checked_at[:10]
    data["last_checked"] = checked_at
    data["availability_source"] = availability_source
    data.setdefault("summary", {})["copies"] = current["copies"]
    data["summary"]["available"] = current["available"]
    data["summary"]["islands"] = public_island_summary(current)

    by_id = {record["bica_id"]: record for record in records if record["work_slug"] == "lazos-de-amor"}
    for edition in data.get("editions", []):
        record = by_id.get(str(edition.get("bica_id")))
        if record:
            edition["copies"] = record["copies_total"]
            edition["available"] = record["copies_available"]
    return data


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def normalized_seed_works(seed: dict) -> dict:
    normalized = {}
    for slug, value in seed.get("works", {}).items():
        if isinstance(value, list):
            normalized[slug] = {"bica_ids": value, "isbns": []}
        else:
            normalized[slug] = {
                "bica_ids": value.get("bica_ids", []),
                "isbns": value.get("isbns", []),
            }
    return normalized


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Actualiza la disponibilidad pública de RED BICA.")
    parser.add_argument("--author", action="append", dest="authors", help="Slug de autor que se desea actualizar.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    directory = json.loads(CONTACTS_PATH.read_text(encoding="utf-8")) if CONTACTS_PATH.exists() else {"branches": {}}
    seed_paths = sorted((ROOT / "data/bica").glob("*-records.json"))
    seeds = []
    for seed_path in seed_paths:
        seed = json.loads(seed_path.read_text(encoding="utf-8"))
        author_slug = seed.get("author_slug") or seed_path.name.removesuffix("-records.json")
        if args.authors and author_slug not in args.authors:
            continue
        seeds.append((author_slug, seed, normalized_seed_works(seed)))

    if not seeds:
        print("No hay autores que actualizar.", file=sys.stderr)
        return 2

    tasks = [
        (author_slug, work_slug, str(bica_id))
        for author_slug, _seed, seed_works in seeds
        for work_slug, work_seed in seed_works.items()
        for bica_id in work_seed["bica_ids"]
    ]

    records: list[dict] = []
    failures: list[str] = []

    for index, (author_slug, work_slug, bica_id) in enumerate(tasks, start=1):
        url = permalink(bica_id)
        print(f"[{index:03d}/{len(tasks):03d}] {author_slug} / BICA {bica_id}")
        try:
            record = parse_record(fetch_html(url), bica_id, work_slug, url, directory)
            record["author_slug"] = author_slug
            records.append(record)
        except Exception as exc:  # keep crawling to report every transient failure
            failures.append(f"{bica_id}: {exc}")
        if index != len(tasks):
            time.sleep(random.uniform(0.45, 0.8))

    if failures:
        print("\nNo se publica una actualización parcial:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1

    checked_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    for author_slug, _seed, seed_works in seeds:
        author_records = [record for record in records if record["author_slug"] == author_slug]
        works = aggregate(author_records)
        for work_slug, work in works.items():
            work["bica_records"] = sum(1 for record in author_records if record["work_slug"] == work_slug)
            work["isbn_count"] = len(seed_works.get(work_slug, {}).get("isbns", []))

        availability_path = ROOT / f"data/availability/{author_slug}.json"
        availability_source = f"/data/availability/{author_slug}.json"
        availability = {
            "schema_version": "1.0",
            "source": "RED BICA / OpacDiscovery",
            "source_mode": "public GET only",
            "author_slug": author_slug,
            "last_checked": checked_at,
            "refresh_target": "daily",
            "notice": "Disponibilidad actualizada una vez al día. Recomendamos llamar a la biblioteca antes de desplazarse.",
            "records_checked": len(author_records),
            "works": works,
            "records": author_records,
        }
        write_json(availability_path, availability)

        catalog_path = ROOT / f"data/library/{author_slug}.json"
        if catalog_path.exists():
            write_json(catalog_path, update_catalog(catalog_path, works, checked_at, seed_works))

        if author_slug == "brian-weiss":
            lazos = update_lazos(works, author_records, checked_at, availability_source)
            if lazos is not None:
                write_json(LAZOS_PATH, lazos)

    total = sum(record["copies_total"] for record in records)
    available = sum(record["copies_available"] for record in records)
    print(f"OK: {len(records)} registros, {total} ejemplares, {available} disponibles")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
