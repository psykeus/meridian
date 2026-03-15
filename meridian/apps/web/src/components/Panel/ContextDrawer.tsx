import { useState, useEffect, useCallback } from "react";
import { useEventStore } from "@/stores/useEventStore";
import { usePlanTrackingStore, getEntityKey } from "@/stores/usePlanTrackingStore";
import { SEVERITY_COLOR, SEVERITY_BG, timeAgo } from "@/lib/utils";
import { SOURCE_TO_DATASOURCE } from "@/config/dataSources";
import { isSatelliteEvent, SATELLITE_COLORS, propagateSatellite } from "@/lib/satellitePropagation";
import { apiFetch } from "@/lib/api";
import { useArticleStore } from "@/stores/useArticleStore";
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
        zIndex: 43, background: "var(--bg-panel)",
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
  flightaware: { ident: "Flight ID", aircraft_type: "Aircraft Type", operator: "Operator", origin_icao: "Origin ICAO", origin_name: "Origin", destination_icao: "Dest ICAO", destination_name: "Destination", altitude_ft: "Altitude (ft)", groundspeed: "Speed (kt)", heading: "Heading (°)" },
  aisstream: { mmsi: "MMSI", ship_name: "Vessel Name", imo: "IMO", callsign: "Call Sign", ship_type: "Ship Type", destination: "Destination", sog_kn: "Speed (kn)", cog_deg: "Course (°)", heading: "Heading (°)", nav_status: "Nav Status", length_m: "Length (m)", beam_m: "Beam (m)" },
};

const AVIATION_SOURCE_IDS = new Set(["opensky", "adsb_lol", "emergency_squawks", "vip_aircraft", "bomber_isr", "flightaware"]);

interface AirportInfo {
  icao: string;
  name?: string;
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
}

interface FlightRouteInfo {
  callsign: string;
  origin: AirportInfo | null;
  destination: AirportInfo | null;
  airports: AirportInfo[];
}

