import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { PanelHeader } from "@/components/Panel/PanelHeader";
import { PanelSummaryCard } from "@/components/Panel/PanelSummaryCard";
import { useEventStore } from "@/stores/useEventStore";
import { useFilteredEvents } from "@/stores/useFilteredEvents";
import { timeAgo } from "@/lib/utils";
import type { GeoEvent } from "@/types";

export function MarketsPanel() {
  const allEvents = useFilteredEvents();
  const events = allEvents
    .filter((e) => e.source_id === "alpha_vantage" || e.source_id === "finnhub_markets" || e.source_id === "coingecko")
    .slice(0, 50);
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);

  const chartData = useMemo(() =>
    events
      .filter((e) => (e.metadata as Record<string, unknown>)?.change_pct !== undefined)
      .map((e) => {
        const meta = e.metadata as Record<string, unknown>;
        return {
          name: (meta.symbol as string) || e.title.slice(0, 8),
          pct: meta.change_pct as number,
        };
      })
      .slice(0, 8),
    [events],
  );

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader
        title="Markets & Finance"
        sourceLabel="Alpha Vantage · Finnhub · CoinGecko"
        eventCount={events.length}
      />
      <PanelSummaryCard topic="Markets & Finance" contextHint="Market volatility, commodities, currency movements, and financial stress indicators" />
      {chartData.length > 0 && (
        <div style={{ height: 80, padding: "4px 8px 0", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#6b7a8d" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: "#6b7a8d" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`} />
              <Tooltip
                contentStyle={{ background: "#0a0e1a", border: "1px solid #1e2a3a", borderRadius: 4, fontSize: 11 }}
                formatter={(v: number) => [`${v > 0 ? "+" : ""}${v.toFixed(2)}%`, "Change"]}
              />
              <Bar dataKey="pct" radius={[2, 2, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.pct >= 0 ? "#00e676" : "#ff5252"} fillOpacity={0.7} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
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
  const isUp = (pct ?? 0) >= 0;

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
