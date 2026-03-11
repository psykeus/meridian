import { useState } from "react";
import { PanelHeader } from "@/components/Panel/PanelHeader";
import { PanelSummaryCard } from "@/components/Panel/PanelSummaryCard";
import { useEventStore } from "@/stores/useEventStore";
import { SEVERITY_COLOR, timeAgo } from "@/lib/utils";
import type { GeoEvent } from "@/types";

type Tab = "AIR" | "NAVAL";

export function MilitaryTrackerPanel() {
  const [tab, setTab] = useState<Tab>("AIR");
  const events = useEventStore((s) =>
    s.getFilteredEvents().filter((e) =>
      tab === "AIR"
        ? e.source_id === "opensky" && e.category === "aviation"
        : e.source_id === "aishub" && (e.metadata as any)?.ship_type === "35"
    ).slice(0, 50)
  );
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader
        title="Military Tracker"
        sourceLabel="OpenSky · AISHub"
        eventCount={events.length}
      >
        <div style={{ display: "flex", gap: 2 }}>
          {(["AIR", "NAVAL"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "2px 8px", fontSize: 10, fontWeight: 700,
                borderRadius: 3, border: "1px solid",
                borderColor: tab === t ? "var(--green-primary)" : "var(--border)",
                background: tab === t ? "rgba(0,230,118,0.1)" : "transparent",
                color: tab === t ? "var(--green-primary)" : "var(--text-muted)",
                cursor: "pointer", letterSpacing: "0.05em",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </PanelHeader>
      <PanelSummaryCard topic="Military Tracker" contextHint="Military aircraft sorties, naval force movements, and emergency squawk patterns" />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {events.length === 0
          ? <EmptyState message={tab === "AIR" ? "No emergency squawks detected" : "No military vessels tracked"} />
          : events.map((e) => <TrackRow key={e.id} event={e} tab={tab} onClick={() => setSelectedEvent(e)} />)
        }
      </div>
    </div>
  );
}

function TrackRow({ event, tab, onClick }: { event: GeoEvent; tab: Tab; onClick: () => void }) {
  const meta = event.metadata as Record<string, unknown>;
  const color = SEVERITY_COLOR[event.severity];

  return (
    <div className="data-row" onClick={onClick}>
      <div
        style={{
          width: 8, height: 8, borderRadius: "50%",
          background: color, flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {tab === "AIR"
            ? (meta?.callsign as string || (meta?.icao24 as string)?.toUpperCase() || "UNKNOWN")
            : (event.title)
          }
        </div>
        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {tab === "AIR"
            ? `${meta?.squawk ? `SQUAWK ${meta.squawk}` : ""} · ${meta?.origin_country ?? ""}`
            : `MMSI ${meta?.mmsi ?? ""}`
          }
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, flexShrink: 0 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color, textTransform: "uppercase" }}>
          {event.severity}
        </span>
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
