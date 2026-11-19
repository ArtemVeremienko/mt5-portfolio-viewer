from __future__ import annotations

import bisect
import math
from typing import Any, Literal

import numpy as np

SimulationMode = Literal["coin_flip_direction", "window_jitter"]
FallbackMode = Literal["realized_1r", "atr", "fixed_rr"]
BarTimeframe = Literal["m1", "m5", "h1"]


def _find_entry_bar_index(bars: list[dict[str, Any]], open_time: int) -> int:
    """Return index of the first bar at or immediately before open_time."""
    times = [int(b["time"]) for b in bars]
    pos = bisect.bisect_right(times, open_time) - 1
    return max(0, min(pos, len(bars) - 1))


def _compute_atr(bars: list[dict[str, Any]], end_idx: int, period: int = 14) -> float:
    """Compute simple Average True Range up to end_idx."""
    start = max(1, end_idx - period + 1)
    trs: list[float] = []
    for i in range(start, end_idx + 1):
        high = float(bars[i]["high"])
        low = float(bars[i]["low"])
        prev_close = float(bars[i - 1]["close"])
        tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
        trs.append(tr)
    if not trs:
        bar = bars[end_idx]
        return max(1e-6, float(bar["high"]) - float(bar["low"]))
    return max(1e-6, float(np.mean(trs)))


def _resolve_sl_tp_distances(
    trade: dict[str, Any],
    bars: list[dict[str, Any]],
    entry_idx: int,
    fallback_mode: FallbackMode,
    atr_mult: float,
    fixed_rr: float,
) -> tuple[float, float, int]:
    """Resolve (sl_dist, tp_dist, max_hold_bars) for a trade."""
    open_price = float(trade.get("open_price") or bars[entry_idx]["open"])
    close_price = float(trade.get("price") or open_price)
    sl = float(trade.get("sl") or 0.0)
    tp = float(trade.get("tp") or 0.0)
    r_mult = abs(float(trade.get("r_multiple") or 0.0))

    if sl > 0.0 and open_price > 0.0 and abs(open_price - sl) > 1e-9:
        sl_dist = abs(open_price - sl)
    elif fallback_mode == "atr":
        sl_dist = _compute_atr(bars, entry_idx) * max(0.25, atr_mult)
    else:
        # Derive 1R price distance from realized price move / |R| when available
        price_move = abs(close_price - open_price)
        if price_move > 1e-9 and r_mult > 1e-6:
            sl_dist = price_move / r_mult
        else:
            sl_dist = _compute_atr(bars, entry_idx) * max(0.25, atr_mult)

    sl_dist = max(1e-6, sl_dist)

    if tp > 0.0 and open_price > 0.0 and abs(tp - open_price) > 1e-9:
        tp_dist = abs(tp - open_price)
    elif fallback_mode == "fixed_rr":
        tp_dist = sl_dist * max(0.25, fixed_rr)
    else:
        tp_dist = sl_dist * max(1.0, fixed_rr)

    open_ts = int(trade.get("open_time") or trade.get("time") or 0)
    close_ts = int(trade.get("time") or open_ts)
    bar_sec = max(60, int(bars[1]["time"]) - int(bars[0]["time"])) if len(bars) >= 2 else 300
    duration_bars = max(1, math.ceil(max(bar_sec, close_ts - open_ts) / bar_sec))
    return sl_dist, tp_dist, duration_bars


