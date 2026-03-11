import * as http from "http";
import * as dotenv from "dotenv";
import { WebSocketServer, WebSocket } from "ws";
import { setupWSConnection } from "y-websocket/bin/utils";

dotenv.config();

const PORT = parseInt(process.env.PORT ?? "1234", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

interface Presence {
  userId: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number };
  viewport?: { center: [number, number]; zoom: number };
  isBriefer?: boolean;
  lastSeen: number;
}

const rooms = new Map<string, Map<string, { ws: WebSocket; presence: Presence }>>();

function broadcastToRoom(roomName: string, msg: object, excludeId?: string) {
  const room = rooms.get(roomName);
  if (!room) return;
  const payload = JSON.stringify(msg);
  for (const [id, { ws }] of room) {
    if (id !== excludeId && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function broadcastPresenceList(roomName: string) {
  const room = rooms.get(roomName);
  if (!room) return;
  const presenceList = Array.from(room.values()).map(({ presence }) => presence);
  broadcastToRoom(roomName, { type: "presence_list", users: presenceList });
}

const server = http.createServer((_req, res) => {
  if (_req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "meridian-collab", rooms: rooms.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const roomName = url.pathname.slice(1) || "default";
  const userId = url.searchParams.get("userId") ?? `anon-${Math.random().toString(36).slice(2, 8)}`;
  const userName = url.searchParams.get("name") ?? "Anonymous";
  const userColor = url.searchParams.get("color") ?? `hsl(${Math.floor(Math.random() * 360)},70%,55%)`;

  console.log(`[collab] ${userName} (${userId}) connected to room: ${roomName}`);

  if (!rooms.has(roomName)) rooms.set(roomName, new Map());
  const room = rooms.get(roomName)!;

  const presence: Presence = { userId, name: userName, color: userColor, lastSeen: Date.now() };
  room.set(userId, { ws, presence });

  setupWSConnection(ws, req, { docName: roomName, gc: true });

  broadcastPresenceList(roomName);

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "cursor_move") {
        presence.cursor = { x: msg.x, y: msg.y };
        presence.lastSeen = Date.now();
        broadcastToRoom(roomName, { type: "cursor_move", userId, name: userName, color: userColor, x: msg.x, y: msg.y }, userId);
      } else if (msg.type === "viewport_sync") {
        presence.viewport = { center: msg.center, zoom: msg.zoom };
        broadcastToRoom(roomName, { type: "viewport_sync", userId, name: userName, center: msg.center, zoom: msg.zoom, isBriefer: msg.isBriefer }, userId);
      } else if (msg.type === "pointer_broadcast") {
        broadcastToRoom(roomName, { type: "pointer_broadcast", userId, name: userName, color: userColor, x: msg.x, y: msg.y });
      } else if (msg.type === "focus_follow") {
        broadcastToRoom(roomName, { type: "focus_follow", targetUserId: msg.targetUserId, followerId: userId });
      } else if (msg.type === "layer_sync") {
        broadcastToRoom(roomName, { type: "layer_sync", layers: msg.layers, userId, mode: msg.mode }, userId);
      } else if (msg.type === "briefing_mode") {
        presence.isBriefer = msg.active;
        broadcastPresenceList(roomName);
        broadcastToRoom(roomName, { type: "briefing_mode", userId, name: userName, active: msg.active }, userId);
      }
    } catch {}
  });

  ws.on("close", () => {
    console.log(`[collab] ${userName} disconnected from room: ${roomName}`);
    room.delete(userId);
    if (room.size === 0) rooms.delete(roomName);
    else broadcastPresenceList(roomName);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[collab] Yjs WebSocket server running on ${HOST}:${PORT}`);
});

process.on("SIGTERM", () => {
  console.log("[collab] shutting down...");
  wss.close();
  server.close(() => process.exit(0));
});
