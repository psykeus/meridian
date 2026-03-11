import { useEffect, useState } from "react";
import { PanelHeader } from "@/components/Panel/PanelHeader";
import { timeAgo } from "@/lib/utils";

interface IntelNote {
  id: number;
  title: string;
  body?: string;
  classification: string;
  tags: string[];
  is_pinned: boolean;
  created_at: string;
}

const CLASS_COLOR: Record<string, string> = {
  unclassified: "var(--green-primary)",
  restricted:   "var(--orange-warning)",
  confidential: "#ff9800",
  secret:       "var(--red-critical)",
};

interface Props {
  roomId: number;
}

export function IntelBoardPanel({ roomId }: Props) {
  const [notes, setNotes] = useState<IntelNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newClass, setNewClass] = useState("unclassified");
  const [pinned, setPinned] = useState(false);

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` };

  const fetchNotes = async () => {
    try {
      const r = await fetch(`/api/v1/plan-rooms/${roomId}/intel`, { headers });
      if (r.ok) setNotes(await r.json());
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchNotes(); }, [roomId]);

  const createNote = async () => {
    if (!newTitle.trim()) return;
    const r = await fetch(`/api/v1/plan-rooms/${roomId}/intel`, {
      method: "POST", headers,
      body: JSON.stringify({ title: newTitle.trim(), body: newBody.trim() || undefined, classification: newClass, is_pinned: pinned }),
    });
    if (r.ok) {
      const created: IntelNote = await r.json();
      setNotes((prev) => [created, ...prev]);
      setNewTitle(""); setNewBody(""); setShowForm(false);
    }
  };

  const togglePin = async (note: IntelNote) => {
    const r = await fetch(`/api/v1/plan-rooms/${roomId}/intel/${note.id}`, {
      method: "PATCH", headers,
      body: JSON.stringify({ is_pinned: !note.is_pinned }),
    });
    if (r.ok) setNotes((prev) => prev.map((n) => n.id === note.id ? { ...n, is_pinned: !note.is_pinned } : n));
  };

  const deleteNote = async (id: number) => {
    await fetch(`/api/v1/plan-rooms/${roomId}/intel/${id}`, { method: "DELETE", headers });
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const pinned_notes = notes.filter((n) => n.is_pinned);
  const regular_notes = notes.filter((n) => !n.is_pinned);

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader title="Intel Board" sourceLabel="Plan Room" eventCount={notes.length}>
        <button onClick={() => setShowForm(!showForm)} style={{ fontSize: 14, background: "none", border: "none", cursor: "pointer", color: "var(--green-primary)", padding: "0 4px" }}>+</button>
      </PanelHeader>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {showForm && (
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", background: "var(--bg-hover)" }}>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Intelligence note title…"
              style={{ width: "100%", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "5px 8px", outline: "none", marginBottom: 6 }} />
            <textarea value={newBody} onChange={(e) => setNewBody(e.target.value)} placeholder="Details…" rows={2}
              style={{ width: "100%", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 11, padding: "5px 8px", outline: "none", marginBottom: 6, resize: "none" }} />
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
              <select value={newClass} onChange={(e) => setNewClass(e.target.value)}
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: CLASS_COLOR[newClass], fontSize: 10, padding: "3px 6px", outline: "none" }}>
                {Object.keys(CLASS_COLOR).map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </select>
              <label style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
                Pin to board
              </label>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={createNote} style={{ padding: "4px 12px", borderRadius: 4, background: "var(--green-primary)", color: "var(--bg-app)", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Add</button>
              <button onClick={() => setShowForm(false)} style={{ padding: "4px 8px", borderRadius: 4, background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)", fontSize: 11, cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>Loading…</div>
        ) : notes.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>No intel notes yet</div>
        ) : (
          <>
            {pinned_notes.length > 0 && (
              <div style={{ padding: "6px 12px", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                ◈ Pinned
              </div>
            )}
            {[...pinned_notes, ...regular_notes].map((note) => (
              <div key={note.id} className="data-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{note.title}</div>
                    {note.body && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.4 }}>{note.body}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => togglePin(note)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: note.is_pinned ? "var(--green-primary)" : "var(--text-muted)" }} title={note.is_pinned ? "Unpin" : "Pin"}>
                      {note.is_pinned ? "◈" : "◇"}
                    </button>
                    <button onClick={() => deleteNote(note.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>✕</button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: CLASS_COLOR[note.classification] ?? "var(--text-muted)", textTransform: "uppercase" }}>
                    {note.classification}
                  </span>
                  {note.tags.map((tag) => (
                    <span key={tag} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                      {tag}
                    </span>
                  ))}
                  <span style={{ fontSize: 9, color: "var(--text-muted)", marginLeft: "auto" }}>{timeAgo(note.created_at)}</span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
