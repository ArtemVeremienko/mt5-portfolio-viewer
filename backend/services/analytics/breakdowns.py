from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import numpy as np

from backend.services.analytics.filters import format_duration

_MONTH_NAMES_FULL = (
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)
_MONTH_NAMES_SHORT = (
    "",
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)
_DOW_NAMES = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


def build_monthly_matrix(
    trade_deals: list[dict[str, Any]],
    month_start_balances: dict[tuple[int, int], float],
    current_run_bal: float,
    total_deposits: float,
) -> list[dict[str, Any]]:
    monthly_data: dict[tuple[int, int], dict[str, Any]] = {}
    for td in trade_deals:
        dt = datetime.fromtimestamp(int(td.get("time", 0) or 0), tz=UTC)
        key = (dt.year, dt.month)
        if key not in monthly_data:
            monthly_data[key] = {"profit": 0.0, "r": 0.0, "trades": 0}
        monthly_data[key]["profit"] += float(td["net_profit"])
        monthly_data[key]["r"] += float(td["r_multiple"])
        monthly_data[key]["trades"] += 1

    years_set = sorted({k[0] for k in monthly_data}, reverse=True)
    monthly_matrix: list[dict[str, Any]] = []
    for yr in years_set:
        months_map: dict[int, dict[str, Any] | None] = {}
        yr_start_bal: float | None = None
        tot_profit = 0.0
        tot_r = 0.0
        for mo in range(1, 13):
            if (yr, mo) in monthly_data:
                m_info = monthly_data[(yr, mo)]
                m_profit = float(m_info["profit"])
                m_r = float(m_info["r"])
                m_base = month_start_balances.get((yr, mo), max(1.0, current_run_bal))
                if yr_start_bal is None:
                    yr_start_bal = m_base
                m_pct = (m_profit / max(1.0, m_base)) * 100.0
                months_map[mo] = {
                    "profit": round(m_profit, 2),
                    "r": round(m_r, 2),
                    "pct": round(m_pct, 2),
                    "trades": int(m_info["trades"]),
                }
                tot_profit += m_profit
                tot_r += m_r
            else:
                months_map[mo] = None
        monthly_matrix.append(
            {
                "year": yr,
                "months": months_map,
                "total_profit": round(tot_profit, 2),
                "total_r": round(tot_r, 2),
                "total_pct": round(
                    (tot_profit / max(1.0, yr_start_bal or total_deposits)) * 100.0, 2
                ),
            }
        )
    return monthly_matrix


def build_monthly_analytics(
    trade_deals: list[dict[str, Any]],
    month_start_balances: dict[tuple[int, int], float],
    current_run_bal: float,
) -> list[dict[str, Any]]:
    monthly_trades_map: dict[tuple[int, int], list[dict[str, Any]]] = {}
    for td in trade_deals:
        dt = datetime.fromtimestamp(int(td.get("time", 0) or 0), tz=UTC)
        monthly_trades_map.setdefault((dt.year, dt.month), []).append(td)

    monthly_analytics: list[dict[str, Any]] = []
    for (yr, mo), m_trades in sorted(monthly_trades_map.items(), key=lambda x: (x[0][0], x[0][1])):
        m_tot_profit = sum(float(t["net_profit"]) for t in m_trades)
        m_tot_lots = sum(float(t.get("volume", 0.0) or 0.0) for t in m_trades)
        m_tot_pips = sum(float(t.get("pips", 0.0) or 0.0) for t in m_trades)
        m_won = sum(1 for t in m_trades if float(t["net_profit"]) > 0)
        m_lost = sum(1 for t in m_trades if float(t["net_profit"]) < 0)
        m_base = month_start_balances.get((yr, mo), max(1.0, current_run_bal))
        m_change_pct = (m_tot_profit / max(1.0, m_base)) * 100.0

        curr_map: dict[str, dict[str, Any]] = {}
        for t in m_trades:
            sym = str(t.get("symbol", "OTHER") or "OTHER")
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
                    "lots": 0.0,
                }
            entry = curr_map[sym]
            net_p = float(t["net_profit"])
            entry["trades"] += 1
            entry["profit"] += net_p
            entry["pips"] += float(t.get("pips", 0.0) or 0.0)
            entry["lots"] += float(t.get("volume", 0.0) or 0.0)
            entry["r_multiples"].append(float(t.get("r_multiple", 0.0) or 0.0))
            if net_p > 0:
                entry["wins"].append(net_p)
            else:
                entry["losses"].append(abs(net_p))
            dur = int(t.get("duration_seconds", 0) or 0)
            if int(t.get("type", 0) or 0) == 0:
                entry["long_durations"].append(dur)
            else:
                entry["short_durations"].append(dur)

        currencies_list: list[dict[str, Any]] = []
        tot_m_trades = len(m_trades)
        for sym, c_data in curr_map.items():
            sym_trades_cnt = int(c_data["trades"])
            pop_pct = round((sym_trades_cnt / tot_m_trades) * 100.0, 1) if tot_m_trades > 0 else 0.0
            wins: list[float] = c_data["wins"]
            losses: list[float] = c_data["losses"]
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

            long_durs: list[int] = c_data["long_durations"]
            short_durs: list[int] = c_data["short_durations"]
            all_durs = long_durs + short_durs
            avg_long_sec = int(np.mean(long_durs)) if long_durs else 0
            avg_short_sec = int(np.mean(short_durs)) if short_durs else 0
            avg_tot_sec = int(np.mean(all_durs)) if all_durs else 0

            currencies_list.append(
                {
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
                    "profit": round(float(c_data["profit"]), 2),
                    "pips": round(float(c_data["pips"]), 1),
                    "lots": round(float(c_data["lots"]), 2),
                }
            )

        currencies_list.sort(key=lambda x: x["trades"], reverse=True)
        monthly_analytics.append(
            {
                "year": yr,
                "month": mo,
                "month_name": _MONTH_NAMES_FULL[mo],
                "short_name": f"{_MONTH_NAMES_SHORT[mo]} {yr}",
                "change_pct": round(m_change_pct, 2),
                "profit": round(m_tot_profit, 2),
                "lots": round(m_tot_lots, 2),
                "pips": round(m_tot_pips, 1),
                "trades": tot_m_trades,
                "won": m_won,
                "lost": m_lost,
                "currencies": currencies_list,
            }
        )
    return monthly_analytics


