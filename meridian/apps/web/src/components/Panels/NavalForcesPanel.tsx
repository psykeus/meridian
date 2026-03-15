import { PanelHeader } from "@/components/Panel/PanelHeader";
import { PanelSummaryCard } from "@/components/Panel/PanelSummaryCard";
import { useEventStore } from "@/stores/useEventStore";
import { useFilteredEvents } from "@/stores/useFilteredEvents";
import { timeAgo } from "@/lib/utils";
import type { GeoEvent } from "@/types";

export function NavalForcesPanel() {
  const allEvents = useFilteredEvents();
  const events = allEvents
    .filter((e) => e.source_id === "aishub" && e.category === "maritime")
    .slice(0, 100);
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);

  const militaryCount = events.filter((e) => (e.metadata as any)?.ship_type === "35").length;
  const totalCount = events.length;

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader
        title="Naval Forces"
        sourceLabel="AISHub"
        eventCount={totalCount}
      />
      <PanelSummaryCard topic="Naval Forces" contextHint="Naval vessel positions, carrier strike groups, submarine activity, and maritime force movements" />
      <div
        style={{
          display: "flex", gap: 12, padding: "8px 12px",
          borderBottom: "1px solid var(--border)", flexShrink: 0,
        }}
      >
        <KpiBadge label="AIS Vessels" value={totalCount} color="var(--blue-track)" />
        <KpiBadge label="Military" value={militaryCount} color="var(--red-critical)" />
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {events.length === 0
          ? <EmptyState message="No vessel positions available" />
          : events.map((e) => <VesselRow key={e.id} event={e} onClick={() => setSelectedEvent(e)} />)
        }
      </div>
    </div>
  );
}

function KpiBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "var(--font-mono)" }}>{value.toLocaleString()}</div>
    </div>
  );
}

function VesselRow({ event, onClick }: { event: GeoEvent; onClick: () => void }) {
  const meta = event.metadata as Record<string, unknown>;
  const shipType = meta?.ship_type as string | undefined;
  const isMilitary = shipType === "35";

  return (
    <div className="data-row" onClick={onClick}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>{isMilitary ? "⚔" : "⚓"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {event.title}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {meta?.sog_kn !== undefined ? `${(meta.sog_kn as number).toFixed(1)} kn` : ""}
          {meta?.destination ? ` → ${meta.destination}` : ""}
        </div>
      </div>
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        {isMilitary && (
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--red-critical)", textTransform: "uppercase", display: "block" }}>
            MIL
          </span>
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
