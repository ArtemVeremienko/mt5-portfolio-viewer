# Frontend Engineering Rules (`frontend/AGENTS.md`)

These rules apply to all TypeScript, TSX, and CSS code under `frontend/`.

---

## 1. Module & Layer Boundaries

```text
frontend/src/
├── api/               # Typed fetchJson<T> wrappers + AbortSignal support
├── primitives/        # Headless Solid.js hooks (useWebSocket, useHoverTooltip, useClickOutside)
├── styles/tokens.css  # 3-Layer CSS Design Tokens (Primitive -> Semantic -> Component)
├── utils/             # Pure formatters, chartTransforms, chartTheme, storage
├── components/ui/     # Reusable design-system primitives (Card, Badge) using splitProps/mergeProps
├── features/          # Domain-grouped feature modules (e.g. layout/GlobalFilterBar, OverviewStrip)
└── components/        # Top-level domain views & charts
```

- **No Raw `fetch` in Components**: All HTTP calls belong in `frontend/src/api/` using `fetchJson<T>` from `api/client.ts`.
- **Shared Primitives & Formatters**: Reuse `utils/formatters.ts`, `primitives/useHoverTooltip.ts`, `primitives/useClickOutside.ts`, and `primitives/useWebSocket.ts` instead of duplicating timers, listeners, or formatting helpers.

---

## 2. Solid.js & Reactivity Rules

- **Never Destructure `props`**: Access `props.x` directly or use `splitProps` / `mergeProps` in UI primitives (`solid/no-destructure: error`).
- **Control Flow**: Always use `<For>` instead of `.map()` in JSX (`solid/prefer-for: error`) and `<Show>` for conditional blocks.
- **Derived State & Effects**:
  - Wrap derived computations in `createMemo` (`dayMap`, `calendarCells`, `maxMagnitude`, etc.).
  - Use `on(() => props.x, ..., { defer: true })` instead of manual `lastValue` tracking in `createEffect`.
  - Register `onCleanup` at component/effect scope (never nested inside `onMount`), and always clear `setTimeout` / `requestAnimationFrame` / `ResizeObserver` handles.
- **Stores**: Use `createStore` + `reconcile` for high-frequency WebSocket updates (`App.tsx`) rather than deep object-spread cloning.

---

## 3. Design System & TypeScript Rules

- **3-Layer CSS Tokens**: Define raw values in `@theme` (`tokens.css`), semantic intent in `:root` (`--surface-*`, `--status-*`, `--chart-*`), and component tokens (`--card-*`, `--tooltip-*`). Read chart colors via `utils/chartTheme.ts`.
- **Strict TypeScript**: `tsconfig.app.json` enforces `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `noUncheckedIndexedAccess: true`, and `verbatimModuleSyntax: true` (always use `import type` for types).

---

## 4. Required Pre-Commit Gates & TDD

1. Write failing Vitest unit tests first for pure utilities, chart transforms, and API clients (`*.test.ts`).
2. **All 4 gates must pass with 0 errors before committing**:
   ```powershell
   cd frontend
   npm test
   npm run typecheck
   npm run lint
   npm run build
   ```
3. Visually verify UI changes on `http://127.0.0.1:8000` via the `browser` subagent.
