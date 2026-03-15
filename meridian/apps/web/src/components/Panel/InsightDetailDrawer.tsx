import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useEventStore } from "@/stores/useEventStore";
import { useInsightStore } from "@/stores/useInsightStore";
import { SEVERITY_COLOR, SEVERITY_BG, timeAgo } from "@/lib/utils";
import type { GeoEvent } from "@/types";

// ── Anomaly type metadata ─────────────────────────────────────────────────

const ANOMALY_TYPE_META: Record<string, { icon: string; color: string }> = {
  volume_spike: { icon: "📊", color: "#ffeb3b" },
  vessel_clustering: { icon: "⚓", color: "#448aff" },
  quake_near_nuclear: { icon: "☢", color: "#ff5252" },
  osint_cluster: { icon: "🔗", color: "#ff9800" },
  commodity_conflict_correlation: { icon: "◈", color: "#e040fb" },
  bgp_advisory_concurrent: { icon: "⚡", color: "#ff5252" },
};

// ── Types ─────────────────────────────────────────────────────────────────

export interface AnomalyInsight {
  type: string;
  title: string;
  description: string;
  severity: string;
  category?: string;
  detected_at: string;
  lat?: number;
  lng?: number;
  event_ids?: string[];
  event_count?: number;
  source_count?: number;
  sources?: string[];
  vessel_count?: number;
  facility?: string;
  distance_km?: number;
  z_score?: number;
  direction?: string;
}

// ── Component ─────────────────────────────────────────────────────────────

export function InsightDetailDrawer() {
  const insight = useInsightStore((s) => s.selectedInsight);
  const onClose = useInsightStore((s) => s.closeInsight);
  const isOpen = insight !== null;

  return (
    <div
      style={{
        position: "absolute", top: 0, right: 0, height: "100%", width: 380,
        transform: isOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        zIndex: 41, background: "var(--bg-panel)",
        borderLeft: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        pointerEvents: isOpen ? "all" : "none",
      }}
    >
      <div className="flex items-center justify-between px-4 flex-shrink-0"
        style={{ height: 44, borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#bb86fc", letterSpacing: "0.08em" }}>
          AI INSIGHT DETAIL
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14, padding: "4px 6px", borderRadius: 4 }}>
          ✕
        </button>
      </div>
      {insight && <InsightBody insight={insight} />}
    </div>
  );
}

// ── Body ──────────────────────────────────────────────────────────────────

