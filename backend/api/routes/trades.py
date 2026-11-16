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
) -> StatusResponse:
    with SqliteUnitOfWork(db_path) as uow:
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