def build_symbol_stats(trade_deals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    symbol_dict: dict[str, dict[str, Any]] = {}
    for td in trade_deals:
        sym = str(td.get("symbol", "OTHER") or "OTHER")
        if sym not in symbol_dict:
            symbol_dict[sym] = {"symbol": sym, "trades": 0, "profit": 0.0, "r": 0.0, "won": 0}
        entry = symbol_dict[sym]
        entry["trades"] += 1
        entry["profit"] += float(td["net_profit"])
        entry["r"] += float(td["r_multiple"])
        if float(td["net_profit"]) > 0:
            entry["won"] += 1

    out: list[dict[str, Any]] = [
        {
            "symbol": sym,
            "trades": int(val["trades"]),
            "profit": round(float(val["profit"]), 2),
            "r": round(float(val["r"]), 2),
            "win_rate": round(int(val["won"]) / int(val["trades"]) * 100.0, 1),
        }
        for sym, val in symbol_dict.items()
    ]
    out.sort(key=lambda x: int(x["trades"]), reverse=True)
    return out


def build_hourly_and_dow_stats(
    trade_deals: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    hourly_dict: dict[int, dict[str, Any]] = {
        h: {"hour": h, "trades": 0, "profit": 0.0, "r": 0.0, "won": 0, "lost": 0}
        for h in range(24)
    }
    dow_dict: dict[int, dict[str, Any]] = {
        i: {"day": _DOW_NAMES[i], "trades": 0, "profit": 0.0, "r": 0.0, "won": 0, "lost": 0}
        for i in range(7)
    }

    for td in trade_deals:
        dt = datetime.fromtimestamp(int(td.get("time", 0) or 0), tz=UTC)
        h_entry = hourly_dict[dt.hour]
        d_entry = dow_dict[dt.weekday()]
        net_p = float(td["net_profit"])
        r_val = float(td["r_multiple"])
        for bucket in (h_entry, d_entry):
            bucket["trades"] += 1
            bucket["profit"] += net_p
            bucket["r"] += r_val
            if net_p > 0:
                bucket["won"] += 1
            else:
                bucket["lost"] += 1

    hourly_stats = [
        {
            "hour": h,
            "trades": int(v["trades"]),
            "won": int(v["won"]),
            "lost": int(v["lost"]),
            "profit": round(float(v["profit"]), 2),
            "r": round(float(v["r"]), 2),
        }
        for h, v in hourly_dict.items()
    ]
    day_of_week_stats = [
        {
            "day": str(v["day"]),
            "trades": int(v["trades"]),
            "won": int(v["won"]),
            "lost": int(v["lost"]),
            "profit": round(float(v["profit"]), 2),
            "r": round(float(v["r"]), 2),
        }
        for v in dow_dict.values()
    ]
    return hourly_stats, day_of_week_stats


def build_calendar_days(trade_deals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    days_dict: dict[str, dict[str, Any]] = {}
    for td in trade_deals:
        dt = datetime.fromtimestamp(int(td.get("time", 0) or 0), tz=UTC)
        d_key = dt.strftime("%Y-%m-%d")
        if d_key not in days_dict:
            days_dict[d_key] = {
                "date": d_key,
                "profit": 0.0,
                "r": 0.0,
                "trades": 0,
                "won": 0,
                "lost": 0,
                "deals": [],
            }
        day_obj = days_dict[d_key]
        net_p = float(td["net_profit"])
        day_obj["trades"] += 1
        day_obj["profit"] += net_p
        day_obj["r"] += float(td["r_multiple"])
        if net_p > 0:
            day_obj["won"] += 1
        else:
            day_obj["lost"] += 1
        day_obj["deals"].append(
            {
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
                "profit": round(net_p, 2),
                "pips": td.get("pips", 0.0),
                "commission": td.get("commission", 0.0),
                "r_multiple": td.get("r_multiple", 0.0),
            }
        )

    calendar_days: list[dict[str, Any]] = []
    for _, d_val in sorted(days_dict.items()):
        d_val["profit"] = round(float(d_val["profit"]), 2)
        d_val["r"] = round(float(d_val["r"]), 2)
        d_val["win_rate"] = (
            round(int(d_val["won"]) / int(d_val["trades"]) * 100.0, 1)
            if int(d_val["trades"]) > 0
            else 0.0
        )
        calendar_days.append(d_val)
    return calendar_days


def build_currency_summary(trade_deals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summary_dict: dict[str, dict[str, Any]] = {}
    for td in trade_deals:
        sym = str(td.get("symbol", "OTHER") or "OTHER")
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
        entry = summary_dict[sym]
        t_type = int(td.get("type", 0) or 0)
        pips_num = float(td.get("pips", 0.0) or 0.0)
        prof_num = float(td["net_profit"])

        entry["total_trades"] += 1
        entry["total_pips"] += pips_num
        entry["total_profit"] += prof_num
        if prof_num > 0:
            entry["won_count"] += 1
        elif prof_num < 0:
            entry["lost_count"] += 1

        if t_type == 0:
            entry["long_trades"] += 1
            entry["long_pips"] += pips_num
            entry["long_profit"] += prof_num
        else:
            entry["short_trades"] += 1
            entry["short_pips"] += pips_num
            entry["short_profit"] += prof_num

    out: list[dict[str, Any]] = [
        {
            "symbol": sym,
            "long_trades": int(v["long_trades"]),
            "long_pips": round(float(v["long_pips"]), 1),
            "long_profit": round(float(v["long_profit"]), 2),
            "short_trades": int(v["short_trades"]),
            "short_pips": round(float(v["short_pips"]), 1),
            "short_profit": round(float(v["short_profit"]), 2),
            "total_trades": int(v["total_trades"]),
            "total_pips": round(float(v["total_pips"]), 1),
            "total_profit": round(float(v["total_profit"]), 2),
            "won_count": int(v["won_count"]),
            "lost_count": int(v["lost_count"]),
            "won_pct": round(int(v["won_count"]) / int(v["total_trades"]) * 100.0, 1)
            if int(v["total_trades"]) > 0
            else 0.0,
            "lost_pct": round(int(v["lost_count"]) / int(v["total_trades"]) * 100.0, 1)
            if int(v["total_trades"]) > 0
            else 0.0,
        }
        for sym, v in summary_dict.items()
    ]
    out.sort(key=lambda x: int(x["total_trades"]), reverse=True)
    return out


def build_duration_trades(trade_deals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "ticket": td.get("ticket"),
            "symbol": td.get("symbol"),
            "type": td.get("type", 0),
            "type_str": td.get("type_str", "BUY"),
            "open_time": td.get("open_time", 0),
            "close_time": td.get("time", 0),
            "duration_seconds": td.get("duration_seconds", 0),
            "duration_str": td.get("duration_str", ""),
            "profit": round(float(td["net_profit"]), 2),
            "pips": td.get("pips", 0.0),
            "r_multiple": td.get("r_multiple", 0.0),
            "is_winner": float(td["net_profit"]) > 0,
        }
        for td in trade_deals[-200:]
    ]
