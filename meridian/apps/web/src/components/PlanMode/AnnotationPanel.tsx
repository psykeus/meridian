import { useState } from "react";
import { usePlanStore, type Annotation } from "@/stores/usePlanStore";

const ANNOTATION_TYPES = [
  { type: "poi",          label: "POI",          icon: "📍" },
  { type: "region",       label: "Region",        icon: "⬡" },
  { type: "route",        label: "Route",         icon: "↗" },
  { type: "range_circle", label: "Range Circle",  icon: "◎" },
  { type: "arrow",        label: "Arrow",         icon: "➤" },
  { type: "text",         label: "Text Label",    icon: "T" },
  { type: "freehand",     label: "Freehand",      icon: "✏" },
] as const;

const COLOR_PRESETS = ["#00e676", "#ff4444", "#ffaa00", "#4da6ff", "#cc44ff", "#ffffff", "#888888"];

interface Props {
  roomId: number;
  onAnnotationSelect?: (ann: Annotation) => void;
}

export function AnnotationPanel({ roomId, onAnnotationSelect }: Props) {
  const { annotations, addAnnotation } = usePlanStore();
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#00e676");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);

  const roomAnnotations = annotations.filter((a) => a.plan_room_id === roomId);

  const handleCreate = async () => {
    if (!activeTool) return;
    setCreating(true);
    try {
      const r = await fetch(`/api/v1/plan-rooms/${roomId}/annotations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}`,
        },
        body: JSON.stringify({
          annotation_type: activeTool,
          label: label.trim() || undefined,
          notes: notes.trim() || undefined,
          color,
          geom_json: {},
        }),
      });
      if (r.ok) {
        addAnnotation(await r.json());
        setLabel("");
        setNotes("");
        setActiveTool(null);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (annId: number) => {
    await fetch(`/api/v1/plan-rooms/${roomId}/annotations/${annId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` },
    });
    usePlanStore.setState((s) => ({ annotations: s.annotations.filter((a) => a.id !== annId) }));
  };

  const handleLockToggle = async (ann: Annotation) => {
    const action = ann.is_locked ? "unlock" : "lock";
    await fetch(`/api/v1/plan-rooms/${roomId}/annotations/${ann.id}/${action}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` },
    });
    usePlanStore.setState((s) => ({
      annotations: s.annotations.map((a) =>
        a.id === ann.id ? { ...a, is_locked: !a.is_locked } : a
      ),
    }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
          Drawing Tools
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 8 }}>
          {ANNOTATION_TYPES.map(({ type, label: tLabel, icon }) => (
            <button
              key={type}
              onClick={() => setActiveTool(activeTool === type ? null : type)}
              title={tLabel}
              style={{
                padding: "6px 4px", borderRadius: 4, fontSize: 11, border: "1px solid",
                cursor: "pointer", textAlign: "center",
                background: activeTool === type ? "var(--green-primary)" : "var(--bg-card)",
                borderColor: activeTool === type ? "var(--green-primary)" : "var(--border)",
                color: activeTool === type ? "var(--bg-app)" : "var(--text-primary)",
              }}
            >
              <div style={{ fontSize: 14, marginBottom: 2 }}>{icon}</div>
              <div style={{ fontSize: 9, lineHeight: 1 }}>{tLabel}</div>
            </button>
          ))}
        </div>

        {activeTool && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (optional)"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 11, padding: "4px 8px", outline: "none" }}
            />
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 11, padding: "4px 8px", outline: "none" }}
            />
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Color:</span>
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 16, height: 16, borderRadius: "50%", background: c, border: color === c ? "2px solid white" : "1px solid var(--border)", cursor: "pointer",
                  }}
                />
              ))}
            </div>
            <button
              onClick={handleCreate}
              disabled={creating}
              style={{ padding: "5px 0", borderRadius: 4, background: "var(--green-primary)", color: "var(--bg-app)", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >
              {creating ? "Adding…" : `Add ${ANNOTATION_TYPES.find((t) => t.type === activeTool)?.label}`}
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {roomAnnotations.length === 0 ? (
          <div style={{ padding: "20px 14px", fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
            No annotations yet.<br />Select a tool above to add one.
          </div>
        ) : (
          roomAnnotations.map((ann) => (
            <div
              key={ann.id}
              onClick={() => onAnnotationSelect?.(ann)}
              style={{
                padding: "8px 12px", borderBottom: "1px solid var(--border)", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: ann.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ann.label || ann.annotation_type}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "capitalize" }}>{ann.annotation_type.replace("_", " ")}</div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); handleLockToggle(ann); }}
                  title={ann.is_locked ? "Unlock" : "Lock"}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--text-muted)" }}
                >
                  {ann.is_locked ? "🔒" : "🔓"}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); if (!ann.is_locked) handleDelete(ann.id); }}
                  title={ann.is_locked ? "Unlock to delete" : "Delete"}
                  style={{ background: "none", border: "none", cursor: ann.is_locked ? "default" : "pointer", fontSize: 11, color: ann.is_locked ? "var(--text-muted)" : "var(--red-critical)", opacity: ann.is_locked ? 0.4 : 1 }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
