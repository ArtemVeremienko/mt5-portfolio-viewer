# Backend Architecture & Analytics Specification

## 1. Overview
The backend is implemented with **FastAPI** (Python 3.14) using a Clean / Hexagonal-Lite layered architecture. It orchestrates:
1. Local MT5 terminal communication via `MetaTrader5` API behind a `TradingGateway` Anti-Corruption Layer.
2. Historical deal extraction, order correlation, and tick-level excursion scanning.
3. Offline SQLite persistence via `SqliteUnitOfWork` and Repositories (`WAL` mode, `PRAGMA user_version` migrations).
4. Modular quantitative analytics engine (`backend/services/analytics/`).
5. Thin REST API routers and non-blocking 1Hz WebSocket broadcasting (`asyncio.to_thread`).

---

## 2. Component Structure

```text
backend/
├── app.py                   # FastAPI factory, lifespan, CORS, SPA static mount
├── main.py                  # Entrypoint re-exporting app = create_app()
├── config.py                # pydantic-settings Settings
├── database.py              # Backward-compatible facade over SqliteUnitOfWork
├── mt5_service.py           # Facade combining LiveMT5Gateway + SimulatedMT5Gateway
├── analytics.py             # Facade re-exporting services/analytics/pipeline
├── api/
│   ├── deps.py              # FastAPI Depends() providers (settings, db_path, gateway)
│   ├── schemas.py           # Pydantic v2 request/response models
│   └── routes/              # Thin APIRouters: accounts, portfolio, trades, tags, ws
├── domain/
│   ├── models.py            # IntEnum/StrEnum (DealType, DealEntry, TagKind), TypedDicts
│   ├── protocols.py         # TradingGateway Protocol
│   ├── risk.py              # Single source of truth for 1R risk modeling
│   └── pips.py              # Single source of truth for pip sizing & trade pips
├── services/
│   ├── sync_service.py      # MT5 -> SQLite sync & combined-account builder
│   ├── candle_service.py    # Cache-aside MTF candle retrieval
│   ├── live_broadcaster.py  # ConnectionManager & non-blocking 1Hz WS broadcaster
│   └── analytics/           # Decomposed pipeline: filters, curves, tharp, statistics, breakdowns, excursions, pipeline
├── infrastructure/
│   ├── db/                  # connection.py (WAL/FK/busy_timeout), migrations.py (PRAGMA user_version), uow.py, repositories.py
│   └── mt5/                 # gateway.py (LiveMT5Gateway) & simulator.py (SimulatedMT5Gateway)
└── tests/                   # Pytest + Hypothesis suite (isolated via conftest.py tmp_path)
```

---

## 3. Data Model & SQLite Schema

> Full ER diagram, table/index breakdown, migration history (`v1`–`v4`), and SQLite vs. PostgreSQL/MongoDB rationale: [specs/database.md](./database.md).

Stored locally in `data/portfolio.db` using `PRAGMA journal_mode=WAL`, `PRAGMA foreign_keys=ON`, `PRAGMA busy_timeout=5000`, and versioned migrations tracked via `PRAGMA user_version` (currently **v4**):

### `accounts` Table
- `login` (PRIMARY KEY): MT5 account login number.
- `broker`, `name`, `server`, `currency`, `leverage`, `is_demo`.
- `balance`, `equity`, `margin`, `free_margin`, `margin_level`, `last_synced_at`.

### `deals` Table
Stores closed trade deals (`entry = DEAL_ENTRY_OUT`) and balance operations (`type = 2`):
- Composite `PRIMARY KEY (account_id, ticket)` (prevents multi-broker ticket collisions), `order_id`, `account_id` (FK -> `accounts.login`).
- `time`, `time_msc`, `type` (`0`=Buy, `1`=Sell, `2`=Balance), `entry`.
- `symbol`, `volume`, `price`, `profit`, `swap`, `commission`, `sl`, `tp`, `open_time`, `open_price`, `comment`, `magic`.
- `risk_r`, `r_multiple`, `mae_price`, `mfe_price`, `mae_pips`, `mfe_pips`, `mae_amount`, `mfe_amount`, `mae_r`, `mfe_r`.
- Indexes: `idx_deals_acc_time`, `idx_deals_acc_entry_time`, `idx_deals_symbol`.

### `equity_snapshots` Table
- `id` (PK), `account_id` (FK -> `accounts.login`), `timestamp`, `balance`, `equity`, `growth_pct`, `drawdown_pct`, `cumulative_r`.

### `trade_notes`, `review_tags` & `trade_note_tags` (Normalized Tagging)
- `trade_notes`: `ticket` (PK), `account_id`, `note`, `setup_tag`, `mistake_tag`, `exit_tag`, `entry_grade`, `execution_grade`, `management_grade`, `updated_at`.
- `review_tags`: `id` (PK), `kind` (`setup` | `exit` | `mistake`), `name`, `name_lower`, `category` (`entry` | `exit_mgmt`), `is_default`, `created_at`.
- `trade_note_tags`: Normalized join table `(ticket, tag_id)` with `ON DELETE CASCADE` to `trade_notes(ticket)` and `review_tags(id)` for fast SQL usage counts, merges, and cascading deletes.

