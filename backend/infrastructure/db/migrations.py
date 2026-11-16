from __future__ import annotations

import sqlite3
import time
from collections.abc import Callable

LATEST_SCHEMA_VERSION = 3

VALID_TAG_KINDS = frozenset({"setup", "exit", "mistake"})
VALID_MISTAKE_CATEGORIES = frozenset({"entry", "exit_mgmt"})

DEFAULT_EXIT_TAG_PRESETS = (
    "TP",
    "SL",
    "BE+",
    "BE-",
    "Trailing",
    "Manual",
    "Partial TP",
    "Time Exit",
)
DEFAULT_ENTRY_MISTAKE_PRESETS = (
    "FOMO",
    "Chased",
    "Early Entry",
    "Counter-Trend",
    "No Setup",
)
DEFAULT_EXIT_MISTAKE_PRESETS = (
    "Moved SL",
    "Early Exit",
    "Hesitated",
    "Oversized",
    "Revenge",
)


def parse_tag_list(raw: str | None) -> list[str]:
    """Parse a comma-separated tag list preserving order and deduplicating case-insensitively."""
    if not raw:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for part in str(raw).split(","):
        trimmed = part.strip()
        if not trimmed:
            continue
        key = trimmed.lower()
        if key not in seen:
            seen.add(key)
            out.append(trimmed)
    return out


def normalize_tag_category(kind: str, category: str | None) -> str:
    """Normalize category for mistake tags; non-mistake tags always have an empty category."""
    if kind != "mistake":
        return ""
    cat = (category or "").strip().lower()
    return cat if cat in VALID_MISTAKE_CATEGORIES else "entry"


def register_tag_cursor(
    cursor: sqlite3.Cursor,
    kind: str,
    name: str,
    category: str = "",
    is_default: int = 0,
) -> int | None:
    """Insert a review tag if absent and return its tag ID."""
    trimmed = (name or "").strip()
    if not trimmed or kind not in VALID_TAG_KINDS:
        return None
    cat = normalize_tag_category(kind, category)
    name_lower = trimmed.lower()
    cursor.execute(
        """
        INSERT OR IGNORE INTO review_tags (kind, name, name_lower, category, is_default, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (kind, trimmed, name_lower, cat, is_default, int(time.time())),
    )
    row = cursor.execute(
        "SELECT id FROM review_tags WHERE kind = ? AND name_lower = ?",
        (kind, name_lower),
    ).fetchone()
    return int(row["id"]) if row else None


def _migrate_v1(cursor: sqlite3.Cursor) -> None:
    """Initial schema creation + legacy column backfills."""
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS accounts (
            login INTEGER PRIMARY KEY,
            broker TEXT,
            name TEXT,
            server TEXT,
            currency TEXT DEFAULT 'USD',
            leverage INTEGER DEFAULT 100,
            balance REAL DEFAULT 0.0,
            equity REAL DEFAULT 0.0,
            margin REAL DEFAULT 0.0,
            free_margin REAL DEFAULT 0.0,
            margin_level REAL DEFAULT 0.0,
            is_demo INTEGER DEFAULT 1,
            last_synced_at INTEGER
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS deals (
            ticket INTEGER PRIMARY KEY,
            order_id INTEGER,
            account_id INTEGER,
            time INTEGER,
            time_msc INTEGER,
            type INTEGER,
            entry INTEGER,
            symbol TEXT,
            volume REAL,
            price REAL,
            profit REAL,
            swap REAL,
            commission REAL,
            sl REAL,
            tp REAL,
            open_time INTEGER,
            open_price REAL,
            comment TEXT,
            magic INTEGER DEFAULT 0,
            risk_r REAL,
            r_multiple REAL,
            mae_price REAL DEFAULT 0.0,
            mfe_price REAL DEFAULT 0.0,
            mae_pips REAL DEFAULT 0.0,
            mfe_pips REAL DEFAULT 0.0,
            mae_amount REAL DEFAULT 0.0,
            mfe_amount REAL DEFAULT 0.0,
            mae_r REAL DEFAULT 0.0,
            mfe_r REAL DEFAULT 0.0,
            FOREIGN KEY(account_id) REFERENCES accounts(login)
        )
        """
    )

    existing_deal_cols = {
        row[1] for row in cursor.execute("PRAGMA table_info(deals)").fetchall()
    }
    legacy_deal_cols = (
        ("mae_price", "REAL DEFAULT 0.0"),
        ("mfe_price", "REAL DEFAULT 0.0"),
        ("mae_pips", "REAL DEFAULT 0.0"),
        ("mfe_pips", "REAL DEFAULT 0.0"),
        ("mae_amount", "REAL DEFAULT 0.0"),
        ("mfe_amount", "REAL DEFAULT 0.0"),
        ("mae_r", "REAL DEFAULT 0.0"),
        ("mfe_r", "REAL DEFAULT 0.0"),
        ("magic", "INTEGER DEFAULT 0"),
    )
    for col_name, col_def in legacy_deal_cols:
        if col_name not in existing_deal_cols:
            cursor.execute(f"ALTER TABLE deals ADD COLUMN {col_name} {col_def}")

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS equity_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER,
            timestamp INTEGER,
            balance REAL,
            equity REAL,
            growth_pct REAL,
            drawdown_pct REAL,
            cumulative_r REAL,
            FOREIGN KEY(account_id) REFERENCES accounts(login)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS trade_notes (
            ticket INTEGER PRIMARY KEY,
            account_id INTEGER,
            note TEXT DEFAULT '',
            setup_tag TEXT DEFAULT '',
            mistake_tag TEXT DEFAULT '',
            exit_tag TEXT DEFAULT '',
            entry_grade TEXT DEFAULT '',
            execution_grade TEXT DEFAULT '',
            management_grade TEXT DEFAULT '',
            updated_at INTEGER DEFAULT 0
        )
        """
    )
    existing_note_cols = {
        row[1] for row in cursor.execute("PRAGMA table_info(trade_notes)").fetchall()
    }
    for col_name, col_def in (
        ("exit_tag", "TEXT DEFAULT ''"),
        ("entry_grade", "TEXT DEFAULT ''"),
        ("execution_grade", "TEXT DEFAULT ''"),
        ("management_grade", "TEXT DEFAULT ''"),
    ):
        if col_name not in existing_note_cols:
            cursor.execute(f"ALTER TABLE trade_notes ADD COLUMN {col_name} {col_def}")

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS trade_candles (
            ticket INTEGER NOT NULL,
            timeframe TEXT NOT NULL,
            candles_json TEXT NOT NULL,
            cached_at INTEGER DEFAULT 0,
            PRIMARY KEY (ticket, timeframe)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS review_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            name TEXT NOT NULL,
            name_lower TEXT NOT NULL,
            category TEXT DEFAULT '',
            is_default INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT 0,
            UNIQUE(kind, name_lower)
        )
        """
    )


