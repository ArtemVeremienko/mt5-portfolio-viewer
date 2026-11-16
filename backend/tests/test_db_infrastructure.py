from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from backend.infrastructure.db.connection import get_connection
from backend.infrastructure.db.migrations import LATEST_SCHEMA_VERSION, run_migrations


def test_get_connection_configures_pragmas_and_commits(tmp_path: Path) -> None:
    db_path = tmp_path / "nested" / "app.db"
    with get_connection(db_path) as conn:
        assert conn.row_factory is sqlite3.Row
        journal_mode = conn.execute("PRAGMA journal_mode;").fetchone()[0]
        foreign_keys = conn.execute("PRAGMA foreign_keys;").fetchone()[0]
        busy_timeout = conn.execute("PRAGMA busy_timeout;").fetchone()[0]
        assert str(journal_mode).lower() == "wal"
        assert foreign_keys == 1
        assert busy_timeout >= 5000

        conn.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)")
        conn.execute("INSERT INTO t (id, val) VALUES (1, 'ok')")

    # Verify committed and closed
    with get_connection(db_path) as conn2:
        row = conn2.execute("SELECT val FROM t WHERE id = 1").fetchone()
        assert row is not None
        assert row["val"] == "ok"


def test_get_connection_rolls_back_on_error(tmp_path: Path) -> None:
    db_path = tmp_path / "rollback.db"
    with get_connection(db_path) as conn:
        conn.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)")

    with pytest.raises(RuntimeError, match="boom"), get_connection(db_path) as conn:
        conn.execute("INSERT INTO t (id, val) VALUES (1, 'bad')")
        raise RuntimeError("boom")

    with get_connection(db_path) as conn:
        count = conn.execute("SELECT COUNT(*) FROM t").fetchone()[0]
        assert count == 0


def test_run_migrations_creates_schema_indexes_and_normalizes_tags(tmp_path: Path) -> None:
    db_path = tmp_path / "migrate.db"
    # Simulate a legacy database at version 0 with comma-separated mistake_tag
    with get_connection(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE trade_notes (
                ticket INTEGER PRIMARY KEY,
                account_id INTEGER NOT NULL,
                note TEXT DEFAULT '',
                setup_tag TEXT DEFAULT '',
                mistake_tag TEXT DEFAULT '',
                exit_tag TEXT DEFAULT '',
                updated_at INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            """
            INSERT INTO trade_notes (ticket, account_id, note, setup_tag, mistake_tag, exit_tag, updated_at)
            VALUES (1001, 555, 'legacy', 'London Breakout', 'FOMO, Custom Mistake', 'TP', 1700000000)
            """
        )

    with get_connection(db_path) as conn:
        run_migrations(conn)
        version = conn.execute("PRAGMA user_version;").fetchone()[0]
        assert version == LATEST_SCHEMA_VERSION

        # Verify normalized join table was populated
        linked = conn.execute(
            """
            SELECT rt.kind, rt.name
            FROM trade_note_tags tnt
            JOIN review_tags rt ON rt.id = tnt.tag_id
            WHERE tnt.ticket = 1001
            ORDER BY rt.kind, rt.name
            """
        ).fetchall()
        linked_pairs = {(r["kind"], r["name"]) for r in linked}
        assert ("mistake", "FOMO") in linked_pairs
        assert ("mistake", "Custom Mistake") in linked_pairs

        # Verify indexes exist
        indexes = {
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'index'"
            ).fetchall()
        }
        assert "idx_deals_acc_entry_time" in indexes
        assert "idx_deals_symbol" in indexes

        # Idempotent re-run
        run_migrations(conn)
        assert conn.execute("PRAGMA user_version;").fetchone()[0] == LATEST_SCHEMA_VERSION
        assert LATEST_SCHEMA_VERSION == 4

        # Verify setup & exit tags were also normalized into trade_note_tags
        assert ("setup", "London Breakout") in linked_pairs
        assert ("exit", "TP") in linked_pairs

        # Verify trade_candles index & deals composite PK
        assert "idx_trade_candles_cached_at" in indexes
        assert "idx_deals_ticket" in indexes
        fk_errors = conn.execute("PRAGMA foreign_key_check;").fetchall()
        assert fk_errors == []


def test_v4_migration_on_copy_of_real_db_if_present(tmp_path: Path) -> None:
    real_db = Path("data/portfolio.db")
    if not real_db.exists():
        return
    copy_db = tmp_path / "copy_portfolio.db"
    copy_db.write_bytes(real_db.read_bytes())

    with get_connection(copy_db) as conn:
        deals_before = conn.execute("SELECT COUNT(*) FROM deals").fetchone()[0]
        notes_before = conn.execute("SELECT COUNT(*) FROM trade_notes").fetchone()[0]
        run_migrations(conn)
        assert conn.execute("PRAGMA user_version;").fetchone()[0] == 4
        assert conn.execute("SELECT COUNT(*) FROM deals").fetchone()[0] == deals_before
        assert conn.execute("SELECT COUNT(*) FROM trade_notes").fetchone()[0] == notes_before
        assert conn.execute("PRAGMA foreign_key_check;").fetchall() == []
