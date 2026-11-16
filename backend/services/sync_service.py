from __future__ import annotations

from pathlib import Path
from typing import Any

from backend.domain.protocols import TradingGateway
from backend.infrastructure.db.uow import SqliteUnitOfWork


def perform_sync(db_path: Path, gateway: TradingGateway) -> int | None:
    """Synchronize account metadata and historical deals from MT5 into SQLite."""
    acc_info = gateway.get_account_info()
    if not acc_info:
        return None
    login = int(acc_info["login"])
    deals = gateway.get_history_deals()
    with SqliteUnitOfWork(db_path) as uow:
        uow.accounts.upsert(acc_info)
        if deals:
            uow.deals.upsert_many(deals)
    return login


def build_combined_account(accounts: list[dict[str, Any]]) -> dict[str, Any]:
    """Build synthetic aggregate account metadata across all synced accounts."""
    total_bal = sum(float(a.get("balance", 0.0) or 0.0) for a in accounts)
    total_eq = sum(float(a.get("equity", 0.0) or 0.0) for a in accounts)
    total_margin = sum(float(a.get("margin", 0.0) or 0.0) for a in accounts)
    total_free = sum(float(a.get("free_margin", 0.0) or 0.0) for a in accounts)
    return {
        "login": 0,
        "broker": f"Combined Portfolio ({len(accounts)} accounts)",
        "name": "All Synced Accounts",
        "server": "Multi-Account",
        "currency": "USD",
        "leverage": 100,
        "balance": round(total_bal, 2),
        "equity": round(total_eq, 2),
        "margin": round(total_margin, 2),
        "free_margin": round(total_free, 2),
        "margin_level": 0.0,
        "is_demo": 1,
        "is_combined": True,
    }
