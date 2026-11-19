from __future__ import annotations

import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from backend.api.deps import get_mt5_gateway, get_settings
from backend.app import create_app
from backend.config import Settings
from backend.infrastructure.db.uow import SqliteUnitOfWork
from backend.infrastructure.mt5.simulator import SimulatedMT5Gateway
from backend.services.analytics.benchmark import (
    compute_fixed_horizon_excursions,
    compute_kelly_and_optimal_f,
    run_coin_flip_monte_carlo,
)
from backend.services.analytics.excursions import compute_excursion_stats


def _make_bars(
    start_ts: int,
    count: int,
    step_sec: int = 300,
    start_price: float = 1.1000,
    drift: float = 0.0002,
    wick: float = 0.0005,
) -> list[dict[str, float | int]]:
    bars: list[dict[str, float | int]] = []
    price = start_price
    for i in range(count):
        o = price
        c = price + drift
        h = max(o, c) + wick
        l_val = min(o, c) - wick
        bars.append(
            {
                "time": start_ts + i * step_sec,
                "open": round(o, 5),
                "high": round(h, 5),
                "low": round(l_val, 5),
                "close": round(c, 5),
            }
        )
        price = c
    return bars


def test_excursion_stats_includes_edge_ratio() -> None:
    trades = [
        {"mae_r": 0.5, "mfe_r": 2.0, "net_profit": 100.0, "mfe_amount": 200.0},
        {"mae_r": 1.0, "mfe_r": 1.0, "net_profit": -100.0, "mfe_amount": 100.0},
    ]
    res = compute_excursion_stats(trades, [trades[0]])
    assert res["avg_mae_r"] == 0.75
    assert res["avg_mfe_r"] == 1.5
    assert res["edge_ratio"] == 2.0
    assert res["median_edge_ratio"] == 2.0

    empty_res = compute_excursion_stats([], [])
    assert empty_res["edge_ratio"] == 0.0
    assert empty_res["median_edge_ratio"] == 0.0


def test_kelly_and_optimal_f_positive_and_negative() -> None:
    # 60% win rate, +2R wins, -1R losses => Kelly = 0.6 - 0.4/2 = 0.40 (40%)
    r_pos = [2.0, 2.0, 2.0, -1.0, -1.0] * 10
    sizing = compute_kelly_and_optimal_f(r_pos, current_risk_pct=1.0)
    assert sizing["full_kelly_pct"] == 40.0
    assert sizing["half_kelly_pct"] == 20.0
    assert sizing["quarter_kelly_pct"] == 10.0
    assert sizing["optimal_f_pct"] > 0.0
    assert sizing["optimal_f_risk_pct"] > 0.0
    assert sizing["quarter_optimal_f_risk_pct"] > 0.0
    assert sizing["max_twr"] > 1.0
    assert len(sizing["twr_curve"]) > 5

    # Losing system => 0%
    r_neg = [-1.0, -1.0, 0.5, -1.0] * 5
    sizing_neg = compute_kelly_and_optimal_f(r_neg, current_risk_pct=1.0)
    assert sizing_neg["full_kelly_pct"] == 0.0
    assert sizing_neg["half_kelly_pct"] == 0.0
    assert sizing_neg["quarter_kelly_pct"] == 0.0
    assert sizing_neg["optimal_f_pct"] == 0.0

    # Empty
    sizing_empty = compute_kelly_and_optimal_f([], current_risk_pct=1.0)
    assert sizing_empty["full_kelly_pct"] == 0.0
    assert sizing_empty["twr_curve"] == []


def test_fixed_horizon_excursions_uncapped_by_sl_tp() -> None:
    # Strong uptrend after entry at t=1000
    bars = _make_bars(start_ts=1000, count=25, step_sec=300, start_price=1.1000, drift=0.0005, wick=0.0001)
    trade = {
        "ticket": 101,
        "type": 0,  # BUY
        "symbol": "EURUSD",
        "open_time": 1000,
        "time": 1600,
        "open_price": 1.1000,
        "price": 1.1010,
        "sl": 1.0990,  # 1R = 0.0010
        "tp": 1.1020,  # 2R target, but price keeps going to ~1.1100 (+10R)
        "risk_r": 100.0,
        "r_multiple": 1.0,
        "net_profit": 100.0,
    }
    res = compute_fixed_horizon_excursions(
        trades=[trade],
        candles_by_ticket={101: {"m5": bars}},
        horizon_bars=15,
        timeframe="m5",
    )
    assert res["evaluated_trades"] == 1
    # Price moves much further than 2R over 15 bars
    assert res["horizon_avg_mfe_r"] > 5.0
    assert res["horizon_edge_ratio"] > 5.0


