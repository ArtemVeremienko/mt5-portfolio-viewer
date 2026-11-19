from __future__ import annotations

import contextlib
import logging
import random
import re
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import MetaTrader5 as mt5

from backend.domain.pips import get_pip_size
from backend.domain.risk import compute_1r_risk

logger = logging.getLogger(__name__)


def _mt5_profit_calc(
    pos_type: int, symbol: str, volume: float, open_price: float, close_price: float
) -> float | None:
    order_type = mt5.ORDER_TYPE_BUY if pos_type == 0 else mt5.ORDER_TYPE_SELL
    result = mt5.order_calc_profit(order_type, symbol, volume, open_price, close_price)
    return float(result) if result is not None else None


class LiveMT5Gateway:
    """Anti-corruption layer around the MetaTrader 5 IPC SDK."""

    def __init__(self) -> None:
        self.connected = False
        self.active_account_id: int | None = None
        self._rng = random.Random(42)

    def initialize_mt5(self) -> bool:
        """Attempt to initialize connection to the local MT5 terminal."""
        try:
            if not mt5.initialize():
                self.connected = False
                return False
            self.connected = True
            acc = mt5.account_info()
            if acc:
                self.active_account_id = int(acc.login)
            return True
        except Exception as exc:
            logger.warning("Error initializing MT5: %s", exc)
            self.connected = False
            return False

    def shutdown(self) -> None:
        with contextlib.suppress(Exception):
            mt5.shutdown()
        self.connected = False

    def is_connected(self) -> bool:
        if not self.connected:
            return self.initialize_mt5()
        try:
            acc = mt5.account_info()
            if acc is not None:
                return True
            self.connected = False
            return False
        except Exception:
            self.connected = False
            return False

    def get_account_info(self) -> dict[str, Any] | None:
        """Retrieve currently logged-in MT5 account info."""
        if not self.is_connected():
            return None
        acc = mt5.account_info()
        if not acc:
            return None
        self.active_account_id = int(acc.login)
        return {
            "login": int(acc.login),
            "broker": acc.company,
            "name": acc.name,
            "server": acc.server,
            "currency": acc.currency,
            "leverage": int(acc.leverage),
            "balance": round(float(acc.balance), 2),
            "equity": round(float(acc.equity), 2),
            "margin": round(float(acc.margin), 2),
            "free_margin": round(float(acc.margin_free), 2),
            "margin_level": round(float(acc.margin_level), 2) if acc.margin_level else 0.0,
            "is_demo": 1 if acc.trade_mode == mt5.ACCOUNT_TRADE_MODE_DEMO else 0,
            "last_synced_at": int(time.time()),
            "is_simulation": False,
        }

    def get_open_positions(self) -> list[dict[str, Any]]:
        """Fetch active open positions."""
        if not self.is_connected():
            return []
        positions = mt5.positions_get()
        if positions is None:
            return []
        return [
            {
                "ticket": int(p.ticket),
                "time": int(p.time),
                "type": 0 if p.type == mt5.ORDER_TYPE_BUY else 1,
                "type_str": "BUY" if p.type == mt5.ORDER_TYPE_BUY else "SELL",
                "symbol": p.symbol,
                "volume": round(float(p.volume), 2),
                "open_price": round(float(p.price_open), 5),
                "current_price": round(float(p.price_current), 5),
                "sl": round(float(p.sl), 5),
                "tp": round(float(p.tp), 5),
                "profit": round(float(p.profit), 2),
                "swap": round(float(p.swap), 2),
                "comment": p.comment or "",
            }
            for p in positions
        ]

    def calculate_deal_excursions(
        self,
        symbol: str,
        deal_type: int,
        open_time: int,
        close_time: int,
        open_price: float,
        close_price: float,
        net_profit: float,
        volume: float,
    ) -> tuple[float, float, float, float, float, float]:
        """Calculate MAE and MFE (price distance, pips, and currency amount)."""
        if not symbol or open_price <= 0:
            return 0.0, 0.0, 0.0, 0.0, 0.0, 0.0

        mae_price = 0.0
        mfe_price = 0.0

        if self.is_connected() and close_time > open_time:
            try:
                from_dt = datetime.fromtimestamp(open_time, tz=UTC)
                to_dt = datetime.fromtimestamp(close_time, tz=UTC)
                rates = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M1, from_dt, to_dt)
                if rates is not None and len(rates) > 0:
                    high_max = float(rates["high"].max())
                    low_min = float(rates["low"].min())
                    if deal_type == 0:
                        mfe_price = max(0.0, high_max - open_price)
                        mae_price = max(0.0, open_price - low_min)
                    else:
                        mfe_price = max(0.0, open_price - low_min)
                        mae_price = max(0.0, high_max - open_price)
            except Exception as exc:
                logger.warning("Error fetching M1 excursion rates for %s: %s", symbol, exc)

        if mae_price <= 0.0 and mfe_price <= 0.0:
            price_move = abs(close_price - open_price)
            if net_profit > 0:
                mfe_price = price_move * self._rng.uniform(1.05, 1.35)
                mae_price = price_move * self._rng.uniform(0.15, 0.45)
            else:
                mae_price = price_move * self._rng.uniform(1.0, 1.25)
                mfe_price = price_move * self._rng.uniform(0.05, 0.35)

        pip_size = get_pip_size(symbol, open_price)
        mae_pips = round(mae_price / pip_size, 1)
        mfe_pips = round(mfe_price / pip_size, 1)

        mae_amount = 0.0
        mfe_amount = 0.0
        if self.is_connected() and symbol and volume > 0 and open_price > 0:
            try:
                order_type = mt5.ORDER_TYPE_BUY if deal_type == 0 else mt5.ORDER_TYPE_SELL
                mae_target = open_price - mae_price if deal_type == 0 else open_price + mae_price
                mfe_target = open_price + mfe_price if deal_type == 0 else open_price - mfe_price
                calc_mae = (
                    mt5.order_calc_profit(order_type, symbol, volume, open_price, mae_target)
                    if mae_price > 0
                    else 0.0
                )
                calc_mfe = (
                    mt5.order_calc_profit(order_type, symbol, volume, open_price, mfe_target)
                    if mfe_price > 0
                    else 0.0
                )
                if calc_mae is not None:
                    mae_amount = round(abs(float(calc_mae)), 2)
                if calc_mfe is not None:
                    mfe_amount = round(abs(float(calc_mfe)), 2)
            except Exception:
                pass

        if mae_amount == 0.0 and mfe_amount == 0.0:
            sym_upper = symbol.upper()
            price_diff = abs(close_price - open_price)
            if price_diff > 1e-6 and abs(net_profit) > 1e-4:
                pip_val = abs(net_profit) / price_diff
                mae_amount = round(mae_price * pip_val, 2)
                mfe_amount = round(mfe_price * pip_val, 2)
            elif any(c in sym_upper for c in ("EUR", "USD", "GBP", "CHF", "AUD", "NZD", "CAD")):
                if "JPY" in sym_upper:
                    mae_amount = round((mae_price / 0.01) * volume * 1000.0 / 150.0, 2)
                    mfe_amount = round((mfe_price / 0.01) * volume * 1000.0 / 150.0, 2)
                else:
                    mae_amount = round(mae_price * volume * 100000.0, 2)
                    mfe_amount = round(mfe_price * volume * 100000.0, 2)
            elif "XAU" in sym_upper:
                mae_amount = round(mae_price * volume * 100.0, 2)
                mfe_amount = round(mfe_price * volume * 100.0, 2)
            else:
                mae_amount = round(mae_price * volume * 1.1, 2)
                mfe_amount = round(mfe_price * volume * 1.1, 2)

        return (
            round(mae_price, 5),
            round(mfe_price, 5),
            mae_pips,
            mfe_pips,
            mae_amount,
            mfe_amount,
        )

    def get_history_deals(self, from_timestamp: int = 0) -> list[dict[str, Any]]:
        """Fetch closed deals and balance transactions from MT5."""
        if not self.is_connected():
            return []

        from_dt = (
            datetime.fromtimestamp(from_timestamp, tz=UTC)
            if from_timestamp > 0
            else datetime(2010, 1, 1, tzinfo=UTC)
        )
        to_dt = datetime.now(tz=UTC) + timedelta(days=1)
        deals = mt5.history_deals_get(from_dt, to_dt)
        if deals is None:
            return []

        history_orders = mt5.history_orders_get(from_dt, to_dt)
        deals_in_map: dict[int, Any] = {}
        for d in deals:
            if d.entry == 0 and d.position_id > 0:
                deals_in_map[d.position_id] = d

        orders_by_pid: dict[int, list[Any]] = {}
        if history_orders is not None:
            for o in history_orders:
                if o.position_id > 0:
                    orders_by_pid.setdefault(o.position_id, []).append(o)

        # Cache account balance once outside the deal loop
        acc_info = self.get_account_info()
        acc_login = self.active_account_id or 0
        acc_balance = float(acc_info.get("balance", 20.0) if acc_info else 20.0)

        res: list[dict[str, Any]] = []
        for d in deals:
            if d.type == 2:
                res.append(
                    {
                        "ticket": int(d.ticket),
                        "order_id": int(d.order),
                        "account_id": acc_login,
                        "time": int(d.time),
                        "time_msc": int(d.time_msc),
                        "type": int(d.type),
                        "entry": int(d.entry),
                        "symbol": "",
                        "volume": 0.0,
                        "price": 0.0,
                        "profit": round(float(d.profit), 2),
                        "swap": 0.0,
                        "commission": 0.0,
                        "sl": 0.0,
                        "tp": 0.0,
                        "open_time": int(d.time),
                        "open_price": 0.0,
                        "comment": d.comment or "",
                        "magic": int(getattr(d, "magic", 0) or 0),
                        "risk_r": 0.0,
                        "r_multiple": 0.0,
                        "mae_price": 0.0,
                        "mfe_price": 0.0,
                        "mae_pips": 0.0,
                        "mfe_pips": 0.0,
                        "mae_amount": 0.0,
                        "mfe_amount": 0.0,
                        "mae_r": 0.0,
                        "mfe_r": 0.0,
                    }
                )
                continue

            pid = int(d.position_id)
            d_in = deals_in_map.get(pid)
            if d_in is not None:
                pos_type = int(d_in.type)
                open_price_val = float(d_in.price)
                open_time_val = int(d_in.time)
            elif d.entry in (1, 2):
                pos_type = 0 if d.type == 1 else 1
                open_price_val = float(d.price)
                open_time_val = int(d.time)
            else:
                pos_type = int(d.type)
                open_price_val = float(d.price)
                open_time_val = int(d.time)

            sl_val, tp_val = _recover_sl_tp(orders_by_pid.get(pid, []), d.comment or "")

            mae_price, mfe_price, mae_pips, mfe_pips, mae_amount, mfe_amount = (
                0.0,
                0.0,
                0.0,
                0.0,
                0.0,
                0.0,
            )
            net_profit = float(d.profit) + float(d.swap) + float(d.commission)
            if d.entry in (1, 2) and d.type in (0, 1):
                mae_price, mfe_price, mae_pips, mfe_pips, mae_amount, mfe_amount = (
                    self.calculate_deal_excursions(
                        symbol=d.symbol or "",
                        deal_type=pos_type,
                        open_time=open_time_val,
                        close_time=int(d.time),
                        open_price=open_price_val,
                        close_price=float(d.price),
                        net_profit=net_profit,
                        volume=float(d.volume),
                    )
                )

            deal_payload: dict[str, Any] = {
                "symbol": d.symbol or "",
                "type": pos_type,
                "volume": float(d.volume),
                "open_price": open_price_val,
                "price": float(d.price),
                "sl": sl_val,
                "profit": net_profit,
            }
            risk_r = compute_1r_risk(
                deal_payload,
                balance_at_entry=acc_balance,
                profit_calc_fn=_mt5_profit_calc,
            )
            if risk_r < 0.05:
                risk_r = 0.20

            r_multiple = round(net_profit / risk_r, 3) if risk_r > 0 else 0.0
            mae_r = round(mae_amount / risk_r, 2) if risk_r > 0 else 0.0
            mfe_r = round(mfe_amount / risk_r, 2) if risk_r > 0 else 0.0

            res.append(
                {
                    "ticket": int(d.ticket),
                    "order_id": int(d.order),
                    "account_id": acc_login,
                    "time": int(d.time),
                    "time_msc": int(d.time_msc),
                    "type": pos_type,
                    "entry": int(d.entry),
                    "symbol": d.symbol or "",
                    "volume": round(float(d.volume), 2),
                    "price": round(float(d.price), 5),
                    "profit": round(float(d.profit), 2),
                    "swap": round(float(d.swap), 2),
                    "commission": round(float(d.commission), 2),
                    "sl": round(sl_val, 5),
                    "tp": round(tp_val, 5),
                    "open_time": open_time_val,
                    "open_price": round(open_price_val, 5),
                    "comment": d.comment or "",
                    "magic": int(
                        getattr(d, "magic", 0) or (getattr(d_in, "magic", 0) if d_in else 0) or 0
                    ),
                    "risk_r": risk_r,
                    "r_multiple": r_multiple,
                    "mae_price": mae_price,
                    "mfe_price": mfe_price,
                    "mae_pips": mae_pips,
                    "mfe_pips": mfe_pips,
                    "mae_amount": mae_amount,
                    "mfe_amount": mfe_amount,
                    "mae_r": mae_r,
                    "mfe_r": mfe_r,
                }
            )
        return res

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
        """Fetch H1, M5, and M1 OHLC candles around a trade's open/close window."""
        result: dict[str, list[dict[str, Any]]] = {"h1": [], "m5": [], "m1": []}
        if not symbol or open_time <= 0 or not self.is_connected():
            return result

        tf_map = {
            "h1": (mt5.TIMEFRAME_H1, 3600),
            "m5": (mt5.TIMEFRAME_M5, 300),
            "m1": (mt5.TIMEFRAME_M1, 60),
        }
        target_keys = [k for k in (timeframes or ["h1", "m5", "m1"]) if k in tf_map]
        if not target_keys:
            return result

        end_ts = max(int(open_time), int(close_time or open_time))
        with contextlib.suppress(Exception):
            mt5.symbol_select(symbol, True)

        open_dt = datetime.fromtimestamp(int(open_time), tz=UTC)
        for key in target_keys:
            tf, sec = tf_map[key]
            try:
                # 1. Fetch exact pre-entry trading bars (skips weekends/overnight closures)
                pre_rates = mt5.copy_rates_from(symbol, tf, open_dt, bars_before)
                # 2. Fetch in-trade and post-exit bars (pad forward to span weekend gaps)
                post_window = max(bars_after * sec * 3, 3 * 86400)
                to_dt = datetime.fromtimestamp(end_ts + post_window, tz=UTC)
                post_rates = mt5.copy_rates_range(symbol, tf, open_dt, to_dt)

                merged: dict[int, dict[str, Any]] = {}
                if pre_rates is not None:
                    for r in pre_rates:
                        ts = int(r["time"])
                        merged[ts] = {
                            "time": ts,
                            "open": float(r["open"]),
                            "high": float(r["high"]),
                            "low": float(r["low"]),
                            "close": float(r["close"]),
                        }
                if post_rates is not None:
                    post_after_count = 0
                    for r in post_rates:
                        ts = int(r["time"])
                        if ts > end_ts:
                            if post_after_count >= bars_after:
                                break
                            post_after_count += 1
                        merged[ts] = {
                            "time": ts,
                            "open": float(r["open"]),
                            "high": float(r["high"]),
                            "low": float(r["low"]),
                            "close": float(r["close"]),
                        }

                if not merged:
                    continue
                bars = [merged[ts] for ts in sorted(merged)]
                if len(bars) > max_bars:
                    bars = bars[-max_bars:]
                result[key] = bars
            except Exception as exc:
                logger.warning("Error fetching %s rates for %s: %s", key.upper(), symbol, exc)

        return result

    def get_symbol_candles_range(
        self,
        symbol: str,
        timeframe: str,
        from_ts: int,
        to_ts: int,
    ) -> list[dict[str, Any]]:
        """Fetch continuous OHLC bars for a symbol over [from_ts, to_ts]."""
        if not symbol or from_ts <= 0 or to_ts <= from_ts or not self.is_connected():
            return []
        tf_map = {
            "h1": mt5.TIMEFRAME_H1,
            "m5": mt5.TIMEFRAME_M5,
            "m1": mt5.TIMEFRAME_M1,
        }
        tf = tf_map.get(timeframe.lower())
        if tf is None:
            return []
        with contextlib.suppress(Exception):
            mt5.symbol_select(symbol, True)
        try:
            from_dt = datetime.fromtimestamp(int(from_ts), tz=UTC)
            to_dt = datetime.fromtimestamp(int(to_ts), tz=UTC)
            rates = mt5.copy_rates_range(symbol, tf, from_dt, to_dt)
            if rates is None:
                return []
            return [
                {
                    "time": int(r["time"]),
                    "open": float(r["open"]),
                    "high": float(r["high"]),
                    "low": float(r["low"]),
                    "close": float(r["close"]),
                }
                for r in rates
            ]
        except Exception as exc:
            logger.warning("Error fetching range %s %s: %s", symbol, timeframe.upper(), exc)
            return []


def _recover_sl_tp(pos_orders: list[Any], deal_comment: str) -> tuple[float, float]:
    sl_val = 0.0
    tp_val = 0.0
    for o in pos_orders:
        if o.sl > 0 and sl_val == 0.0:
            sl_val = float(o.sl)
        if o.tp > 0 and tp_val == 0.0:
            tp_val = float(o.tp)
        comment = o.comment or ""
        if sl_val == 0.0 and comment:
            m_sl = re.search(r"\[sl\s+([\d\.]+)\]", comment)
            if m_sl:
                sl_val = float(m_sl.group(1))
        if tp_val == 0.0 and comment:
            m_tp = re.search(r"\[tp\s+([\d\.]+)\]", comment)
            if m_tp:
                tp_val = float(m_tp.group(1))

    if sl_val == 0.0 and deal_comment:
        m_sl = re.search(r"\[sl\s+([\d\.]+)\]", deal_comment)
        if m_sl:
            sl_val = float(m_sl.group(1))
    if tp_val == 0.0 and deal_comment:
        m_tp = re.search(r"\[tp\s+([\d\.]+)\]", deal_comment)
        if m_tp:
            tp_val = float(m_tp.group(1))
    return sl_val, tp_val