### `trade_candles` Table
- Composite PK `(ticket, timeframe)` caching zlib-compressed `candles_blob` (with legacy `candles_json` fallback), `cached_at` (`idx_trade_candles_cached_at`), and TTL eviction.

---

## 4. MT5 Anti-Corruption Layer (`backend/infrastructure/mt5/`)

### 4.1 Order Correlation for Position SL / TP
In MT5, closing deals do not store the original trade's Stop Loss or Take Profit (`sl = 0.0, tp = 0.0`). `LiveMT5Gateway` resolves true position SL/TP by:
1. Querying `mt5.history_orders_get(position=d.position_id)`.
2. Inspecting the opening order for `order.sl` and `order.tp`.
3. Falling back to regex parsing of closing deal comments (`[sl ...]`, `[tp ...]`).

### 4.2 Deal Direction Resolution
When closing a BUY position, the exit deal has `type = DEAL_TYPE_SELL (1)`. `LiveMT5Gateway` resolves trade direction from the opening deal (`d_in.type`).

### 4.3 Tick-Level MAE / MFE Excursion Computation
`LiveMT5Gateway.calculate_deal_excursions`:
1. Requests M1 rates between `open_time` and `close_time` for `symbol`.
2. Scans lowest and highest price extremes.
3. Calculates MAE/MFE price distances based on position direction and converts to currency amounts via `mt5.order_calc_profit` (with fallback heuristics when offline).

### 4.4 Deterministic Simulation Parity
`SimulatedMT5Gateway` uses a local `random.Random(seed)` instance (never mutating global `random.seed`) and returns identical deal schemas (including `magic`).

---

## 5. Analytics Engine (`backend/services/analytics/`)

### 5.1 1R Risk Modeling (`backend/domain/risk.py`)
- **Initial Stop Loss Validation**:
  - **BUY**: $\text{sl} < \text{open\_price}$
  - **SELL**: $\text{sl} > \text{open\_price}$
  - Trailing stops in profit or breakeven stops are **not** treated as initial risk.
- **When a valid initial Stop Loss was set**:
  $$\text{1R Risk} = \text{order\_calc\_profit}(\text{direction}, \text{symbol}, \text{volume}, \text{open\_price}, \text{sl})$$
- **Fallback**: Van Tharp fixed-risk model ($\max(\$0.20, \text{balance} \times \text{default\_risk\_pct})$).

### 5.2 Van Tharp SQN (`backend/services/analytics/tharp.py`)
$$\text{SQN} = \frac{\bar{R}}{\sigma_R} \times \min(10.0, \sqrt{N})$$
- `is_sample_developing`: `True` when $N < 30$.
- `min_sample_target`: 30 trades; `benchmark_target`: 100 trades.

### 5.3 Pipeline Modules (`backend/services/analytics/`)
- `filters.py`: Time window, symbol, direction, comment, magic, and `scope=last100` slicing.
- `curves.py`: TWR equity/balance curves, intra-trade MAE drawdown, and live right-edge floating PnL point.
- `statistics.py`: Sharpe, Sortino, Wald-Wolfowitz Z-score, AHPR/GHPR, Risk of Ruin, and UTC period PnL.
- `breakdowns.py`: Monthly matrix, 4-quadrant monthly analytics, symbol/hourly/DoW/calendar aggregations.
- `excursions.py`: MAE/MFE percentiles (P50/P90) and MFE capture efficiency.
- `pipeline.py`: Composes the full response and guarantees 100% schema parity for empty deals (`empty_analytics_response`).

---

## 6. REST & WebSocket Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/accounts` | GET | List synced accounts, active login, and MT5 connection status |
| `/api/accounts/switch?login=...` | POST | Switch active account login in `app.state` |
| `/api/sync` | POST | Trigger manual MT5 sync into SQLite |
| `/api/portfolio` | GET | Portfolio statistics, curves, heatmaps, excursions, and closed trades (`risk_pct` validated `0 < x <= 1`) |
| `/api/trades/open` | GET | Active open positions from MT5/simulator |
| `/api/trades/note` | POST | Save trade journal note, grades, and normalized tags |
| `/api/trades/{ticket}/candles` | GET | Cache-aside H1/M5/M1 OHLC bars for a trade |
| `/api/tags` | GET / POST | List or create review tags (`setup`, `exit`, `mistake`) |
| `/api/tags/{tag_id}` | PATCH / DELETE | Rename/merge or cascade-delete review tags |
| `/ws/live` | WebSocket | 1Hz streaming updates for live equity, balance, and open positions |
