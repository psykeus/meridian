import { PanelHeader } from "@/components/Panel/PanelHeader";
import { PanelSummaryCard } from "@/components/Panel/PanelSummaryCard";
import { useEventStore } from "@/stores/useEventStore";
import { SEVERITY_COLOR, timeAgo } from "@/lib/utils";

const REACTOR_STATUS = [
  { country: "United States", reactors: 93, status: "OPERATIONAL" },
  { country: "France",        reactors: 56, status: "OPERATIONAL" },
  { country: "China",         reactors: 55, status: "OPERATIONAL" },
  { country: "Russia",        reactors: 37, status: "OPERATIONAL" },
  { country: "South Korea",   reactors: 26, status: "OPERATIONAL" },
  { country: "India",         reactors: 23, status: "OPERATIONAL" },
  { country: "Ukraine",       reactors: 15, status: "REDUCED",     alert: true },
  { country: "Japan",         reactors: 10, status: "OPERATIONAL" },
];

const WEAPONS_WATCH = [
  { actor: "Iran",        program: "Uranium enrichment", level: "ELEVATED", color: "var(--red-critical)" },
  { actor: "North Korea", program: "ICBM/SLBM testing", level: "ELEVATED", color: "var(--red-critical)" },
  { actor: "Russia",      program: "Strategic posture",  level: "ELEVATED", color: "var(--red-critical)" },
  { actor: "Pakistan",    program: "Modernization",      level: "MONITOR",  color: "var(--orange-warning)" },
];

export function NuclearWMDPanel() {
  const events = useEventStore((s) =>
    s.getFilteredEvents()
      .filter((e) => e.source_id === "iaea_news" || e.category === "nuclear")
      .slice(0, 20)
  );
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader title="Nuclear & WMD Watch" sourceLabel="IAEA · NTI · EURDEP" eventCount={events.length} />
      <PanelSummaryCard topic="Nuclear & WMD Watch" contextHint="Active IAEA alerts, radiation anomalies, and nuclear weapons program indicators" />
      <div style={{ display: "flex", gap: 16, padding: "8px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <Kpi label="Reactors Online" value="315" color="var(--green-primary)" />
        <Kpi label="Radiation Anomalies" value={events.filter((e) => e.severity !== "info").length} color={events.filter((e) => e.severity !== "info").length > 0 ? "var(--orange-warning)" : "var(--text-muted)"} />
        <Kpi label="NRC Events (7d)" value="--" color="var(--text-muted)" />
      </div>

      {events.length > 0 && (
        <div style={{ maxHeight: 120, overflowY: "auto", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          {events.map((e) => (
            <div key={e.id} className="data-row" onClick={() => setSelectedEvent(e)}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: SEVERITY_COLOR[e.severity], flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</div>
              </div>
              <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>{timeAgo(e.event_time)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ padding: "8px 12px" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
            Weapons Programs
          </div>
          {WEAPONS_WATCH.map((w) => (
            <div key={w.actor} style={{ display: "flex", alignItems: "center", padding: "4px 0", borderBottom: "1px solid var(--border)", gap: 8 }}>
              <span style={{ fontSize: 13 }}>☢</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>{w.actor}</span>
                <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 6 }}>{w.program}</span>
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: w.color, letterSpacing: "0.05em" }}>{w.level}</span>
            </div>
          ))}

          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6, marginTop: 12 }}>
            Reactor Status by Country
          </div>
          {REACTOR_STATUS.map((r) => (
            <div key={r.country} style={{ display: "flex", alignItems: "center", padding: "3px 0", borderBottom: "1px solid var(--border)", gap: 8 }}>
              <div style={{ flex: 1, fontSize: 11, color: "var(--text-primary)" }}>{r.country}</div>
              <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{r.reactors}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: r.alert ? "var(--orange-warning)" : "var(--green-primary)", letterSpacing: "0.04em" }}>{r.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: "var(--font-mono)" }}>{value}</div>
    </div>
  );
}
