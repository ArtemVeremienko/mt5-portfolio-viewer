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
