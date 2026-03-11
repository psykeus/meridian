import { create } from "zustand";

export interface AlertNotification {
  id: number;
  rule_id?: number;
  title: string;
  body?: string;
  severity: string;
  source_event_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface AlertRule {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
  condition_type: string;
  condition_params: Record<string, unknown>;
  delivery_channels: string[];
  trigger_count: number;
  last_triggered?: string;
  created_at: string;
}

interface AlertStore {
  notifications: AlertNotification[];
  rules: AlertRule[];
  unreadCount: number;
  isNotificationPanelOpen: boolean;

  setNotifications: (n: AlertNotification[]) => void;
  setRules: (r: AlertRule[]) => void;
  markRead: (id: number) => void;
  markAllRead: () => void;
  addNotification: (n: AlertNotification) => void;
  toggleNotificationPanel: () => void;
  fetchNotifications: () => Promise<void>;
  fetchRules: () => Promise<void>;
}

export const useAlertStore = create<AlertStore>((set, get) => ({
  notifications: [],
  rules: [],
  unreadCount: 0,
  isNotificationPanelOpen: false,

  setNotifications: (notifications) =>
    set({ notifications, unreadCount: notifications.filter((n) => !n.is_read).length }),

  setRules: (rules) => set({ rules }),

  markRead: (id) =>
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true } : n
      );
      return { notifications, unreadCount: notifications.filter((n) => !n.is_read).length };
    }),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    })),

  addNotification: (n) =>
    set((state) => ({
      notifications: [n, ...state.notifications],
      unreadCount: state.unreadCount + (n.is_read ? 0 : 1),
    })),

  toggleNotificationPanel: () =>
    set((state) => ({ isNotificationPanelOpen: !state.isNotificationPanelOpen })),

  fetchNotifications: async () => {
    try {
      const resp = await fetch("/api/v1/alerts/notifications?limit=50", {
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        get().setNotifications(data);
      }
    } catch {}
  },

  fetchRules: async () => {
    try {
      const resp = await fetch("/api/v1/alerts/rules", {
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        get().setRules(data);
      }
    } catch {}
  },
}));
