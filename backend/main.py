import os
import asyncio
import json
import time
from typing import Optional, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend.database import (
    init_db,
    upsert_account,
    get_all_accounts,
    get_account_by_login,
    upsert_deals,
    get_deals_by_account,
    save_snapshots,
    append_snapshot,
    get_trade_notes,
    upsert_trade_note,
)
from backend.mt5_service import mt5_service
from backend.analytics import process_portfolio_analytics

from contextlib import asynccontextmanager

# Active account state
CURRENT_ACTIVE_LOGIN: Optional[int] = None

# Connected WebSocket clients
connected_clients: List[WebSocket] = []

def perform_sync(account_login: Optional[int] = None):
    """Syncs data from MT5 or simulation into database."""
    global CURRENT_ACTIVE_LOGIN
    if not mt5_service.is_connected():
        existing = get_all_accounts()
        if existing:
            if CURRENT_ACTIVE_LOGIN is None:
                CURRENT_ACTIVE_LOGIN = existing[0]["login"]
            return

    acc_info = mt5_service.get_account_info()
    if not acc_info:
        return

    upsert_account(acc_info)
    login = acc_info["login"]
    if CURRENT_ACTIVE_LOGIN is None:
        CURRENT_ACTIVE_LOGIN = login

    deals = mt5_service.get_history_deals()
    if deals:
        upsert_deals(deals)

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    perform_sync()
    broadcast_task = asyncio.create_task(background_live_broadcaster())
    yield
    broadcast_task.cancel()

app = FastAPI(title="MetaTrader 5 Portfolio Viewer API", version="1.0.0", lifespan=lifespan)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def background_live_broadcaster():
    """Periodically broadcasts live equity and open trades to WebSockets."""
    last_snapshot_ts = 0
    while True:
        try:
            now_ts = int(time.time())
            is_conn = mt5_service.is_connected()
            if is_conn and (now_ts - last_snapshot_ts >= 60):
                acc_snap = mt5_service.get_account_info()
                if acc_snap:
                    append_snapshot(acc_snap["login"], {
                        "timestamp": now_ts,
                        "balance": acc_snap["balance"],
                        "equity": acc_snap["equity"],
                        "growth_pct": 0.0,
                        "drawdown_pct": 0.0,
                        "cumulative_r": 0.0,
                    })
                    last_snapshot_ts = now_ts

            if connected_clients:
                acc_info = mt5_service.get_account_info()
                open_pos = mt5_service.get_open_positions()
                if acc_info:
                    payload = {
                        "type": "live_update",
                        "account": {
                            "login": acc_info["login"],
                            "balance": acc_info["balance"],
                            "equity": acc_info["equity"],
                            "margin": acc_info["margin"],
                            "free_margin": acc_info["free_margin"],
                            "is_connected": is_conn
                        },
                        "open_positions": open_pos,
                        "timestamp": now_ts
                    }
                    message = json.dumps(payload)
                    for client in list(connected_clients):
                        try:
                            await client.send_text(message)
                        except Exception:
                            connected_clients.remove(client)
        except Exception as e:
            print(f"[WebSocket Broadcast Error] {e}")
        await asyncio.sleep(1.0)

# ----------------- REST Endpoints -----------------

@app.get("/api/accounts")
def list_accounts():
    accounts = get_all_accounts()
    return {
        "accounts": accounts,
        "active_login": CURRENT_ACTIVE_LOGIN,
        "is_mt5_connected": mt5_service.is_connected()
    }

@app.post("/api/accounts/switch")
def switch_account(login: int = Query(...)):
    global CURRENT_ACTIVE_LOGIN
    acc = get_account_by_login(login)
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    CURRENT_ACTIVE_LOGIN = login
    return {"status": "ok", "active_login": login}

@app.post("/api/sync")
def trigger_sync():
    perform_sync()
    return {
        "status": "synchronized",
        "active_login": CURRENT_ACTIVE_LOGIN,
        "is_mt5_connected": mt5_service.is_connected()
    }

class TradeNotePayload(BaseModel):
    ticket: int
    account_id: int
    note: str = ""
    setup_tag: str = ""
    mistake_tag: str = ""


