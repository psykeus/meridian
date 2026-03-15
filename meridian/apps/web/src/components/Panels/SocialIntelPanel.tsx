import { useState } from "react";
import { PanelHeader } from "@/components/Panel/PanelHeader";
import { PanelSummaryCard } from "@/components/Panel/PanelSummaryCard";
import { useEventStore } from "@/stores/useEventStore";
import { useFilteredEvents } from "@/stores/useFilteredEvents";
import { timeAgo } from "@/lib/utils";
import type { GeoEvent } from "@/types";

const SOURCE_TYPE: Record<string, string> = {
  rss_news: "MEDIA",
  gdelt: "WIRE",
  who_outbreaks: "GOV",
  reliefweb: "NGO",
  acled: "ANALYST",
  promed_rss: "MED",
};

const SIGNAL_SCORE = (e: GeoEvent): number => {
  const base: Record<string, number> = { critical: 95, high: 80, medium: 55, low: 30, info: 15 };
  return base[e.severity] ?? 20;
};

export function SocialIntelPanel() {
  const [minSignal, setMinSignal] = useState(30);
  const allEvents = useFilteredEvents();
  const events = allEvents
      .filter((e) => ["rss_news", "gdelt", "who_outbreaks", "reliefweb", "acled", "promed_rss"].includes(e.source_id))
      .filter((e) => SIGNAL_SCORE(e) >= minSignal)
      .slice(0, 60);
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader title="Social Intel Feed" sourceLabel="OSINT · Wire · Gov" eventCount={events.length} />
      <PanelSummaryCard topic="Social Intel Feed" contextHint="OSINT signals, social media intelligence, emerging narratives, and information operations indicators" />
      <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "6px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <span style={{ fontSize: 9, color: "var(--text-muted)", marginRight: 2 }}>SIG≥</span>
        {[15, 30, 55, 80].map((v) => (
          <button key={v} onClick={() => setMinSignal(v)}
            style={{ padding: "3px 5px", fontSize: 9, fontWeight: 700, borderRadius: 3, border: "1px solid",
              borderColor: minSignal === v ? "var(--green-primary)" : "var(--border)",
              background: minSignal === v ? "rgba(0,230,118,0.1)" : "transparent",
              color: minSignal === v ? "var(--green-primary)" : "var(--text-muted)",
              cursor: "pointer", lineHeight: 1, minWidth: 24, textAlign: "center" as const }}>
            {v}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {events.length === 0
          ? <EmptyState />
          : events.map((e) => <IntelRow key={e.id} event={e} onClick={() => setSelectedEvent(e)} />)
        }
      </div>
    </div>
  );
}

function IntelRow({ event, onClick }: { event: GeoEvent; onClick: () => void }) {
  const score = SIGNAL_SCORE(event);
  const scoreColor = score >= 80 ? "var(--red-critical)" : score >= 55 ? "var(--orange-warning)" : "var(--text-muted)";
  const srcType = SOURCE_TYPE[event.source_id] ?? "SRC";

  return (
    <div className="data-row" onClick={onClick}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0, width: 32 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor, fontFamily: "var(--font-mono)" }}>{score}</span>
        <span style={{ fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em" }}>{srcType}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {event.title}
        </div>
        {event.body && (
          <div style={{ fontSize: 10, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {event.body}
          </div>
        )}
      </div>
      <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>{timeAgo(event.event_time)}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 12, color: "var(--text-muted)" }}>
      No OSINT signals above threshold
    </div>
  );
}
