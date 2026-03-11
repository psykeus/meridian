import { useEffect, useState } from "react";
import { PanelHeader } from "@/components/Panel/PanelHeader";
import { PanelSummaryCard } from "@/components/Panel/PanelSummaryCard";

interface DailyBrief {
  date: string;
  generated_at: string;
  executive_summary: string;
  category_summaries: Record<string, string>;
  event_counts: Record<string, number>;
  error?: string;
}

export function DailyBriefPanel() {
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchBrief = async () => {
    try {
      const resp = await fetch("/ai/brief/daily");
      if (resp.ok) setBrief(await resp.json());
    } catch {}
    finally { setLoading(false); }
  };

  const refreshBrief = async () => {
    setRefreshing(true);
    await fetch("/ai/brief/daily/refresh", { method: "POST" }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));
    await fetchBrief();
    setRefreshing(false);
  };

  useEffect(() => { fetchBrief(); }, []);

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader title="Daily Intelligence Brief" sourceLabel="AI Analyst" />
      <PanelSummaryCard topic="Daily Intelligence Brief" contextHint="Key developments from the past 24 hours across all monitored categories" />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
            Loading brief…
          </div>
        ) : !brief || brief.error ? (
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
              {brief?.error ?? "No daily brief yet. Generate one to get started."}
            </div>
            <button
              onClick={refreshBrief}
              disabled={refreshing}
              style={{
                padding: "6px 14px", borderRadius: 4, fontSize: 12, fontWeight: 600,
                background: "var(--green-primary)", color: "var(--bg-app)",
                border: "none", cursor: refreshing ? "default" : "pointer",
                opacity: refreshing ? 0.6 : 1,
              }}
            >
              {refreshing ? "Generating…" : "Generate Brief"}
            </button>
          </div>
        ) : (
          <>
            <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{brief.date}</span>
              <button
                onClick={refreshBrief}
                disabled={refreshing}
                style={{ fontSize: 10, color: "var(--green-primary)", background: "none", border: "none", cursor: "pointer" }}
              >
                {refreshing ? "Regenerating…" : "↻ Refresh"}
              </button>
            </div>

            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                Executive Summary
              </div>
              <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.6 }}>
                {brief.executive_summary}
              </div>
            </div>

            {Object.entries(brief.category_summaries).map(([cat, summary]) => (
              <div
                key={cat}
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <button
                  onClick={() => setExpanded(expanded === cat ? null : cat)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", textTransform: "capitalize" }}>
                      {cat}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                      {brief.event_counts[cat] ?? 0} events
                    </span>
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{expanded === cat ? "▴" : "▾"}</span>
                </button>
                {expanded === cat && (
                  <div style={{ padding: "0 12px 10px", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {summary}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
