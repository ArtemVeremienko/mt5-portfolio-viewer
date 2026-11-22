from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import numpy as np

from backend.services.analytics.audit import compute_audit_summary
from backend.services.analytics.breakdowns import (
    build_calendar_days,
    build_currency_summary,
    build_duration_trades,
    build_hourly_and_dow_stats,
    build_monthly_analytics,
    build_monthly_matrix,
    build_symbol_stats,
)
from backend.services.analytics.curves import build_curves_and_trades
from backend.services.analytics.excursions import compute_excursion_stats
from backend.services.analytics.filters import (
    extract_filter_options,
    extract_journal_filter_options,
    filter_and_scope_deals,
    format_duration,
)
from backend.services.analytics.statistics import (
    compute_ahpr_ghpr,
    compute_period_pnl,
    compute_risk_of_ruin,
    compute_sharpe_sortino,
    compute_z_score,
)
from backend.services.analytics.tharp import (
    build_r_distribution,
    compute_sqn,
    get_sqn_rating,
)


def _fmt_trade_date(ts: int | None) -> str:
    if not ts:
        return ""
    return datetime.fromtimestamp(ts, tz=UTC).strftime("%b %d")


def empty_analytics_response(
    current_account: dict[str, Any],
    trade_scope: str = "all",
) -> dict[str, Any]:
    """Return a zeroed analytics payload with full schema parity."""
    current_bal = float(current_account.get("balance", 0.0) or 0.0)
    current_eq = float(current_account.get("equity", current_bal) or current_bal)
    return {
        "account": current_account,
        "stats": {
            "gain_pct": 0.0,
            "abs_gain_pct": 0.0,
            "daily_gain_pct": 0.0,
            "monthly_gain_pct": 0.0,
            "max_drawdown_pct": 0.0,
            "current_drawdown_pct": 0.0,
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
            "breakeven_trades": 0,
            "win_rate": 0.0,
            "profit_factor": 0.0,
            "sharpe_ratio": 0.0,
            "sortino_ratio": 0.0,
            "calmar_ratio": 0.0,
            "recovery_factor": 0.0,
            "half_kelly_pct": 0.0,
            "max_consecutive_wins": 0,
            "max_consecutive_losses": 0,
            "max_dd_duration_days": 0.0,
            "sl_verified_count": 0,
            "sl_estimated_count": 0,
            "avg_1r": 0.0,
            "median_1r": 0.0,
            "today_profit": 0.0,
            "week_profit": 0.0,
            "month_profit": 0.0,
            "today_r": 0.0,
            "week_r": 0.0,
            "month_r": 0.0,
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
            "total_r": 0.0,
            "sqn": 0.0,
            "sqn_rating": get_sqn_rating(0.0),
            "r_expectancy": 0.0,
            "r_std_dev": 0.0,
            "avg_win_r": 0.0,
            "avg_loss_r": 0.0,
            "best_trade_r": 0.0,
            "worst_trade_r": 0.0,
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
            "is_sample_developing": True,
            "sample_trades": 0,
            "min_sample_target": 30,
            "benchmark_target": 100,
            "trade_scope": trade_scope,
            "available_closed_trades": 0,
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
        "excursion_stats": compute_excursion_stats([], []),
        "audit_stats": compute_audit_summary([], None, r_expectancy=0.0),
        "cashflows": [],
        "available_symbols": [],
        "available_comments": [],
        "available_magics": [],
        "available_setup_tags": [],
        "available_mistake_tags": [],
        "closed_trades": [],
    }


def process_portfolio_analytics(
    deals: list[dict[str, Any]],
    current_account: dict[str, Any],
    start_time: int | None = None,
    end_time: int | None = None,
    default_risk_pct: float = 0.01,
    trade_scope: str = "all",
    symbol: str | None = None,
    direction: str | None = None,
    comment: str | None = None,
    magic: int | None = None,
    notes_map: dict[int, dict[str, Any]] | None = None,
    setup_tag: str | None = None,
    exclude_mistakes: bool = False,
    revenge_window_min: int = 30,
) -> dict[str, Any]:
    """Compute Myfxbook performance statistics and Van Tharp R-Multiple analytics."""
    if not deals:
        return empty_analytics_response(current_account, trade_scope=trade_scope)

    available_symbols, available_comments, available_magics = extract_filter_options(deals)
    available_setup_tags, available_mistake_tags = extract_journal_filter_options(notes_map)
    filtered_deals, entry_fees_by_pos, scope_starting_balance, available_closed_count = (
        filter_and_scope_deals(
            deals=deals,
            start_time=start_time,
            end_time=end_time,
            trade_scope=trade_scope,
            symbol=symbol,
            direction=direction,
            comment=comment,
            magic=magic,
            notes_map=notes_map,
            setup_tag=setup_tag,
            exclude_mistakes=exclude_mistakes,
        )
    )

    is_unfiltered = (
        trade_scope == "all"
        and start_time is None
        and not (symbol or "").strip()
        and not (direction or "").strip()
        and not (comment or "").strip()
        and magic is None
        and not (setup_tag or "").strip()
        and not exclude_mistakes
    )

    cstate = build_curves_and_trades(
        filtered_deals=filtered_deals,
        entry_fees_by_pos=entry_fees_by_pos,
        scope_starting_balance=scope_starting_balance,
        current_account=current_account,
        default_risk_pct=default_risk_pct,
        is_unfiltered=is_unfiltered,
        end_time=end_time,
    )
    trade_deals = cstate.trade_deals

    total_trades = len(trade_deals)
    winning_trades = [t for t in trade_deals if float(t["net_profit"]) > 0]
    losing_trades = [t for t in trade_deals if float(t["net_profit"]) < 0]
    won_count = len(winning_trades)
    lost_count = len(losing_trades)
    win_rate = (won_count / total_trades * 100.0) if total_trades > 0 else 0.0

    gross_profit = sum(float(t["net_profit"]) for t in winning_trades)
    gross_loss = abs(sum(float(t["net_profit"]) for t in losing_trades))
    profit_factor = (
        (gross_profit / gross_loss)
        if gross_loss > 0
        else (999.0 if gross_profit > 0 else 0.0)
    )
    avg_win = (gross_profit / won_count) if won_count > 0 else 0.0
    avg_loss = (gross_loss / lost_count) if lost_count > 0 else 0.0
    best_trade = max((float(t["net_profit"]) for t in trade_deals), default=0.0)
    worst_trade = min((float(t["net_profit"]) for t in trade_deals), default=0.0)

    total_profit = cstate.cum_profit
    total_swap = sum(float(t.get("swap", 0.0) or 0.0) for t in trade_deals)
    total_commission = sum(float(t.get("commission", 0.0) or 0.0) for t in trade_deals)

    long_trades = [t for t in trade_deals if int(t.get("type", 0) or 0) == 0]
    short_trades = [t for t in trade_deals if int(t.get("type", 0) or 0) == 1]
    long_won = sum(1 for t in long_trades if float(t["net_profit"]) > 0)
    short_won = sum(1 for t in short_trades if float(t["net_profit"]) > 0)
    long_win_rate = (long_won / len(long_trades) * 100.0) if long_trades else 0.0
    short_win_rate = (short_won / len(short_trades) * 100.0) if short_trades else 0.0

    r_multiples = [float(t["r_multiple"]) for t in trade_deals]
    sqn, avg_r, std_r = compute_sqn(r_multiples)
    winning_r = [r for r in r_multiples if r > 0]
    losing_r = [r for r in r_multiples if r < 0]
    avg_win_r = float(np.mean(winning_r)) if winning_r else 0.0
    avg_loss_r = float(np.mean(losing_r)) if losing_r else 0.0
    best_trade_r = float(max(r_multiples)) if r_multiples else 0.0
    worst_trade_r = float(min(r_multiples)) if r_multiples else 0.0

    max_consec_wins = 0
    max_consec_losses = 0
    cur_wins = 0
    cur_losses = 0
    sl_verified_count = 0
    sl_estimated_count = 0
    risk_1r_values: list[float] = []
    for td in trade_deals:
        if float(td.get("risk_r", 0.0) or 0.0) > 0:
            risk_1r_values.append(float(td["risk_r"]))
        if td.get("risk_source") == "sl":
            sl_verified_count += 1
        else:
            sl_estimated_count += 1
        if float(td["net_profit"]) > 0:
            cur_wins += 1
            cur_losses = 0
            max_consec_wins = max(max_consec_wins, cur_wins)
        elif float(td["net_profit"]) < 0:
            cur_losses += 1
            cur_wins = 0
            max_consec_losses = max(max_consec_losses, cur_losses)

    loss_rate = (lost_count / total_trades) if total_trades > 0 else 0.0
    expectancy = ((win_rate / 100.0) * avg_win) - (loss_rate * avg_loss)

    if total_trades > 0 and avg_loss > 0 and avg_win > 0:
        w_prob = win_rate / 100.0
        kelly = w_prob - ((1.0 - w_prob) / (avg_win / avg_loss))
        half_kelly_pct = round(max(0.0, kelly * 0.5 * 100.0), 2)
    else:
        half_kelly_pct = 0.0

    sharpe_ratio, sortino_ratio = compute_sharpe_sortino(cstate.daily_returns)
    total_gain_pct = (cstate.twr_factor - 1.0) * 100.0
    abs_gain_pct = (
        (total_profit / max(1.0, cstate.total_deposits)) * 100.0
        if cstate.total_deposits > 0
        else total_gain_pct
    )

    if trade_deals:
        span_days = max(
            1.0,
            (int(trade_deals[-1].get("time", 0) or 0) - int(trade_deals[0].get("time", 0) or 0))
            / 86400.0,
        )
    else:
        span_days = 1.0
    daily_gain_pct = total_gain_pct / span_days
    monthly_gain_pct = daily_gain_pct * 30.4

    recovery_factor = (
        round(total_profit / cstate.max_dd_amount, 2) if cstate.max_dd_amount > 0 else 0.0
    )
    annualized_return_pct = (
        (total_gain_pct / span_days) * 365.0 if span_days >= 1.0 else total_gain_pct
    )
    calmar_ratio = (
        round(annualized_return_pct / cstate.max_dd_pct, 2) if cstate.max_dd_pct > 0 else 0.0
    )
    max_dd_duration_days = round(cstate.max_dd_duration_sec / 86400.0, 1)

    today_profit, week_profit, month_profit, today_r, week_r, month_r = compute_period_pnl(
        trade_deals
    )

    total_pips = round(float(sum(float(t.get("pips", 0.0) or 0.0) for t in trade_deals)), 1)
    winning_pips = [float(t.get("pips", 0.0) or 0.0) for t in winning_trades]
    losing_pips = [float(t.get("pips", 0.0) or 0.0) for t in losing_trades]
    avg_win_pips = round(float(np.mean(winning_pips)), 1) if winning_pips else 0.0
    avg_loss_pips = round(float(np.mean(losing_pips)), 1) if losing_pips else 0.0
    total_lots = round(float(sum(float(t.get("volume", 0.0) or 0.0) for t in trade_deals)), 2)

    best_deal = max(trade_deals, key=lambda x: float(x["net_profit"]), default=None)
    worst_deal = min(trade_deals, key=lambda x: float(x["net_profit"]), default=None)
    best_pips_deal = max(trade_deals, key=lambda x: float(x.get("pips", 0.0) or 0.0), default=None)
    worst_pips_deal = min(trade_deals, key=lambda x: float(x.get("pips", 0.0) or 0.0), default=None)

    all_durations = [int(t.get("duration_seconds", 0) or 0) for t in trade_deals]
    avg_len_sec = int(np.mean(all_durations)) if all_durations else 0

    all_profits = [float(t["net_profit"]) for t in trade_deals]
    profit_std_dev = round(float(np.std(all_profits, ddof=1)), 3) if len(all_profits) > 1 else 0.0

    z_score, z_score_p_val = compute_z_score(trade_deals, won_count, lost_count)
    loss_rate_dec = (lost_count / total_trades) if total_trades > 0 else 0.0
    win_rate_dec = (won_count / total_trades) if total_trades > 0 else 0.0
    expectancy_pips = round((win_rate_dec * avg_win_pips) - (loss_rate_dec * abs(avg_loss_pips)), 1)

    ahpr_pct, ghpr_pct = compute_ahpr_ghpr(
        trade_deals,
        cstate.initial_deposit,
        float(current_account.get("balance", 100.0) or 100.0),
    )

    latest_bal = float(current_account.get("balance", cstate.current_run_bal) or cstate.current_run_bal)
    latest_eq = float(current_account.get("equity", latest_bal) or latest_bal)

    risk_of_ruin = compute_risk_of_ruin(
        current_balance=latest_bal,
        avg_win=avg_win,
        avg_loss=avg_loss,
        won_count=won_count,
        win_rate_dec=win_rate_dec,
        loss_rate_dec=loss_rate_dec,
    )
    hourly_stats, day_of_week_stats = build_hourly_and_dow_stats(trade_deals)

    return {
        "account": current_account,
        "stats": {
            "gain_pct": round(total_gain_pct, 2),
            "abs_gain_pct": round(abs_gain_pct, 2),
            "daily_gain_pct": round(daily_gain_pct, 2),
            "monthly_gain_pct": round(monthly_gain_pct, 2),
            "max_drawdown_pct": round(cstate.max_dd_pct, 2),
            "current_drawdown_pct": round(
                max(0.0, (cstate.peak_balance - latest_eq) / cstate.peak_balance * 100.0), 2
            )
            if cstate.peak_balance > 0
            else 0.0,
            "max_drawdown_amount": round(cstate.max_dd_amount, 2),
            "max_drawdown_r": round(cstate.max_dd_r, 2),
            "balance": round(latest_bal, 2),
            "equity": round(latest_eq, 2),
            "highest_balance": round(max(cstate.peak_balance, latest_bal), 2),
            "total_profit": round(total_profit, 2),
            "total_swap": round(total_swap, 2),
            "total_commission": round(total_commission, 2),
            "deposits": round(cstate.total_deposits, 2),
            "withdrawals": round(cstate.total_withdrawals, 2),
            "total_trades": total_trades,
            "won_trades": won_count,
            "lost_trades": lost_count,
            "breakeven_trades": max(0, total_trades - won_count - lost_count),
            "win_rate": round(win_rate, 2),
            "profit_factor": round(profit_factor, 2),
            "sharpe_ratio": round(sharpe_ratio, 2),
            "sortino_ratio": round(sortino_ratio, 2),
            "calmar_ratio": calmar_ratio,
            "recovery_factor": recovery_factor,
            "half_kelly_pct": half_kelly_pct,
            "max_consecutive_wins": max_consec_wins,
            "max_consecutive_losses": max_consec_losses,
            "max_dd_duration_days": max_dd_duration_days,
            "sl_verified_count": sl_verified_count,
            "sl_estimated_count": sl_estimated_count,
            "avg_1r": round(float(np.mean(risk_1r_values)), 2) if risk_1r_values else 0.0,
            "median_1r": round(float(np.median(risk_1r_values)), 2) if risk_1r_values else 0.0,
            "today_profit": round(today_profit, 2),
            "week_profit": round(week_profit, 2),
            "month_profit": round(month_profit, 2),
            "today_r": round(today_r, 2),
            "week_r": round(week_r, 2),
            "month_r": round(month_r, 2),
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
            "total_r": round(cstate.cum_r, 2),
            "sqn": round(sqn, 2),
            "sqn_rating": get_sqn_rating(sqn),
            "r_expectancy": round(avg_r, 3),
            "r_std_dev": round(std_r, 3),
            "avg_win_r": round(avg_win_r, 2),
            "avg_loss_r": round(avg_loss_r, 2),
            "best_trade_r": round(best_trade_r, 2),
            "worst_trade_r": round(worst_trade_r, 2),
            "profitability_won_pct": round(win_rate, 1),
            "profitability_lost_pct": round(100.0 - win_rate, 1) if total_trades > 0 else 0.0,
            "total_pips": total_pips,
            "avg_win_pips": avg_win_pips,
            "avg_loss_pips": avg_loss_pips,
            "total_lots": total_lots,
            "best_trade_date": _fmt_trade_date(best_deal.get("time")) if best_deal else "",
            "worst_trade_date": _fmt_trade_date(worst_deal.get("time")) if worst_deal else "",
            "best_trade_pips": round(float(best_pips_deal.get("pips", 0.0) or 0.0), 1)
            if best_pips_deal
            else 0.0,
            "best_trade_pips_date": _fmt_trade_date(best_pips_deal.get("time"))
            if best_pips_deal
            else "",
            "worst_trade_pips": round(float(worst_pips_deal.get("pips", 0.0) or 0.0), 1)
            if worst_pips_deal
            else 0.0,
            "worst_trade_pips_date": _fmt_trade_date(worst_pips_deal.get("time"))
            if worst_pips_deal
            else "",
            "avg_trade_length_seconds": avg_len_sec,
            "avg_trade_length_str": format_duration(avg_len_sec),
            "profit_std_dev": profit_std_dev,
            "z_score": z_score,
            "z_score_p_value": z_score_p_val,
            "expectancy_pips": expectancy_pips,
            "ahpr_pct": ahpr_pct,
            "ghpr_pct": ghpr_pct,
            "is_sample_developing": total_trades < 30,
            "sample_trades": total_trades,
            "min_sample_target": 30,
            "benchmark_target": 100,
            "trade_scope": trade_scope,
            "available_closed_trades": available_closed_count,
        },
        "curves": cstate.curves,
        "monthly_matrix": build_monthly_matrix(
            trade_deals,
            cstate.month_start_balances,
            cstate.current_run_bal,
            cstate.total_deposits,
        ),
        "monthly_analytics": build_monthly_analytics(
            trade_deals,
            cstate.month_start_balances,
            cstate.current_run_bal,
        ),
        "symbol_stats": build_symbol_stats(trade_deals),
        "hourly_stats": hourly_stats,
        "day_of_week_stats": day_of_week_stats,
        "calendar_days": build_calendar_days(trade_deals),
        "currency_summary": build_currency_summary(trade_deals),
        "duration_trades": build_duration_trades(trade_deals),
        "risk_of_ruin": risk_of_ruin,
        "r_distribution": build_r_distribution(r_multiples),
        "excursion_stats": compute_excursion_stats(trade_deals, winning_trades),
        "audit_stats": compute_audit_summary(
            trade_deals,
            notes_map,
            r_expectancy=round(avg_r, 3),
            revenge_window_min=revenge_window_min,
        ),
        "cashflows": cstate.cashflows[::-1],
        "available_symbols": available_symbols,
        "available_comments": available_comments,
        "available_magics": available_magics,
        "available_setup_tags": available_setup_tags,
        "available_mistake_tags": available_mistake_tags,
        "closed_trades": trade_deals[::-1],
    }
