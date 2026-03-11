import { PanelHeader } from "@/components/Panel/PanelHeader";
import { PanelSummaryCard } from "@/components/Panel/PanelSummaryCard";
import { useEventStore } from "@/stores/useEventStore";
import { SEVERITY_COLOR, timeAgo } from "@/lib/utils";
import type { GeoEvent } from "@/types";

export function HumanitarianAlertsPanel() {
  const events = useEventStore((s) =>
    s.getFilteredEvents()
      .filter((e) => e.source_id === "fema" || e.category === "humanitarian")
      .slice(0, 100)
  );
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader
        title="Humanitarian Alerts"
        sourceLabel="FEMA · GDACS"
        eventCount={events.length}
      />
      <PanelSummaryCard topic="Humanitarian Alerts" contextHint="FEMA disaster declarations, GDACS crisis events, displacement, food insecurity, and disease outbreaks" />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {events.length === 0
          ? <EmptyState message="No humanitarian alerts" />
          : events.map((e) => <AlertRow key={e.id} event={e} onClick={() => setSelectedEvent(e)} />)
        }
      </div>
    </div>
  );
}

function AlertRow({ event, onClick }: { event: GeoEvent; onClick: () => void }) {
  const color = SEVERITY_COLOR[event.severity];
  const meta = event.metadata as Record<string, unknown>;

  return (
    <div className="data-row" onClick={onClick}>
      <div
        style={{ width: 3, height: 36, borderRadius: 2, background: color, flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {event.title}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {(meta?.incident_type as string) ?? event.source_id.replace(/_/g, " ")}
          {" · "}
          {timeAgo(event.event_time)}
        </div>
      </div>
      <span
        style={{
          fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 3,
          background: `${color}22`, color, textTransform: "uppercase",
          flexShrink: 0, alignSelf: "center",
        }}
      >
        {event.severity}
      </span>
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
