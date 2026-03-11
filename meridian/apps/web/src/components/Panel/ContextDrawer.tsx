import { useState, useEffect, useCallback } from "react";
import { useEventStore } from "@/stores/useEventStore";
import { usePlanTrackingStore, getEntityKey } from "@/stores/usePlanTrackingStore";
import { SEVERITY_COLOR, SEVERITY_BG, timeAgo } from "@/lib/utils";
import { SOURCE_TO_DATASOURCE } from "@/config/dataSources";
import type { GeoEvent } from "@/types";

export function ContextDrawer() {
  const selectedEvent = useEventStore((s) => s.selectedEvent);
  const isDrawerOpen = useEventStore((s) => s.isDrawerOpen);
  const closeDrawer = useEventStore((s) => s.closeDrawer);

  return (
    <div
      style={{
        position: "absolute", top: 0, right: 0, height: "100%", width: 360,
        transform: isDrawerOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        zIndex: 40, background: "var(--bg-panel)",
        borderLeft: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        pointerEvents: isDrawerOpen ? "all" : "none",
      }}
    >
      <div className="flex items-center justify-between px-4 flex-shrink-0"
        style={{ height: 44, borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.08em" }}>
          EVENT DETAIL
        </span>
        <button onClick={closeDrawer} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14, padding: "4px 6px", borderRadius: 4 }}>✕</button>
      </div>
      {selectedEvent && <DrawerBody event={selectedEvent} />}
    </div>
  );
}

// ── Source-specific field labels ──────────────────────────────────────────────
const FIELD_LABELS: Record<string, Record<string, string>> = {
  opensky: { icao24: "ICAO24 Hex", callsign: "Call Sign", origin_country: "Origin", baro_altitude: "Altitude (m)", velocity: "Speed (m/s)", true_track: "Heading (°)", vertical_rate: "Vert. Rate (m/s)", squawk: "Squawk", on_ground: "On Ground" },
  adsb_lol: { icao24: "ICAO24 Hex", callsign: "Call Sign", flight: "Flight No.", aircraft_type: "Type", registration: "Reg.", altitude: "Altitude (ft)", speed: "Speed (kt)", heading: "Heading (°)", squawk: "Squawk" },
  aishub: { mmsi: "MMSI", shipname: "Vessel Name", callsign: "Call Sign", shiptype: "Vessel Type", destination: "Destination", eta: "ETA", draught: "Draught (m)", length: "Length (m)", beam: "Beam (m)", sog: "Speed (kn)", cog: "Course (°)", navstatus: "Nav Status" },
  usgs_earthquakes: { mag: "Magnitude", depth: "Depth (km)", place: "Location", alert: "Alert Level", tsunami: "Tsunami Flag", felt: "Felt Reports", sig: "Significance" },
  nasa_firms: { brightness: "Brightness (K)", frp: "Fire Power (MW)", confidence: "Confidence %", satellite: "Satellite", daynight: "Day/Night" },
  nasa_iss: { crew_count: "Crew Aboard", altitude_km: "Altitude (km)", velocity_kms: "Speed (km/s)", orbital_period_min: "Orbital Period (min)" },
  fema: { disaster_number: "Disaster #", incident_type: "Type", state: "State", declaration_type: "Declaration", incident_begin: "Incident Start", programs_declared: "Programs" },
  acled_conflicts: { event_type: "Event Type", sub_event_type: "Sub-type", actor1: "Actor 1", actor2: "Actor 2", fatalities: "Fatalities", source: "Source", admin1: "Region", country: "Country" },
  gdelt: { event_code: "CAMEO Code", actor1_country: "Actor 1 Country", actor2_country: "Actor 2 Country", goldstein_scale: "Goldstein", avg_tone: "Avg Tone", num_mentions: "Mentions" },
  reliefweb: { disaster_type: "Disaster Type", status: "Status", country: "Country", glide: "GLIDE #", primary_country: "Primary Country" },
  nvd_cve: { cvss_score: "CVSS Score", cvss_severity: "Severity", cwe: "CWE", affected_product: "Affected Product", published: "Published", is_kev: "CISA KEV" },
};