function DrawerBody({ event }: { event: GeoEvent }) {
  const [showPlanMenu, setShowPlanMenu] = useState(false);
  const [planRooms, setPlanRooms] = useState<{ id: number; name: string }[]>([]);
  const [pinned, setPinned] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [nearbyEvents, setNearbyEvents] = useState<GeoEvent[]>([]);
  const [flightRoute, setFlightRoute] = useState<FlightRouteInfo | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  // Reset AI summary when a different event is selected
  useEffect(() => {
    setAiSummary(null);
    setAiLoading(false);
  }, [event.id]);

  const { pinEntity, unpinEntity, isTracked } = usePlanTrackingStore();
  const allEvents = useEventStore((s) => s.events);
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);

  // Sources where route lookup is pointless (military callsigns aren't in OpenSky routes DB)
  const SKIP_ROUTE_SOURCES = new Set(["adsb_lol", "vip_aircraft", "bomber_isr", "emergency_squawks"]);

  // Fetch flight route for aviation events
  useEffect(() => {
    setFlightRoute(null);
    if (!AVIATION_SOURCE_IDS.has(event.source_id)) return;
    if (SKIP_ROUTE_SOURCES.has(event.source_id)) return;
    const meta = event.metadata as Record<string, unknown>;
    const callsign = ((meta?.callsign ?? meta?.flight ?? "") as string).trim();
    if (!callsign) return;

    let cancelled = false;
    setRouteLoading(true);
    (async () => {
      try {
        const r = await apiFetch(`/api/v1/events/aircraft/${encodeURIComponent(callsign)}/route`);
        if (r.ok && !cancelled) {
          const data = await r.json();
          setFlightRoute(data as FlightRouteInfo);
        }
      } catch {}
      if (!cancelled) setRouteLoading(false);
    })();
    return () => { cancelled = true; };
  }, [event.id, event.source_id]);

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
      const resp = await apiFetch("/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: `Briefly summarize this event in 2-3 sentences for a situational awareness analyst: "${event.title}" at coordinates (${event.lat.toFixed(2)}, ${event.lng.toFixed(2)}). Context: ${event.body ?? "No additional details."}` }],
        }),
      });
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n").filter((l) => l.startsWith("data: "))) {
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "content") accumulated += parsed.text;
          } catch { /* skip */ }
        }
      }
      setAiSummary(accumulated || "No summary available.");
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
    const r = await apiFetch("/api/v1/plan-rooms");
    if (r.ok) setPlanRooms(await r.json());
  };

  const addToPlan = async (roomId: number, roomName: string) => {
    setShowPlanMenu(false);
    pinEntity(event, roomId, roomName);
    await apiFetch(`/api/v1/plan-rooms/${roomId}/intel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

      {/* Flight Route (aviation events) */}
      {AVIATION_SOURCE_IDS.has(event.source_id) && (
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, color: "#29b6f6", marginBottom: 8, letterSpacing: "0.06em", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
            <span>✈</span> FLIGHT ROUTE
          </div>
          {routeLoading && (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Looking up route...</span>
          )}
          {!routeLoading && flightRoute && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Origin → Destination bar */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {flightRoute.origin ? (
                  <div style={{ flex: 1, padding: "6px 8px", background: "rgba(41,182,246,0.08)", borderRadius: 4, border: "1px solid rgba(41,182,246,0.2)" }}>
                    <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 700 }}>ORIGIN</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#29b6f6", fontFamily: "var(--font-mono)" }}>
                      {flightRoute.origin.icao}
                    </div>
                    {flightRoute.origin.name && flightRoute.origin.name !== flightRoute.origin.icao && (
                      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>
                        {flightRoute.origin.name}
                      </div>
                    )}
                    {flightRoute.origin.city && (
                      <div style={{ fontSize: 9, color: "var(--text-muted)" }}>
                        {flightRoute.origin.city}{flightRoute.origin.country ? `, ${flightRoute.origin.country}` : ""}
                      </div>
                    )}
                  </div>
                ) : null}

                {flightRoute.origin && flightRoute.destination && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 16, color: "var(--text-muted)" }}>→</span>
                  </div>
                )}

                {flightRoute.destination ? (
                  <div style={{ flex: 1, padding: "6px 8px", background: "rgba(0,230,118,0.08)", borderRadius: 4, border: "1px solid rgba(0,230,118,0.2)" }}>
                    <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 700 }}>DESTINATION</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--green-primary)", fontFamily: "var(--font-mono)" }}>
                      {flightRoute.destination.icao}
                    </div>
                    {flightRoute.destination.name && flightRoute.destination.name !== flightRoute.destination.icao && (
                      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>
                        {flightRoute.destination.name}
                      </div>
                    )}
                    {flightRoute.destination.city && (
                      <div style={{ fontSize: 9, color: "var(--text-muted)" }}>
                        {flightRoute.destination.city}{flightRoute.destination.country ? `, ${flightRoute.destination.country}` : ""}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Stops if more than 2 airports */}
              {flightRoute.airports.length > 2 && (
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  Via: {flightRoute.airports.slice(1, -1).map((a) => a.icao).join(" → ")}
                </div>
              )}
            </div>
          )}
          {!routeLoading && !flightRoute && (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {((event.metadata as Record<string, unknown>)?.callsign ?? (event.metadata as Record<string, unknown>)?.flight)
                ? "Route data unavailable for this flight."
                : "No callsign — route lookup unavailable."}
            </span>
          )}
        </div>
      )}

      {/* Satellite-specific sections */}
      {isSatelliteEvent(event.source_id) && <SatelliteDetail event={event} />}

      {/* Source docs link */}
      {ds && (
        <div className="px-4 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
          <a href={ds.docsUrl ?? ds.signupUrl} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: "var(--text-muted)", textDecoration: "none" }}>
            {ds.icon} {ds.name} — refreshes every {ds.refreshSec < 60 ? `${ds.refreshSec}s` : ds.refreshSec < 3600 ? `${ds.refreshSec / 60}m` : `${ds.refreshSec / 3600}h`} ↗
          </a>
        </div>
      )}

      {/* Source URL — opens in-app ArticleViewer */}
      {event.url && (
        <div className="px-4 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
          <button
            onClick={() => {
              const lang = (event.metadata as Record<string, string>)?.language;
              useArticleStore.getState().open(event.url!, event.title, lang);
            }}
            style={{ fontSize: 12, color: "var(--green-primary)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "none" }}
          >
            View source ↗
          </button>
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

        <button onClick={() => {
            useEventStore.getState().flyTo(event.lng, event.lat, 8);
          }}
          style={{ padding: "5px 12px", borderRadius: 4, background: "rgba(68,138,255,0.12)", border: "1px solid rgba(68,138,255,0.4)", color: "#448aff", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
          🗺 Show on Map
        </button>

        <CopyButton text={`${event.lat.toFixed(5)},${event.lng.toFixed(5)}`} />
      </div>

      {/* Historical Context (180-day) */}
      <HistoricalContext lat={event.lat} lng={event.lng} currentEventId={event.id} />
    </div>
  );
}

// ── Copy button with fallback for non-HTTPS contexts ─────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }).catch(() => fallback());
    } else {
      fallback();
    }
  };
  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={handleCopy}
      style={{ padding: "5px 12px", borderRadius: 4, background: copied ? "rgba(0,230,118,0.15)" : "var(--bg-card)", border: `1px solid ${copied ? "var(--green-primary)" : "var(--border)"}`, color: copied ? "var(--green-primary)" : "var(--text-muted)", fontSize: 11, cursor: "pointer", transition: "all 150ms" }}>
      {copied ? "✓ Copied" : "📋 Copy Coords"}
    </button>
  );
}

// ── Satellite detail panel — orbital params, live feed, imagery browser ───────
function SatelliteDetail({ event }: { event: GeoEvent }) {
  const meta = event.metadata ?? {};
  const satColor = SATELLITE_COLORS[event.source_id] ?? "#00E5FF";
  const noradId = meta.norad_cat_id as string;
  const tle1 = meta.tle_line1 as string;
  const tle2 = meta.tle_line2 as string;
  const isISS = event.source_id === "nasa_iss";

  // Live position update
  const [livePos, setLivePos] = useState<{ lat: number; lng: number; alt: number } | null>(null);
  useEffect(() => {
    if (!tle1 || !tle2) return;
    const update = () => {
      const pos = propagateSatellite(tle1, tle2);
      if (pos) setLivePos(pos);
    };
    update();
    const iv = setInterval(update, 2000);
    return () => clearInterval(iv);
  }, [tle1, tle2]);

  const orbitalParams = [
    { label: "NORAD ID", value: noradId },
    { label: "Altitude", value: livePos ? `${livePos.alt.toFixed(0)} km` : (meta.altitude_km ? `${meta.altitude_km} km` : null) },
    { label: "Inclination", value: meta.inclination != null ? `${Number(meta.inclination).toFixed(1)}\u00b0` : null },
    { label: "RAAN", value: meta.raan != null ? `${Number(meta.raan).toFixed(1)}\u00b0` : null },
    { label: "Eccentricity", value: meta.eccentricity != null ? String(meta.eccentricity) : null },
    { label: "Mean Motion", value: meta.mean_motion != null ? `${Number(meta.mean_motion).toFixed(4)} rev/day` : null },
    { label: "Period", value: meta.period_min ? `${meta.period_min} min` : (meta.mean_motion ? `${(1440 / Number(meta.mean_motion)).toFixed(1)} min` : null) },
    { label: "Epoch", value: meta.epoch as string },
    { label: "Constellation", value: meta.constellation as string },
  ].filter((p) => p.value != null);

  return (
    <>
      {/* Orbital Parameters */}
      <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 10, color: satColor, marginBottom: 8, letterSpacing: "0.06em", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, transform: "rotate(45deg)", background: satColor, display: "inline-block" }} />
          ORBITAL PARAMETERS
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {orbitalParams.map(({ label, value }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</span>
              <span style={{ fontSize: 11, color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontWeight: 500 }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Live position readout */}
        {livePos && (
          <div style={{ marginTop: 8, padding: "6px 8px", background: `${satColor}10`, borderRadius: 4, border: `1px solid ${satColor}30` }}>
            <div style={{ fontSize: 9, color: satColor, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 4 }}>LIVE POSITION</div>
            <div style={{ fontSize: 11, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
              {livePos.lat.toFixed(4)}\u00b0, {livePos.lng.toFixed(4)}\u00b0 | {livePos.alt.toFixed(0)} km
            </div>
          </div>
        )}

        {/* N2YO link */}
        {noradId && (
          <a href={`https://www.n2yo.com/satellite/?s=${noradId}`} target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-block", marginTop: 8, fontSize: 11, color: satColor, textDecoration: "none" }}>
            Track on N2YO \u2197
          </a>
        )}
      </div>

      {/* ISS Live Camera Feed */}
      {isISS && <ISSLiveFeed />}

      {/* Satellite Imagery Browser */}
      <ImageryBrowser lat={event.lat} lng={event.lng} />
    </>
  );
}

