from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from backend.domain.protocols import TradingGateway
from backend.infrastructure.db.uow import SqliteUnitOfWork

_MIN_EXPECTED_BARS = 80


def get_or_fetch_trade_candles(
    db_path: Path,
    gateway: TradingGateway,
    ticket: int,
    refresh: bool = False,
) -> dict[str, Any] | None:
    """Cache-aside retrieval of H1/M5/M1 OHLC candles for a trade ticket."""
    with SqliteUnitOfWork(db_path) as uow:
        cached = uow.candles.get_by_ticket(ticket)
        has_all = all(len(cached.get(tf, [])) > 0 for tf in ("h1", "m5", "m1"))
        short_tfs = [
            tf for tf in ("h1", "m5", "m1") if len(cached.get(tf, [])) < _MIN_EXPECTED_BARS
        ]
        should_auto_refresh = bool(short_tfs) and gateway.is_connected()
        if has_all and not refresh and not should_auto_refresh:
            return {
                "ticket": ticket,
                "cached": True,
                "h1": cached["h1"],
                "m5": cached["m5"],
                "m1": cached["m1"],
            }
        deal = uow.deals.get_by_ticket(ticket)

    if not deal:
        if any(len(v) > 0 for v in cached.values()):
            return {
                "ticket": ticket,
                "cached": True,
                "h1": cached.get("h1", []),
                "m5": cached.get("m5", []),
                "m1": cached.get("m1", []),
            }
        return None

    symbol = str(deal.get("symbol") or "")
    open_time = int(deal.get("open_time") or deal.get("time") or 0)
    close_time = int(deal.get("time") or open_time)
    if not symbol or open_time <= 0:
        return None

    if refresh:
        missing_tfs = ["h1", "m5", "m1"]
    else:
        empty_tfs = {tf for tf in ("h1", "m5", "m1") if len(cached.get(tf, [])) == 0}
        if should_auto_refresh:
            empty_tfs.update(short_tfs)
        missing_tfs = [tf for tf in ("h1", "m5", "m1") if tf in empty_tfs]
    fetched = (
        gateway.get_trade_mtf_candles(
            symbol=symbol,
            open_time=open_time,
            close_time=close_time,
            timeframes=missing_tfs,
        )
        if missing_tfs
        else {}
    )

    now_ts = int(time.time())
    merged: dict[str, list[dict[str, Any]]] = {}
    with SqliteUnitOfWork(db_path) as uow:
        for tf in ("h1", "m5", "m1"):
            bars = fetched.get(tf) or []
            if bars:
                uow.candles.upsert(ticket, tf, bars, cached_at=now_ts)
                merged[tf] = bars
            else:
                merged[tf] = cached.get(tf, [])

    return {
        "ticket": ticket,
        "cached": False,
        "h1": merged["h1"],
        "m5": merged["m5"],
        "m1": merged["m1"],
    }
