from __future__ import annotations

import random

from backend.domain.models import DealEntry, DealType, TagKind
from backend.domain.pips import calculate_trade_pips, get_pip_size
from backend.domain.protocols import TradingGateway
from backend.domain.risk import compute_1r_risk
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