def compute_fixed_horizon_excursions(
    trades: list[dict[str, Any]],
    candles_by_ticket: dict[int, dict[str, list[dict[str, Any]]]],
    horizon_bars: int = 30,
    timeframe: BarTimeframe = "m5",
) -> dict[str, Any]:
    """Compute uncapped MFE_R, MAE_R, and Edge Ratio over a fixed N-bar forward horizon."""
    mfe_rs: list[float] = []
    mae_rs: list[float] = []

    for t in trades:
        ticket = int(t.get("ticket") or 0)
        bars = (candles_by_ticket.get(ticket) or {}).get(timeframe) or []
        if len(bars) < 2:
            continue

        open_ts = int(t.get("open_time") or t.get("time") or 0)
        entry_idx = _find_entry_bar_index(bars, open_ts)
        end_idx = min(len(bars), entry_idx + max(1, horizon_bars))
        if end_idx <= entry_idx:
            continue

        sl_dist, _, _ = _resolve_sl_tp_distances(
            t, bars, entry_idx, fallback_mode="realized_1r", atr_mult=1.5, fixed_rr=2.0
        )
        entry_price = float(t.get("open_price") or bars[entry_idx]["open"])
        is_buy = int(t.get("type") or 0) == 0

        window = bars[entry_idx:end_idx]
        max_high = max(float(b["high"]) for b in window)
        min_low = min(float(b["low"]) for b in window)

        if is_buy:
            fav = max(0.0, max_high - entry_price)
            adv = max(0.0, entry_price - min_low)
        else:
            fav = max(0.0, entry_price - min_low)
            adv = max(0.0, max_high - entry_price)

        mfe_rs.append(fav / sl_dist)
        mae_rs.append(adv / sl_dist)

    if not mfe_rs:
        return {
            "evaluated_trades": 0,
            "horizon_avg_mfe_r": 0.0,
            "horizon_avg_mae_r": 0.0,
            "horizon_edge_ratio": 0.0,
        }

    avg_mfe = float(np.mean(mfe_rs))
    avg_mae = float(np.mean(mae_rs))
    e_ratio = round(avg_mfe / avg_mae, 2) if avg_mae > 1e-9 else 0.0
    return {
        "evaluated_trades": len(mfe_rs),
        "horizon_avg_mfe_r": round(avg_mfe, 2),
        "horizon_avg_mae_r": round(avg_mae, 2),
        "horizon_edge_ratio": e_ratio,
    }


def compute_kelly_and_optimal_f(
    r_multiples: list[float],
    current_risk_pct: float = 1.0,
) -> dict[str, Any]:
    """Compute Full/Half/Quarter Kelly and Ralph Vince Optimal-f from R-multiples."""
    if not r_multiples:
        return {
            "full_kelly_pct": 0.0,
            "half_kelly_pct": 0.0,
            "quarter_kelly_pct": 0.0,
            "optimal_f_pct": 0.0,
            "optimal_f_risk_pct": 0.0,
            "quarter_optimal_f_risk_pct": 0.0,
            "current_risk_pct": round(current_risk_pct, 2),
            "max_twr": 1.0,
            "twr_curve": [],
        }

    wins = [r for r in r_multiples if r > 0]
    losses = [abs(r) for r in r_multiples if r < 0]
    n = len(r_multiples)
    win_prob = len(wins) / n

    if wins and losses:
        payoff_ratio = float(np.mean(wins)) / float(np.mean(losses))
        raw_kelly = win_prob - ((1.0 - win_prob) / payoff_ratio)
    elif wins and not losses:
        raw_kelly = 1.0
    else:
        raw_kelly = 0.0

    full_kelly = max(0.0, raw_kelly) * 100.0
    half_kelly = full_kelly * 0.5
    quarter_kelly = full_kelly * 0.25

    # Empirical Optimal-f via TWR maximization over normalized HPRs
    worst_loss = max(losses) if losses else 0.0
    if worst_loss <= 1e-9 or float(np.mean(r_multiples)) <= 0.0:
        return {
            "full_kelly_pct": round(full_kelly, 2),
            "half_kelly_pct": round(half_kelly, 2),
            "quarter_kelly_pct": round(quarter_kelly, 2),
            "optimal_f_pct": 0.0,
            "optimal_f_risk_pct": 0.0,
            "quarter_optimal_f_risk_pct": 0.0,
            "current_risk_pct": round(current_risk_pct, 2),
            "max_twr": 1.0,
            "twr_curve": [],
        }

    r_arr = np.array(r_multiples, dtype=np.float64)
    norm_returns = r_arr / worst_loss  # worst trade = -1.0

    f_grid = np.linspace(0.01, 0.99, 99)
    best_f = 0.0
    best_twr = 1.0
    twr_curve: list[dict[str, float]] = []

    for idx, f_val in enumerate(f_grid):
        factors = 1.0 + f_val * norm_returns
        if np.any(factors <= 1e-9):
            twr = 0.0
        else:
            # Use log-sum to avoid overflow on large trade counts
            log_twr = float(np.sum(np.log(factors)))
            twr = float(math.exp(min(log_twr, 50.0)))
        if twr > best_twr:
            best_twr = twr
            best_f = float(f_val)
        if idx % 3 == 0 or abs(f_val - best_f) < 0.01:
            twr_curve.append({"f_pct": round(float(f_val) * 100.0, 1), "twr": round(twr, 3)})

    # Equivalent risk % per 1R trade = (f* / worst_loss_R) * 100
    opt_f_risk_pct = (best_f / worst_loss) * 100.0

    return {
        "full_kelly_pct": round(full_kelly, 2),
        "half_kelly_pct": round(half_kelly, 2),
        "quarter_kelly_pct": round(quarter_kelly, 2),
        "optimal_f_pct": round(best_f * 100.0, 2),
        "optimal_f_risk_pct": round(opt_f_risk_pct, 2),
        "quarter_optimal_f_risk_pct": round(opt_f_risk_pct * 0.25, 2),
        "current_risk_pct": round(current_risk_pct, 2),
        "max_twr": round(best_twr, 3),
        "twr_curve": twr_curve,
    }


