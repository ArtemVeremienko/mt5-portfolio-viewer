from __future__ import annotations

from pathlib import Path
from typing import cast

from fastapi import Request

import backend.database as legacy_db
from backend.config import Settings
from backend.domain.protocols import TradingGateway
from backend.infrastructure.db.uow import SqliteUnitOfWork
from backend.services.live_broadcaster import ConnectionManager


def get_settings(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


def get_db_path(request: Request) -> Path:
    settings = get_settings(request)
    if getattr(request.app.state, "explicit_settings", False):
        return settings.db_path
    return Path(legacy_db.DB_PATH)


def get_uow(request: Request) -> SqliteUnitOfWork:
    return SqliteUnitOfWork(get_db_path(request))


def get_mt5_gateway(request: Request) -> TradingGateway:
    return cast(TradingGateway, request.app.state.mt5_gateway)


def get_ws_manager(request: Request) -> ConnectionManager:
    return cast(ConnectionManager, request.app.state.ws_manager)
