import { useState, useEffect, useCallback } from "react";
import { usePlanStore, type Annotation } from "@/stores/usePlanStore";

interface Comment {
  id: number;
  annotation_id: number;
  created_by: number | null;
  body: string;
  created_at: string;
  updated_at: string;
}

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
  const { annotations } = usePlanStore();
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#00e676");
  const [notes, setNotes] = useState("");
  const [selectedAnn, setSelectedAnn] = useState<Annotation | null>(null);

  const roomAnnotations = annotations.filter((a) => a.plan_room_id === roomId);

  const drawingMode = usePlanStore((s) => s.drawingMode);
  const setDrawingMode = usePlanStore((s) => s.setDrawingMode);

  const handleCreate = () => {
    if (!activeTool) return;
    setDrawingMode({
      type: activeTool,
      color,
      label: label.trim() || undefined,
      notes: notes.trim() || undefined,
      roomId,
    });
    setLabel("");
    setNotes("");
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
              disabled={!!drawingMode}
              style={{ padding: "5px 0", borderRadius: 4, background: drawingMode ? "var(--orange-warning)" : "var(--green-primary)", color: "var(--bg-app)", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >
              {drawingMode ? "Click on map to place…" : `Place ${ANNOTATION_TYPES.find((t) => t.type === activeTool)?.label} on Map`}
            </button>
            {drawingMode && (
              <button
                onClick={() => setDrawingMode(null)}
                style={{ padding: "4px 0", borderRadius: 4, background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)", fontSize: 10, cursor: "pointer" }}
              >
                Cancel (Esc)
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {selectedAnn ? (
          <div>
            <button
              onClick={() => setSelectedAnn(null)}
              style={{ width: "100%", padding: "6px 12px", background: "var(--bg-hover)", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", fontSize: 10, color: "var(--text-muted)", textAlign: "left" }}
            >
              &larr; Back to annotations
            </button>
            <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: selectedAnn.color, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{selectedAnn.label || selectedAnn.annotation_type}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "capitalize" }}>{selectedAnn.annotation_type.replace("_", " ")}</div>
              </div>
            </div>
            <CommentThread roomId={roomId} annotationId={selectedAnn.id} />
          </div>
        ) : roomAnnotations.length === 0 ? (
          <div style={{ padding: "20px 14px", fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
            No annotations yet.<br />Select a tool above to add one.
          </div>
        ) : (
          roomAnnotations.map((ann) => (
            <div
              key={ann.id}
              onClick={() => { setSelectedAnn(ann); onAnnotationSelect?.(ann); }}
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

// ── Comment Thread ────────────────────────────────────────────────────────────

function CommentThread({ roomId, annotationId }: { roomId: number; annotationId: number }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  const authHeader = { Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` };
  const base = `/api/v1/plan-rooms/${roomId}/annotations/${annotationId}/comments`;

  const fetchComments = useCallback(async () => {
    try {
      const resp = await fetch(base, { headers: authHeader });
      if (resp.ok) setComments(await resp.json());
    } catch {}
    finally { setLoading(false); }
  }, [roomId, annotationId]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const handlePost = async () => {
    if (!body.trim() || posting) return;
    setPosting(true);
    try {
      const resp = await fetch(base, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      if (resp.ok) {
        const comment = await resp.json();
        setComments((prev) => [...prev, comment]);
        setBody("");
      }
    } catch {}
    finally { setPosting(false); }
  };

  const handleDelete = async (commentId: number) => {
    await fetch(`${base}/${commentId}`, { method: "DELETE", headers: authHeader });
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "8px 12px", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid var(--border)" }}>
        Comments {comments.length > 0 && `(${comments.length})`}
      </div>

      {loading ? (
        <div style={{ padding: 12, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>Loading…</div>
      ) : comments.length === 0 ? (
        <div style={{ padding: 12, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>No comments yet</div>
      ) : (
        comments.map((c) => (
          <div key={c.id} style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                User #{c.created_by ?? "?"} &middot; {timeAgo(c.created_at)}
              </span>
              <button
                onClick={() => handleDelete(c.id)}
                title="Delete comment"
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "var(--text-muted)", padding: 0 }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-primary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{c.body}</div>
          </div>
        ))
      )}

      <div style={{ padding: "8px 12px", display: "flex", gap: 6 }}>
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handlePost(); } }}
          placeholder="Add a comment…"
          style={{
            flex: 1, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4,
            color: "var(--text-primary)", fontSize: 11, padding: "5px 8px", outline: "none",
          }}
        />
        <button
          onClick={handlePost}
          disabled={posting || !body.trim()}
          style={{
            padding: "5px 10px", borderRadius: 4, fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer",
            background: posting || !body.trim() ? "var(--border)" : "var(--green-primary)",
            color: posting || !body.trim() ? "var(--text-muted)" : "var(--bg-app)",
          }}
        >
          {posting ? "…" : "Post"}
        </button>
      </div>
    </div>
  );
}
