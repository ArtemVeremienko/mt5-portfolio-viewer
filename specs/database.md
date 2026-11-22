# Database Architecture, Schemas & Engine Selection (`specs/database.md`)

## 1. Overview & Runtime Policy

All persistence lives in a single embedded **SQLite** database at `data/portfolio.db`, managed exclusively through `SqliteUnitOfWork` and Repositories (`backend/infrastructure/db/`).

- **Connection Pragmas** (`backend/infrastructure/db/connection.py`):
  - `PRAGMA journal_mode=WAL;` — allows concurrent HTTP reads alongside background 60s snapshot writes without reader/writer blocking.
  - `PRAGMA synchronous=NORMAL;` — safe durability in WAL mode with minimal fsync overhead.
  - `PRAGMA foreign_keys=ON;` — enforces relational integrity and `ON DELETE CASCADE` on `trade_note_tags`.
  - `PRAGMA busy_timeout=5000;` — 5-second lock wait preventing transient `database is locked` errors.
  - `row_factory = sqlite3.Row` — dict-like column access.
- **Transaction Boundary**: Every `with SqliteUnitOfWork(db_path) as uow:` opens a connection, commits on clean exit, rolls back on exception, and always closes the handle.
- **Schema Versioning**: Tracked via `PRAGMA user_version` (currently **`5`**) in `backend/infrastructure/db/migrations.py`.

---

## 2. Entity-Relationship Diagram

```mermaid
erDiagram
    accounts ||--o{ deals : "login -> account_id"
    accounts ||--o{ equity_snapshots : "login -> account_id"
    trade_notes ||--o{ trade_note_tags : "ticket -> ticket (CASCADE)"
    review_tags ||--o{ trade_note_tags : "id -> tag_id (CASCADE)"
    deals ||--o{ trade_candles : "(ticket)"

    accounts {
        INTEGER login PK
        TEXT broker
        TEXT name
        TEXT server
        TEXT currency
        INTEGER leverage
        REAL balance
        REAL equity
        REAL margin
        REAL free_margin
        REAL margin_level
        INTEGER is_demo
        INTEGER last_synced_at
    }

    deals {
        INTEGER account_id PK_FK
        INTEGER ticket PK
        INTEGER order_id
        INTEGER time
        INTEGER time_msc
        INTEGER type
        INTEGER entry
        TEXT symbol
        REAL volume
        REAL price
        REAL profit
        REAL swap
        REAL commission
        REAL sl
        REAL tp
        INTEGER open_time
        REAL open_price
        TEXT comment
        INTEGER magic
        REAL risk_r
        REAL r_multiple
        REAL mae_price
        REAL mfe_price
        REAL mae_pips
        REAL mfe_pips
        REAL mae_amount
        REAL mfe_amount
        REAL mae_r
        REAL mfe_r
    }

    equity_snapshots {
        INTEGER id PK
        INTEGER account_id FK
        INTEGER timestamp
        REAL balance
        REAL equity
        REAL growth_pct
        REAL drawdown_pct
        REAL cumulative_r
    }

    trade_notes {
        INTEGER ticket PK
        INTEGER account_id
        TEXT note
        TEXT setup_tag
        TEXT mistake_tag
        TEXT exit_tag
        TEXT entry_grade
        TEXT execution_grade
        TEXT management_grade
        INTEGER updated_at
    }

    review_tags {
        INTEGER id PK
        TEXT kind
        TEXT name
        TEXT name_lower
        TEXT category
        INTEGER is_default
        INTEGER created_at
    }

    trade_note_tags {
        INTEGER ticket PK_FK
        INTEGER tag_id PK_FK
    }

    trade_candles {
        INTEGER ticket PK
        TEXT timeframe PK
        TEXT candles_json
        BLOB candles_blob
        INTEGER cached_at
    }

    symbol_candles {
        TEXT symbol PK
        TEXT timeframe PK
        INTEGER from_ts
        INTEGER to_ts
        BLOB candles_blob
        INTEGER cached_at
    }
```

---

## 3. Table Schemas & Indexes