def simulate_bar_outcome(
    bars: list[dict[str, Any]],
    entry_idx: int,
    direction: int,
    sl_dist: float,
    tp_dist: float,
    max_bars: int,
    horizon_bars: int,
    cost_r: float,
) -> tuple[float, float, float]:
    """Simulate a single entry on historical bars returning (net_r, horizon_mfe_r, horizon_mae_r)."""
    entry_price = float(bars[entry_idx]["open"])
    is_buy = direction == 0
    sl_price = entry_price - sl_dist if is_buy else entry_price + sl_dist
    tp_price = entry_price + tp_dist if is_buy else entry_price - tp_dist

    end_trade_idx = min(len(bars), entry_idx + max(1, max_bars))
    realized_r: float | None = None

    for i in range(entry_idx, end_trade_idx):
        high = float(bars[i]["high"])
        low = float(bars[i]["low"])
        if is_buy:
            hit_sl = low <= sl_price
            hit_tp = high >= tp_price
        else:
            hit_sl = high >= sl_price
            hit_tp = low <= tp_price

        # Conservative tie-breaker: SL before TP on same bar
        if hit_sl:
            realized_r = -1.0
            break
        if hit_tp:
            realized_r = tp_dist / sl_dist
            break

    if realized_r is None:
        exit_close = float(bars[end_trade_idx - 1]["close"])
        move = (exit_close - entry_price) if is_buy else (entry_price - exit_close)
        realized_r = move / sl_dist

    net_r = realized_r - cost_r

    # Uncapped fixed-horizon MFE/MAE
    end_h_idx = min(len(bars), entry_idx + max(1, horizon_bars))
    h_window = bars[entry_idx:end_h_idx]
    max_high = max(float(b["high"]) for b in h_window)
    min_low = min(float(b["low"]) for b in h_window)
    if is_buy:
        mfe_r = max(0.0, max_high - entry_price) / sl_dist
        mae_r = max(0.0, entry_price - min_low) / sl_dist
    else:
        mfe_r = max(0.0, entry_price - min_low) / sl_dist
        mae_r = max(0.0, max_high - entry_price) / sl_dist

    return net_r, mfe_r, mae_r


