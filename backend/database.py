from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from backend.infrastructure.db.migrations import _migrate_v3, run_migrations
from backend.infrastructure.db.uow import SqliteUnitOfWork

DB_DIR = str(Path(__file__).resolve().parent.parent / "data")
DB_PATH = str(Path(DB_DIR) / "portfolio.db")


def _uow() -> SqliteUnitOfWork:
    return SqliteUnitOfWork(Path(DB_PATH))


def get_db_connection() -> sqlite3.Connection:
    """Return a WAL-mode SQLite connection (caller must close)."""
    db_file = Path(DB_PATH)
    db_file.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_file, timeout=5.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    conn.execute("PRAGMA busy_timeout=5000;")
    return conn


def init_db() -> None:
    with _uow() as uow:
        run_migrations(uow.conn)
        cnt_row = uow.conn.execute("SELECT COUNT(*) AS cnt FROM review_tags").fetchone()
        if cnt_row and int(cnt_row["cnt"]) == 0:
            _migrate_v3(uow.conn.cursor())


def upsert_account(account_data: dict[str, Any]) -> None:
    with _uow() as uow:
        uow.accounts.upsert(account_data)


def get_all_accounts() -> list[dict[str, Any]]:
    with _uow() as uow:
        return uow.accounts.get_all()


def get_account_by_login(login: int) -> dict[str, Any] | None:
    with _uow() as uow:
        return uow.accounts.get_by_login(login)


def upsert_deals(deals: list[dict[str, Any]]) -> None:
    with _uow() as uow:
        uow.deals.upsert_many(deals)


def get_deals_by_account(account_id: int) -> list[dict[str, Any]]:
    with _uow() as uow:
        return uow.deals.get_by_account(account_id)


def get_deals_for_accounts(account_ids: list[int]) -> list[dict[str, Any]]:
    with _uow() as uow:
        return uow.deals.get_for_accounts(account_ids)


def get_deal_by_ticket(ticket: int) -> dict[str, Any] | None:
    with _uow() as uow:
        return uow.deals.get_by_ticket(ticket)


def save_snapshots(account_id: int, snapshots: list[dict[str, Any]]) -> None:
    with _uow() as uow:
        uow.snapshots.replace_for_account(account_id, snapshots)


def get_snapshots_by_account(account_id: int) -> list[dict[str, Any]]:
    with _uow() as uow:
        return uow.snapshots.get_by_account(account_id)


def append_snapshot(account_id: int, snapshot: dict[str, Any]) -> None:
    with _uow() as uow:
        uow.snapshots.append(account_id, snapshot)


def get_trade_notes(account_id: int) -> dict[int, dict[str, Any]]:
    with _uow() as uow:
        return uow.journal.get_notes_by_account(account_id)


def get_all_trade_notes() -> dict[int, dict[str, Any]]:
    with _uow() as uow:
        return uow.journal.get_all_notes()


def upsert_trade_note(
    ticket: int,
    account_id: int,
    note: str,
    setup_tag: str,
    mistake_tag: str,
    exit_tag: str = "",
    entry_grade: str = "",
    execution_grade: str = "",
    management_grade: str = "",
    updated_at: int = 0,
) -> None:
    with _uow() as uow:
        uow.journal.upsert_note(
            ticket=ticket,
            account_id=account_id,
            note=note,
            setup_tag=setup_tag,
            mistake_tag=mistake_tag,
            exit_tag=exit_tag,
            entry_grade=entry_grade,
            execution_grade=execution_grade,
            management_grade=management_grade,
            updated_at=updated_at,
        )


def get_review_tags(kind: str | None = None) -> list[dict[str, Any]]:
    with _uow() as uow:
        return uow.journal.get_review_tags(kind)


def create_review_tag(kind: str, name: str, category: str = "") -> dict[str, Any]:
    with _uow() as uow:
        return uow.journal.create_review_tag(kind, name, category)


def update_review_tag(
    tag_id: int,
    name: str | None = None,
    category: str | None = None,
) -> dict[str, Any]:
    with _uow() as uow:
        return uow.journal.update_review_tag(tag_id, name, category)


def delete_review_tag(tag_id: int) -> dict[str, Any]:
    with _uow() as uow:
        return uow.journal.delete_review_tag(tag_id)


def get_trade_candles(ticket: int) -> dict[str, list[dict[str, Any]]]:
    with _uow() as uow:
        return uow.candles.get_by_ticket(ticket)


def upsert_trade_candles(
    ticket: int,
    timeframe: str,
    candles: list[dict[str, Any]],
    cached_at: int = 0,
) -> None:
    with _uow() as uow:
        uow.candles.upsert(ticket, timeframe, candles, cached_at)
