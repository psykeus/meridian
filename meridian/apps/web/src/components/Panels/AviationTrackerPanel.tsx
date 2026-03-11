import { PanelHeader } from "@/components/Panel/PanelHeader";
import { PanelSummaryCard } from "@/components/Panel/PanelSummaryCard";
import { useEventStore } from "@/stores/useEventStore";
import { timeAgo } from "@/lib/utils";

export function AviationTrackerPanel() {
  const events = useEventStore((s) =>
    s.getFilteredEvents().filter((e) => e.category === "aviation").slice(0, 200)
  );
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);

  const emergencies = events.filter((e) => {
    const sq = (e.metadata as Record<string, unknown>)?.squawk as string | undefined;
    return sq && ["7700", "7600", "7500"].includes(sq);
  });
  const military = events.filter((e) => e.severity !== "info");
  const countries = new Set(events.map((e) => (e.metadata as Record<string, unknown>)?.origin_country as string).filter(Boolean));

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader title="Aviation Tracker" sourceLabel="OpenSky · adsb.lol" eventCount={events.length} />
      <PanelSummaryCard topic="Aviation Tracker" contextHint="Global flight activity, emergency squawks, military aircraft, and airspace anomalies" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <Kpi label="Airborne" value={events.length} color="var(--blue-track)" />
        <Kpi label="Military" value={military.length} color="var(--orange-warning)" />
        <Kpi label="Emergencies" value={emergencies.length} color={emergencies.length > 0 ? "var(--red-critical)" : "var(--text-muted)"} />
        <Kpi label="Countries" value={countries.size} color="var(--green-primary)" />
      </div>

      {emergencies.length > 0 && (
        <div style={{ padding: "6px 12px", background: "rgba(255,68,68,0.1)", borderBottom: "1px solid var(--red-critical)", flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--red-critical)", marginBottom: 4 }}>ACTIVE EMERGENCIES</div>
          {emergencies.map((e) => (
            <div key={e.id} className="data-row" style={{ padding: "2px 0" }} onClick={() => setSelectedEvent(e)}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--red-critical)" }}>▲</span>
              <span style={{ fontSize: 11, color: "var(--text-primary)", flex: 1 }}>{e.title}</span>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{timeAgo(e.event_time)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto" }}>
        {events.length === 0
          ? <EmptyState />
          : events.filter((e) => e.severity !== "info").concat(events.filter((e) => e.severity === "info")).slice(0, 80).map((e) => (
              <div key={e.id} className="data-row" onClick={() => setSelectedEvent(e)}>
                <span style={{ fontSize: 12, flexShrink: 0 }}>✈</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.title}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {(e.metadata as Record<string, unknown>)?.origin_country as string ?? ""} · {e.lat.toFixed(1)}°, {e.lng.toFixed(1)}°
                  </div>
                </div>
                <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>{timeAgo(e.event_time)}</span>
              </div>
            ))
        }
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: "var(--font-mono)" }}>{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 12, color: "var(--text-muted)" }}>
      No flight data available
    </div>
  );
}
