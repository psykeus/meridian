import { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

interface FeedStatus {
  source_id: string;
  display_name: string;
  status: "healthy" | "stale" | "error" | "disabled";
  last_success: string | null;
  last_error: string | null;
  event_count_last_run: number;
  avg_latency_ms: number | null;
}

const STATUS_COLOR: Record<string, string> = {
  healthy: "var(--green-primary)",
  stale: "var(--orange-warning)",
  error: "var(--red-critical)",
  disabled: "var(--text-muted)",
};

const STATUS_DOT: Record<string, string> = {
  healthy: "#00e676",
  stale: "#ff9800",
  error: "#f44336",
  disabled: "#666",
};

export function StatusPage() {
  const [feeds, setFeeds] = useState<FeedStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState(new Date());

  const fetchStatus = async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/v1/feeds/health`);
      if (resp.ok) {
        const data = await resp.json();
        setFeeds(Array.isArray(data) ? data : data.feeds || []);
        setLastChecked(new Date());
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const healthy = feeds.filter((f) => f.status === "healthy").length;
  const degraded = feeds.filter((f) => f.status === "stale").length;
  const down = feeds.filter((f) => f.status === "error").length;
  const overall = down > 3 ? "partial_outage" : down > 0 ? "degraded" : "operational";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-app)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "var(--bg-panel)", borderBottom: "1px solid var(--border)", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: overall === "operational" ? "#00e676" : overall === "degraded" ? "#ff9800" : "#f44336" }} />
          <span style={{ fontWeight: 700, fontSize: 18 }}>Meridian System Status</span>
        </div>
        <a href="/" style={{ color: "var(--text-muted)", fontSize: 12, textDecoration: "none" }}>← Back to platform</a>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        {/* Overall Status Banner */}
        <div style={{
          background: overall === "operational" ? "rgba(0,230,118,0.1)" : overall === "degraded" ? "rgba(255,152,0,0.1)" : "rgba(244,67,54,0.1)",
          border: `1px solid ${overall === "operational" ? "rgba(0,230,118,0.3)" : overall === "degraded" ? "rgba(255,152,0,0.3)" : "rgba(244,67,54,0.3)"}`,
          borderRadius: 12, padding: "20px 24px", marginBottom: 32, display: "flex", alignItems: "center", gap: 16,
        }}>
          <div style={{ fontSize: 32 }}>{overall === "operational" ? "✅" : overall === "degraded" ? "⚠️" : "🔴"}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 20, color: overall === "operational" ? "#00e676" : overall === "degraded" ? "#ff9800" : "#f44336" }}>
              {overall === "operational" ? "All Systems Operational" : overall === "degraded" ? "Partial Degradation" : "Partial Outage"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Last checked: {lastChecked.toUTCString()}</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 20, textAlign: "center" }}>
            {[["Healthy", healthy, "#00e676"], ["Degraded", degraded, "#ff9800"], ["Down", down, "#f44336"]].map(([label, count, color]) => (
              <div key={String(label)}>
                <div style={{ fontSize: 22, fontWeight: 700, color: String(color) }}>{count}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Feed Status Grid */}
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>
            Data Feeds ({feeds.length})
          </h2>
          <button onClick={fetchStatus} style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)", cursor: "pointer" }}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>Loading feed status…</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {feeds.map((feed) => (
              <div key={feed.source_id} style={{
                background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8,
                padding: "12px 16px", display: "flex", alignItems: "center", gap: 12,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_DOT[feed.status] || "#666", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{feed.display_name || feed.source_id}</div>
                  {feed.last_error && feed.status === "error" && (
                    <div style={{ fontSize: 10, color: "#f44336", marginTop: 2 }}>{feed.last_error.slice(0, 80)}</div>
                  )}
                </div>
                <div style={{ textAlign: "right", fontSize: 11 }}>
                  <div style={{ color: STATUS_COLOR[feed.status] || "var(--text-muted)", fontWeight: 600 }}>
                    {feed.status.toUpperCase()}
                  </div>
                  {feed.avg_latency_ms && (
                    <div style={{ color: "var(--text-muted)", marginTop: 2 }}>{Math.round(feed.avg_latency_ms)}ms avg</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 48, textAlign: "center", fontSize: 11, color: "var(--text-muted)" }}>
          Meridian — Open-source global situational awareness platform · All data sources are free and publicly accessible
        </div>
      </div>
    </div>
  );
}
