import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { PanelHeader } from "@/components/Panel/PanelHeader";
import { PanelSummaryCard } from "@/components/Panel/PanelSummaryCard";

interface DailyBrief {
  date: string;
  generated_at: string;
  executive_summary: string;
  category_summaries: Record<string, string>;
  event_counts: Record<string, number>;
  error?: string;
}

const CATEGORY_OPTIONS = [
  "environment", "military", "aviation", "maritime", "cyber",
  "finance", "geopolitical", "humanitarian", "nuclear", "space",
];

const REGION_OPTIONS = [
  "Global", "Middle East", "Eastern Europe", "East Asia",
  "Sub-Saharan Africa", "South Asia", "Latin America", "North America", "Western Europe",
];

export function DailyBriefPanel() {
  const [tab, setTab] = useState<"daily" | "personalized">("daily");
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Personalized brief state
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set(["military", "cyber", "geopolitical"]));
  const [regionFocus, setRegionFocus] = useState("Global");
  const [personalBrief, setPersonalBrief] = useState<string>("");
  const [personalLoading, setPersonalLoading] = useState(false);

  const fetchBrief = async () => {
    try {
      const resp = await apiFetch("/ai/brief/daily");
      if (resp.ok) setBrief(await resp.json());
    } catch {}
    finally { setLoading(false); }
  };

  const refreshBrief = async () => {
    setRefreshing(true);
    await apiFetch("/ai/brief/daily/refresh", { method: "POST" }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));
    await fetchBrief();
    setRefreshing(false);
  };

  const generatePersonalized = useCallback(async () => {
    setPersonalLoading(true);
    setPersonalBrief("");
    try {
      const resp = await apiFetch("/ai/brief/personalized", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          top_categories: [...selectedCats],
          region_focus: regionFocus === "Global" ? null : regionFocus,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setPersonalBrief(data.brief || "Unable to generate brief.");
      }
    } catch {
      setPersonalBrief("AI service unavailable. Check connection.");
    } finally {
      setPersonalLoading(false);
    }
  }, [selectedCats, regionFocus]);

  const toggleCat = (cat: string) => {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  useEffect(() => { fetchBrief(); }, []);

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader title="Intelligence Brief" sourceLabel="AI Analyst" />
      <PanelSummaryCard topic="Intelligence Brief" contextHint="Key developments from the past 24 hours across all monitored categories" />

      {/* Tab switcher */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        {(["daily", "personalized"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: "7px 0", border: "none", cursor: "pointer",
              fontSize: 11, fontWeight: 600, textTransform: "capitalize",
              background: tab === t ? "var(--bg-hover)" : "transparent",
              color: tab === t ? "var(--green-primary)" : "var(--text-muted)",
              borderBottom: tab === t ? "2px solid var(--green-primary)" : "2px solid transparent",
            }}
          >
            {t === "daily" ? "Daily Brief" : "Personalized"}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "daily" ? (
          <DailyTab
            brief={brief}
            loading={loading}
            refreshing={refreshing}
            expanded={expanded}
            setExpanded={setExpanded}
            onRefresh={refreshBrief}
          />
        ) : (
          <PersonalizedTab
            selectedCats={selectedCats}
            toggleCat={toggleCat}
            regionFocus={regionFocus}
            setRegionFocus={setRegionFocus}
            personalBrief={personalBrief}
            personalLoading={personalLoading}
            onGenerate={generatePersonalized}
          />
        )}
      </div>
    </div>
  );
}

// ── Daily Brief Tab ───────────────────────────────────────────────────────────

function DailyTab({
  brief, loading, refreshing, expanded, setExpanded, onRefresh,
}: {
  brief: DailyBrief | null; loading: boolean; refreshing: boolean;
  expanded: string | null; setExpanded: (v: string | null) => void; onRefresh: () => void;
}) {
  if (loading) {
    return <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>Loading brief…</div>;
  }

  if (!brief || brief.error) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          {brief?.error ?? "No daily brief yet. Generate one to get started."}
        </div>
        <button onClick={onRefresh} disabled={refreshing} style={btnStyle}>
          {refreshing ? "Generating…" : "Generate Brief"}
        </button>
      </div>
    );
  }

  return (
    <>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{brief.date}</span>
        <button onClick={onRefresh} disabled={refreshing} style={{ fontSize: 10, color: "var(--green-primary)", background: "none", border: "none", cursor: "pointer" }}>
          {refreshing ? "Regenerating…" : "↻ Refresh"}
        </button>
      </div>

      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
          Executive Summary
        </div>
        <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.6 }}>
          {brief.executive_summary}
        </div>
      </div>

      {Object.entries(brief.category_summaries).map(([cat, summary]) => (
        <div key={cat} style={{ borderBottom: "1px solid var(--border)" }}>
          <button
            onClick={() => setExpanded(expanded === cat ? null : cat)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", textTransform: "capitalize" }}>{cat}</span>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{brief.event_counts[cat] ?? 0} events</span>
            </div>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{expanded === cat ? "▴" : "▾"}</span>
          </button>
          {expanded === cat && (
            <div style={{ padding: "0 12px 10px", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>{summary}</div>
          )}
        </div>
      ))}
    </>
  );
}

// ── Personalized Brief Tab ────────────────────────────────────────────────────

function PersonalizedTab({
  selectedCats, toggleCat, regionFocus, setRegionFocus,
  personalBrief, personalLoading, onGenerate,
}: {
  selectedCats: Set<string>; toggleCat: (c: string) => void;
  regionFocus: string; setRegionFocus: (v: string) => void;
  personalBrief: string; personalLoading: boolean; onGenerate: () => void;
}) {
  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={sectionLabel}>Focus Categories</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {CATEGORY_OPTIONS.map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCat(cat)}
              style={{
                padding: "4px 10px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                cursor: "pointer", textTransform: "capitalize",
                background: selectedCats.has(cat) ? "var(--green-primary)" : "var(--bg-card)",
                color: selectedCats.has(cat) ? "var(--bg-app)" : "var(--text-secondary)",
                border: `1px solid ${selectedCats.has(cat) ? "var(--green-primary)" : "var(--border)"}`,
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={sectionLabel}>Regional Focus</div>
        <select
          value={regionFocus}
          onChange={(e) => setRegionFocus(e.target.value)}
          style={{
            width: "100%", background: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "6px 10px", outline: "none",
          }}
        >
          {REGION_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <button
        onClick={onGenerate}
        disabled={personalLoading || selectedCats.size === 0}
        style={{
          ...btnStyle,
          opacity: personalLoading || selectedCats.size === 0 ? 0.6 : 1,
          cursor: personalLoading || selectedCats.size === 0 ? "default" : "pointer",
        }}
      >
        {personalLoading ? "Generating Brief…" : "Generate Personalized Brief"}
      </button>

      {personalBrief && (
        <div style={{
          background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6,
          padding: 12,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#bb86fc", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
            Your Personalized Brief
          </div>
          <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {personalBrief}
          </div>
        </div>
      )}

      {!personalBrief && !personalLoading && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: 12 }}>
          Select your focus areas and generate a brief tailored to your priorities.
        </div>
      )}
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "var(--text-muted)",
  textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6,
};

const btnStyle: React.CSSProperties = {
  padding: "7px 14px", borderRadius: 4, fontSize: 12, fontWeight: 600,
  background: "var(--green-primary)", color: "var(--bg-app)", border: "none",
};