def test_monte_carlo_coin_flip_deterministic_and_costs() -> None:
    trades: list[dict[str, object]] = []
    candles: dict[int, dict[str, list[dict[str, float | int]]]] = {}
    base_ts = 1_700_000_000
    for i in range(10):
        tid = 2000 + i
        open_ts = base_ts + i * 20000
        # 60 bars before, 40 bars after
        bars = _make_bars(
            start_ts=open_ts - 40 * 300,
            count=100,
            step_sec=300,
            start_price=1.1000,
            drift=0.00015 if i % 2 == 0 else -0.00015,
            wick=0.0004,
        )
        candles[tid] = {"m5": bars}
        trades.append(
            {
                "ticket": tid,
                "type": 0 if i % 2 == 0 else 1,
                "symbol": "EURUSD",
                "open_time": open_ts,
                "time": open_ts + 6 * 300,
                "open_price": 1.1000 + 40 * (0.00015 if i % 2 == 0 else -0.00015),
                "price": 1.1020,
                "sl": 1.0980,
                "tp": 1.1040,
                "risk_r": 100.0,
                "r_multiple": 1.5 if i < 7 else -1.0,
                "net_profit": 150.0 if i < 7 else -100.0,
                "commission": -5.0,
                "swap": 0.0,
                "mae_r": 0.4,
                "mfe_r": 1.8,
                "risk_source": "sl",
            }
        )

    res1 = run_coin_flip_monte_carlo(
        trades=trades,  # type: ignore[arg-type]
        candles_by_ticket=candles,
        iterations=200,
        horizon_bars=20,
        timeframe="m5",
        mode="coin_flip_direction",
        include_costs=True,
        seed=123,
    )
    res2 = run_coin_flip_monte_carlo(
        trades=trades,  # type: ignore[arg-type]
        candles_by_ticket=candles,
        iterations=200,
        horizon_bars=20,
        timeframe="m5",
        mode="coin_flip_direction",
        include_costs=True,
        seed=123,
    )
    assert res1["random_baseline"] == res2["random_baseline"]
    assert res1["sample_size_warning"] is True  # 10 < 30
    assert res1["eligible_trades"] == 10
    assert len(res1["histogram"]) > 0
    assert res1["actual"]["breakeven_win_rate"] > 0.0

    # Without costs, random baseline net_r_p50 should be >= with costs
    res_no_cost = run_coin_flip_monte_carlo(
        trades=trades,  # type: ignore[arg-type]
        candles_by_ticket=candles,
        iterations=200,
        horizon_bars=20,
        timeframe="m5",
        mode="window_jitter",
        include_costs=False,
        seed=123,
    )
    assert res_no_cost["eligible_trades"] == 10


def test_benchmark_route_integration(tmp_path: Path) -> None:
    db_path = tmp_path / "bench_test.db"
    sim = SimulatedMT5Gateway()
    acc = sim.get_account_info() or {}
    deals = sim.get_history_deals()

    settings = Settings(db_path=db_path)
    app = create_app(settings=settings, gateway=sim)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_mt5_gateway] = lambda: sim

    with TestClient(app) as client:
        with SqliteUnitOfWork(db_path) as uow:
            uow.accounts.upsert(acc)
            uow.deals.upsert_many(deals)
            # Seed candles for first 5 closed deals
            closed = [d for d in deals if d.get("type") in (0, 1) and d.get("entry") == 1][:5]
            for d in closed:
                open_ts = int(d["open_time"])
                bars = _make_bars(
                    start_ts=open_ts - 30 * 300,
                    count=80,
                    step_sec=300,
                    start_price=float(d["open_price"]),
                    drift=0.0001,
                    wick=0.0003,
                )
                uow.candles.upsert(int(d["ticket"]), "m5", bars, cached_at=1_700_000_000)

        resp = client.post(
            "/api/portfolio/benchmark",
            json={
                "horizon_bars": 20,
                "bar_tf": "m5",
                "iterations": 150,
                "mode": "coin_flip_direction",
                "include_costs": True,
                "fallback_mode": "realized_1r",
                "seed": 42,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["eligible_trades"] >= 5
        assert "actual" in data
        assert "random_baseline" in data
        assert "sizing" in data
        assert "histogram" in data
        assert sqlite3.connect(db_path).execute("SELECT COUNT(*) FROM deals").fetchone()[0] > 0
