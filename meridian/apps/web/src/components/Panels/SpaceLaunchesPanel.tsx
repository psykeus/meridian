import { PanelHeader } from "@/components/Panel/PanelHeader";
import { PanelSummaryCard } from "@/components/Panel/PanelSummaryCard";
import { useEventStore } from "@/stores/useEventStore";
import { SEVERITY_COLOR, timeAgo } from "@/lib/utils";

const KP_COLOR = (kp: number) =>
  kp >= 7 ? "var(--red-critical)" : kp >= 5 ? "var(--orange-warning)" : kp >= 3 ? "var(--blue-track)" : "var(--green-primary)";

const UPCOMING_LAUNCHES = [
  { name: "Falcon 9 · Starlink 6-67", site: "KSC LC-39A",   tminus: "T-2d 14h", status: "GO" },
  { name: "Ariane 6 · CSO-3",          site: "Kourou ELA-4", tminus: "T-5d 08h", status: "GO" },
  { name: "PSLV-C58 · XPoSat",         site: "SDSC SHAR",    tminus: "T-9d 02h", status: "TBD" },
  { name: "New Glenn · NG-2",           site: "SLC-36",       tminus: "T-11d",    status: "TBD" },
  { name: "Long March 5B",              site: "Wenchang LC-1",tminus: "T-14d",    status: "TBD" },
];

export function SpaceLaunchesPanel() {
  const events = useEventStore((s) =>
    s.getFilteredEvents()
      .filter((e) => e.source_id === "nasa_iss" || e.source_id === "noaa_space_weather")
      .slice(0, 40)
  );
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);

  const issEvent = events.find((e) => e.source_id === "nasa_iss");
  const spaceWeather = events.filter((e) => e.source_id === "noaa_space_weather").slice(0, 5);

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader title="Space & Launches" sourceLabel="NASA · NOAA SWPC · LL2" eventCount={events.length} />
      <PanelSummaryCard topic="Space & Launches" contextHint="ISS position, space weather alerts, Kp index, and upcoming launch schedule" />

      {issEvent && (
        <div style={{ display: "flex", gap: 16, padding: "8px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>ISS Position</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--blue-track)", fontFamily: "var(--font-mono)" }}>
              {issEvent.lat.toFixed(2)}°, {issEvent.lng.toFixed(2)}°
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Altitude</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--blue-track)", fontFamily: "var(--font-mono)" }}>
              {((issEvent.metadata as Record<string, unknown>)?.altitude_km as number)?.toFixed(0) ?? "~408"}km
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Updated</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{timeAgo(issEvent.event_time)}</div>
          </div>
        </div>
      )}

      {spaceWeather.length > 0 && (
        <div style={{ padding: "6px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Space Weather</div>
          {spaceWeather.map((e) => {
            const meta = e.metadata as Record<string, unknown>;
            const kp = (meta?.kp_index as number) ?? 0;
            const color = SEVERITY_COLOR[e.severity];
            return (
              <div key={e.id} className="data-row" onClick={() => setSelectedEvent(e)}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 11, color: "var(--text-primary)" }}>{e.title}</span>
                {kp > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: KP_COLOR(kp), fontFamily: "var(--font-mono)" }}>Kp {kp}</span>}
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{timeAgo(e.event_time)}</span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ padding: "8px 12px" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
            Upcoming Launches
          </div>
          {UPCOMING_LAUNCHES.map((launch) => (
            <div key={launch.name} style={{ display: "flex", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--border)", gap: 8 }}>
              <span style={{ fontSize: 13, flexShrink: 0 }}>🚀</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{launch.name}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{launch.site}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--blue-track)" }}>{launch.tminus}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: launch.status === "GO" ? "var(--green-primary)" : "var(--text-muted)" }}>{launch.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
