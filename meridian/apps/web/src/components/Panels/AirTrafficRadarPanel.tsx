import { useState } from "react";
import { PanelHeader } from "@/components/Panel/PanelHeader";
import { PanelSummaryCard } from "@/components/Panel/PanelSummaryCard";
import { useEventStore } from "@/stores/useEventStore";
import { SEVERITY_COLOR } from "@/lib/utils";
import type { GeoEvent } from "@/types";

const SQUAWK_LABEL: Record<string, string> = {
  "7700": "GENERAL EMERGENCY",
  "7600": "RADIO FAILURE",
  "7500": "HIJACK",
};

type Radius = 25 | 50 | 100 | 250;

export function AirTrafficRadarPanel() {
  const [radius, setRadius] = useState<Radius>(100);
  const events = useEventStore((s) =>
    s.getFilteredEvents()
      .filter((e) => e.source_id === "opensky" && e.category === "aviation")
      .slice(0, 150)
  );
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);

  const emergencies = events.filter((e) => {
    const sq = (e.metadata as Record<string, unknown>)?.squawk as string | undefined;
    return sq && ["7700", "7600", "7500"].includes(sq);
  });

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader title="Air Traffic Radar" sourceLabel="OpenSky" eventCount={events.length}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {([25, 50, 100, 250] as Radius[]).map((r) => (
            <button key={r} onClick={() => setRadius(r)}
              style={{ padding: "2px 6px", fontSize: 9, fontWeight: 700, borderRadius: 3, border: "1px solid",
                borderColor: radius === r ? "var(--green-primary)" : "var(--border)",
                background: radius === r ? "rgba(0,230,118,0.1)" : "transparent",
                color: radius === r ? "var(--green-primary)" : "var(--text-muted)", cursor: "pointer" }}>
              {r}mi
            </button>
          ))}
        </div>
      </PanelHeader>
      <PanelSummaryCard topic="Air Traffic Radar" contextHint="Live aircraft in radius, emergency squawks 7700/7600/7500, and military flight activity" />
      <div style={{ display: "flex", gap: 16, padding: "8px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <Kpi label="Airborne" value={events.length} color="var(--blue-track)" />
        <Kpi label="Emergencies" value={emergencies.length} color={emergencies.length > 0 ? "var(--red-critical)" : "var(--text-muted)"} />
        <Kpi label="Radius" value={`${radius}mi`} color="var(--text-muted)" />
      </div>

      {emergencies.length > 0 && (
        <div style={{ background: "rgba(255,68,68,0.12)", borderBottom: "1px solid var(--red-critical)", padding: "6px 12px", flexShrink: 0 }}>
          {emergencies.map((e) => {
            const sq = (e.metadata as Record<string, unknown>)?.squawk as string;
            return (
              <div key={e.id} style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }} onClick={() => setSelectedEvent(e)}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--red-critical)" }}>▲ SQUAWK {sq}</span>
                <span style={{ fontSize: 10, color: "var(--text-primary)" }}>{e.title}</span>
                <span style={{ fontSize: 9, color: "var(--text-muted)", marginLeft: "auto" }}>{SQUAWK_LABEL[sq] ?? ""}</span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto" }}>
        {events.length === 0
          ? <EmptyState />
          : events.map((e) => <AircraftRow key={e.id} event={e} onClick={() => setSelectedEvent(e)} />)
        }
      </div>
    </div>
  );
}

function AircraftRow({ event, onClick }: { event: GeoEvent; onClick: () => void }) {
  const meta = event.metadata as Record<string, unknown>;
  const sq = meta?.squawk as string | undefined;
  const isEmergency = sq && ["7700", "7600", "7500"].includes(sq);
  const color = SEVERITY_COLOR[event.severity];
  return (
    <div className="data-row" onClick={onClick} style={{ background: isEmergency ? "rgba(255,68,68,0.08)" : undefined }}>
      <span style={{ fontSize: 12, flexShrink: 0 }}>✈</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: isEmergency ? "var(--red-critical)" : "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {(meta?.callsign as string) || (meta?.icao24 as string)?.toUpperCase() || "UNKNOWN"}
          {sq && isEmergency && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: "var(--red-critical)" }}>SQUAWK {sq}</span>}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {meta?.origin_country as string ?? ""}{meta?.baro_altitude_m ? ` · ${Math.round((meta.baro_altitude_m as number) * 3.281).toLocaleString()}ft` : ""}
          {meta?.velocity_ms ? ` · ${Math.round((meta.velocity_ms as number) * 1.944)}kn` : ""}
        </div>
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, color, textTransform: "uppercase", flexShrink: 0 }}>{event.severity}</span>
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
      No aircraft data
    </div>
  );
}
