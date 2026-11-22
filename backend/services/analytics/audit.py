from __future__ import annotations

from typing import Any

import numpy as np

from backend.infrastructure.db.migrations import parse_tag_list


def _slice_metrics(trades: list[dict[str, Any]]) -> dict[str, Any]:
    """Compute core R & profit metrics for a trade slice."""
    n = len(trades)
    if n == 0:
        return {
            "count": 0,
            "win_rate": 0.0,
            "net_r": 0.0,
            "expectancy_r": 0.0,
            "profit_factor": 0.0,
        }
    wins = [t for t in trades if float(t.get("net_profit", 0.0) or 0.0) > 0]
    losses = [t for t in trades if float(t.get("net_profit", 0.0) or 0.0) < 0]
    gross_win = sum(float(t["net_profit"]) for t in wins)
    gross_loss = abs(sum(float(t["net_profit"]) for t in losses))
    pf = gross_win / gross_loss if gross_loss > 0 else (999.0 if gross_win > 0 else 0.0)
    r_vals = [float(t.get("r_multiple", 0.0) or 0.0) for t in trades]
    return {
        "count": n,
        "win_rate": round(len(wins) / n * 100.0, 2),
        "net_r": round(float(sum(r_vals)), 2),
        "expectancy_r": round(float(np.mean(r_vals)), 3),
        "profit_factor": round(pf, 2),
    }


def compute_oos_survival(trade_deals: list[dict[str, Any]]) -> dict[str, Any]:
    """Split chronological trades 50/50 (In-Sample vs Out-of-Sample) and compute rolling survival."""
    n = len(trade_deals)
    if n < 20:
        return {
            "eligible": False,
            "min_trades_required": 20,
            "in_sample": _slice_metrics([]),
            "out_of_sample": _slice_metrics([]),
            "oos_survived": False,
            "degradation_pct": 0.0,
            "rolling_window_size": 30,
            "rolling_positive_pct": 0.0,
            "rolling_windows_count": 0,
        }

    ordered = sorted(trade_deals, key=lambda t: (int(t.get("time", 0) or 0), int(t.get("ticket", 0) or 0)))
    mid = n // 2
    is_slice = ordered[:mid]
    oos_slice = ordered[mid:]

    is_m = _slice_metrics(is_slice)
    oos_m = _slice_metrics(oos_slice)

    is_exp = float(is_m["expectancy_r"])
    oos_exp = float(oos_m["expectancy_r"])
    degradation = (
        round((is_exp - oos_exp) / abs(is_exp) * 100.0, 1) if abs(is_exp) > 1e-6 else 0.0
    )

    win_size = 30 if n >= 30 else 10
    rolling_exps: list[float] = []
    r_arr = [float(t.get("r_multiple", 0.0) or 0.0) for t in ordered]
    for i in range(win_size, n + 1):
        window_r = r_arr[i - win_size : i]
        rolling_exps.append(float(np.mean(window_r)))

    pos_windows = sum(1 for e in rolling_exps if e > 0.0)
    rolling_pct = round(pos_windows / len(rolling_exps) * 100.0, 1) if rolling_exps else 0.0

    return {
        "eligible": True,
        "min_trades_required": 20,
        "in_sample": is_m,
        "out_of_sample": oos_m,
        "oos_survived": oos_exp > 0.0,
        "degradation_pct": degradation,
        "rolling_window_size": win_size,
        "rolling_positive_pct": rolling_pct,
        "rolling_windows_count": len(rolling_exps),
    }


