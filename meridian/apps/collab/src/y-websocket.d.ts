declare module "y-websocket/bin/utils" {
  import { WebSocket } from "ws";
  import * as http from "http";
  export function setupWSConnection(
    conn: WebSocket,
    req: http.IncomingMessage,
    opts?: { docName?: string; gc?: boolean }
  ): void;
}
