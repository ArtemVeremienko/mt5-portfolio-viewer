# MetaTrader 5 Portfolio Viewer (Myfxbook Analog + Van Tharp R-Multiple Analytics)

A high-performance portfolio tracking and quantitative analytics web application designed for MetaTrader 5. Provides a full **Myfxbook-style** dashboard, alongside Dr. Van Tharp's **R-Multiple** and **System Quality Number (SQN)** analytics.

Built with **FastAPI** (Python 3.14) on the backend and **Solid.js** (Zero Virtual DOM) on the frontend for instantaneous reactivity and rendering performance.

---

## 🌟 Key Features

### 1. Authentic Myfxbook Experience
- **Sidebar Metrics**: Real-time Gain %, Absolute Gain %, Daily Return %, Monthly Return %, and Peak Drawdown %.
- **Financial Balances**: Balance, Live Equity, Highest Balance, Realized Profit, Swap / Rollover, Deposits, and Withdrawals.
- **Account Badges**: Broker name, Account #, Currency, Leverage, and Account Type (Live / Demo).
- **Monthly Return Heatmap Matrix**: Year-by-year and month-by-month (Jan–Dec) returns grid with color-coded profit/loss badges and YTD calculations.
- **Trading Edge & Risk**: Win Rate %, Profit Factor, Sharpe Ratio, Expectancy per trade, Longs Won vs Shorts Won, Best and Worst trade.

### 2. Dr. Van Tharp R-Multiple & SQN Analytics
- **Metric Mode Switcher**: Seamlessly toggle the entire dashboard between:
  - **Profit ($)**: Absolute currency returns.
  - **Gain (%)**: Percentage growth curves and returns.
  - **Van Tharp (R)**: Performance normalized by initial dollar risk ($1R$).
- **System Quality Number (SQN)**:
  $$\text{SQN} = \frac{\bar{R}}{\sigma_R} \times \sqrt{N}$$
  Includes automatic benchmark grading: *Poor (<1.6)*, *Average (1.6–1.9)*, *Good (2.0–2.4)*, *Very Good (2.5–2.9)*, *Excellent (3.0–5.0)*, and *Superb (5.0+)*.
- **R-Multiple Distribution Histogram**: Visual distribution of trade outcomes into asymmetric risk buckets ($<-2R$, $[-2R, -1R]$, $[-1R, 0R]$, $[0R, 1R]$, $[1R, 2R]$, $[2R, 5R]$, $>5R$).
- **Van Tharp R-Curve**: Cumulative growth measured purely in R units earned over time.

### 3. Real-Time MT5 Sync & Offline SQLite Cache
- **Direct MT5 Integration**: Connects directly via Python `MetaTrader5` package to local running MT5 terminals.
- **SQLite Persistence**: Stores all historical deals, orders, and equity snapshots locally in `data/portfolio.db`.
- **Live WebSocket Stream**: Streams equity, balance, and open position changes every second.
- **Instant "Sync Now" Button**: Triggers immediate synchronization and metric recalculation.
- **Multi-Account Selector**: Switch between saved portfolios with a single click.
- **Zero Virtual DOM**: Solid.js updates DOM elements directly with fine-grained reactivity.

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+ (Python 3.14 supported)
- Node.js 18+ (for building frontend)
- MetaTrader 5 Terminal (optional for live feed; automatically provides demo data if MT5 terminal is closed)

### Run with One Click
Double click:
```cmd
start.bat
```
Or run in terminal:
```bash
python run.py
```

The unified server will start on **`http://localhost:8000`** and open your default browser automatically.

---

## 💻 Development Mode

If you wish to edit the frontend with instant hot-module replacement (HMR):

1. **Start FastAPI Backend**:
   ```bash
   uvicorn backend.main:app --port 8000 --reload
   ```

2. **Start Solid.js Vite Dev Server**:
   ```bash
   cd frontend
   npm run dev
   ```
   Open `http://localhost:5173`. Requests to `/api` and `/ws` will automatically proxy to the backend on port 8000.

---

## 🧪 Testing

Run automated tests:
```bash
python -m pytest backend/tests
```

All calculations (1R risk model, SQN formula, Drawdown, SQLite persistence) are verified against unit tests.
