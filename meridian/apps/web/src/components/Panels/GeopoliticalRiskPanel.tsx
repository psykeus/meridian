import { useEffect, useState } from "react";
import { PanelHeader } from "@/components/Panel/PanelHeader";
import { PanelSummaryCard } from "@/components/Panel/PanelSummaryCard";

interface RiskEntry {
  country: string;
  score: number;
  event_count: number;
  tier: "critical" | "high" | "medium" | "low" | "minimal";
}

const TIER_COLOR = {
  critical: "#ff3d3d",
  high:     "#ff9800",
  medium:   "#ffeb3b",
  low:      "#448aff",
  minimal:  "#4caf50",
};

export function GeopoliticalRiskPanel() {
  const [entries, setEntries] = useState<RiskEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/ai/risk-scores")
      .then((r) => r.json())
      .then((data) => setEntries(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader title="Geopolitical Risk Index" sourceLabel="AI · Live Feeds" eventCount={entries.length} />
      <PanelSummaryCard topic="Geopolitical Risk Index" contextHint="Country-level risk scores derived from conflict, political stability, and event data" />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
            Computing risk scores…
          </div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
            Risk scores will appear after the AI service starts
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.country} className="data-row" style={{ gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{entry.country}</div>
                <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ flex: 1, height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${entry.score}%`, height: "100%", background: TIER_COLOR[entry.tier], borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>{entry.event_count} events</span>
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: TIER_COLOR[entry.tier], fontFamily: "var(--font-mono)" }}>
                  {entry.score}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, color: TIER_COLOR[entry.tier], textTransform: "uppercase" }}>
                  {entry.tier}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