| Table | Primary Key | Foreign Keys | Indexes | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **`accounts`** | `login` | — | PK | Synced MT5 account metadata and latest balance/equity/margin. |
| **`deals`** | `(account_id, ticket)` | `account_id -> accounts(login)` | `idx_deals_acc_time(account_id, time)`<br>`idx_deals_acc_entry_time(account_id, entry, time)`<br>`idx_deals_symbol(account_id, symbol)`<br>`idx_deals_ticket(ticket)` | Closed trades, balance cashflows, 1R risk, and MAE/MFE excursions. Account-scoped PK prevents multi-broker ticket collisions. |
| **`equity_snapshots`** | `id` (auto) | `account_id -> accounts(login)` | `idx_snapshots_acc_time(account_id, timestamp)` | Periodic 60s account snapshots with 30-day rolling retention pruning. |
| **`trade_notes`** | `ticket` | — | `idx_notes_acc(account_id)` | Freeform journal notes, execution grades (`A`/`B`/`C`/`D`/`F`), and synchronized tag text projections. |
| **`review_tags`** | `id` (auto) | — | `UNIQUE(kind, name_lower)`<br>`idx_review_tags_kind(kind)` | Tag library across `setup`, `exit`, and `mistake` (`entry` / `exit_mgmt` categories). |
| **`trade_note_tags`** | `(ticket, tag_id)` | `ticket -> trade_notes(ticket) ON DELETE CASCADE`<br>`tag_id -> review_tags(id) ON DELETE CASCADE` | `idx_trade_note_tags_tag(tag_id)` | Normalized M:N join table for `setup`, `exit`, and `mistake` tags enabling indexed usage counts, merges, and cascading deletes. |
| **`trade_candles`** | `(ticket, timeframe)` | — | `idx_trade_candles_cached_at(cached_at)` | Cache-aside OHLC bars (`h1`, `m5`, `m1`) stored zlib-compressed in `candles_blob` (with legacy `candles_json` read fallback) and TTL eviction. |
| **`symbol_candles`** | `(symbol, timeframe)` | — | PK | Broad historical OHLC range cache (`from_ts`..`to_ts`) stored zlib-compressed in `candles_blob` for `random_session` benchmarking, managed via `SymbolCandleRepository`. |

---

## 4. Migration History (`PRAGMA user_version`)

- **`v1`**: Initial DDL for `accounts`, `deals`, `equity_snapshots`, `trade_notes`, `trade_candles`, `review_tags` + legacy `ALTER TABLE` column backfills.
- **`v2`**: Performance indexes (`idx_deals_acc_time`, `idx_deals_acc_entry_time`, `idx_deals_symbol`, `idx_snapshots_acc_time`, `idx_notes_acc`, `idx_review_tags_kind`).
- **`v3`**: Created `trade_note_tags` join table (`ON DELETE CASCADE`), seeded default `exit` and `mistake` presets, and backfilled legacy `trade_notes` tags.
- **`v4`**: Rebuilt `deals` with composite `PRIMARY KEY (account_id, ticket)` + `idx_deals_ticket`, normalized `setup` and `exit` tags into `trade_note_tags`, added `candles_blob BLOB` and `idx_trade_candles_cached_at` on `trade_candles`.
- **`v5`**: Created `symbol_candles` table (`PRIMARY KEY (symbol, timeframe)`) for broad historical OHLC range caching.

---

## 5. Why SQLite Was Chosen & Engine Comparison

### 5.1 Application Workload Profile
- **Deployment**: Single-user local Windows desktop app (`python run.py` on `127.0.0.1:8000`) communicating via local IPC (`MetaTrader5` SDK) with a locally running MT5 terminal.
- **Concurrency**: The 1Hz WebSocket broadcaster polls MT5 in memory (`asyncio.to_thread`), while SQLite writes occur only once every **60 seconds** (`~0.017 writes/sec`) plus occasional user journal/tag edits.
- **Analytics**: `backend/services/analytics/` loads account deals into memory and runs pure Python + NumPy math (TWR, SQN, Sharpe/Sortino, MAE/MFE, R-multiples).

### 5.2 SQLite vs. PostgreSQL vs. MongoDB

| Dimension | SQLite (Current, WAL) | PostgreSQL | MongoDB |
| :--- | :--- | :--- | :--- |
| **Local Desktop Fit** | **Optimal** — zero-config single file alongside local MT5 IPC; no external daemon/service to install or manage. | **Poor** — requires installing and managing a Postgres server on the trader's Windows machine. | **Poor** — requires installing and managing `mongod`. |
| **Concurrency** | **More than sufficient** — WAL allows concurrent HTTP reads alongside 1-row/min writes. | Overkill for single-user local traffic; adds TCP serialization overhead. | Overkill; document locking offers no benefit. |
| **Data Model Fit** | **Strong** — relational FKs (`accounts -> deals`, `trade_note_tags`) + compressed `BLOB` cache (`trade_candles`). | **Strong** — `JSONB` & expression indexes, unnecessary operational weight here. | **Weak** — M:N `review_tags` + tag rename/merge/delete cascades are inherently relational. |
| **Analytics Speed** | **Fastest** — zero network hop; `sqlite3` C-extension loads rows into Python/NumPy in `< 1–5 ms`. | Slower for full-history reads due to TCP wire-protocol overhead. | Slower due to BSON-to-dict deserialization and network hop. |

### 5.3 When Would Migrating to PostgreSQL Make Sense?
Migrating away from SQLite is **not recommended** for the current local single-user architecture. Revisit **PostgreSQL (+ TimescaleDB)** only if the project pivots to:
1. **Multi-user / Cloud SaaS hosting** (concurrent multi-tenant writers, centralized auth, horizontal API workers).
2. **High-frequency tick / OHLC time-series storage** (millions of raw tick rows requiring hypertables, continuous aggregates, and server-side window queries).
