import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, Tooltip, Cell, ResponsiveContainer } from "recharts";
import { apiFetch } from "@/lib/api";
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
    apiFetch("/ai/risk-scores")
      .then((r) => r.json())
      .then((data) => setEntries(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader title="Geopolitical Risk Index" sourceLabel="AI · Live Feeds" eventCount={entries.length} />
      <PanelSummaryCard topic="Geopolitical Risk Index" contextHint="Country-level risk scores derived from conflict, political stability, and event data" />
      {entries.length > 0 && (
        <div style={{ height: 80, padding: "4px 8px 0", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={entries.slice(0, 10)} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <XAxis dataKey="country" tick={{ fontSize: 8, fill: "#6b7a8d" }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={24} />
              <Tooltip
                contentStyle={{ background: "#0a0e1a", border: "1px solid #1e2a3a", borderRadius: 4, fontSize: 11 }}
                formatter={(v: number) => [v, "Risk Score"]}
              />
              <Bar dataKey="score" radius={[2, 2, 0, 0]}>
                {entries.slice(0, 10).map((d, i) => (
                  <Cell key={i} fill={TIER_COLOR[d.tier]} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
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
