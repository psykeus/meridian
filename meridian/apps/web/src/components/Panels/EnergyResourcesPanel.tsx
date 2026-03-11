import { useMemo } from "react";
import { BarChart, Bar, XAxis, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { PanelHeader } from "@/components/Panel/PanelHeader";
import { PanelSummaryCard } from "@/components/Panel/PanelSummaryCard";
import { useFilteredEvents } from "@/stores/useFilteredEvents";
import { useEventStore } from "@/stores/useEventStore";
import { timeAgo } from "@/lib/utils";


export function EnergyResourcesPanel() {
  const allEvents = useFilteredEvents();
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);

  const energyEvents = useMemo(
    () => allEvents.filter((e) => e.source_id === "eia_grid" || e.source_id === "entso_e" || e.source_id === "baker_hughes").slice(0, 30),
    [allEvents],
  );

  // Extract grid utilization data from EIA/ENTSO-E events
  const gridData = useMemo(() => {
    const grid = energyEvents
      .filter((e) => {
        const meta = e.metadata as Record<string, unknown>;
        return meta?.load_pct !== undefined || meta?.utilization !== undefined;
      })
      .map((e) => {
        const meta = e.metadata as Record<string, unknown>;
        const pct = (meta.load_pct ?? meta.utilization ?? 0) as number;
        const status = pct > 85 ? "CRITICAL" : pct > 70 ? "ELEVATED" : "NORMAL";
        const color = pct > 85 ? "var(--red-critical)" : pct > 70 ? "var(--orange-warning)" : "var(--green-primary)";
        return { label: e.title.slice(0, 18), value: `${Math.round(pct)}%`, pct, status, color };
      })
      .slice(0, 6);

    // Fallback to default if no live data
    if (grid.length === 0) {
      return [
        { label: "US Grid Load",     value: "--", pct: 0, status: "AWAITING", color: "var(--text-muted)" },
        { label: "EU Grid Load",     value: "--", pct: 0, status: "AWAITING", color: "var(--text-muted)" },
        { label: "ERCOT (Texas)",    value: "--", pct: 0, status: "AWAITING", color: "var(--text-muted)" },
        { label: "UK National Grid", value: "--", pct: 0, status: "AWAITING", color: "var(--text-muted)" },
      ];
    }
    return grid;
  }, [energyEvents]);

  // Chart data from grid
  const chartData = useMemo(
    () => gridData.filter((g) => g.pct > 0).map((g) => ({ name: g.label, pct: g.pct, color: g.color })),
    [gridData],
  );

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader title="Energy & Resources" sourceLabel="EIA · ENTSO-E · Baker Hughes" eventCount={energyEvents.length} />
      <PanelSummaryCard topic="Energy & Resources" contextHint="Grid utilization, LNG prices, oil & gas infrastructure status, and energy supply chain risk" />

      {/* Grid utilization chart */}
      {chartData.length > 0 && (
        <div style={{ height: 70, padding: "4px 8px 0", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <XAxis dataKey="name" tick={{ fontSize: 8, fill: "#6b7a8d" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#0a0e1a", border: "1px solid #1e2a3a", borderRadius: 4, fontSize: 11 }} formatter={(v: number) => [`${v}%`, "Load"]} />
              <Bar dataKey="pct" radius={[2, 2, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.pct > 85 ? "#ff5252" : d.pct > 70 ? "#ff9800" : "#00e676"} fillOpacity={0.7} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Grid utilization bars */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
          Grid Utilization
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {gridData.map((g) => (
            <div key={g.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 120, fontSize: 11, color: "var(--text-secondary)", flexShrink: 0 }}>{g.label}</div>
              <div style={{ flex: 1, height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: g.pct > 0 ? `${g.pct}%` : "0%", background: g.color, borderRadius: 2, transition: "width 300ms" }} />
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: g.color, fontFamily: "var(--font-mono)", width: 32, textAlign: "right" }}>{g.value}</span>
                <span style={{ fontSize: 8, fontWeight: 700, color: g.color, letterSpacing: "0.05em" }}>{g.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Energy events list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {energyEvents.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
            Waiting for EIA, ENTSO-E, and Baker Hughes data feeds…
          </div>
        ) : (
          energyEvents.map((e) => (
            <div
              key={e.id}
              className="data-row"
              onClick={() => setSelectedEvent(e)}
              style={{ cursor: "pointer" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.title}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{timeAgo(e.event_time)}</div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 3, background: "var(--bg-card)", color: "var(--text-secondary)", textTransform: "uppercase", flexShrink: 0 }}>
                {e.source_id.replace("_", " ")}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
