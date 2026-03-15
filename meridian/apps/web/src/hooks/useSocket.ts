import { useEffect, useRef } from "react";
import { useEventStore } from "@/stores/useEventStore";
import { refreshAccessToken } from "@/lib/api";
import type { GeoEvent, WebSocketMessage } from "@/types";

const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
const RECONNECT_BASE_MS = 3000;
const RECONNECT_MAX_MS = 30000;
const MAX_NO_TOKEN_RETRIES = 20;
const MAX_AUTH_FAILURES = 3; // stop retrying if token keeps failing

export function useEventSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);
  const addEvent = useEventStore((s) => s.addEvent);
  const addEvents = useEventStore((s) => s.addEvents);

  // Buffer incoming WebSocket events and flush at most every 250ms
  // to prevent excessive re-renders from rapid-fire event streams
  const pendingEventsRef = useRef<GeoEvent[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let stopped = false;
    let retryCount = 0;
    let noTokenRetries = 0;
    let authFailures = 0;

    function flushPending() {
      flushTimerRef.current = null;
      const batch = pendingEventsRef.current;
      if (batch.length === 0) return;
      pendingEventsRef.current = [];
      addEvents(batch);
    }

    function bufferEvent(event: GeoEvent) {
      pendingEventsRef.current.push(event);
      if (flushTimerRef.current === null) {
        flushTimerRef.current = setTimeout(flushPending, 250);
      }
    }

    async function hydrate() {
      if (hydratedRef.current) return;
      hydratedRef.current = true;
      try {
        const token = localStorage.getItem("access_token");
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const resp = await fetch("/api/v1/events/hydrate?hours_back=48&per_source=200", { headers });
        if (resp.ok) {
          const data: GeoEvent[] = await resp.json();
          if (Array.isArray(data) && data.length) addEvents(data);
        }
      } catch { /* API not ready yet */ }
    }

    function scheduleReconnect() {
      if (stopped) return;
      retryCount++;
      const delay = Math.min(RECONNECT_BASE_MS * Math.pow(1.5, retryCount), RECONNECT_MAX_MS);
      console.info(`[socket] reconnecting in ${Math.round(delay / 1000)}s (attempt ${retryCount})`);
      reconnectTimer.current = setTimeout(connect, delay);
    }

    async function connect() {
      if (stopped) return;

      let token = localStorage.getItem("access_token");
      if (!token) {
        noTokenRetries++;
        if (noTokenRetries > MAX_NO_TOKEN_RETRIES) {
          console.info("[socket] no token after max retries — waiting for login");
          return;
        }
        reconnectTimer.current = setTimeout(connect, RECONNECT_BASE_MS);
        return;
      }
      noTokenRetries = 0;

      // After auth failures, try to refresh the token before reconnecting
      if (authFailures > 0) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          token = newToken;
          authFailures = 0;
        } else {
          // Refresh also failed — clear stale tokens and stop
          if (authFailures >= MAX_AUTH_FAILURES) {
            console.warn("[socket] auth failed after token refresh — clearing tokens, waiting for login");
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            return;
          }
          // Still have retries left — try with existing token anyway
        }
      }

      const ws = new WebSocket(`${WS_URL}/ws/events?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;
      let authenticated = false;

      ws.onopen = () => {
        retryCount = 0;
        // Auth validation happens server-side after open — if 4001 close
        // doesn't fire within 3s, consider it authenticated
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN && !authenticated) {
            authenticated = true;
            authFailures = 0;
            console.info("[socket] connected to event stream");
            hydrate();
          }
        }, 3000);
      };
      ws.onmessage = (e: MessageEvent<string>) => {
        // First successful message confirms auth passed
        if (!authenticated) {
          authenticated = true;
          authFailures = 0;
          console.info("[socket] connected to event stream");
          hydrate();
        }
        try {
          const msg: WebSocketMessage = JSON.parse(e.data);
          if (msg.type === "geo_event" && msg.data) {
            bufferEvent(msg.data);
          }
        } catch {
          /* non-JSON frame, ignore */
        }
      };

      ws.onclose = (e: CloseEvent) => {
        if (stopped) return;

        // Code 4001 = auth failure from our server
        if (e.code === 4001) {
          authFailures++;
          console.warn(`[socket] auth rejected: ${e.reason} (attempt ${authFailures}/${MAX_AUTH_FAILURES})`);
          scheduleReconnect();
          return;
        }

        scheduleReconnect();
      };

      ws.onerror = () => {
        // onerror always fires before onclose — let onclose handle reconnect
      };
    }

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (flushTimerRef.current !== null) clearTimeout(flushTimerRef.current);
      pendingEventsRef.current = [];
      wsRef.current?.close();
    };
  }, [addEvent, addEvents]);
}
