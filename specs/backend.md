# Backend Architecture & Analytics Specification

## 1. Overview
The backend is implemented with **FastAPI** (Python 3.14). It orchestrates:
1. Local MT5 terminal communication via `MetaTrader5` API.
2. Historical deal extraction, order correlation, and tick-level excursion scanning.
3. Offline SQLite persistence.
4. Quantitative analytics engine (Myfxbook metrics, Dr. Van Tharp R-Multiples, SQN, MAE/MFE statistics).
5. REST API endpoints and live WebSocket broadcasting.

---

## 2. Component Structure

```
backend/
├── main.py          # FastAPI application, route definitions, WebSocket live loop
├── database.py      # SQLite connection, schema definition, and persistence helpers
├── mt5_service.py   # MetaTrader 5 interface, order correlation, tick-based MAE/MFE
├── analytics.py     # Mathematical engine (Myfxbook stats, Van Tharp SQN, Excursions)
└── tests/           # Pytest automated test suite
```

---

## 3. Data Model & SQLite Schema

Stored locally in `data/portfolio.db`:

### `accounts` Table
- `account_id` (PRIMARY KEY): MT5 account login number.
- `broker`, `currency`, `leverage`, `is_demo`.
- `balance`, `equity`, `last_sync`.

### `deals` Table
Stores closed trade deals (`entry = DEAL_ENTRY_OUT`):
- `ticket` (PRIMARY KEY): Closing deal ticket.
- `order_id`: Originating order ID.
- `account_id`: Associated account.
- `time`, `time_msc`: Timestamp in seconds and milliseconds.
- `type`: Deal type (`0` for Buy, `1` for Sell).
- `symbol`, `volume`, `price`, `profit`, `swap`, `commission`.
- `sl`, `tp`: True position Stop Loss and Take Profit (extracted from opening orders).
- `open_time`, `open_price`: Position entry time and price.
- `comment`: Order comment / execution notes.
- `risk_r`: Calculated 1R dollar risk baseline.
- `r_multiple`: Trade return expressed in R units ($\frac{\text{net\_profit}}{\text{risk\_r}}$).
- `mae_price`, `mfe_price`: Extreme tick prices during trade lifespan.
- `mae_pips`, `mfe_pips`: Adverse/favorable distances in instrument pips.
- `mae_amount`, `mfe_amount`: Adverse/favorable excursions in account currency ($).
- `mae_r`, `mfe_r`: Adverse/favorable excursions in R-multiples.

---

## 4. MT5 Service & Deal Parsing (`backend/mt5_service.py`)

### 4.1 Order Correlation for Position SL / TP
In MT5, closing deals do not store the original trade's Stop Loss or Take Profit (`sl = 0.0, tp = 0.0`). The true position SL/TP is resolved by:
1. Querying `mt5.history_orders_get(position=d.position_id)`.
2. Inspecting the opening order (`ORDER_ENTRY_IN`) for `order.sl` and `order.tp`.
3. Falling back to regex parsing of closing deal comments (e.g., `[sl 26530.2]` or `[tp 26544.8]`).

### 4.2 Deal Direction Resolution
When closing a BUY position, the exit deal has `type = DEAL_TYPE_SELL (1)`. The service resolves trade direction by matching the position's opening deal (`d_in.type`).

### 4.3 Tick-Level MAE / MFE Excursion Computation
For each closed trade, `_calculate_trade_excursion`:
1. Requests M1 bars or tick data between `open_time` and `close_time` for `symbol`.
2. Scans lowest and highest price extremes.
3. Calculates MAE and MFE price distances based on position direction:
   - **BUY**: $\text{MAE} = \text{open\_price} - \text{min\_price}$, $\text{MFE} = \text{max\_price} - \text{open\_price}$
   - **SELL**: $\text{MAE} = \text{max\_price} - \text{open\_price}$, $\text{MFE} = \text{open\_price} - \text{min\_price}$
4. Converts price distances to currency amounts via `mt5.order_calc_profit` to guarantee accuracy across Forex, Index CFDs, and Commodities.

---

## 5. Analytics Engine (`backend/analytics.py`)

### 5.1 1R Risk Modeling
- If a valid Stop Loss was set:
  $$\text{1R Risk} = \text{order\_calc\_profit}(\text{direction}, \text{symbol}, \text{volume}, \text{open\_price}, \text{sl})$$
- If no Stop Loss was set:
  - Estimate from instrument's 20-period ATR or pip value.
  - Micro-account safeguard: Minimum floor of `$0.10` (scaled to prevent uncalibrated `$10.00` defaults on small balance accounts).

### 5.2 Van Tharp SQN (System Quality Number)
$$\text{SQN} = \frac{\bar{R}}{\sigma_R} \times \min(10.0, \sqrt{N})$$
- **$\bar{R}$**: Average R-Multiple of closed trades.
- **$\sigma_R$**: Sample standard deviation of R-Multiples.
- **$\sqrt{N}$ Clamping**: Clamped to $\min(10.0, \sqrt{N})$ to avoid sheer volume inflation beyond 100 trades.
- **Sample Size Metadata**:
  - `is_sample_developing`: `True` when $N < 30$.
  - `min_sample_target`: 30 trades (minimum statistical significance).
  - `benchmark_target`: 100 trades (full Van Tharp benchmark baseline).

### 5.3 Global Trade Scope Filtering
All analytics endpoints support `scope: Optional[str] = Query("all")`:
- `"all"`: Lifetime portfolio statistics.
- `"last100"`: Slices the most recent 100 closed trades to analyze the active market regime.

### 5.4 Performance Curves Data Contract (`CurvePoint`)
Each point along the cumulative performance curve includes:
- `timestamp`: Unix epoch seconds.
- `balance`, `equity`, `profit`, `growth_pct`, `drawdown_pct`, `cumulative_r`.
- `change_pct`: Percentage gain/loss of this specific trade relative to balance prior to trade.
- `change_amount`: Dollar profit/loss of this specific trade.
- `change_r`: Trade R-Multiple.

---

## 6. REST & WebSocket Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/portfolio?account_id=...&scope=all` | GET | Comprehensive portfolio statistics, curves, heatmap, excursions, and closed trades |
| `/api/accounts` | GET | List of all registered accounts in SQLite |
| `/api/sync?account_id=...` | POST | Triggers manual MT5 synchronization and database update |
| `/ws/live` | WebSocket | 1Hz streaming updates for live equity, balance, and open trade counts |
