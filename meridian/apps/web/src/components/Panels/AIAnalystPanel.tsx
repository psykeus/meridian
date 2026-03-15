import { useState, useRef, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { PanelHeader } from "@/components/Panel/PanelHeader";
import { useEventStore } from "@/stores/useEventStore";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

const EXAMPLE_QUERIES = [
  "What's happening near the Strait of Hormuz right now?",
  "Summarize all military activity in Eastern Europe in the last 48 hours",
  "Are there any earthquakes near nuclear facilities right now?",
  "What is the current threat level for maritime shipping in the Red Sea?",
  "Cross-reference today's oil price spike with any geopolitical events",
  "Show me current nuclear threat indicators",
  "What are the latest military aircraft movements?",
  "Summarize ongoing humanitarian crises",
  "Are there any active cyber threats or internet outages?",
  "What is the state of global shipping and supply chains?",
];

export function AIAnalystPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    const assistantMsg: ChatMessage = { role: "assistant", content: "", isStreaming: true };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const resp = await apiFetch("/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "content") {
              accumulated += parsed.text;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: accumulated,
                  isStreaming: true,
                };
                return updated;
              });
            }
          } catch {}
        }
      }

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: accumulated, isStreaming: false };
        return updated;
      });
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          isStreaming: false,
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader title="AI Analyst" sourceLabel="GPT-4o · Live Feeds" />

      {messages.length === 0 && (
        <div style={{ padding: 12, flex: 1 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
            Ask anything about live global intelligence:
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {EXAMPLE_QUERIES.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                style={{
                  padding: "4px 9px", fontSize: 11, borderRadius: 4,
                  background: "var(--bg-card)", border: "1px solid var(--border)",
                  color: "var(--text-secondary)", cursor: "pointer", textAlign: "left",
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "0 0 8px" }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid var(--border)",
              background: msg.role === "user" ? "var(--bg-hover)" : "transparent",
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: msg.role === "user" ? "var(--green-primary)" : "var(--blue-track)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              {msg.role === "user" ? "YOU" : "ANALYST"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {msg.role === "assistant" && !msg.isStreaming
                ? <MessageWithLocations text={msg.content} />
                : msg.content}
              {msg.isStreaming && <span style={{ opacity: 0.6, animation: "pulse 1s infinite" }}>▊</span>}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send(input))}
          placeholder="Ask the AI Analyst…"
          disabled={isLoading}
          style={{
            flex: 1, background: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "5px 10px",
            outline: "none",
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={isLoading || !input.trim()}
          style={{
            padding: "5px 12px", borderRadius: 4, fontSize: 12, fontWeight: 700,
            background: isLoading || !input.trim() ? "var(--bg-card)" : "var(--green-primary)",
            color: isLoading || !input.trim() ? "var(--text-muted)" : "var(--bg-app)",
            border: "none", cursor: isLoading || !input.trim() ? "default" : "pointer",
          }}
        >
          {isLoading ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}

// ── Parse AI responses for coordinate patterns and render "Show on map" buttons ──

const COORD_RE = /(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([NS])[\s,]+(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])/gi;
const LATLON_RE = /(?:lat(?:itude)?[:=\s]+)(-?\d{1,3}(?:\.\d+)?)[\s,]+(?:lo?ng?(?:itude)?[:=\s]+)(-?\d{1,3}(?:\.\d+)?)/gi;
const BRACKET_RE = /\[(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\]/g;

interface LocationMatch { lat: number; lng: number; label: string; index: number }

function extractLocations(text: string): LocationMatch[] {
  const results: LocationMatch[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;

  // 40.71°N, 74.01°W
  COORD_RE.lastIndex = 0;
  while ((m = COORD_RE.exec(text)) !== null) {
    let lat = parseFloat(m[1]); if (m[2].toUpperCase() === "S") lat = -lat;
    let lng = parseFloat(m[3]); if (m[4].toUpperCase() === "W") lng = -lng;
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    if (!seen.has(key) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      seen.add(key);
      results.push({ lat, lng, label: m[0], index: m.index });
    }
  }
  // lat: 40.71, lng: -74.01
  LATLON_RE.lastIndex = 0;
  while ((m = LATLON_RE.exec(text)) !== null) {
    const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    if (!seen.has(key) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      seen.add(key);
      results.push({ lat, lng, label: `${lat}, ${lng}`, index: m.index });
    }
  }
  // [40.71, -74.01]
  BRACKET_RE.lastIndex = 0;
  while ((m = BRACKET_RE.exec(text)) !== null) {
    const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    if (!seen.has(key) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      seen.add(key);
      results.push({ lat, lng, label: m[0], index: m.index });
    }
  }
  return results;
}

function MessageWithLocations({ text }: { text: string }) {
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);
  const locations = useMemo(() => extractLocations(text), [text]);

  if (locations.length === 0) return <>{text}</>;

  return (
    <>
      {text}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
        {locations.map((loc, i) => (
          <button
            key={i}
            onClick={() => {
              setSelectedEvent({
                id: `ai-loc-${Date.now()}-${i}`,
                title: `AI Reference: ${loc.label}`,
                body: "",
                lat: loc.lat,
                lng: loc.lng,
                category: "geopolitical",
                severity: "info",
                source_id: "ai_analyst",
                event_time: new Date().toISOString(),
                metadata: {},
              } as any);
            }}
            style={{
              padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 600,
              background: "rgba(68,138,255,0.12)", border: "1px solid rgba(68,138,255,0.3)",
              color: "#448aff", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3,
            }}
          >
            🗺 {loc.lat.toFixed(2)}, {loc.lng.toFixed(2)}
          </button>
        ))}
      </div>
    </>
  );
}