def _migrate_v2(cursor: sqlite3.Cursor) -> None:
    """Create performance indexes on deals, snapshots, notes, and tags."""
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_deals_acc_time ON deals(account_id, time)")
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_deals_acc_entry_time ON deals(account_id, entry, time)"
    )
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_deals_symbol ON deals(account_id, symbol)")
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_snapshots_acc_time ON equity_snapshots(account_id, timestamp)"
    )
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_notes_acc ON trade_notes(account_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_review_tags_kind ON review_tags(kind)")


def _migrate_v3(cursor: sqlite3.Cursor) -> None:
    """Normalize review_tags presets and create trade_note_tags join table."""
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS trade_note_tags (
            ticket INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (ticket, tag_id),
            FOREIGN KEY(ticket) REFERENCES trade_notes(ticket) ON DELETE CASCADE,
            FOREIGN KEY(tag_id) REFERENCES review_tags(id) ON DELETE CASCADE
        )
        """
    )
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trade_note_tags_tag ON trade_note_tags(tag_id)")

    for preset in DEFAULT_EXIT_TAG_PRESETS:
        register_tag_cursor(cursor, "exit", preset, "", is_default=1)
    for preset in DEFAULT_ENTRY_MISTAKE_PRESETS:
        register_tag_cursor(cursor, "mistake", preset, "entry", is_default=1)
    for preset in DEFAULT_EXIT_MISTAKE_PRESETS:
        register_tag_cursor(cursor, "mistake", preset, "exit_mgmt", is_default=1)

    rows = cursor.execute(
        "SELECT ticket, setup_tag, exit_tag, mistake_tag FROM trade_notes"
    ).fetchall()
    for row in rows:
        ticket = int(row["ticket"])
        setup_val = (row["setup_tag"] or "").strip()
        if setup_val:
            register_tag_cursor(cursor, "setup", setup_val, "", is_default=0)
        exit_val = (row["exit_tag"] or "").strip()
        if exit_val:
            register_tag_cursor(cursor, "exit", exit_val, "", is_default=0)
        for m_val in parse_tag_list(row["mistake_tag"]):
            tag_id = register_tag_cursor(cursor, "mistake", m_val, "entry", is_default=0)
            if tag_id is not None:
                cursor.execute(
                    "INSERT OR IGNORE INTO trade_note_tags (ticket, tag_id) VALUES (?, ?)",
                    (ticket, tag_id),
                )


_MIGRATIONS: tuple[tuple[int, Callable[[sqlite3.Cursor], None]], ...] = (
    (1, _migrate_v1),
    (2, _migrate_v2),
    (3, _migrate_v3),
)


def run_migrations(conn: sqlite3.Connection) -> None:
    """Apply pending versioned SQLite migrations tracked by PRAGMA user_version."""
    current_version = int(conn.execute("PRAGMA user_version;").fetchone()[0])
    cursor = conn.cursor()
    for version, migration_fn in _MIGRATIONS:
        if current_version < version:
            migration_fn(cursor)
            cursor.execute(f"PRAGMA user_version = {version};")
            current_version = version
