import * as http from "http";
import * as crypto from "crypto";
import * as dotenv from "dotenv";
import { WebSocketServer, WebSocket } from "ws";
import { setupWSConnection } from "y-websocket/bin/utils";

dotenv.config();

const PORT = parseInt(process.env.PORT ?? "1234", 10);
const HOST = process.env.HOST ?? "0.0.0.0";
const SECRET_KEY = process.env.SECRET_KEY ?? "";
const JWT_ALGORITHM = process.env.JWT_ALGORITHM ?? "HS256";

/**
 * Minimal JWT validation — verifies HS256 signature and expiry.
 * Returns the decoded payload or null if invalid.
 */
function verifyJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    if (header.alg !== JWT_ALGORITHM) return null;

    const signingInput = `${parts[0]}.${parts[1]}`;
    const signature = Buffer.from(parts[2], "base64url");
    const expected = crypto.createHmac("sha256", SECRET_KEY).update(signingInput).digest();
    if (!crypto.timingSafeEqual(signature, expected)) return null;

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.type !== "access") return null;

    return payload;
  } catch {
    return null;
  }
}

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
  const token = url.searchParams.get("token") ?? "";

  // Authenticate: require a valid JWT
  const jwtPayload = verifyJwt(token);
  if (!jwtPayload) {
    console.log(`[collab] rejected unauthenticated connection to room: ${roomName}`);
    ws.close(4001, "Authentication required");
    return;
  }

  const userId = String(jwtPayload.sub ?? url.searchParams.get("userId") ?? "unknown");
  const userName = url.searchParams.get("name") ?? String(jwtPayload.email ?? "Anonymous");
  const userColor = url.searchParams.get("color") ?? `hsl(${Math.floor(Math.random() * 360)},70%,55%)`;

  console.log(`[collab] ${userName} (${userId}) connected to room: ${roomName}`);

  if (!rooms.has(roomName)) rooms.set(roomName, new Map());
  const room = rooms.get(roomName)!;

  // Deduplicate: close old socket if same userId reconnects
  const existing = room.get(userId);
  if (existing && existing.ws.readyState === WebSocket.OPEN) {
    existing.ws.close(4002, "Replaced by new connection");
  }

  const presence: Presence = { userId, name: userName, color: userColor, lastSeen: Date.now() };
  room.set(userId, { ws, presence });

  setupWSConnection(ws, req, { docName: roomName, gc: true });

  broadcastPresenceList(roomName);

  ws.on("pong", () => { presence.lastSeen = Date.now(); });

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
    } catch (err) {
      // Binary Yjs frames will fail JSON.parse — this is expected.
      // Log only unexpected errors.
      if (typeof data === "string") {
        console.warn(`[collab] message parse error in room ${roomName}:`, err);
      }
    }
  });

  ws.on("close", () => {
    console.log(`[collab] ${userName} disconnected from room: ${roomName}`);
    room.delete(userId);
    if (room.size === 0) rooms.delete(roomName);
    else broadcastPresenceList(roomName);
  });
});

// Heartbeat: detect and clean up stale connections every 30s
const HEARTBEAT_INTERVAL = 30_000;
const STALE_THRESHOLD = 90_000; // 90s without activity = stale

setInterval(() => {
  for (const [roomName, room] of rooms) {
    const now = Date.now();
    for (const [uid, { ws, presence }] of room) {
      if (now - presence.lastSeen > STALE_THRESHOLD) {
        console.log(`[collab] cleaning stale connection: ${uid} in ${roomName}`);
        ws.terminate();
        room.delete(uid);
      } else if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }
    if (room.size === 0) rooms.delete(roomName);
    else broadcastPresenceList(roomName);
  }
}, HEARTBEAT_INTERVAL);

server.listen(PORT, HOST, () => {
  console.log(`[collab] Yjs WebSocket server running on ${HOST}:${PORT}`);
});

process.on("SIGTERM", () => {
  console.log("[collab] shutting down...");
  wss.close();
  server.close(() => process.exit(0));
});
