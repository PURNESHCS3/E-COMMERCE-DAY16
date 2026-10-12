import logging
from collections import defaultdict

from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect


logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.user_connections: dict[int, set[WebSocket]] = defaultdict(set)
        self.admin_connections: set[WebSocket] = set()
        self.connection_users: dict[WebSocket, tuple[int, str]] = {}

    def connect(self, websocket: WebSocket, user_id: int, role: str) -> None:
        self.connection_users[websocket] = (user_id, role)
        self.user_connections[user_id].add(websocket)
        if role == "admin":
            self.admin_connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        identity = self.connection_users.pop(websocket, None)
        if identity is None:
            return

        user_id, role = identity
        connections = self.user_connections[user_id]
        connections.discard(websocket)
        if not connections:
            del self.user_connections[user_id]
        if role == "admin":
            self.admin_connections.discard(websocket)

    async def send_to_user(self, user_id: int, message: dict) -> None:
        await self._send(self.user_connections.get(user_id, set()), message)

    async def send_to_admins(self, message: dict) -> None:
        await self._send(self.admin_connections, message)

    async def _send(self, connections: set[WebSocket], message: dict) -> None:
        for websocket in list(connections):
            try:
                await websocket.send_json(message)
            except (WebSocketDisconnect, RuntimeError, OSError):
                logger.info("Removing a disconnected WebSocket client")
                self.disconnect(websocket)


manager = ConnectionManager()