def compute_execution_drift(
    trade_deals: list[dict[str, Any]],
    notes_map: dict[int, dict[str, Any]] | None = None,
    revenge_window_min: int = 30,
) -> dict[str, Any]:
    """Detect SL-widening and post-loss revenge-sizing execution drift."""
    n = len(trade_deals)
    notes_lookup = notes_map or {}
    window_sec = max(60, int(revenge_window_min) * 60)

    ordered = sorted(
        trade_deals,
        key=lambda t: (int(t.get("open_time") or t.get("time") or 0), int(t.get("ticket", 0) or 0)),
    )

    sl_widened_tickets: list[int] = []
    sl_widened_extra_r = 0.0

    revenge_tickets: list[int] = []
    revenge_net_r = 0.0

    for idx, t in enumerate(ordered):
        ticket = int(t.get("ticket", 0) or 0)
        r_mult = float(t.get("r_multiple", 0.0) or 0.0)
        risk_source = str(t.get("risk_source", "") or "")
        note = notes_lookup.get(ticket, {})
        mistake_tags = {m.lower() for m in parse_tag_list(note.get("mistake_tag"))}

        # 1. SL-Widening check: realized loss > 1.15R on SL-verified trade OR tagged "Moved SL"
        is_sl_widened = (risk_source == "sl" and r_mult < -1.15) or ("moved sl" in mistake_tags)
        if is_sl_widened:
            sl_widened_tickets.append(ticket)
            if r_mult < -1.0:
                sl_widened_extra_r += abs(r_mult) - 1.0

        # 2. Revenge-Sizing check: tagged Revenge/Oversized OR opened within window after loss with >= 1.25x size
        is_revenge = ("revenge" in mistake_tags) or ("oversized" in mistake_tags)
        if not is_revenge and idx > 0:
            prev = ordered[idx - 1]
            prev_r = float(prev.get("r_multiple", 0.0) or 0.0)
            prev_close = int(prev.get("time", 0) or 0)
            curr_open = int(t.get("open_time") or t.get("time") or 0)
            if prev_r < 0.0 and 0 <= (curr_open - prev_close) <= window_sec:
                prev_vol = float(prev.get("volume", 0.0) or 0.0)
                curr_vol = float(t.get("volume", 0.0) or 0.0)
                prev_risk = float(prev.get("risk_r", 0.0) or 0.0)
                curr_risk = float(t.get("risk_r", 0.0) or 0.0)
                if (prev_vol > 0 and curr_vol >= prev_vol * 1.25) or (
                    prev_risk > 0 and curr_risk >= prev_risk * 1.25
                ):
                    is_revenge = True

        if is_revenge:
            revenge_tickets.append(ticket)
            revenge_net_r += r_mult

    return {
        "sl_widened_count": len(sl_widened_tickets),
        "sl_widened_pct": round(len(sl_widened_tickets) / n * 100.0, 1) if n else 0.0,
        "sl_widened_extra_r": round(sl_widened_extra_r, 2),
        "sl_widened_tickets": sl_widened_tickets,
        "revenge_count": len(revenge_tickets),
        "revenge_pct": round(len(revenge_tickets) / n * 100.0, 1) if n else 0.0,
        "revenge_net_r": round(revenge_net_r, 2),
        "revenge_tickets": revenge_tickets,
        "revenge_window_min": int(revenge_window_min),
    }


def _is_bad_process(note: dict[str, Any]) -> bool:
    """Return True when a trade has a mistake tag or overall grade 'C'."""
    if parse_tag_list(note.get("mistake_tag")):
        return True
    grades = [
        str(note.get(k, "") or "").strip().upper()
        for k in ("entry_grade", "execution_grade", "management_grade")
    ]
    valid = [g for g in grades if g in ("A", "B", "C")]
    if valid and valid.count("C") >= 2:
        return True
    return "C" in valid and len(valid) == 1


def compute_process_outcome_matrix(
    trade_deals: list[dict[str, Any]],
    notes_map: dict[int, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Classify trades into the 2x2 Process vs. Outcome matrix."""
    notes_lookup = notes_map or {}
    buckets: dict[str, list[float]] = {
        "disciplined_win": [],
        "disciplined_loss": [],
        "lucky_gamble": [],
        "self_inflicted_loss": [],
    }

    for t in trade_deals:
        ticket = int(t.get("ticket", 0) or 0)
        note = notes_lookup.get(ticket, {})
        bad_proc = _is_bad_process(note)
        is_win = float(t.get("net_profit", 0.0) or 0.0) > 0.0
        r_mult = float(t.get("r_multiple", 0.0) or 0.0)

        if not bad_proc and is_win:
            buckets["disciplined_win"].append(r_mult)
        elif not bad_proc and not is_win:
            buckets["disciplined_loss"].append(r_mult)
        elif bad_proc and is_win:
            buckets["lucky_gamble"].append(r_mult)
        else:
            buckets["self_inflicted_loss"].append(r_mult)

    total = len(trade_deals)
    out: dict[str, Any] = {}
    for key, r_list in buckets.items():
        cnt = len(r_list)
        out[key] = {
            "count": cnt,
            "pct": round(cnt / total * 100.0, 1) if total else 0.0,
            "net_r": round(float(sum(r_list)), 2) if r_list else 0.0,
            "avg_r": round(float(np.mean(r_list)), 3) if r_list else 0.0,
        }
    return out


def compute_audit_summary(
    trade_deals: list[dict[str, Any]],
    notes_map: dict[int, dict[str, Any]] | None = None,
    r_expectancy: float = 0.0,
    revenge_window_min: int = 30,
) -> dict[str, Any]:
    """Compute system classification (poker/roulette/developing), OOS survival, drift, and matrix."""
    n = len(trade_deals)
    if n < 30:
        classification = "developing"
    elif r_expectancy > 0.0:
        classification = "poker"
    else:
        classification = "roulette"

    return {
        "system_classification": classification,
        "oos_survival": compute_oos_survival(trade_deals),
        "execution_drift": compute_execution_drift(
            trade_deals, notes_map, revenge_window_min=revenge_window_min
        ),
        "process_matrix": compute_process_outcome_matrix(trade_deals, notes_map),
    }
