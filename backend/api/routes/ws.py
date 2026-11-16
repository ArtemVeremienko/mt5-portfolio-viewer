from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.services.live_broadcaster import ConnectionManager

router = APIRouter(tags=["ws"])


@router.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket) -> None:
    manager: ConnectionManager = websocket.app.state.ws_manager
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
