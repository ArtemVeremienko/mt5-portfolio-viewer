from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from backend.api.deps import get_db_path, get_mt5_gateway
from backend.api.schemas import AccountsResponse, SwitchAccountResponse, SyncResponse
from backend.domain.protocols import TradingGateway
from backend.infrastructure.db.uow import SqliteUnitOfWork
from backend.services.sync_service import perform_sync

router = APIRouter(prefix="/api", tags=["accounts"])


@router.get("/accounts", response_model=AccountsResponse)
def list_accounts(
    request: Request,
    db_path: Annotated[Path, Depends(get_db_path)],
    gateway: Annotated[TradingGateway, Depends(get_mt5_gateway)],
) -> AccountsResponse:
    with SqliteUnitOfWork(db_path) as uow:
        accounts = uow.accounts.get_all()
    if not accounts:
        synced_login = perform_sync(db_path, gateway)
        if synced_login is not None:
            request.app.state.active_login = synced_login
        with SqliteUnitOfWork(db_path) as uow:
            accounts = uow.accounts.get_all()

    active_login: int | None = request.app.state.active_login
    if active_login is None and accounts:
        active_login = int(accounts[0]["login"])
        request.app.state.active_login = active_login

    return AccountsResponse(
        accounts=accounts,
        active_login=active_login,
        mt5_connected=gateway.is_connected(),
    )


@router.post("/accounts/switch", response_model=SwitchAccountResponse)
def switch_account(request: Request, login: int) -> SwitchAccountResponse:
    request.app.state.active_login = login
    return SwitchAccountResponse(status="ok", active_login=login)


@router.post("/sync", response_model=SyncResponse)
def force_sync(
    request: Request,
    db_path: Annotated[Path, Depends(get_db_path)],
    gateway: Annotated[TradingGateway, Depends(get_mt5_gateway)],
) -> SyncResponse:
    synced_login = perform_sync(db_path, gateway)
    if synced_login is not None:
        request.app.state.active_login = synced_login
    return SyncResponse(status="synced", synced_login=synced_login)
