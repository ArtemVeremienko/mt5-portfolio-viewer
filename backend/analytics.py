import math
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import numpy as np
import pandas as pd

def compute_1r_risk(deal: Dict[str, Any], balance_at_entry: float, default_risk_pct: float = 0.01) -> float:
    """
    Computes 1R (initial risk in account currency) for a trade.
    If deal has an explicitly computed risk_r (> 0.01), reuse it.
    If deal has a valid Stop Loss (sl), calculate risk from entry distance.
    Otherwise, fall back to default_risk_pct of account balance at entry (min 0.10 currency units for micro accounts).
    """
    existing_risk = deal.get("risk_r", 0.0)
    if existing_risk and float(existing_risk) > 0.01:
        return round(float(existing_risk), 2)

    open_price = deal.get("open_price", 0.0) or deal.get("price", 0.0)
    sl = deal.get("sl", 0.0)
    volume = deal.get("volume", 0.01)
    
    # Check if a valid SL was set
    valid_sl = False
    diff = 0.0
    if sl and sl > 0 and open_price > 0:
        diff = abs(open_price - sl)
        if diff > 1e-6:
            valid_sl = True
            
    if valid_sl and open_price > 0:
        # If profit and close price exist, derive exact per-point value
        close_price = deal.get("price", 0.0)
        net_profit = deal.get("profit", 0.0)
        price_diff = abs(close_price - open_price)
        if price_diff > 1e-6 and abs(net_profit) > 1e-4:
            val_per_point = abs(net_profit) / price_diff
            risk = diff * val_per_point
            if risk > 0.01:
                return round(risk, 2)
        # Fallback approximation for standard forex lot size or indices
        symbol = str(deal.get("symbol", "")).upper()
        if "JPY" in symbol:
            derived_risk = (diff / 0.01) * volume * 1000.0 / 150.0
        elif any(c in symbol for c in ["EUR", "USD", "GBP", "CHF", "AUD", "NZD", "CAD"]):
            derived_risk = diff * volume * 100000.0
        elif "XAU" in symbol:
            derived_risk = diff * volume * 100.0
        else:
            # Indices like DE40, US500
            derived_risk = diff * volume * 1.1
        if derived_risk > 0.01:
            return round(derived_risk, 2)

    # Fallback: Van Tharp fixed % risk model (e.g. 1% of balance at entry, floor $0.10 for micro accounts)
    fallback_risk = max(0.10, balance_at_entry * default_risk_pct)
    return round(fallback_risk, 2)


def get_sqn_rating(sqn: float) -> Dict[str, str]:
    """Returns Van Tharp rating and color classification for a given SQN value."""
    if sqn < 1.6:
        return {"category": "Poor", "badge": "border-red-500/30 text-red-400 bg-red-500/10"}
    elif sqn < 2.0:
        return {"category": "Average", "badge": "border-yellow-500/30 text-yellow-400 bg-yellow-500/10"}
    elif sqn < 2.5:
        return {"category": "Good", "badge": "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"}
    elif sqn < 3.0:
        return {"category": "Very Good", "badge": "border-cyan-500/30 text-cyan-400 bg-cyan-500/10"}
    elif sqn < 5.0:
        return {"category": "Excellent", "badge": "border-blue-500/30 text-blue-400 bg-blue-500/10"}
    else:
        return {"category": "Superb (Holy Grail)", "badge": "border-purple-500/30 text-purple-400 bg-purple-500/10"}


