from fastapi.testclient import TestClient
from backend.main import app

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
