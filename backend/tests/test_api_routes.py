from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from backend.api.deps import get_mt5_gateway, get_settings
from backend.app import create_app
from backend.config import Settings
from backend.infrastructure.mt5.simulator import SimulatedMT5Gateway


def _make_test_client(tmp_path: Path) -> TestClient:
    db_path = tmp_path / "api_test.db"
    settings = Settings(db_path=db_path)
    sim_gateway = SimulatedMT5Gateway()
    app = create_app(settings=settings, gateway=sim_gateway)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_mt5_gateway] = lambda: sim_gateway
    return TestClient(app)


def test_accounts_sync_and_portfolio_validation(tmp_path: Path) -> None:
    with _make_test_client(tmp_path) as client:
        res = client.get("/api/accounts")
        assert res.status_code == 200
        body = res.json()
        assert len(body["accounts"]) >= 1
        assert body["active_login"] == SimulatedMT5Gateway.SIM_LOGIN

        # Validation bounds on risk_pct
        bad_zero = client.get("/api/portfolio?risk_pct=0")
        assert bad_zero.status_code == 422
        bad_high = client.get("/api/portfolio?risk_pct=1.5")
        assert bad_high.status_code == 422

        good = client.get("/api/portfolio?risk_pct=0.01")
        assert good.status_code == 200
        assert "stats" in good.json()


def test_tag_not_found_returns_404(tmp_path: Path) -> None:
    with _make_test_client(tmp_path) as client:
        res = client.delete("/api/tags/999999")
        assert res.status_code == 404


def test_manual_initial_sl_override_recalculates_r_and_rejects_wrong_side(tmp_path: Path) -> None:
    with _make_test_client(tmp_path) as client:
        portfolio = client.get("/api/portfolio").json()
        trades = portfolio["closed_trades"]
        assert len(trades) > 0
        target = next(t for t in trades if t["sl"] > 0 and t["open_price"] > 0)

        ticket = target["ticket"]
        account_id = target["account_id"]
        open_price = float(target["open_price"])
        mt5_sl = float(target["sl"])
        orig_risk_r = float(target["risk_r"])
        orig_r_mult = float(target["r_multiple"])
        pos_type = int(target["type"])

        # 1. Wrong-side SL must be rejected with 422
        wrong_sl = round(open_price + 0.01 if pos_type == 0 else open_price - 0.01, 5)
        bad_res = client.post(
            "/api/trades/note",
            json={
                "ticket": ticket,
                "account_id": account_id,
                "initial_sl": wrong_sl,
            },
        )
        assert bad_res.status_code == 422

        # 2. Valid wider Initial SL (2x distance) recalculates 1R & R-multiple while preserving MT5 sl
        orig_diff = abs(open_price - mt5_sl)
        wider_sl = round(
            open_price - (orig_diff * 2.0) if pos_type == 0 else open_price + (orig_diff * 2.0),
            5,
        )
        ok_res = client.post(
            "/api/trades/note",
            json={
                "ticket": ticket,
                "account_id": account_id,
                "note": "Moved SL tighter after entry",
                "initial_sl": wider_sl,
            },
        )
        assert ok_res.status_code == 200

        updated = next(
            t for t in client.get("/api/portfolio").json()["closed_trades"] if t["ticket"] == ticket
        )
        assert updated["sl"] == mt5_sl
        assert updated["initial_sl"] == wider_sl
        assert updated["risk_source"] == "manual_sl"
        assert updated["risk_r"] > orig_risk_r * 1.5
        assert abs(updated["r_multiple"]) < abs(orig_r_mult)

        # 3. Clearing initial_sl reverts back to MT5 SL
        clear_res = client.post(
            "/api/trades/note",
            json={
                "ticket": ticket,
                "account_id": account_id,
                "note": "Moved SL tighter after entry",
                "initial_sl": None,
            },
        )
        assert clear_res.status_code == 200

        reverted = next(
            t for t in client.get("/api/portfolio").json()["closed_trades"] if t["ticket"] == ticket
        )
        assert reverted["initial_sl"] is None
        assert reverted["risk_source"] == "sl"
        assert reverted["risk_r"] == orig_risk_r
        assert reverted["r_multiple"] == orig_r_mult
