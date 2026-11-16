# Backend Engineering Rules (`backend/AGENTS.md`)

These rules apply to all Python code under `backend/`.

---

## 1. Module & Layer Boundaries

```text
backend/
├── app.py                   # FastAPI factory & lifespan (no module-level mutable globals)
├── config.py                # pydantic-settings Settings
├── api/                     # Thin HTTP/WS transport (schemas.py, deps.py, routes/*)
├── domain/                  # Pure domain models, enums, Protocols, 1R risk & pip math
├── services/                # Use-case orchestration & modular analytics/ pipeline
└── infrastructure/
    ├── db/                  # SQLite connection, PRAGMA user_version migrations, UoW, repositories
    └── mt5/                 # LiveMT5Gateway & SimulatedMT5Gateway (TradingGateway protocol)
```

- **Routes (`api/routes/`)**: Must remain thin. Use `Depends()` (`get_db_path`, `get_mt5_gateway`, `get_settings`), Pydantic v2 `response_model`, and `Query(...)` bounds. Never access `sqlite3` or `MetaTrader5` directly from routes.
- **Domain (`domain/`)**: Pure Python only—no FastAPI, SQLite, or `MetaTrader5` imports. `domain/risk.py` and `domain/pips.py` are the single source of truth for 1R and pip calculations.
- **Infrastructure (`infrastructure/`)**:
  - All SQLite operations must go through `SqliteUnitOfWork` (`WAL`, `foreign_keys=ON`, `busy_timeout=5000`). Never open raw `sqlite3.connect()` outside `connection.py`.
  - Schema changes must be added as numbered migrations in `infrastructure/db/migrations.py` (`_MIGRATIONS`), never inline `ALTER TABLE` in startup code.
  - Never use f-string SQL for user/tag values or column names; use parameterized queries.
  - Both `LiveMT5Gateway` and `SimulatedMT5Gateway` must satisfy `TradingGateway` (`domain/protocols.py`) with identical deal dict schemas (including `magic`). Never mutate Python's global `random.seed()`.
- **Async & Concurrency**: Offload blocking MT5/SQLite calls inside `async def` functions (e.g., `live_broadcaster.py`) with `await asyncio.to_thread(...)`.

---

## 2. Python 3.14 Coding Standards

- Use `from __future__ import annotations`, native generics (`list[T]`, `dict[K, V]`, `T | None`), `pathlib.Path`, `IntEnum`/`StrEnum`, and `logging.getLogger(__name__)` (never `print()`).
- Keep analytics functions pure and focused in `services/analytics/`; ensure `empty_analytics_response` maintains 100% key parity with populated responses.

---

## 3. Required Pre-Commit Gates & TDD

1. Write failing tests first in `backend/tests/` (use `conftest.py` isolated `tmp_path` DB and `dependency_overrides`—never touch `data/portfolio.db`).
2. For analytics math, add `hypothesis` property-based tests in `backend/tests/test_analytics_properties.py`.
3. **All 3 gates must pass with zero errors before committing**:
   ```powershell
   python -m pytest backend/tests
   ruff check backend
   mypy backend
   ```
