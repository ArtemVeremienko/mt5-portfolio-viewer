# MetaTrader 5 (MT5) Domain Quirks & Integration Reference

This document catalogs essential domain-specific quirks and architectural gotchas encountered when integrating Python with MetaTrader 5.

---

## 1. Deals vs Orders vs Positions

In MT5's netting/hedging model:
- An **Order** is an instruction to buy or sell (e.g., market order, limit order, stop loss order).
- A **Deal** is an execution transaction resulting from an order.
- A **Position** is the open market exposure resulting from one or more deals.

### ⚠️ Quirk 1: Closing Deals Have No SL / TP
When a position is closed (either by hitting SL/TP or manually), MT5 records a closing deal (`entry = DEAL_ENTRY_OUT`).
- In this closing deal record, `deal.sl == 0.0` and `deal.tp == 0.0`.
- **Solution**: To retrieve the original trade's Stop Loss and Take Profit, query `mt5.history_orders_get(position=deal.position_id)`. The opening order (`ORDER_ENTRY_IN`) retains the true `order.sl` and `order.tp`. If the order was closed via broker stop, parse the comment trigger (e.g., `[sl 26530.2]`).

---

## 2. Deal Type Inversion on Exit

### ⚠️ Quirk 2: Exit Deal Direction Is Opposite to Position Direction
- For a **BUY** position, the opening deal has `type = DEAL_TYPE_BUY (0)`.
- The closing deal has `entry = DEAL_ENTRY_OUT (1)` and `type = DEAL_TYPE_SELL (1)`.
- If an algorithm uses `closing_deal.type` to determine the trade direction, it will incorrectly treat a BUY trade as a SELL trade, leading to inverted MAE/MFE formulas and inverted 1R risk modeling.
- **Solution**: Always resolve trade direction from the opening deal (`d_in.type`), never from the closing deal.

---

## 3. Instrument Point Valuation & Index CFDs

### ⚠️ Quirk 3: Point Multipliers Differ Widely Across Asset Classes
- In Forex (e.g. `EURUSD`), 1 pip on 0.01 lot is `$0.10`.
- In Index CFDs (e.g. `.DE40Cash`, DAX 40), 1 point move on 0.01 lot is approximately `$0.011` (or €0.01 converted to USD), NOT `$1.00` or `$100.00`.
- **Danger**: If an algorithm falls back to hardcoded multipliers (e.g. `100.0` or `1.0`), a 10.4 point excursion on `.DE40Cash` will be miscalculated as `$10.40` instead of true `$0.11`.
- **Solution**: Always call MT5's native profit calculator:
  ```python
  mt5.order_calc_profit(action, symbol, volume, price_open, price_close)
  ```
  This handles contract sizes, base currency exchange rates, and fractional pip scaling natively.

---

## 4. Breakeven Trades (`profit == $0.00`)

### ⚠️ Quirk 4: Multiplier Inference Breaks on $0.00 Profit
- Inferring dollar value per pip by dividing `profit / pips` throws `ZeroDivisionError` on breakeven trades.
- If a fallback branch assigns a default multiplier (e.g. `100.0`), breakeven trades will suffer massive distortion in their calculated MAE/MFE.
- **Solution**: Use `mt5.order_calc_profit` unconditionally for all excursions, regardless of realized net profit.

---

## 5. Micro-Account 1R Risk Baseline Calibration

### ⚠️ Quirk 5: Missing Stop Loss on Small Accounts
- Van Tharp 1R risk represents initial capital at risk.
- If a trader executes without an initial Stop Loss, standard institutional systems often default to `$10.00` or `$50.00`. On a `$25.00` micro account, an arbitrary `$10.00` 1R produces meaningless $0.02R outcomes.
- **Solution**: Compute theoretical 1R using the instrument's 20-period ATR or calibrated pip distance, with a scaled micro floor of `$0.10`.

---

## 6. MT5 Python API Environment Constraints

1. **Windows Platform**: The official `MetaTrader5` Python package relies on Windows DLLs and IPC hooks. It cannot connect to MT5 on Linux/macOS without Wine/Docker wrappers.
2. **Terminal Architecture**: Python architecture must match the MT5 terminal (64-bit Python for 64-bit MT5).
3. **Offline Fallback**: When MT5 is not running or login fails, the system must degrade gracefully to the SQLite database cache (`data/portfolio.db`) rather than throwing unhandled exceptions.
