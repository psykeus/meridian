import { PanelHeader } from "@/components/Panel/PanelHeader";
import { PanelSummaryCard } from "@/components/Panel/PanelSummaryCard";
import { useEventStore } from "@/stores/useEventStore";
import { useFilteredEvents } from "@/stores/useFilteredEvents";
import { timeAgo } from "@/lib/utils";

const CHOKEPOINTS = [
  { name: "Strait of Hormuz",   status: "NORMAL",   risk: "low",    vessels: "--" },
  { name: "Suez Canal",         status: "ELEVATED", risk: "medium", vessels: "--" },
  { name: "Red Sea / Bab-el-Mandeb", status: "CRITICAL", risk: "high", vessels: "--" },
  { name: "Strait of Malacca",  status: "NORMAL",   risk: "low",    vessels: "--" },
  { name: "Danish Straits",     status: "NORMAL",   risk: "low",    vessels: "--" },
  { name: "Panama Canal",       status: "NORMAL",   risk: "low",    vessels: "--" },
];

const STATUS_COLOR: Record<string, string> = {
  NORMAL:   "var(--green-primary)",
  ELEVATED: "var(--orange-warning)",
  CRITICAL: "var(--red-critical)",
};

export function SupplyChainPanel() {
  const allEvents = useFilteredEvents();
  const events = allEvents.filter((e) => e.category === "maritime").slice(0, 50);
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);

  const pirateEvents = events.filter((e) =>
    (e.title + (e.body ?? "")).toLowerCase().includes("piracy") ||
    (e.title + (e.body ?? "")).toLowerCase().includes("attack")
  );

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader title="Supply Chain Monitor" sourceLabel="AISHub · ASAM · BDI" eventCount={events.length} />
      <PanelSummaryCard topic="Supply Chain Monitor" contextHint="Maritime vessel tracking, chokepoint status, piracy incidents, and BDI shipping costs" />

      <div style={{ display: "flex", gap: 16, padding: "8px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <Kpi label="Vessels Tracked" value={events.length} color="var(--blue-track)" />
        <Kpi label="Piracy Incidents (30d)" value={pirateEvents.length} color={pirateEvents.length > 0 ? "var(--red-critical)" : "var(--text-muted)"} />
        <Kpi label="BDI" value="--" color="var(--text-muted)" />
      </div>

      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
          Chokepoint Status
        </div>
        {CHOKEPOINTS.map((cp) => (
          <div key={cp.name} style={{ display: "flex", alignItems: "center", padding: "3px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ flex: 1, fontSize: 11, color: "var(--text-primary)" }}>{cp.name}</div>
            <span style={{ fontSize: 9, fontWeight: 700, color: STATUS_COLOR[cp.status], letterSpacing: "0.05em" }}>{cp.status}</span>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {events.length === 0
          ? <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>No maritime events</div>
          : events.map((e) => (
              <div key={e.id} className="data-row" onClick={() => setSelectedEvent(e)}>
                <span style={{ fontSize: 13, flexShrink: 0 }}>⚓</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {e.lat.toFixed(2)}°, {e.lng.toFixed(2)}°
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
