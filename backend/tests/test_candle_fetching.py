from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest.mock import patch

from backend.infrastructure.db.migrations import run_migrations
from backend.infrastructure.db.uow import SqliteUnitOfWork
from backend.infrastructure.mt5.gateway import LiveMT5Gateway
from backend.services.candle_service import get_or_fetch_trade_candles


def test_live_gateway_fetches_exact_pre_entry_bars_across_weekend() -> None:
    gw = LiveMT5Gateway()
    gw.connected = True

    open_ts = 1794830280  # Monday 2026-11-16 11:58 UTC
    close_ts = 1794830880  # Monday 2026-11-16 12:08 UTC

    # Simulate 80 trading bars before open_ts (spanning Friday -> Monday)
    pre_bars = [
        {"time": open_ts - (80 - i) * 3600, "open": 1.0, "high": 1.1, "low": 0.9, "close": 1.05}
        for i in range(80)
    ]
    post_bars = [
        {"time": open_ts + i * 3600, "open": 1.05, "high": 1.15, "low": 0.95, "close": 1.1}
        for i in range(10)
    ]

    with (
        patch("backend.infrastructure.mt5.gateway.mt5.account_info", return_value=object()),
        patch("backend.infrastructure.mt5.gateway.mt5.symbol_select", return_value=True),
        patch("backend.infrastructure.mt5.gateway.mt5.copy_rates_from", return_value=pre_bars) as m_from,
        patch("backend.infrastructure.mt5.gateway.mt5.copy_rates_range", return_value=post_bars),
    ):
        res = gw.get_trade_mtf_candles(
            symbol=".DE40Cash",
            open_time=open_ts,
            close_time=close_ts,
            bars_before=80,
            bars_after=30,
            timeframes=["h1"],
        )

    assert m_from.called
    assert len(res["h1"]) == 90
    times = [b["time"] for b in res["h1"]]
    assert times == sorted(set(times))


class _FakeConnectedGateway:
    def __init__(self, connected: bool, fetched_bars: list[dict[str, Any]]) -> None:
        self._connected = connected
        self._bars = fetched_bars
        self.fetch_calls = 0

    def initialize_mt5(self) -> bool:
        return self._connected

    def shutdown(self) -> None:
        return None

    def is_connected(self) -> bool:
        return self._connected

    def get_account_info(self) -> dict[str, Any] | None:
        return None

    def get_open_positions(self) -> list[dict[str, Any]]:
        return []

    def get_history_deals(self, from_timestamp: int = 0) -> list[dict[str, Any]]:
        return []

    def get_trade_mtf_candles(
        self,
        symbol: str,
        open_time: int,
        close_time: int,
        timeframes: list[str] | None = None,
    ) -> dict[str, list[dict[str, Any]]]:
        self.fetch_calls += 1
        return {tf: list(self._bars) for tf in (timeframes or ["h1", "m5", "m1"])}


def test_candle_service_auto_refreshes_short_cached_tfs_when_connected(tmp_path: Path) -> None:
    db_path = tmp_path / "candles.db"
    with SqliteUnitOfWork(db_path) as uow:
        run_migrations(uow.conn)
        uow.accounts.upsert({"login": 1, "broker": "B", "name": "A", "server": "S"})
        uow.deals.upsert_many(
            [
                {
                    "ticket": 9001,
                    "account_id": 1,
                    "symbol": ".DE40Cash",
                    "open_time": 1700000000,
                    "time": 1700000600,
                    "entry": 1,
                }
            ]
        )
        short_bars = [{"time": 1700000000 + i * 3600, "open": 1, "high": 1, "low": 1, "close": 1} for i in range(21)]
        full_bars = [{"time": 1700000000 + i * 60, "open": 1, "high": 1, "low": 1, "close": 1} for i in range(110)]
        uow.candles.upsert(9001, "h1", short_bars, cached_at=100)
        uow.candles.upsert(9001, "m5", short_bars, cached_at=100)
        uow.candles.upsert(9001, "m1", full_bars, cached_at=100)

    # Offline: returns cached short bars without failing
    offline_gw = _FakeConnectedGateway(connected=False, fetched_bars=[])
    res_offline = get_or_fetch_trade_candles(db_path, offline_gw, 9001)
    assert res_offline is not None
    assert len(res_offline["h1"]) == 21
    assert offline_gw.fetch_calls == 0

    # Connected: auto-refreshes short h1/m5 (< 80 bars)
    refreshed = [{"time": 1700000000 + i * 300, "open": 1, "high": 1, "low": 1, "close": 1} for i in range(95)]
    online_gw = _FakeConnectedGateway(connected=True, fetched_bars=refreshed)
    res_online = get_or_fetch_trade_candles(db_path, online_gw, 9001)
    assert res_online is not None
    assert online_gw.fetch_calls == 1
    assert len(res_online["h1"]) == 95
    assert len(res_online["m5"]) == 95
    assert len(res_online["m1"]) == 110
