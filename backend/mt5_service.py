import os
import time
import random
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional, Tuple
import MetaTrader5 as mt5

class MT5Service:
    def __init__(self):
        self.connected = False
        self.last_sync_time = 0
        self.active_account_id = None
        self.use_simulation_if_offline = True

    def initialize_mt5(self) -> bool:
        """Attempts to initialize connection to MT5 terminal."""
        try:
            if not mt5.initialize():
                self.connected = False
                return False
            self.connected = True
            acc = mt5.account_info()
            if acc:
                self.active_account_id = acc.login
            return True
        except Exception as e:
            print(f"[MT5Service] Error initializing MT5: {e}")
            self.connected = False
            return False

    def shutdown(self):
        try:
            mt5.shutdown()
        except Exception:
            pass
        self.connected = False

    def is_connected(self) -> bool:
        if not self.connected:
            return self.initialize_mt5()
        # Verify terminal still responds
        try:
            acc = mt5.account_info()
            if acc is not None:
                return True
            self.connected = False
            return False
        except Exception:
            self.connected = False
            return False

    def get_account_info(self) -> Optional[Dict[str, Any]]:
        """Retrieves currently logged in MT5 account info."""
        if self.is_connected():
            acc = mt5.account_info()
            if acc:
                return {
                    "login": acc.login,
                    "broker": acc.company,
                    "name": acc.name,
                    "server": acc.server,
                    "currency": acc.currency,
                    "leverage": acc.leverage,
                    "balance": round(acc.balance, 2),
                    "equity": round(acc.equity, 2),
                    "margin": round(acc.margin, 2),
                    "free_margin": round(acc.margin_free, 2),
                    "margin_level": round(acc.margin_level, 2) if acc.margin_level else 0.0,
                    "is_demo": 1 if acc.trade_mode == mt5.ACCOUNT_TRADE_MODE_DEMO else 0,
                    "last_synced_at": int(time.time()),
                    "is_simulation": False
                }
        
        # If offline and simulation enabled, return simulated Prime-Net portfolio account
        if self.use_simulation_if_offline:
            return self._get_simulated_account()
        return None

    def get_open_positions(self) -> List[Dict[str, Any]]:
        """Fetches active open trades."""
        if self.is_connected():
            positions = mt5.positions_get()
            if positions is not None:
                res = []
                for p in positions:
                    res.append({
                        "ticket": p.ticket,
                        "time": p.time,
                        "type": 0 if p.type == mt5.ORDER_TYPE_BUY else 1,
                        "type_str": "BUY" if p.type == mt5.ORDER_TYPE_BUY else "SELL",
                        "symbol": p.symbol,
                        "volume": round(p.volume, 2),
                        "open_price": round(p.price_open, 5),
                        "current_price": round(p.price_current, 5),
                        "sl": round(p.sl, 5),
                        "tp": round(p.tp, 5),
                        "profit": round(p.profit, 2),
                        "swap": round(p.swap, 2),
                        "comment": p.comment or ""
                    })
                return res

        if self.use_simulation_if_offline:
            return self._get_simulated_open_positions()
        return []

    def get_history_deals(self, from_timestamp: int = 0) -> List[Dict[str, Any]]:
        """Fetches closed deals and balance transactions from MT5."""
        if self.is_connected():
            from_dt = datetime.fromtimestamp(from_timestamp, tz=timezone.utc) if from_timestamp > 0 else datetime(2010, 1, 1, tzinfo=timezone.utc)
            to_dt = datetime.now(tz=timezone.utc) + timedelta(days=1)
            deals = mt5.history_deals_get(from_dt, to_dt)
            if deals is not None:
                res = []
                # Map orders to get initial SL/TP
                orders_map = {}
                history_orders = mt5.history_orders_get(from_dt, to_dt)
                if history_orders is not None:
                    for o in history_orders:
                        orders_map[o.ticket] = (o.price_open, o.sl, o.tp)

                acc_login = self.active_account_id or 0
                for d in deals:
                    sl_val = 0.0
                    tp_val = 0.0
                    open_price_val = d.price
                    if d.order in orders_map:
                        op, sl_val, tp_val = orders_map[d.order]
                        if op > 0:
                            open_price_val = op

                    res.append({
                        "ticket": d.ticket,
                        "order_id": d.order,
                        "account_id": acc_login,
                        "time": d.time,
                        "time_msc": d.time_msc,
                        "type": d.type, # 0=BUY, 1=SELL, 2=BALANCE
                        "entry": d.entry, # 0=IN, 1=OUT, 2=INOUT
                        "symbol": d.symbol or "",
                        "volume": round(d.volume, 2),
                        "price": round(d.price, 5),
                        "profit": round(d.profit, 2),
                        "swap": round(d.swap, 2),
                        "commission": round(d.commission, 2),
                        "sl": round(sl_val, 5),
                        "tp": round(tp_val, 5),
                        "open_time": d.time,
                        "open_price": round(open_price_val, 5),
                        "comment": d.comment or "",
                        "risk_r": 0.0,
                        "r_multiple": 0.0
                    })
                return res

        if self.use_simulation_if_offline:
            return self._get_simulated_deals()
        return []

    # -------------------------------------------------------------
    # Simulated realistic MT5 Dataset (Prime-Net reference analog)
    # -------------------------------------------------------------
    def _get_simulated_account(self) -> Dict[str, Any]:
        sim_login = 12289277
        return {
            "login": sim_login,
            "broker": "IC Markets (Live)",
            "name": "Prime-Net Quantitative Portfolio",
            "server": "ICMarketsSC-Live02",
            "currency": "USD",
            "leverage": 500,
            "balance": 24850.75,
            "equity": 25120.40,
            "margin": 612.30,
            "free_margin": 24508.10,
            "margin_level": 4102.63,
            "is_demo": 0,
            "last_synced_at": int(time.time()),
            "is_simulation": True
        }

    def _get_simulated_open_positions(self) -> List[Dict[str, Any]]:
        # Fluctuates slightly for live WebSocket demonstration
        now = int(time.time())
        eur_fl = round(random.uniform(45.0, 185.0), 2)
        gold_fl = round(random.uniform(80.0, 260.0), 2)
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
                "comment": "Algo_Breakout_V2"
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
                "comment": "GoldTrend_H4"
            }
        ]

    def _get_simulated_deals(self) -> List[Dict[str, Any]]:
        """Generates 120+ authentic historical deals spanning several months."""
        deals = []
        sim_acc = 12289277
        start_date = datetime.now(tz=timezone.utc) - timedelta(days=120)
        start_ts = int(start_date.timestamp())
        
        # Initial Deposit deal
        deals.append({
            "ticket": 1000001,
            "order_id": 1000001,
            "account_id": sim_acc,
            "time": start_ts,
            "time_msc": start_ts * 1000,
            "type": 2, # Balance deposit
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
            "risk_r": 0.0,
            "r_multiple": 0.0
        })

        # Mid-way deposit
        mid_ts = start_ts + (86400 * 45)
        deals.append({
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
            "risk_r": 0.0,
            "r_multiple": 0.0
        })

        symbols = ["EURUSD", "GBPUSD", "XAUUSD", "USDJPY", "AUDUSD", "EURJPY"]
        sym_prices = {
            "EURUSD": 1.0850, "GBPUSD": 1.2980, "XAUUSD": 2715.0,
            "USDJPY": 152.40, "AUDUSD": 0.6580, "EURJPY": 165.20
        }
        
        random.seed(42) # Reproducible, realistic trading distribution
        curr_ts = start_ts + 86400
        end_ts = int(time.time()) - 3600
        
        ticket_id = 1000002
        while curr_ts < end_ts:
            curr_ts += random.randint(14400, 86400) # Every 4h to 24h
            if curr_ts >= end_ts:
                break
            
            sym = random.choice(symbols)
            base_p = sym_prices[sym]
            deal_type = random.choice([0, 1]) # BUY or SELL
            vol = round(random.choice([0.1, 0.2, 0.3, 0.5, 0.75, 1.0]), 2)
            
            # Win rate ~ 64% with positive asymmetry (high R wins)
            is_win = random.random() < 0.64
            if is_win:
                r_mult = round(random.triangular(0.5, 4.5, 1.8), 2)
            else:
                r_mult = round(random.triangular(-1.2, 0.0, -0.9), 2)
                
            # Assume 1R ~ $100 to $180
            risk_1r = round(120.0 * (vol / 0.5), 2)
            profit = round(risk_1r * r_mult, 2)
            swap = round(random.uniform(-4.5, 1.2), 2)
            commission = round(-3.5 * vol, 2)
            
            # Simulated SL/Entry
            sl_distance = (risk_1r / (vol * 100000)) if "XAU" not in sym else (risk_1r / (vol * 100))
            if deal_type == 0: # BUY
                open_p = base_p
                sl_p = round(base_p - sl_distance, 5)
                tp_p = round(base_p + (sl_distance * 2.0), 5)
                close_p = round(open_p + (sl_distance * r_mult), 5)
            else: # SELL
                open_p = base_p
                sl_p = round(base_p + sl_distance, 5)
                tp_p = round(base_p - (sl_distance * 2.0), 5)
                close_p = round(open_p - (sl_distance * r_mult), 5)

            deals.append({
                "ticket": ticket_id,
                "order_id": ticket_id + 50000,
                "account_id": sim_acc,
                "time": curr_ts,
                "time_msc": curr_ts * 1000,
                "type": deal_type,
                "entry": 1, # OUT (Close deal)
                "symbol": sym,
                "volume": vol,
                "price": close_p,
                "profit": profit,
                "swap": swap,
                "commission": commission,
                "sl": sl_p,
                "tp": tp_p,
                "open_time": curr_ts - random.randint(1800, 28800),
                "open_price": open_p,
                "comment": random.choice(["TrendFollow_M15", "Breakout_H1", "MeanReversion", ""]),
                "risk_r": risk_1r,
                "r_multiple": r_mult
            })
            ticket_id += 1

        return deals

mt5_service = MT5Service()
