import os
import asyncio
import json
import time
from typing import Optional, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.database import (
    init_db,
    upsert_account,
    get_all_accounts,
    get_account_by_login,
    upsert_deals,
    get_deals_by_account,
    save_snapshots
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
    while True:
        try:
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
                            "is_connected": mt5_service.is_connected()
                        },
                        "open_positions": open_pos,
                        "timestamp": int(time.time())
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

@app.get("/api/portfolio")
def get_portfolio(
    start_time: Optional[int] = Query(None),
    end_time: Optional[int] = Query(None),
    risk_pct: Optional[float] = Query(0.01),
    scope: Optional[str] = Query("all")
):
    global CURRENT_ACTIVE_LOGIN
    if CURRENT_ACTIVE_LOGIN is None:
        perform_sync()

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

    analytics_result = process_portfolio_analytics(
        deals=deals,
        current_account=acc,
        start_time=start_time,
        end_time=end_time,
        default_risk_pct=risk_pct or 0.01,
        trade_scope=scope or "all"
    )
    return analytics_result

@app.get("/api/trades/open")
def get_open_trades():
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
