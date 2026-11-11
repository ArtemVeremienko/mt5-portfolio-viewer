# Frontend Architecture Specification

## 1. Overview
The frontend is a single-page application built with **Solid.js** (Zero Virtual DOM) and **Tailwind CSS**. It provides instantaneous updates with fine-grained reactivity, consuming the FastAPI backend via REST and WebSockets.

---

## 2. Directory Structure

```
frontend/src/
├── App.tsx                     # Top-level state coordinator, WebSocket subscriber, and layout
├── types.ts                   # TypeScript interfaces (PortfolioStats, CurvePoint, ExcursionTrade, etc.)
├── index.css                  # Tailwind utility imports and custom scrollbar styles
├── index.tsx                  # Solid.js mount entry point
└── components/
    ├── Header.tsx             # Account picker, Metric Mode switch, Global Trade Scope, Sync button
    ├── SidebarStats.tsx       # Authentic Myfxbook financial metrics and trading edge cards
    ├── PerformanceChart.tsx   # Lightweight Charts v5 multi-curve canvas with split scaling & bottom legend
    ├── MonthlyMatrix.tsx      # Monthly return heatmap matrix (Jan-Dec + YTD)
    ├── VanTharpPanel.tsx      # Dr. Van Tharp SQN card, sample progress indicator, R-Distribution
    ├── ExcursionPanel.tsx     # MAE/MFE scatter plots, Trade Quality Matrix, Excursions Table
    └── TradingActivity.tsx    # Closed trades list and open positions monitor
```

---

## 3. Key Component Implementations

### 3.1 Header (`components/Header.tsx`)
- **Metric Mode Switcher**: Toggles between `Currency ($)`, `Growth (%)`, and `Van Tharp (R)`.
- **Global Trade Scope Filter**: Toggles between `All Trades (N)` and `Last 100 (100)`. Modifies the query parameter `?scope=all|last100` passed to `/api/portfolio`.
- **Manual Sync**: Dispatches POST to `/api/sync` and refreshes dashboard state.

### 3.2 Performance Chart (`components/PerformanceChart.tsx`)
Built on **TradingView Lightweight Charts v5**:
- **Multi-Series Views**:
  - `Growth (%)`: Growth Area (`#10b981`) + Equity Growth Line (`#f59e0b`) + Change Bars (%).
  - `Balance & Equity`: Balance Line (`#3b82f6`) + Equity Line (`#f59e0b`) + Trade Profit Bars ($).
  - `Profit ($)`: Cumulative Profit Area + Return Bars.
  - `Van Tharp R-Curve`: Cumulative R Area (`#a855f7`) + Trade R Bars.
  - `Drawdown (%)`: Inverted Red Area (`#ef4444`).
- **Split Canvas Scaling**:
  - Upper Region (Top 68%): Dedicated to `rightPriceScale` for curves with auto-zoom bounds ($22.80 to $25.00), preventing flat horizontal lines.
  - Lower Region (Bottom 28%): Dedicated to `leftPriceScale` (`priceScaleId: 'left'`, borderless) for prominent trade change bars with independent zero baseline.
- **Interactive Legend Toggles**: Bottom pills allow users to toggle each individual series on or off dynamically.
- **Tab Switching Guard**: `createEffect` guards against state override using a `lastMode` tracker, ensuring tab clicks remain active until user explicitly toggles the global header switcher.

### 3.3 Van Tharp Panel (`components/VanTharpPanel.tsx`)
- **SQN Badge**: Dynamic color grading from red (*Poor*) to purple (*Superb*).
- **Developing Sample Indicator**: Displays an amber warning banner and progress bar when closed trades $N < 30$, reminding the trader that Van Tharp statistical reliability begins at 30 trades and benchmarks at 100 trades.
- **R-Distribution Histogram**: Categorizes trades into 7 asymmetric risk buckets ($<-2R$ to $>5R$).

### 3.4 Excursion Panel (`components/ExcursionPanel.tsx`)
- **Chart 1 (MAE vs Return)**: Evaluates stop-loss effectiveness with 90% SL cutoff reference line.
- **Chart 2 (MFE vs Return)**: Evaluates profit capture efficiency with 50% capture benchmark line.
- **Chart 3 (Trade Quality Matrix - MFE vs MAE)**:
  - SVG quadrant map with dynamic median dividers.
  - Independent X and Y auto-scaling (+15% padding) for optimal spread.
  - 1:1 diagonal line ($y = x$) with non-colliding ratio badge.
  - Hover tooltips with short date/time (`MM/DD HH:mm`) and ticket numbers.
- **Summary Table**:
  - Full local date/time (`YYYY-MM-DD HH:mm:ss`) with `#ticket` subtext.
  - Intra-trade ratio ($\frac{\text{MFE}}{\text{MAE}}$) and MFE capture percentage.

---

## 4. State Management & Reactivity

- Zero Virtual DOM: Signals (`createSignal`) and memos (`createMemo`) manage state.
- WebSocket stream updates live equity and balance signals directly without triggering re-render of unrelated dashboard sections.
- Metric mode transitions update formatting across all cards without reloading chart canvases.
