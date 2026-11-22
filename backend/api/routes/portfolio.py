from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field

from backend.analytics import process_portfolio_analytics
from backend.api.deps import get_db_path, get_mt5_gateway
from backend.domain.protocols import TradingGateway
from backend.infrastructure.db.uow import SqliteUnitOfWork
from backend.services.analytics.benchmark import BarTimeframe, FallbackMode, SimulationMode
from backend.services.benchmark_service import execute_strategy_benchmark
from backend.services.sync_service import build_combined_account, perform_sync

router = APIRouter(prefix="/api", tags=["portfolio"])


@router.get("/portfolio")
def get_portfolio(
    request: Request,
    db_path: Annotated[Path, Depends(get_db_path)],
    gateway: Annotated[TradingGateway, Depends(get_mt5_gateway)],
    login: int | None = None,
    all_accounts: bool = False,
    timeframe: str = "all",
    symbol: str | None = None,
    direction: str | None = None,
    comment: str | None = None,
    magic: int | None = None,
    scope: str = "all",
    risk_pct: Annotated[float | None, Query(gt=0.0, le=1.0)] = None,
    setup_tag: str | None = None,
    exclude_mistakes: bool = False,
    revenge_window_min: Annotated[int, Query(ge=1, le=240)] = 30,
) -> dict[str, Any]:
    account_info: dict[str, Any] = {}
    deals: list[dict[str, Any]] = []
    notes_map: dict[int, dict[str, Any]] = {}
    need_sync = False
    target_login: int | None = None

    with SqliteUnitOfWork(db_path) as uow:
        accounts = uow.accounts.get_all()
        if accounts:
            if all_accounts:
                logins = [int(a["login"]) for a in accounts]
                deals = uow.deals.get_for_accounts(logins)
                notes_map = uow.journal.get_notes_for_accounts(logins)
                account_info = build_combined_account(accounts)
            else:
                target_login = login or request.app.state.active_login or int(accounts[0]["login"])
                account_info = uow.accounts.get_by_login(target_login) or {}
                deals = uow.deals.get_by_account(target_login)
                notes_map = uow.journal.get_notes_by_account(target_login)
                if not deals:
                    need_sync = True
        else:
            need_sync = True

    if need_sync:
        synced_login = perform_sync(db_path, gateway)
        if synced_login is not None and request.app.state.active_login is None:
            request.app.state.active_login = synced_login
        with SqliteUnitOfWork(db_path) as uow:
            accounts = uow.accounts.get_all()
            if all_accounts and accounts:
                logins = [int(a["login"]) for a in accounts]
                deals = uow.deals.get_for_accounts(logins)
                notes_map = uow.journal.get_notes_for_accounts(logins)
                account_info = build_combined_account(accounts)
            elif accounts:
                resolved_login = target_login or request.app.state.active_login or int(accounts[0]["login"])
                account_info = uow.accounts.get_by_login(resolved_login) or {}
                deals = uow.deals.get_by_account(resolved_login)
                notes_map = uow.journal.get_notes_by_account(resolved_login)

    start_time: int | None = None
    now_ts = int(time.time())
    tf_lower = timeframe.lower()
    if tf_lower == "7d":
        start_time = now_ts - 7 * 86400
    elif tf_lower == "1m":
        start_time = now_ts - 30 * 86400
    elif tf_lower == "3m":
        start_time = now_ts - 90 * 86400
    elif tf_lower == "1y":
        start_time = now_ts - 365 * 86400
    elif tf_lower == "ytd":
        start_time = int(datetime(datetime.now(UTC).year, 1, 1, tzinfo=UTC).timestamp())

    analytics = process_portfolio_analytics(
        deals=deals,
        current_account=account_info,
        start_time=start_time,
        default_risk_pct=risk_pct if risk_pct is not None else 0.01,
        trade_scope=scope,
        symbol=symbol,
        direction=direction,
        comment=comment,
        magic=magic,
        notes_map=notes_map,
        setup_tag=setup_tag,
        exclude_mistakes=exclude_mistakes,
        revenge_window_min=revenge_window_min,
    )

    for t in analytics.get("closed_trades", []):
        ticket_id = int(t.get("ticket", 0))
        note_obj = notes_map.get(ticket_id)
        if note_obj:
            t["note"] = note_obj.get("note", "")
            t["setup_tag"] = note_obj.get("setup_tag", "")
            t["mistake_tag"] = note_obj.get("mistake_tag", "")
            t["exit_tag"] = note_obj.get("exit_tag", "")
            t["entry_grade"] = note_obj.get("entry_grade", "")
            t["execution_grade"] = note_obj.get("execution_grade", "")
            t["management_grade"] = note_obj.get("management_grade", "")
        else:
            t["note"] = ""
            t["setup_tag"] = ""
            t["mistake_tag"] = ""
            t["exit_tag"] = ""
            t["entry_grade"] = ""
            t["execution_grade"] = ""
            t["management_grade"] = ""

    return {
        "account": account_info,
        "mt5_connected": gateway.is_connected(),
        **analytics,
    }


class BenchmarkRequest(BaseModel):
    login: int | None = None
    all_accounts: bool = False
    timeframe: str = "all"
    symbol: str | None = None
    direction: str | None = None
    comment: str | None = None
    magic: int | None = None
    scope: str = "all"
    risk_pct: float | None = Field(default=None, gt=0.0, le=1.0)
    setup_tag: str | None = None
    exclude_mistakes: bool = False
    horizon_bars: int = Field(default=30, ge=1, le=200)
    bar_tf: BarTimeframe = "m5"
    iterations: int = Field(default=1000, ge=100, le=5000)
    mode: SimulationMode = "coin_flip_direction"
    include_costs: bool = True
    fallback_mode: FallbackMode = "realized_1r"
    atr_mult: float = Field(default=1.5, ge=0.25, le=10.0)
    fixed_rr: float = Field(default=2.0, ge=0.25, le=20.0)
    seed: int | None = 42


@router.post("/portfolio/benchmark")
async def run_portfolio_benchmark(
    payload: BenchmarkRequest,
    request: Request,
    db_path: Annotated[Path, Depends(get_db_path)],
    gateway: Annotated[TradingGateway, Depends(get_mt5_gateway)],
) -> dict[str, Any]:
    active_login = getattr(request.app.state, "active_login", None)
    return await asyncio.to_thread(
        execute_strategy_benchmark,
        db_path,
        gateway,
        active_login=active_login,
        login=payload.login,
        all_accounts=payload.all_accounts,
        timeframe=payload.timeframe,
        symbol=payload.symbol,
        direction=payload.direction,
        comment=payload.comment,
        magic=payload.magic,
        scope=payload.scope,
        risk_pct=payload.risk_pct,
        setup_tag=payload.setup_tag,
        exclude_mistakes=payload.exclude_mistakes,
        horizon_bars=payload.horizon_bars,
        bar_tf=payload.bar_tf,
        iterations=payload.iterations,
        mode=payload.mode,
        include_costs=payload.include_costs,
        fallback_mode=payload.fallback_mode,
        atr_mult=payload.atr_mult,
        fixed_rr=payload.fixed_rr,
        seed=payload.seed,
    )