def run_coin_flip_monte_carlo(
    trades: list[dict[str, Any]],
    candles_by_ticket: dict[int, dict[str, list[dict[str, Any]]]],
    iterations: int = 1000,
    horizon_bars: int = 30,
    timeframe: BarTimeframe = "m5",
    mode: SimulationMode = "coin_flip_direction",
    include_costs: bool = True,
    fallback_mode: FallbackMode = "realized_1r",
    atr_mult: float = 1.5,
    fixed_rr: float = 2.0,
    current_risk_pct: float = 1.0,
    seed: int | None = 42,
) -> dict[str, Any]:
    """Run Monte Carlo coin-flip entry benchmark on historical OHLC bars."""
    r_all = [float(t.get("r_multiple") or 0.0) for t in trades]
    sizing = compute_kelly_and_optimal_f(r_all, current_risk_pct=current_risk_pct)

    # Precompute eligible trade contexts with cached bars
    contexts: list[dict[str, Any]] = []
    for t in trades:
        ticket = int(t.get("ticket") or 0)
        bars = (candles_by_ticket.get(ticket) or {}).get(timeframe) or []
        if len(bars) < 3:
            continue

        open_ts = int(t.get("open_time") or t.get("time") or 0)
        entry_idx = _find_entry_bar_index(bars, open_ts)
        sl_dist, tp_dist, max_bars = _resolve_sl_tp_distances(
            t, bars, entry_idx, fallback_mode=fallback_mode, atr_mult=atr_mult, fixed_rr=fixed_rr
        )
        risk_r = abs(float(t.get("risk_r") or 0.0))
        raw_cost = abs(float(t.get("commission") or 0.0)) + abs(float(t.get("swap") or 0.0))
        cost_r = (raw_cost / risk_r) if (include_costs and risk_r > 1e-6) else 0.0

        contexts.append(
            {
                "trade": t,
                "bars": bars,
                "entry_idx": entry_idx,
                "sl_dist": sl_dist,
                "tp_dist": tp_dist,
                "max_bars": max_bars,
                "cost_r": cost_r,
            }
        )

    # Actual portfolio stats (over eligible trades if available, else all trades)
    eval_trades = [c["trade"] for c in contexts] if contexts else trades
    eval_r = [float(t.get("r_multiple") or 0.0) for t in eval_trades]
    n_eval = len(eval_trades)
    actual_wins = [r for r in eval_r if r > 0]
    actual_losses = [abs(r) for r in eval_r if r < 0]
    actual_wr = (len(actual_wins) / n_eval * 100.0) if n_eval > 0 else 0.0
    actual_net_r = float(sum(eval_r)) if eval_r else 0.0
    actual_exp_r = float(np.mean(eval_r)) if eval_r else 0.0

    avg_win_r = float(np.mean(actual_wins)) if actual_wins else 0.0
    avg_loss_r = float(np.mean(actual_losses)) if actual_losses else 1.0
    avg_rr = (avg_win_r / avg_loss_r) if avg_loss_r > 1e-9 else 0.0
    be_wr = (1.0 / (1.0 + avg_rr) * 100.0) if avg_rr > 0 else 50.0

    in_trade_maes = [float(t["mae_r"]) for t in eval_trades if t.get("mae_r") is not None]
    in_trade_mfes = [float(t["mfe_r"]) for t in eval_trades if t.get("mfe_r") is not None]
    avg_in_mae = float(np.mean(in_trade_maes)) if in_trade_maes else 0.0
    avg_in_mfe = float(np.mean(in_trade_mfes)) if in_trade_mfes else 0.0
    in_trade_eratio = round(avg_in_mfe / avg_in_mae, 2) if avg_in_mae > 1e-9 else 0.0

    horizon_stats = compute_fixed_horizon_excursions(
        eval_trades, candles_by_ticket, horizon_bars=horizon_bars, timeframe=timeframe
    )

    if not contexts:
        return {
            "eligible_trades": 0,
            "total_trades": len(trades),
            "iterations": iterations,
            "horizon_bars": horizon_bars,
            "timeframe": timeframe,
            "mode": mode,
            "include_costs": include_costs,
            "sample_size_warning": len(trades) < 30,
            "actual": {
                "win_rate": round(actual_wr, 2),
                "net_r": round(actual_net_r, 2),
                "expectancy_r": round(actual_exp_r, 3),
                "in_trade_edge_ratio": in_trade_eratio,
                "horizon_edge_ratio": horizon_stats["horizon_edge_ratio"],
                "horizon_avg_mfe_r": horizon_stats["horizon_avg_mfe_r"],
                "horizon_avg_mae_r": horizon_stats["horizon_avg_mae_r"],
                "avg_rr": round(avg_rr, 2),
                "breakeven_win_rate": round(be_wr, 2),
            },
            "random_baseline": {
                "win_rate_p5": 0.0,
                "win_rate_p50": 0.0,
                "win_rate_p95": 0.0,
                "net_r_p5": 0.0,
                "net_r_p50": 0.0,
                "net_r_p95": 0.0,
                "edge_ratio_p50": 0.0,
                "edge_ratio_p95": 0.0,
            },
            "percentiles": {
                "win_rate_pct": 0.0,
                "net_r_pct": 0.0,
                "edge_ratio_pct": 0.0,
                "p_value_net_r": 1.0,
            },
            "sizing": sizing,
            "histogram": [],
            "verdict": "no_candle_data",
        }

    rng = np.random.default_rng(seed)
    n_ctx = len(contexts)
    sim_win_rates = np.empty(iterations, dtype=np.float64)
    sim_net_rs = np.empty(iterations, dtype=np.float64)
    sim_eratios = np.empty(iterations, dtype=np.float64)

    # Precompute outcomes for both directions (or jitter window) to speed up 1,000+ iterations
    if mode == "coin_flip_direction":
        # Shape: (n_ctx, 2) for BUY (0) and SELL (1)
        pre_r = np.empty((n_ctx, 2), dtype=np.float64)
        pre_mfe = np.empty((n_ctx, 2), dtype=np.float64)
        pre_mae = np.empty((n_ctx, 2), dtype=np.float64)
        for idx, ctx in enumerate(contexts):
            for d in (0, 1):
                nr, mfe, mae = simulate_bar_outcome(
                    ctx["bars"],
                    ctx["entry_idx"],
                    d,
                    ctx["sl_dist"],
                    ctx["tp_dist"],
                    ctx["max_bars"],
                    horizon_bars,
                    ctx["cost_r"],
                )
                pre_r[idx, d] = nr
                pre_mfe[idx, d] = mfe
                pre_mae[idx, d] = mae

        dirs = rng.integers(0, 2, size=(iterations, n_ctx))
        trade_indices = np.arange(n_ctx)[None, :]
        sampled_r = pre_r[trade_indices, dirs]
        sampled_mfe = pre_mfe[trade_indices, dirs]
        sampled_mae = pre_mae[trade_indices, dirs]

        sim_win_rates = np.mean(sampled_r > 0.0, axis=1) * 100.0
        sim_net_rs = np.sum(sampled_r, axis=1)
        mean_mfe = np.mean(sampled_mfe, axis=1)
        mean_mae = np.mean(sampled_mae, axis=1)
        sim_eratios = np.where(mean_mae > 1e-9, mean_mfe / mean_mae, 0.0)
    else:
        # window_jitter: sample random bar offset around entry_idx and random direction
        for it in range(iterations):
            run_r = np.empty(n_ctx, dtype=np.float64)
            run_mfe = np.empty(n_ctx, dtype=np.float64)
            run_mae = np.empty(n_ctx, dtype=np.float64)
            dirs = rng.integers(0, 2, size=n_ctx)
            for idx, ctx in enumerate(contexts):
                bars = ctx["bars"]
                max_valid = max(0, len(bars) - 2)
                low_idx = max(0, ctx["entry_idx"] - min(20, ctx["entry_idx"]))
                high_idx = min(max_valid, ctx["entry_idx"] + 10)
                rand_idx = int(rng.integers(low_idx, high_idx + 1)) if high_idx >= low_idx else ctx["entry_idx"]
                nr, mfe, mae = simulate_bar_outcome(
                    bars,
                    rand_idx,
                    int(dirs[idx]),
                    ctx["sl_dist"],
                    ctx["tp_dist"],
                    ctx["max_bars"],
                    horizon_bars,
                    ctx["cost_r"],
                )
                run_r[idx] = nr
                run_mfe[idx] = mfe
                run_mae[idx] = mae
            sim_win_rates[it] = float(np.mean(run_r > 0.0) * 100.0)
            sim_net_rs[it] = float(np.sum(run_r))
            m_mae = float(np.mean(run_mae))
            sim_eratios[it] = float(np.mean(run_mfe) / m_mae) if m_mae > 1e-9 else 0.0

    wr_pct = float(np.mean(sim_win_rates <= actual_wr) * 100.0)
    net_r_pct = float(np.mean(sim_net_rs <= actual_net_r) * 100.0)
    h_er = float(horizon_stats["horizon_edge_ratio"])
    er_pct = float(np.mean(sim_eratios <= h_er) * 100.0)
    p_val_net_r = float(np.mean(sim_net_rs >= actual_net_r))

    # Build histogram bins for Net R
    counts, edges = np.histogram(sim_net_rs, bins=16)
    histogram = [
        {
            "bin_start": round(float(edges[i]), 2),
            "bin_end": round(float(edges[i + 1]), 2),
            "count": int(counts[i]),
        }
        for i in range(len(counts))
    ]

    if n_eval < 30:
        verdict = "inconclusive"
    elif p_val_net_r < 0.05 and h_er >= 1.25:
        verdict = "significant_edge"
    elif p_val_net_r < 0.10:
        verdict = "inconclusive"
    else:
        verdict = "no_edge"

    return {
        "eligible_trades": n_eval,
        "total_trades": len(trades),
        "iterations": iterations,
        "horizon_bars": horizon_bars,
        "timeframe": timeframe,
        "mode": mode,
        "include_costs": include_costs,
        "sample_size_warning": n_eval < 30,
        "actual": {
            "win_rate": round(actual_wr, 2),
            "net_r": round(actual_net_r, 2),
            "expectancy_r": round(actual_exp_r, 3),
            "in_trade_edge_ratio": in_trade_eratio,
            "horizon_edge_ratio": horizon_stats["horizon_edge_ratio"],
            "horizon_avg_mfe_r": horizon_stats["horizon_avg_mfe_r"],
            "horizon_avg_mae_r": horizon_stats["horizon_avg_mae_r"],
            "avg_rr": round(avg_rr, 2),
            "breakeven_win_rate": round(be_wr, 2),
        },
        "random_baseline": {
            "win_rate_p5": round(float(np.percentile(sim_win_rates, 5)), 2),
            "win_rate_p50": round(float(np.percentile(sim_win_rates, 50)), 2),
            "win_rate_p95": round(float(np.percentile(sim_win_rates, 95)), 2),
            "net_r_p5": round(float(np.percentile(sim_net_rs, 5)), 2),
            "net_r_p50": round(float(np.percentile(sim_net_rs, 50)), 2),
            "net_r_p95": round(float(np.percentile(sim_net_rs, 95)), 2),
            "edge_ratio_p50": round(float(np.percentile(sim_eratios, 50)), 2),
            "edge_ratio_p95": round(float(np.percentile(sim_eratios, 95)), 2),
        },
        "percentiles": {
            "win_rate_pct": round(wr_pct, 1),
            "net_r_pct": round(net_r_pct, 1),
            "edge_ratio_pct": round(er_pct, 1),
            "p_value_net_r": round(p_val_net_r, 4),
        },
        "sizing": sizing,
        "histogram": histogram,
        "verdict": verdict,
    }
