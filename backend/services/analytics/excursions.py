from __future__ import annotations

from typing import Any

import numpy as np


def compute_excursion_stats(
    trade_deals: list[dict[str, Any]],
    winning_trades: list[dict[str, Any]],
) -> dict[str, Any]:
    """Compute MAE/MFE percentiles, capture efficiency, and per-trade excursion series."""
    winning_mae_pips = [
        t["mae_pips"]
        for t in winning_trades
        if t.get("mae_pips") is not None and t["mae_pips"] > 0
    ]
    winning_mae_amt = [
        t["mae_amount"]
        for t in winning_trades
        if t.get("mae_amount") is not None and t["mae_amount"] > 0
    ]
    winning_mae_r = [
        t["mae_r"]
        for t in winning_trades
        if t.get("mae_r") is not None and t["mae_r"] > 0
    ]

    winning_mfe_pips = [
        t["mfe_pips"]
        for t in winning_trades
        if t.get("mfe_pips") is not None and t["mfe_pips"] > 0
    ]
    winning_mfe_amt = [
        t["mfe_amount"]
        for t in winning_trades
        if t.get("mfe_amount") is not None and t["mfe_amount"] > 0
    ]
    winning_mfe_r = [
        t["mfe_r"]
        for t in winning_trades
        if t.get("mfe_r") is not None and t["mfe_r"] > 0
    ]

    efficiencies = [
        (t["net_profit"] / t["mfe_amount"] * 100.0)
        for t in winning_trades
        if t.get("mfe_amount", 0) > 0 and t["net_profit"] > 0
    ]

    all_mae_pips = [t["mae_pips"] for t in trade_deals if t.get("mae_pips") is not None]
    all_mae_amt = [t["mae_amount"] for t in trade_deals if t.get("mae_amount") is not None]
    all_mae_r = [t["mae_r"] for t in trade_deals if t.get("mae_r") is not None]
    all_mfe_pips = [t["mfe_pips"] for t in trade_deals if t.get("mfe_pips") is not None]
    all_mfe_amt = [t["mfe_amount"] for t in trade_deals if t.get("mfe_amount") is not None]
    all_mfe_r = [t["mfe_r"] for t in trade_deals if t.get("mfe_r") is not None]

    return {
        "optimal_sl_pips": round(float(np.percentile(winning_mae_pips, 90)), 1)
        if winning_mae_pips
        else 0.0,
        "optimal_sl_amount": round(float(np.percentile(winning_mae_amt, 90)), 2)
        if winning_mae_amt
        else 0.0,
        "optimal_sl_r": round(float(np.percentile(winning_mae_r, 90)), 2)
        if winning_mae_r
        else 0.0,
        "optimal_sl_p50_pips": round(float(np.percentile(winning_mae_pips, 50)), 1)
        if winning_mae_pips
        else 0.0,
        "optimal_sl_p50_amount": round(float(np.percentile(winning_mae_amt, 50)), 2)
        if winning_mae_amt
        else 0.0,
        "optimal_sl_p50_r": round(float(np.percentile(winning_mae_r, 50)), 2)
        if winning_mae_r
        else 0.0,
        "optimal_tp_p50_pips": round(float(np.percentile(winning_mfe_pips, 50)), 1)
        if winning_mfe_pips
        else 0.0,
        "optimal_tp_p50_amount": round(float(np.percentile(winning_mfe_amt, 50)), 2)
        if winning_mfe_amt
        else 0.0,
        "optimal_tp_p50_r": round(float(np.percentile(winning_mfe_r, 50)), 2)
        if winning_mfe_r
        else 0.0,
        "optimal_tp_p90_pips": round(float(np.percentile(winning_mfe_pips, 90)), 1)
        if winning_mfe_pips
        else 0.0,
        "optimal_tp_p90_amount": round(float(np.percentile(winning_mfe_amt, 90)), 2)
        if winning_mfe_amt
        else 0.0,
        "optimal_tp_p90_r": round(float(np.percentile(winning_mfe_r, 90)), 2)
        if winning_mfe_r
        else 0.0,
        "mfe_capture_efficiency_pct": round(float(np.mean(efficiencies)), 1)
        if efficiencies
        else 0.0,
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
        ],
    }
