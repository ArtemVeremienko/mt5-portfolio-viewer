from fastapi.testclient import TestClient
from backend.main import app
from backend.database import get_db_connection, upsert_trade_candles, get_trade_candles

def test_full_system_integration():
    client = TestClient(app)

    # 1. Accounts
    res = client.get("/api/accounts")
    assert res.status_code == 200
    acc_data = res.json()
    assert "accounts" in acc_data
    assert "active_login" in acc_data

    # 2. Portfolio analytics
    res = client.get("/api/portfolio")
    assert res.status_code == 200
    pdata = res.json()
    assert "stats" in pdata
    stats = pdata["stats"]
    assert "balance" in stats
    assert "total_r" in stats
    assert "sqn" in stats
    assert "sqn_rating" in stats
    assert "curves" in pdata
    assert "monthly_matrix" in pdata
    assert "r_distribution" in pdata

    # 3. Open trades
    res = client.get("/api/trades/open")
    assert res.status_code == 200
    trades_data = res.json()
    assert "positions" in trades_data

    # 4. SPA serving
    res = client.get("/")
    assert res.status_code == 200
    assert "MT5 Portfolio Viewer" in res.text
    assert 'id="root"' in res.text


def test_trade_candles_endpoint():
    client = TestClient(app)
    missing_ticket = 999999999

    res = client.get(f"/api/trades/{missing_ticket}/candles")
    assert res.status_code == 404

    sample_bar = {"time": 1700000000, "open": 100.0, "high": 105.0, "low": 99.0, "close": 104.0}
    try:
        for tf in ("h1", "m5", "m1"):
            upsert_trade_candles(missing_ticket, tf, [sample_bar], cached_at=1700000100)

        cached = get_trade_candles(missing_ticket)
        assert len(cached["h1"]) == 1

        res = client.get(f"/api/trades/{missing_ticket}/candles")
        assert res.status_code == 200
        body = res.json()
        assert body["ticket"] == missing_ticket
        assert body["cached"] is True
        assert body["h1"] == [sample_bar]
        assert body["m5"] == [sample_bar]
        assert body["m1"] == [sample_bar]
    finally:
        conn = get_db_connection()
        try:
            conn.execute("DELETE FROM trade_candles WHERE ticket = ?", (missing_ticket,))
            conn.commit()
        finally:
            conn.close()
