from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import backend.database as legacy_db
from backend.api.routes import accounts, portfolio, tags, trades, ws
from backend.config import Settings
from backend.domain.protocols import TradingGateway
from backend.infrastructure.db.migrations import run_migrations
from backend.infrastructure.db.uow import SqliteUnitOfWork
from backend.mt5_service import MT5Service
from backend.services.live_broadcaster import ConnectionManager, run_live_broadcaster
from backend.services.sync_service import perform_sync


def create_app(
    settings: Settings | None = None,
    gateway: TradingGateway | None = None,
) -> FastAPI:
    """Create and configure the FastAPI application."""
    explicit_settings = settings is not None
    cfg = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        db_path = (
            cfg.db_path
            if explicit_settings
            else Path(legacy_db.DB_PATH)
        )
        with SqliteUnitOfWork(db_path) as uow:
            run_migrations(uow.conn)

        active_login = await asyncio.to_thread(
            perform_sync, db_path, app.state.mt5_gateway
        )
        if active_login is not None:
            app.state.active_login = active_login

        broadcast_task = asyncio.create_task(
            run_live_broadcaster(
                manager=app.state.ws_manager,
                gateway=app.state.mt5_gateway,
                db_path=db_path,
                interval_sec=cfg.broadcast_interval_sec,
                snapshot_interval_sec=cfg.snapshot_interval_sec,
            )
        )
        try:
            yield
        finally:
            broadcast_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await broadcast_task

    app = FastAPI(title="MT5 Portfolio Viewer API", lifespan=lifespan)
    app.state.settings = cfg
    app.state.explicit_settings = explicit_settings
    app.state.active_login = None
    app.state.ws_manager = ConnectionManager()
    app.state.mt5_gateway = gateway or MT5Service(
        use_simulation_if_offline=cfg.use_simulation_if_offline
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(accounts.router)
    app.include_router(portfolio.router)
    app.include_router(trades.router)
    app.include_router(tags.router)
    app.include_router(ws.router)

    frontend_dist = cfg.frontend_dist
    assets_dir = frontend_dist / "assets"
    if frontend_dist.exists():
        if assets_dir.exists():
            app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

        @app.get("/{full_path:path}")
        def serve_spa(full_path: str) -> FileResponse:
            target = frontend_dist / full_path
            if full_path and target.is_file():
                return FileResponse(str(target))
            return FileResponse(str(frontend_dist / "index.html"))

    return app