// ── ISS Live Camera Feed ─────────────────────────────────────────────────────
function ISSLiveFeed() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          background: "none", border: "none", cursor: "pointer", padding: 0,
          fontSize: 10, fontWeight: 700, color: "#FFD700", letterSpacing: "0.06em",
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        <span style={{ transform: expanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 150ms" }}>\u25b8</span>
        ISS LIVE CAMERA FEED
      </button>
      {expanded && (
        <div style={{ marginTop: 8 }}>
          <iframe
            src="https://eol.jsc.nasa.gov/ESRS/HDEV/"
            title="ISS HDEV Live Stream"
            style={{
              width: "100%", height: 200, border: "1px solid var(--border)",
              borderRadius: 4, background: "#000",
            }}
            allow="autoplay; encrypted-media"
            sandbox="allow-scripts allow-same-origin"
          />
          <div style={{ marginTop: 4, fontSize: 10, color: "var(--text-muted)" }}>
            High Definition Earth Viewing (HDEV) experiment. Feed may be dark during orbital night.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Satellite Imagery Browser — Sentinel-2 + Landsat STAC thumbnails ─────────
interface StacScene {
  id: string;
  datetime: string;
  cloudCover: number;
  satellite: string;
  thumbnailUrl: string;
  browserUrl: string;
}

function ImageryBrowser({ lat, lng }: { lat: number; lng: number }) {
  const [expanded, setExpanded] = useState(false);
  const [scenes, setScenes] = useState<StacScene[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchScenes = useCallback(async () => {
    if (loading || scenes.length > 0) return;
    setLoading(true);
    setError(null);

    const bbox = [lng - 0.5, lat - 0.5, lng + 0.5, lat + 0.5];
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000);
    const dateRange = `${thirtyDaysAgo.toISOString().slice(0, 10)}T00:00:00Z/${now.toISOString().slice(0, 10)}T23:59:59Z`;

    const results: StacScene[] = [];

    // Sentinel-2 via Copernicus STAC
    try {
      const resp = await fetch("https://catalogue.dataspace.copernicus.eu/stac/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collections: ["SENTINEL-2"],
          bbox,
          datetime: dateRange,
          limit: 10,
          sortby: [{ field: "datetime", direction: "desc" }],
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        for (const f of data.features ?? []) {
          const thumb = f.assets?.thumbnail?.href ?? f.assets?.overview?.href;
          if (!thumb) continue;
          results.push({
            id: f.id,
            datetime: f.properties?.datetime ?? "",
            cloudCover: f.properties?.["eo:cloud_cover"] ?? -1,
            satellite: "Sentinel-2",
            thumbnailUrl: thumb,
            browserUrl: `https://browser.dataspace.copernicus.eu/?zoom=10&lat=${lat}&lng=${lng}`,
          });
        }
      }
    } catch {
      // Sentinel search failed — non-fatal
    }

    // Landsat via USGS STAC
    try {
      const resp = await fetch("https://landsatlook.usgs.gov/stac-server/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collections: ["landsat-c2l2-sr"],
          bbox,
          datetime: dateRange,
          limit: 5,
          sortby: [{ field: "datetime", direction: "desc" }],
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        for (const f of data.features ?? []) {
          const thumb = f.assets?.thumbnail?.href ?? f.assets?.browse?.href;
          if (!thumb) continue;
          results.push({
            id: f.id,
            datetime: f.properties?.datetime ?? "",
            cloudCover: f.properties?.["eo:cloud_cover"] ?? -1,
            satellite: f.properties?.platform ?? "Landsat",
            thumbnailUrl: thumb,
            browserUrl: `https://landsatlook.usgs.gov/explore?lat=${lat}&lng=${lng}`,
          });
        }
      }
    } catch {
      // Landsat search failed — non-fatal
    }

    if (results.length === 0) {
      setError("No recent satellite imagery found for this location.");
    }
    setScenes(results.sort((a, b) => b.datetime.localeCompare(a.datetime)));
    setLoading(false);
  }, [lat, lng, loading, scenes.length]);

  useEffect(() => { setScenes([]); setExpanded(false); setError(null); }, [lat, lng]);
  useEffect(() => { if (expanded && scenes.length === 0 && !loading) fetchScenes(); }, [expanded, fetchScenes, loading, scenes.length]);

  return (
    <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          background: "none", border: "none", cursor: "pointer", padding: 0,
          fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em",
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        <span style={{ transform: expanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 150ms" }}>\u25b8</span>
        SATELLITE IMAGERY (30 DAYS)
      </button>
      {expanded && (
        <div style={{ marginTop: 8 }}>
          {loading && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Searching STAC catalogs...</span>}
          {error && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{error}</span>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {scenes.map((scene) => (
              <a
                key={scene.id}
                href={scene.browserUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block", textDecoration: "none",
                  border: "1px solid var(--border)", borderRadius: 4,
                  overflow: "hidden", background: "var(--bg-card)",
                }}
              >
                <img
                  src={scene.thumbnailUrl}
                  alt={scene.id}
                  style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }}
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div style={{ padding: "4px 6px" }}>
                  <div style={{ fontSize: 9, color: "var(--text-primary)", fontWeight: 600 }}>{scene.satellite}</div>
                  <div style={{ fontSize: 9, color: "var(--text-muted)" }}>
                    {scene.datetime.slice(0, 10)}
                    {scene.cloudCover >= 0 && ` | ${scene.cloudCover.toFixed(0)}% cloud`}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HistoricalContext({ lat, lng, currentEventId }: { lat: number; lng: number; currentEventId: string }) {
  const [events, setEvents] = useState<GeoEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        lat_min: String(lat - 1), lat_max: String(lat + 1),
        lng_min: String(lng - 1), lng_max: String(lng + 1),
        hours_back: "4320", // 180 days
        limit: "15",
      });
      const r = await apiFetch(`/api/v1/events?${params}`);
      if (r.ok) {
        const data = await r.json();
        setEvents((data as GeoEvent[]).filter((e) => e.id !== currentEventId));
      }
    } catch {}
    setLoading(false);
  }, [lat, lng, currentEventId]);

  // Reset events when the target event changes
  useEffect(() => { setEvents([]); setExpanded(false); }, [currentEventId]);
  useEffect(() => { if (expanded && events.length === 0 && !loading) fetchHistory(); }, [expanded, fetchHistory, loading, events.length]);

  return (
    <div className="px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
      <button onClick={() => setExpanded((v) => !v)}
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 4, padding: 0 }}>
        <span style={{ transform: expanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 150ms" }}>▸</span>
        HISTORICAL CONTEXT (180 DAYS)
      </button>
      {expanded && (
        <div style={{ marginTop: 8 }}>
          {loading && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Loading...</span>}
          {!loading && events.length === 0 && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>No historical events at this location.</span>}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {events.map((e) => (
              <button key={e.id} onClick={() => setSelectedEvent(e)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", background: "transparent", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", textAlign: "left", width: "100%" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: SEVERITY_COLOR[e.severity], flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{e.title}</span>
                <span style={{ fontSize: 9, color: "var(--text-muted)", flexShrink: 0 }}>{timeAgo(e.event_time)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
