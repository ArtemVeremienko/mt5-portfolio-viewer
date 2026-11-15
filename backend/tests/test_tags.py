import pytest
from fastapi.testclient import TestClient

import backend.database as db
from backend.main import app


@pytest.fixture()
def isolated_db(tmp_path, monkeypatch):
    db_file = tmp_path / "test_tags.db"
    monkeypatch.setattr(db, "DB_DIR", str(tmp_path))
    monkeypatch.setattr(db, "DB_PATH", str(db_file))
    db.init_db()
    return db_file


def test_default_tags_seeded_and_backfilled(isolated_db):
    # Add a legacy trade_note before review_tags is populated (simulate migration)
    conn = db.get_db_connection()
    conn.execute("DELETE FROM review_tags")
    conn.execute(
        """
        INSERT INTO trade_notes (ticket, account_id, note, setup_tag, mistake_tag, exit_tag, updated_at)
        VALUES (1001, 555, 'test', 'London Breakout', 'FOMO, Custom Slip', 'TP', 1)
        """
    )
    conn.commit()
    conn.close()

    db.init_db()
    tags = db.get_review_tags()
    names_by_kind = {(t["kind"], t["name"]): t for t in tags}

    assert ("exit", "TP") in names_by_kind
    assert ("mistake", "FOMO") in names_by_kind
    assert names_by_kind[("mistake", "FOMO")]["category"] == "entry"
    assert ("mistake", "Moved SL") in names_by_kind
    assert names_by_kind[("mistake", "Moved SL")]["category"] == "exit_mgmt"
    assert ("setup", "London Breakout") in names_by_kind
    assert ("mistake", "Custom Slip") in names_by_kind
    assert names_by_kind[("setup", "London Breakout")]["usage_count"] == 1


def test_create_rename_merge_recategorize_and_delete_tags(isolated_db):
    client = TestClient(app)

    # Create a custom mistake tag under exit_mgmt
    res = client.post(
        "/api/tags",
        json={"kind": "mistake", "name": "Trail Too Tight", "category": "exit_mgmt"},
    )
    assert res.status_code == 200
    created_mistake = res.json()["tag"]
    assert created_mistake["category"] == "exit_mgmt"

    # Create a typo setup tag and assign it to two trades across two accounts
    res = client.post("/api/tags", json={"kind": "setup", "name": "Lndon Brakout"})
    assert res.status_code == 200
    typo_setup = res.json()["tag"]

    db.upsert_trade_note(
        ticket=2001,
        account_id=101,
        note="",
        setup_tag="Lndon Brakout",
        mistake_tag="Trail Too Tight, FOMO",
        exit_tag="TP",
        updated_at=10,
    )
    db.upsert_trade_note(
        ticket=2002,
        account_id=202,
        note="",
        setup_tag="Lndon Brakout",
        mistake_tag="Trail Too Tight",
        exit_tag="Manual",
        updated_at=11,
    )

    # Rename setup tag globally across accounts
    res = client.patch(
        f"/api/tags/{typo_setup['id']}",
        json={"name": "London Breakout"},
    )
    assert res.status_code == 200
    renamed = res.json()["tag"]
    assert renamed["name"] == "London Breakout"
    assert renamed["usage_count"] == 2

    notes_101 = db.get_trade_notes(101)
    notes_202 = db.get_trade_notes(202)
    assert notes_101[2001]["setup_tag"] == "London Breakout"
    assert notes_202[2002]["setup_tag"] == "London Breakout"

    # Recategorize mistake tag and merge into existing FOMO
    res = client.patch(
        f"/api/tags/{created_mistake['id']}",
        json={"name": "Trail Too Tight", "category": "entry"},
    )
    assert res.status_code == 200
    assert res.json()["tag"]["category"] == "entry"

    # Merge "Trail Too Tight" into "FOMO" -> should deduplicate ticket 2001's mistake_tag
    res = client.patch(
        f"/api/tags/{created_mistake['id']}",
        json={"name": "FOMO", "category": "entry"},
    )
    assert res.status_code == 200
    merged = res.json()["tag"]
    assert merged["name"] == "FOMO"
    assert merged["usage_count"] == 2

    assert db.get_trade_notes(101)[2001]["mistake_tag"] == "FOMO"
    assert db.get_trade_notes(202)[2002]["mistake_tag"] == "FOMO"

    # Delete setup tag -> strips from historical trades
    res = client.delete(f"/api/tags/{renamed['id']}")
    assert res.status_code == 200
    assert res.json()["affected_trades"] == 2
    assert db.get_trade_notes(101)[2001]["setup_tag"] == ""
    assert db.get_trade_notes(202)[2002]["setup_tag"] == ""
