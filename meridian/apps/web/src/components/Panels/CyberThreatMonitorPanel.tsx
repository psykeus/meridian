import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { PanelHeader } from "@/components/Panel/PanelHeader";
import { PanelSummaryCard } from "@/components/Panel/PanelSummaryCard";
import { useEventStore } from "@/stores/useEventStore";
import { useFilteredEvents } from "@/stores/useFilteredEvents";
import { SEVERITY_COLOR, timeAgo } from "@/lib/utils";
import type { GeoEvent } from "@/types";

const PIE_COLORS: Record<string, string> = {
  critical: "#ff3d3d", high: "#ff9800", medium: "#ffeb3b", low: "#448aff", info: "#4caf50",
};

export function CyberThreatMonitorPanel() {
  const allEvents = useFilteredEvents();
  const events = allEvents
    .filter((e) => e.source_id === "cisa_kev" || e.category === "cyber")
    .slice(0, 100);
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);

  const criticalCount = events.filter((e) => e.severity === "critical").length;
  const highCount = events.filter((e) => e.severity === "high").length;

  const pieData = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach((e) => { counts[e.severity] = (counts[e.severity] || 0) + 1; });
    return Object.entries(counts)
      .map(([severity, count]) => ({ name: severity, value: count, color: PIE_COLORS[severity] || "#6b7a8d" }))
      .sort((a, b) => b.value - a.value);
  }, [events]);

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader
        title="Cyber Threat Monitor"
        sourceLabel="CISA · NVD · Cloudflare · Malware Bazaar"
        eventCount={events.length}
      />
      <PanelSummaryCard topic="Cyber Threat Monitor" contextHint="CISA Known Exploited Vulnerabilities, active cyber incidents, and infrastructure threat signals" />
      <div
        style={{
          display: "flex", gap: 12, padding: "8px 12px",
          borderBottom: "1px solid var(--border)", flexShrink: 0, alignItems: "center",
        }}
      >
        <KpiBadge label="Critical CVEs" value={criticalCount} color="var(--red-critical)" />
        <KpiBadge label="High CVEs" value={highCount} color="var(--orange-warning)" />
        {pieData.length > 0 && (
          <div style={{ width: 60, height: 60, marginLeft: "auto" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={14} outerRadius={28} paddingAngle={2} stroke="none">
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#0a0e1a", border: "1px solid #1e2a3a", borderRadius: 4, fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {events.length === 0
          ? <EmptyState message="No cyber threats in last 30 days" />
          : events.map((e) => <CveRow key={e.id} event={e} onClick={() => setSelectedEvent(e)} />)
        }
      </div>
    </div>
  );
}

function KpiBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "var(--font-mono)" }}>{value}</div>
    </div>
  );
}

function CveRow({ event, onClick }: { event: GeoEvent; onClick: () => void }) {
  const color = SEVERITY_COLOR[event.severity];
  const meta = event.metadata as Record<string, unknown>;

  return (
    <div className="data-row" onClick={onClick}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-mono)" }}>
          {meta?.cve_id as string ?? event.title}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {meta?.vendor as string} — {meta?.product as string}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color, textTransform: "uppercase" }}>{event.severity}</span>
        {meta?.ransomware_use === "Known" && (
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--red-critical)", textTransform: "uppercase" }}>RANSOMWARE</span>
        )}
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{timeAgo(event.event_time)}</span>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 12, color: "var(--text-muted)" }}>
      {message}
    </div>
  );
}
