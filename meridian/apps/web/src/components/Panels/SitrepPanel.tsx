import { useState, useRef } from "react";
import { PanelHeader } from "@/components/Panel/PanelHeader";

type Phase = "idle" | "scanning" | "drilling" | "assembling" | "complete";
type ReportSection = { heading: string; content: string };

const PHASE_LABEL: Record<Phase, string> = {
  idle:       "Ready",
  scanning:   "Scanning feeds…",
  drilling:   "Drilling down…",
  assembling: "Assembling report…",
  complete:   "Complete",
};

const PHASE_ORDER: Phase[] = ["scanning", "drilling", "assembling", "complete"];

export function SitrepPanel() {
  const [topic, setTopic] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function generate() {
    if (!topic.trim() || phase !== "idle") return;
    setError(null);
    setSections([]);
    abortRef.current = new AbortController();

    let phaseIndex = 0;
    const advance = () => {
      if (phaseIndex < PHASE_ORDER.length) setPhase(PHASE_ORDER[phaseIndex++]);
    };
    advance();
    const phaseTimer = setInterval(advance, 4000);

    try {
      const res = await fetch("/ai/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), stream: true }),
        signal: abortRef.current.signal,
      });
      clearInterval(phaseTimer);
      setPhase("complete");

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentHeading = "Executive Summary";
      let currentContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const data = line.startsWith("data: ") ? line.slice(6) : line;
          if (!data || data === "[DONE]") continue;
          try {
            const chunk = JSON.parse(data);
            const token: string = chunk?.choices?.[0]?.delta?.content ?? chunk?.content ?? data;
            if (token.startsWith("##")) {
              if (currentContent.trim()) setSections((s) => [...s, { heading: currentHeading, content: currentContent.trim() }]);
              currentHeading = token.replace(/^#+\s*/, "").trim();
              currentContent = "";
            } else {
              currentContent += token;
              setSections((s) => {
                const next = [...s];
                if (next.length > 0 && next[next.length - 1].heading === currentHeading) {
                  next[next.length - 1] = { heading: currentHeading, content: currentContent.trim() };
                } else {
                  next.push({ heading: currentHeading, content: currentContent.trim() });
                }
                return next;
              });
            }
          } catch { /* non-JSON chunk */ }
        }
      }
    } catch (err: unknown) {
      clearInterval(phaseTimer);
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
      setPhase("idle");
    }
  }

  function reset() {
    abortRef.current?.abort();
    setPhase("idle");
    setSections([]);
    setError(null);
  }

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader title="Situation Report Builder" sourceLabel="AI · All Feeds" eventCount={0} />

      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate()}
            placeholder="e.g. Red Sea shipping disruptions"
            disabled={phase !== "idle"}
            style={{ flex: 1, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, padding: "5px 8px", fontSize: 12, color: "var(--text-primary)", outline: "none" }}
          />
          {phase === "idle"
            ? <button onClick={generate} disabled={!topic.trim()}
                style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, background: "var(--green-primary)", color: "#000", border: "none", borderRadius: 4, cursor: "pointer" }}>
                Generate
              </button>
            : <button onClick={reset}
                style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, background: "transparent", color: "var(--red-critical)", border: "1px solid var(--red-critical)", borderRadius: 4, cursor: "pointer" }}>
                Cancel
              </button>
          }
        </div>
        {phase !== "idle" && phase !== "complete" && (
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green-primary)", animation: "pulse 1.2s infinite" }} />
            <span style={{ fontSize: 11, color: "var(--green-primary)" }}>{PHASE_LABEL[phase]}</span>
          </div>
        )}
        {error && <div style={{ marginTop: 4, fontSize: 11, color: "var(--red-critical)" }}>Error: {error}</div>}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: sections.length ? "8px 12px" : 0 }}>
        {sections.length === 0 && phase === "idle" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: 24 }}>
            Enter a topic above to generate an AI situation report
          </div>
        )}
        {sections.map((sec, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green-primary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
              {sec.heading}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {sec.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
