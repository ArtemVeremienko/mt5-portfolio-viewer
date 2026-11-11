import sqlite3
import os
from typing import List, Dict, Any, Optional

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
    
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_deals_acc_time ON deals(account_id, time)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_acc_time ON equity_snapshots(account_id, timestamp)")
    
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
        normalized_deals.append(deal_copy)

    cursor.executemany("""
    INSERT INTO deals (ticket, order_id, account_id, time, time_msc, type, entry, symbol, volume, price, profit, swap, commission, sl, tp, open_time, open_price, comment, risk_r, r_multiple, mae_price, mfe_price, mae_pips, mfe_pips, mae_amount, mfe_amount, mae_r, mfe_r)
    VALUES (:ticket, :order_id, :account_id, :time, :time_msc, :type, :entry, :symbol, :volume, :price, :profit, :swap, :commission, :sl, :tp, :open_time, :open_price, :comment, :risk_r, :r_multiple, :mae_price, :mfe_price, :mae_pips, :mfe_pips, :mae_amount, :mfe_amount, :mae_r, :mfe_r)
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
