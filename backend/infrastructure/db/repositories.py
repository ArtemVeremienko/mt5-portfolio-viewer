from __future__ import annotations

import json
import sqlite3
import time
from typing import Any

from backend.infrastructure.db.migrations import (
    VALID_TAG_KINDS,
    normalize_tag_category,
    parse_tag_list,
    register_tag_cursor,
)


class AccountRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def upsert(self, account_data: dict[str, Any]) -> None:
        self._conn.execute(
            """
            INSERT INTO accounts (
                login, broker, name, server, currency, leverage,
                balance, equity, margin, free_margin, margin_level, is_demo, last_synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(login) DO UPDATE SET
                broker=excluded.broker,
                name=excluded.name,
                server=excluded.server,
                currency=excluded.currency,
                leverage=excluded.leverage,
                balance=excluded.balance,
                equity=excluded.equity,
                margin=excluded.margin,
                free_margin=excluded.free_margin,
                margin_level=excluded.margin_level,
                is_demo=excluded.is_demo,
                last_synced_at=excluded.last_synced_at
            """,
            (
                account_data.get("login"),
                account_data.get("broker", ""),
                account_data.get("name", ""),
                account_data.get("server", ""),
                account_data.get("currency", "USD"),
                account_data.get("leverage", 100),
                account_data.get("balance", 0.0),
                account_data.get("equity", 0.0),
                account_data.get("margin", 0.0),
                account_data.get("free_margin", 0.0),
                account_data.get("margin_level", 0.0),
                account_data.get("is_demo", 1),
                account_data.get("last_synced_at", int(time.time())),
            ),
        )

    def get_all(self) -> list[dict[str, Any]]:
        rows = self._conn.execute(
            "SELECT * FROM accounts ORDER BY last_synced_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]

    def get_by_login(self, login: int) -> dict[str, Any] | None:
        row = self._conn.execute(
            "SELECT * FROM accounts WHERE login = ?", (login,)
        ).fetchone()
        return dict(row) if row else None


class DealRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def upsert_many(self, deals: list[dict[str, Any]]) -> None:
        if not deals:
            return
        self._conn.executemany(
            """
            INSERT INTO deals (
                ticket, order_id, account_id, time, time_msc, type, entry, symbol,
                volume, price, profit, swap, commission, sl, tp, open_time, open_price,
                comment, magic, risk_r, r_multiple,
                mae_price, mfe_price, mae_pips, mfe_pips, mae_amount, mfe_amount, mae_r, mfe_r
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(ticket) DO UPDATE SET
                profit=excluded.profit,
                swap=excluded.swap,
                commission=excluded.commission,
                sl=excluded.sl,
                tp=excluded.tp,
                open_time=excluded.open_time,
                open_price=excluded.open_price,
                magic=excluded.magic,
                risk_r=excluded.risk_r,
                r_multiple=excluded.r_multiple,
                mae_price=excluded.mae_price,
                mfe_price=excluded.mfe_price,
                mae_pips=excluded.mae_pips,
                mfe_pips=excluded.mfe_pips,
                mae_amount=excluded.mae_amount,
                mfe_amount=excluded.mfe_amount,
                mae_r=excluded.mae_r,
                mfe_r=excluded.mfe_r
            """,
            [
                (
                    d.get("ticket"),
                    d.get("order_id", 0),
                    d.get("account_id"),
                    d.get("time", 0),
                    d.get("time_msc", 0),
                    d.get("type", 0),
                    d.get("entry", 0),
                    d.get("symbol", ""),
                    d.get("volume", 0.0),
                    d.get("price", 0.0),
                    d.get("profit", 0.0),
                    d.get("swap", 0.0),
                    d.get("commission", 0.0),
                    d.get("sl", 0.0),
                    d.get("tp", 0.0),
                    d.get("open_time", 0),
                    d.get("open_price", 0.0),
                    d.get("comment", ""),
                    d.get("magic", 0),
                    d.get("risk_r", 0.0),
                    d.get("r_multiple", 0.0),
                    d.get("mae_price", 0.0),
                    d.get("mfe_price", 0.0),
                    d.get("mae_pips", 0.0),
                    d.get("mfe_pips", 0.0),
                    d.get("mae_amount", 0.0),
                    d.get("mfe_amount", 0.0),
                    d.get("mae_r", 0.0),
                    d.get("mfe_r", 0.0),
                )
                for d in deals
            ],
        )

    def get_by_account(self, account_id: int) -> list[dict[str, Any]]:
        rows = self._conn.execute(
            "SELECT * FROM deals WHERE account_id = ? ORDER BY time ASC",
            (account_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    def get_for_accounts(self, account_ids: list[int]) -> list[dict[str, Any]]:
        if not account_ids:
            return []
        placeholders = ",".join("?" for _ in account_ids)
        rows = self._conn.execute(
            f"SELECT * FROM deals WHERE account_id IN ({placeholders}) ORDER BY time ASC",
            tuple(account_ids),
        ).fetchall()
        return [dict(r) for r in rows]

    def get_by_ticket(self, ticket: int) -> dict[str, Any] | None:
        row = self._conn.execute(
            "SELECT * FROM deals WHERE ticket = ? LIMIT 1", (ticket,)
        ).fetchone()
        return dict(row) if row else None


class SnapshotRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def replace_for_account(self, account_id: int, snapshots: list[dict[str, Any]]) -> None:
        self._conn.execute("DELETE FROM equity_snapshots WHERE account_id = ?", (account_id,))
        self._conn.executemany(
            """
            INSERT INTO equity_snapshots (
                account_id, timestamp, balance, equity, growth_pct, drawdown_pct, cumulative_r
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    account_id,
                    s.get("timestamp", 0),
                    s.get("balance", 0.0),
                    s.get("equity", 0.0),
                    s.get("growth_pct", 0.0),
                    s.get("drawdown_pct", 0.0),
                    s.get("cumulative_r", 0.0),
                )
                for s in snapshots
            ],
        )

    def get_by_account(self, account_id: int) -> list[dict[str, Any]]:
        rows = self._conn.execute(
            "SELECT * FROM equity_snapshots WHERE account_id = ? ORDER BY timestamp ASC",
            (account_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    def append(self, account_id: int, snapshot: dict[str, Any]) -> None:
        self._conn.execute(
            """
            INSERT INTO equity_snapshots (
                account_id, timestamp, balance, equity, growth_pct, drawdown_pct, cumulative_r
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                account_id,
                snapshot.get("timestamp", 0),
                snapshot.get("balance", 0.0),
                snapshot.get("equity", 0.0),
                snapshot.get("growth_pct", 0.0),
                snapshot.get("drawdown_pct", 0.0),
                snapshot.get("cumulative_r", 0.0),
            ),
        )


class JournalRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def get_notes_by_account(self, account_id: int) -> dict[int, dict[str, Any]]:
        rows = self._conn.execute(
            """
            SELECT ticket, note, setup_tag, mistake_tag, exit_tag,
                   entry_grade, execution_grade, management_grade, updated_at
            FROM trade_notes
            WHERE account_id = ?
            """,
            (account_id,),
        ).fetchall()
        return {int(r["ticket"]): dict(r) for r in rows}

    def get_all_notes(self) -> dict[int, dict[str, Any]]:
        rows = self._conn.execute(
            """
            SELECT ticket, note, setup_tag, mistake_tag, exit_tag,
                   entry_grade, execution_grade, management_grade, updated_at
            FROM trade_notes
            """
        ).fetchall()
        return {int(r["ticket"]): dict(r) for r in rows}

    def upsert_note(
        self,
        ticket: int,
        account_id: int,
        note: str,
        setup_tag: str,
        mistake_tag: str,
        exit_tag: str = "",
        entry_grade: str = "",
        execution_grade: str = "",
        management_grade: str = "",
        updated_at: int = 0,
    ) -> None:
        cursor = self._conn.cursor()
        parsed_mistakes = parse_tag_list(mistake_tag)
        normalized_mistake = ", ".join(parsed_mistakes)
        trimmed_setup = (setup_tag or "").strip()
        trimmed_exit = (exit_tag or "").strip()

        cursor.execute(
            """
            INSERT INTO trade_notes (
                ticket, account_id, note, setup_tag, mistake_tag, exit_tag,
                entry_grade, execution_grade, management_grade, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(ticket) DO UPDATE SET
                account_id=excluded.account_id,
                note=excluded.note,
                setup_tag=excluded.setup_tag,
                mistake_tag=excluded.mistake_tag,
                exit_tag=excluded.exit_tag,
                entry_grade=excluded.entry_grade,
                execution_grade=excluded.execution_grade,
                management_grade=excluded.management_grade,
                updated_at=excluded.updated_at
            """,
            (
                ticket,
                account_id,
                note,
                trimmed_setup,
                normalized_mistake,
                trimmed_exit,
                entry_grade,
                execution_grade,
                management_grade,
                updated_at,
            ),
        )

        if trimmed_setup:
            register_tag_cursor(cursor, "setup", trimmed_setup, "", is_default=0)
        if trimmed_exit:
            register_tag_cursor(cursor, "exit", trimmed_exit, "", is_default=0)

        # Sync normalized trade_note_tags join table for mistakes
        cursor.execute("DELETE FROM trade_note_tags WHERE ticket = ?", (ticket,))
        for m_val in parsed_mistakes:
            tag_id = register_tag_cursor(cursor, "mistake", m_val, "entry", is_default=0)
            if tag_id is not None:
                cursor.execute(
                    "INSERT OR IGNORE INTO trade_note_tags (ticket, tag_id) VALUES (?, ?)",
                    (ticket, tag_id),
                )

    def _compute_usage_counts(self) -> dict[tuple[str, str], int]:
        counts: dict[tuple[str, str], int] = {}
        setup_rows = self._conn.execute(
            "SELECT LOWER(TRIM(setup_tag)) AS k, COUNT(*) AS cnt FROM trade_notes WHERE TRIM(setup_tag) != '' GROUP BY k"
        ).fetchall()
        for r in setup_rows:
            counts[("setup", str(r["k"]))] = int(r["cnt"])

        exit_rows = self._conn.execute(
            "SELECT LOWER(TRIM(exit_tag)) AS k, COUNT(*) AS cnt FROM trade_notes WHERE TRIM(exit_tag) != '' GROUP BY k"
        ).fetchall()
        for r in exit_rows:
            counts[("exit", str(r["k"]))] = int(r["cnt"])

        mistake_rows = self._conn.execute(
            """
            SELECT rt.name_lower AS k, COUNT(tnt.ticket) AS cnt
            FROM trade_note_tags tnt
            JOIN review_tags rt ON rt.id = tnt.tag_id
            WHERE rt.kind = 'mistake'
            GROUP BY rt.name_lower
            """
        ).fetchall()
        for r in mistake_rows:
            counts[("mistake", str(r["k"]))] = int(r["cnt"])

        return counts

    def get_review_tags(self, kind: str | None = None) -> list[dict[str, Any]]:
        if kind and kind in VALID_TAG_KINDS:
            rows = self._conn.execute(
                "SELECT id, kind, name, name_lower, category, is_default, created_at FROM review_tags WHERE kind = ? ORDER BY is_default DESC, name_lower ASC",
                (kind,),
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT id, kind, name, name_lower, category, is_default, created_at FROM review_tags ORDER BY kind ASC, is_default DESC, name_lower ASC"
            ).fetchall()
        counts = self._compute_usage_counts()
        return [
            {
                "id": int(r["id"]),
                "kind": r["kind"],
                "name": r["name"],
                "category": r["category"] or "",
                "is_default": int(r["is_default"] or 0),
                "created_at": int(r["created_at"] or 0),
                "usage_count": counts.get((str(r["kind"]), str(r["name_lower"])), 0),
            }
            for r in rows
        ]

    def create_review_tag(self, kind: str, name: str, category: str = "") -> dict[str, Any]:
        clean_kind = (kind or "").strip().lower()
        clean_name = (name or "").strip()
        if clean_kind not in VALID_TAG_KINDS:
            raise ValueError(f"Invalid tag kind: {kind}")
        if not clean_name:
            raise ValueError("Tag name cannot be empty")
        clean_cat = normalize_tag_category(clean_kind, category)
        name_lower = clean_name.lower()

        existing = self._conn.execute(
            "SELECT id FROM review_tags WHERE kind = ? AND name_lower = ?",
            (clean_kind, name_lower),
        ).fetchone()
        if existing:
            raise ValueError(f"Tag '{clean_name}' already exists for {clean_kind}")

        now_ts = int(time.time())
        cur = self._conn.execute(
            """
            INSERT INTO review_tags (kind, name, name_lower, category, is_default, created_at)
            VALUES (?, ?, ?, ?, 0, ?)
            """,
            (clean_kind, clean_name, name_lower, clean_cat, now_ts),
        )
        new_id = cur.lastrowid
        counts = self._compute_usage_counts()
        return {
            "id": int(new_id or 0),
            "kind": clean_kind,
            "name": clean_name,
            "category": clean_cat,
            "is_default": 0,
            "created_at": now_ts,
            "usage_count": counts.get((clean_kind, name_lower), 0),
        }

    def _sync_mistake_tag_text_for_tickets(self, tickets: list[int]) -> None:
        """Rebuild trade_notes.mistake_tag CSV string from normalized trade_note_tags."""
        for ticket in tickets:
            rows = self._conn.execute(
                """
                SELECT rt.name
                FROM trade_note_tags tnt
                JOIN review_tags rt ON rt.id = tnt.tag_id
                WHERE tnt.ticket = ?
                ORDER BY rt.name_lower ASC
                """,
                (ticket,),
            ).fetchall()
            joined = ", ".join(str(r["name"]) for r in rows)
            self._conn.execute(
                "UPDATE trade_notes SET mistake_tag = ? WHERE ticket = ?",
                (joined, ticket),
            )

    def _rename_tag_in_notes(self, kind: str, old_name: str, new_name: str) -> None:
        old_lower = old_name.strip().lower()
        if kind == "setup":
            self._conn.execute(
                "UPDATE trade_notes SET setup_tag = ? WHERE LOWER(TRIM(setup_tag)) = ?",
                (new_name, old_lower),
            )
        elif kind == "exit":
            self._conn.execute(
                "UPDATE trade_notes SET exit_tag = ? WHERE LOWER(TRIM(exit_tag)) = ?",
                (new_name, old_lower),
            )

    def update_review_tag(
        self,
        tag_id: int,
        name: str | None = None,
        category: str | None = None,
    ) -> dict[str, Any]:
        row = self._conn.execute(
            "SELECT id, kind, name, name_lower, category, is_default, created_at FROM review_tags WHERE id = ?",
            (tag_id,),
        ).fetchone()
        if not row:
            raise ValueError("Tag not found")

        kind = str(row["kind"])
        old_name = str(row["name"])
        new_name = (name if name is not None else old_name).strip()
        if not new_name:
            raise ValueError("Tag name cannot be empty")
        new_lower = new_name.lower()
        new_cat = (
            normalize_tag_category(kind, category)
            if category is not None
            else str(row["category"] or "")
        )

        conflict = self._conn.execute(
            "SELECT id, name, category, is_default, created_at FROM review_tags WHERE kind = ? AND name_lower = ? AND id != ?",
            (kind, new_lower, tag_id),
        ).fetchone()
        if conflict:
            target_id = int(conflict["id"])
            if kind == "mistake":
                affected = [
                    int(r["ticket"])
                    for r in self._conn.execute(
                        "SELECT ticket FROM trade_note_tags WHERE tag_id = ?", (tag_id,)
                    ).fetchall()
                ]
                for ticket in affected:
                    self._conn.execute(
                        "INSERT OR IGNORE INTO trade_note_tags (ticket, tag_id) VALUES (?, ?)",
                        (ticket, target_id),
                    )
                self._conn.execute("DELETE FROM review_tags WHERE id = ?", (tag_id,))
                self._sync_mistake_tag_text_for_tickets(affected)
            else:
                self._rename_tag_in_notes(kind, old_name, str(conflict["name"]))
                self._conn.execute("DELETE FROM review_tags WHERE id = ?", (tag_id,))

            counts = self._compute_usage_counts()
            return {
                "id": target_id,
                "kind": kind,
                "name": str(conflict["name"]),
                "category": str(conflict["category"] or ""),
                "is_default": int(conflict["is_default"] or 0),
                "created_at": int(conflict["created_at"] or 0),
                "usage_count": counts.get((kind, new_lower), 0),
                "merged": True,
            }

        self._conn.execute(
            "UPDATE review_tags SET name = ?, name_lower = ?, category = ? WHERE id = ?",
            (new_name, new_lower, new_cat, tag_id),
        )
        if new_name != old_name:
            if kind == "mistake":
                affected = [
                    int(r["ticket"])
                    for r in self._conn.execute(
                        "SELECT ticket FROM trade_note_tags WHERE tag_id = ?", (tag_id,)
                    ).fetchall()
                ]
                self._sync_mistake_tag_text_for_tickets(affected)
            else:
                self._rename_tag_in_notes(kind, old_name, new_name)

        counts = self._compute_usage_counts()
        return {
            "id": int(row["id"]),
            "kind": kind,
            "name": new_name,
            "category": new_cat,
            "is_default": int(row["is_default"] or 0),
            "created_at": int(row["created_at"] or 0),
            "usage_count": counts.get((kind, new_lower), 0),
            "merged": False,
        }

    def delete_review_tag(self, tag_id: int) -> dict[str, Any]:
        row = self._conn.execute(
            "SELECT id, kind, name FROM review_tags WHERE id = ?", (tag_id,)
        ).fetchone()
        if not row:
            raise ValueError("Tag not found")

        kind = str(row["kind"])
        name = str(row["name"])
        name_lower = name.strip().lower()
        affected_count = 0
        if kind == "setup":
            cur = self._conn.execute(
                "UPDATE trade_notes SET setup_tag = '' WHERE LOWER(TRIM(setup_tag)) = ?",
                (name_lower,),
            )
            affected_count = cur.rowcount
        elif kind == "exit":
            cur = self._conn.execute(
                "UPDATE trade_notes SET exit_tag = '' WHERE LOWER(TRIM(exit_tag)) = ?",
                (name_lower,),
            )
            affected_count = cur.rowcount
        elif kind == "mistake":
            affected = [
                int(r["ticket"])
                for r in self._conn.execute(
                    "SELECT ticket FROM trade_note_tags WHERE tag_id = ?", (tag_id,)
                ).fetchall()
            ]
            affected_count = len(affected)
            self._conn.execute("DELETE FROM review_tags WHERE id = ?", (tag_id,))
            self._sync_mistake_tag_text_for_tickets(affected)
            return {
                "deleted_id": tag_id,
                "kind": kind,
                "name": name,
                "affected_trades": affected_count,
            }

        self._conn.execute("DELETE FROM review_tags WHERE id = ?", (tag_id,))
        return {
            "deleted_id": tag_id,
            "kind": kind,
            "name": name,
            "affected_trades": affected_count,
        }


class CandleRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def get_by_ticket(self, ticket: int) -> dict[str, list[dict[str, Any]]]:
        rows = self._conn.execute(
            "SELECT timeframe, candles_json FROM trade_candles WHERE ticket = ?",
            (ticket,),
        ).fetchall()
        out: dict[str, list[dict[str, Any]]] = {}
        for r in rows:
            try:
                out[str(r["timeframe"])] = json.loads(r["candles_json"])
            except Exception:
                out[str(r["timeframe"])] = []
        return out

    def upsert(
        self,
        ticket: int,
        timeframe: str,
        candles: list[dict[str, Any]],
        cached_at: int = 0,
    ) -> None:
        ts = cached_at or int(time.time())
        payload = json.dumps(candles)
        self._conn.execute(
            """
            INSERT INTO trade_candles (ticket, timeframe, candles_json, cached_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(ticket, timeframe) DO UPDATE SET
                candles_json=excluded.candles_json,
                cached_at=excluded.cached_at
            """,
            (ticket, timeframe, payload, ts),
        )
