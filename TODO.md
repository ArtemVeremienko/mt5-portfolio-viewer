# TODO

## Closed History Table Improvements (`frontend/src/components/TradesTable.tsx`)

### 1. Canonical Trader-First Column Order
Reorder columns in `Closed History` so core trade identity and review/outcome columns are in a clean, scannable sequence ending with `Net Profit`, `R-Multiple`, `Comment`, and `Journal`:

1. `Symbol` *(visible by default)*
2. `Type` *(visible by default)*
3. `Lots` *(visible by default)*
4. `Open Time` *(visible by default)*
5. `Close Time` *(hidden by default)*
6. `Dur.` *(visible by default)*
7. `Open` *(hidden by default)*
8. `Close` *(hidden by default)*
9. `SL` *(hidden by default)*
10. `TP` *(hidden by default)*
11. `Pips` *(hidden by default)*
12. `Swap` *(hidden by default)*
13. `Comm.` *(hidden by default)*
14. `MAE` *(hidden by default)*
15. `MFE` *(hidden by default)*
16. `Ticket` *(hidden by default)*
17. `Net Profit` *(visible by default)*
18. `R-Multiple` *(visible by default)*
19. `Comment` *(visible by default)*
20. `Journal` *(visible by default)*

### 2. Configurable Column Visibility (`localStorage`)
- Add a **Columns** popover button in the `Closed History` toolbar with per-column visibility checkboxes and a **Reset to Default** action.
- Persist visible column keys in `localStorage` (e.g., `tradesTable.visibleColumns`).
- **CSV Export** (`exportCsv`) continues to export all fields regardless of UI column visibility.
- Ensure the empty-state `<td colspan={...}>` dynamically matches the count of currently visible columns.
