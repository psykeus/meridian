import { PanelHeader } from "@/components/Panel/PanelHeader";
import { PanelSummaryCard } from "@/components/Panel/PanelSummaryCard";
import { useEventStore } from "@/stores/useEventStore";
import { SEVERITY_COLOR, timeAgo } from "@/lib/utils";
import type { GeoEvent } from "@/types";

export function MarketsPanel() {
  const events = useEventStore((s) =>
    s.getFilteredEvents()
      .filter((e) => e.source_id === "alpha_vantage")
      .slice(0, 50)
  );
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader
        title="Markets & Finance"
        sourceLabel="Alpha Vantage"
        eventCount={events.length}
      />
      <PanelSummaryCard topic="Markets & Finance" contextHint="Market volatility, commodities, currency movements, and financial stress indicators" />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {events.length === 0
          ? <EmptyState message="No market data yet" />
          : events.map((e) => <MarketRow key={e.id} event={e} onClick={() => setSelectedEvent(e)} />)
        }
      </div>
    </div>
  );
}

function MarketRow({ event, onClick }: { event: GeoEvent; onClick: () => void }) {
  const meta = event.metadata as Record<string, unknown>;
  const price = meta?.price as number | undefined;
  const pct = meta?.change_pct as number | undefined;
  const symbol = meta?.symbol as string | undefined;
  const isUp = (pct ?? 0) >= 0;
  const color = SEVERITY_COLOR[event.severity];

  return (
    <div className="data-row" onClick={onClick}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 500 }}>{event.title}</div>
        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{timeAgo(event.event_time)}</div>
      </div>
      {price !== undefined && (
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
            {price < 10 ? price.toFixed(4) : price.toFixed(2)}
          </div>
          {pct !== undefined && pct !== 0 && (
            <div style={{ fontSize: 10, fontWeight: 700, color: isUp ? "#00e676" : "#ff5252" }}>
              {isUp ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
            </div>
          )}
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
