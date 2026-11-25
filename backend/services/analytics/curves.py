from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from backend.domain.pips import calculate_trade_pips
from backend.domain.risk import compute_1r_risk, is_valid_losing_sl
from backend.services.analytics.filters import format_duration


@dataclass(slots=True)
class CurveState:
    trade_deals: list[dict[str, Any]]
    cashflows: list[dict[str, Any]]
    curves: list[dict[str, Any]]
    daily_returns: dict[str, float]
    month_start_balances: dict[tuple[int, int], float]
    initial_deposit: float
    total_deposits: float
    total_withdrawals: float
    current_run_bal: float
    peak_balance: float
    max_dd_pct: float
    max_dd_amount: float
    max_dd_r: float
    max_dd_duration_sec: int
    cum_profit: float
    cum_r: float
    twr_factor: float


def build_curves_and_trades(
    filtered_deals: list[dict[str, Any]],
    entry_fees_by_pos: dict[int, float],
    scope_starting_balance: float,
    current_account: dict[str, Any],
    default_risk_pct: float,
    is_unfiltered: bool,
    end_time: int | None,
    notes_map: dict[int, dict[str, Any]] | None = None,
) -> CurveState:
    """Enrich closed trades with 1R/pips/duration and build TWR equity/balance curves."""
    running_balance = scope_starting_balance
    initial_deposit = scope_starting_balance
    total_deposits = scope_starting_balance if scope_starting_balance > 0 else 0.0
    total_withdrawals = 0.0

    trade_deals: list[dict[str, Any]] = []
    cashflows: list[dict[str, Any]] = []
    daily_returns: dict[str, float] = {}
    curve_events: list[tuple[str, int, Any]] = []

    for d in filtered_deals:
        dtype = int(d.get("type", 0) or 0)
        profit = float(d.get("profit", 0.0) or 0.0)
        swap = float(d.get("swap", 0.0) or 0.0)
        commission = float(d.get("commission", 0.0) or 0.0)

        if dtype == 2:
            if profit > 0:
                total_deposits += profit
                if initial_deposit == 0.0:
                    initial_deposit = profit
            else:
                total_withdrawals += abs(profit)
            running_balance += profit
            cashflows.append(
                {
                    "ticket": d.get("ticket", 0),
                    "time": d.get("time", 0),
                    "amount": round(profit, 2),
                    "type": "Deposit" if profit >= 0 else "Withdrawal",
                    "comment": d.get("comment", "") or "",
                    "balance_after": round(running_balance, 2),
                }
            )
            curve_events.append(("cashflow", int(d.get("time", 0) or 0), profit))
        else:
            entry = int(d.get("entry", 1) or 0)
            if entry in (1, 2):
                pid = int(d.get("position_id", 0) or 0)
                matched_in_comm = entry_fees_by_pos.pop(pid, 0.0) if pid > 0 else 0.0
                total_comm_deal = commission + matched_in_comm
                net_trade_profit = profit + swap + total_comm_deal

                open_p = float(d.get("open_price", 0.0) or d.get("price", 0.0) or 0.0)
                sl_p = float(d.get("sl", 0.0) or 0.0)
                ticket_id = int(d.get("ticket", 0) or 0)
                note_obj = (notes_map or {}).get(ticket_id)
                raw_manual_sl = note_obj.get("initial_sl") if note_obj else None
                manual_sl = float(raw_manual_sl) if raw_manual_sl is not None else 0.0
                has_manual_sl = is_valid_losing_sl(dtype, open_p, manual_sl)

                if has_manual_sl:
                    cached_init_risk = (
                        float(note_obj.get("initial_risk_r") or 0.0) if note_obj else 0.0
                    )
                    risk_deal = dict(d)
                    risk_deal["sl"] = manual_sl
                    risk_deal["risk_r"] = cached_init_risk if cached_init_risk > 0.01 else 0.0
                    risk_1r = compute_1r_risk(
                        risk_deal, max(1.0, running_balance), default_risk_pct
                    )
                    risk_source = "manual_sl"
                    sl_diff_pts = round(abs(open_p - manual_sl), 5)
                else:
                    risk_1r = compute_1r_risk(d, max(1.0, running_balance), default_risk_pct)
                    has_initial_sl = is_valid_losing_sl(dtype, open_p, sl_p)
                    risk_source = "sl" if has_initial_sl else "balance_pct"
                    sl_diff_pts = round(abs(open_p - sl_p), 5) if has_initial_sl else 0.0

                r_mult = round(net_trade_profit / risk_1r, 3) if risk_1r > 0 else 0.0

                mae_amt = float(d.get("mae_amount", 0.0) or 0.0)
                mfe_amt = float(d.get("mfe_amount", 0.0) or 0.0)
                mae_pips = float(d.get("mae_pips", 0.0) or 0.0)
                mfe_pips = float(d.get("mfe_pips", 0.0) or 0.0)
                mae_r = (
                    round(mae_amt / risk_1r, 2)
                    if risk_1r > 0
                    else float(d.get("mae_r", 0.0) or 0.0)
                )
                mfe_r = (
                    round(mfe_amt / risk_1r, 2)
                    if risk_1r > 0
                    else float(d.get("mfe_r", 0.0) or 0.0)
                )

                deal_record = dict(d)
                deal_record["commission"] = round(total_comm_deal, 2)
                deal_record["net_profit"] = net_trade_profit
                deal_record["risk_r"] = risk_1r
                deal_record["r_multiple"] = r_mult
                deal_record["risk_source"] = risk_source
                deal_record["sl_diff_pts"] = sl_diff_pts
                deal_record["initial_sl"] = manual_sl if has_manual_sl else None
                deal_record["mae_amount"] = mae_amt
                deal_record["mfe_amount"] = mfe_amt
                deal_record["mae_pips"] = mae_pips
                deal_record["mfe_pips"] = mfe_pips
                deal_record["mae_r"] = mae_r
                deal_record["mfe_r"] = mfe_r

                pips_val = calculate_trade_pips(d)
                open_t = int(d.get("open_time", 0) or d.get("time", 0) or 0)
                close_t = int(d.get("time", 0) or 0)
                dur_sec = max(0, close_t - open_t) if close_t >= open_t else 0
                deal_record["pips"] = pips_val
                deal_record["open_time"] = open_t
                deal_record["duration_seconds"] = dur_sec
                deal_record["duration_str"] = format_duration(dur_sec)
                deal_record["type_str"] = "BUY" if dtype == 0 else "SELL"

                trade_deals.append(deal_record)
                curve_events.append(("trade", close_t, deal_record))
                running_balance += net_trade_profit

        dt = datetime.fromtimestamp(int(d.get("time", 0) or 0), tz=UTC)
        daily_returns[dt.strftime("%Y-%m-%d")] = running_balance

    curves: list[dict[str, Any]] = []
    current_run_bal = scope_starting_balance
    peak_balance = scope_starting_balance
    peak_time = int(filtered_deals[0].get("time", 0) or 0) if filtered_deals else 0
    max_dd_duration_sec = 0
    cum_r = 0.0
    max_dd_pct = 0.0
    max_dd_amount = 0.0
    max_dd_r = 0.0
    peak_r = 0.0
    twr_factor = 1.0
    equity_twr_factor = 1.0
    cum_profit = 0.0
    month_start_balances: dict[tuple[int, int], float] = {}

    if scope_starting_balance > 0 and filtered_deals:
        curves.append(
            {
                "timestamp": filtered_deals[0].get("time", 0),
                "balance": round(current_run_bal, 2),
                "equity": round(current_run_bal, 2),
                "profit": 0.0,
                "growth_pct": 0.0,
                "equity_growth_pct": 0.0,
                "drawdown_pct": 0.0,
                "cumulative_r": 0.0,
                "r_drawdown": 0.0,
            }
        )

    for ev_type, ev_ts, ev_payload in curve_events:
        if ev_type == "cashflow":
            cf_amt = float(ev_payload)
            current_run_bal += cf_amt
            if current_run_bal > peak_balance:
                peak_balance = current_run_bal
                peak_time = ev_ts
            if not curves:
                curves.append(
                    {
                        "timestamp": ev_ts,
                        "balance": round(current_run_bal, 2),
                        "equity": round(current_run_bal, 2),
                        "profit": round(cum_profit, 2),
                        "growth_pct": round((twr_factor - 1.0) * 100.0, 2),
                        "equity_growth_pct": round((equity_twr_factor - 1.0) * 100.0, 2),
                        "drawdown_pct": 0.0,
                        "cumulative_r": round(cum_r, 2),
                        "r_drawdown": round(peak_r - cum_r, 2),
                    }
                )
            continue

        td: dict[str, Any] = ev_payload
        dt_ev = datetime.fromtimestamp(ev_ts, tz=UTC)
        ym_key = (dt_ev.year, dt_ev.month)
        if ym_key not in month_start_balances:
            month_start_balances[ym_key] = max(1.0, current_run_bal)

        net_p = float(td["net_profit"])
        r_val = float(td["r_multiple"])
        prev_bal = current_run_bal
        current_run_bal += net_p
        cum_profit += net_p
        cum_r += r_val

        if prev_bal > 0:
            twr_factor *= max(1e-6, (prev_bal + net_p) / prev_bal)

        mae_dip = abs(float(td.get("mae_amount", 0.0) or 0.0))
        intra_eq = min(current_run_bal, prev_bal - mae_dip) if mae_dip > 0 else current_run_bal
        if prev_bal > 0:
            equity_twr_factor = (
                twr_factor * max(1e-6, intra_eq / max(1.0, current_run_bal))
                if mae_dip > 0
                else twr_factor
            )

        if current_run_bal > peak_balance:
            peak_balance = current_run_bal
            peak_time = ev_ts
        else:
            dur_dd = max(0, ev_ts - peak_time)
            if dur_dd > max_dd_duration_sec:
                max_dd_duration_sec = dur_dd

        dd_amount = max(0.0, peak_balance - intra_eq)
        dd_pct = (dd_amount / peak_balance * 100.0) if peak_balance > 0 else 0.0
        max_dd_pct = max(max_dd_pct, dd_pct)
        max_dd_amount = max(max_dd_amount, dd_amount)

        if cum_r > peak_r:
            peak_r = cum_r
        dd_r = peak_r - cum_r
        max_dd_r = max(max_dd_r, dd_r)

        growth_pct = (twr_factor - 1.0) * 100.0
        eq_growth_pct = (equity_twr_factor - 1.0) * 100.0
        trade_chg_pct = (net_p / max(1.0, prev_bal)) * 100.0

        curves.append(
            {
                "timestamp": td.get("time", 0),
                "balance": round(current_run_bal, 2),
                "equity": round(intra_eq, 2),
                "profit": round(cum_profit, 2),
                "growth_pct": round(growth_pct, 2),
                "equity_growth_pct": round(eq_growth_pct, 2),
                "drawdown_pct": round(dd_pct, 2),
                "cumulative_r": round(cum_r, 2),
                "r_drawdown": round(dd_r, 2),
                "change_pct": round(trade_chg_pct, 2),
                "change_amount": round(net_p, 2),
                "change_r": round(r_val, 2),
            }
        )

    if curves and end_time is None:
        floating_pnl = 0.0
        if is_unfiltered and current_account:
            acc_bal = float(current_account.get("balance", 0.0) or 0.0)
            acc_eq = float(current_account.get("equity", 0.0) or 0.0)
            if acc_bal > 0 or acc_eq > 0:
                floating_pnl = acc_eq - acc_bal

        last_pt = curves[-1]
        now_ts = max(int(time.time()), int(last_pt["timestamp"]) + 1)
        live_bal = current_run_bal
        live_eq = live_bal + floating_pnl
        live_eq_twr = (
            twr_factor * max(1e-6, live_eq / max(1.0, live_bal))
            if abs(floating_pnl) > 1e-9 and live_bal > 0
            else twr_factor
        )
        live_eq_growth_pct = (live_eq_twr - 1.0) * 100.0
        live_dd_amount = max(0.0, peak_balance - live_eq)
        live_dd_pct = (live_dd_amount / peak_balance * 100.0) if peak_balance > 0 else 0.0

        curves.append(
            {
                "timestamp": now_ts,
                "balance": round(live_bal, 2),
                "equity": round(live_eq, 2),
                "profit": last_pt["profit"],
                "growth_pct": last_pt["growth_pct"],
                "equity_growth_pct": round(live_eq_growth_pct, 2),
                "drawdown_pct": round(live_dd_pct, 2),
                "cumulative_r": last_pt["cumulative_r"],
                "r_drawdown": last_pt["r_drawdown"],
                "change_pct": 0.0,
                "change_amount": 0.0,
                "change_r": 0.0,
            }
        )

    return CurveState(
        trade_deals=trade_deals,
        cashflows=cashflows,
        curves=curves,
        daily_returns=daily_returns,
        month_start_balances=month_start_balances,
        initial_deposit=initial_deposit,
        total_deposits=total_deposits,
        total_withdrawals=total_withdrawals,
        current_run_bal=current_run_bal,
        peak_balance=peak_balance,
        max_dd_pct=max_dd_pct,
        max_dd_amount=max_dd_amount,
        max_dd_r=max_dd_r,
        max_dd_duration_sec=max_dd_duration_sec,
        cum_profit=cum_profit,
        cum_r=cum_r,
        twr_factor=twr_factor,
    )
