import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/utils";

interface FeedHealth {
  name: string;
  status: "healthy" | "degraded" | "error" | "unknown";
  last_success?: string;
  last_error?: string;
  fetch_count: number;
  error_count: number;
  avg_latency_ms?: number;
}

export function FeedHealthPage() {
  const [feeds, setFeeds] = useState<Record<string, FeedHealth>>({});
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchHealth = async () => {
    try {
      const resp = await fetch("/api/v1/feeds/health");
      if (resp.ok) {
        const data = await resp.json();
        setFeeds(data);
        setLastRefresh(new Date());
      }
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchHealth();
    const timer = setInterval(fetchHealth, 30_000);
    return () => clearInterval(timer);
  }, []);

  const entries = Object.entries(feeds);
  const healthyCount = entries.filter(([, v]) => v.status === "healthy").length;
  const degradedCount = entries.filter(([, v]) => v.status === "degraded").length;
  const errorCount = entries.filter(([, v]) => v.status === "error").length;

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Feed Health Monitor</h1>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              Last refreshed {timeAgo(lastRefresh.toISOString())} · Auto-refreshes every 30s
            </div>
          </div>
          <button
            onClick={fetchHealth}
            style={{ padding: "6px 14px", borderRadius: 4, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 12, cursor: "pointer" }}
          >
            Refresh
          </button>
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
          <StatCard label="Healthy" value={healthyCount} color="var(--green-primary)" />
          <StatCard label="Degraded" value={degradedCount} color="var(--orange-warning)" />
          <StatCard label="Error" value={errorCount} color="var(--red-critical)" />
          <StatCard label="Total Feeds" value={entries.length} color="var(--text-secondary)" />
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 12 }}>Loading feed health data…</div>
        ) : (
          <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Feed", "Status", "Last Success", "Fetches", "Errors", "Avg Latency"].map((h) => (
                    <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
                      No feed data yet. Start the API service to collect health data.
                    </td>
                  </tr>
                ) : (
                  entries.map(([key, feed]) => (
                    <FeedRow key={key} id={key} feed={feed} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function FeedRow({ id, feed }: { id: string; feed: FeedHealth }) {
  const statusColor = {
    healthy: "var(--green-primary)",
    degraded: "var(--orange-warning)",
    error: "var(--red-critical)",
    unknown: "var(--text-muted)",
  }[feed.status] ?? "var(--text-muted)";

  const errorRate = feed.fetch_count > 0
    ? ((feed.error_count / feed.fetch_count) * 100).toFixed(1)
    : "0.0";

  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td style={{ padding: "10px 14px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
          {feed.name || id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{id}</div>
      </td>
      <td style={{ padding: "10px 14px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: statusColor }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor, display: "inline-block" }} />
          {feed.status.toUpperCase()}
        </span>
      </td>
      <td style={{ padding: "10px 14px", fontSize: 11, color: "var(--text-secondary)" }}>
        {feed.last_success ? timeAgo(feed.last_success) : "—"}
      </td>
      <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
        {feed.fetch_count.toLocaleString()}
      </td>
      <td style={{ padding: "10px 14px", fontSize: 12, fontFamily: "var(--font-mono)", color: feed.error_count > 0 ? "var(--red-critical)" : "var(--text-muted)" }}>
        {feed.error_count} <span style={{ fontSize: 10, color: "var(--text-muted)" }}>({errorRate}%)</span>
      </td>
      <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
        {feed.avg_latency_ms !== undefined ? `${feed.avg_latency_ms.toFixed(0)}ms` : "—"}
      </td>
    </tr>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: "12px 18px", background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, minWidth: 100 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: "var(--font-mono)" }}>{value}</div>
    </div>
  );
}
