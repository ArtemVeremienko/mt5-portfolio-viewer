import sqlite3
import os
import json
import time
from typing import List, Dict, Any, Optional

VALID_TAG_KINDS = {"setup", "exit", "mistake"}
VALID_MISTAKE_CATEGORIES = {"entry", "exit_mgmt"}

DEFAULT_EXIT_TAG_PRESETS = ["TP", "SL", "BE", "Trailing", "Manual"]
DEFAULT_ENTRY_MISTAKE_PRESETS = ["FOMO", "Chased", "Early Entry", "Counter-Trend", "No Setup"]
DEFAULT_EXIT_MISTAKE_PRESETS = ["Moved SL", "Early Exit", "Hesitated", "Oversized", "Revenge"]

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
DB_PATH = os.path.join(DB_DIR, "portfolio.db")

def get_db_connection() -> sqlite3.Connection:
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
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
    """)
    
    cursor.execute("""
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
    """)
    
    # Auto-migrate existing deals table if columns are missing
    existing_cols = [row[1] for row in cursor.execute("PRAGMA table_info(deals)").fetchall()]
    new_cols = [
        ("mae_price", "REAL DEFAULT 0.0"),
        ("mfe_price", "REAL DEFAULT 0.0"),
        ("mae_pips", "REAL DEFAULT 0.0"),
        ("mfe_pips", "REAL DEFAULT 0.0"),
        ("mae_amount", "REAL DEFAULT 0.0"),
        ("mfe_amount", "REAL DEFAULT 0.0"),
        ("mae_r", "REAL DEFAULT 0.0"),
        ("mfe_r", "REAL DEFAULT 0.0"),
        ("magic", "INTEGER DEFAULT 0"),
    ]
    for col_name, col_def in new_cols:
        if col_name not in existing_cols:
            cursor.execute(f"ALTER TABLE deals ADD COLUMN {col_name} {col_def}")
    
    cursor.execute("""
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
    """)
    
    cursor.execute("""
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
        updated_at INTEGER DEFAULT 0,
        FOREIGN KEY(account_id) REFERENCES accounts(login)
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS trade_candles (
        ticket INTEGER NOT NULL,
        timeframe TEXT NOT NULL,
        candles_json TEXT NOT NULL,
        cached_at INTEGER DEFAULT 0,
        PRIMARY KEY (ticket, timeframe)
    )
    """)

    cursor.execute("""
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
    """)

    existing_note_cols = [row[1] for row in cursor.execute("PRAGMA table_info(trade_notes)").fetchall()]
    for col_name, col_def in [
        ("exit_tag", "TEXT DEFAULT ''"),
        ("entry_grade", "TEXT DEFAULT ''"),
        ("execution_grade", "TEXT DEFAULT ''"),
        ("management_grade", "TEXT DEFAULT ''"),
    ]:
        if col_name not in existing_note_cols:
            cursor.execute(f"ALTER TABLE trade_notes ADD COLUMN {col_name} {col_def}")

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_deals_acc_time ON deals(account_id, time)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_acc_time ON equity_snapshots(account_id, timestamp)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_notes_acc ON trade_notes(account_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_review_tags_kind ON review_tags(kind)")

    _seed_and_backfill_review_tags(cursor)
    
    conn.commit()
    conn.close()

def upsert_account(account_data: Dict[str, Any]):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO accounts (login, broker, name, server, currency, leverage, balance, equity, margin, free_margin, margin_level, is_demo, last_synced_at)
    VALUES (:login, :broker, :name, :server, :currency, :leverage, :balance, :equity, :margin, :free_margin, :margin_level, :is_demo, :last_synced_at)
    ON CONFLICT(login) DO UPDATE SET
        broker = excluded.broker,
        name = excluded.name,
        server = excluded.server,
        currency = excluded.currency,
        leverage = excluded.leverage,
        balance = excluded.balance,
        equity = excluded.equity,
        margin = excluded.margin,
        free_margin = excluded.free_margin,
        margin_level = excluded.margin_level,
        is_demo = excluded.is_demo,
        last_synced_at = excluded.last_synced_at
    """, account_data)
    conn.commit()
    conn.close()

def get_all_accounts() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM accounts ORDER BY last_synced_at DESC")
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows

