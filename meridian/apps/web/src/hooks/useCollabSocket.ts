/**
 * useCollabSocket — connects to the Meridian collab server for Plan Mode real-time features.
 * Handles: cursor sync, viewport sync, focus following, layer sync, presence tracking.
 *
 * Architecture: The hook manages the WebSocket lifecycle and populates send functions
 * into the Zustand store. Sibling components (e.g. MeridianMap) read from the store
 * to render remote cursors and call send functions to broadcast local state.
 */
import { useEffect, useRef } from "react";
import { create } from "zustand";

// ── Collab state store ──────────────────────────────────────────────────────

export interface RemoteUser {
  userId: string;
  name: string;
  color: string;
  cursor?: { lng: number; lat: number };
  viewport?: { center: [number, number]; zoom: number };
  isBriefer?: boolean;
  lastSeen: number;
}

interface CollabSendFns {
  sendCursor: (lng: number, lat: number) => void;
  sendViewport: (center: [number, number], zoom: number) => void;
  sendLayerSync: (layers: { id: string; enabled: boolean }[]) => void;
  sendFocusFollow: (targetUserId: string | null) => void;
}

interface CollabStore {
  connected: boolean;
  remoteUsers: RemoteUser[];
  followingUserId: string | null;
  syncMode: "independent" | "presenter";

  /** Set by the hook when a followed user sends viewport_sync. Consumed (nulled) by MeridianMap. */
  _followedViewport: { center: [number, number]; zoom: number } | null;
  /** Set by the hook on incoming layer_sync in presenter mode. Consumed by layout store watcher. */
  _pendingLayerSync: { id: string; enabled: boolean }[] | null;

  setConnected: (v: boolean) => void;
  setRemoteUsers: (users: RemoteUser[]) => void;
  updateCursor: (userId: string, lng: number, lat: number) => void;
  updateViewport: (userId: string, center: [number, number], zoom: number) => void;
  setFollowing: (userId: string | null) => void;
  setSyncMode: (mode: "independent" | "presenter") => void;
  _setFollowedViewport: (v: { center: [number, number]; zoom: number } | null) => void;
  _setPendingLayerSync: (v: { id: string; enabled: boolean }[] | null) => void;

  // Send functions — populated when WS is open, null when disconnected
  _sendCursor: ((lng: number, lat: number) => void) | null;
  _sendViewport: ((center: [number, number], zoom: number) => void) | null;
  _sendLayerSync: ((layers: { id: string; enabled: boolean }[]) => void) | null;
  _sendFocusFollow: ((targetUserId: string | null) => void) | null;
  _setSendFns: (fns: CollabSendFns | null) => void;
}

export const useCollabStore = create<CollabStore>((set) => ({
  connected: false,
  remoteUsers: [],
  followingUserId: null,
  syncMode: "independent",
  _followedViewport: null,
  _pendingLayerSync: null,

  setConnected: (v) => set({ connected: v }),
  setRemoteUsers: (users) => set({ remoteUsers: users }),
  updateCursor: (userId, lng, lat) =>
    set((s) => ({
      remoteUsers: s.remoteUsers.map((u) =>
        u.userId === userId ? { ...u, cursor: { lng, lat }, lastSeen: Date.now() } : u
      ),
    })),
  updateViewport: (userId, center, zoom) =>
    set((s) => ({
      remoteUsers: s.remoteUsers.map((u) =>
        u.userId === userId ? { ...u, viewport: { center, zoom }, lastSeen: Date.now() } : u
      ),
    })),
  setFollowing: (userId) => set({ followingUserId: userId }),
  setSyncMode: (mode) => set({ syncMode: mode }),
  _setFollowedViewport: (v) => set({ _followedViewport: v }),
  _setPendingLayerSync: (v) => set({ _pendingLayerSync: v }),

  _sendCursor: null,
  _sendViewport: null,
  _sendLayerSync: null,
  _sendFocusFollow: null,
  _setSendFns: (fns) =>
    set({
      _sendCursor: fns?.sendCursor ?? null,
      _sendViewport: fns?.sendViewport ?? null,
      _sendLayerSync: fns?.sendLayerSync ?? null,
      _sendFocusFollow: fns?.sendFocusFollow ?? null,
    }),
}));

// ── JWT helper ──────────────────────────────────────────────────────────────

/** Decode JWT payload from localStorage to get user identity for collab. */
export function getCollabIdentity(): { userId: string; email: string } {
  try {
    const token = localStorage.getItem("access_token");
    if (!token) return { userId: `anon-${Math.random().toString(36).slice(2, 8)}`, email: "anonymous" };
    const payload = JSON.parse(atob(token.split(".")[1]));
    return { userId: String(payload.sub ?? "0"), email: payload.email ?? "user" };
  } catch {
    return { userId: `anon-${Math.random().toString(36).slice(2, 8)}`, email: "anonymous" };
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────

interface UseCollabSocketOptions {
  roomId: number | null;
  userId: string;
  userName: string;
  userColor?: string;
}

export function useCollabSocket({
  roomId,
  userId,
  userName,
  userColor = "hsl(120,70%,55%)",
}: UseCollabSocketOptions) {
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  useEffect(() => {
    const store = useCollabStore.getState();
    if (!roomId) {
      store.setConnected(false);
      store._setSendFns(null);
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname;
    const port = 1234;
    const url = `${protocol}//${host}:${port}/room-${roomId}?userId=${userId}&name=${encodeURIComponent(userName)}&color=${encodeURIComponent(userColor)}`;

    const ws = new WebSocket(url);

    ws.onopen = () => {
      useCollabStore.getState().setConnected(true);
      useCollabStore.getState()._setSendFns({
        sendCursor: (lng, lat) => {
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: "cursor_move", lng, lat }));
        },
        sendViewport: (center, zoom) => {
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: "viewport_sync", center, zoom }));
        },
        sendLayerSync: (layers) => {
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: "layer_sync", layers }));
        },
        sendFocusFollow: (targetUserId) => {
          if (ws.readyState === WebSocket.OPEN && targetUserId)
            ws.send(JSON.stringify({ type: "focus_follow", targetUserId }));
          useCollabStore.getState().setFollowing(targetUserId);
        },
      });
    };

    ws.onclose = () => {
      const s = useCollabStore.getState();
      s.setConnected(false);
      s.setRemoteUsers([]);
      s._setSendFns(null);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const s = useCollabStore.getState();
        const uid = userIdRef.current;

        switch (msg.type) {
          case "presence_list":
            s.setRemoteUsers(
              (msg.users as RemoteUser[]).filter((u) => u.userId !== uid)
            );
            break;

          case "cursor_move":
            if (msg.userId !== uid) {
              s.updateCursor(msg.userId, msg.lng, msg.lat);
            }
            break;

          case "viewport_sync":
            if (msg.userId !== uid) {
              s.updateViewport(msg.userId, msg.center, msg.zoom);
              if (s.followingUserId === msg.userId) {
                s._setFollowedViewport({ center: msg.center, zoom: msg.zoom });
              }
            }
            break;

          case "layer_sync":
            if (msg.userId !== uid && s.syncMode === "presenter") {
              s._setPendingLayerSync(msg.layers);
            }
            break;
        }
      } catch {
        // Binary Yjs frame — ignore
      }
    };

    return () => {
      ws.close();
      const s = useCollabStore.getState();
      s.setConnected(false);
      s.setRemoteUsers([]);
      s._setSendFns(null);
    };
  }, [roomId, userId, userName, userColor]);
}
