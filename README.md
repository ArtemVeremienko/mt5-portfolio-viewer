# MetaTrader 5 Portfolio Viewer (Myfxbook Analog + Van Tharp R-Multiple Analytics)

A high-performance portfolio tracking and quantitative analytics web application designed for MetaTrader 5. Provides a full **Myfxbook-style** dashboard, alongside Dr. Van Tharp's **R-Multiple**, **System Quality Number (SQN)**, and **Maximum Adverse / Favorable Excursion (MAE / MFE)** analytics.

Built with **FastAPI** (Python 3.14) on the backend and **Solid.js** (Zero Virtual DOM) on the frontend for instantaneous reactivity and rendering performance.

---

## 🌟 Key Features

### 1. Authentic Myfxbook Experience & Multi-Curve Overlays
- **Interactive Multi-Curve Canvas**: Built on TradingView Lightweight Charts v5 with synchronized multi-series views:
  - **Growth (%)**: Growth Area + Equity Growth Line + Green/Red Per-Trade Change Bars.
  - **Balance & Equity ($)**: Balance Line + Equity Line + Dollar Profit Change Bars.
  - **Profit ($)**: Cumulative Profit Area + Return Bars.
  - **Van Tharp R-Curve**: Cumulative R Area + Trade R-Multiple Bars.
  - **Drawdown (%)**: Inverted Red Peak-to-Valley Area.
- **Split Canvas Scaling**: Curves occupy the upper 68% with dynamic auto-zoom ($22.80 - $25.00), while trade change bars occupy the lower 28% with an independent zero baseline—preventing flat horizontal lines and tiny sliver bars.
- **Interactive Bottom Legend Pills**: Click any pill (`[● Balance]`, `[● Equity]`, `[▮ Profit Change Bars ($)]`) to toggle that specific series dynamically.
- **Sidebar Metrics**: Real-time Gain %, Absolute Gain %, Daily Return %, Monthly Return %, and Peak Drawdown %.
- **Monthly Return Heatmap Matrix**: Calendar matrix showing percentage returns per month (Jan–Dec) and YTD across years.
- **Trading Edge & Risk**: Win Rate %, Profit Factor, Sharpe Ratio, Expectancy per trade, Longs Won vs Shorts Won, Best and Worst trade.

### 2. Dr. Van Tharp R-Multiple & SQN Analytics
- **Metric Mode Switcher**: Seamlessly toggle the entire dashboard between:
  - **Profit ($)**: Absolute currency returns.
  - **Gain (%)**: Percentage growth curves and returns.
  - **Van Tharp (R)**: Performance normalized by initial dollar risk ($1R$).
- **System Quality Number (SQN)**:
  $$\text{SQN} = \frac{\bar{R}}{\sigma_R} \times \min(10.0, \sqrt{N})$$
  Includes automatic benchmark grading: *Poor (<1.6)*, *Average (1.6–1.9)*, *Good (2.0–2.4)*, *Very Good (2.5–2.9)*, *Excellent (3.0–5.0)*, and *Superb (5.0+)*.
- **Sample Size Progress Indicator**: Amber notice for developing samples ($N < 30$ closed trades) with progress towards the Van Tharp 30-trade minimum and 100-trade benchmark.
- **Global Trade Scope Filter**: Switch between **All Trades** and **Last 100 Trades** with a single click in the header to isolate active market regime performance.
- **R-Multiple Distribution Histogram**: Visual distribution of trade outcomes into asymmetric risk buckets ($<-2R$, $[-2R, -1R]$, $[-1R, 0R]$, $[0R, 1R]$, $[1R, 2R]$, $[2R, 5R]$, $>5R$).

### 3. Trade Excursion Analysis Suite (MAE & MFE)
- **Chart 1: MAE vs Realized Return**: Evaluates stop-loss placement with a 90% SL cutoff reference line to detect if stops are too tight or overly wide.
- **Chart 2: MFE vs Realized Return**: Evaluates profit capture efficiency with a 50% benchmark line to detect premature exits.
- **Chart 3: Trade Quality Matrix (MFE vs MAE)**: Dynamic quadrant classification map:
  - *Clean / Sniper*: Low drawdown, high peak profit (optimal entries).
  - *Rollercoaster*: High drawdown, high peak profit (stressful hold).
  - *Scratch / Noise*: Low drawdown, low profit.
  - *Toxic / Bleeders*: Severe drawdown, zero upside.
  - Includes a 1:1 diagonal ratio line ($y = x$) with non-colliding ratio badge.
- **Recent Trade Excursion Summary Table**: Shows full local timestamps (`YYYY-MM-DD HH:mm:ss`), ticket subtext, intra-trade ratio (MFE / MAE), and MFE capture %.

### 4. Direct MT5 Sync & Offline SQLite Cache
- **Direct MT5 Integration**: Connects directly via Python `MetaTrader5` package to local running MT5 terminals.
- **True Position SL/TP Extraction**: Correlates closing deals against `history_orders_get(position=position_id)` to recover original trade stop losses and take profits.
- **Exact CFD & Currency Valuation**: Uses `mt5.order_calc_profit` for exact currency conversions across Forex, Index CFDs (e.g. `.DE40Cash`), and Commodities.
- **Offline SQLite Persistence**: Stores all historical deals, orders, and equity snapshots locally in `data/portfolio.db`.
- **Live WebSocket Stream**: Streams equity, balance, and open position changes every second.

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+ (Python 3.14 supported)
- Node.js 18+ (for building frontend)
- MetaTrader 5 Terminal (optional for live feed; automatically falls back to SQLite cache if MT5 terminal is closed)

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

---

## 📚 Documentation & Specifications

Detailed architectural specifications and engineering guides are available in the repository:
- **[System Overview & Evolution](./specs/overview.md)**: Project genesis, milestones, and design history.
- **[Backend Architecture](./specs/backend.md)**: FastAPI routes, MT5 service, SQLite schema, and analytics engine.
- **[Frontend Architecture](./specs/frontend.md)**: Solid.js components, Lightweight Charts split scaling, and reactivity models.
- **[MT5 Domain Quirks](./specs/mt5-quirks.md)**: Position orders vs closing deals, deal direction inversion, index CFD point valuation, and breakeven trade handling.
- **[AI Agent Handbook (AGENTS.md)](./AGENTS.md)**: Operational guide and best practices for AI agents working in this repository.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
