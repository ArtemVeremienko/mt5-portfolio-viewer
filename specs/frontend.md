# Frontend Architecture Specification

## 1. Overview
The frontend is a single-page application built with **Solid.js** (Zero Virtual DOM), **TypeScript (strict mode)**, and **Tailwind CSS v4**. It consumes the FastAPI backend via typed REST API clients and a reconnecting WebSocket hook.

---

## 2. Directory Structure

```text
frontend/src/
├── App.tsx                        # Slim shell: navigation tabs, store/WS wiring, tab views
├── types.ts                       # Shared domain TypeScript interfaces
├── index.css                      # Tailwind v4 + 3-layer token import + scrollbar styles
├── index.tsx                      # Solid.js mount entry point
├── styles/
│   └── tokens.css                 # 3-layer design tokens (Primitive -> Semantic -> Component)
├── api/
│   ├── client.ts                  # Typed fetchJson<T> + ApiError normalization
│   ├── portfolio.ts               # getAccounts, getPortfolio, getOpenTrades, switchAccount, syncAccount, runStrategyBenchmark
│   ├── trades.ts                  # getTradeCandles (AbortSignal), saveTradeNote
│   └── tags.ts                    # getTags, createTag, updateTag, deleteTag
├── primitives/
│   ├── useWebSocket.ts            # Reconnecting WS hook with onCleanup
│   ├── useHoverTooltip.ts         # Shared viewport-clamped tooltip state + timer cleanup
│   └── useClickOutside.ts         # Outside-click & Escape listener with onCleanup
├── utils/
│   ├── formatters.ts              # Centralized currency, pct, R, and duration formatters
│   ├── chartTransforms.ts         # Pure timestamp deduplication & timeframe slicing
│   ├── chartTheme.ts              # Reads CSS semantic tokens for Lightweight Charts v5
│   └── storage.ts                 # Typed localStorage helpers
├── components/ui/
│   ├── Card.tsx                   # Reusable Card primitive (splitProps)
│   └── Badge.tsx                  # Reusable Badge primitive (mergeProps + splitProps)
├── features/layout/
│   ├── GlobalFilterBar.tsx        # Date, symbol, direction, EA, magic, setupTag, excludeMistakes, and all-accounts filters
│   └── OverviewStrip.tsx          # Today/Week/Month/Floating strip + Prop Risk Guard popover
└── components/
    ├── Header.tsx                 # Account picker, Metric Mode switch, Sync button
    ├── SidebarStats.tsx           # Myfxbook financial metrics & trading edge cards
    ├── PerformanceChart.tsx       # Lightweight Charts v5 multi-curve canvas with split scaling
    ├── MonthlyHeatmap.tsx         # Monthly return heatmap matrix (Jan-Dec + YTD)
    ├── MonthlyAnalytics.tsx       # 4-quadrant monthly breakdown
    ├── TradingStats.tsx           # Summary, symbol, hourly, and daily overview cards
    ├── VanTharpPanel.tsx          # Van Tharp SQN card, Poker/Roulette badge, 100-trade stabilization, R-Distribution
    ├── AdvancedStats.tsx          # Extended statistical edge, Risk of Ruin, Duration scatter
    ├── ExcursionPanel.tsx         # MAE/MFE scatter plots & Trade Quality Matrix
    ├── BenchmarkPanel.tsx         # Coin-Flip/Random-Session Monte Carlo, E-Ratio, Kelly/Optimal-f, OOS Survival, Drift & Process Matrix
    ├── CalendarView.tsx           # Daily P&L calendar + drill-down modal
    ├── TradesTable.tsx            # Open/History/Playbook/Cashflows tabs + Journal modal
    └── TradeChartGrid.tsx         # Multi-timeframe (H1/M5/M1) trade execution chart grid
```

---

## 3. Key Architectural Implementations

### 3.1 3-Layer Design System Tokens (`styles/tokens.css` & `utils/chartTheme.ts`)
1. **Primitive Tokens (`@theme`)**: Raw palette (`--color-navy-950`, `--color-emerald-500`, `--color-rose-500`, etc.) and radii (`--radius-card`, `--radius-control`).
2. **Semantic Tokens (`:root`)**: Intent-based surface, border, text, status (`--status-profit`, `--status-loss`, `--status-r`), and chart tokens (`--chart-bull`, `--chart-bear`, `--chart-grid`).
3. **Component Tokens (`:root`)**: `--card-bg`, `--card-border`, `--table-row-hover`, `--tooltip-bg`.
4. `chartTheme.ts` reads semantic CSS variables at runtime so Lightweight Charts v5 canvases stay synchronized with Tailwind UI.

### 3.2 Performance Chart (`components/PerformanceChart.tsx`)
Built on **TradingView Lightweight Charts v5**:
- **Multi-Series Views**: Growth (%), Balance & Equity ($), Profit ($), Van Tharp R-Curve, and Drawdown (%).
- **Split Canvas Scaling**: Upper region on `rightPriceScale` for curves; lower region on `leftPriceScale` (`priceScaleId: 'left'`) for trade change bars.
- **Tab Switching Guard**: Uses Solid's `on(() => props.mode, ..., { defer: true })` so tab clicks remain active until the user explicitly toggles the global header mode switcher.

### 3.3 Strict TypeScript & ESLint (`eslint.config.js` & `tsconfig.app.json`)
- `tsconfig.app.json` enables `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `noUncheckedIndexedAccess: true`, and `verbatimModuleSyntax: true`.
- `eslint.config.js` enforces `eslint-plugin-solid` rules (`solid/reactivity`, `solid/no-destructure`, `solid/prefer-for`, `solid/prefer-show`, `solid/no-react-specific-props`, `solid/no-innerhtml`).

### 3.4 Benchmark & System Audit (`App.tsx`, `BenchmarkPanel.tsx`, `GlobalFilterBar.tsx`, `VanTharpPanel.tsx`)
- **Benchmark Tab**: `App.tsx` exposes a top-level `Benchmark` tab rendering `BenchmarkPanel.tsx` with reactive synchronization to active account, global filters, and `revengeWindowMin`.
- **System-Only Filtering**: `GlobalFilterBar.tsx` adds a `setupTag` selector and `excludeMistakes` ("System Only") toggle that propagate to both `/api/portfolio` and `POST /api/portfolio/benchmark`.
- **Poker vs. Roulette & Stabilization**: `VanTharpPanel.tsx` displays a `Poker (+EV)` / `Roulette (E ≤ 0)` classification badge ($N \ge 30$) and a 100-trade stabilization target progress bar ($30 \le N < 100$).

---

## 4. State Management & Reactivity

- **Zero Virtual DOM**: Signals (`createSignal`), memos (`createMemo`), and stores (`createStore` + `reconcile`) manage reactive state.
- **Path-Based Live WebSocket Updates**: `useWebSocket` feeds 1Hz ticks into `setPortfolioStore('data', 'account', ...)` and `setPortfolioStore('data', 'stats', ...)`, updating only subscribed DOM nodes without cloning the entire analytics payload.
- **List & Derived Data Hygiene**: JSX lists use `<For>` (never `.map()`), derived matrices (`dayMap`, `calendarCells`, `maxMagnitude`, `activeHourlyStats`, `activeDailyStats`) use `createMemo`, and all `ResizeObserver` / `setTimeout` / `AbortController` handles are cleaned up via `onCleanup`.
