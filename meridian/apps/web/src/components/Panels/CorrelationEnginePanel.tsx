import { useMemo } from "react";
import { PanelHeader } from "@/components/Panel/PanelHeader";
import { useEventStore } from "@/stores/useEventStore";
import { timeAgo } from "@/lib/utils";

interface InsightCard {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium";
  sources: string[];
  detectedAt: string;
}

function buildInsights(events: ReturnType<typeof useEventStore.getState>["events"]): InsightCard[] {
  const cards: InsightCard[] = [];
  const now = new Date();

  const recent = events.filter((e) => {
    const t = new Date(e.event_time);
    return (now.getTime() - t.getTime()) < 6 * 60 * 60 * 1000;
  });

  const byCategory = recent.reduce<Record<string, typeof recent>>((acc, e) => {
    acc[e.category] = acc[e.category] ?? [];
    acc[e.category].push(e);
    return acc;
  }, {});

  if ((byCategory["environment"]?.length ?? 0) >= 3 && (byCategory["humanitarian"]?.length ?? 0) >= 1) {
    cards.push({
      id: "env-hum",
      title: "Environmental → Humanitarian Cascade",
      description: `${byCategory["environment"]?.length} environmental events coincide with ${byCategory["humanitarian"]?.length ?? 0} humanitarian alerts in the past 6h`,
      severity: "high",
      sources: ["USGS", "GDACS", "ReliefWeb"],
      detectedAt: recent[0]?.event_time ?? now.toISOString(),
    });
  }

  if ((byCategory["geopolitical"]?.length ?? 0) >= 3 && (byCategory["maritime"]?.length ?? 0) >= 2) {
    cards.push({
      id: "geo-mar",
      title: "Geopolitical Activity + Maritime Concentration",
      description: `${byCategory["geopolitical"]?.length} geopolitical events and ${byCategory["maritime"]?.length} vessel movements detected in the same window`,
      severity: "medium",
      sources: ["GDELT", "ACLED", "AISHub"],
      detectedAt: recent[2]?.event_time ?? now.toISOString(),
    });
  }

  if ((byCategory["cyber"]?.length ?? 0) >= 2) {
    cards.push({
      id: "cyber-cluster",
      title: "Cyber Activity Cluster",
      description: `${byCategory["cyber"]?.length} cyber/infrastructure events detected in the last 6h — possible coordinated campaign`,
      severity: "critical",
      sources: ["CISA KEV"],
      detectedAt: recent[0]?.event_time ?? now.toISOString(),
    });
  }

  return cards;
}

const SEV_COLOR: Record<string, string> = {
  critical: "var(--red-critical)",
  high: "var(--orange-warning)",
  medium: "var(--blue-track)",
};

export function CorrelationEnginePanel() {
  const events = useEventStore((s) => s.events);
  const insights = useMemo(() => buildInsights(events), [events]);

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader title="Correlation Engine" sourceLabel="AI · Cross-Feed" eventCount={insights.length} />

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
        {insights.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 }}>
            <div style={{ fontSize: 22 }}>◎</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
              No correlations detected in current event window
            </div>
          </div>
        ) : (
          insights.map((card) => (
            <div key={card.id} style={{ marginBottom: 12, padding: "10px 12px", background: "var(--bg-card)", borderRadius: 6, border: `1px solid ${SEV_COLOR[card.severity]}33` }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: SEV_COLOR[card.severity], textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0, marginTop: 1 }}>
                  {card.severity}
                </span>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.4 }}>
                  {card.title}
                </div>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 6 }}>
                {card.description}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: 4 }}>
                  {card.sources.map((s) => (
                    <span key={s} style={{ fontSize: 9, padding: "1px 5px", background: "var(--bg-hover)", borderRadius: 3, color: "var(--text-muted)", fontWeight: 600 }}>{s}</span>
                  ))}
                </div>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{timeAgo(card.detectedAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
