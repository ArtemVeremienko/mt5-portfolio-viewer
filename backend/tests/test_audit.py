from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from backend.api.deps import get_mt5_gateway, get_settings
from backend.app import create_app
from backend.config import Settings
from backend.infrastructure.db.uow import SqliteUnitOfWork
from backend.infrastructure.mt5.simulator import SimulatedMT5Gateway
from backend.services.analytics.audit import (
    compute_audit_summary,
    compute_execution_drift,
    compute_oos_survival,
    compute_process_outcome_matrix,
)
from backend.services.analytics.filters import (
    extract_journal_filter_options,
    filter_and_scope_deals,
)


def _make_deal(
    ticket: int,
    *,
    open_time: int,
    close_time: int,
    r_multiple: float,
    net_profit: float,
    volume: float = 0.10,
    risk_r: float = 100.0,
    risk_source: str = "sl",
) -> dict[str, object]:
    return {
        "ticket": ticket,
        "position_id": ticket,
        "type": 0,
        "entry": 1,
        "symbol": "EURUSD",
        "open_time": open_time,
        "time": close_time,
        "time_msc": close_time * 1000,
        "volume": volume,
        "profit": net_profit,
        "swap": 0.0,
        "commission": 0.0,
        "risk_r": risk_r,
        "r_multiple": r_multiple,
        "net_profit": net_profit,
        "risk_source": risk_source,
    }


def test_filter_by_setup_tag_and_exclude_mistakes() -> None:
    deals = [
        {"ticket": 1, "position_id": 1, "type": 2, "entry": 0, "time": 100, "profit": 1000.0},
        _make_deal(10, open_time=200, close_time=300, r_multiple=1.5, net_profit=150.0),
        _make_deal(11, open_time=400, close_time=500, r_multiple=-1.0, net_profit=-100.0),
        _make_deal(12, open_time=600, close_time=700, r_multiple=-2.0, net_profit=-200.0),
    ]
    notes_map = {
        10: {"setup_tag": "Breakout, NY", "mistake_tag": ""},
        11: {"setup_tag": "Pullback", "mistake_tag": ""},
        12: {"setup_tag": "Breakout", "mistake_tag": "FOMO"},
    }
    setups, mistakes = extract_journal_filter_options(notes_map)
    assert setups == ["Breakout", "NY", "Pullback"]
    assert mistakes == ["FOMO"]

    # Exclude mistakes -> keeps 10 and 11
    scoped, _, _, _ = filter_and_scope_deals(
        deals, notes_map=notes_map, exclude_mistakes=True
    )
    closed_tickets = [d["ticket"] for d in scoped if d.get("type") != 2]
    assert closed_tickets == [10, 11]

    # Setup tag + exclude mistakes -> keeps only 10
    scoped_setup, _, _, _ = filter_and_scope_deals(
        deals, notes_map=notes_map, setup_tag="Breakout", exclude_mistakes=True
    )
    assert [d["ticket"] for d in scoped_setup if d.get("type") != 2] == [10]


def test_oos_survival_split_and_small_sample() -> None:
    small = [
        _make_deal(i, open_time=1000 + i * 100, close_time=1050 + i * 100, r_multiple=1.0, net_profit=100.0)
        for i in range(10)
    ]
    small_res = compute_oos_survival(small)  # type: ignore[arg-type]
    assert small_res["eligible"] is False

    # 30 trades: first 15 positive (+1R), next 15 positive (+1.5R) -> survived
    trades = [
        _make_deal(
            i,
            open_time=1000 + i * 3600,
            close_time=2000 + i * 3600,
            r_multiple=1.0 if i < 15 else 1.5,
            net_profit=100.0 if i < 15 else 150.0,
        )
        for i in range(30)
    ]
    res = compute_oos_survival(trades)  # type: ignore[arg-type]
    assert res["eligible"] is True
    assert res["in_sample"]["count"] == 15
    assert res["out_of_sample"]["count"] == 15
    assert res["oos_survived"] is True
    assert res["rolling_positive_pct"] == 100.0


