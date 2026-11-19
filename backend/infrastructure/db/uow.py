from __future__ import annotations

import sqlite3
from pathlib import Path
from types import TracebackType

from backend.infrastructure.db.connection import get_connection
from backend.infrastructure.db.repositories import (
    AccountRepository,
    CandleRepository,
    DealRepository,
    JournalRepository,
    SnapshotRepository,
    SymbolCandleRepository,
)


class SqliteUnitOfWork:
    """Context-managed SQLite transaction boundary owning all repositories."""

    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._conn_cm: Any = None
        self.conn: sqlite3.Connection
        self.accounts: AccountRepository
        self.deals: DealRepository
        self.snapshots: SnapshotRepository
        self.journal: JournalRepository
        self.candles: CandleRepository
        self.symbol_candles: SymbolCandleRepository

    def __enter__(self) -> SqliteUnitOfWork:
        self._conn_cm = get_connection(self._db_path)
        self.conn = self._conn_cm.__enter__()
        self.accounts = AccountRepository(self.conn)
        self.deals = DealRepository(self.conn)
        self.snapshots = SnapshotRepository(self.conn)
        self.journal = JournalRepository(self.conn)
        self.candles = CandleRepository(self.conn)
        self.symbol_candles = SymbolCandleRepository(self.conn)
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        self._conn_cm.__exit__(exc_type, exc_val, exc_tb)


from typing import Any  # noqa: E402