def process_portfolio_analytics(
    deals: List[Dict[str, Any]],
    current_account: Dict[str, Any],
    start_time: Optional[int] = None,
    end_time: Optional[int] = None,
    default_risk_pct: float = 0.01,
    trade_scope: str = "all"
) -> Dict[str, Any]:
    """
    Computes comprehensive Myfxbook performance statistics and Van Tharp R-Multiple analytics.
    """
    if not deals:
        current_bal = current_account.get("balance", 0.0)
        current_eq = current_account.get("equity", current_bal)
        return {
            "account": current_account,
            "stats": {
                "gain_pct": 0.0,
                "abs_gain_pct": 0.0,
                "daily_gain_pct": 0.0,
                "monthly_gain_pct": 0.0,
                "max_drawdown_pct": 0.0,
                "max_drawdown_amount": 0.0,
                "max_drawdown_r": 0.0,
                "balance": current_bal,
                "equity": current_eq,
                "highest_balance": current_bal,
                "total_profit": 0.0,
                "total_swap": 0.0,
                "total_commission": 0.0,
                "deposits": 0.0,
                "withdrawals": 0.0,
                "total_trades": 0,
                "won_trades": 0,
                "lost_trades": 0,
                "win_rate": 0.0,
                "profit_factor": 0.0,
                "sharpe_ratio": 0.0,
                "expectancy": 0.0,
                "avg_win": 0.0,
                "avg_loss": 0.0,
                "best_trade": 0.0,
                "worst_trade": 0.0,
                "long_trades": 0,
                "long_won": 0,
                "long_win_rate": 0.0,
                "short_trades": 0,
                "short_won": 0,
                "short_win_rate": 0.0,
                # Van Tharp
                "total_r": 0.0,
                "sqn": 0.0,
                "sqn_rating": get_sqn_rating(0.0),
                "r_expectancy": 0.0,
                "r_std_dev": 0.0,
                "avg_win_r": 0.0,
                "avg_loss_r": 0.0,
                "best_trade_r": 0.0,
                "worst_trade_r": 0.0,
            },
            "curves": [],
            "monthly_matrix": [],
            "symbol_stats": [],
            "hourly_stats": [],
            "day_of_week_stats": [],
            "r_distribution": [],
            "excursion_stats": {
                "optimal_sl_pips": 0.0,
                "optimal_sl_amount": 0.0,
                "optimal_sl_r": 0.0,
                "mfe_capture_efficiency_pct": 0.0,
                "avg_mae_pips": 0.0,
                "avg_mae_amount": 0.0,
                "avg_mae_r": 0.0,
                "avg_mfe_pips": 0.0,
                "avg_mfe_amount": 0.0,
                "avg_mfe_r": 0.0,
                "trades": []
            }
        }

    # Filter deals by time window if provided
    filtered_deals = []
    for d in deals:
        t = d.get("time", 0)
        if start_time and t < start_time:
            continue
        if end_time and t > end_time:
            continue
        filtered_deals.append(d)

    # Sort sequentially by time
    filtered_deals.sort(key=lambda x: (x.get("time", 0), x.get("time_msc", 0)))

    # Count total available closed trades in the window
    all_closed_deals = [x for x in filtered_deals if x.get("entry") in (1, 2) and x.get("type") in (0, 1)]
    available_closed_count = len(all_closed_deals)

    # Apply Trade Scope filter (e.g. last 100 closed trades)
    if trade_scope == "last100" and available_closed_count > 0:
        target_closed_tickets = set(x["ticket"] for x in all_closed_deals[-100:])
        # Retain cashflow balance operations (type == 2) and the selected 100 closed trades
        filtered_deals = [x for x in filtered_deals if x.get("type") == 2 or x.get("ticket") in target_closed_tickets]

    # Track running balance & cash deposits/withdrawals
    running_balance = 0.0
    initial_deposit = 0.0
    total_deposits = 0.0
    total_withdrawals = 0.0
    
    trade_deals = []
    daily_returns = {}
    
    # Process cashflow & trades
    for d in filtered_deals:
        dtype = d.get("type", 0)
        profit = d.get("profit", 0.0)
        swap = d.get("swap", 0.0)
        commission = d.get("commission", 0.0)
        net_trade_profit = profit + swap + commission

        # Type 2 is BALANCE (Deposit/Withdrawal) in MT5
        if dtype == 2:
            if profit > 0:
                total_deposits += profit
                if initial_deposit == 0.0:
                    initial_deposit = profit
            else:
                total_withdrawals += abs(profit)
            running_balance += profit
        else:
            # Standard trade deal
            entry = d.get("entry", 1) # 1=OUT (close), 0=IN, 2=INOUT
            if entry in [1, 2]: # Out / Close deal
                # Calculate 1R initial risk
                risk_1r = compute_1r_risk(d, max(1.0, running_balance), default_risk_pct)
                r_mult = round(net_trade_profit / risk_1r, 3) if risk_1r > 0 else 0.0
                
                mae_amt = float(d.get("mae_amount", 0.0) or 0.0)
                mfe_amt = float(d.get("mfe_amount", 0.0) or 0.0)
                mae_pips = float(d.get("mae_pips", 0.0) or 0.0)
                mfe_pips = float(d.get("mfe_pips", 0.0) or 0.0)
                mae_r = round(mae_amt / risk_1r, 2) if risk_1r > 0 else float(d.get("mae_r", 0.0) or 0.0)
                mfe_r = round(mfe_amt / risk_1r, 2) if risk_1r > 0 else float(d.get("mfe_r", 0.0) or 0.0)

                deal_record = dict(d)
                deal_record["net_profit"] = net_trade_profit
                deal_record["risk_r"] = risk_1r
                deal_record["r_multiple"] = r_mult
                deal_record["mae_amount"] = mae_amt
                deal_record["mfe_amount"] = mfe_amt
                deal_record["mae_pips"] = mae_pips
                deal_record["mfe_pips"] = mfe_pips
                deal_record["mae_r"] = mae_r
                deal_record["mfe_r"] = mfe_r
                trade_deals.append(deal_record)

                running_balance += net_trade_profit

        # Record daily closing balances for Sharpe / Daily return
        dt = datetime.fromtimestamp(d.get("time", 0), tz=timezone.utc)
        date_key = dt.strftime("%Y-%m-%d")
        daily_returns[date_key] = running_balance

    # Curve construction (Balance, Equity, Growth %, Drawdown %, Cumulative R)
    curves = []
    peak_balance = initial_deposit if initial_deposit > 0 else (trade_deals[0]["net_profit"] if trade_deals else 0.0)
    current_run_bal = 0.0
    cum_r = 0.0
    max_dd_pct = 0.0
    max_dd_amount = 0.0
    max_dd_r = 0.0
    peak_r = 0.0

    # Start curve with initial state
    if initial_deposit > 0:
        current_run_bal = initial_deposit
        curves.append({
            "timestamp": filtered_deals[0].get("time", 0),
            "balance": round(current_run_bal, 2),
            "equity": round(current_run_bal, 2),
            "profit": 0.0,
            "growth_pct": 0.0,
            "drawdown_pct": 0.0,
            "cumulative_r": 0.0,
            "r_drawdown": 0.0
        })

    cum_profit = 0.0
    for td in trade_deals:
        net_p = td["net_profit"]
        r_val = td["r_multiple"]
        current_run_bal += net_p
        cum_profit += net_p
        cum_r += r_val

        if current_run_bal > peak_balance:
            peak_balance = current_run_bal

        # Drawdown calculation
        dd_amount = peak_balance - current_run_bal
        dd_pct = (dd_amount / peak_balance * 100.0) if peak_balance > 0 else 0.0
        if dd_pct > max_dd_pct:
            max_dd_pct = dd_pct
        if dd_amount > max_dd_amount:
            max_dd_amount = dd_amount

        # R Drawdown calculation
        if cum_r > peak_r:
            peak_r = cum_r
        dd_r = peak_r - cum_r
        if dd_r > max_dd_r:
            max_dd_r = dd_r

        # Growth calculation: Time-weighted return relative to net deposits
        net_deposits = max(1.0, total_deposits - total_withdrawals)
        growth_pct = (cum_profit / net_deposits) * 100.0

        curves.append({
            "timestamp": td.get("time", 0),
            "balance": round(current_run_bal, 2),
            "equity": round(current_run_bal, 2),
            "profit": round(cum_profit, 2),
            "growth_pct": round(growth_pct, 2),
            "drawdown_pct": round(dd_pct, 2),
            "cumulative_r": round(cum_r, 2),
            "r_drawdown": round(dd_r, 2)
        })

    # Stats Summary
    total_trades = len(trade_deals)
    winning_trades = [t for t in trade_deals if t["net_profit"] > 0]
    losing_trades = [t for t in trade_deals if t["net_profit"] < 0]
    
    won_count = len(winning_trades)
    lost_count = len(losing_trades)
    win_rate = (won_count / total_trades * 100.0) if total_trades > 0 else 0.0

    gross_profit = sum(t["net_profit"] for t in winning_trades)
    gross_loss = abs(sum(t["net_profit"] for t in losing_trades))
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (999.0 if gross_profit > 0 else 0.0)

    avg_win = (gross_profit / won_count) if won_count > 0 else 0.0
    avg_loss = (gross_loss / lost_count) if lost_count > 0 else 0.0
    best_trade = max((t["net_profit"] for t in trade_deals), default=0.0)
    worst_trade = min((t["net_profit"] for t in trade_deals), default=0.0)

    total_profit = cum_profit
    total_swap = sum(t.get("swap", 0.0) for t in trade_deals)
    total_commission = sum(t.get("commission", 0.0) for t in trade_deals)

    # Long vs Short
    long_trades = [t for t in trade_deals if t.get("type", 0) == 0]
    short_trades = [t for t in trade_deals if t.get("type", 0) == 1]
    long_won = len([t for t in long_trades if t["net_profit"] > 0])
    short_won = len([t for t in short_trades if t["net_profit"] > 0])
    long_win_rate = (long_won / len(long_trades) * 100.0) if long_trades else 0.0
    short_win_rate = (short_won / len(short_trades) * 100.0) if short_trades else 0.0

    # Van Tharp R Analytics
    r_multiples = [t["r_multiple"] for t in trade_deals]
    if r_multiples:
        r_array = np.array(r_multiples)
        avg_r = float(np.mean(r_array))
        std_r = float(np.std(r_array, ddof=1)) if len(r_array) > 1 else 0.001
        # Standardized Tharp SQN: multiplier capped at sqrt(100) = 10.0 for > 100 trades
        multiplier = min(10.0, math.sqrt(len(r_array)))
        sqn = float((avg_r / std_r) * multiplier) if std_r > 0 else 0.0
        
        winning_r = [r for r in r_multiples if r > 0]
        losing_r = [r for r in r_multiples if r < 0]
        avg_win_r = float(np.mean(winning_r)) if winning_r else 0.0
        avg_loss_r = float(np.mean(losing_r)) if losing_r else 0.0
        best_trade_r = float(max(r_multiples))
        worst_trade_r = float(min(r_multiples))
    else:
        avg_r = 0.0
        std_r = 0.0
        sqn = 0.0
        avg_win_r = 0.0
        avg_loss_r = 0.0
        best_trade_r = 0.0
        worst_trade_r = 0.0

    # Expectancy ($): (Win Rate * Avg Win) - (Loss Rate * Avg Loss)
    loss_rate = (lost_count / total_trades) if total_trades > 0 else 0.0
    expectancy = ((win_rate / 100.0) * avg_win) - (loss_rate * avg_loss)

    # Sharpe Ratio from daily returns
    if len(daily_returns) > 2:
        vals = list(daily_returns.values())
        day_pct_changes = [(vals[i] - vals[i-1]) / vals[i-1] for i in range(1, len(vals)) if vals[i-1] > 0]
        if day_pct_changes and np.std(day_pct_changes) > 1e-6:
            daily_mean = np.mean(day_pct_changes)
            daily_std = np.std(day_pct_changes, ddof=1)
            sharpe_ratio = float((daily_mean / daily_std) * math.sqrt(252))
        else:
            sharpe_ratio = 0.0
    else:
        sharpe_ratio = 0.0

    # Daily & Monthly Gain %
    days_active = max(1, len(daily_returns))
    total_gain_pct = (total_profit / max(1.0, total_deposits)) * 100.0
    abs_gain_pct = total_gain_pct
    daily_gain_pct = total_gain_pct / days_active if days_active > 0 else 0.0
    monthly_gain_pct = daily_gain_pct * 30.4

    # Monthly Performance Matrix (Year x Jan-Dec)
    monthly_data = {}
    for td in trade_deals:
        dt = datetime.fromtimestamp(td.get("time", 0), tz=timezone.utc)
        yr = dt.year
        mo = dt.month
        key = (yr, mo)
        if key not in monthly_data:
            monthly_data[key] = {"profit": 0.0, "r": 0.0, "trades": 0}
        monthly_data[key]["profit"] += td["net_profit"]
        monthly_data[key]["r"] += td["r_multiple"]
        monthly_data[key]["trades"] += 1

    years_set = sorted({k[0] for k in monthly_data.keys()}, reverse=True)
    monthly_matrix = []
    for yr in years_set:
        row = {"year": yr, "months": {}, "total_profit": 0.0, "total_r": 0.0, "total_pct": 0.0}
        for mo in range(1, 13):
            if (yr, mo) in monthly_data:
                m_info = monthly_data[(yr, mo)]
                m_profit = m_info["profit"]
                m_r = m_info["r"]
                m_pct = (m_profit / max(1.0, current_run_bal)) * 100.0
                row["months"][mo] = {
                    "profit": round(m_profit, 2),
                    "r": round(m_r, 2),
                    "pct": round(m_pct, 2),
                    "trades": m_info["trades"]
                }
                row["total_profit"] += m_profit
                row["total_r"] += m_r
            else:
                row["months"][mo] = None
        row["total_profit"] = round(row["total_profit"], 2)
        row["total_r"] = round(row["total_r"], 2)
        row["total_pct"] = round((row["total_profit"] / max(1.0, total_deposits)) * 100.0, 2)
        monthly_matrix.append(row)

    # Symbol Breakdown
    symbol_dict = {}
    for td in trade_deals:
        sym = td.get("symbol", "OTHER") or "OTHER"
        if sym not in symbol_dict:
            symbol_dict[sym] = {"symbol": sym, "trades": 0, "profit": 0.0, "r": 0.0, "won": 0}
        symbol_dict[sym]["trades"] += 1
        symbol_dict[sym]["profit"] += td["net_profit"]
        symbol_dict[sym]["r"] += td["r_multiple"]
        if td["net_profit"] > 0:
            symbol_dict[sym]["won"] += 1

    symbol_stats = []
    for sym, val in symbol_dict.items():
        symbol_stats.append({
            "symbol": sym,
            "trades": val["trades"],
            "profit": round(val["profit"], 2),
            "r": round(val["r"], 2),
            "win_rate": round(val["won"] / val["trades"] * 100.0, 1)
        })
    symbol_stats.sort(key=lambda x: x["trades"], reverse=True)

    # Hourly and Day-of-week breakdown
    hourly_dict = {h: {"hour": h, "trades": 0, "profit": 0.0, "r": 0.0} for h in range(24)}
    dow_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    dow_dict = {i: {"day": dow_names[i], "trades": 0, "profit": 0.0, "r": 0.0} for i in range(7)}

    for td in trade_deals:
        dt = datetime.fromtimestamp(td.get("time", 0), tz=timezone.utc)
        h = dt.hour
        d = dt.weekday()
        hourly_dict[h]["trades"] += 1
        hourly_dict[h]["profit"] += td["net_profit"]
        hourly_dict[h]["r"] += td["r_multiple"]

        dow_dict[d]["trades"] += 1
        dow_dict[d]["profit"] += td["net_profit"]
        dow_dict[d]["r"] += td["r_multiple"]

    hourly_stats = [
        {"hour": h, "trades": v["trades"], "profit": round(v["profit"], 2), "r": round(v["r"], 2)}
        for h, v in hourly_dict.items()
    ]
    day_of_week_stats = [
        {"day": v["day"], "trades": v["trades"], "profit": round(v["profit"], 2), "r": round(v["r"], 2)}
        for i, v in dow_dict.items()
    ]

    # Van Tharp R Distribution Buckets
    bucket_defs = [
        ("<-2R", lambda r: r < -2.0),
        ("[-2R, -1R]", lambda r: -2.0 <= r < -1.0),
        ("[-1R, 0R]", lambda r: -1.0 <= r < 0.0),
        ("[0R, 1R]", lambda r: 0.0 <= r < 1.0),
        ("[1R, 2R]", lambda r: 1.0 <= r < 2.0),
        ("[2R, 5R]", lambda r: 2.0 <= r < 5.0),
        (">5R", lambda r: r >= 5.0),
    ]
    r_distribution = []
    for label, fn in bucket_defs:
        matching = [r for r in r_multiples if fn(r)]
        r_distribution.append({
            "bucket": label,
            "count": len(matching),
            "pct": round(len(matching) / len(r_multiples) * 100.0, 1) if r_multiples else 0.0
        })

    latest_bal = current_account.get("balance", current_run_bal)
    latest_eq = current_account.get("equity", latest_bal)

    # Excursion Analytics (MAE / MFE)
    winning_mae_pips = [t["mae_pips"] for t in winning_trades if t.get("mae_pips") is not None and t.get("mae_pips") > 0]
    winning_mae_amt = [t["mae_amount"] for t in winning_trades if t.get("mae_amount") is not None and t.get("mae_amount") > 0]
    winning_mae_r = [t["mae_r"] for t in winning_trades if t.get("mae_r") is not None and t.get("mae_r") > 0]

    optimal_sl_pips = float(np.percentile(winning_mae_pips, 90)) if winning_mae_pips else 0.0
    optimal_sl_amt = float(np.percentile(winning_mae_amt, 90)) if winning_mae_amt else 0.0
    optimal_sl_r = float(np.percentile(winning_mae_r, 90)) if winning_mae_r else 0.0

    efficiencies = [
        (t["net_profit"] / t["mfe_amount"] * 100.0)
        for t in winning_trades
        if t.get("mfe_amount", 0) > 0 and t["net_profit"] > 0
    ]
    mfe_capture_eff = float(np.mean(efficiencies)) if efficiencies else 0.0

    all_mae_pips = [t["mae_pips"] for t in trade_deals if t.get("mae_pips") is not None]
    all_mae_amt = [t["mae_amount"] for t in trade_deals if t.get("mae_amount") is not None]
    all_mae_r = [t["mae_r"] for t in trade_deals if t.get("mae_r") is not None]
    all_mfe_pips = [t["mfe_pips"] for t in trade_deals if t.get("mfe_pips") is not None]
    all_mfe_amt = [t["mfe_amount"] for t in trade_deals if t.get("mfe_amount") is not None]
    all_mfe_r = [t["mfe_r"] for t in trade_deals if t.get("mfe_r") is not None]

    excursion_stats = {
        "optimal_sl_pips": round(optimal_sl_pips, 1),
        "optimal_sl_amount": round(optimal_sl_amt, 2),
        "optimal_sl_r": round(optimal_sl_r, 2),
        "mfe_capture_efficiency_pct": round(mfe_capture_eff, 1),
        "avg_mae_pips": round(float(np.mean(all_mae_pips)), 1) if all_mae_pips else 0.0,
        "avg_mae_amount": round(float(np.mean(all_mae_amt)), 2) if all_mae_amt else 0.0,
        "avg_mae_r": round(float(np.mean(all_mae_r)), 2) if all_mae_r else 0.0,
        "avg_mfe_pips": round(float(np.mean(all_mfe_pips)), 1) if all_mfe_pips else 0.0,
        "avg_mfe_amount": round(float(np.mean(all_mfe_amt)), 2) if all_mfe_amt else 0.0,
        "avg_mfe_r": round(float(np.mean(all_mfe_r)), 2) if all_mfe_r else 0.0,
        "trades": [
            {
                "ticket": t.get("ticket"),
                "symbol": t.get("symbol"),
                "time": t.get("time"),
                "type": t.get("type"),
                "volume": t.get("volume"),
                "net_profit": t.get("net_profit"),
                "r_multiple": t.get("r_multiple"),
                "mae_pips": t.get("mae_pips"),
                "mfe_pips": t.get("mfe_pips"),
                "mae_amount": t.get("mae_amount"),
                "mfe_amount": t.get("mfe_amount"),
                "mae_r": t.get("mae_r"),
                "mfe_r": t.get("mfe_r"),
            }
            for t in trade_deals
        ]
    }

    return {
        "account": current_account,
        "stats": {
            "gain_pct": round(total_gain_pct, 2),
            "abs_gain_pct": round(abs_gain_pct, 2),
            "daily_gain_pct": round(daily_gain_pct, 2),
            "monthly_gain_pct": round(monthly_gain_pct, 2),
            "max_drawdown_pct": round(max_dd_pct, 2),
            "max_drawdown_amount": round(max_dd_amount, 2),
            "max_drawdown_r": round(max_dd_r, 2),
            "balance": round(latest_bal, 2),
            "equity": round(latest_eq, 2),
            "highest_balance": round(max(peak_balance, latest_bal), 2),
            "total_profit": round(total_profit, 2),
            "total_swap": round(total_swap, 2),
            "total_commission": round(total_commission, 2),
            "deposits": round(total_deposits, 2),
            "withdrawals": round(total_withdrawals, 2),
            "total_trades": total_trades,
            "won_trades": won_count,
            "lost_trades": lost_count,
            "win_rate": round(win_rate, 2),
            "profit_factor": round(profit_factor, 2),
            "sharpe_ratio": round(sharpe_ratio, 2),
            "expectancy": round(expectancy, 2),
            "avg_win": round(avg_win, 2),
            "avg_loss": round(avg_loss, 2),
            "best_trade": round(best_trade, 2),
            "worst_trade": round(worst_trade, 2),
            "long_trades": len(long_trades),
            "long_won": long_won,
            "long_win_rate": round(long_win_rate, 2),
            "short_trades": len(short_trades),
            "short_won": short_won,
            "short_win_rate": round(short_win_rate, 2),
            # Van Tharp
            "total_r": round(cum_r, 2),
            "sqn": round(sqn, 2),
            "sqn_rating": get_sqn_rating(sqn),
            "r_expectancy": round(avg_r, 3),
            "r_std_dev": round(std_r, 3),
            "avg_win_r": round(avg_win_r, 2),
            "avg_loss_r": round(avg_loss_r, 2),
            "best_trade_r": round(best_trade_r, 2),
            "worst_trade_r": round(worst_trade_r, 2),
            # Sample Size & Scope
            "is_sample_developing": total_trades < 30,
            "sample_trades": total_trades,
            "min_sample_target": 30,
            "benchmark_target": 100,
            "trade_scope": trade_scope,
            "available_closed_trades": available_closed_count,
        },
        "curves": curves,
        "monthly_matrix": monthly_matrix,
        "symbol_stats": symbol_stats,
        "hourly_stats": hourly_stats,
        "day_of_week_stats": day_of_week_stats,
        "r_distribution": r_distribution,
        "excursion_stats": excursion_stats,
        "closed_trades": trade_deals[::-1] # Reverse to display newest first
    }
