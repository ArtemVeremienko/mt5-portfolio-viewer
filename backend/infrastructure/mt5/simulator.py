from __future__ import annotations

import random
import time
from datetime import UTC, datetime, timedelta
from typing import Any


class SimulatedMT5Gateway:
    """Deterministic offline MT5 gateway implementing TradingGateway."""

    SIM_LOGIN = 12289277

    def __init__(self, seed: int = 42) -> None:
        self._seed = seed

    def initialize_mt5(self) -> bool:
        return False

    def shutdown(self) -> None:
        return None

    def is_connected(self) -> bool:
        return False

    def get_account_info(self) -> dict[str, Any] | None:
        return {
            "login": self.SIM_LOGIN,
            "broker": "Simulated Demo (Offline)",
            "name": "Sample Quantitative Portfolio",
            "server": "Simulation-Offline",
            "currency": "USD",
            "leverage": 500,
            "balance": 24850.75,
            "equity": 25120.40,
            "margin": 612.30,
            "free_margin": 24508.10,
            "margin_level": 4102.63,
            "is_demo": 1,
            "last_synced_at": int(time.time()),
            "is_simulation": True,
        }

    def get_open_positions(self) -> list[dict[str, Any]]:
        now = int(time.time())
        rng = random.Random(now // 5)
        eur_fl = round(rng.uniform(45.0, 185.0), 2)
        gold_fl = round(rng.uniform(80.0, 260.0), 2)
        return [
            {
                "ticket": 9812401,
                "time": now - 3600 * 4,
                "type": 0,
                "type_str": "BUY",
                "symbol": "EURUSD",
                "volume": 0.50,
                "open_price": 1.08420,
                "current_price": round(1.08420 + (eur_fl / 5000.0), 5),
                "sl": 1.08050,
                "tp": 1.09200,
                "profit": eur_fl,
                "swap": -2.40,
                "comment": "Algo_Breakout_V2",
            },
            {
                "ticket": 9812402,
                "time": now - 3600 * 18,
                "type": 0,
                "type_str": "BUY",
                "symbol": "XAUUSD",
                "volume": 0.20,
                "open_price": 2724.50,
                "current_price": round(2724.50 + (gold_fl / 20.0), 2),
                "sl": 2705.00,
                "tp": 2760.00,
                "profit": gold_fl,
                "swap": -6.15,
                "comment": "GoldTrend_H4",
            },
        ]

    def get_history_deals(self, from_timestamp: int = 0) -> list[dict[str, Any]]:
        deals: list[dict[str, Any]] = []
        sim_acc = self.SIM_LOGIN
        start_date = datetime.now(tz=UTC) - timedelta(days=120)
        start_ts = int(start_date.timestamp())

        deals.append(
            {
                "ticket": 1000001,
                "order_id": 1000001,
                "account_id": sim_acc,
                "time": start_ts,
                "time_msc": start_ts * 1000,
                "type": 2,
                "entry": 0,
                "symbol": "",
                "volume": 0.0,
                "price": 0.0,
                "profit": 10000.0,
                "swap": 0.0,
                "commission": 0.0,
                "sl": 0.0,
                "tp": 0.0,
                "open_time": start_ts,
                "open_price": 0.0,
                "comment": "Deposit initial capital",
                "magic": 0,
                "risk_r": 0.0,
                "r_multiple": 0.0,
            }
        )

        mid_ts = start_ts + (86400 * 45)
        deals.append(
            {
                "ticket": 1000050,
                "order_id": 1000050,
                "account_id": sim_acc,
                "time": mid_ts,
                "time_msc": mid_ts * 1000,
                "type": 2,
                "entry": 0,
                "symbol": "",
                "volume": 0.0,
                "price": 0.0,
                "profit": 5000.0,
                "swap": 0.0,
                "commission": 0.0,
                "sl": 0.0,
                "tp": 0.0,
                "open_time": mid_ts,
                "open_price": 0.0,
                "comment": "Deposit additional capital",
                "magic": 0,
                "risk_r": 0.0,
                "r_multiple": 0.0,
            }
        )

        symbols = ["EURUSD", "GBPUSD", "XAUUSD", "USDJPY", "AUDUSD", "EURJPY"]
        sym_prices = {
            "EURUSD": 1.0850,
            "GBPUSD": 1.2980,
            "XAUUSD": 2715.0,
            "USDJPY": 152.40,
            "AUDUSD": 0.6580,
            "EURJPY": 165.20,
        }

        rng = random.Random(self._seed)
        curr_ts = start_ts + 86400
        end_ts = int(time.time()) - 3600
        ticket_id = 1000002

        while curr_ts < end_ts:
            curr_ts += rng.randint(14400, 86400)
            if curr_ts >= end_ts:
                break

            sym = rng.choice(symbols)
            base_p = sym_prices[sym]
            deal_type = rng.choice([0, 1])
            vol = round(rng.choice([0.1, 0.2, 0.3, 0.5, 0.75, 1.0]), 2)

            is_win = rng.random() < 0.64
            if is_win:
                r_mult = round(rng.triangular(0.5, 4.5, 1.8), 2)
            else:
                r_mult = round(rng.triangular(-1.2, 0.0, -0.9), 2)

            risk_1r = round(120.0 * (vol / 0.5), 2)
            profit = round(risk_1r * r_mult, 2)
            swap = round(rng.uniform(-4.5, 1.2), 2)
            commission = round(-3.5 * vol, 2)

            sl_distance = (
                (risk_1r / (vol * 100000))
                if "XAU" not in sym
                else (risk_1r / (vol * 100))
            )
            if deal_type == 0:
                open_p = base_p
                sl_p = round(base_p - sl_distance, 5)
                tp_p = round(base_p + (sl_distance * 2.0), 5)
                close_p = round(open_p + (sl_distance * r_mult), 5)
            else:
                open_p = base_p
                sl_p = round(base_p + sl_distance, 5)
                tp_p = round(base_p - (sl_distance * 2.0), 5)
                close_p = round(open_p - (sl_distance * r_mult), 5)

            if is_win:
                mae_r = round(rng.triangular(0.1, 0.65, 0.3), 2)
                mfe_r = round(max(r_mult, r_mult * rng.uniform(1.05, 1.35)), 2)
            else:
                mae_r = round(rng.triangular(0.8, 1.25, 1.0), 2)
                mfe_r = round(rng.triangular(0.05, 0.45, 0.15), 2)

            mae_amt = round(mae_r * risk_1r, 2)
            mfe_amt = round(mfe_r * risk_1r, 2)
            mae_pips_val = round((mae_amt / max(1.0, vol * 10.0)), 1)
            mfe_pips_val = round((mfe_amt / max(1.0, vol * 10.0)), 1)

            deals.append(
                {
                    "ticket": ticket_id,
                    "order_id": ticket_id + 50000,
                    "account_id": sim_acc,
                    "time": curr_ts,
                    "time_msc": curr_ts * 1000,
                    "type": deal_type,
                    "entry": 1,
                    "symbol": sym,
                    "volume": vol,
                    "price": close_p,
                    "profit": profit,
                    "swap": swap,
                    "commission": commission,
                    "sl": sl_p,
                    "tp": tp_p,
                    "open_time": curr_ts - rng.randint(1800, 28800),
                    "open_price": open_p,
                    "comment": rng.choice(
                        ["TrendFollow_M15", "Breakout_H1", "MeanReversion", ""]
                    ),
                    "magic": 0,
                    "risk_r": risk_1r,
                    "r_multiple": r_mult,
                    "mae_price": round(sl_distance * mae_r, 5),
                    "mfe_price": round(sl_distance * mfe_r, 5),
                    "mae_pips": mae_pips_val,
                    "mfe_pips": mfe_pips_val,
                    "mae_amount": mae_amt,
                    "mfe_amount": mfe_amt,
                    "mae_r": mae_r,
                    "mfe_r": mfe_r,
                }
            )
            ticket_id += 1

        if from_timestamp > 0:
            return [d for d in deals if int(d["time"]) >= from_timestamp]
        return deals

    def get_trade_mtf_candles(
        self,
        symbol: str,
        open_time: int,
        close_time: int,
        timeframes: list[str] | None = None,
    ) -> dict[str, list[dict[str, Any]]]:
        return {"h1": [], "m5": [], "m1": []}

    def get_symbol_candles_range(
        self,
        symbol: str,
        timeframe: str,
        from_ts: int,
        to_ts: int,
    ) -> list[dict[str, Any]]:
        """Generate deterministic synthetic OHLC bars for offline simulation/testing."""
        if not symbol or from_ts <= 0 or to_ts <= from_ts:
            return []
        step_map = {"h1": 3600, "m5": 300, "m1": 60}
        step = step_map.get(timeframe.lower(), 300)
        max_bars = 5000
        total_steps = min(max_bars, max(1, (to_ts - from_ts) // step))
        base = 2650.0 if "XAU" in symbol.upper() else (150.0 if "JPY" in symbol.upper() else 1.0900)
        vol = 2.5 if "XAU" in symbol.upper() else (0.12 if "JPY" in symbol.upper() else 0.0005)

        rng = random.Random(f"{self._seed}:{symbol}:{timeframe}:{from_ts}")
        bars: list[dict[str, Any]] = []
        price = base
        for i in range(total_steps):
            ts = from_ts + i * step
            delta = rng.gauss(0.0, vol)
            o = price
            c = max(1e-5, o + delta)
            wick_up = abs(rng.gauss(0.0, vol * 0.6))
            wick_dn = abs(rng.gauss(0.0, vol * 0.6))
            h = max(o, c) + wick_up
            low_p = max(1e-5, min(o, c) - wick_dn)
            bars.append(
                {
                    "time": ts,
                    "open": round(o, 5),
                    "high": round(h, 5),
                    "low": round(low_p, 5),
                    "close": round(c, 5),
                }
            )
            price = c
        return bars
