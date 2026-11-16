from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from pathlib import Path
from typing import Any

from fastapi import WebSocket

from backend.domain.protocols import TradingGateway
from backend.infrastructure.db.uow import SqliteUnitOfWork

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket clients safely."""

    def __init__(self) -> None:
        self._clients: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        with contextlib.suppress(ValueError):
            self._clients.remove(websocket)

    @property
    def has_clients(self) -> bool:
        return bool(self._clients)

    async def broadcast_json(self, payload: dict[str, Any]) -> None:
        dead: list[WebSocket] = []
        for client in list(self._clients):
            try:
                await client.send_json(payload)
            except Exception:
                dead.append(client)
        for client in dead:
            self.disconnect(client)


def _poll_live_snapshot(
    gateway: TradingGateway,
    db_path: Path,
    should_persist_snapshot: bool,
) -> dict[str, Any] | None:
    """Blocking MT5 + SQLite poll executed off the asyncio event loop."""
    is_conn = gateway.is_connected()
    acc_info = gateway.get_account_info()
    if not acc_info:
        return None
    open_pos = gateway.get_open_positions()
    now_ts = int(time.time())
    if should_persist_snapshot:
        with SqliteUnitOfWork(db_path) as uow:
            uow.snapshots.append(
                int(acc_info["login"]),
                {
                    "timestamp": now_ts,
                    "balance": acc_info["balance"],
                    "equity": acc_info["equity"],
                    "growth_pct": 0.0,
                    "drawdown_pct": 0.0,
                    "cumulative_r": 0.0,
                },
            )
    return {
        "type": "live_update",
        "timestamp": now_ts,
        "mt5_connected": is_conn,
        "account": acc_info,
        "open_positions": open_pos,
    }


async def run_live_broadcaster(
    manager: ConnectionManager,
    gateway: TradingGateway,
    db_path: Path,
    interval_sec: float = 1.0,
    snapshot_interval_sec: int = 60,
) -> None:
    """Background loop that offloads MT5/SQLite I/O to a worker thread and broadcasts at 1Hz."""
    last_snapshot_time = 0
    while True:
        try:
            now_ts = int(time.time())
            should_persist = (now_ts - last_snapshot_time) >= snapshot_interval_sec
            if manager.has_clients or should_persist:
                payload = await asyncio.to_thread(
                    _poll_live_snapshot, gateway, db_path, should_persist
                )
                if payload is not None:
                    if should_persist:
                        last_snapshot_time = now_ts
                    if manager.has_clients:
                        await manager.broadcast_json(payload)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Broadcaster error: %s", exc)
        await asyncio.sleep(interval_sec)
