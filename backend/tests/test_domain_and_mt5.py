from __future__ import annotations

import random
from unittest.mock import patch

import numpy as np

from backend.domain.models import DealEntry, DealType, TagKind
from backend.domain.pips import calculate_trade_pips, get_pip_size
from backend.domain.protocols import TradingGateway
from backend.domain.risk import compute_1r_risk, is_valid_losing_sl
from backend.infrastructure.mt5.gateway import LiveMT5Gateway
from backend.infrastructure.mt5.simulator import SimulatedMT5Gateway


def test_pip_size_and_trade_pips() -> None:
    assert get_pip_size("EURUSD") == 0.0001
    assert get_pip_size("USDJPY") == 0.01
    assert get_pip_size("XAUUSD") == 0.1
    assert get_pip_size("DE40") == 1.0
    assert get_pip_size("BTCUSD") == 1.0

    buy_eur = {"symbol": "EURUSD", "open_price": 1.0800, "price": 1.0850, "type": DealType.BUY}
    assert calculate_trade_pips(buy_eur) == 50.0

    sell_jpy = {"symbol": "USDJPY", "open_price": 150.50, "price": 150.00, "type": DealType.SELL}
    assert calculate_trade_pips(sell_jpy) == 50.0


def test_compute_1r_risk_with_valid_sl_and_fallback() -> None:
    # Valid BUY SL below open_price using profit_calc_fn
    deal = {
        "symbol": "EURUSD",
        "type": DealType.BUY,
        "volume": 0.1,
        "open_price": 1.1000,
        "sl": 1.0950,
        "price": 1.1100,
        "profit": 100.0,
    }
    assert compute_1r_risk(deal, balance_at_entry=1000.0) == 50.0

    # Trailing stop in profit (sl > open_price for BUY) -> falls back to 1% of balance
    trailing_deal = {
        "symbol": "EURUSD",
        "type": DealType.BUY,
        "volume": 0.1,
        "open_price": 1.1000,
        "sl": 1.1020,
        "price": 1.1050,
        "profit": 50.0,
    }
    assert compute_1r_risk(trailing_deal, balance_at_entry=1000.0, default_risk_pct=0.01) == 10.0

    # Micro account floor $0.20
    assert compute_1r_risk(trailing_deal, balance_at_entry=5.0, default_risk_pct=0.01) == 0.20


def test_simulated_mt5_gateway_satisfies_protocol_and_is_deterministic() -> None:
    gateway: TradingGateway = SimulatedMT5Gateway()
    assert gateway.is_connected() is False

    acc = gateway.get_account_info()
    assert acc is not None
    assert acc["login"] == SimulatedMT5Gateway.SIM_LOGIN

    # Ensure global random state is NOT mutated
    random.seed(12345)
    expected_next = random.random()
    random.seed(12345)

    deals1 = gateway.get_history_deals()
    actual_next = random.random()
    assert actual_next == expected_next

    deals2 = gateway.get_history_deals()
    assert len(deals1) == len(deals2)
    assert len(deals1) > 0
    # LSP parity: every deal has 'magic' and 'entry'
    for d in deals1:
        assert "magic" in d
        assert d["entry"] in (DealEntry.IN, DealEntry.OUT, DealEntry.IN_OUT)
        assert isinstance(d["ticket"], int)

    assert TagKind.MISTAKE == "mistake"
    assert is_valid_losing_sl(0, 1.1000, 1.0950) is True
    assert is_valid_losing_sl(0, 1.1000, 1.1050) is False
    assert is_valid_losing_sl(1, 25090.2, 25113.2) is True
    assert is_valid_losing_sl(1, 25090.2, 25080.0) is False


