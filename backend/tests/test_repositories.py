from __future__ import annotations

from pathlib import Path

from backend.infrastructure.db.migrations import run_migrations
from backend.infrastructure.db.uow import SqliteUnitOfWork


def _init_uow(db_path: Path) -> SqliteUnitOfWork:
    uow = SqliteUnitOfWork(db_path)
    with uow:
        run_migrations(uow.conn)
    return uow


def test_uow_accounts_and_batch_deals(tmp_path: Path) -> None:
    db_path = tmp_path / "repos.db"
    _init_uow(db_path)

    with SqliteUnitOfWork(db_path) as uow:
        uow.accounts.upsert(
            {
                "login": 101,
                "broker": "Demo",
                "name": "A1",
                "server": "S1",
                "balance": 1000.0,
                "equity": 1000.0,
            }
        )
        uow.accounts.upsert(
            {
                "login": 202,
                "broker": "Demo",
                "name": "A2",
                "server": "S1",
                "balance": 2000.0,
                "equity": 2000.0,
            }
        )
        uow.deals.upsert_many(
            [
                {"ticket": 1, "account_id": 101, "time": 100, "entry": 1, "profit": 10.0},
                {"ticket": 2, "account_id": 202, "time": 200, "entry": 1, "profit": 20.0},
            ]
        )

    with SqliteUnitOfWork(db_path) as uow:
        batch = uow.deals.get_for_accounts([101, 202])
        assert [d["ticket"] for d in batch] == [1, 2]
        assert len(uow.accounts.get_all()) == 2


def test_journal_repository_normalized_tags_and_cascade(tmp_path: Path) -> None:
    db_path = tmp_path / "journal.db"
    _init_uow(db_path)

    with SqliteUnitOfWork(db_path) as uow:
        uow.accounts.upsert({"login": 101, "broker": "Demo", "name": "A1", "server": "S1"})
        uow.journal.upsert_note(
            ticket=5001,
            account_id=101,
            note="chased",
            setup_tag="Breakout",
            mistake_tag="FOMO, Custom Slip",
            exit_tag="TP",
            updated_at=1000,
        )

    with SqliteUnitOfWork(db_path) as uow:
        tags = uow.journal.get_review_tags()
        by_key = {(t["kind"], t["name"]): t for t in tags}
        assert ("mistake", "Custom Slip") in by_key
        assert by_key[("mistake", "FOMO")]["usage_count"] == 1
        assert by_key[("mistake", "Custom Slip")]["usage_count"] == 1

        # Rename Custom Slip -> FOMO (merge)
        slip_id = int(by_key[("mistake", "Custom Slip")]["id"])
        uow.journal.update_review_tag(slip_id, name="FOMO", category="entry")

    with SqliteUnitOfWork(db_path) as uow:
        notes = uow.journal.get_notes_by_account(101)
        assert notes[5001]["mistake_tag"] == "FOMO"
        tags_after = {(t["kind"], t["name"]): t for t in uow.journal.get_review_tags()}
        assert ("mistake", "Custom Slip") not in tags_after
        assert tags_after[("mistake", "FOMO")]["usage_count"] == 1

        # Delete FOMO -> cascades to trade_note_tags and clears mistake_tag
        fomo_id = int(tags_after[("mistake", "FOMO")]["id"])
        uow.journal.delete_review_tag(fomo_id)

    with SqliteUnitOfWork(db_path) as uow:
        notes_after = uow.journal.get_notes_by_account(101)
        assert notes_after[5001]["mistake_tag"] == ""
