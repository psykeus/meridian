import { useState, useRef } from "react";
import { apiFetch } from "@/lib/api";

interface PanelSummaryCardProps {
  topic: string;
  contextHint?: string;
}

export function PanelSummaryCard({ topic, contextHint }: PanelSummaryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function generate() {
    if (loading) return;
    if (generated && expanded) { setExpanded(false); return; }
    if (generated) { setExpanded(true); return; }

    setExpanded(true);
    setLoading(true);
    setSummary("");
    abortRef.current = new AbortController();

    const prompt = contextHint
      ? `Provide a concise 2-3 sentence intelligence summary for the "${topic}" panel. Context: ${contextHint}. Be direct, analytical, and factual.`
      : `Provide a concise 2-3 sentence intelligence summary for the "${topic}" panel. Focus on current threat indicators and notable patterns.`;

    try {
      const resp = await apiFetch("/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          stream: true,
        }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n").filter((l) => l.startsWith("data: "))) {
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "content") {
              accumulated += parsed.text;
              setSummary(accumulated);
            }
          } catch { /* non-JSON */ }
        }
      }
      setGenerated(true);
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        setSummary("Unable to generate summary. Check AI service connection.");
        setGenerated(true);
      }
    } finally {
      setLoading(false);
    }
  }

  function dismiss() {
    abortRef.current?.abort();
    setExpanded(false);
    setSummary("");
    setGenerated(false);
    setLoading(false);
  }

  return (
    <div style={{ borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 12px",
          cursor: "pointer",
          background: expanded ? "var(--bg-hover)" : "transparent",
          transition: "background 100ms",
        }}
        onClick={generate}
      >
        <span style={{ fontSize: 10, color: loading ? "var(--orange-warning)" : "var(--blue-track)", flexShrink: 0 }}>
          {loading ? "⟳" : "✦"}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--blue-track)", letterSpacing: "0.05em", flex: 1 }}>
          {loading ? "Generating summary…" : generated && expanded ? "AI SUMMARY" : "AI SUMMARY"}
        </span>
        {generated && (
          <button
            onClick={(e) => { e.stopPropagation(); dismiss(); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 10, padding: "0 2px" }}
            title="Clear summary"
          >
            ✕
          </button>
        )}
        <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
          {expanded ? "▾" : "▸"}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: "0 12px 8px", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          {loading && !summary && (
            <div style={{ display: "flex", gap: 4, alignItems: "center", color: "var(--text-muted)" }}>
              <span style={{ animation: "pulse 1s infinite" }}>●</span>
              <span>Analyzing current intelligence feed…</span>
            </div>
          )}
          {summary && (
            <span style={{ whiteSpace: "pre-wrap" }}>
              {summary}
              {loading && <span style={{ opacity: 0.5, animation: "pulse 1s infinite" }}>▊</span>}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