def get_account_by_login(login: int) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM accounts WHERE login = ?", (login,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def upsert_deals(deals: List[Dict[str, Any]]):
    if not deals:
        return
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Ensure default values for excursion fields
    normalized_deals = []
    for d in deals:
        deal_copy = dict(d)
        deal_copy.setdefault("mae_price", 0.0)
        deal_copy.setdefault("mfe_price", 0.0)
        deal_copy.setdefault("mae_pips", 0.0)
        deal_copy.setdefault("mfe_pips", 0.0)
        deal_copy.setdefault("mae_amount", 0.0)
        deal_copy.setdefault("mfe_amount", 0.0)
        deal_copy.setdefault("mae_r", 0.0)
        deal_copy.setdefault("mfe_r", 0.0)
        deal_copy.setdefault("magic", 0)
        normalized_deals.append(deal_copy)

    cursor.executemany("""
    INSERT INTO deals (ticket, order_id, account_id, time, time_msc, type, entry, symbol, volume, price, profit, swap, commission, sl, tp, open_time, open_price, comment, magic, risk_r, r_multiple, mae_price, mfe_price, mae_pips, mfe_pips, mae_amount, mfe_amount, mae_r, mfe_r)
    VALUES (:ticket, :order_id, :account_id, :time, :time_msc, :type, :entry, :symbol, :volume, :price, :profit, :swap, :commission, :sl, :tp, :open_time, :open_price, :comment, :magic, :risk_r, :r_multiple, :mae_price, :mfe_price, :mae_pips, :mfe_pips, :mae_amount, :mfe_amount, :mae_r, :mfe_r)
    ON CONFLICT(ticket) DO UPDATE SET
        order_id = excluded.order_id,
        account_id = excluded.account_id,
        time = excluded.time,
        time_msc = excluded.time_msc,
        type = excluded.type,
        entry = excluded.entry,
        symbol = excluded.symbol,
        volume = excluded.volume,
        price = excluded.price,
        profit = excluded.profit,
        swap = excluded.swap,
        commission = excluded.commission,
        sl = excluded.sl,
        tp = excluded.tp,
        open_time = excluded.open_time,
        open_price = excluded.open_price,
        comment = excluded.comment,
        magic = excluded.magic,
        risk_r = excluded.risk_r,
        r_multiple = excluded.r_multiple,
        mae_price = excluded.mae_price,
        mfe_price = excluded.mfe_price,
        mae_pips = excluded.mae_pips,
        mfe_pips = excluded.mfe_pips,
        mae_amount = excluded.mae_amount,
        mfe_amount = excluded.mfe_amount,
        mae_r = excluded.mae_r,
        mfe_r = excluded.mfe_r
    """, normalized_deals)
    conn.commit()
    conn.close()

def get_deals_by_account(account_id: int) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM deals WHERE account_id = ? ORDER BY time ASC", (account_id,))
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows

