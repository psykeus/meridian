import { PanelHeader } from "@/components/Panel/PanelHeader";
import { PanelSummaryCard } from "@/components/Panel/PanelSummaryCard";
import { useEventStore } from "@/stores/useEventStore";
import { useFilteredEvents } from "@/stores/useFilteredEvents";
import { useArticleStore } from "@/stores/useArticleStore";
import { timeAgo } from "@/lib/utils";
import type { GeoEvent } from "@/types";

export function GlobalNewsFeedPanel() {
  const allEvents = useFilteredEvents();
  const events = allEvents
    .filter((e) => e.source_id === "rss_news" || e.source_id === "gdelt")
    .slice(0, 100);
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);
  const openArticle = useArticleStore((s) => s.open);

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader
        title="Global News Feed"
        sourceLabel="30+ Global Sources"
        eventCount={events.length}
      />
      <PanelSummaryCard topic="Global News Feed" contextHint="Current geopolitical news, conflict reports, and GDELT event signals" />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {events.length === 0
          ? <EmptyState message="No news events yet" />
          : events.map((e) => <NewsRow key={e.id} event={e} onClick={() => {
              if (e.url) {
                const lang = (e.metadata as Record<string, string>)?.language;
                openArticle(e.url, e.title, lang);
              } else { setSelectedEvent(e); }
            }} />)
        }
      </div>
    </div>
  );
}

function NewsRow({ event, onClick }: { event: GeoEvent; onClick: () => void }) {
  const source = (event.metadata as Record<string, string>)?.source ?? event.source_id.replace(/_/g, " ");

  return (
    <div className="data-row" onClick={onClick} style={{ flexDirection: "column", alignItems: "flex-start", gap: 3, padding: "8px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
        <span className="source-badge" style={{ flexShrink: 0 }}>{source}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>{timeAgo(event.event_time)}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.4 }}>
        {event.title}
      </div>
      {event.body && (
        <div
          style={{
            fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4,
            overflow: "hidden", textOverflow: "ellipsis",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
          }}
        >
          {event.body}
        </div>
      )}
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
