import { useState, useEffect, useCallback } from "react";
import { usePlanStore } from "@/stores/usePlanStore";

interface Props {
  roomId: number;
  roomName: string;
  onExit: () => void;
}

export function BriefingMode({ roomId, roomName, onExit }: Props) {
  const { annotations } = usePlanStore();
  const [isBriefer, setIsBriefer] = useState(true);
  const [spotlightAnn, setSpotlightAnn] = useState<number | null>(null);
  const [pointerActive, setPointerActive] = useState(false);

  const roomAnnotations = annotations.filter((a) => a.plan_room_id === roomId);

  const broadcastPointer = useCallback(() => {
    setPointerActive(true);
    setTimeout(() => setPointerActive(false), 2000);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
      if (e.key === "p" || e.key === "P") broadcastPointer();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onExit, broadcastPointer]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.92)",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{
        height: 48, flexShrink: 0, borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", padding: "0 20px", gap: 16,
        background: "var(--bg-panel)",
      }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff4444", animation: "pulse 1.5s infinite" }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
          BRIEFING MODE — {roomName}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-muted)", padding: "2px 8px", borderRadius: 3, background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          {isBriefer ? "You are BRIEFER" : "Audience Mode"}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={() => setIsBriefer((b) => !b)}
            style={{ padding: "4px 12px", borderRadius: 4, fontSize: 11, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-muted)", cursor: "pointer" }}
          >
            {isBriefer ? "Switch to Audience" : "Take Briefer Role"}
          </button>
          <button
            onClick={broadcastPointer}
            title="Broadcast pointer attention pulse (P)"
            style={{ padding: "4px 12px", borderRadius: 4, fontSize: 11, border: "1px solid var(--orange-warning)", background: pointerActive ? "var(--orange-warning)" : "transparent", color: pointerActive ? "var(--bg-app)" : "var(--orange-warning)", cursor: "pointer" }}
          >
            ⚡ Pointer
          </button>
          <button
            onClick={onExit}
            style={{ padding: "4px 12px", borderRadius: 4, fontSize: 11, background: "var(--red-critical)", color: "white", border: "none", cursor: "pointer" }}
          >
            Exit Briefing
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ width: 240, flexShrink: 0, borderRight: "1px solid var(--border)", background: "var(--bg-panel)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Annotations ({roomAnnotations.length})
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {roomAnnotations.map((ann) => (
              <button
                key={ann.id}
                onClick={() => setSpotlightAnn(spotlightAnn === ann.id ? null : ann.id)}
                style={{
                  width: "100%", textAlign: "left", padding: "8px 14px",
                  background: spotlightAnn === ann.id ? "rgba(0,230,118,0.1)" : "transparent",
                  border: "none", borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                  borderLeft: spotlightAnn === ann.id ? `3px solid ${ann.color}` : "3px solid transparent",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: ann.color, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>
                      {ann.label || ann.annotation_type}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "capitalize" }}>
                      {ann.annotation_type.replace("_", " ")}
                    </div>
                  </div>
                  {spotlightAnn === ann.id && (
                    <span style={{ marginLeft: "auto", fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "var(--green-primary)", color: "var(--bg-app)" }}>
                      SPOTLIGHT
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, position: "relative" }}>
          {pointerActive && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "none",
            }}>
              <div style={{ width: 80, height: 80, borderRadius: "50%", border: "3px solid var(--orange-warning)", animation: "ripple 1s ease-out" }} />
            </div>
          )}

          {spotlightAnn ? (
            <div style={{ maxWidth: 500, textAlign: "center" }}>
              {(() => {
                const ann = roomAnnotations.find((a) => a.id === spotlightAnn);
                return ann ? (
                  <div>
                    <div style={{ fontSize: 28, marginBottom: 12 }}>
                      {ann.annotation_type === "poi" ? "📍" : ann.annotation_type === "region" ? "⬡" : "📌"}
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: ann.color, marginBottom: 8 }}>
                      {ann.label || ann.annotation_type}
                    </div>
                    {ann.notes && (
                      <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                        {ann.notes}
                      </div>
                    )}
                  </div>
                ) : null;
              })()}
            </div>
          ) : (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>🗺</div>
              <div style={{ fontSize: 16, color: "var(--text-muted)" }}>Map canvas area</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                Select an annotation to spotlight it · Press P to broadcast pointer
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                ESC to exit briefing mode
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes ripple { 0%{transform:scale(0.5);opacity:1} 100%{transform:scale(2);opacity:0} }
      `}</style>
    </div>
  );
}
