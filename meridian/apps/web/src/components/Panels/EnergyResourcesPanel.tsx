import { PanelHeader } from "@/components/Panel/PanelHeader";
import { PanelSummaryCard } from "@/components/Panel/PanelSummaryCard";

const GRID_DATA = [
  { label: "US Grid Load",    value: "71%",  status: "NORMAL",  color: "var(--green-primary)" },
  { label: "EU Grid Load",    value: "68%",  status: "NORMAL",  color: "var(--green-primary)" },
  { label: "ERCOT (Texas)",   value: "84%",  status: "ELEVATED",color: "var(--orange-warning)" },
  { label: "UK National Grid",value: "62%",  status: "NORMAL",  color: "var(--green-primary)" },
];

const COMMODITY_DATA = [
  { label: "WTI Crude",     value: "--",  unit: "$/bbl", trend: "→" },
  { label: "Brent Crude",   value: "--",  unit: "$/bbl", trend: "→" },
  { label: "Nat Gas (HH)",  value: "--",  unit: "$/MMBtu", trend: "→" },
  { label: "Coal (API2)",   value: "--",  unit: "$/t",   trend: "→" },
  { label: "Uranium (UxC)", value: "--",  unit: "$/lb",  trend: "→" },
  { label: "Oil Rig Count", value: "--",  unit: "rigs",  trend: "→" },
];

export function EnergyResourcesPanel() {
  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader title="Energy & Resources" sourceLabel="EIA · ENTSO-E" eventCount={0} />
      <PanelSummaryCard topic="Energy & Resources" contextHint="Grid utilization, LNG prices, oil & gas infrastructure status, and energy supply chain risk" />
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
          Grid Utilization
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {GRID_DATA.map((g) => (
            <div key={g.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 120, fontSize: 11, color: "var(--text-secondary)", flexShrink: 0 }}>{g.label}</div>
              <div style={{ flex: 1, height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: g.value, background: g.color, borderRadius: 2 }} />
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: g.color, fontFamily: "var(--font-mono)", width: 32, textAlign: "right" }}>{g.value}</span>
                <span style={{ fontSize: 8, fontWeight: 700, color: g.color, letterSpacing: "0.05em" }}>{g.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ padding: "8px 12px" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
            Energy Commodities
          </div>
          {COMMODITY_DATA.map((c) => (
            <div key={c.label} style={{ display: "flex", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1, fontSize: 12, color: "var(--text-primary)" }}>{c.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{c.value}</span>
                <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{c.unit}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{c.trend}</span>
              </div>
            </div>
          ))}
          <div style={{ marginTop: 12, padding: "8px", background: "var(--bg-card)", borderRadius: 4, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
              EIA + ENTSO-E integration pending. Data will populate automatically when the energy feed workers are active.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
