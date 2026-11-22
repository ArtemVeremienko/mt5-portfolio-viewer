from __future__ import annotations

import re
from typing import Any

from backend.infrastructure.db.migrations import parse_tag_list

_AUTO_SL_TP_RE = re.compile(r"^\[(sl|tp)\s+[\d.]+\]$", re.IGNORECASE)


def extract_journal_filter_options(
    notes_map: dict[int, dict[str, Any]] | None,
) -> tuple[list[str], list[str]]:
    """Extract sorted unique setup and mistake tags from trade notes."""
    if not notes_map:
        return [], []
    setups: dict[str, str] = {}
    mistakes: dict[str, str] = {}
    for note in notes_map.values():
        for tag in parse_tag_list(note.get("setup_tag")):
            setups.setdefault(tag.lower(), tag)
        for tag in parse_tag_list(note.get("mistake_tag")):
            mistakes.setdefault(tag.lower(), tag)
    return sorted(setups.values(), key=str.lower), sorted(mistakes.values(), key=str.lower)


def format_duration(seconds: int) -> str:
    """Format duration seconds into human-readable string (e.g. '4m', '2h 15m', '3d 4h')."""
    if seconds < 60:
        return f"{seconds}s"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}m"
    hours = minutes // 60
    rem_min = minutes % 60
    if hours < 24:
        return f"{hours}h {rem_min}m" if rem_min > 0 else f"{hours}h"
    days = hours // 24
    rem_hr = hours % 24
    return f"{days}d {rem_hr}h" if rem_hr > 0 else f"{days}d"


def extract_filter_options(
    deals: list[dict[str, Any]],
) -> tuple[list[str], list[str], list[int]]:
    """Extract sorted unique symbols, clean comments, and magic numbers across all deals."""
    available_symbols = sorted(
        {
            str(x.get("symbol", "")).strip()
            for x in deals
            if x.get("entry") in (1, 2) and x.get("type") in (0, 1) and x.get("symbol")
        }
    )
    available_comments = sorted(
        {
            str(x.get("comment", "")).strip()
            for x in deals
            if x.get("entry") in (1, 2)
            and x.get("type") in (0, 1)
            and x.get("comment")
            and not _AUTO_SL_TP_RE.match(str(x.get("comment", "")).strip())
        }
    )
    available_magics = sorted(
        {
            int(x.get("magic", 0) or 0)
            for x in deals
            if x.get("entry") in (1, 2)
            and x.get("type") in (0, 1)
            and int(x.get("magic", 0) or 0) > 0
        }
    )
    return available_symbols, available_comments, available_magics


def filter_and_scope_deals(
    deals: list[dict[str, Any]],
    start_time: int | None = None,
    end_time: int | None = None,
    trade_scope: str = "all",
    symbol: str | None = None,
    direction: str | None = None,
    comment: str | None = None,
    magic: int | None = None,
    notes_map: dict[int, dict[str, Any]] | None = None,
    setup_tag: str | None = None,
    exclude_mistakes: bool = False,
) -> tuple[list[dict[str, Any]], dict[int, float], float, int]:
    """Filter deals by time/attributes/journal tags/scope and return (scoped_deals, entry_fees, scope_bal, avail_count)."""
    dir_filter = direction.upper().strip() if direction else None
    sym_filter = symbol.upper().strip() if symbol else None
    cmt_filter = comment.lower().strip() if comment else None
    setup_filter = setup_tag.lower().strip() if setup_tag else None
    notes_lookup = notes_map or {}

    filtered: list[dict[str, Any]] = []
    for d in deals:
        t = int(d.get("time", 0) or 0)
        if start_time and t < start_time:
            continue
        if end_time and t > end_time:
            continue
        if d.get("type") != 2 and d.get("entry") in (1, 2):
            if sym_filter and str(d.get("symbol", "")).upper() != sym_filter:
                continue
            if dir_filter == "BUY" and int(d.get("type", 0) or 0) != 0:
                continue
            if dir_filter == "SELL" and int(d.get("type", 0) or 0) != 1:
                continue
            if cmt_filter and cmt_filter not in str(d.get("comment", "")).lower():
                continue
            if magic is not None and int(d.get("magic", 0) or 0) != magic:
                continue
            if setup_filter or exclude_mistakes:
                ticket = int(d.get("ticket", 0) or 0)
                note = notes_lookup.get(ticket, {})
                if setup_filter:
                    deal_setups = {s.lower() for s in parse_tag_list(note.get("setup_tag"))}
                    if setup_filter not in deal_setups:
                        continue
                if exclude_mistakes and parse_tag_list(note.get("mistake_tag")):
                    continue
        filtered.append(d)

    filtered.sort(key=lambda x: (x.get("time", 0), x.get("time_msc", 0)))

    all_closed = [x for x in filtered if x.get("entry") in (1, 2) and x.get("type") in (0, 1)]
    available_closed_count = len(all_closed)

    entry_fees_by_pos: dict[int, float] = {}
    for x in filtered:
        if x.get("entry") == 0 and x.get("type") in (0, 1):
            pid = int(x.get("position_id", 0) or 0)
            if pid > 0:
                entry_fees_by_pos[pid] = entry_fees_by_pos.get(pid, 0.0) + float(
                    x.get("commission", 0.0) or 0.0
                )

    scope_starting_balance = 0.0
    if trade_scope == "last100" and available_closed_count > 100:
        first_100_time = int(all_closed[-100].get("time", 0) or 0)
        target_closed_tickets = {x["ticket"] for x in all_closed[-100:]}
        for x in filtered:
            if x.get("ticket") in target_closed_tickets:
                break
            if x.get("type") == 2:
                scope_starting_balance += float(x.get("profit", 0.0) or 0.0)
            elif x.get("entry") in (1, 2) and x.get("type") in (0, 1):
                pid = int(x.get("position_id", 0) or 0)
                in_comm = entry_fees_by_pos.get(pid, 0.0)
                scope_starting_balance += (
                    float(x.get("profit", 0.0) or 0.0)
                    + float(x.get("swap", 0.0) or 0.0)
                    + float(x.get("commission", 0.0) or 0.0)
                    + in_comm
                )
        filtered = [
            x
            for x in filtered
            if (x.get("type") == 2 and int(x.get("time", 0) or 0) >= first_100_time)
            or x.get("ticket") in target_closed_tickets
        ]
    elif trade_scope == "last100" and available_closed_count > 0:
        target_closed_tickets = {x["ticket"] for x in all_closed[-100:]}
        filtered = [
            x
            for x in filtered
            if x.get("type") == 2 or x.get("ticket") in target_closed_tickets
        ]

    return filtered, entry_fees_by_pos, scope_starting_balance, available_closed_count
