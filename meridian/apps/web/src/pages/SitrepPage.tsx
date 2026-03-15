import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import type { FeedCategory, SeverityLevel } from "@/types";

/* ── Types ─────────────────────────────────────────────────────────────── */

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
  event_count?: number;
}

interface SitrepTemplate {
  id: string;
  label: string;
  topic: string;
  region?: string;
  systemPrompt?: string;
  temperature?: number;
  categories?: FeedCategory[];
  severities?: SeverityLevel[];
  hoursBack?: number;
  isBuiltIn?: boolean;
}

interface EventFilters {
  categories: FeedCategory[];
  severities: SeverityLevel[];
  hoursBack: number;
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const ALL_CATEGORIES: FeedCategory[] = [
  "geopolitical", "military", "environment", "cyber",
  "humanitarian", "aviation", "maritime", "nuclear",
  "space", "finance", "energy", "social",
];

const ALL_SEVERITIES: SeverityLevel[] = ["critical", "high", "medium", "low", "info"];

const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  critical: "var(--red-critical, #ff5252)",
  high: "#ff9800",
  medium: "#ffc107",
  low: "#2196f3",
  info: "#9e9e9e",
};

const BUILT_IN_TEMPLATES: SitrepTemplate[] = [
  { id: "builtin-conflict", label: "Conflict Overview", topic: "active armed conflicts", region: "Global", isBuiltIn: true, categories: ["geopolitical", "military"] },
  { id: "builtin-humanitarian", label: "Humanitarian Crisis", topic: "humanitarian crises and displacement", region: "Africa", isBuiltIn: true, categories: ["humanitarian"] },
  { id: "builtin-cyber", label: "Cyber Threat Landscape", topic: "recent cyberattacks and threat actors", isBuiltIn: true, categories: ["cyber"] },
  { id: "builtin-disasters", label: "Natural Disasters", topic: "natural disasters and environmental events", region: "Global", isBuiltIn: true, categories: ["environment"] },
  { id: "builtin-maritime", label: "Maritime Security", topic: "maritime incidents and piracy", region: "Indo-Pacific", isBuiltIn: true, categories: ["maritime"] },
  { id: "builtin-energy", label: "Energy Security", topic: "energy supply disruptions and infrastructure threats", region: "Europe", isBuiltIn: true, categories: ["energy"] },
];

const STORAGE_KEY = "meridian:sitrep-templates";

/* ── Helpers ───────────────────────────────────────────────────────────── */

function parseReportToSections(report: string): { sections: SitrepSection[]; summary?: string } {
  const sections: SitrepSection[] = [];
  const lines = report.split("\n");
  let heading = "";
  let body = "";

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,4}\s+(.+)/);
    if (headingMatch) {
      if (body.trim()) sections.push({ heading: heading || "Overview", body: body.trim() });
      heading = headingMatch[1].replace(/\*+/g, "").trim();
      body = "";
    } else {
      body += line + "\n";
    }
  }
  if (body.trim()) sections.push({ heading: heading || "Overview", body: body.trim() });

  let summary: string | undefined;
  const execIdx = sections.findIndex((s) => /executive\s+summary/i.test(s.heading));
  if (execIdx >= 0) {
    summary = sections[execIdx].body;
    sections.splice(execIdx, 1);
  }
  return { sections, summary };
}

function loadUserTemplates(): SitrepTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveUserTemplates(templates: SitrepTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

function genId() {
  return "tpl-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ── Inline styles ─────────────────────────────────────────────────────── */

const chipStyle = (active: boolean): React.CSSProperties => ({
  fontSize: 10,
  padding: "3px 8px",
  borderRadius: 3,
  background: active ? "rgba(0,230,118,0.15)" : "var(--bg-card)",
  border: `1px solid ${active ? "var(--green-primary)" : "var(--border)"}`,
  cursor: "pointer",
  color: active ? "var(--green-primary)" : "var(--text-secondary)",
  fontWeight: active ? 600 : 400,
  transition: "all 0.15s",
});

const btnStyle = (primary?: boolean, disabled?: boolean): React.CSSProperties => ({
  padding: "6px 14px",
  borderRadius: 4,
  background: disabled ? "var(--border)" : primary ? "var(--green-primary)" : "var(--bg-card)",
  color: disabled ? "var(--text-muted)" : primary ? "var(--bg-app)" : "var(--text-secondary)",
  border: primary ? "none" : "1px solid var(--border)",
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: 12,
  fontWeight: 700,
});

const inputStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text-primary)",
  fontSize: 12,
  padding: "6px 12px",
  outline: "none",
};

