import { useState } from "react";

interface SitrepSection {
  heading: string;
  body: string;
}

interface SitrepResult {
  topic: string;
  region?: string;
  generated_at: string;
  sections: SitrepSection[];
  summary?: string;
  error?: string;
}

const SITREP_TEMPLATES = [
  { label: "Conflict Overview", topic: "active armed conflicts", region: "Global" },
  { label: "Humanitarian Crisis", topic: "humanitarian crises and displacement", region: "Africa" },
  { label: "Cyber Threat Landscape", topic: "recent cyberattacks and threat actors", region: undefined },
  { label: "Natural Disasters", topic: "natural disasters and environmental events", region: "Global" },
  { label: "Maritime Security", topic: "maritime incidents and piracy", region: "Indo-Pacific" },
  { label: "Energy Security", topic: "energy supply disruptions and infrastructure threats", region: "Europe" },
];

export function SitrepPage() {
  const [topic, setTopic] = useState("");
  const [region, setRegion] = useState("");
  const [loading, setLoading] = useState(false);
  const [sitrep, setSitrep] = useState<SitrepResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async (t?: string, r?: string) => {
    const useTopic = (t ?? topic).trim();
    const useRegion = (r ?? region).trim();
    if (!useTopic) return;
    setLoading(true);
    setError(null);
    setSitrep(null);
    try {
      const resp = await fetch("/ai/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: useTopic, region: useRegion || undefined }),
      });
      if (resp.ok) {
        setSitrep(await resp.json());
      } else {
        setError(`AI service error: ${resp.status}`);
      }
    } catch {
      setError("Cannot reach AI service. Ensure the AI sidecar is running.");
    } finally {
      setLoading(false);
    }
  };

  const loadTemplate = (t: typeof SITREP_TEMPLATES[0]) => {
    setTopic(t.topic);
    setRegion(t.region ?? "");
    void generate(t.topic, t.region ?? "");
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border)", background: "var(--bg-panel)" }}>
        <h1 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px 0" }}>Situation Report</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate()}
            placeholder="Topic (e.g. active armed conflicts in Sub-Saharan Africa)…"
            style={{ flex: 1, minWidth: 260, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "6px 12px", outline: "none" }}
          />
          <input
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="Region (optional)"
            style={{ width: 160, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "6px 12px", outline: "none" }}
          />
          <button
            onClick={() => generate()}
            disabled={loading || !topic.trim()}
            style={{ padding: "6px 18px", borderRadius: 4, background: loading ? "var(--border)" : "var(--green-primary)", color: loading ? "var(--text-muted)" : "var(--bg-app)", border: "none", cursor: loading ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700 }}
          >
            {loading ? "Generating…" : "Generate Sitrep"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", alignSelf: "center" }}>Templates:</span>
          {SITREP_TEMPLATES.map((t) => (
            <button
              key={t.label}
              onClick={() => loadTemplate(t)}
              disabled={loading}
              style={{ fontSize: 10, padding: "3px 8px", borderRadius: 3, background: "var(--bg-card)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-secondary)" }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {error && (
          <div style={{ padding: "12px 16px", borderRadius: 5, background: "rgba(255,82,82,0.1)", border: "1px solid var(--red-critical)", color: "var(--red-critical)", fontSize: 12, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: 60 }}>
            <div style={{ fontSize: 28, animation: "spin 2s linear infinite" }}>◎</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Generating situation report…</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>This may take 10–30 seconds depending on the AI model</div>
          </div>
        )}

        {!loading && !sitrep && !error && (
          <div style={{ textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>≡</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>Generate an Intelligence Sitrep</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Enter a topic or select a template above to generate an AI-powered situation report</div>
          </div>
        )}

        {sitrep && !loading && (
          <div style={{ maxWidth: 860, margin: "0 auto" }}>
            <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                  {sitrep.topic.charAt(0).toUpperCase() + sitrep.topic.slice(1)}
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {sitrep.region && (
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                      ⊕ {sitrep.region}
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    Generated {new Date(sitrep.generated_at).toLocaleString()}
                  </span>
                </div>
              </div>
              <button
                onClick={() => generate()}
                style={{ fontSize: 11, padding: "5px 12px", borderRadius: 4, background: "var(--bg-card)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-secondary)" }}
              >
                ↻ Regenerate
              </button>
            </div>

            {sitrep.summary && (
              <div style={{ padding: "14px 18px", borderRadius: 6, background: "rgba(0,230,118,0.05)", border: "1px solid rgba(0,230,118,0.2)", marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--green-primary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Executive Summary</div>
                <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6 }}>{sitrep.summary}</div>
              </div>
            )}

            {sitrep.error ? (
              <div style={{ fontSize: 12, color: "var(--red-critical)", padding: "12px 16px", borderRadius: 5, border: "1px solid var(--red-critical)", background: "rgba(255,82,82,0.05)" }}>
                {sitrep.error}
              </div>
            ) : (
              (sitrep.sections ?? []).map((section, idx) => (
                <div key={idx} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--green-primary)", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
                    {section.heading}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                    {section.body}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