function DrawerBody({ event }: { event: GeoEvent }) {
  const [showPlanMenu, setShowPlanMenu] = useState(false);
  const [planRooms, setPlanRooms] = useState<{ id: number; name: string }[]>([]);
  const [pinned, setPinned] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [nearbyEvents, setNearbyEvents] = useState<GeoEvent[]>([]);

  const { pinEntity, unpinEntity, isTracked } = usePlanTrackingStore();
  const allEvents = useEventStore((s) => s.events);
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);

  // Fetch nearby events when event changes
  useEffect(() => {
    const nearby = allEvents
      .filter((e) => e.id !== event.id && Math.abs(e.lat - event.lat) < 2 && Math.abs(e.lng - event.lng) < 2)
      .sort((a, b) => {
        const distA = Math.hypot(a.lat - event.lat, a.lng - event.lng);
        const distB = Math.hypot(b.lat - event.lat, b.lng - event.lng);
        return distA - distB;
      })
      .slice(0, 5);
    setNearbyEvents(nearby);
  }, [event, allEvents]);

  // Fetch AI summary on demand
  const fetchAiSummary = useCallback(async () => {
    if (aiLoading || aiSummary) return;
    setAiLoading(true);
    try {
      const resp = await fetch("/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Briefly summarize this event in 2-3 sentences for a situational awareness analyst: "${event.title}" at coordinates (${event.lat.toFixed(2)}, ${event.lng.toFixed(2)}). Context: ${event.body ?? "No additional details."}`,
          stream: false,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setAiSummary(data.response ?? data.message ?? "No summary available.");
      }
    } catch {
      setAiSummary("AI summary unavailable.");
    } finally {
      setAiLoading(false);
    }
  }, [event, aiLoading, aiSummary]);
  const entityKey = getEntityKey(event);
  const isAlreadyTracked = isTracked(entityKey);

  const color = SEVERITY_COLOR[event.severity];
  const bg = SEVERITY_BG[event.severity];
  const ds = SOURCE_TO_DATASOURCE.get(event.source_id);
  const fieldLabels = FIELD_LABELS[event.source_id] ?? {};

  const openPlanMenu = async () => {
    setShowPlanMenu(true);
    const r = await fetch("/api/v1/plan-rooms", { headers: { Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` } });
    if (r.ok) setPlanRooms(await r.json());
  };

  const addToPlan = async (roomId: number, roomName: string) => {
    setShowPlanMenu(false);
    pinEntity(event, roomId, roomName);
    await fetch(`/api/v1/plan-rooms/${roomId}/intel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` },
      body: JSON.stringify({ title: event.title, body: `${event.body ?? ""}\n\nLat: ${event.lat.toFixed(4)}, Lng: ${event.lng.toFixed(4)}\nSource: ${event.source_id}`.trim(), classification: "unclassified" }),
    });
    setPinned(true);
    setTimeout(() => setPinned(false), 2000);
  };

  const untrack = () => { unpinEntity(entityKey); };

  const metaEntries = Object.entries(event.metadata ?? {})
    .filter(([, v]) => v !== null && v !== undefined && v !== "");

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="severity-badge" style={{ color, background: bg }}>{event.severity}</span>
          {ds && (
            <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: `${ds.category === "Aviation" ? "#29b6f6" : ds.category === "Maritime" ? "#448aff" : "#ffffff"}18`, color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              {ds.icon} {ds.name}
            </span>
          )}
          {!ds && <span className="source-badge">{event.source_id.replace(/_/g, " ")}</span>}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>{timeAgo(event.event_time)}</span>
        </div>

        <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}>
          {event.title}
        </h2>

        {event.body && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>{event.body}</p>
        )}
      </div>

      {/* Location */}
      <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.06em", fontWeight: 700 }}>LOCATION</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
          {event.lat.toFixed(4)}°, {event.lng.toFixed(4)}°
        </div>
      </div>

      {/* Source-specific data fields */}
      {metaEntries.length > 0 && (
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8, letterSpacing: "0.06em", fontWeight: 700 }}>
            {ds ? `${ds.icon} ${ds.name.toUpperCase()} DATA` : "DETAILS"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {metaEntries.map(([key, value]) => {
              const label = fieldLabels[key] ?? key.replace(/_/g, " ");
              const displayVal = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
              const isHighlight = ["mag", "fatalities", "cvss_score", "frp", "crew_count", "mmsi", "icao24", "callsign"].includes(key);
              return (
                <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "capitalize", flexShrink: 0 }}>{label}</span>
                  <span style={{ fontSize: isHighlight ? 12 : 11, color: isHighlight ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: isHighlight ? 600 : 400, textAlign: "right", maxWidth: 200, wordBreak: "break-word", fontFamily: ["icao24", "mmsi", "callsign"].includes(key) ? "var(--font-mono)" : "inherit" }}>
                    {displayVal}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Source docs link */}
      {ds && (
        <div className="px-4 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
          <a href={ds.docsUrl ?? ds.signupUrl} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: "var(--text-muted)", textDecoration: "none" }}>
            {ds.icon} {ds.name} — refreshes every {ds.refreshSec < 60 ? `${ds.refreshSec}s` : ds.refreshSec < 3600 ? `${ds.refreshSec / 60}m` : `${ds.refreshSec / 3600}h`} ↗
          </a>
        </div>
      )}

      {/* Source URL */}
      {event.url && (
        <div className="px-4 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
          <a href={event.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--green-primary)", textDecoration: "none" }}>
            View source ↗
          </a>
        </div>
      )}

      {/* AI Summary */}
      <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.06em", fontWeight: 700 }}>AI ANALYSIS</span>
          {!aiSummary && (
            <button onClick={fetchAiSummary} disabled={aiLoading}
              style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "rgba(0,230,118,0.1)", border: "1px solid rgba(0,230,118,0.3)", color: "var(--green-primary)", cursor: "pointer" }}>
              {aiLoading ? "Analyzing..." : "Summarize"}
            </button>
          )}
        </div>
        {aiSummary && (
          <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0, lineHeight: 1.6, fontStyle: "italic" }}>
            {aiSummary}
          </p>
        )}
        {!aiSummary && !aiLoading && (
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
            Click "Summarize" for an AI-generated analysis.
          </p>
        )}
      </div>

      {/* Nearby Events */}
      {nearbyEvents.length > 0 && (
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.06em", fontWeight: 700 }}>
            NEARBY EVENTS ({nearbyEvents.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {nearbyEvents.map((ne) => (
              <button key={ne.id} onClick={() => setSelectedEvent(ne)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", background: "transparent", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", textAlign: "left", width: "100%" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: SEVERITY_COLOR[ne.severity], flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ne.title}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0, marginLeft: "auto" }}>
                  {timeAgo(ne.event_time)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="px-4 py-3 mt-auto" style={{ borderTop: "1px solid var(--border)", display: "flex", gap: 8, flexWrap: "wrap" }}>
        {pinned && (
          <span style={{ fontSize: 11, color: "var(--green-primary)", alignSelf: "center" }}>✓ Added to plan</span>
        )}

        {isAlreadyTracked ? (
          <button onClick={untrack}
            style={{ padding: "5px 12px", borderRadius: 4, background: "rgba(255,82,82,0.1)", border: "1px solid rgba(255,82,82,0.3)", color: "var(--red-critical)", fontSize: 11, cursor: "pointer" }}>
            🗑 Untrack
          </button>
        ) : (
          <div style={{ position: "relative" }}>
            <button onClick={openPlanMenu}
              style={{ padding: "5px 12px", borderRadius: 4, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
              📌 Add to Plan
            </button>
            {showPlanMenu && (
              <div style={{ position: "absolute", bottom: "100%", left: 0, marginBottom: 4, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, minWidth: 200, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", zIndex: 50 }}>
                <div style={{ padding: "8px 12px", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", borderBottom: "1px solid var(--border)", letterSpacing: "0.08em" }}>SELECT PLAN ROOM</div>
                {planRooms.length === 0 && <div style={{ padding: "12px", fontSize: 11, color: "var(--text-muted)" }}>No plan rooms. Create one in Plan Mode.</div>}
                {planRooms.map((r) => (
                  <button key={r.id} onClick={() => addToPlan(r.id, r.name)}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text-primary)" }}>
                    {r.name}
                  </button>
                ))}
                <button onClick={() => setShowPlanMenu(false)}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 12px", background: "none", border: "none", borderTop: "1px solid var(--border)", cursor: "pointer", fontSize: 11, color: "var(--text-muted)" }}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        <button onClick={() => navigator.clipboard.writeText(`${event.lat.toFixed(5)},${event.lng.toFixed(5)}`)}
          style={{ padding: "5px 12px", borderRadius: 4, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 11, cursor: "pointer" }}>
          📋 Copy Coords
        </button>
      </div>
    </div>
  );
}
