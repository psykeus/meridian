import * as http from "http";
import * as dotenv from "dotenv";
import { WebSocketServer } from "ws";
import { setupWSConnection } from "y-websocket/bin/utils";

dotenv.config();

const PORT = parseInt(process.env.PORT ?? "1234", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

const server = http.createServer((_req, res) => {
  if (_req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "meridian-collab" }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const roomName = url.pathname.slice(1) || "default";

  console.log(`[collab] client connected to room: ${roomName}`);

  setupWSConnection(ws, req, { docName: roomName, gc: true });

  ws.on("close", () => {
    console.log(`[collab] client disconnected from room: ${roomName}`);
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
