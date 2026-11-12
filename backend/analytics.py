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


def calculate_trade_pips(deal: Dict[str, Any]) -> float:
    """Calculates gain/loss in pips or points for a trade deal."""
    if "pips" in deal and deal["pips"] is not None and abs(float(deal["pips"])) > 1e-4:
        return round(float(deal["pips"]), 1)
        
    symbol = str(deal.get("symbol", "")).upper()
    open_price = float(deal.get("open_price", 0.0) or 0.0)
    close_price = float(deal.get("price", 0.0) or 0.0)
    deal_type = int(deal.get("type", 0) or 0) # 0=BUY, 1=SELL
    
    if open_price <= 0 or close_price <= 0:
        vol = float(deal.get("volume", 0.01) or 0.01)
        net_profit = float(deal.get("profit", 0.0) or 0.0)
        return round(net_profit / max(0.1, vol * 10.0), 1)

    if "JPY" in symbol:
        pip_size = 0.01
    elif any(c in symbol for c in ["EUR", "USD", "GBP", "CHF", "AUD", "NZD", "CAD"]):
        pip_size = 0.0001
    elif "XAU" in symbol or "GOLD" in symbol:
        pip_size = 0.1
    elif any(idx in symbol for idx in ["DE40", "GER40", "US30", "US500", "SPX", "NAS100", "USTEC", "UK100", "JP225"]):
        pip_size = 1.0 # Index points
    elif "BTC" in symbol or "ETH" in symbol:
        pip_size = 1.0
    else:
        price_str = f"{open_price:.6f}".rstrip("0")
        decimals = len(price_str.split(".")[1]) if "." in price_str else 2
        pip_size = 0.01 if decimals in (2, 3) else (0.0001 if decimals >= 4 else 1.0)
        
    price_diff = (close_price - open_price) if deal_type == 0 else (open_price - close_price)
    return round(price_diff / pip_size, 1)