def test_execution_drift_sl_widening_and_revenge_window() -> None:
    trades = [
        # 1: normal loss at t=1000..1500
        _make_deal(1, open_time=1000, close_time=1500, r_multiple=-1.0, net_profit=-100.0, volume=0.10, risk_r=100.0),
        # 2: opened 15 mins (900s) later with 2x size -> revenge at 30m AND 120m
        _make_deal(2, open_time=2400, close_time=2800, r_multiple=-1.0, net_profit=-200.0, volume=0.20, risk_r=200.0),
        # 3: opened 50 mins (3000s) after trade 2 with 2x size -> NOT revenge at 30m, IS revenge at 60m
        _make_deal(3, open_time=5800, close_time=6200, r_multiple=-1.5, net_profit=-300.0, volume=0.40, risk_r=200.0),
    ]
    notes_map = {
        1: {"mistake_tag": ""},
        2: {"mistake_tag": ""},
        3: {"mistake_tag": "Moved SL"},
    }

    drift_30 = compute_execution_drift(trades, notes_map, revenge_window_min=30)  # type: ignore[arg-type]
    assert drift_30["sl_widened_count"] == 1
    assert drift_30["sl_widened_extra_r"] == 0.5
    assert drift_30["revenge_count"] == 1
    assert drift_30["revenge_window_min"] == 30

    drift_60 = compute_execution_drift(trades, notes_map, revenge_window_min=60)  # type: ignore[arg-type]
    assert drift_60["revenge_count"] == 2


def test_process_outcome_matrix_and_classification() -> None:
    trades = [
        _make_deal(1, open_time=100, close_time=200, r_multiple=2.0, net_profit=200.0),
        _make_deal(2, open_time=300, close_time=400, r_multiple=-1.0, net_profit=-100.0),
        _make_deal(3, open_time=500, close_time=600, r_multiple=1.0, net_profit=100.0),
        _make_deal(4, open_time=700, close_time=800, r_multiple=-1.5, net_profit=-150.0),
    ]
    notes_map = {
        1: {"mistake_tag": "", "entry_grade": "A", "execution_grade": "A", "management_grade": "A"},
        2: {"mistake_tag": "", "entry_grade": "A", "execution_grade": "B", "management_grade": "A"},
        3: {"mistake_tag": "FOMO", "entry_grade": "C", "execution_grade": "B", "management_grade": "B"},
        4: {"mistake_tag": "Revenge", "entry_grade": "C", "execution_grade": "C", "management_grade": "C"},
    }
    matrix = compute_process_outcome_matrix(trades, notes_map)  # type: ignore[arg-type]
    assert matrix["disciplined_win"]["count"] == 1
    assert matrix["disciplined_loss"]["count"] == 1
    assert matrix["lucky_gamble"]["count"] == 1
    assert matrix["self_inflicted_loss"]["count"] == 1

    # Classification checks
    dev = compute_audit_summary(trades, notes_map, r_expectancy=0.25)  # type: ignore[arg-type]
    assert dev["system_classification"] == "developing"

    thirty = [
        _make_deal(i, open_time=i * 100, close_time=i * 100 + 50, r_multiple=1.0, net_profit=100.0)
        for i in range(30)
    ]
    poker = compute_audit_summary(thirty, {}, r_expectancy=0.25)  # type: ignore[arg-type]
    assert poker["system_classification"] == "poker"
    roulette = compute_audit_summary(thirty, {}, r_expectancy=-0.05)  # type: ignore[arg-type]
    assert roulette["system_classification"] == "roulette"


def test_portfolio_and_benchmark_audit_routes(tmp_path: Path) -> None:
    db_path = tmp_path / "audit_route.db"
    sim = SimulatedMT5Gateway()
    settings = Settings(db_path=db_path)
    app = create_app(settings=settings, gateway=sim)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_mt5_gateway] = lambda: sim

    with TestClient(app) as client:
        # Tag the first closed trade as a FOMO mistake + Breakout setup
        port = client.get("/api/portfolio").json()
        closed = port["closed_trades"]
        assert len(closed) > 5
        t0 = int(closed[0]["ticket"])
        t1 = int(closed[1]["ticket"])
        with SqliteUnitOfWork(db_path) as uow:
            acc_id = int(port["account"]["login"])
            uow.journal.upsert_note(t0, acc_id, "", "Breakout", "FOMO", "SL", "C", "C", "C")
            uow.journal.upsert_note(t1, acc_id, "", "Breakout", "", "TP", "A", "A", "A")

        res_all = client.get("/api/portfolio?revenge_window_min=60")
        assert res_all.status_code == 200
        body_all = res_all.json()
        assert "audit_stats" in body_all
        assert body_all["audit_stats"]["execution_drift"]["revenge_window_min"] == 60
        assert "Breakout" in body_all["available_setup_tags"]

        res_sys = client.get("/api/portfolio?exclude_mistakes=true&setup_tag=Breakout")
        assert res_sys.status_code == 200
        body_sys = res_sys.json()
        assert body_sys["stats"]["total_trades"] == 1
        assert body_sys["closed_trades"][0]["ticket"] == t1

        bench = client.post(
            "/api/portfolio/benchmark",
            json={"exclude_mistakes": True, "setup_tag": "Breakout", "iterations": 100},
        )
        assert bench.status_code == 200
        assert bench.json()["total_trades"] == 1
