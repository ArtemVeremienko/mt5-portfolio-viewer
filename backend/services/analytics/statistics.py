from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from typing import Any

import numpy as np


def compute_sharpe_sortino(daily_returns: dict[str, float]) -> tuple[float, float]:
    """Compute annualized Sharpe and Sortino ratios from daily closing balances."""
    if len(daily_returns) < 2:
        return 0.0, 0.0
    sorted_dates = sorted(daily_returns.keys())
    start_dt = datetime.strptime(sorted_dates[0], "%Y-%m-%d").date()
    end_dt = datetime.strptime(sorted_dates[-1], "%Y-%m-%d").date()
    filled_vals: list[float] = []
    last_val = daily_returns[sorted_dates[0]]
    cur_dt = start_dt
    while cur_dt <= end_dt:
        if cur_dt.weekday() < 5:
            ds = cur_dt.strftime("%Y-%m-%d")
            if ds in daily_returns:
                last_val = daily_returns[ds]
            filled_vals.append(last_val)
        cur_dt += timedelta(days=1)

    day_pct_changes = [
        (filled_vals[i] - filled_vals[i - 1]) / filled_vals[i - 1]
        for i in range(1, len(filled_vals))
        if filled_vals[i - 1] > 0
    ]
    if len(day_pct_changes) < 2:
        return 0.0, 0.0

    daily_mean = float(np.mean(day_pct_changes))
    daily_std = float(np.std(day_pct_changes, ddof=1))
    sharpe = float((daily_mean / daily_std) * math.sqrt(252)) if daily_std > 1e-8 else 0.0

    downside_diffs = [min(0.0, r) for r in day_pct_changes]
    downside_dev = math.sqrt(float(np.mean([d * d for d in downside_diffs])))
    sortino = float((daily_mean / downside_dev) * math.sqrt(252)) if downside_dev > 1e-8 else 0.0
    return sharpe, sortino


def compute_z_score(trade_deals: list[dict[str, Any]], won_count: int, lost_count: int) -> tuple[float, float]:
    """Compute Wald-Wolfowitz runs Z-score and confidence percentage."""
    total_trades = len(trade_deals)
    if total_trades <= 2 or won_count <= 0 or lost_count <= 0:
        return 0.0, 0.0
    runs = 1
    for i in range(1, total_trades):
        prev_win = float(trade_deals[i - 1]["net_profit"]) > 0
        curr_win = float(trade_deals[i]["net_profit"]) > 0
        if prev_win != curr_win:
            runs += 1
    n_w = float(won_count)
    n_l = float(lost_count)
    n_tot = float(total_trades)
    numerator = n_tot * (runs - 0.5) - (2.0 * n_w * n_l)
    denom_sq = (2.0 * n_w * n_l * (2.0 * n_w * n_l - n_tot)) / (n_tot - 1.0)
    if denom_sq <= 0:
        return 0.0, 0.0
    z_score = round(float(numerator / math.sqrt(denom_sq)), 2)
    z_p_val = round(float(math.erf(abs(z_score) / math.sqrt(2.0)) * 100.0), 2)
    return z_score, z_p_val


def compute_ahpr_ghpr(
    trade_deals: list[dict[str, Any]],
    initial_deposit: float,
    fallback_balance: float,
) -> tuple[float, float]:
    """Compute Arithmetic and Geometric Holding Period Return percentages."""
    holding_returns: list[float] = []
    c_bal = initial_deposit if initial_deposit > 0 else (fallback_balance or 100.0)
    for t in trade_deals:
        net_p = float(t["net_profit"])
        holding_returns.append(net_p / max(1.0, c_bal))
        c_bal += net_p
    if not holding_returns:
        return 0.0, 0.0
    ahpr_pct = round(float(np.mean(holding_returns) * 100.0), 2)
    clamped_factors = [max(1e-4, 1.0 + r) for r in holding_returns]
    ghpr_mult = float(np.prod(clamped_factors) ** (1.0 / len(holding_returns)))
    ghpr_pct = round((ghpr_mult - 1.0) * 100.0, 2)
    return ahpr_pct, ghpr_pct


def compute_risk_of_ruin(
    current_balance: float,
    avg_win: float,
    avg_loss: float,
    won_count: int,
    win_rate_dec: float,
    loss_rate_dec: float,
) -> list[dict[str, Any]]:
    """Compute Risk of Ruin table across 10%-100% drawdown thresholds."""
    current_bal_val = max(1.0, current_balance)
    avg_loss_val = abs(avg_loss) if avg_loss > 0 else 0.10

    if avg_loss_val > 0 and won_count > 0:
        payoff = avg_win / avg_loss_val
        edge = win_rate_dec - (loss_rate_dec / payoff if payoff > 0 else 1.0)
    else:
        edge = 0.0

    rows: list[dict[str, Any]] = []
    for loss_pct in (100, 90, 80, 70, 60, 50, 40, 30, 20, 10):
        consecutive_losses = max(1, round((loss_pct / 100.0) * (current_bal_val / avg_loss_val)))
        if edge > 0:
            a_factor = (1.0 - edge) / (1.0 + edge)
            prob_val = a_factor**consecutive_losses
            prob_str = "<0.01%" if prob_val < 0.0001 else f"{round(prob_val * 100.0, 2)}%"
        else:
            prob_str = "100%"
        rows.append(
            {
                "loss_size_pct": loss_pct,
                "probability": prob_str,
                "consecutive_losses": consecutive_losses,
            }
        )
    return rows


def compute_period_pnl(trade_deals: list[dict[str, Any]]) -> tuple[float, float, float, float, float, float]:
    """Return (today_profit, week_profit, month_profit, today_r, week_r, month_r) in UTC."""
    now_utc = datetime.now(tz=UTC)
    today_start_ts = int(datetime(now_utc.year, now_utc.month, now_utc.day, tzinfo=UTC).timestamp())
    week_start_dt = now_utc - timedelta(days=now_utc.weekday())
    week_start_ts = int(
        datetime(week_start_dt.year, week_start_dt.month, week_start_dt.day, tzinfo=UTC).timestamp()
    )
    month_start_ts = int(datetime(now_utc.year, now_utc.month, 1, tzinfo=UTC).timestamp())

    today_profit = sum(float(t["net_profit"]) for t in trade_deals if int(t.get("time", 0) or 0) >= today_start_ts)
    week_profit = sum(float(t["net_profit"]) for t in trade_deals if int(t.get("time", 0) or 0) >= week_start_ts)
    month_profit = sum(float(t["net_profit"]) for t in trade_deals if int(t.get("time", 0) or 0) >= month_start_ts)
    today_r = sum(float(t["r_multiple"]) for t in trade_deals if int(t.get("time", 0) or 0) >= today_start_ts)
    week_r = sum(float(t["r_multiple"]) for t in trade_deals if int(t.get("time", 0) or 0) >= week_start_ts)
    month_r = sum(float(t["r_multiple"]) for t in trade_deals if int(t.get("time", 0) or 0) >= month_start_ts)
    return today_profit, week_profit, month_profit, today_r, week_r, month_r
