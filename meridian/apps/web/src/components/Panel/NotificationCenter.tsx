import { useEffect, useState } from "react";
import { useAlertStore } from "@/stores/useAlertStore";
import { SEVERITY_COLOR, timeAgo } from "@/lib/utils";

interface AnomalyInsight {
  type: string;
  title: string;
  description: string;
  severity: string;
  detected_at: string;
  lat?: number;
  lng?: number;
}

export function NotificationCenter() {
  const {
    notifications,
    unreadCount,
    isNotificationPanelOpen,
    toggleNotificationPanel,
    markRead,
    markAllRead,
    fetchNotifications,
  } = useAlertStore();

  const [anomalies, setAnomalies] = useState<AnomalyInsight[]>([]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Fetch AI anomaly insights
  useEffect(() => {
    const fetchAnomalies = async () => {
      try {
        const resp = await fetch("/ai/anomalies");
        if (resp.ok) setAnomalies(await resp.json());
      } catch { /* AI service may be offline */ }
    };
    fetchAnomalies();
    const interval = setInterval(fetchAnomalies, 60000);
    return () => clearInterval(interval);
  }, []);

  // Listen for keyboard shortcut toggle
  useEffect(() => {
    const handler = () => toggleNotificationPanel();
    document.addEventListener("meridian:toggle-notifications", handler);
    return () => document.removeEventListener("meridian:toggle-notifications", handler);
  }, [toggleNotificationPanel]);

  const totalUnread = unreadCount + anomalies.length;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={toggleNotificationPanel}
        title="Notifications"
        style={{
          position: "relative", background: "none", border: "none",
          cursor: "pointer", color: "var(--text-muted)", fontSize: 16,
          padding: "0 2px",
        }}
      >
        ⚑
        {totalUnread > 0 && (
          <span
            style={{
              position: "absolute", top: -4, right: -4,
              background: "var(--red-critical)", color: "#fff",
              borderRadius: "50%", width: 14, height: 14,
              fontSize: 9, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </button>

      {isNotificationPanelOpen && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 49 }}
            onClick={toggleNotificationPanel}
          />
          <div
            style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0,
              width: 340, maxHeight: 480,
              background: "var(--bg-panel)", border: "1px solid var(--border)",
              borderRadius: 6, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              zIndex: 50, display: "flex", flexDirection: "column", overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 12px", borderBottom: "1px solid var(--border)",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                Notifications {totalUnread > 0 && <span style={{ color: "var(--red-critical)" }}>({totalUnread})</span>}
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  style={{ fontSize: 10, color: "var(--green-primary)", background: "none", border: "none", cursor: "pointer" }}
                >
                  Mark all read
                </button>
              )}
            </div>

            <div style={{ overflowY: "auto", flex: 1 }}>
              {/* AI Anomaly Insights */}
              {anomalies.length > 0 && (
                <>
                  <div style={{ padding: "6px 12px", fontSize: 9, fontWeight: 700, color: "#bb86fc", textTransform: "uppercase", letterSpacing: "0.07em", background: "rgba(187,134,252,.06)" }}>
                    AI Insights
                  </div>
                  {anomalies.slice(0, 5).map((a, i) => (
                    <div
                      key={`anomaly-${i}`}
                      style={{
                        display: "flex", gap: 10, padding: "10px 12px",
                        borderBottom: "1px solid var(--border)",
                        background: "rgba(187,134,252,.04)",
                      }}
                    >
                      <div style={{ width: 3, borderRadius: 2, background: "#bb86fc", flexShrink: 0, alignSelf: "stretch" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                          <span style={{ fontSize: 10, color: "#bb86fc", fontWeight: 700 }}>✦</span>
                          <span style={{ fontSize: 12, color: "var(--text-primary)" }}>{a.title}</span>
                        </div>
                        {a.description && (
                          <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {a.description}
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                          {a.detected_at ? timeAgo(a.detected_at) : "Just detected"}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Regular Notifications */}
              {notifications.length === 0 && anomalies.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
                  No notifications
                </div>
              ) : (
                notifications.map((n) => {
                  const color = SEVERITY_COLOR[n.severity as keyof typeof SEVERITY_COLOR] ?? "#448aff";
                  return (
                    <div
                      key={n.id}
                      onClick={() => { if (!n.is_read) markRead(n.id); }}
                      style={{
                        display: "flex", gap: 10, padding: "10px 12px",
                        borderBottom: "1px solid var(--border)",
                        background: n.is_read ? "transparent" : "var(--bg-hover)",
                        cursor: n.is_read ? "default" : "pointer",
                      }}
                    >
                      <div style={{ width: 3, borderRadius: 2, background: n.is_read ? "var(--border)" : color, flexShrink: 0, alignSelf: "stretch" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: "var(--text-primary)", marginBottom: 2 }}>{n.title}</div>
                        {n.body && <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.body}</div>}
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{timeAgo(n.created_at)}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
