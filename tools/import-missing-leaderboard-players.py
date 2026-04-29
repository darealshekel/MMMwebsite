from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_JSON = PROJECT_ROOT / "src" / "generated" / "mmm-spreadsheet-source-data.json"
SNAPSHOT_JS = PROJECT_ROOT / "api" / "_lib" / "static-mmm-snapshot.js"
TMP_DIR = PROJECT_ROOT / "tools" / "tmp"
DEFAULT_WORKBOOK_PATH = TMP_DIR / "missing-players-source.xlsx"
DEFAULT_LOG_PATH = TMP_DIR / "missing-players-import-log.json"
SOURCE_SPREADSHEET_ID = "1c3Ctu0wFy0z5NhC6CKLeMOjf86CxxV4RaeH0ISnry_s"
SOURCE_EXPORT_URL = f"https://docs.google.com/spreadsheets/d/{SOURCE_SPREADSHEET_ID}/export?format=xlsx"
PLAYER_NAME_ALIASES = {
    "mmagmaa": "florallymagma",
    "c1lz": "babyiloveyou",
    "driulol": "driuud",
    "linda0790": "linda0709",
    "alugia7": "algi_",
}
PLAYER_NAME_ALIAS_DISPLAY_NAMES = {
    "florallymagma": "FlorallyMagma",
    "babyiloveyou": "BabyILoveYou",
    "driuud": "driuud",
    "linda0709": "Linda0709",
    "algi_": "Algi_",
}
REMOVED_PLAYER_KEYS = {"shekel_", "tiwiti888"}
SSP_SOURCE_LOGO_HASH = "53af69d6f765a123be8e19bb6486fca6"
HSP_SOURCE_LOGO_HASH = "3f71b13fd1b931f6387851f2bf31db02"
CORSARIUS_SOURCE_NAME = "Corsarius"
CORSARIUS_SOURCE_ID = "private:corsarius"
CORSARIUS_SOURCE_SLUG = "corsarius"
CORSARIUS_PLAYER_WORLD_SLOTS = {
    "kickwhite": "01",
    "champaxx": "01",
    "thorjaime": "02",
    "manuelsantana11": "01",
    "legendh": "02",
    "miceboom": "01",
    "sacodepienso_": "02",
    "elslimefurioso": "01",
    "ngiokai": "01",
    "butter_ctm": "01",
    "samugetta19": "01",
    "gueltamax": "02",
    "trescok": "02",
    "lobo03": "01",
}
CORSARIUS_SCOREBOARD_BLOCKS = {
    "kickwhite": 933598,
    "champaxx": 722337,
    "thorjaime": 595242,
    "manuelsantana11": 500000,
    "legendh": 483170,
    "miceboom": 422393,
    "sacodepienso_": 325170,
    "elslimefurioso": 321090,
    "ngiokai": 282197,
    "butter_ctm": 225041,
    "samugetta19": 221228,
    "gueltamax": 206471,
    "trescok": 197883,
    "ronambulo": 185811,
    "lobo03": 173706,
}
DUGRIFT_SOURCE_SLUG = "dugrift-smp"
DUGRIFT_REMOVED_PLAYER_KEYS = {"wkeyaki", "xs_power"}