def save_snapshots(snapshots: List[Dict[str, Any]], account_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    # Replace existing snapshots for this account
    cursor.execute("DELETE FROM equity_snapshots WHERE account_id = ?", (account_id,))
    if snapshots:
        cursor.executemany("""
        INSERT INTO equity_snapshots (account_id, timestamp, balance, equity, growth_pct, drawdown_pct, cumulative_r)
        VALUES (:account_id, :timestamp, :balance, :equity, :growth_pct, :drawdown_pct, :cumulative_r)
        """, snapshots)
    conn.commit()
    conn.close()

def get_snapshots_by_account(account_id: int) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM equity_snapshots WHERE account_id = ? ORDER BY timestamp ASC", (account_id,))
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows


def append_snapshot(account_id: int, snapshot: Dict[str, Any]):
    """Appends a single live equity snapshot for an account."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO equity_snapshots (account_id, timestamp, balance, equity, growth_pct, drawdown_pct, cumulative_r)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        account_id,
        snapshot.get("timestamp", 0),
        snapshot.get("balance", 0.0),
        snapshot.get("equity", 0.0),
        snapshot.get("growth_pct", 0.0),
        snapshot.get("drawdown_pct", 0.0),
        snapshot.get("cumulative_r", 0.0),
    ))
    conn.commit()
    conn.close()


def get_trade_notes(account_id: int) -> Dict[int, Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT ticket, note, setup_tag, mistake_tag, exit_tag, entry_grade, execution_grade, management_grade, updated_at FROM trade_notes WHERE account_id = ?",
        (account_id,),
    )
    rows = {int(r["ticket"]): dict(r) for r in cursor.fetchall()}
    conn.close()
    return rows


def _parse_tag_list(raw: Optional[str]) -> List[str]:
    if not raw:
        return []
    seen = set()
    out: List[str] = []
    for part in str(raw).split(","):
        trimmed = part.strip()
        if not trimmed:
            continue
        key = trimmed.lower()
        if key not in seen:
            seen.add(key)
            out.append(trimmed)
    return out


def _normalize_tag_category(kind: str, category: Optional[str]) -> str:
    if kind != "mistake":
        return ""
    cat = (category or "").strip().lower()
    return cat if cat in VALID_MISTAKE_CATEGORIES else "entry"


def _register_tag_cursor(
    cursor: sqlite3.Cursor,
    kind: str,
    name: str,
    category: str = "",
    is_default: int = 0,
):
    trimmed = (name or "").strip()
    if not trimmed or kind not in VALID_TAG_KINDS:
        return
    cat = _normalize_tag_category(kind, category)
    cursor.execute(
        """
        INSERT OR IGNORE INTO review_tags (kind, name, name_lower, category, is_default, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (kind, trimmed, trimmed.lower(), cat, is_default, int(time.time())),
    )


def _seed_and_backfill_review_tags(cursor: sqlite3.Cursor):
    count_row = cursor.execute("SELECT COUNT(*) AS cnt FROM review_tags").fetchone()
    if count_row and int(count_row["cnt"]) > 0:
        return

    for preset in DEFAULT_EXIT_TAG_PRESETS:
        _register_tag_cursor(cursor, "exit", preset, "", is_default=1)
    for preset in DEFAULT_ENTRY_MISTAKE_PRESETS:
        _register_tag_cursor(cursor, "mistake", preset, "entry", is_default=1)
    for preset in DEFAULT_EXIT_MISTAKE_PRESETS:
        _register_tag_cursor(cursor, "mistake", preset, "exit_mgmt", is_default=1)

    rows = cursor.execute("SELECT setup_tag, exit_tag, mistake_tag FROM trade_notes").fetchall()
    for row in rows:
        setup_val = (row["setup_tag"] or "").strip()
        if setup_val:
            _register_tag_cursor(cursor, "setup", setup_val, "", is_default=0)
        exit_val = (row["exit_tag"] or "").strip()
        if exit_val:
            _register_tag_cursor(cursor, "exit", exit_val, "", is_default=0)
        for m_val in _parse_tag_list(row["mistake_tag"]):
            _register_tag_cursor(cursor, "mistake", m_val, "entry", is_default=0)


def upsert_trade_note(
    ticket: int,
    account_id: int,
    note: str,
    setup_tag: str = "",
    mistake_tag: str = "",
    exit_tag: str = "",
    entry_grade: str = "",
    execution_grade: str = "",
    management_grade: str = "",
    updated_at: int = 0,
):
    clean_setup = (setup_tag or "").strip()
    clean_exit = (exit_tag or "").strip()
    clean_mistakes = _parse_tag_list(mistake_tag)
    clean_mistake_str = ", ".join(clean_mistakes)

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO trade_notes (ticket, account_id, note, setup_tag, mistake_tag, exit_tag, entry_grade, execution_grade, management_grade, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ticket) DO UPDATE SET
            note = excluded.note,
            setup_tag = excluded.setup_tag,
            mistake_tag = excluded.mistake_tag,
            exit_tag = excluded.exit_tag,
            entry_grade = excluded.entry_grade,
            execution_grade = excluded.execution_grade,
            management_grade = excluded.management_grade,
            updated_at = excluded.updated_at
        """, (ticket, account_id, note, clean_setup, clean_mistake_str, clean_exit, entry_grade, execution_grade, management_grade, updated_at))

        if clean_setup:
            _register_tag_cursor(cursor, "setup", clean_setup, "")
        if clean_exit:
            _register_tag_cursor(cursor, "exit", clean_exit, "")
        for m in clean_mistakes:
            _register_tag_cursor(cursor, "mistake", m, "entry")

        conn.commit()
    finally:
        conn.close()


def _compute_tag_usage_counts(cursor: sqlite3.Cursor) -> Dict[tuple, int]:
    counts: Dict[tuple, int] = {}
    rows = cursor.execute("SELECT setup_tag, exit_tag, mistake_tag FROM trade_notes").fetchall()
    for row in rows:
        s = (row["setup_tag"] or "").strip().lower()
        if s:
            counts[("setup", s)] = counts.get(("setup", s), 0) + 1
        e = (row["exit_tag"] or "").strip().lower()
        if e:
            counts[("exit", e)] = counts.get(("exit", e), 0) + 1
        for m in _parse_tag_list(row["mistake_tag"]):
            mk = m.lower()
            counts[("mistake", mk)] = counts.get(("mistake", mk), 0) + 1
    return counts


def get_review_tags() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        counts = _compute_tag_usage_counts(cursor)
        rows = cursor.execute(
            "SELECT id, kind, name, category, is_default, created_at FROM review_tags ORDER BY kind ASC, category ASC, id ASC"
        ).fetchall()
        result: List[Dict[str, Any]] = []
        for r in rows:
            item = dict(r)
            item["is_default"] = bool(item["is_default"])
            item["usage_count"] = counts.get((item["kind"], item["name"].strip().lower()), 0)
            result.append(item)
        return result
    finally:
        conn.close()


def create_review_tag(kind: str, name: str, category: str = "") -> Dict[str, Any]:
    kind_norm = (kind or "").strip().lower()
    if kind_norm not in VALID_TAG_KINDS:
        raise ValueError(f"Invalid tag kind: {kind}")
    clean_name = (name or "").strip()
    if not clean_name:
        raise ValueError("Tag name cannot be empty")
    cat = _normalize_tag_category(kind_norm, category)

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        existing = cursor.execute(
            "SELECT id, kind, name, category, is_default, created_at FROM review_tags WHERE kind = ? AND name_lower = ?",
            (kind_norm, clean_name.lower()),
        ).fetchone()
        if existing:
            item = dict(existing)
            item["is_default"] = bool(item["is_default"])
            counts = _compute_tag_usage_counts(cursor)
            item["usage_count"] = counts.get((kind_norm, clean_name.lower()), 0)
            return item

        cursor.execute(
            """
            INSERT INTO review_tags (kind, name, name_lower, category, is_default, created_at)
            VALUES (?, ?, ?, ?, 0, ?)
            """,
            (kind_norm, clean_name, clean_name.lower(), cat, int(time.time())),
        )
        new_id = cursor.lastrowid
        conn.commit()
        row = cursor.execute(
            "SELECT id, kind, name, category, is_default, created_at FROM review_tags WHERE id = ?",
            (new_id,),
        ).fetchone()
        item = dict(row)
        item["is_default"] = bool(item["is_default"])
        counts = _compute_tag_usage_counts(cursor)
        item["usage_count"] = counts.get((kind_norm, clean_name.lower()), 0)
        return item
    finally:
        conn.close()


def _rename_tag_in_notes(cursor: sqlite3.Cursor, kind: str, old_lower: str, new_name: str) -> int:
    affected = 0
    if kind in ("setup", "exit"):
        col = "setup_tag" if kind == "setup" else "exit_tag"
        rows = cursor.execute(f"SELECT ticket, {col} FROM trade_notes WHERE {col} != ''").fetchall()
        for r in rows:
            val = (r[col] or "").strip()
            if val.lower() == old_lower and val != new_name:
                cursor.execute(f"UPDATE trade_notes SET {col} = ? WHERE ticket = ?", (new_name, r["ticket"]))
                affected += 1
    elif kind == "mistake":
        rows = cursor.execute("SELECT ticket, mistake_tag FROM trade_notes WHERE mistake_tag != ''").fetchall()
        new_lower = new_name.lower()
        for r in rows:
            tags = _parse_tag_list(r["mistake_tag"])
            changed = False
            out: List[str] = []
            seen = set()
            for t in tags:
                tl = t.lower()
                if tl == old_lower:
                    if t != new_name:
                        changed = True
                    if new_lower not in seen:
                        seen.add(new_lower)
                        out.append(new_name)
                    else:
                        changed = True
                else:
                    if tl not in seen:
                        seen.add(tl)
                        out.append(t)
            if changed:
                cursor.execute(
                    "UPDATE trade_notes SET mistake_tag = ? WHERE ticket = ?",
                    (", ".join(out), r["ticket"]),
                )
                affected += 1
    return affected


def update_review_tag(tag_id: int, name: str, category: Optional[str] = None) -> Dict[str, Any]:
    clean_name = (name or "").strip()
    if not clean_name:
        raise ValueError("Tag name cannot be empty")
    new_lower = clean_name.lower()

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        current = cursor.execute(
            "SELECT id, kind, name, name_lower, category, is_default, created_at FROM review_tags WHERE id = ?",
            (tag_id,),
        ).fetchone()
        if not current:
            raise ValueError("Tag not found")

        kind = current["kind"]
        old_name = current["name"]
        old_lower = current["name_lower"]
        next_cat = (
            _normalize_tag_category(kind, category)
            if category is not None
            else current["category"]
        )

        collision = cursor.execute(
            "SELECT id, name, category FROM review_tags WHERE kind = ? AND name_lower = ? AND id != ?",
            (kind, new_lower, tag_id),
        ).fetchone()

        if collision:
            target_id = collision["id"]
            # Merge into existing target tag
            _rename_tag_in_notes(cursor, kind, old_lower, collision["name"])
            if kind == "mistake" and category is not None:
                cursor.execute("UPDATE review_tags SET category = ? WHERE id = ?", (next_cat, target_id))
            cursor.execute("DELETE FROM review_tags WHERE id = ?", (tag_id,))
            conn.commit()
            row = cursor.execute(
                "SELECT id, kind, name, category, is_default, created_at FROM review_tags WHERE id = ?",
                (target_id,),
            ).fetchone()
        else:
            cursor.execute(
                "UPDATE review_tags SET name = ?, name_lower = ?, category = ? WHERE id = ?",
                (clean_name, new_lower, next_cat, tag_id),
            )
            if old_name != clean_name:
                _rename_tag_in_notes(cursor, kind, old_lower, clean_name)
            conn.commit()
            row = cursor.execute(
                "SELECT id, kind, name, category, is_default, created_at FROM review_tags WHERE id = ?",
                (tag_id,),
            ).fetchone()

        item = dict(row)
        item["is_default"] = bool(item["is_default"])
        counts = _compute_tag_usage_counts(cursor)
        item["usage_count"] = counts.get((item["kind"], item["name"].strip().lower()), 0)
        return item
    finally:
        conn.close()


def delete_review_tag(tag_id: int) -> Dict[str, Any]:
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        current = cursor.execute(
            "SELECT id, kind, name, name_lower FROM review_tags WHERE id = ?",
            (tag_id,),
        ).fetchone()
        if not current:
            raise ValueError("Tag not found")

        kind = current["kind"]
        name_lower = current["name_lower"]
        affected = 0

        if kind in ("setup", "exit"):
            col = "setup_tag" if kind == "setup" else "exit_tag"
            rows = cursor.execute(f"SELECT ticket, {col} FROM trade_notes WHERE {col} != ''").fetchall()
            for r in rows:
                if (r[col] or "").strip().lower() == name_lower:
                    cursor.execute(f"UPDATE trade_notes SET {col} = '' WHERE ticket = ?", (r["ticket"],))
                    affected += 1
        elif kind == "mistake":
            rows = cursor.execute("SELECT ticket, mistake_tag FROM trade_notes WHERE mistake_tag != ''").fetchall()
            for r in rows:
                tags = _parse_tag_list(r["mistake_tag"])
                filtered = [t for t in tags if t.lower() != name_lower]
                if len(filtered) != len(tags):
                    cursor.execute(
                        "UPDATE trade_notes SET mistake_tag = ? WHERE ticket = ?",
                        (", ".join(filtered), r["ticket"]),
                    )
                    affected += 1

        cursor.execute("DELETE FROM review_tags WHERE id = ?", (tag_id,))
        conn.commit()
        return {"deleted": True, "id": tag_id, "affected_trades": affected}
    finally:
        conn.close()


def get_deal_by_ticket(ticket: int) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM deals WHERE ticket = ?", (ticket,))
        row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_trade_candles(ticket: int) -> Dict[str, List[Dict[str, Any]]]:
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT timeframe, candles_json FROM trade_candles WHERE ticket = ?", (ticket,))
        result: Dict[str, List[Dict[str, Any]]] = {}
        for row in cursor.fetchall():
            try:
                result[row["timeframe"]] = json.loads(row["candles_json"])
            except json.JSONDecodeError:
                result[row["timeframe"]] = []
        return result
    finally:
        conn.close()


def upsert_trade_candles(ticket: int, timeframe: str, candles: List[Dict[str, Any]], cached_at: int = 0):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO trade_candles (ticket, timeframe, candles_json, cached_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(ticket, timeframe) DO UPDATE SET
            candles_json = excluded.candles_json,
            cached_at = excluded.cached_at
        """, (ticket, timeframe, json.dumps(candles), cached_at))
        conn.commit()
    finally:
        conn.close()