def test_calculate_deal_excursions_uses_ticks_and_excludes_post_exit_move() -> None:
    """Reproduces #595866918: SELL stopped at 25114.0 (-$0.26) must not include post-exit 25130.2."""
    gw = LiveMT5Gateway()
    open_t = 1795546861  # :01
    close_t = 1795547133  # :33
    tick_dtype = np.dtype([("time", "i8"), ("time_msc", "i8"), ("bid", "f8"), ("ask", "f8")])
    mock_ticks = np.array(
        [
            # Pre-entry tick (must be ignored)
            (open_t - 1, open_t * 1000 - 500, 25120.0, 25121.0),
            # In-trade ticks: Ask reaches 25114.0 at stop-out, never 25130.2
            (open_t + 10, open_t * 1000 + 10_000, 25092.0, 25093.0),
            (close_t, close_t * 1000, 25113.0, 25114.0),
            # Post-exit tick in the same M1 bar (must be ignored)
            (close_t + 10, close_t * 1000 + 10_000, 25129.0, 25130.2),
        ],
        dtype=tick_dtype,
    )

    def fake_profit_calc(_order_type: int, _sym: str, _vol: float, open_p: float, target_p: float) -> float:
        return round((open_p - target_p) * (0.26 / 23.8), 2)

    with (
        patch.object(gw, "is_connected", return_value=True),
        patch("backend.infrastructure.mt5.gateway.mt5.copy_ticks_range", return_value=mock_ticks),
        patch("backend.infrastructure.mt5.gateway.mt5.order_calc_profit", side_effect=fake_profit_calc),
    ):
        mae_p, mfe_p, mae_pips, mfe_pips, mae_amt, mfe_amt = gw.calculate_deal_excursions(
            symbol=".DE40Cash",
            deal_type=1,
            open_time=open_t,
            close_time=close_t,
            open_price=25090.2,
            close_price=25114.0,
            net_profit=-0.26,
            volume=0.01,
            open_time_msc=open_t * 1000,
            close_time_msc=close_t * 1000,
        )

    assert mae_p == 23.8
    assert mae_pips == 23.8
    assert mae_amt == 0.26
    assert mfe_p == 0.0
    assert mfe_pips == 0.0
    assert mfe_amt == 0.0


def test_calculate_deal_excursions_falls_back_to_interior_m1_without_randomness() -> None:
    """When ticks are unavailable, exclude boundary M1 bars and never fabricate random excursions."""
    gw = LiveMT5Gateway()
    open_t = 1795546861  # minute 1795546860
    close_t = 1795547133  # minute 1795547100
    rate_dtype = np.dtype([("time", "i8"), ("high", "f8"), ("low", "f8")])
    mock_rates = np.array(
        [
            # Boundary opening minute (excluded)
            (1795546860, 25150.0, 25050.0),
            # Interior minutes (included)
            (1795546920, 25105.0, 25085.2),
            (1795546980, 25110.0, 25088.0),
            # Boundary closing minute with post-exit spike to 25130.2 (excluded)
            (1795547100, 25130.2, 25100.0),
        ],
        dtype=rate_dtype,
    )

    with (
        patch.object(gw, "is_connected", return_value=True),
        patch("backend.infrastructure.mt5.gateway.mt5.copy_ticks_range", return_value=None),
        patch("backend.infrastructure.mt5.gateway.mt5.copy_rates_range", return_value=mock_rates),
        patch("backend.infrastructure.mt5.gateway.mt5.order_calc_profit", return_value=None),
    ):
        mae_p, mfe_p, _, _, _, _ = gw.calculate_deal_excursions(
            symbol=".DE40Cash",
            deal_type=1,
            open_time=open_t,
            close_time=close_t,
            open_price=25090.2,
            close_price=25114.0,
            net_profit=-0.26,
            volume=0.01,
        )

    # Max adverse is close_price (25114.0 - 25090.2 = 23.8), NOT boundary spike 25130.2!
    assert mae_p == 23.8
    # Max favorable from interior bar low 25085.2 -> 25090.2 - 25085.2 = 5.0
    assert mfe_p == 5.0