def load_builder_module():
    builder_path = PROJECT_ROOT / "tools" / "build-mmm-source-data.py"
    spec = importlib.util.spec_from_file_location("mmm_source_builder", builder_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load spreadsheet builder from {builder_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def normalized_player_name(builder: Any, value: Any) -> str:
    text = raw_player_name_key(builder, value)
    return canonical_player_alias_key(text)


def raw_player_name_key(builder: Any, value: Any) -> str:
    text = builder.clean_player_display_name(value)
    text = re.sub(r"[\u200b-\u200d\ufeff]", "", text)
    return re.sub(r"\s+", " ", text).strip().lower()


def canonical_player_alias_key(value: str) -> str:
    key = re.sub(r"\s+", " ", str(value or "")).strip().lower()
    seen: set[str] = set()
    while key in PLAYER_NAME_ALIASES and key not in seen:
        seen.add(key)
        key = PLAYER_NAME_ALIASES[key]
    return key


def canonical_player_display_name(builder: Any, value: Any) -> str:
    raw_key = raw_player_name_key(builder, value)
    canonical_key = canonical_player_alias_key(raw_key)
    if canonical_key != raw_key:
        return PLAYER_NAME_ALIAS_DISPLAY_NAMES.get(canonical_key, canonical_key)
    return builder.clean_player_display_name(value)


def download_workbook(path: Path) -> None:
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(
        SOURCE_EXPORT_URL,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        path.write_bytes(response.read())


def load_snapshot() -> dict[str, Any]:
    return json.loads(SNAPSHOT_JSON.read_text(encoding="utf-8"))


def write_snapshot(snapshot: dict[str, Any]) -> None:
    snapshot_json = json.dumps(snapshot, indent=2)
    snapshot_module_json = json.dumps(snapshot, separators=(",", ":"))
    SNAPSHOT_JSON.write_text(snapshot_json, encoding="utf-8")
    SNAPSHOT_JS.write_text(f"const snapshot={snapshot_module_json};\n\nexport default snapshot;\n", encoding="utf-8")


def iter_all_source_records(snapshot: dict[str, Any]):
    for source in snapshot.get("sources", []) or []:
        yield source
    for dataset in (snapshot.get("specialLeaderboards", {}) or {}).values():
        for source in dataset.get("sources", []) or []:
            yield source


def collect_existing_player_keys(snapshot: dict[str, Any], builder: Any) -> set[str]:
    keys: set[str] = set()
    for row in snapshot.get("mainLeaderboard", {}).get("rows", []) or []:
        key = normalized_player_name(builder, row.get("username"))
        if key:
            keys.add(key)

    return keys


def collect_all_raw_player_keys(snapshot: dict[str, Any], builder: Any) -> set[str]:
    keys: set[str] = set()

    def add_rows(rows: list[dict[str, Any]] | None) -> None:
        for row in rows or []:
            key = raw_player_name_key(builder, row.get("username"))
            if key:
                keys.add(key)

    add_rows(snapshot.get("mainLeaderboard", {}).get("rows", []))
    for source in iter_all_source_records(snapshot):
        add_rows(source.get("rows", []))
    for dataset in (snapshot.get("specialLeaderboards", {}) or {}).values():
        add_rows(dataset.get("rows", []))

    return keys


def remove_aliased_duplicate_players(snapshot: dict[str, Any], builder: Any, log: dict[str, Any]) -> None:
    raw_keys = collect_all_raw_player_keys(snapshot, builder)
    aliases_to_remove = {
        alias_key
        for alias_key, target_key in PLAYER_NAME_ALIASES.items()
        if alias_key in raw_keys and canonical_player_alias_key(target_key) in raw_keys
    }
    aliases_to_remove.update(key for key in REMOVED_PLAYER_KEYS if key in raw_keys)
    if not aliases_to_remove:
        return

    def should_remove_row(row: dict[str, Any]) -> bool:
        return raw_player_name_key(builder, row.get("username")) in aliases_to_remove

    def filter_rows(rows: list[dict[str, Any]] | None) -> tuple[list[dict[str, Any]], int]:
        retained = [row for row in rows or [] if not should_remove_row(row)]
        return retained, len(rows or []) - len(retained)

    main_rows = snapshot.setdefault("mainLeaderboard", {}).setdefault("rows", [])
    filtered_main_rows, removed_main_rows = filter_rows(main_rows)
    snapshot["mainLeaderboard"]["rows"] = filtered_main_rows

    removed_source_rows = 0
    removed_sources = 0

    def filter_source_list(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
        nonlocal removed_source_rows, removed_sources
        retained_sources: list[dict[str, Any]] = []
        for source in sources:
            rows = source.setdefault("rows", [])
            filtered_rows, removed_rows = filter_rows(rows)
            source["rows"] = filtered_rows
            removed_source_rows += removed_rows
            if removed_rows and not filtered_rows:
                removed_sources += 1
                continue
            retained_sources.append(source)
        return retained_sources

    snapshot["sources"] = filter_source_list(snapshot.setdefault("sources", []))
    for dataset in (snapshot.setdefault("specialLeaderboards", {}) or {}).values():
        dataset["sources"] = filter_source_list(dataset.setdefault("sources", []))
        aggregate_rows = dataset.setdefault("rows", [])
        filtered_aggregate_rows, removed_aggregate_rows = filter_rows(aggregate_rows)
        dataset["rows"] = filtered_aggregate_rows
        removed_source_rows += removed_aggregate_rows

    previous_backfill = (snapshot.setdefault("meta", {}) or {}).get("missingPlayersOnlyBackfill") or {}
    imported_keys = previous_backfill.get("importedPlayerKeys")
    if isinstance(imported_keys, list):
        previous_backfill["importedPlayerKeys"] = sorted(
            {
                canonical_player_alias_key(str(key))
                for key in imported_keys
                if canonical_player_alias_key(str(key)) not in aliases_to_remove
            }
        )
        snapshot["meta"]["missingPlayersOnlyBackfill"] = previous_backfill

    log["aliasedDuplicateMainRowsRemoved"] = removed_main_rows
    log["aliasedDuplicateSourceRowsRemoved"] = removed_source_rows
    log["aliasedDuplicateSourcesRemoved"] = removed_sources


def collect_source_stat_keys(snapshot: dict[str, Any], builder: Any) -> set[tuple[str, str, str]]:
    keys: set[tuple[str, str, str]] = set()
    for source in iter_all_source_records(snapshot):
        category = str(source.get("sourceCategory") or source.get("sourceScope") or source.get("sourceType") or "")
        fallback_source_name = source.get("displayName")
        for row in source.get("rows", []) or []:
            player_key = normalized_player_name(builder, row.get("username"))
            source_name = builder.canonical_source_name(row.get("sourceServer") or fallback_source_name)
            if player_key and source_name:
                keys.add((player_key, source_name, category))
    return keys


def source_value_columns(builder: Any, cells: dict[str, Any]) -> list[int]:
    max_col = 0
    max_row = 0
    for ref in cells:
        match = re.fullmatch(r"([A-Z]+)(\d+)", ref)
        if not match:
            continue
        col = 0
        for char in match.group(1):
            col = col * 26 + (ord(char) - 64)
        max_col = max(max_col, col)
        max_row = max(max_row, int(match.group(2)))

    columns: list[int] = []
    for col in range(12, max_col + 1, 2):
        column = builder.col_letter(col)
        for row in range(9, max_row + 1):
            amount, _reason = builder.parsed_block_count(cells.get(f"{column}{row}"))
            if amount is not None:
                columns.append(col)
                break
    return columns


def limited_append(items: list[Any], value: Any, limit: int = 200) -> None:
    if len(items) < limit:
        items.append(value)


def rerank_rows(rows: list[dict[str, Any]]) -> None:
    rows.sort(key=lambda item: (-int(item.get("blocksMined") or 0), str(item.get("username") or "").lower()))
    for rank, row in enumerate(rows, start=1):
        row["rank"] = rank


def is_individual_world_digs_name(value: Any) -> bool:
    return bool(re.match(r"^individual world digs(?:\s*(?:\(\d+\)|\d+))?$", str(value or ""), re.IGNORECASE))


def individual_world_slot(value: Any) -> str:
    match = re.search(r"(\d+)\)?\s*$", str(value or ""))
    return f"{int(match.group(1)):02d}" if match else "01"


def friendly_individual_world_name(source_name: str, logo_hash: str | None) -> str:
    if not is_individual_world_digs_name(source_name):
        return source_name

    slot = individual_world_slot(source_name)
    if logo_hash == SSP_SOURCE_LOGO_HASH:
        return f"SSP World {slot}"
    if logo_hash == HSP_SOURCE_LOGO_HASH:
        return f"HSP World {slot}"
    return f"Unlabeled World {slot}"


def source_logo_hash(source: dict[str, Any]) -> str | None:
    source_id = str(source.get("id") or "")
    if ":" in source_id:
        prefix, value = source_id.split(":", 1)
        if prefix in {"digs", "private"} and re.fullmatch(r"[a-f0-9]{32}", value):
            return value

    logo_url = str(source.get("logoUrl") or "")
    match = re.search(r"/([a-f0-9]{32})\.[a-z0-9]+$", logo_url)
    return match.group(1) if match else None


def private_source_mappings_from_workbook(
    builder: Any,
    archive: zipfile.ZipFile,
    sheet_targets: dict[str, str],
    shared_strings: list[str],
    logo_file_by_hash: dict[str, str],
) -> dict[str, dict[str, Any]]:
    if "Private Server Digs" not in sheet_targets:
        return {}

    private_cells = builder.parse_sheet_cells(archive, sheet_targets["Private Server Digs"], shared_strings)
    private_images = builder.extract_sheet_images(archive, sheet_targets["Private Server Digs"], logo_file_by_hash)
    mappings: dict[str, dict[str, Any]] = {}

    for (row, col), image in private_images.items():
        if col != 8 or row < 9:
            continue

        name = builder.clean_display_name(private_cells.get(f"I{row}"))
        if not name:
            continue

        mappings[image.md5] = {
            "logoHash": image.md5,
            "displayName": name,
            "slug": builder.slugify(name),
            "logoUrl": image.relative_logo_url,
            "totalBlocks": builder.number_or_none(private_cells.get(f"J{row}")),
            "isDead": str(private_cells.get(f"K{row}") or "").strip().upper() == "D",
            "spreadsheetRow": row,
        }

    return mappings


def build_source_indexes(snapshot: dict[str, Any], builder: Any) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    by_hash: dict[str, dict[str, Any]] = {}
    by_name: dict[str, dict[str, Any]] = {}
    for source in snapshot.setdefault("sources", []):
        logo_hash = source_logo_hash(source)
        if logo_hash and logo_hash not in by_hash:
            by_hash[logo_hash] = source

        name_key = builder.canonical_source_name(source.get("displayName"))
        if name_key and name_key not in by_name:
            by_name[name_key] = source

    return by_hash, by_name


def ensure_private_source(
    snapshot: dict[str, Any],
    builder: Any,
    private_meta: dict[str, Any],
    by_hash: dict[str, dict[str, Any]],
    by_name: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    logo_hash = str(private_meta["logoHash"])
    display_name = str(private_meta["displayName"])
    name_key = builder.canonical_source_name(display_name)
    source = by_hash.get(logo_hash) or by_name.get(name_key)

    if source is None:
        source = {
            "id": f"private:{logo_hash}",
            "slug": private_meta["slug"],
            "displayName": display_name,
            "logoUrl": private_meta.get("logoUrl"),
            "sourceType": "server",
            "sourceScope": "private_server_digs",
            "totalBlocks": 0,
            "isDead": bool(private_meta.get("isDead")),
            "playerCount": 0,
            "hasSpreadsheetTotal": private_meta.get("totalBlocks") is not None,
            "rows": [],
        }
        snapshot.setdefault("sources", []).append(source)

    source["displayName"] = display_name
    source["slug"] = str(source.get("slug") or private_meta["slug"])
    source["logoUrl"] = source.get("logoUrl") or private_meta.get("logoUrl")
    source["sourceType"] = "server"
    source["sourceScope"] = "private_server_digs"
    source["isDead"] = bool(source.get("isDead")) or bool(private_meta.get("isDead"))
    source.setdefault("rows", [])

    private_total = private_meta.get("totalBlocks")
    if private_total is not None:
        source["hasSpreadsheetTotal"] = True
        source["totalBlocks"] = max(int(source.get("totalBlocks") or 0), int(private_total))

    by_hash[logo_hash] = source
    by_name[name_key] = source
    return source


def upsert_source_row(
    source: dict[str, Any],
    builder: Any,
    source_row: dict[str, Any],
    *,
    source_id: str | None = None,
    source_slug: str | None = None,
    source_name: str | None = None,
    log_existing: list[Any] | None = None,
) -> bool:
    player_key = normalized_player_name(builder, source_row.get("username"))
    if not player_key:
        return False

    rows = source.setdefault("rows", [])
    for existing in rows:
        if normalized_player_name(builder, existing.get("username")) == player_key:
            if log_existing is not None:
                limited_append(
                    log_existing,
                    {
                        "player": source_row.get("username"),
                        "source": source.get("displayName"),
                        "blocksMined": source_row.get("blocksMined"),
                    },
                )
            return False

    resolved_source_id = source_id or str(source.get("id") or "")
    resolved_source_slug = source_slug or str(source.get("slug") or "")
    resolved_source_name = source_name or str(source.get("displayName") or "")
    row_payload = dict(source_row)
    row_payload.update(
        {
            "sourceServer": resolved_source_name,
            "sourceKey": f"{resolved_source_id}:{player_key}",
            "sourceId": resolved_source_id,
            "sourceSlug": resolved_source_slug,
            "rowKey": f"{resolved_source_id}:{player_key}",
            "viewKind": "source",
        }
    )
    rows.append(row_payload)
    return True


def migrate_named_private_sources(
    snapshot: dict[str, Any],
    builder: Any,
    private_source_by_hash: dict[str, dict[str, Any]],
    log: dict[str, Any],
) -> None:
    ssphsp = snapshot.setdefault("specialLeaderboards", {}).setdefault("ssp-hsp", {})
    ssphsp_sources = ssphsp.setdefault("sources", [])
    if not ssphsp_sources:
        return

    source_by_hash, source_by_name = build_source_indexes(snapshot, builder)
    retained_sources: list[dict[str, Any]] = []

    for source in ssphsp_sources:
        name = str(source.get("displayName") or "")
        logo_hash = str(source.get("sourceSymbolHash") or "")
        private_meta = private_source_by_hash.get(logo_hash)
        existing_named_source = source_by_hash.get(logo_hash)
        target_source = None

        if private_meta:
            target_source = ensure_private_source(snapshot, builder, private_meta, source_by_hash, source_by_name)
        elif existing_named_source and not is_individual_world_digs_name(existing_named_source.get("displayName")):
            target_source = existing_named_source

        if not target_source or not is_individual_world_digs_name(name):
            retained_sources.append(source)
            continue

        added_rows = 0
        for row in source.get("rows", []) or []:
            if upsert_source_row(
                target_source,
                builder,
                row,
                source_id=str(target_source.get("id") or ""),
                source_slug=str(target_source.get("slug") or ""),
                source_name=str(target_source.get("displayName") or ""),
                log_existing=log["privateSourceRowsSkippedExisting"],
            ):
                added_rows += 1

        log["individualWorldSourcesMovedToPrivate"] += 1
        log["privateSourceRowsMovedFromIndividualWorld"] += added_rows
        limited_append(
            log["privateSourceRenameSamples"],
            {
                "from": name,
                "to": target_source.get("displayName"),
                "logoHash": logo_hash,
                "rowsMoved": added_rows,
            },
        )

    ssphsp["sources"] = retained_sources


def rename_remaining_individual_world_sources(snapshot: dict[str, Any], builder: Any, log: dict[str, Any]) -> None:
    ssphsp = snapshot.setdefault("specialLeaderboards", {}).setdefault("ssp-hsp", {})
    for source in ssphsp.setdefault("sources", []):
        old_name = str(source.get("displayName") or "")
        logo_hash = str(source.get("sourceSymbolHash") or "") or None
        new_name = friendly_individual_world_name(old_name, logo_hash)
        if new_name == old_name:
            continue

        owner_name = builder.clean_player_display_name(source.get("ownerUsername"))
        owner_key = normalized_player_name(builder, owner_name)
        source_slug = f"ssp-hsp-{builder.slugify(owner_name or owner_key)}-{builder.slugify(new_name)}"
        source["displayName"] = new_name
        source["slug"] = source_slug

        for row in source.get("rows", []) or []:
            player_key = normalized_player_name(builder, row.get("username"))
            row["sourceServer"] = new_name
            row["sourceSlug"] = source_slug
            row["sourceKey"] = f"{source.get('id')}:{player_key}"
            row["rowKey"] = f"{source.get('id')}:{player_key}"

        log["remainingIndividualWorldSourcesRenamed"] += 1
        limited_append(
            log["remainingIndividualWorldRenameSamples"],
            {
                "from": old_name,
                "to": new_name,
                "logoHash": logo_hash,
                "owner": owner_name or None,
            },
        )


def unlabeled_world_slot(value: Any) -> str | None:
    text = re.sub(r"\s+", " ", str(value or "")).strip().lower()
    match = re.fullmatch(r"unlab(?:el|l)ed world (\d+)", text)
    return f"{int(match.group(1)):02d}" if match else None


def corsarius_slot_for_source(source: dict[str, Any], builder: Any) -> str | None:
    source_slot = unlabeled_world_slot(source.get("displayName"))
    if not source_slot:
        return None

    owner_key = normalized_player_name(builder, source.get("ownerUsername"))
    if not owner_key:
        for row in source.get("rows", []) or []:
            owner_key = normalized_player_name(builder, row.get("username"))
            if owner_key:
                break

    expected_slot = CORSARIUS_PLAYER_WORLD_SLOTS.get(owner_key)
    return source_slot if expected_slot == source_slot else None


def ensure_corsarius_source(snapshot: dict[str, Any], builder: Any) -> dict[str, Any]:
    sources = snapshot.setdefault("sources", [])
    corsarius_key = builder.canonical_source_name(CORSARIUS_SOURCE_NAME)
    source = next(
        (
            item
            for item in sources
            if str(item.get("id") or "") == CORSARIUS_SOURCE_ID
            or builder.canonical_source_name(item.get("displayName")) == corsarius_key
        ),
        None,
    )

    if source is None:
        source = {
            "id": CORSARIUS_SOURCE_ID,
            "slug": CORSARIUS_SOURCE_SLUG,
            "displayName": CORSARIUS_SOURCE_NAME,
            "logoUrl": None,
            "sourceType": "server",
            "sourceScope": "private_server_digs",
            "totalBlocks": 0,
            "isDead": False,
            "playerCount": 0,
            "hasSpreadsheetTotal": False,
            "rows": [],
        }
        sources.append(source)

    source["displayName"] = CORSARIUS_SOURCE_NAME
    source["slug"] = str(source.get("slug") or CORSARIUS_SOURCE_SLUG)
    source["sourceType"] = "server"
    source["sourceScope"] = "private_server_digs"
    source["isDead"] = bool(source.get("isDead"))
    source["hasSpreadsheetTotal"] = False
    source.setdefault("rows", [])
    return source


def migrate_corsarius_source(snapshot: dict[str, Any], builder: Any, log: dict[str, Any]) -> None:
    ssphsp = snapshot.setdefault("specialLeaderboards", {}).setdefault("ssp-hsp", {})
    ssphsp_sources = ssphsp.setdefault("sources", [])
    if not ssphsp_sources:
        return

    target_source = ensure_corsarius_source(snapshot, builder)
    target_source_id = str(target_source.get("id") or CORSARIUS_SOURCE_ID)
    target_source_slug = str(target_source.get("slug") or CORSARIUS_SOURCE_SLUG)
    retained_sources: list[dict[str, Any]] = []

    for source in ssphsp_sources:
        source_slot = corsarius_slot_for_source(source, builder)
        if not source_slot:
            retained_sources.append(source)
            continue

        old_name = str(source.get("displayName") or "")
        retained_rows: list[dict[str, Any]] = []
        moved_rows = 0

        for row in source.get("rows", []) or []:
            player_key = normalized_player_name(builder, row.get("username"))
            if CORSARIUS_PLAYER_WORLD_SLOTS.get(player_key) != source_slot:
                retained_rows.append(row)
                continue

            upsert_source_row(
                target_source,
                builder,
                row,
                source_id=target_source_id,
                source_slug=target_source_slug,
                source_name=CORSARIUS_SOURCE_NAME,
                log_existing=log["corsariusRowsSkippedExisting"],
            )
            moved_rows += 1
            limited_append(
                log["corsariusRenameSamples"],
                {
                    "player": row.get("username"),
                    "from": old_name,
                    "to": CORSARIUS_SOURCE_NAME,
                    "blocksMined": row.get("blocksMined"),
                },
            )

        if retained_rows:
            source["rows"] = retained_rows
            retained_sources.append(source)

        if moved_rows:
            log["corsariusRowsMoved"] += moved_rows
            log["corsariusSourcesRenamed"] += 1

    ssphsp["sources"] = retained_sources


def ensure_corsarius_scoreboard_rows(snapshot: dict[str, Any], builder: Any, log: dict[str, Any], run_at: str) -> None:
    source = ensure_corsarius_source(snapshot, builder)
    source_id = str(source.get("id") or CORSARIUS_SOURCE_ID)
    source_slug = str(source.get("slug") or CORSARIUS_SOURCE_SLUG)
    rows = source.setdefault("rows", [])

    deduped_rows: list[dict[str, Any]] = []
    seen_scoreboard_players: set[str] = set()
    for row in rows:
        player_key = normalized_player_name(builder, row.get("username"))
        if player_key in CORSARIUS_SCOREBOARD_BLOCKS:
            if player_key in seen_scoreboard_players:
                log["corsariusDuplicateRowsRemoved"] += 1
                continue
            seen_scoreboard_players.add(player_key)
        deduped_rows.append(row)
    source["rows"] = deduped_rows
    rows = source["rows"]

    rows_by_player = {normalized_player_name(builder, row.get("username")): row for row in rows}
    main_rows = snapshot.setdefault("mainLeaderboard", {}).setdefault("rows", [])
    main_by_player = {normalized_player_name(builder, row.get("username")): row for row in main_rows}

    for player_key, expected_blocks in CORSARIUS_SCOREBOARD_BLOCKS.items():
        row = rows_by_player.get(player_key)
        main_row = main_by_player.get(player_key)
        if row is None:
            if main_row is None:
                log["corsariusScoreboardPlayersMissing"] += 1
                limited_append(log["corsariusScoreboardMissingSamples"], {"player": player_key})
                continue

            username = builder.clean_player_display_name(main_row.get("username")) or player_key
            row = {
                "playerId": main_row.get("playerId") or f"sheet:{player_key}",
                "username": username,
                "skinFaceUrl": main_row.get("skinFaceUrl") or f"https://minotar.net/avatar/{urllib.parse.quote(username)}/32",
                "playerFlagUrl": main_row.get("playerFlagUrl"),
                "lastUpdated": main_row.get("lastUpdated") or run_at,
                "rank": 1,
                "sourceCount": 1,
                "viewKind": "source",
            }
            rows.append(row)
            rows_by_player[player_key] = row
            log["corsariusRowsAddedFromScoreboard"] += 1

        previous_blocks = int(row.get("blocksMined") or 0)
        if previous_blocks != expected_blocks:
            log["corsariusBlockCorrections"] += 1
            limited_append(
                log["corsariusBlockCorrectionSamples"],
                {
                    "player": row.get("username") or player_key,
                    "from": previous_blocks,
                    "to": expected_blocks,
                },
            )

        row.update(
            {
                "blocksMined": expected_blocks,
                "totalDigs": expected_blocks,
                "sourceServer": CORSARIUS_SOURCE_NAME,
                "sourceKey": f"{source_id}:{player_key}",
                "sourceId": source_id,
                "sourceSlug": source_slug,
                "rowKey": f"{source_id}:{player_key}",
                "viewKind": "source",
            }
        )


def refresh_corsarius_player_totals(snapshot: dict[str, Any], builder: Any, log: dict[str, Any]) -> None:
    main_rows = snapshot.setdefault("mainLeaderboard", {}).setdefault("rows", [])
    main_by_player = {normalized_player_name(builder, row.get("username")): row for row in main_rows}
    contributions = collect_player_source_contributions(snapshot, builder)

    for player_key in CORSARIUS_SCOREBOARD_BLOCKS:
        main_row = main_by_player.get(player_key)
        contribution = contributions.get(player_key)
        if not main_row or not contribution:
            continue

        total = int(contribution.get("total") or 0)
        previous_total = int(main_row.get("blocksMined") or 0)
        if total != previous_total:
            log["corsariusPlayerTotalsUpdated"] += 1
            limited_append(
                log["corsariusPlayerTotalSamples"],
                {
                    "player": main_row.get("username") or player_key,
                    "from": previous_total,
                    "to": total,
                },
            )
        main_row["blocksMined"] = total
        main_row["totalDigs"] = total


def refresh_dug_smp_player_totals(snapshot: dict[str, Any], builder: Any, log: dict[str, Any]) -> None:
    player_totals = getattr(builder, "DUG_SMP_PLAYER_TOTALS", {})
    dug_smp_blocks_by_player = {
        normalized_player_name(builder, username): int(blocks or 0)
        for username, blocks in player_totals.items()
    }
    if not dug_smp_blocks_by_player:
        return

    main_rows = snapshot.setdefault("mainLeaderboard", {}).setdefault("rows", [])
    main_by_player = {normalized_player_name(builder, row.get("username")): row for row in main_rows}
    contributions = collect_player_source_contributions(snapshot, builder)

    for player_key, dug_smp_blocks in dug_smp_blocks_by_player.items():
        main_row = main_by_player.get(player_key)
        contribution = contributions.get(player_key)
        if not main_row or not contribution:
            continue

        total = int(contribution.get("total") or 0)
        previous_total = int(main_row.get("blocksMined") or 0)
        if previous_total > dug_smp_blocks or total <= previous_total:
            continue

        main_row["blocksMined"] = total
        main_row["totalDigs"] = total
        log["dugSmpPlayerTotalsUpdated"] += 1
        limited_append(
            log["dugSmpPlayerTotalSamples"],
            {
                "player": main_row.get("username") or player_key,
                "from": previous_total,
                "to": total,
            },
        )


def collect_player_source_contributions(snapshot: dict[str, Any], builder: Any) -> dict[str, dict[str, Any]]:
    contributions: dict[str, dict[str, Any]] = {}
    for source in iter_all_source_records(snapshot):
        source_id = str(source.get("id") or "")
        source_slug = str(source.get("slug") or "")
        source_name = str(source.get("displayName") or "")
        for row in source.get("rows", []) or []:
            player_key = normalized_player_name(builder, row.get("username"))
            if not player_key:
                continue

            entry = contributions.setdefault(
                player_key,
                {
                    "username": builder.clean_player_display_name(row.get("username")),
                    "playerId": row.get("playerId") or f"sheet:{player_key}",
                    "skinFaceUrl": row.get("skinFaceUrl") or f"https://minotar.net/avatar/{urllib.parse.quote(str(row.get('username') or player_key))}/32",
                    "playerFlagUrl": row.get("playerFlagUrl"),
                    "lastUpdated": row.get("lastUpdated"),
                    "total": 0,
                    "sourceIds": set(),
                    "strongest": None,
                    "strongestBlocks": -1,
                },
            )
            amount = int(row.get("blocksMined") or 0)
            entry["total"] += amount
            if source_id:
                entry["sourceIds"].add(source_id)
            if amount > entry["strongestBlocks"]:
                entry["strongestBlocks"] = amount
                entry["strongest"] = {
                    "sourceServer": source_name,
                    "sourceId": source_id or row.get("sourceId"),
                    "sourceSlug": source_slug or row.get("sourceSlug"),
                }

    return contributions


def add_source_only_players_to_main(snapshot: dict[str, Any], builder: Any, log: dict[str, Any], run_at: str) -> None:
    main_rows = snapshot.setdefault("mainLeaderboard", {}).setdefault("rows", [])
    main_by_key = {normalized_player_name(builder, row.get("username")): row for row in main_rows}
    contributions = collect_player_source_contributions(snapshot, builder)

    for player_key, contribution in contributions.items():
        if not player_key or player_key in main_by_key:
            continue

        total = int(contribution.get("total") or 0)
        if total <= 0:
            continue

        strongest = contribution.get("strongest") or {}
        username = str(contribution.get("username") or player_key)
        main_rows.append(
            {
                "playerId": contribution.get("playerId") or f"sheet:{player_key}",
                "username": username,
                "skinFaceUrl": contribution.get("skinFaceUrl") or f"https://minotar.net/avatar/{urllib.parse.quote(username)}/32",
                "playerFlagUrl": contribution.get("playerFlagUrl"),
                "lastUpdated": contribution.get("lastUpdated") or run_at,
                "blocksMined": total,
                "totalDigs": total,
                "rank": 0,
                "sourceServer": strongest.get("sourceServer") or "Source Backfill",
                "sourceKey": f"global:{player_key}",
                "sourceCount": len(contribution.get("sourceIds") or []),
                "viewKind": "global",
                "sourceId": strongest.get("sourceId"),
                "sourceSlug": strongest.get("sourceSlug"),
                "rowKey": f"global:{player_key}",
            }
        )
        main_by_key[player_key] = main_rows[-1]
        log["sourceOnlyPlayersAddedToLeaderboard"] += 1
        limited_append(
            log["sourceOnlyPlayersAddedSamples"],
            {
                "player": username,
                "blocksMined": total,
                "strongestSource": strongest.get("sourceServer"),
            },
        )


def refresh_player_metadata(snapshot: dict[str, Any], builder: Any) -> None:
    main_rows = snapshot.setdefault("mainLeaderboard", {}).setdefault("rows", [])
    contributions = collect_player_source_contributions(snapshot, builder)

    for row in main_rows:
        player_key = normalized_player_name(builder, row.get("username"))
        contribution = contributions.get(player_key)
        if not contribution:
            continue

        strongest = contribution.get("strongest") or {}
        row["sourceCount"] = len(contribution.get("sourceIds") or [])
        if strongest.get("sourceServer"):
            row["sourceServer"] = strongest.get("sourceServer")
            row["sourceId"] = strongest.get("sourceId")
            row["sourceSlug"] = strongest.get("sourceSlug")


def finalize_snapshot_totals(snapshot: dict[str, Any], builder: Any) -> None:
    for source in snapshot.setdefault("sources", []):
        rows = source.setdefault("rows", [])
        rerank_rows(rows)
        row_sum = sum(int(row.get("blocksMined") or 0) for row in rows)
        if not source.get("hasSpreadsheetTotal"):
            source["totalBlocks"] = row_sum
        else:
            source["totalBlocks"] = max(int(source.get("totalBlocks") or 0), row_sum)
        source["playerCount"] = len(rows)

    snapshot["sources"].sort(key=lambda item: (-int(item.get("totalBlocks") or 0), str(item.get("displayName") or "").lower()))

    ssphsp = snapshot.setdefault("specialLeaderboards", {}).setdefault("ssp-hsp", {})
    ssphsp_sources = ssphsp.setdefault("sources", [])
    for source in ssphsp_sources:
        rows = source.setdefault("rows", [])
        rerank_rows(rows)
        source["totalBlocks"] = sum(int(row.get("blocksMined") or 0) for row in rows)
        source["playerCount"] = len(rows)

    ssphsp_sources.sort(key=lambda item: (-int(item.get("totalBlocks") or 0), str(item.get("displayName") or "").lower()))

    main_rows = snapshot.setdefault("mainLeaderboard", {}).setdefault("rows", [])
    rerank_rows(main_rows)
    snapshot["mainLeaderboard"]["totalBlocks"] = sum(int(row.get("blocksMined") or 0) for row in main_rows)
    snapshot["mainLeaderboard"]["playerCount"] = len(main_rows)

    player_meta = {normalized_player_name(builder, row.get("username")): row for row in main_rows}
    ssphsp_rows = builder.rebuild_ssphsp_rows_from_sources(ssphsp_sources, player_meta)
    ssphsp["rows"] = ssphsp_rows
    ssphsp["totalBlocks"] = sum(int(row.get("blocksMined") or 0) for row in ssphsp_rows)
    ssphsp["playerCount"] = len(ssphsp_rows)


def remove_dugrift_excluded_players(snapshot: dict[str, Any], builder: Any, log: dict[str, Any]) -> None:
    for source in snapshot.setdefault("sources", []):
        if str(source.get("slug") or "").strip().lower() != DUGRIFT_SOURCE_SLUG:
            continue
        rows = source.setdefault("rows", [])
        kept_rows = [
            row for row in rows
            if normalized_player_name(builder, row.get("username")) not in DUGRIFT_REMOVED_PLAYER_KEYS
        ]
        removed_rows = len(rows) - len(kept_rows)
        if removed_rows <= 0:
            return
        source["rows"] = kept_rows
        source["players"] = {
            normalized_player_name(builder, row.get("username")): row
            for row in kept_rows
            if normalized_player_name(builder, row.get("username"))
        }
        source["hasSpreadsheetTotal"] = False
        source["totalBlocks"] = sum(int(row.get("blocksMined") or 0) for row in kept_rows)
        source["playerCount"] = len(kept_rows)
        log["dugriftRowsRemoved"] += removed_rows
        log["dugriftRemovedPlayers"] = sorted(DUGRIFT_REMOVED_PLAYER_KEYS)
        return


def apply_missing_players_backfill(snapshot: dict[str, Any], workbook_path: Path, builder: Any) -> dict[str, Any]:
    run_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    log: dict[str, Any] = {
        "source": "Digs!I:J and source pairs K/L onward",
        "sourceSpreadsheetId": SOURCE_SPREADSHEET_ID,
        "runAt": run_at,
        "playersAdded": 0,
        "playersSkippedExisting": 0,
        "playersSkippedDuplicateInSheet": 0,
        "playersSkippedInvalid": 0,
        "sourceRowsAdded": 0,
        "sourceRowsSkippedExisting": 0,
        "sourceRowsSkippedInvalid": 0,
        "playersWithSourceTotalMismatch": 0,
        "individualWorldSourcesMovedToPrivate": 0,
        "privateSourceRowsMovedFromIndividualWorld": 0,
        "privateSourceRowsAdded": 0,
        "privateSourceRowsSkippedExisting": [],
        "remainingIndividualWorldSourcesRenamed": 0,
        "corsariusSourcesRenamed": 0,
        "corsariusRowsMoved": 0,
        "corsariusRowsAddedFromScoreboard": 0,
        "corsariusBlockCorrections": 0,
        "corsariusDuplicateRowsRemoved": 0,
        "corsariusScoreboardPlayersMissing": 0,
        "corsariusPlayerTotalsUpdated": 0,
        "sourceOnlyPlayersAddedToLeaderboard": 0,
        "aliasedDuplicateMainRowsRemoved": 0,
        "aliasedDuplicateSourceRowsRemoved": 0,
        "aliasedDuplicateSourcesRemoved": 0,
        "dugriftRowsRemoved": 0,
        "dugriftRemovedPlayers": [],
        "dugSmpPlayerTotalsUpdated": 0,
        "dugSmpPlayerTotalSamples": [],
        "addedPlayers": [],
        "skippedExistingPlayers": [],
        "skippedInvalidRows": [],
        "skippedExistingSourceRows": [],
        "privateSourceRenameSamples": [],
        "remainingIndividualWorldRenameSamples": [],
        "corsariusRenameSamples": [],
        "corsariusRowsSkippedExisting": [],
        "corsariusBlockCorrectionSamples": [],
        "corsariusScoreboardMissingSamples": [],
        "corsariusPlayerTotalSamples": [],
        "sourceOnlyPlayersAddedSamples": [],
    }

    remove_aliased_duplicate_players(snapshot, builder, log)

    existing_player_keys = collect_existing_player_keys(snapshot, builder)
    existing_source_stat_keys = collect_source_stat_keys(snapshot, builder)
    seen_sheet_player_keys: set[str] = set()
    added_player_keys_this_run: set[str] = set()

    main_leaderboard = snapshot.setdefault("mainLeaderboard", {})
    main_rows = main_leaderboard.setdefault("rows", [])
    special_leaderboards = snapshot.setdefault("specialLeaderboards", {})
    ssphsp = special_leaderboards.setdefault(
        "ssp-hsp",
        {
            "title": "SSP/HSP",
            "description": "Single Player Survival + Hardcore digs from the MMM spreadsheet.",
            "rows": [],
            "sources": [],
            "totalBlocks": 0,
            "playerCount": 0,
            "icons": {},
        },
    )
    ssphsp_sources = ssphsp.setdefault("sources", [])
    ssphsp_sources_by_id = {str(source.get("id") or ""): source for source in ssphsp_sources}

    with zipfile.ZipFile(workbook_path) as archive:
        shared_strings = builder.parse_shared_strings(archive)
        sheet_targets = builder.parse_workbook_sheet_targets(archive)
        if "Digs" not in sheet_targets:
            raise RuntimeError("Source spreadsheet is missing the Digs tab.")
        logo_file_by_hash: dict[str, str] = {}
        digs_cells = builder.parse_sheet_cells(archive, sheet_targets["Digs"], shared_strings)
        digs_images = builder.extract_sheet_images(archive, sheet_targets["Digs"], logo_file_by_hash)
        private_source_by_hash = private_source_mappings_from_workbook(
            builder,
            archive,
            sheet_targets,
            shared_strings,
            logo_file_by_hash,
        )

    migrate_named_private_sources(snapshot, builder, private_source_by_hash, log)
    rename_remaining_individual_world_sources(snapshot, builder, log)
    migrate_corsarius_source(snapshot, builder, log)
    ensure_corsarius_scoreboard_rows(snapshot, builder, log, run_at)
    source_by_hash, source_by_name = build_source_indexes(snapshot, builder)
    existing_source_stat_keys = collect_source_stat_keys(snapshot, builder)

    value_columns = source_value_columns(builder, digs_cells)
    max_row = 0
    for ref in digs_cells:
        match = re.fullmatch(r"[A-Z]+(\d+)", ref)
        if match:
            max_row = max(max_row, int(match.group(1)))

    for row_number in range(9, max_row + 1):
        raw_player_name = builder.clean_player_display_name(digs_cells.get(f"I{row_number}"))
        player_key = normalized_player_name(builder, raw_player_name)
        player_name = canonical_player_display_name(builder, raw_player_name)
        total_blocks, total_reason = builder.parsed_block_count(digs_cells.get(f"J{row_number}"))

        if not raw_player_name and total_blocks is None:
            continue

        if not player_key or total_blocks is None:
            log["playersSkippedInvalid"] += 1
            limited_append(
                log["skippedInvalidRows"],
                {
                    "row": row_number,
                    "player": player_name or None,
                    "reason": "empty_player" if not player_key else total_reason or "invalid_total",
                    "value": digs_cells.get(f"J{row_number}"),
                },
            )
            continue

        if player_key in existing_player_keys:
            log["playersSkippedExisting"] += 1
            limited_append(log["skippedExistingPlayers"], {"row": row_number, "player": player_name})
            continue

        if player_key in seen_sheet_player_keys:
            log["playersSkippedDuplicateInSheet"] += 1
            continue

        seen_sheet_player_keys.add(player_key)
        player_id = f"sheet:{player_key}"
        skin_face_url = f"https://minotar.net/avatar/{urllib.parse.quote(player_name)}/32"
        player_flag_url = builder.resolve_player_flag_url(digs_images.get((row_number, 7)))
        source_rows_for_player: list[dict[str, Any]] = []
        strongest_source: dict[str, Any] | None = None
        strongest_blocks = -1
        per_source_sum = 0

        for value_col in value_columns:
            column = builder.col_letter(value_col)
            amount, reason = builder.parsed_block_count(digs_cells.get(f"{column}{row_number}"))
            if amount is None:
                if reason and reason != "empty_world_dig":
                    log["sourceRowsSkippedInvalid"] += 1
                continue

            icon_col = value_col - 1
            image = digs_images.get((row_number, icon_col))
            logo_hash = image.md5 if image else None
            private_meta = private_source_by_hash.get(logo_hash or "")
            existing_named_source = source_by_hash.get(logo_hash or "")
            if private_meta:
                source_name = str(private_meta["displayName"])
            elif existing_named_source and not is_individual_world_digs_name(existing_named_source.get("displayName")):
                source_name = str(existing_named_source.get("displayName") or "")
            else:
                raw_source_name = builder.digs_individual_source_name(digs_cells, value_col, icon_col)
                source_name = friendly_individual_world_name(raw_source_name or "", logo_hash)
            if not source_name:
                log["sourceRowsSkippedInvalid"] += 1
                continue

            category = "private_server_digs" if private_meta else str(existing_named_source.get("sourceScope") or existing_named_source.get("sourceType") or "ssp-hsp") if existing_named_source else "ssp-hsp"
            source_stat_key = (player_key, builder.canonical_source_name(source_name), category)
            if source_stat_key in existing_source_stat_keys:
                log["sourceRowsSkippedExisting"] += 1
                limited_append(
                    log["skippedExistingSourceRows"],
                    {
                        "row": row_number,
                        "column": column,
                        "player": player_name,
                        "source": source_name,
                    },
                )
                continue

            if private_meta:
                source = ensure_private_source(snapshot, builder, private_meta, source_by_hash, source_by_name)
                source_slug = str(source.get("slug") or "")
                source_id = str(source.get("id") or source_slug)
            elif existing_named_source and source_name == str(existing_named_source.get("displayName") or ""):
                source = existing_named_source
                source_slug = str(source.get("slug") or "")
                source_id = str(source.get("id") or source_slug)
            else:
                source_slug = f"ssp-hsp-{builder.slugify(player_name)}-{builder.slugify(source_name)}"
                source_id = f"special:ssp-hsp:digs:{player_key}:{builder.slugify(source_name)}"
                source = ssphsp_sources_by_id.get(source_id)
                if source is None:
                    source = {
                        "id": source_id,
                        "slug": source_slug,
                        "displayName": source_name,
                        "logoUrl": image.relative_logo_url if image else None,
                        "sourceType": "singleplayer",
                        "sourceScope": "ssp_hsp",
                        "sourceCategory": category,
                        "sourceIdentity": "digs-tab-individual-world",
                        "sourceColumn": column,
                        "sourceHeaderCell": f"{builder.col_letter(icon_col)}8",
                        "sourceSymbolHash": logo_hash,
                        "ownerPlayerId": player_id,
                        "ownerUsername": player_name,
                        "totalBlocks": 0,
                        "isDead": False,
                        "playerCount": 1,
                        "hasSpreadsheetTotal": False,
                        "needsManualReview": False,
                        "rows": [],
                    }
                    ssphsp_sources.append(source)
                    ssphsp_sources_by_id[source_id] = source

            row_payload = {
                "playerId": player_id,
                "username": player_name,
                "skinFaceUrl": skin_face_url,
                "playerFlagUrl": player_flag_url,
                "lastUpdated": run_at,
                "blocksMined": amount,
                "totalDigs": amount,
                "rank": 1,
                "sourceServer": source_name,
                "sourceKey": f"{source_id}:{player_key}",
                "sourceCount": 1,
                "viewKind": "source",
                "sourceId": source_id,
                "sourceSlug": source_slug,
                "rowKey": f"{source_id}:{player_key}",
            }
            if private_meta or (existing_named_source and source is existing_named_source):
                if upsert_source_row(
                    source,
                    builder,
                    row_payload,
                    source_id=source_id,
                    source_slug=source_slug,
                    source_name=source_name,
                    log_existing=log["privateSourceRowsSkippedExisting"],
                ):
                    log["privateSourceRowsAdded"] += 1
            else:
                source.setdefault("rows", []).append(row_payload)
            source_rows_for_player.append(row_payload)
            existing_source_stat_keys.add(source_stat_key)
            per_source_sum += amount
            log["sourceRowsAdded"] += 1

            if amount > strongest_blocks:
                strongest_blocks = amount
                strongest_source = source

        if source_rows_for_player and per_source_sum != total_blocks:
            log["playersWithSourceTotalMismatch"] += 1

        main_rows.append(
            {
                "playerId": player_id,
                "username": player_name,
                "skinFaceUrl": skin_face_url,
                "playerFlagUrl": player_flag_url,
                "lastUpdated": run_at,
                "blocksMined": total_blocks,
                "totalDigs": total_blocks,
                "rank": 0,
                "sourceServer": strongest_source.get("displayName") if strongest_source else "Missing Players Spreadsheet",
                "sourceKey": f"global:{player_key}",
                "sourceCount": len(source_rows_for_player),
                "viewKind": "global",
                "sourceId": strongest_source.get("id") if strongest_source else None,
                "sourceSlug": strongest_source.get("slug") if strongest_source else None,
                "rowKey": f"global:{player_key}",
            }
        )
        existing_player_keys.add(player_key)
        added_player_keys_this_run.add(player_key)
        log["playersAdded"] += 1
        limited_append(log["addedPlayers"], {"row": row_number, "player": player_name, "blocksMined": total_blocks})

    remove_dugrift_excluded_players(snapshot, builder, log)
    add_source_only_players_to_main(snapshot, builder, log, run_at)
    refresh_player_metadata(snapshot, builder)
    refresh_corsarius_player_totals(snapshot, builder, log)
    refresh_dug_smp_player_totals(snapshot, builder, log)
    finalize_snapshot_totals(snapshot, builder)

    previous_backfill = (snapshot.setdefault("meta", {}) or {}).get("missingPlayersOnlyBackfill") or {}
    previous_imported = set(previous_backfill.get("importedPlayerKeys") or [])
    current_imported = previous_imported | added_player_keys_this_run
    log["importedPlayerKeys"] = sorted(key for key in current_imported if key)
    snapshot.setdefault("meta", {})["missingPlayersOnlyBackfill"] = log
    return log


def main() -> None:
    parser = argparse.ArgumentParser(description="Import only missing leaderboard players from the supplemental MMM spreadsheet.")
    parser.add_argument("--dry-run", action="store_true", help="Calculate the import without writing generated files.")
    parser.add_argument("--skip-download", action="store_true", help="Use the existing downloaded workbook.")
    parser.add_argument("--workbook", default=str(DEFAULT_WORKBOOK_PATH), help="Path to the supplemental xlsx workbook.")
    parser.add_argument("--log", default=str(DEFAULT_LOG_PATH), help="Path to write the import log JSON.")
    args = parser.parse_args()

    builder = load_builder_module()
    workbook_path = Path(args.workbook)
    if not args.skip_download:
        download_workbook(workbook_path)
    if not workbook_path.exists():
        raise FileNotFoundError(f"Supplemental workbook not found: {workbook_path}")

    snapshot = load_snapshot()
    log = apply_missing_players_backfill(snapshot, workbook_path, builder)
    summary = {
        "dryRun": args.dry_run,
        "playersAdded": log["playersAdded"],
        "playersSkippedExisting": log["playersSkippedExisting"],
        "playersSkippedDuplicateInSheet": log["playersSkippedDuplicateInSheet"],
        "playersSkippedInvalid": log["playersSkippedInvalid"],
        "sourceRowsAdded": log["sourceRowsAdded"],
        "sourceRowsSkippedExisting": log["sourceRowsSkippedExisting"],
        "sourceRowsSkippedInvalid": log["sourceRowsSkippedInvalid"],
        "playersWithSourceTotalMismatch": log["playersWithSourceTotalMismatch"],
        "individualWorldSourcesMovedToPrivate": log["individualWorldSourcesMovedToPrivate"],
        "privateSourceRowsMovedFromIndividualWorld": log["privateSourceRowsMovedFromIndividualWorld"],
        "privateSourceRowsAdded": log["privateSourceRowsAdded"],
        "remainingIndividualWorldSourcesRenamed": log["remainingIndividualWorldSourcesRenamed"],
        "corsariusSourcesRenamed": log["corsariusSourcesRenamed"],
        "corsariusRowsMoved": log["corsariusRowsMoved"],
        "corsariusRowsAddedFromScoreboard": log["corsariusRowsAddedFromScoreboard"],
        "corsariusBlockCorrections": log["corsariusBlockCorrections"],
        "corsariusPlayerTotalsUpdated": log["corsariusPlayerTotalsUpdated"],
        "sourceOnlyPlayersAddedToLeaderboard": log["sourceOnlyPlayersAddedToLeaderboard"],
        "aliasedDuplicateMainRowsRemoved": log["aliasedDuplicateMainRowsRemoved"],
        "aliasedDuplicateSourceRowsRemoved": log["aliasedDuplicateSourceRowsRemoved"],
        "aliasedDuplicateSourcesRemoved": log["aliasedDuplicateSourcesRemoved"],
        "importedPlayerKeys": len(log["importedPlayerKeys"]),
    }

    if not args.dry_run:
        write_snapshot(snapshot)
        log_path = Path(args.log)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text(json.dumps(log, indent=2), encoding="utf-8")

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
