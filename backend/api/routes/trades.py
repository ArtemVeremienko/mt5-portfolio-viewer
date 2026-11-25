from __future__ import annotations

import time
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from backend.api.deps import get_db_path, get_mt5_gateway
from backend.api.schemas import (
    OpenTradesResponse,
    StatusResponse,
    TradeCandlesResponse,
    TradeNotePayload,
)
from backend.domain.protocols import TradingGateway
from backend.domain.risk import compute_1r_risk, is_valid_losing_sl
from backend.infrastructure.db.uow import SqliteUnitOfWork
from backend.services.candle_service import get_or_fetch_trade_candles

router = APIRouter(prefix="/api", tags=["trades"])


@router.get("/trades/open", response_model=OpenTradesResponse)
def get_open_trades(
    gateway: Annotated[TradingGateway, Depends(get_mt5_gateway)],
) -> OpenTradesResponse:
    return OpenTradesResponse(positions=gateway.get_open_positions())


@router.post("/trades/note", response_model=StatusResponse)
def save_trade_note(
    payload: TradeNotePayload,
    db_path: Annotated[Path, Depends(get_db_path)],
    gateway: Annotated[TradingGateway, Depends(get_mt5_gateway)],
) -> StatusResponse:
    clean_initial_sl: float | None = (
        round(float(payload.initial_sl), 5)
        if payload.initial_sl is not None and payload.initial_sl > 0
        else None
    )
    computed_initial_risk_r: float | None = None

    with SqliteUnitOfWork(db_path) as uow:
        if clean_initial_sl is not None:
            deal = uow.deals.get_by_ticket(payload.ticket)
            if deal is not None:
                pos_type = int(deal.get("type", 0) or 0)
                open_price = float(deal.get("open_price", 0.0) or deal.get("price", 0.0) or 0.0)
                if open_price > 0 and not is_valid_losing_sl(pos_type, open_price, clean_initial_sl):
                    side_hint = "below" if pos_type == 0 else "above"
                    raise HTTPException(
                        status_code=422,
                        detail=(
                            f"Initial SL ({clean_initial_sl}) must be strictly {side_hint} "
                            f"entry price ({open_price})."
                        ),
                    )
                risk_deal = {
                    **deal,
                    "sl": clean_initial_sl,
                    "risk_r": 0.0,
                }
                computed_initial_risk_r = compute_1r_risk(
                    risk_deal,
                    balance_at_entry=100.0,
                    profit_calc_fn=gateway.calculate_order_profit,
                )

        uow.journal.upsert_note(
            ticket=payload.ticket,
            account_id=payload.account_id,
            note=payload.note,
            setup_tag=payload.setup_tag,
            mistake_tag=payload.mistake_tag,
            exit_tag=payload.exit_tag,
            entry_grade=payload.entry_grade,
            execution_grade=payload.execution_grade,
            management_grade=payload.management_grade,
            initial_sl=clean_initial_sl,
            initial_risk_r=computed_initial_risk_r,
            updated_at=int(time.time()),
        )
    return StatusResponse(status="ok")


@router.get("/trades/{ticket}/candles", response_model=TradeCandlesResponse)
def get_trade_candles_endpoint(
    ticket: int,
    db_path: Annotated[Path, Depends(get_db_path)],
    gateway: Annotated[TradingGateway, Depends(get_mt5_gateway)],
    refresh: bool = False,
) -> TradeCandlesResponse:
    result = get_or_fetch_trade_candles(db_path, gateway, ticket, refresh=refresh)
    if result is None:
        raise HTTPException(status_code=404, detail="Trade not found or missing open time")
    return TradeCandlesResponse(**result)
