from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import backend.database as db


@pytest.fixture(autouse=True)
def _isolate_database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Ensure no test ever reads or mutates the production data/portfolio.db."""
    db_file = tmp_path / "test_portfolio.db"
    monkeypatch.setattr(db, "DB_DIR", str(tmp_path))
    monkeypatch.setattr(db, "DB_PATH", str(db_file))
    db.init_db()
    return db_file


@pytest.fixture()
def client() -> TestClient:
    from backend.main import app

    with TestClient(app) as test_client:
        yield test_client
