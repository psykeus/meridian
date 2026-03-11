import { PanelHeader } from "@/components/Panel/PanelHeader";
import { PanelSummaryCard } from "@/components/Panel/PanelSummaryCard";
import { useEventStore } from "@/stores/useEventStore";
import { SEVERITY_COLOR, timeAgo } from "@/lib/utils";
import type { GeoEvent } from "@/types";

export function CyberThreatMonitorPanel() {
  const events = useEventStore((s) =>
    s.getFilteredEvents()
      .filter((e) => e.source_id === "cisa_kev" || e.category === "cyber")
      .slice(0, 100)
  );
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);

  const criticalCount = events.filter((e) => e.severity === "critical").length;
  const highCount = events.filter((e) => e.severity === "high").length;

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader
        title="Cyber Threat Monitor"
        sourceLabel="CISA KEV"
        eventCount={events.length}
      />
      <PanelSummaryCard topic="Cyber Threat Monitor" contextHint="CISA Known Exploited Vulnerabilities, active cyber incidents, and infrastructure threat signals" />
      <div
        style={{
          display: "flex", gap: 12, padding: "8px 12px",
          borderBottom: "1px solid var(--border)", flexShrink: 0,
        }}
      >
        <KpiBadge label="Critical CVEs" value={criticalCount} color="var(--red-critical)" />
        <KpiBadge label="High CVEs" value={highCount} color="var(--orange-warning)" />
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
