# System Overview & Evolution

## 1. Initial Vision & Problem Statement

The goal of this project was to build a modern, high-performance web alternative to **Myfxbook** specifically tailored for **MetaTrader 5 (MT5)** traders, integrating Dr. Van Tharp's quantitative risk methodologies (**R-Multiples** and **System Quality Number - SQN**).

Traditional tools (like Myfxbook or standard MT5 reports) have key limitations:
- **Cloud Dependency / Delay**: Requiring publishing statements or running EA FTP uploaders with significant delay.
- **Fixed Currency Focus**: Analyzing accounts purely in USD/EUR obscures true edge when position sizes fluctuate.
- **Missing Excursion Analytics**: Standard reports do not calculate how much drawdown a trade suffered before turning profitable (**MAE**) or how much profit was left on the table (**MFE**).
- **Laggy UI**: Heavy Virtual-DOM single-page apps struggle with high-frequency live streaming charts and tick events.

### Core Architectural Decisions
1. **Zero Virtual DOM Frontend**: Built with **Solid.js** and **Tailwind CSS**. Fine-grained reactivity updates only the specific DOM nodes that change, providing instant rendering speed.
2. **TradingView Lightweight Charts v5**: Canvas-rendered charting with interactive multi-series overlays, split scaling, and bottom legend pills.
3. **High-Performance Python Backend**: **FastAPI** on Python 3.14 with native `MetaTrader5` API bindings, real-time WebSocket streaming, and offline SQLite caching.

---

## 2. Feature Roadmap & Development Evolution

During interactive pair programming and verification cycles, several critical domain-specific enhancements and bug fixes were engineered:

### Milestone 1: Core Myfxbook Metric Suite & R-Multiple Engine
- **Financial Statistics**: Real-time Gain %, Absolute Gain %, Daily Return %, Monthly Return %, and Peak Drawdown %.
- **Monthly Heatmap Matrix**: Calendar matrix showing percentage returns per month (Jan–Dec) and YTD across years.
- **Van Tharp 1R Modeling**: Normalized trade results into R-multiples ($R = \frac{\text{Profit}}{\text{Initial Risk}}$).
- **System Quality Number (SQN)**: Formulated as $\text{SQN} = \frac{\bar{R}}{\sigma_R} \times \sqrt{N}$ with Van Tharp performance grades (*Poor*, *Average*, *Good*, *Very Good*, *Excellent*, *Superb*).
- **Offline SQLite Cache**: Enables complete application functionality even when MT5 is disconnected or closed.

### Milestone 2: Trade Excursion Suite (MAE & MFE Analytics)
- **Chart 1: MAE vs Realized Return**: Stop Loss placement analysis with 90% SL cutoff reference line to identify if stops are too wide or choking trades.
- **Chart 2: MFE vs Realized Return**: Take Profit efficiency analysis with 50% capture benchmark line to measure trailing stop efficiency.
- **Chart 3: Trade Quality Matrix (MFE vs MAE)**: Quadrant map classifying trades into:
  - *Clean / Sniper*: Low drawdown, high peak profit (efficient entries).
  - *Rollercoaster*: High drawdown, high peak profit (stressful hold).
  - *Scratch / Noise*: Low drawdown, low profit.
  - *Toxic / Bleeders*: Severe drawdown, zero upside.
- **Recent Trade Excursion Summary Table**: Provides intra-trade ratio (MFE / MAE) and MFE capture percentage.

### Milestone 3: MT5 Quirks & Critical Domain Fixes
1. **Closing Deals vs Opening Orders SL/TP Resolution**:
   - In MT5, closing deals (`entry = DEAL_ENTRY_OUT`) do not store the original trade's Stop Loss or Take Profit (`sl = 0.0, tp = 0.0`).
   - Mapped `position_id` against `history_orders_get` and parsed comment triggers (`[sl ...]`, `[tp ...]`) to extract true trade Stop Loss and Take Profit.
2. **1R Risk Calibration for Micro Accounts**:
   - For micro accounts ($25 balance) trading micro-lots (0.01), resolved an issue where inverted deal direction defaulted 1R risk to $10.00. Calibrated floor to $0.10 and used exact `mt5.order_calc_profit`, generating true ~$0.22 1R risk baseline.
3. **Index CFD (.DE40Cash) MAE/MFE Outlier Correction**:
   - Ticket `#583417256` showed $-10.40 MAE for a 10.4 point move due to breakeven trades falling back to a `100.0` multiplier. Switched entirely to `mt5.order_calc_profit` for all excursion dollar conversions, reducing MAE to true `$0.11` (10.4 points).
4. **Trade Quality Matrix Auto-Fit & Overlap Elimination**:
   - Replaced shared axis clamping with independent X and Y auto-scaling (+15% padding), removing the giant empty space on the right of the chart.
   - Repositioned the 1:1 diagonal line ratio badge to prevent overlap with the `ROLLERCOASTER` quadrant badge.
5. **Date & Time Context**:
   - Summary table upgraded to show local timestamps (`YYYY-MM-DD HH:mm:ss`) with `#ticket` subtext, and concise timestamps (`MM/DD HH:mm`) in chart tooltips.
6. **Global Trade Scope & SQN Developing Sample**:
   - Added global `All Trades` vs `Last 100` scope filter in header.
   - Added amber sample size progress indicator for $N < 30$ trades with Van Tharp $\min(10.0, \sqrt{N})$ clamping explanation.

### Milestone 4: Myfxbook Multi-Curve Overlays & Split Scaling
1. **Multi-Series Overlays per View**:
   - Growth View: Growth Curve + Equity Growth + Per-Trade Growth Change Bars.
   - Balance View: Balance Curve + Equity Curve + Dollar Change Bars.
   - Profit View: Cumulative Profit Area + Return Bars.
   - R-Curve View: Cumulative R Area + R-Multiple Bars.
2. **Interactive Bottom Legend Pills**:
   - Interactive pills beneath the chart canvas allow toggling individual curves or change bars on and off dynamically.
3. **Tab Switching Lock Fix**:
   - Fixed a Solid.js `createEffect` subscription lock that was reverting user tab clicks back to `'balance'`.
4. **Split Canvas Scaling**:
   - Resolved flat horizontal balance curves and 2-pixel sliver bars by dedicating the upper 68% (`priceScaleId: 'right'`) to Balance/Equity with dynamic auto-zoom ($22.80 - $25.00), and the lower 28% (`priceScaleId: 'left'`) to prominent Trade Profit change bars.