def format_duration(seconds: int) -> str:
    """Formats duration seconds into human-readable string (e.g. '4m', '2h 15m', '3d 4h')."""
    if seconds < 60:
        return f"{seconds}s"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}m"
    hours = minutes // 60
    rem_min = minutes % 60
    if hours < 24:
        return f"{hours}h {rem_min}m" if rem_min > 0 else f"{hours}h"
    days = hours // 24
    rem_hours = hours % 24
    return f"{days}d {rem_hours}h" if rem_hours > 0 else f"{days}d"


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
                # Advanced Statistics
                "profitability_won_pct": 0.0,
                "profitability_lost_pct": 0.0,
                "total_pips": 0.0,
                "avg_win_pips": 0.0,
                "avg_loss_pips": 0.0,
                "total_lots": 0.0,
                "best_trade_date": "",
                "worst_trade_date": "",
                "best_trade_pips": 0.0,
                "best_trade_pips_date": "",
                "worst_trade_pips": 0.0,
                "worst_trade_pips_date": "",
                "avg_trade_length_seconds": 0,
                "avg_trade_length_str": "0s",
                "profit_std_dev": 0.0,
                "z_score": 0.0,
                "z_score_p_value": 0.0,
                "expectancy_pips": 0.0,
                "ahpr_pct": 0.0,
                "ghpr_pct": 0.0,
            },
            "curves": [],
            "monthly_matrix": [],
            "monthly_analytics": [],
            "symbol_stats": [],
            "hourly_stats": [],
            "day_of_week_stats": [],
            "calendar_days": [],
            "currency_summary": [],
            "duration_trades": [],
            "risk_of_ruin": [],
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
                
                # Extended Pip & Duration metrics
                pips_val = calculate_trade_pips(d)
                open_t = int(d.get("open_time", 0) or d.get("time", 0) or 0)
                close_t = int(d.get("time", 0) or 0)
                dur_sec = max(0, close_t - open_t) if close_t >= open_t else 0
                deal_record["pips"] = pips_val
                deal_record["open_time"] = open_t
                deal_record["duration_seconds"] = dur_sec
                deal_record["duration_str"] = format_duration(dur_sec)
                deal_record["type_str"] = "BUY" if int(d.get("type", 0) or 0) == 0 else "SELL"
                
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

        # Periodic change per trade (percentage and dollar)
        prev_bal = max(1.0, current_run_bal - td["net_profit"])
        trade_chg_pct = (td["net_profit"] / prev_bal) * 100.0

        curves.append({
            "timestamp": td.get("time", 0),
            "balance": round(current_run_bal, 2),
            "equity": round(current_run_bal, 2),
            "profit": round(cum_profit, 2),
            "growth_pct": round(growth_pct, 2),
            "drawdown_pct": round(dd_pct, 2),
            "cumulative_r": round(cum_r, 2),
            "r_drawdown": round(dd_r, 2),
            "change_pct": round(trade_chg_pct, 2),
            "change_amount": round(td["net_profit"], 2),
            "change_r": round(td["r_multiple"], 2)
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

    # Detailed Monthly Analytics (for 4-Quadrant Monthly Analytics View)
    month_names_full = [
        "", "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ]
    month_names_short = [
        "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ]

    monthly_trades_map = {}
    for td in trade_deals:
        dt = datetime.fromtimestamp(td.get("time", 0), tz=timezone.utc)
        k = (dt.year, dt.month)
        if k not in monthly_trades_map:
            monthly_trades_map[k] = []
        monthly_trades_map[k].append(td)

    monthly_analytics = []
    for (yr, mo), m_trades in sorted(monthly_trades_map.items(), key=lambda x: (x[0][0], x[0][1])):
        m_tot_profit = sum(t["net_profit"] for t in m_trades)
        m_tot_lots = sum(t.get("volume", 0.0) for t in m_trades)
        m_tot_pips = sum(t.get("pips", 0.0) for t in m_trades)
        m_won = len([t for t in m_trades if t["net_profit"] > 0])
        m_lost = len([t for t in m_trades if t["net_profit"] < 0])
        m_change_pct = (m_tot_profit / max(1.0, current_run_bal)) * 100.0

        curr_map = {}
        for t in m_trades:
            sym = t.get("symbol", "OTHER") or "OTHER"
            if sym not in curr_map:
                curr_map[sym] = {
                    "symbol": sym,
                    "trades": 0,
                    "wins": [],
                    "losses": [],
                    "r_multiples": [],
                    "long_durations": [],
                    "short_durations": [],
                    "profit": 0.0,
                    "pips": 0.0,
                    "lots": 0.0
                }
            curr_map[sym]["trades"] += 1
            curr_map[sym]["profit"] += t["net_profit"]
            curr_map[sym]["pips"] += t.get("pips", 0.0)
            curr_map[sym]["lots"] += t.get("volume", 0.0)
            curr_map[sym]["r_multiples"].append(t.get("r_multiple", 0.0))
            
            if t["net_profit"] > 0:
                curr_map[sym]["wins"].append(t["net_profit"])
            else:
                curr_map[sym]["losses"].append(abs(t["net_profit"]))

            dur = t.get("duration_seconds", 0)
            if t.get("type", 0) == 0:
                curr_map[sym]["long_durations"].append(dur)
            else:
                curr_map[sym]["short_durations"].append(dur)

        currencies_list = []
        tot_m_trades = len(m_trades)
        for sym, c_data in curr_map.items():
            sym_trades_cnt = c_data["trades"]
            pop_pct = round((sym_trades_cnt / tot_m_trades) * 100.0, 1) if tot_m_trades > 0 else 0.0
            
            wins = c_data["wins"]
            losses = c_data["losses"]
            avg_win_val = float(np.mean(wins)) if wins else 0.0
            avg_loss_val = float(np.mean(losses)) if losses else 0.0
            
            if losses and avg_loss_val > 0 and wins:
                rr_ratio = round(avg_win_val / avg_loss_val, 2)
                is_all_wins = False
            elif wins and not losses:
                rr_ratio = round(float(np.mean(c_data["r_multiples"])), 2) if c_data["r_multiples"] else 1.0
                is_all_wins = True
            else:
                rr_ratio = 0.0
                is_all_wins = False

            long_durs = c_data["long_durations"]
            short_durs = c_data["short_durations"]
            all_durs = long_durs + short_durs
            avg_long_sec = int(np.mean(long_durs)) if long_durs else 0
            avg_short_sec = int(np.mean(short_durs)) if short_durs else 0
            avg_tot_sec = int(np.mean(all_durs)) if all_durs else 0

            currencies_list.append({
                "symbol": sym,
                "trades": sym_trades_cnt,
                "popularity_pct": pop_pct,
                "reward_risk_ratio": max(0.1, rr_ratio),
                "is_all_wins": is_all_wins,
                "avg_long_duration_sec": avg_long_sec,
                "avg_long_duration_str": format_duration(avg_long_sec),
                "avg_short_duration_sec": avg_short_sec,
                "avg_short_duration_str": format_duration(avg_short_sec),
                "avg_total_duration_sec": avg_tot_sec,
                "avg_total_duration_str": format_duration(avg_tot_sec),
                "long_trades": len(long_durs),
                "short_trades": len(short_durs),
                "profit": round(c_data["profit"], 2),
                "pips": round(c_data["pips"], 1),
                "lots": round(c_data["lots"], 2)
            })

        currencies_list.sort(key=lambda x: x["trades"], reverse=True)

        monthly_analytics.append({
            "year": yr,
            "month": mo,
            "month_name": month_names_full[mo],
            "short_name": f"{month_names_short[mo]} {yr}",
            "change_pct": round(m_change_pct, 2),
            "profit": round(m_tot_profit, 2),
            "lots": round(m_tot_lots, 2),
            "pips": round(m_tot_pips, 1),
            "trades": tot_m_trades,
            "won": m_won,
            "lost": m_lost,
            "currencies": currencies_list
        })

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

    # Format date helper for best/worst trades
    def fmt_trade_date(ts: Optional[int]) -> str:
        if not ts:
            return ""
        return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%b %d")

    # Advanced Statistics Metrics
    total_pips = round(float(sum(t.get("pips", 0.0) for t in trade_deals)), 1)
    winning_pips = [t.get("pips", 0.0) for t in winning_trades]
    losing_pips = [t.get("pips", 0.0) for t in losing_trades]
    avg_win_pips = round(float(np.mean(winning_pips)), 1) if winning_pips else 0.0
    avg_loss_pips = round(float(np.mean(losing_pips)), 1) if losing_pips else 0.0

    total_lots = round(float(sum(t.get("volume", 0.0) for t in trade_deals)), 2)

    best_trade_deal = max(trade_deals, key=lambda x: x["net_profit"], default=None)
    worst_trade_deal = min(trade_deals, key=lambda x: x["net_profit"], default=None)
    best_trade_pips_deal = max(trade_deals, key=lambda x: x.get("pips", 0.0), default=None)
    worst_trade_pips_deal = min(trade_deals, key=lambda x: x.get("pips", 0.0), default=None)

    best_trade_date = fmt_trade_date(best_trade_deal.get("time")) if best_trade_deal else ""
    worst_trade_date = fmt_trade_date(worst_trade_deal.get("time")) if worst_trade_deal else ""
    best_trade_pips_val = round(float(best_trade_pips_deal.get("pips", 0.0)), 1) if best_trade_pips_deal else 0.0
    best_trade_pips_date = fmt_trade_date(best_trade_pips_deal.get("time")) if best_trade_pips_deal else ""
    worst_trade_pips_val = round(float(worst_trade_pips_deal.get("pips", 0.0)), 1) if worst_trade_pips_deal else 0.0
    worst_trade_pips_date = fmt_trade_date(worst_trade_pips_deal.get("time")) if worst_trade_pips_deal else ""

    all_durations = [t.get("duration_seconds", 0) for t in trade_deals]
    avg_trade_length_seconds = int(np.mean(all_durations)) if all_durations else 0
    avg_trade_length_str = format_duration(avg_trade_length_seconds)

    all_profits = [t["net_profit"] for t in trade_deals]
    profit_std_dev = round(float(np.std(all_profits, ddof=1)), 3) if len(all_profits) > 1 else 0.0

    # Z-Score streak randomness test
    if total_trades > 2 and won_count > 0 and lost_count > 0:
        runs = 1
        for i in range(1, total_trades):
            prev_win = trade_deals[i-1]["net_profit"] > 0
            curr_win = trade_deals[i]["net_profit"] > 0
            if prev_win != curr_win:
                runs += 1
        n_w = float(won_count)
        n_l = float(lost_count)
        n_tot = float(total_trades)
        numerator = n_tot * (runs - 0.5) - (2.0 * n_w * n_l)
        denom_sq = (2.0 * n_w * n_l * (2.0 * n_w * n_l - n_tot)) / (n_tot - 1.0)
        if denom_sq > 0:
            z_score = round(float(numerator / math.sqrt(denom_sq)), 2)
            z_score_p_val = round(float(math.erf(abs(z_score) / math.sqrt(2.0)) * 100.0), 2)
        else:
            z_score = 0.0
            z_score_p_val = 0.0
    else:
        z_score = 0.0
        z_score_p_val = 0.0

    # Expectancy Pips
    loss_rate_dec = (lost_count / total_trades) if total_trades > 0 else 0.0
    win_rate_dec = (won_count / total_trades) if total_trades > 0 else 0.0
    expectancy_pips = round((win_rate_dec * avg_win_pips) - (loss_rate_dec * abs(avg_loss_pips)), 1)

    # AHPR & GHPR
    holding_returns = []
    c_bal = initial_deposit if initial_deposit > 0 else (current_account.get("balance", 100.0) or 100.0)
    for t in trade_deals:
        hpr_ret = t["net_profit"] / max(1.0, c_bal)
        holding_returns.append(hpr_ret)
        c_bal += t["net_profit"]

    if holding_returns:
        ahpr_pct = round(float(np.mean(holding_returns) * 100.0), 2)
        clamped_factors = [max(1e-4, 1.0 + r) for r in holding_returns]
        ghpr_mult = float(np.prod(clamped_factors) ** (1.0 / len(holding_returns)))
        ghpr_pct = round((ghpr_mult - 1.0) * 100.0, 2)
    else:
        ahpr_pct = 0.0
        ghpr_pct = 0.0

    # Risk of Ruin
    latest_bal = current_account.get("balance", current_run_bal)
    latest_eq = current_account.get("equity", latest_bal)
    current_bal_val = max(1.0, latest_bal)
    avg_loss_val = abs(avg_loss) if avg_loss > 0 else 0.10

    if avg_loss_val > 0 and won_count > 0:
        payoff = avg_win / avg_loss_val if avg_loss_val > 0 else 1.0
        edge = win_rate_dec - (loss_rate_dec / payoff if payoff > 0 else 1.0)
    else:
        edge = 0.0

    risk_of_ruin = []
    for loss_pct in [100, 90, 80, 70, 60, 50, 40, 30, 20, 10]:
        consecutive_losses = max(1, round((loss_pct / 100.0) * (current_bal_val / avg_loss_val)))
        if edge > 0:
            a_factor = (1.0 - edge) / (1.0 + edge)
            prob_val = a_factor ** consecutive_losses
            if prob_val < 0.0001:
                prob_str = "<0.01%"
            else:
                prob_str = f"{round(prob_val * 100.0, 2)}%"
        else:
            prob_str = "100%"
        
        risk_of_ruin.append({
            "loss_size_pct": loss_pct,
            "probability": prob_str,
            "consecutive_losses": consecutive_losses
        })

    # Hourly and Day-of-week breakdown (with winners/losers)
    hourly_dict = {h: {"hour": h, "trades": 0, "profit": 0.0, "r": 0.0, "won": 0, "lost": 0} for h in range(24)}
    dow_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    dow_dict = {i: {"day": dow_names[i], "trades": 0, "profit": 0.0, "r": 0.0, "won": 0, "lost": 0} for i in range(7)}

    for td in trade_deals:
        dt = datetime.fromtimestamp(td.get("time", 0), tz=timezone.utc)
        h = dt.hour
        d = dt.weekday()
        hourly_dict[h]["trades"] += 1
        hourly_dict[h]["profit"] += td["net_profit"]
        hourly_dict[h]["r"] += td["r_multiple"]
        if td["net_profit"] > 0:
            hourly_dict[h]["won"] += 1
        else:
            hourly_dict[h]["lost"] += 1

        dow_dict[d]["trades"] += 1
        dow_dict[d]["profit"] += td["net_profit"]
        dow_dict[d]["r"] += td["r_multiple"]
        if td["net_profit"] > 0:
            dow_dict[d]["won"] += 1
        else:
            dow_dict[d]["lost"] += 1

    hourly_stats = [
        {
            "hour": h,
            "trades": v["trades"],
            "won": v["won"],
            "lost": v["lost"],
            "profit": round(v["profit"], 2),
            "r": round(v["r"], 2)
        }
        for h, v in hourly_dict.items()
    ]
    day_of_week_stats = [
        {
            "day": v["day"],
            "trades": v["trades"],
            "won": v["won"],
            "lost": v["lost"],
            "profit": round(v["profit"], 2),
            "r": round(v["r"], 2)
        }
        for i, v in dow_dict.items()
    ]

    # Calendar View aggregation (by date YYYY-MM-DD)
    calendar_days_dict = {}
    for td in trade_deals:
        dt = datetime.fromtimestamp(td.get("time", 0), tz=timezone.utc)
        d_key = dt.strftime("%Y-%m-%d")
        if d_key not in calendar_days_dict:
            calendar_days_dict[d_key] = {
                "date": d_key,
                "profit": 0.0,
                "r": 0.0,
                "trades": 0,
                "won": 0,
                "lost": 0,
                "deals": []
            }
        calendar_days_dict[d_key]["trades"] += 1
        calendar_days_dict[d_key]["profit"] += td["net_profit"]
        calendar_days_dict[d_key]["r"] += td["r_multiple"]
        if td["net_profit"] > 0:
            calendar_days_dict[d_key]["won"] += 1
        else:
            calendar_days_dict[d_key]["lost"] += 1

        calendar_days_dict[d_key]["deals"].append({
            "ticket": td.get("ticket"),
            "symbol": td.get("symbol"),
            "type": td.get("type", 0),
            "type_str": td.get("type_str", "BUY"),
            "volume": td.get("volume", 0.0),
            "open_price": td.get("open_price", 0.0),
            "close_price": td.get("price", 0.0),
            "open_time": td.get("open_time", 0),
            "close_time": td.get("time", 0),
            "duration_seconds": td.get("duration_seconds", 0),
            "duration_str": td.get("duration_str", ""),
            "profit": round(td["net_profit"], 2),
            "pips": td.get("pips", 0.0),
            "commission": td.get("commission", 0.0),
            "r_multiple": td.get("r_multiple", 0.0)
        })

    calendar_days = []
    for d_key, d_val in sorted(calendar_days_dict.items()):
        d_val["profit"] = round(d_val["profit"], 2)
        d_val["r"] = round(d_val["r"], 2)
        d_val["win_rate"] = round(d_val["won"] / d_val["trades"] * 100.0, 1) if d_val["trades"] > 0 else 0.0
        calendar_days.append(d_val)

    # Currency / Symbol Summary Table (Longs vs Shorts vs Total)
    summary_dict = {}
    for td in trade_deals:
        sym = td.get("symbol", "OTHER") or "OTHER"
        if sym not in summary_dict:
            summary_dict[sym] = {
                "symbol": sym,
                "long_trades": 0,
                "long_pips": 0.0,
                "long_profit": 0.0,
                "short_trades": 0,
                "short_pips": 0.0,
                "short_profit": 0.0,
                "total_trades": 0,
                "total_pips": 0.0,
                "total_profit": 0.0,
                "won_count": 0,
                "lost_count": 0,
            }
        t_type = td.get("type", 0) # 0=BUY (Long), 1=SELL (Short)
        pips_num = td.get("pips", 0.0)
        prof_num = td["net_profit"]
        
        summary_dict[sym]["total_trades"] += 1
        summary_dict[sym]["total_pips"] += pips_num
        summary_dict[sym]["total_profit"] += prof_num
        if prof_num > 0:
            summary_dict[sym]["won_count"] += 1
        else:
            summary_dict[sym]["lost_count"] += 1
            
        if t_type == 0:
            summary_dict[sym]["long_trades"] += 1
            summary_dict[sym]["long_pips"] += pips_num
            summary_dict[sym]["long_profit"] += prof_num
        else:
            summary_dict[sym]["short_trades"] += 1
            summary_dict[sym]["short_pips"] += pips_num
            summary_dict[sym]["short_profit"] += prof_num

    currency_summary = []
    for sym, v in summary_dict.items():
        tot = v["total_trades"]
        won = v["won_count"]
        lost = v["lost_count"]
        currency_summary.append({
            "symbol": sym,
            "long_trades": v["long_trades"],
            "long_pips": round(v["long_pips"], 1),
            "long_profit": round(v["long_profit"], 2),
            "short_trades": v["short_trades"],
            "short_pips": round(v["short_pips"], 1),
            "short_profit": round(v["short_profit"], 2),
            "total_trades": tot,
            "total_pips": round(v["total_pips"], 1),
            "total_profit": round(v["total_profit"], 2),
            "won_count": won,
            "lost_count": lost,
            "won_pct": round(won / tot * 100.0, 1) if tot > 0 else 0.0,
            "lost_pct": round(lost / tot * 100.0, 1) if tot > 0 else 0.0,
        })
    currency_summary.sort(key=lambda x: x["total_trades"], reverse=True)

    # Duration Scatter Coordinates (last 200 trades)
    duration_trades = [
        {
            "ticket": td.get("ticket"),
            "symbol": td.get("symbol"),
            "type": td.get("type", 0),
            "type_str": td.get("type_str", "BUY"),
            "open_time": td.get("open_time", 0),
            "close_time": td.get("time", 0),
            "duration_seconds": td.get("duration_seconds", 0),
            "duration_str": td.get("duration_str", ""),
            "profit": round(td["net_profit"], 2),
            "pips": td.get("pips", 0.0),
            "r_multiple": td.get("r_multiple", 0.0),
            "is_winner": td["net_profit"] > 0
        }
        for td in trade_deals[-200:]
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
            # Advanced Statistics Metrics
            "profitability_won_pct": round(win_rate, 1),
            "profitability_lost_pct": round(100.0 - win_rate, 1) if total_trades > 0 else 0.0,
            "total_pips": total_pips,
            "avg_win_pips": avg_win_pips,
            "avg_loss_pips": avg_loss_pips,
            "total_lots": total_lots,
            "best_trade_date": best_trade_date,
            "worst_trade_date": worst_trade_date,
            "best_trade_pips": best_trade_pips_val,
            "best_trade_pips_date": best_trade_pips_date,
            "worst_trade_pips": worst_trade_pips_val,
            "worst_trade_pips_date": worst_trade_pips_date,
            "avg_trade_length_seconds": avg_trade_length_seconds,
            "avg_trade_length_str": avg_trade_length_str,
            "profit_std_dev": profit_std_dev,
            "z_score": z_score,
            "z_score_p_value": z_score_p_val,
            "expectancy_pips": expectancy_pips,
            "ahpr_pct": ahpr_pct,
            "ghpr_pct": ghpr_pct,
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
        "monthly_analytics": monthly_analytics,
        "symbol_stats": symbol_stats,
        "hourly_stats": hourly_stats,
        "day_of_week_stats": day_of_week_stats,
        "calendar_days": calendar_days,
        "currency_summary": currency_summary,
        "duration_trades": duration_trades,
        "risk_of_ruin": risk_of_ruin,
        "r_distribution": r_distribution,
        "excursion_stats": excursion_stats,
        "closed_trades": trade_deals[::-1] # Reverse to display newest first
    }