/* ── Component ─────────────────────────────────────────────────────────── */

export function SitrepPage() {
  const [topic, setTopic] = useState("");
  const [region, setRegion] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState(0.2);
  const [loading, setLoading] = useState(false);
  const [sitrep, setSitrep] = useState<SitrepResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filters, setFilters] = useState<EventFilters>({
    categories: [],
    severities: [],
    hoursBack: 72,
  });
  const [showFilters, setShowFilters] = useState(false);

  // Templates
  const [userTemplates, setUserTemplates] = useState<SitrepTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<SitrepTemplate | null>(null);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);

  useEffect(() => {
    setUserTemplates(loadUserTemplates());
  }, []);

  const allTemplates = [...BUILT_IN_TEMPLATES, ...userTemplates];

  // ── Filter toggles ──

  const toggleCategory = (cat: FeedCategory) => {
    setFilters((f) => ({
      ...f,
      categories: f.categories.includes(cat)
        ? f.categories.filter((c) => c !== cat)
        : [...f.categories, cat],
    }));
  };

  const toggleSeverity = (sev: SeverityLevel) => {
    setFilters((f) => ({
      ...f,
      severities: f.severities.includes(sev)
        ? f.severities.filter((s) => s !== sev)
        : [...f.severities, sev],
    }));
  };

  // ── Generate ──

  const generate = useCallback(async (overrides?: Partial<{ topic: string; region: string; systemPrompt: string; temperature: number; categories: FeedCategory[]; severities: SeverityLevel[]; hoursBack: number }>) => {
    const t = (overrides?.topic ?? topic).trim();
    const r = (overrides?.region ?? region).trim();
    if (!t) return;
    setLoading(true);
    setError(null);
    setSitrep(null);

    const cats = overrides?.categories ?? filters.categories;
    const sevs = overrides?.severities ?? filters.severities;
    const hours = overrides?.hoursBack ?? filters.hoursBack;
    const prompt = overrides?.systemPrompt ?? systemPrompt;
    const temp = overrides?.temperature ?? temperature;

    const payload: Record<string, unknown> = {
      topic: t,
      region: r || undefined,
      hours_back: hours,
    };
    if (cats.length > 0) payload.categories = cats;
    if (sevs.length > 0) payload.severities = sevs;
    if (prompt.trim()) payload.system_prompt = prompt.trim();
    if (temp !== 0.2) payload.temperature = temp;

    try {
      const resp = await apiFetch("/ai/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        const data = await resp.json();
        const { sections, summary } = parseReportToSections(data.report || "");
        setSitrep({
          topic: data.topic,
          region: data.region,
          generated_at: data.generated_at,
          sections,
          summary,
          event_count: data.event_count,
        });
      } else {
        setError(`AI service error: ${resp.status}`);
      }
    } catch {
      setError("Cannot reach AI service. Ensure the AI sidecar is running.");
    } finally {
      setLoading(false);
    }
  }, [topic, region, systemPrompt, temperature, filters]);

  // ── Template actions ──

  const loadTemplate = (t: SitrepTemplate) => {
    setTopic(t.topic);
    setRegion(t.region ?? "");
    setSystemPrompt(t.systemPrompt ?? "");
    setTemperature(t.temperature ?? 0.2);
    if (t.categories?.length) {
      setFilters((f) => ({ ...f, categories: t.categories! }));
    }
    if (t.severities?.length) {
      setFilters((f) => ({ ...f, severities: t.severities! }));
    }
    if (t.hoursBack) {
      setFilters((f) => ({ ...f, hoursBack: t.hoursBack! }));
    }
    void generate({
      topic: t.topic,
      region: t.region,
      systemPrompt: t.systemPrompt,
      temperature: t.temperature,
      categories: t.categories,
      severities: t.severities,
      hoursBack: t.hoursBack,
    });
  };

  const openNewTemplate = () => {
    setEditingTemplate({
      id: genId(),
      label: "",
      topic: topic || "",
      region: region || undefined,
      systemPrompt: systemPrompt || undefined,
      temperature: temperature,
      categories: filters.categories.length ? [...filters.categories] : undefined,
      severities: filters.severities.length ? [...filters.severities] : undefined,
      hoursBack: filters.hoursBack !== 72 ? filters.hoursBack : undefined,
    });
    setShowTemplateEditor(true);
  };

  const openEditTemplate = (t: SitrepTemplate) => {
    setEditingTemplate({ ...t });
    setShowTemplateEditor(true);
  };

  const saveTemplate = () => {
    if (!editingTemplate || !editingTemplate.label.trim()) return;
    const updated = userTemplates.filter((t) => t.id !== editingTemplate.id);
    updated.push({ ...editingTemplate, isBuiltIn: false });
    setUserTemplates(updated);
    saveUserTemplates(updated);
    setShowTemplateEditor(false);
    setEditingTemplate(null);
  };

  const deleteTemplate = (id: string) => {
    const updated = userTemplates.filter((t) => t.id !== id);
    setUserTemplates(updated);
    saveUserTemplates(updated);
    if (editingTemplate?.id === id) {
      setShowTemplateEditor(false);
      setEditingTemplate(null);
    }
  };

  const activeFilterCount = filters.categories.length + filters.severities.length + (filters.hoursBack !== 72 ? 1 : 0);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* ── Header bar ── */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border)", background: "var(--bg-panel)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Situation Report</h1>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setShowFilters(!showFilters)} style={btnStyle(false)}>
              {showFilters ? "Hide Filters" : "Filters"}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
            <button onClick={openNewTemplate} style={btnStyle(false)}>
              + Save Template
            </button>
          </div>
        </div>

        {/* Topic / Region / Generate */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate()}
            placeholder="Topic (e.g. active armed conflicts in Sub-Saharan Africa)..."
            style={{ ...inputStyle, flex: 1, minWidth: 260 }}
          />
          <input
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="Region (optional)"
            style={{ ...inputStyle, width: 160 }}
          />
          <button
            onClick={() => generate()}
            disabled={loading || !topic.trim()}
            style={btnStyle(true, loading || !topic.trim())}
          >
            {loading ? "Generating..." : "Generate Sitrep"}
          </button>
        </div>

        {/* ── Filter panel ── */}
        {showFilters && (
          <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--bg-card)", borderRadius: 6, border: "1px solid var(--border)" }}>
            {/* Categories */}
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginRight: 8 }}>Categories:</span>
              <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                {ALL_CATEGORIES.map((cat) => (
                  <button key={cat} onClick={() => toggleCategory(cat)} style={chipStyle(filters.categories.includes(cat))}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Severities */}
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginRight: 8 }}>Severity:</span>
              <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                {ALL_SEVERITIES.map((sev) => (
                  <button
                    key={sev}
                    onClick={() => toggleSeverity(sev)}
                    style={{
                      ...chipStyle(filters.severities.includes(sev)),
                      borderColor: filters.severities.includes(sev) ? SEVERITY_COLORS[sev] : "var(--border)",
                      color: filters.severities.includes(sev) ? SEVERITY_COLORS[sev] : "var(--text-secondary)",
                      background: filters.severities.includes(sev) ? `${SEVERITY_COLORS[sev]}20` : "var(--bg-card)",
                    }}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            {/* Hours back */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Time window:</span>
              {[6, 12, 24, 48, 72, 168].map((h) => (
                <button
                  key={h}
                  onClick={() => setFilters((f) => ({ ...f, hoursBack: h }))}
                  style={chipStyle(filters.hoursBack === h)}
                >
                  {h < 48 ? `${h}h` : `${h / 24}d`}
                </button>
              ))}
            </div>

            {/* System prompt override */}
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                System prompt (optional):
              </span>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Override the default analyst persona (leave blank for default)..."
                rows={2}
                style={{ ...inputStyle, width: "100%", resize: "vertical", fontFamily: "inherit" }}
              />
            </div>

            {/* Temperature */}
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Temperature:</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                style={{ width: 120 }}
              />
              <span style={{ fontSize: 11, color: "var(--text-secondary)", minWidth: 24 }}>{temperature}</span>
            </div>

            {activeFilterCount > 0 && (
              <button
                onClick={() => {
                  setFilters({ categories: [], severities: [], hoursBack: 72 });
                  setSystemPrompt("");
                  setTemperature(0.2);
                }}
                style={{ ...btnStyle(false), marginTop: 8, fontSize: 10, padding: "3px 10px" }}
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* ── Templates row ── */}
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Templates:</span>
          {allTemplates.map((t) => (
            <div key={t.id} style={{ display: "inline-flex", alignItems: "center", gap: 0 }}>
              <button
                onClick={() => loadTemplate(t)}
                disabled={loading}
                style={{
                  ...chipStyle(false),
                  borderTopRightRadius: t.isBuiltIn ? 3 : 0,
                  borderBottomRightRadius: t.isBuiltIn ? 3 : 0,
                }}
              >
                {t.label}
                {t.categories?.length ? ` [${t.categories.length}]` : ""}
              </button>
              {!t.isBuiltIn && (
                <>
                  <button
                    onClick={() => openEditTemplate(t)}
                    title="Edit template"
                    style={{ fontSize: 10, padding: "3px 5px", background: "var(--bg-card)", border: "1px solid var(--border)", borderLeft: "none", cursor: "pointer", color: "var(--text-muted)" }}
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => deleteTemplate(t.id)}
                    title="Delete template"
                    style={{ fontSize: 10, padding: "3px 5px", background: "var(--bg-card)", border: "1px solid var(--border)", borderLeft: "none", borderTopRightRadius: 3, borderBottomRightRadius: 3, cursor: "pointer", color: "var(--red-critical, #ff5252)" }}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Template editor modal ── */}
      {showTemplateEditor && editingTemplate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowTemplateEditor(false)}>
          <div style={{ background: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)", padding: 20, width: 520, maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 14px 0" }}>
              {userTemplates.find((t) => t.id === editingTemplate.id) ? "Edit Template" : "Save as Template"}
            </h2>

            <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Template Name *</label>
            <input
              value={editingTemplate.label}
              onChange={(e) => setEditingTemplate({ ...editingTemplate, label: e.target.value })}
              placeholder="e.g. Weekly Cyber Brief"
              style={{ ...inputStyle, width: "100%", marginBottom: 10 }}
            />

            <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Topic *</label>
            <input
              value={editingTemplate.topic}
              onChange={(e) => setEditingTemplate({ ...editingTemplate, topic: e.target.value })}
              placeholder="e.g. ransomware attacks targeting healthcare"
              style={{ ...inputStyle, width: "100%", marginBottom: 10 }}
            />

            <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Region</label>
            <input
              value={editingTemplate.region ?? ""}
              onChange={(e) => setEditingTemplate({ ...editingTemplate, region: e.target.value || undefined })}
              placeholder="e.g. North America"
              style={{ ...inputStyle, width: "100%", marginBottom: 10 }}
            />

            <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Categories</label>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
              {ALL_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    const cats = editingTemplate.categories ?? [];
                    setEditingTemplate({
                      ...editingTemplate,
                      categories: cats.includes(cat) ? cats.filter((c) => c !== cat) : [...cats, cat],
                    });
                  }}
                  style={chipStyle((editingTemplate.categories ?? []).includes(cat))}
                >
                  {cat}
                </button>
              ))}
            </div>

            <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Severities</label>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
              {ALL_SEVERITIES.map((sev) => (
                <button
                  key={sev}
                  onClick={() => {
                    const sevs = editingTemplate.severities ?? [];
                    setEditingTemplate({
                      ...editingTemplate,
                      severities: sevs.includes(sev) ? sevs.filter((s) => s !== sev) : [...sevs, sev],
                    });
                  }}
                  style={{
                    ...chipStyle((editingTemplate.severities ?? []).includes(sev)),
                    borderColor: (editingTemplate.severities ?? []).includes(sev) ? SEVERITY_COLORS[sev] : "var(--border)",
                    color: (editingTemplate.severities ?? []).includes(sev) ? SEVERITY_COLORS[sev] : "var(--text-secondary)",
                  }}
                >
                  {sev}
                </button>
              ))}
            </div>

            <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Time Window (hours)</label>
            <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
              {[6, 12, 24, 48, 72, 168].map((h) => (
                <button
                  key={h}
                  onClick={() => setEditingTemplate({ ...editingTemplate, hoursBack: h })}
                  style={chipStyle(editingTemplate.hoursBack === h)}
                >
                  {h < 48 ? `${h}h` : `${h / 24}d`}
                </button>
              ))}
            </div>

            <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>System Prompt</label>
            <textarea
              value={editingTemplate.systemPrompt ?? ""}
              onChange={(e) => setEditingTemplate({ ...editingTemplate, systemPrompt: e.target.value || undefined })}
              placeholder="Custom analyst persona (leave blank for default)..."
              rows={3}
              style={{ ...inputStyle, width: "100%", resize: "vertical", fontFamily: "inherit", marginBottom: 10 }}
            />

            <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Temperature: {editingTemplate.temperature ?? 0.2}</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={editingTemplate.temperature ?? 0.2}
              onChange={(e) => setEditingTemplate({ ...editingTemplate, temperature: parseFloat(e.target.value) })}
              style={{ width: "100%", marginBottom: 14 }}
            />

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowTemplateEditor(false)} style={btnStyle(false)}>Cancel</button>
              <button
                onClick={saveTemplate}
                disabled={!editingTemplate.label.trim() || !editingTemplate.topic.trim()}
                style={btnStyle(true, !editingTemplate.label.trim() || !editingTemplate.topic.trim())}
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Report content ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {error && (
          <div style={{ padding: "12px 16px", borderRadius: 5, background: "rgba(255,82,82,0.1)", border: "1px solid var(--red-critical)", color: "var(--red-critical)", fontSize: 12, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: 60 }}>
            <div style={{ fontSize: 28, animation: "spin 2s linear infinite" }}>◎</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Generating situation report...</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>This may take 10-30 seconds depending on the AI model</div>
          </div>
        )}

        {!loading && !sitrep && !error && (
          <div style={{ textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>≡</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>Generate an Intelligence Sitrep</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Enter a topic or select a template above to generate an AI-powered situation report</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>Use Filters to narrow events by category, severity, and time window</div>
          </div>
        )}

        {sitrep && !loading && (
          <div style={{ maxWidth: 860, margin: "0 auto" }}>
            <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                  {sitrep.topic.charAt(0).toUpperCase() + sitrep.topic.slice(1)}
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  {sitrep.region && (
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                      {sitrep.region}
                    </span>
                  )}
                  {sitrep.event_count != null && (
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, background: "rgba(0,230,118,0.1)", border: "1px solid rgba(0,230,118,0.2)", color: "var(--green-primary)" }}>
                      {sitrep.event_count} events matched
                    </span>
                  )}
                  {filters.categories.length > 0 && (
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                      [{filters.categories.join(", ")}]
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    Generated {new Date(sitrep.generated_at).toLocaleString()}
                  </span>
                </div>
              </div>
              <button onClick={() => generate()} style={btnStyle(false)}>
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
