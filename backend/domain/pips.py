from __future__ import annotations

from collections.abc import Mapping
from typing import Any

_FX_CURRENCIES = ("EUR", "USD", "GBP", "CHF", "AUD", "NZD", "CAD")
_INDEX_TOKENS = ("DE40", "GER40", "US30", "US500", "SPX", "NAS100", "USTEC", "UK100", "JP225")


def get_pip_size(symbol: str, reference_price: float = 0.0) -> float:
    """Return canonical pip/point size for an instrument symbol."""
    upper = symbol.upper()
    if "JPY" in upper:
        return 0.01
    if any(c in upper for c in _FX_CURRENCIES) and "XAU" not in upper and "BTC" not in upper and "ETH" not in upper:
        return 0.0001
    if "XAU" in upper or "GOLD" in upper:
        return 0.1
    if any(idx in upper for idx in _INDEX_TOKENS):
        return 1.0
    if "BTC" in upper or "ETH" in upper:
        return 1.0
    if reference_price > 0:
        price_str = f"{reference_price:.6f}".rstrip("0")
        decimals = len(price_str.split(".")[1]) if "." in price_str else 2
        if decimals in (2, 3):
            return 0.01
        if decimals >= 4:
            return 0.0001
    return 1.0


def calculate_trade_pips(deal: Mapping[str, Any]) -> float:
    """Calculate gain/loss in pips or points for a trade deal."""
    if "pips" in deal and deal["pips"] is not None and abs(float(deal["pips"])) > 1e-4:
        return round(float(deal["pips"]), 1)

    symbol = str(deal.get("symbol", "")).upper()
    open_price = float(deal.get("open_price", 0.0) or 0.0)
    close_price = float(deal.get("price", 0.0) or 0.0)
    deal_type = int(deal.get("type", 0) or 0)

    if open_price <= 0 or close_price <= 0:
        vol = float(deal.get("volume", 0.01) or 0.01)
        net_profit = float(deal.get("profit", 0.0) or 0.0)
        return round(net_profit / max(0.1, vol * 10.0), 1)

    pip_size = get_pip_size(symbol, open_price)
    price_diff = (close_price - open_price) if deal_type == 0 else (open_price - close_price)
    return round(price_diff / pip_size, 1)
