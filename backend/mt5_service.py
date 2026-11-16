from __future__ import annotations

from typing import Any

from backend.infrastructure.mt5.gateway import LiveMT5Gateway
from backend.infrastructure.mt5.simulator import SimulatedMT5Gateway


class MT5Service:
    """Facade combining LiveMT5Gateway with SimulatedMT5Gateway fallback."""

    def __init__(self, use_simulation_if_offline: bool = True) -> None:
        self.use_simulation_if_offline = use_simulation_if_offline
        self._live = LiveMT5Gateway()
        self._sim = SimulatedMT5Gateway()

    @property
    def connected(self) -> bool:
        return self._live.connected

    @property
    def active_account_id(self) -> int | None:
        return self._live.active_account_id

    def initialize_mt5(self) -> bool:
        return self._live.initialize_mt5()

    def shutdown(self) -> None:
        self._live.shutdown()

    def is_connected(self) -> bool:
        return self._live.is_connected()

    def get_account_info(self) -> dict[str, Any] | None:
        info = self._live.get_account_info()
        if info is not None:
            return info
        return self._sim.get_account_info() if self.use_simulation_if_offline else None

    def get_open_positions(self) -> list[dict[str, Any]]:
        if self._live.is_connected():
            return self._live.get_open_positions()
        return self._sim.get_open_positions() if self.use_simulation_if_offline else []

    def get_history_deals(self, from_timestamp: int = 0) -> list[dict[str, Any]]:
        if self._live.is_connected():
            return self._live.get_history_deals(from_timestamp)
        return self._sim.get_history_deals(from_timestamp) if self.use_simulation_if_offline else []

    def get_trade_mtf_candles(
        self,
        symbol: str,
        open_time: int,
        close_time: int,
        bars_before: int = 80,
        bars_after: int = 30,
        max_bars: int = 2500,
        timeframes: list[str] | None = None,
    ) -> dict[str, list[dict[str, Any]]]:
        if self._live.is_connected():
            return self._live.get_trade_mtf_candles(
                symbol=symbol,
                open_time=open_time,
                close_time=close_time,
                bars_before=bars_before,
                bars_after=bars_after,
                max_bars=max_bars,
                timeframes=timeframes,
            )
        return self._sim.get_trade_mtf_candles(symbol, open_time, close_time, timeframes)


mt5_service = MT5Service()
