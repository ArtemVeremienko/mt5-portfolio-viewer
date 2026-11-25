from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class TradingGateway(Protocol):
    """Anti-corruption port for MetaTrader 5 terminal or simulator."""

    def initialize_mt5(self) -> bool: ...
    def shutdown(self) -> None: ...
    def is_connected(self) -> bool: ...
    def get_account_info(self) -> dict[str, Any] | None: ...
    def get_open_positions(self) -> list[dict[str, Any]]: ...
    def get_history_deals(self, from_timestamp: int = 0) -> list[dict[str, Any]]: ...
    def get_trade_mtf_candles(
        self,
        symbol: str,
        open_time: int,
        close_time: int,
        timeframes: list[str] | None = None,
    ) -> dict[str, list[dict[str, Any]]]: ...
    def get_symbol_candles_range(
        self,
        symbol: str,
        timeframe: str,
        from_ts: int,
        to_ts: int,
    ) -> list[dict[str, Any]]: ...
    def calculate_order_profit(
        self,
        pos_type: int,
        symbol: str,
        volume: float,
        open_price: float,
        close_price: float,
    ) -> float | None: ...
