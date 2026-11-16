# AI Agent Guidelines & Engineering Handbook (AGENTS.md)

Welcome to the **MetaTrader 5 Portfolio Viewer** codebase. This document serves as the operational handbook for AI agents working on this project.

> **Scoped Layer Rules**:
> - Backend Python/FastAPI/SQLite rules: [backend/AGENTS.md](./backend/AGENTS.md)
> - Frontend Solid.js/TypeScript/Design-System rules: [frontend/AGENTS.md](./frontend/AGENTS.md)

---

## 1. System Overview & Technology Stack

- **Backend**: Python 3.14 + **FastAPI** (`backend/app.py`, modular routers in `backend/api/routes/`)
- **Data Persistence**: **SQLite** (`data/portfolio.db`) via `SqliteUnitOfWork` & Repositories (`backend/infrastructure/db/`), WAL mode, versioned `PRAGMA user_version` migrations
- **Trading Engine**: `MetaTrader5` SDK isolated behind `TradingGateway` Anti-Corruption Layer (`backend/infrastructure/mt5/`)
- **Quantitative Engine**: Modular pure-Python analytics pipeline (`backend/services/analytics/`)
- **Frontend**: **Solid.js** (Zero Virtual DOM) + **TypeScript (strict)** + **Tailwind CSS v4** + **3-Layer Design Tokens** (`frontend/src/styles/tokens.css`)
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

### Required Pre-Commit Verification Gates
- **Backend** (all 3 must pass):
  ```powershell
  python -m pytest backend/tests
  ruff check backend
  mypy backend
  ```
- **Frontend** (all 4 must pass):
  ```powershell
  cd frontend
  npm test
  npm run typecheck
  npm run lint
  npm run build
  ```

---

## 3. Core Architectural Invariants

### 3.1 Backend Clean / Hexagonal-Lite Boundaries
- **No Global Mutable State**: State lives on `app.state` (`Settings`, `TradingGateway`, `ConnectionManager`, `active_login`) and is injected via FastAPI `Depends()`.
- **Unit of Work & Normalized Tags**: All SQLite access goes through `SqliteUnitOfWork` (`WAL`, `foreign_keys=ON`, `busy_timeout=5000`). Mistake tags are normalized in `trade_note_tags` (`ON DELETE CASCADE`).
- **Non-Blocking Async**: Background WebSocket broadcasting (`backend/services/live_broadcaster.py`) offloads blocking MT5/SQLite I/O via `asyncio.to_thread(...)`.
- **Test Isolation**: `backend/tests/conftest.py` isolates all tests to `tmp_path`; tests must never touch `data/portfolio.db`.

### 3.2 Solid.js Fine-Grained Reactivity & Design Tokens
- **No Virtual DOM**: Components run **once** as setup functions. Never destructure `props` (`splitProps`/`mergeProps` only).
- **Store & WebSocket**: Live 1Hz WebSocket ticks patch `portfolioStore` via `createStore` + `reconcile` (`useWebSocket` in `primitives/`) instead of deep-cloning state.
- **Control Flow & Memos**: Always use `<For>`, `<Show>`, `<Switch>`/`<Match>`, `createMemo` for derived collections, and `on(..., { defer: true })` instead of manual `lastValue` diffing.
- **3-Layer CSS Tokens**: Use semantic/component CSS tokens from `frontend/src/styles/tokens.css` and `utils/chartTheme.ts` instead of hardcoded hex colors.

### 3.3 Lightweight Charts v5 Multi-Series & Split Scaling
- **Independent Price Scales**: When rendering lines alongside trade change bars, **never share a single price scale**:
  - Curves on `priceScaleId: 'right'` (`scaleMargins: { top: 0.08, bottom: 0.32 }`).
  - Change bars on `priceScaleId: 'left'` (`scaleMargins: { top: 0.72, bottom: 0.02 }`, `visible: false`).

### 3.4 MT5 Domain Invariants
- **Position SL/TP**: Closing deals (`entry = 1`) carry `sl = 0.0` and `tp = 0.0`. Retrieve true SL/TP via `mt5.history_orders_get(position=position_id)` inside `LiveMT5Gateway`.
- **Deal Direction**: Extract position direction from the opening deal (`d_in.type`).
- **Profit & Excursions**: Calculate dollar amounts using `mt5.order_calc_profit()`—never multiply price differences by arbitrary constants.
- **1R & Pip Size**: Single source of truth in `backend/domain/risk.py` and `backend/domain/pips.py`.
- **Van Tharp SQN Formula**: Clamped by $\min(10.0, \sqrt{N})$ to avoid sheer volume distortion for $N > 100$. For $N < 30$, show the developing sample size notice.

---

## 4. Development & Workflow Guidelines

1. **TDD & Verify Before Declaring Complete**:
   - Write failing tests first (pytest/hypothesis on backend, Vitest on frontend), then implement, then pass all required gates.
   - Use browser subagents to visually verify UI changes on `http://127.0.0.1:8000`.
2. **File References**:
   - Provide clickable file links using forward slashes: `[file.ts](file:///d:/projects/mt5-statistic-viewer/frontend/src/file.ts)`.
3. **No Shell Sleep**:
   - Never use `sleep` or polling loops in shell commands.
4. **Preserve Documentation**:
   - Maintain existing docstrings and comments. Update relevant files in `specs/` when introducing architectural changes.
