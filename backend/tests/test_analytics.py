import pytest
from backend.analytics import compute_1r_risk, process_portfolio_analytics, get_sqn_rating
from backend.database import init_db, upsert_account, upsert_deals, get_deals_by_account

def test_compute_1r_risk_with_sl():
    # Buy trade with SL
    deal_buy = {
        "open_price": 1.08500,
        "sl": 1.08000, # 50 pips risk
        "type": 0,
        "volume": 1.0,
        "symbol": "EURUSD",
        "price": 1.09500,
        "profit": 1000.0
    }
    risk = compute_1r_risk(deal_buy, balance_at_entry=10000.0)
    assert risk > 0
    # Price difference is 0.01000 for $1000 profit -> $100 per 10 pips -> 50 pips risk = $500
    assert abs(risk - 500.0) < 1.0

def test_compute_1r_risk_without_sl():
    deal_no_sl = {
        "open_price": 1.08500,
        "sl": 0.0,
        "type": 0,
        "volume": 0.5,
        "symbol": "EURUSD",
        "price": 1.09000,
        "profit": 250.0
    }
    # 1% fallback of $10,000 = $100
    risk = compute_1r_risk(deal_no_sl, balance_at_entry=10000.0, default_risk_pct=0.01)
    assert risk == 100.0

def test_sqn_rating():
    rating_poor = get_sqn_rating(1.2)
    assert rating_poor["category"] == "Poor"

    rating_good = get_sqn_rating(2.2)
    assert rating_good["category"] == "Good"

    rating_excellent = get_sqn_rating(3.8)
    assert rating_excellent["category"] == "Excellent"

def test_portfolio_analytics_calculations():
    sample_deals = [
        # Deposit
        {"ticket": 1, "order_id": 1, "time": 1000, "time_msc": 1000000, "type": 2, "entry": 0, "profit": 10000.0, "swap": 0, "commission": 0, "symbol": ""},
        # Trade 1: +$300 with $100 risk -> +3R
        {"ticket": 2, "order_id": 2, "time": 2000, "time_msc": 2000000, "type": 0, "entry": 1, "open_price": 1.08, "sl": 1.07, "price": 1.11, "profit": 300.0, "swap": 0, "commission": 0, "symbol": "EURUSD", "volume": 0.1},
        # Trade 2: -$100 with $100 risk -> -1R
        {"ticket": 3, "order_id": 3, "time": 3000, "time_msc": 3000000, "type": 0, "entry": 1, "open_price": 1.08, "sl": 1.07, "price": 1.07, "profit": -100.0, "swap": 0, "commission": 0, "symbol": "EURUSD", "volume": 0.1},
        # Trade 3: +$200 with $100 risk -> +2R
        {"ticket": 4, "order_id": 4, "time": 4000, "time_msc": 4000000, "type": 1, "entry": 1, "open_price": 1.09, "sl": 1.10, "price": 1.07, "profit": 200.0, "swap": 0, "commission": 0, "symbol": "EURUSD", "volume": 0.1},
    ]

    account = {"login": 9999, "balance": 10400.0, "equity": 10400.0, "broker": "TestBroker"}
    res = process_portfolio_analytics(sample_deals, account)
    stats = res["stats"]

    assert stats["total_trades"] == 3
    assert stats["won_trades"] == 2
    assert stats["lost_trades"] == 1
    assert stats["win_rate"] == pytest.approx(66.67, 0.05)
    assert stats["total_profit"] == 400.0
    assert stats["profit_factor"] == 5.0 # (300+200) / 100
    assert stats["total_r"] > 0
    assert stats["sqn"] > 0
    assert len(res["curves"]) > 0
    assert "excursion_stats" in res
    assert "optimal_sl_r" in res["excursion_stats"]
    assert "mfe_capture_efficiency_pct" in res["excursion_stats"]
    assert len(res["excursion_stats"]["trades"]) == 3

def test_database_persistence():
    init_db()
    acc = {
        "login": 777777,
        "broker": "IC Markets",
        "name": "Test Trader",
        "server": "Demo01",
        "currency": "USD",
        "leverage": 100,
        "balance": 5000.0,
        "equity": 5050.0,
        "margin": 100.0,
        "free_margin": 4950.0,
        "margin_level": 5050.0,
        "is_demo": 1,
        "last_synced_at": 1700000000
    }
    upsert_account(acc)
    deals = [
        {
            "ticket": 55501,
            "order_id": 55501,
            "account_id": 777777,
            "time": 1700000100,
            "time_msc": 1700000100000,
            "type": 0,
            "entry": 1,
            "symbol": "GBPUSD",
            "volume": 0.2,
            "price": 1.2500,
            "profit": 45.0,
            "swap": -0.5,
            "commission": -1.2,
            "sl": 1.2450,
            "tp": 1.2600,
            "open_time": 1700000050,
            "open_price": 1.2480,
            "comment": "test",
            "risk_r": 30.0,
            "r_multiple": 1.5
        }
    ]
    upsert_deals(deals)
    saved = get_deals_by_account(777777)
    assert len(saved) >= 1
    assert saved[0]["ticket"] == 55501
