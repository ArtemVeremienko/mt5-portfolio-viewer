# AI Agent Guidelines & Engineering Handbook (AGENTS.md)

Welcome to the **MetaTrader 5 Portfolio Viewer** codebase. This document serves as the operational handbook for AI agents working on this project.

---

## 1. System Overview & Technology Stack

- **Backend**: Python 3.14 + **FastAPI** (`backend/main.py`)
- **Data Persistence**: **SQLite** (`data/portfolio.db`, managed via `backend/database.py`)
- **Trading Engine**: Official `MetaTrader5` Python package (`backend/mt5_service.py`)
- **Quantitative Engine**: Pure Python mathematical analytics (`backend/analytics.py`)
- **Frontend**: **Solid.js** (Zero Virtual DOM) + **TypeScript** + **Tailwind CSS** (`frontend/`)
- **Charting**: **TradingView Lightweight Charts v5** (`lightweight-charts`)

---

## 2. Essential Commands

### Running the Application
- **Unified Production/Local Server**:
  ```powershell
  python run.py
  ```
  Launches FastAPI on `http://127.0.0.1:8000` (serving static Solid.js build from `frontend/dist`).

- **Frontend Development Server (HMR)**:
  ```powershell
  cd frontend
  npm run dev
  ```
  Runs Vite dev server on `http://localhost:5173` (proxies `/api` and `/ws` to port 8000).

- **Frontend Production Build**:
  ```powershell
  cd frontend
  npm run build
  ```
  Validates TypeScript compilation and builds to `frontend/dist`. Always run before committing frontend changes.

### Automated Testing
- **Run Backend Tests**:
  ```powershell
  python -m pytest backend/tests
  ```
  All analytical math (SQN, 1R modeling, Drawdown) and database operations are verified here.

---

## 3. Core Architectural Invariants

### 3.1 Solid.js Fine-Grained Reactivity (Zero Virtual DOM)
- **No Virtual DOM**: Solid.js does not use a Virtual DOM or re-execute component functions on state changes. Components run **once** as setup functions.
- **Signal Tracking**: When writing `createEffect`, remember that **any signal read inside the effect becomes a reactive dependency**.
  - *Pitfall*: Do NOT read signals you don't intend to subscribe to. If you want to react strictly to a prop change, use `untrack()` or guard with a `lastValue` reference (see `PerformanceChart.tsx`).
- **Control Flow**: Use `<Show>`, `<For>`, and `<Switch>`/`<Match>` rather than raw ternary operators in JSX templates.

### 3.2 Lightweight Charts v5 Multi-Series & Split Scaling
- **Independent Price Scales**: When rendering lines (e.g., Balance ~$25) alongside trade change bars (e.g., Profit ~$0.20), **never share a single price scale**.
  - Assign curves to `priceScaleId: 'right'` with `scaleMargins: { top: 0.08, bottom: 0.32 }`.
  - Assign change bars to `priceScaleId: 'left'` with `scaleMargins: { top: 0.72, bottom: 0.02 }` and `visible: false`.
  - This ensures lines have dynamic vertical contours and bars stand out prominently without squashing each other.

### 3.3 MT5 Domain Invariants
- **Position SL/TP**: Closing deals (`entry = 1`) carry `sl = 0.0` and `tp = 0.0`. Retrieve true SL/TP by querying `mt5.history_orders_get(position=position_id)`.
- **Deal Direction**: For closed BUY positions, exit deals have `type = DEAL_TYPE_SELL (1)`. Always extract position direction from the opening deal (`d_in.type`).
- **Profit & Excursions**: Never multiply price differences by arbitrary constants (e.g. `100.0` or `1.0`). Always calculate dollar amounts using `mt5.order_calc_profit()`.
- **Van Tharp SQN Formula**: Clamped by $\min(10.0, \sqrt{N})$ to avoid sheer volume distortion for $N > 100$. For $N < 30$, show the developing sample size notice.

---

## 4. Development & Workflow Guidelines

1. **Verify Before Declaring Complete**:
   - Always run `npm run build` after editing frontend files.
   - Always run `python -m pytest backend/tests` after editing backend analytics.
   - Use browser subagents to visually verify UI changes on `http://localhost:8000`.
2. **File References**:
   - Provide clickable file links using forward slashes with relative or workspace paths: `[file.ts](./frontend/src/file.ts)`.
3. **No Shell Sleep**:
   - Never use `sleep` or polling loops in shell commands. Rely on event callbacks and subagent reactive messages.
4. **Preserve Documentation**:
   - Maintain existing docstrings and comments. Update relevant files in `specs/` when introducing architectural changes.
