from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any

ProfitCalcFn = Callable[[int, str, float, float, float], float | None]


def compute_1r_risk(
    deal: Mapping[str, Any],
    balance_at_entry: float,
    default_risk_pct: float = 0.01,
    profit_calc_fn: ProfitCalcFn | None = None,
) -> float:
    """Compute 1R (initial risk in account currency) for a trade.

    A valid initial Stop Loss must be strictly on the losing side of entry price:
      - BUY (type 0): sl < open_price
      - SELL (type 1): sl > open_price

    Falls back to Van Tharp fixed % risk model (default 1% of balance, floor $0.20)
    when no valid initial Stop Loss exists.
    """
    open_price = float(deal.get("open_price", 0.0) or deal.get("price", 0.0) or 0.0)
    sl = float(deal.get("sl", 0.0) or 0.0)
    pos_type = int(deal.get("type", 0) or 0)
    volume = float(deal.get("volume", 0.01) or 0.01)

    is_valid_initial_sl = False
    diff = 0.0
    if sl > 0 and open_price > 0:
        if pos_type == 0 and sl < open_price - 1e-5:
            is_valid_initial_sl = True
            diff = open_price - sl
        elif pos_type == 1 and sl > open_price + 1e-5:
            is_valid_initial_sl = True
            diff = sl - open_price

    existing_risk = deal.get("risk_r", 0.0)
    if is_valid_initial_sl and existing_risk and float(existing_risk) > 0.01:
        return round(float(existing_risk), 2)

    symbol = str(deal.get("symbol", "")).upper()
    if is_valid_initial_sl and open_price > 0 and diff > 1e-6:
        if profit_calc_fn is not None:
            sl_profit = profit_calc_fn(pos_type, symbol, volume, open_price, sl)
            if sl_profit is not None and abs(sl_profit) > 0.01:
                return round(abs(float(sl_profit)), 2)

        close_price = float(deal.get("price", 0.0) or 0.0)
        net_profit = float(deal.get("profit", 0.0) or 0.0)
        price_diff = abs(close_price - open_price)
        if price_diff > 1e-6 and abs(net_profit) > 1e-4:
            val_per_point = abs(net_profit) / price_diff
            risk = diff * val_per_point
            if risk > 0.01:
                return round(risk, 2)

        if "JPY" in symbol:
            derived_risk = (diff / 0.01) * volume * 1000.0 / 150.0
        elif any(c in symbol for c in ("EUR", "USD", "GBP", "CHF", "AUD", "NZD", "CAD")):
            derived_risk = diff * volume * 100000.0
        elif "XAU" in symbol:
            derived_risk = diff * volume * 100.0
        else:
            derived_risk = diff * volume * 1.1
        if derived_risk > 0.01:
            return round(derived_risk, 2)

    fallback_risk = max(0.20, round(balance_at_entry * default_risk_pct, 2))
    return round(fallback_risk, 2)