@app.post("/api/trades/note")
def save_trade_note(payload: TradeNotePayload):
    upsert_trade_note(
        ticket=payload.ticket,
        account_id=payload.account_id,
        note=payload.note,
        setup_tag=payload.setup_tag,
        mistake_tag=payload.mistake_tag,
        updated_at=int(time.time()),
    )
    return {"status": "ok", "ticket": payload.ticket}


@app.get("/api/portfolio")
def get_portfolio(
    start_time: Optional[int] = Query(None),
    end_time: Optional[int] = Query(None),
    risk_pct: Optional[float] = Query(0.01),
    scope: Optional[str] = Query("all"),
    symbol: Optional[str] = Query(None),
    direction: Optional[str] = Query(None),
    comment: Optional[str] = Query(None),
    magic: Optional[int] = Query(None),
    all_accounts: Optional[bool] = Query(False),
):
    global CURRENT_ACTIVE_LOGIN
    if CURRENT_ACTIVE_LOGIN is None:
        perform_sync()

    notes_map: dict = {}
    if all_accounts:
        accounts = get_all_accounts()
        deals = []
        total_bal = 0.0
        total_eq = 0.0
        total_margin = 0.0
        total_free = 0.0
        for a in accounts:
            total_bal += float(a.get("balance", 0.0) or 0.0)
            total_eq += float(a.get("equity", 0.0) or 0.0)
            total_margin += float(a.get("margin", 0.0) or 0.0)
            total_free += float(a.get("free_margin", 0.0) or 0.0)
            deals.extend(get_deals_by_account(a["login"]))
            notes_map.update(get_trade_notes(a["login"]))
        acc = {
            "login": 0,
            "broker": "Combined Portfolio",
            "name": f"All Accounts ({len(accounts)})",
            "currency": accounts[0].get("currency", "USD") if accounts else "USD",
            "leverage": accounts[0].get("leverage", 100) if accounts else 100,
            "balance": round(total_bal, 2),
            "equity": round(total_eq, 2),
            "margin": round(total_margin, 2),
            "free_margin": round(total_free, 2),
            "is_demo": 0,
        }
    else:
        acc = get_account_by_login(CURRENT_ACTIVE_LOGIN) if CURRENT_ACTIVE_LOGIN else None
        if not acc:
            acc = mt5_service.get_account_info() or {
                "login": 0, "broker": "Unknown", "name": "No Account", "balance": 0.0, "equity": 0.0
            }

        deals = get_deals_by_account(acc.get("login", 0))
        if not deals:
            # Fetch directly if db is empty
            deals = mt5_service.get_history_deals()
            if deals:
                upsert_deals(deals)
        notes_map = get_trade_notes(acc.get("login", 0))

    analytics_result = process_portfolio_analytics(
        deals=deals,
        current_account=acc,
        start_time=start_time,
        end_time=end_time,
        default_risk_pct=risk_pct or 0.01,
        trade_scope=scope or "all",
        symbol=symbol,
        direction=direction,
        comment=comment,
        magic=magic,
    )
    for t in analytics_result.get("closed_trades", []):
        n = notes_map.get(int(t.get("ticket", 0)))
        if n:
            t["note"] = n.get("note", "")
            t["setup_tag"] = n.get("setup_tag", "")
            t["mistake_tag"] = n.get("mistake_tag", "")
    return analytics_result

@app.get("/api/trades/open")
def get_open_trades():
    acc_info = mt5_service.get_account_info()
    if acc_info and CURRENT_ACTIVE_LOGIN is not None and acc_info.get("login") != CURRENT_ACTIVE_LOGIN:
        return {
            "positions": [],
            "is_mt5_connected": mt5_service.is_connected()
        }
    return {
        "positions": mt5_service.get_open_positions(),
        "is_mt5_connected": mt5_service.is_connected()
    }

@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.append(websocket)
    try:
        while True:
            # Keepalive receiver
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        if websocket in connected_clients:
            connected_clients.remove(websocket)

# ----------------- Serve Frontend Dist -----------------
FRONTEND_DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")

if os.path.exists(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
