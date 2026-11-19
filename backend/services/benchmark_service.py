from __future__ import annotations

import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from backend.analytics import process_portfolio_analytics
from backend.domain.protocols import TradingGateway
from backend.infrastructure.db.uow import SqliteUnitOfWork
from backend.services.analytics.benchmark import (
    BarTimeframe,
    FallbackMode,
    SimulationMode,
    run_coin_flip_monte_carlo,
)
from backend.services.candle_service import get_or_fetch_trade_candles
from backend.services.sync_service import build_combined_account


def _resolve_start_time(timeframe: str) -> int | None:
    now_ts = int(time.time())
    tf_lower = timeframe.lower()
    if tf_lower == "7d":
        return now_ts - 7 * 86400
    if tf_lower == "1m":
        return now_ts - 30 * 86400
    if tf_lower == "3m":
        return now_ts - 90 * 86400
    if tf_lower == "1y":
        return now_ts - 365 * 86400
    if tf_lower == "ytd":
        return int(datetime(datetime.now(UTC).year, 1, 1, tzinfo=UTC).timestamp())
    return None


def execute_strategy_benchmark(
    db_path: Path,
    gateway: TradingGateway,
    *,
    active_login: int | None = None,
    login: int | None = None,
    all_accounts: bool = False,
    timeframe: str = "all",
    symbol: str | None = None,
    direction: str | None = None,
    comment: str | None = None,
    magic: int | None = None,
    scope: str = "all",
    risk_pct: float | None = None,
    horizon_bars: int = 30,
    bar_tf: BarTimeframe = "m5",
    iterations: int = 1000,
    mode: SimulationMode = "coin_flip_direction",
    include_costs: bool = True,
    fallback_mode: FallbackMode = "realized_1r",
    atr_mult: float = 1.5,
    fixed_rr: float = 2.0,
    seed: int | None = 42,
) -> dict[str, Any]:
    """Load scoped trades & OHLC candles and run the coin-flip Monte Carlo benchmark."""
    account_info: dict[str, Any] = {}
    deals: list[dict[str, Any]] = []

    with SqliteUnitOfWork(db_path) as uow:
        accounts = uow.accounts.get_all()
        if accounts:
            if all_accounts:
                logins = [int(a["login"]) for a in accounts]
                deals = uow.deals.get_for_accounts(logins)
                account_info = build_combined_account(accounts)
            else:
                target_login = login or active_login or int(accounts[0]["login"])
                account_info = uow.accounts.get_by_login(target_login) or {}
                deals = uow.deals.get_by_account(target_login)

    effective_risk_pct = risk_pct if risk_pct is not None else 0.01
    analytics = process_portfolio_analytics(
        deals=deals,
        current_account=account_info,
        start_time=_resolve_start_time(timeframe),
        default_risk_pct=effective_risk_pct,
        trade_scope=scope,
        symbol=symbol,
        direction=direction,
        comment=comment,
        magic=magic,
    )
    closed_trades: list[dict[str, Any]] = analytics.get("closed_trades", [])

    candles_by_ticket: dict[int, dict[str, list[dict[str, Any]]]] = {}
    missing_tickets: list[int] = []

    with SqliteUnitOfWork(db_path) as uow:
        for t in closed_trades:
            ticket = int(t.get("ticket") or 0)
            if ticket <= 0:
                continue
            cached = uow.candles.get_by_ticket(ticket)
            if cached.get(bar_tf):
                candles_by_ticket[ticket] = cached
            else:
                missing_tickets.append(ticket)

    if missing_tickets and gateway.is_connected():
        # Fetch missing trade candles when MT5 is connected (cap to avoid long blocking)
        for ticket in missing_tickets[:150]:
            fetched = get_or_fetch_trade_candles(db_path, gateway, ticket, refresh=False)
            if fetched and fetched.get(bar_tf):
                candles_by_ticket[ticket] = {
                    "h1": fetched.get("h1", []),
                    "m5": fetched.get("m5", []),
                    "m1": fetched.get("m1", []),
                }

    symbol_candles_by_symbol: dict[str, list[dict[str, Any]]] = {}
    if mode == "random_session" and closed_trades:
        sym_ranges: dict[str, tuple[int, int]] = {}
        for t in closed_trades:
            sym = str(t.get("symbol") or "")
            if not sym:
                continue
            o_ts = int(t.get("open_time") or t.get("time") or 0)
            c_ts = int(t.get("time") or o_ts)
            if o_ts <= 0:
                continue
            cur = sym_ranges.get(sym)
            if cur is None:
                sym_ranges[sym] = (o_ts, c_ts)
            else:
                sym_ranges[sym] = (min(cur[0], o_ts), max(cur[1], c_ts))

        for sym, (min_o, max_c) in sym_ranges.items():
            req_from = max(1, min_o - 7 * 86400)
            req_to = max_c + 86400
            with SqliteUnitOfWork(db_path) as uow:
                cached_sym = uow.symbol_candles.get(sym, bar_tf)
            if (
                cached_sym
                and cached_sym["candles"]
                and cached_sym["from_ts"] <= min_o
                and cached_sym["to_ts"] >= max_c
            ):
                symbol_candles_by_symbol[sym] = cached_sym["candles"]
            else:
                fetched_sym = gateway.get_symbol_candles_range(sym, bar_tf, req_from, req_to)
                if fetched_sym:
                    with SqliteUnitOfWork(db_path) as uow:
                        uow.symbol_candles.upsert(
                            sym, bar_tf, req_from, req_to, fetched_sym, cached_at=int(time.time())
                        )
                    symbol_candles_by_symbol[sym] = fetched_sym
                elif cached_sym and cached_sym["candles"]:
                    symbol_candles_by_symbol[sym] = cached_sym["candles"]

    return run_coin_flip_monte_carlo(
        trades=closed_trades,
        candles_by_ticket=candles_by_ticket,
        iterations=iterations,
        horizon_bars=horizon_bars,
        timeframe=bar_tf,
        mode=mode,
        include_costs=include_costs,
        fallback_mode=fallback_mode,
        atr_mult=atr_mult,
        fixed_rr=fixed_rr,
        current_risk_pct=round(effective_risk_pct * 100.0, 2),
        seed=seed,
        symbol_candles_by_symbol=symbol_candles_by_symbol,
    )
