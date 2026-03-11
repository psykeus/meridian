import { useEffect, useRef } from "react";
import { useEventStore } from "@/stores/useEventStore";
import type { WebSocketMessage } from "@/types";

const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
const RECONNECT_DELAY_MS = 3000;

export function useEventSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addEvent = useEventStore((s) => s.addEvent);

  useEffect(() => {
    let stopped = false;

    function connect() {
      if (stopped) return;

      const ws = new WebSocket(`${WS_URL}/ws/events`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.info("[socket] connected to event stream");
      };

      ws.onmessage = (e: MessageEvent<string>) => {
        try {
          const msg: WebSocketMessage = JSON.parse(e.data);
          if (msg.type === "geo_event" && msg.data) {
            addEvent(msg.data);
          }
        } catch {
          /* non-JSON frame, ignore */
        }
      };

      ws.onclose = () => {
        if (stopped) return;
        console.info("[socket] disconnected — reconnecting in 3s");
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [addEvent]);
}