function InsightBody({ insight }: { insight: AnomalyInsight }) {
  const [sourceEvents, setSourceEvents] = useState<GeoEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [eventSummaries, setEventSummaries] = useState<Record<string, string>>({});
  const [eventSumLoading, setEventSumLoading] = useState<string | null>(null);

  const allEvents = useEventStore((s) => s.events);
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);
  const flyTo = useEventStore((s) => s.flyTo);

  const meta = ANOMALY_TYPE_META[insight.type] ?? { icon: "✦", color: "#bb86fc" };
  const severityColor = SEVERITY_COLOR[insight.severity as keyof typeof SEVERITY_COLOR] ?? "#bb86fc";
  const severityBg = SEVERITY_BG[insight.severity as keyof typeof SEVERITY_BG] ?? "rgba(187,134,252,0.15)";

  // Reset state when insight changes
  useEffect(() => {
    setAiSummary(null);
    setAiLoading(false);
    setExpandedEvent(null);
    setEventSummaries({});
    setEventSumLoading(null);
  }, [insight.title, insight.detected_at]);

  // Resolve source events from store or API
  useEffect(() => {
    if (!insight.event_ids?.length) {
      setSourceEvents([]);
      return;
    }

    setLoading(true);
    const ids = new Set(insight.event_ids);

    // First try to find events in the local store
    const fromStore = allEvents.filter((e) => ids.has(e.id));

    if (fromStore.length >= ids.size) {
      setSourceEvents(fromStore);
      setLoading(false);
      return;
    }

    // Fetch missing events from API
    const missingIds = [...ids].filter((id) => !fromStore.find((e) => e.id === id));
    (async () => {
      try {
        const params = new URLSearchParams({ ids: missingIds.join(",") });
        const resp = await apiFetch(`/api/v1/events?${params}`);
        if (resp.ok) {
          const data = await resp.json();
          const items: GeoEvent[] = Array.isArray(data) ? data : data.items ?? [];
          // Merge store + API results, dedup by id
          const merged = new Map<string, GeoEvent>();
          for (const e of fromStore) merged.set(e.id, e);
          for (const e of items) merged.set(e.id, e);
          setSourceEvents([...merged.values()]);
        } else {
          setSourceEvents(fromStore);
        }
      } catch {
        setSourceEvents(fromStore);
      } finally {
        setLoading(false);
      }
    })();
  }, [insight.event_ids, allEvents]);

  // Generate AI analysis of the anomaly + its source events
  const generateAnalysis = useCallback(async () => {
    if (aiLoading || aiSummary) return;
    setAiLoading(true);

    const eventContext = sourceEvents.slice(0, 10).map((e) =>
      `- [${e.severity}] ${e.title} (${e.source_id}, ${e.lat.toFixed(2)}°/${e.lng.toFixed(2)}°, ${timeAgo(e.event_time)})`
    ).join("\n");

    const prompt = [
      `Analyze this anomaly insight and its source events:`,
      ``,
      `**Anomaly:** ${insight.title}`,
      `**Type:** ${insight.type}`,
      `**Severity:** ${insight.severity}`,
      `**Description:** ${insight.description}`,
      insight.lat != null ? `**Location:** ${insight.lat.toFixed(2)}°, ${insight.lng?.toFixed(2)}°` : "",
      ``,
      `**Source Events (${sourceEvents.length}):**`,
      eventContext || "(No source events available)",
      ``,
      `Provide a concise intelligence assessment of this anomaly.`,
    ].filter(Boolean).join("\n");

    try {
      const resp = await apiFetch("/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          system_prompt_key: "anomaly_analysis",
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
            if (parsed.type === "content") {
              accumulated += parsed.text;
              setAiSummary(accumulated);
            }
          } catch { /* skip */ }
        }
      }
      if (!accumulated) setAiSummary("No analysis available.");
    } catch {
      setAiSummary("AI analysis unavailable.");
    } finally {
      setAiLoading(false);
    }
  }, [insight, sourceEvents, aiLoading, aiSummary]);

  // Generate AI summary for individual event
  const summarizeEvent = useCallback(async (event: GeoEvent) => {
    if (eventSumLoading || eventSummaries[event.id]) return;
    setEventSumLoading(event.id);
    try {
      const resp = await apiFetch("/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      setEventSummaries((prev) => ({ ...prev, [event.id]: accumulated || "No summary available." }));
    } catch {
      setEventSummaries((prev) => ({ ...prev, [event.id]: "Summary unavailable." }));
    } finally {
      setEventSumLoading(null);
    }
  }, [eventSumLoading, eventSummaries]);

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      {/* Anomaly Header */}
      <div className="px-4 py-4" style={{ borderBottom: "1px solid var(--border)", background: "rgba(187,134,252,0.04)" }}>
        <div className="flex items-center gap-2 mb-2">
          <span style={{
            fontSize: 11, padding: "2px 8px", borderRadius: 4,
            color: severityColor, background: severityBg, fontWeight: 700,
          }}>
            {insight.severity}
          </span>
          <span style={{
            fontSize: 10, padding: "2px 7px", borderRadius: 4,
            background: `${meta.color}18`, color: meta.color,
            border: `1px solid ${meta.color}33`,
          }}>
            {meta.icon} {insight.type.replace(/_/g, " ")}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>
            {insight.detected_at ? timeAgo(insight.detected_at) : "Just detected"}
          </span>
        </div>

        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>
          {insight.title}
        </h2>

        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
          {insight.description}
        </p>
      </div>

      {/* Anomaly-specific metadata */}
      <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8, letterSpacing: "0.06em", fontWeight: 700 }}>
          DETECTION DETAILS
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {insight.category && (
            <DetailRow label="Category" value={insight.category} />
          )}
          {insight.lat != null && insight.lng != null && (
            <DetailRow label="Location" value={`${insight.lat.toFixed(4)}°, ${insight.lng.toFixed(4)}°`} mono />
          )}
          {insight.vessel_count != null && (
            <DetailRow label="Vessels" value={String(insight.vessel_count)} />
          )}
          {insight.facility && (
            <DetailRow label="Facility" value={insight.facility} />
          )}
          {insight.distance_km != null && (
            <DetailRow label="Distance" value={`${insight.distance_km} km`} />
          )}
          {insight.z_score != null && (
            <DetailRow label="Z-Score" value={`${insight.z_score} (${insight.direction ?? ""})`} />
          )}
          {insight.source_count != null && (
            <DetailRow label="Sources" value={String(insight.source_count)} />
          )}
          {insight.event_count != null && (
            <DetailRow label="Events" value={String(insight.event_count)} />
          )}
        </div>
      </div>

      {/* Location action */}
      {insight.lat != null && insight.lng != null && (
        <div className="px-4 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
          <button
            onClick={() => flyTo(insight.lng!, insight.lat!, 8)}
            style={{
              fontSize: 11, color: "#448aff", background: "rgba(68,138,255,0.1)",
              border: "1px solid rgba(68,138,255,0.3)", borderRadius: 4,
              padding: "4px 12px", cursor: "pointer", fontWeight: 600,
            }}
          >
            Show on Map
          </button>
        </div>
      )}

      {/* AI Analysis */}
      <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: "#bb86fc", letterSpacing: "0.06em", fontWeight: 700 }}>
            AI ANALYSIS
          </span>
          {!aiSummary && (
            <button onClick={generateAnalysis} disabled={aiLoading}
              style={{
                fontSize: 10, padding: "2px 10px", borderRadius: 4,
                background: "rgba(187,134,252,0.1)", border: "1px solid rgba(187,134,252,0.3)",
                color: "#bb86fc", cursor: "pointer", fontWeight: 600,
              }}>
              {aiLoading ? "Analyzing..." : "Analyze Insight"}
            </button>
          )}
        </div>
        {aiSummary && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {aiSummary}
          </p>
        )}
        {!aiSummary && !aiLoading && (
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
            Click "Analyze Insight" for an AI-generated intelligence assessment.
          </p>
        )}
      </div>

      {/* Source Events */}
      <div className="px-4 py-3" style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8, letterSpacing: "0.06em", fontWeight: 700 }}>
          SOURCE EVENTS ({loading ? "..." : sourceEvents.length})
        </div>

        {loading && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "12px 0" }}>
            Loading source events...
          </div>
        )}

        {!loading && sourceEvents.length === 0 && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "12px 0" }}>
            No source events available for this insight.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sourceEvents.map((ev) => {
            const isExpanded = expandedEvent === ev.id;
            const evColor = SEVERITY_COLOR[ev.severity as keyof typeof SEVERITY_COLOR] ?? "#448aff";
            const summary = eventSummaries[ev.id];
            const isSummarizing = eventSumLoading === ev.id;

            return (
              <div key={ev.id} style={{
                border: "1px solid var(--border)", borderRadius: 6,
                overflow: "hidden", background: isExpanded ? "var(--bg-hover)" : "var(--bg-card)",
              }}>
                {/* Event row */}
                <button
                  onClick={() => setExpandedEvent(isExpanded ? null : ev.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 10px", background: "transparent",
                    border: "none", cursor: "pointer", textAlign: "left", width: "100%",
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%", background: evColor, flexShrink: 0,
                    boxShadow: `0 0 4px ${evColor}`,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12, color: "var(--text-primary)", fontWeight: 500,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {ev.title}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                      {ev.source_id.replace(/_/g, " ")} · {timeAgo(ev.event_time)}
                    </div>
                  </div>
                  <span style={{ fontSize: 9, color: "var(--text-muted)", flexShrink: 0 }}>
                    {isExpanded ? "▾" : "▸"}
                  </span>
                </button>

                {/* Expanded event detail */}
                {isExpanded && (
                  <div style={{ padding: "0 10px 10px", borderTop: "1px solid var(--border)" }}>
                    {ev.body && (
                      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "8px 0", lineHeight: 1.5 }}>
                        {ev.body}
                      </p>
                    )}

                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, fontFamily: "var(--font-mono)" }}>
                      {ev.lat.toFixed(4)}°, {ev.lng.toFixed(4)}°
                    </div>

                    {/* AI summary for this event */}
                    {summary && (
                      <div style={{
                        fontSize: 11, color: "var(--text-secondary)", fontStyle: "italic",
                        padding: "6px 8px", background: "rgba(187,134,252,0.06)",
                        borderRadius: 4, marginBottom: 8, lineHeight: 1.5,
                        borderLeft: "2px solid #bb86fc",
                      }}>
                        {summary}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }}
                        style={{
                          fontSize: 10, padding: "3px 10px", borderRadius: 4,
                          background: "rgba(68,138,255,0.1)", border: "1px solid rgba(68,138,255,0.3)",
                          color: "#448aff", cursor: "pointer", fontWeight: 600,
                        }}
                      >
                        Full Detail
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); flyTo(ev.lng, ev.lat, 10); }}
                        style={{
                          fontSize: 10, padding: "3px 10px", borderRadius: 4,
                          background: "rgba(0,230,118,0.1)", border: "1px solid rgba(0,230,118,0.3)",
                          color: "var(--green-primary)", cursor: "pointer", fontWeight: 600,
                        }}
                      >
                        Show on Map
                      </button>
                      {!summary && (
                        <button
                          onClick={(e) => { e.stopPropagation(); summarizeEvent(ev); }}
                          disabled={isSummarizing}
                          style={{
                            fontSize: 10, padding: "3px 10px", borderRadius: 4,
                            background: "rgba(187,134,252,0.1)", border: "1px solid rgba(187,134,252,0.3)",
                            color: "#bb86fc", cursor: "pointer", fontWeight: 600,
                            opacity: isSummarizing ? 0.6 : 1,
                          }}
                        >
                          {isSummarizing ? "..." : "Summarize"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "capitalize", flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: 11, color: "var(--text-secondary)", textAlign: "right",
        fontFamily: mono ? "var(--font-mono)" : "inherit",
      }}>
        {value}
      </span>
    </div>
  );
}
