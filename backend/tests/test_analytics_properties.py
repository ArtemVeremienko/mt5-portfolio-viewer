from __future__ import annotations

from hypothesis import given, settings
from hypothesis import strategies as st

from backend.analytics import process_portfolio_analytics
from backend.services.analytics.tharp import get_sqn_rating


@st.composite
def _deal_strategy(draw: st.DrawFn, idx: int) -> dict[str, object]:
    profit = draw(st.floats(min_value=-500.0, max_value=800.0, allow_nan=False, allow_infinity=False))
    return {
        "ticket": 1000 + idx,
        "account_id": 1,
        "time": 1700000000 + idx * 3600,
        "open_time": 1700000000 + idx * 3600 - 600,
        "type": draw(st.sampled_from([0, 1])),
        "entry": 1,
        "symbol": draw(st.sampled_from(["EURUSD", "XAUUSD", "USDJPY"])),
        "volume": 0.1,
        "open_price": 1.1000,
        "price": 1.1010,
        "sl": 1.0950,
        "tp": 1.1100,
        "profit": round(profit, 2),
        "swap": 0.0,
        "commission": 0.0,
        "comment": "",
        "magic": 0,
        "mae_r": 0.3,
        "mfe_r": 1.2,
        "mae_amount": 3.0,
        "mfe_amount": 12.0,
        "mae_pips": 3.0,
        "mfe_pips": 12.0,
        "mae_price": 0.0003,
        "mfe_price": 0.0012,
    }


@given(
    profits=st.lists(
        st.floats(min_value=-500.0, max_value=800.0, allow_nan=False, allow_infinity=False),
        min_size=1,
        max_size=40,
    )
)
@settings(max_examples=25)
def test_analytics_trade_count_and_drawdown_invariants(profits: list[float]) -> None:
    deals = [
        {
            "ticket": 1000 + i,
            "account_id": 1,
            "time": 1700000000 + i * 3600,
            "open_time": 1700000000 + i * 3600 - 600,
            "type": 0,
            "entry": 1,
            "symbol": "EURUSD",
            "volume": 0.1,
            "open_price": 1.1000,
            "price": 1.1010,
            "sl": 1.0950,
            "tp": 1.1100,
            "profit": round(p, 2),
            "swap": 0.0,
            "commission": 0.0,
            "comment": "",
            "magic": 0,
        }
        for i, p in enumerate(profits)
    ]
    res = process_portfolio_analytics(deals, {"balance": 1000.0, "equity": 1000.0})
    stats = res["stats"]
    assert stats["won_trades"] + stats["lost_trades"] + stats["breakeven_trades"] == stats["total_trades"]
    assert 0.0 <= stats["win_rate"] <= 100.0
    assert stats["max_drawdown_pct"] >= 0.0


def test_empty_and_populated_analytics_share_exact_schema_keys() -> None:
    empty_res = process_portfolio_analytics([], {"balance": 1000.0, "equity": 1000.0})
    pop_res = process_portfolio_analytics(
        [
            {
                "ticket": 1,
                "account_id": 1,
                "time": 1700003600,
                "open_time": 1700000000,
                "type": 0,
                "entry": 1,
                "symbol": "EURUSD",
                "volume": 0.1,
                "open_price": 1.1000,
                "price": 1.1050,
                "sl": 1.0950,
                "tp": 1.1100,
                "profit": 50.0,
                "swap": 0.0,
                "commission": 0.0,
            }
        ],
        {"balance": 1050.0, "equity": 1050.0},
    )
    assert set(empty_res.keys()) == set(pop_res.keys())
    assert set(empty_res["stats"].keys()) == set(pop_res["stats"].keys())


def test_tharp_sqn_rating_boundaries() -> None:
    assert get_sqn_rating(1.0)["category"] == "Poor"
    assert get_sqn_rating(5.5)["category"] == "Superb (Holy Grail)"
