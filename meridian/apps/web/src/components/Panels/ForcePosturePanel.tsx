import { PanelHeader } from "@/components/Panel/PanelHeader";
import { PanelSummaryCard } from "@/components/Panel/PanelSummaryCard";
import { useEventStore } from "@/stores/useEventStore";
import { timeAgo } from "@/lib/utils";
import type { GeoEvent } from "@/types";

const CSG_STATUS: Array<{ group: string; status: string; region: string; color: string }> = [
  { group: "CVN-68 Nimitz",    status: "DEPLOYED",  region: "W. Pacific",   color: "var(--red-critical)" },
  { group: "CVN-70 Carl Vinson", status: "UNDERWAY", region: "Indian Ocean", color: "var(--orange-warning)" },
  { group: "CVN-76 Ronald Reagan", status: "IN-PORT", region: "Yokosuka",  color: "var(--text-muted)" },
  { group: "CVN-71 Theodore Roosevelt", status: "UNDERWAY", region: "Mediterranean", color: "var(--orange-warning)" },
];

const STATUS_COLOR: Record<string, string> = {
  DEPLOYED:  "var(--red-critical)",
  ELEVATED:  "var(--orange-warning)",
  UNDERWAY:  "var(--orange-warning)",
  "IN-PORT": "var(--text-muted)",
};

export function ForcePosturePanel() {
  const events = useEventStore((s) =>
    s.getFilteredEvents()
      .filter((e) => (e.source_id === "opensky" || e.source_id === "aishub") && e.severity !== "info")
      .slice(0, 20)
  );
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader title="Force Posture" sourceLabel="USNI · DoD · OpenSky" eventCount={events.length} />
      <PanelSummaryCard topic="Force Posture" contextHint="Carrier strike group deployments, force movements, military exercises, and readiness posture" />
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
          Carrier Strike Groups
        </div>
        {CSG_STATUS.map((csg) => (
          <div key={csg.group} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--text-primary)", fontWeight: 600 }}>{csg.group}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{csg.region}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: STATUS_COLOR[csg.status] ?? "var(--text-muted)", letterSpacing: "0.05em" }}>
                {csg.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {events.length === 0
          ? <EmptyState />
          : events.map((e) => <PostureRow key={e.id} event={e} onClick={() => setSelectedEvent(e)} />)
        }
      </div>
    </div>
  );
}

function PostureRow({ event, onClick }: { event: GeoEvent; onClick: () => void }) {
  return (
    <div className="data-row" onClick={onClick}>
      <span style={{ fontSize: 13, flexShrink: 0 }}>
        {event.source_id === "opensky" ? "✈" : "⚓"}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {event.title}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {event.body ?? `${event.lat.toFixed(2)}°, ${event.lng.toFixed(2)}°`}
        </div>
      </div>
      <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>{timeAgo(event.event_time)}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 12, color: "var(--text-muted)" }}>
      No notable force movements
    </div>
  );
}
