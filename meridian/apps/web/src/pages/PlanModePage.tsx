import { useEffect, useState } from "react";
import { usePlanStore, type PlanRoom, type Task } from "@/stores/usePlanStore";
import { AnnotationPanel } from "@/components/PlanMode/AnnotationPanel";
import { BriefingMode } from "@/components/PlanMode/BriefingMode";
import { timeAgo } from "@/lib/utils";

const TASK_STATUSES = ["to_monitor", "assigned", "active_watch", "escalated", "completed"];
const STATUS_LABEL: Record<string, string> = {
  to_monitor: "To Monitor", assigned: "Assigned",
  active_watch: "Active Watch", escalated: "Escalated", completed: "Completed",
};
const STATUS_COLOR: Record<string, string> = {
  to_monitor: "var(--text-muted)", assigned: "var(--blue-track)",
  active_watch: "var(--orange-warning)", escalated: "var(--red-critical)", completed: "var(--green-primary)",
};
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}`,
});

export function PlanModePage() {
  const { rooms, activeRoomId, fetchRooms, setActiveRoom, fetchRoomData } = usePlanStore();
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);
  useEffect(() => { if (activeRoomId) fetchRoomData(activeRoomId); }, [activeRoomId, fetchRoomData]);

  const activeRoom = rooms.find((r) => r.id === activeRoomId);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ width: 240, flexShrink: 0, borderRight: "1px solid var(--border)", background: "var(--bg-panel)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>Plan Rooms</span>
          <button onClick={() => setShowCreate(true)} style={{ fontSize: 18, lineHeight: 1, background: "none", border: "none", cursor: "pointer", color: "var(--green-primary)" }} title="New Plan Room">+</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {showCreate && <CreateRoomForm onClose={() => { setShowCreate(false); fetchRooms(); }} />}
          {rooms.length === 0 && !showCreate && (
            <div style={{ padding: "20px 14px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>No plan rooms yet.<br />Create one to start collaborating.</div>
          )}
          {rooms.map((room) => (
            <button key={room.id} onClick={() => setActiveRoom(room.id)} style={{
              width: "100%", textAlign: "left", padding: "10px 14px",
              background: activeRoomId === room.id ? "var(--bg-hover)" : "transparent",
              border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer",
              borderLeft: activeRoomId === room.id ? "2px solid var(--green-primary)" : "2px solid transparent",
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{room.name}</div>
              {room.description && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{room.description}</div>}
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>{timeAgo(room.created_at)}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!activeRoomId ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 32 }}>⊕</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Select a Plan Room</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Choose a room or create a new one</div>
          </div>
        ) : activeRoom ? (
          <RoomDetail room={activeRoom} />
        ) : null}
      </div>
    </div>
  );
}

type RoomTab = "tasks" | "timeline" | "annotations" | "intel" | "members";

function RoomDetail({ room }: { room: PlanRoom }) {
  const [activeTab, setActiveTab] = useState<RoomTab>("tasks");
  const [briefingMode, setBriefingMode] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const TABS: { id: RoomTab; label: string }[] = [
    { id: "tasks", label: "Tasks" },
    { id: "timeline", label: "Timeline" },
    { id: "annotations", label: "Annotations" },
    { id: "intel", label: "Intel" },
    { id: "members", label: "Members" },
  ];

  const handleExport = async (format: "json" | "geojson" | "kml") => {
    setShowExport(false);
    const url = `/api/v1/plan-rooms/${room.id}/export/${format}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` } });
    if (!r.ok) return;
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `plan-room-${room.id}.${format}`;
    a.click();
  };

  const handleShare = async () => {
    setShowExport(false);
    const r = await fetch(`/api/v1/plan-rooms/${room.id}/share`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ label: "Shared link", expires_days: 7 }),
    });
    if (r.ok) {
      const { token } = await r.json();
      const url = `${window.location.origin}/api/v1/plan-rooms/view/${token}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url).catch(() => {});
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {briefingMode && <BriefingMode roomId={room.id} roomName={room.name} onExit={() => setBriefingMode(false)} />}

      <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{room.name}</div>
          {room.description && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{room.description}</div>}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={() => setBriefingMode(true)} style={{ padding: "4px 10px", borderRadius: 4, fontSize: 11, background: "rgba(255,68,68,0.15)", border: "1px solid var(--red-critical)", color: "var(--red-critical)", cursor: "pointer" }}>
            📡 Brief
          </button>
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowExport((v) => !v)} style={{ padding: "4px 10px", borderRadius: 4, fontSize: 11, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)", cursor: "pointer" }}>
              ↓ Export
            </button>
            {showExport && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, zIndex: 100, minWidth: 160, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
                {(["json", "geojson", "kml"] as const).map((fmt) => (
                  <button key={fmt} onClick={() => handleExport(fmt)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 14px", background: "none", border: "none", fontSize: 12, color: "var(--text-primary)", cursor: "pointer", borderBottom: "1px solid var(--border)" }}>
                    Export as {fmt.toUpperCase()}
                  </button>
                ))}
                <button onClick={handleShare} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 14px", background: "none", border: "none", fontSize: 12, color: "var(--green-primary)", cursor: "pointer" }}>
                  🔗 Copy share link
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {shareUrl && (
        <div style={{ padding: "6px 16px", background: "rgba(0,230,118,0.08)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--green-primary)" }}>Share link copied!</span>
          <code style={{ fontSize: 10, color: "var(--text-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shareUrl}</code>
          <button onClick={() => setShareUrl(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--text-muted)" }}>✕</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 1, background: "var(--bg-card)", padding: "4px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        {TABS.map(({ id, label }) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{
            padding: "4px 12px", borderRadius: 3, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer",
            background: activeTab === id ? "var(--bg-panel)" : "transparent",
            color: activeTab === id ? "var(--text-primary)" : "var(--text-muted)",
          }}>{label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "hidden" }}>
        {activeTab === "tasks" && <TaskBoard roomId={room.id} />}
        {activeTab === "timeline" && <TimelinePanel roomId={room.id} />}
        {activeTab === "annotations" && <AnnotationPanel roomId={room.id} />}
        {activeTab === "intel" && <IntelTab roomId={room.id} />}
        {activeTab === "members" && <MembersTab roomId={room.id} />}
      </div>
    </div>
  );
}

function TaskBoard({ roomId }: { roomId: number }) {
  const { tasks, addTask, updateTask, removeTask } = usePlanStore();
  const [newTitle, setNewTitle] = useState("");

  const createTask = async () => {
    if (!newTitle.trim()) return;
    const r = await fetch(`/api/v1/plan-rooms/${roomId}/tasks`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ title: newTitle.trim() }) });
    if (r.ok) { addTask(await r.json()); setNewTitle(""); }
  };

  const patchTask = async (id: number, patch: Partial<Task>) => {
    const r = await fetch(`/api/v1/plan-rooms/${roomId}/tasks/${id}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(patch) });
    if (r.ok) updateTask(id, patch);
  };

  const deleteTask = async (id: number) => {
    await fetch(`/api/v1/plan-rooms/${roomId}/tasks/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` } });
    removeTask(id);
  };

  const grouped = TASK_STATUSES.reduce<Record<string, Task[]>>((acc, s) => {
    acc[s] = tasks.filter((t) => t.plan_room_id === roomId && t.status === s);
    return acc;
  }, {});

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: 8 }}>
        <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createTask()} placeholder="Add task…"
          style={{ flex: 1, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "5px 10px", outline: "none" }} />
        <button onClick={createTask} style={{ padding: "5px 12px", borderRadius: 4, background: "var(--green-primary)", color: "var(--bg-app)", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Add</button>
      </div>
      <div style={{ flex: 1, overflowX: "auto", display: "flex", gap: 12, padding: 16 }}>
        {TASK_STATUSES.map((status) => (
          <div key={status} style={{ minWidth: 200, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLOR[status], display: "inline-block" }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{STATUS_LABEL[status]}</span>
              <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: "auto" }}>{grouped[status].length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {grouped[status].map((task) => (
                <div key={task.id} style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 5, padding: "8px 10px" }}>
                  <div style={{ fontSize: 12, color: "var(--text-primary)", marginBottom: 6 }}>{task.title}</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {TASK_STATUSES.filter((s) => s !== status).map((s) => (
                      <button key={s} onClick={() => patchTask(task.id, { status: s })}
                        style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "var(--bg-card)", border: "1px solid var(--border)", cursor: "pointer", color: STATUS_COLOR[s] }}>
                        → {STATUS_LABEL[s]}
                      </button>
                    ))}
                    <button onClick={() => deleteTask(task.id)}
                      style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", marginLeft: "auto" }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelinePanel({ roomId }: { roomId: number }) {
  const { timeline, addTimelineEntry } = usePlanStore();
  const entries = timeline.filter((e) => e.plan_room_id === roomId);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  const addEntry = async () => {
    if (!title.trim()) return;
    const r = await fetch(`/api/v1/plan-rooms/${roomId}/timeline`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ title: title.trim(), body: body.trim() || undefined, entry_time: new Date().toISOString() }),
    });
    if (r.ok) { addTimelineEntry(await r.json()); setTitle(""); setBody(""); }
  };

  const getAISummary = async () => {
    setSummarizing(true);
    setSummary("");
    try {
      const r = await fetch(`/api/v1/plan-rooms/${roomId}/timeline/summary`, { headers: { Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` } });
      if (!r.body) return;
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ") && !line.includes("[DONE]")) {
            try { const d = JSON.parse(line.slice(6)); if (d.text) { text += d.text; setSummary(text); } } catch {}
          }
        }
      }
    } finally { setSummarizing(false); }
  };

  const exportJSON = async () => {
    const r = await fetch(`/api/v1/plan-rooms/${roomId}/export/json`, { headers: { Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` } });
    if (!r.ok) return;
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `timeline-${roomId}.json`;
    a.click();
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEntry()} placeholder="New entry title…"
            style={{ flex: 1, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "5px 10px", outline: "none" }} />
          <button onClick={addEntry} style={{ padding: "5px 12px", borderRadius: 4, background: "var(--green-primary)", color: "var(--bg-app)", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Add</button>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={getAISummary} disabled={summarizing || entries.length === 0}
            style={{ padding: "4px 10px", borderRadius: 4, fontSize: 11, background: "rgba(0,230,118,0.12)", border: "1px solid var(--green-primary)", color: "var(--green-primary)", cursor: "pointer" }}>
            {summarizing ? "Summarizing…" : "✦ AI Summary"}
          </button>
          <button onClick={exportJSON} style={{ padding: "4px 10px", borderRadius: 4, fontSize: 11, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)", cursor: "pointer" }}>
            ↓ JSON
          </button>
        </div>
      </div>

      {summary !== null && (
        <div style={{ padding: "10px 16px", background: "rgba(0,230,118,0.06)", borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--green-primary)", marginBottom: 4, textTransform: "uppercase" }}>AI Summary</div>
          {summary || <span style={{ color: "var(--text-muted)" }}>Generating…</span>}
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {entries.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, fontSize: 12, color: "var(--text-muted)" }}>No timeline entries yet</div>
        ) : (
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", left: 7, top: 0, bottom: 0, width: 1, background: "var(--border)" }} />
            {entries.map((entry) => (
              <div key={entry.id} style={{ display: "flex", gap: 14, marginBottom: 16 }}>
                <div style={{ width: 15, height: 15, borderRadius: "50%", background: entry.is_auto ? "var(--border)" : "var(--green-primary)", flexShrink: 0, marginTop: 2, zIndex: 1 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{entry.title}</span>
                    {entry.source_label && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>{entry.source_label}</span>}
                  </div>
                  {entry.body && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{entry.body}</div>}
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>{timeAgo(entry.entry_time)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function IntelTab({ roomId }: { roomId: number }) {
  const [notes, setNotes] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [classification, setClassification] = useState("unclassified");

  useEffect(() => {
    fetch(`/api/v1/plan-rooms/${roomId}/intel`, { headers: { Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` } })
      .then((r) => r.ok ? r.json() : []).then(setNotes).catch(() => {});
  }, [roomId]);

  const addNote = async () => {
    if (!title.trim()) return;
    const r = await fetch(`/api/v1/plan-rooms/${roomId}/intel`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ title: title.trim(), body: body.trim() || undefined, classification }),
    });
    if (r.ok) { const n = await r.json(); setNotes((p) => [n, ...p]); setTitle(""); setBody(""); }
  };

  const CLASS_COLORS: Record<string, string> = { unclassified: "var(--text-muted)", confidential: "var(--blue-track)", secret: "var(--orange-warning)", top_secret: "var(--red-critical)" };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Note title…"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "5px 10px", outline: "none" }} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Body (optional)…" rows={2}
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 11, padding: "5px 10px", outline: "none", resize: "none" }} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={classification} onChange={(e) => setClassification(e.target.value)}
            style={{ fontSize: 11, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: CLASS_COLORS[classification] ?? "var(--text-muted)", padding: "4px 8px" }}>
            {["unclassified", "confidential", "secret", "top_secret"].map((c) => <option key={c} value={c}>{c.replace("_", " ").toUpperCase()}</option>)}
          </select>
          <button onClick={addNote} style={{ padding: "4px 12px", borderRadius: 4, background: "var(--green-primary)", color: "var(--bg-app)", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Add Note</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {notes.map((note) => (
          <div key={note.id} style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{note.is_pinned ? "📌 " : ""}{note.title}</span>
              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, border: "1px solid var(--border)", color: CLASS_COLORS[note.classification] ?? "var(--text-muted)", marginLeft: "auto" }}>
                {note.classification?.replace("_", " ").toUpperCase()}
              </span>
            </div>
            {note.body && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>{note.body}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function MembersTab({ roomId }: { roomId: number }) {
  const [members, setMembers] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/plan-rooms/${roomId}/members`, { headers: { Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` } })
      .then((r) => r.ok ? r.json() : []).then(setMembers).catch(() => {});
  }, [roomId]);

  const addMember = async () => {
    if (!userId.trim()) return;
    setAdding(true);
    try {
      const r = await fetch(`/api/v1/plan-rooms/${roomId}/members/${userId.trim()}`, { method: "POST", headers: authHeaders() });
      if (r.ok) { setMembers((p) => [...p, await r.json()]); setUserId(""); }
    } finally { setAdding(false); }
  };

  const ROLE_COLOR: Record<string, string> = { owner: "var(--green-primary)", briefer: "var(--orange-warning)", analyst: "var(--text-muted)" };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: 8 }}>
        <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User ID to invite…"
          style={{ flex: 1, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "5px 10px", outline: "none" }} />
        <button onClick={addMember} disabled={adding}
          style={{ padding: "5px 12px", borderRadius: 4, background: "var(--green-primary)", color: "var(--bg-app)", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          {adding ? "…" : "Invite"}
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {members.length === 0 ? (
          <div style={{ padding: "20px 16px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>No members found</div>
        ) : members.map((m, i) => (
          <div key={i} style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--bg-card)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
              {String(m.user_id).slice(-2)}
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-primary)" }}>User #{m.user_id}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Joined {timeAgo(m.joined_at)}</div>
            </div>
            <span style={{ marginLeft: "auto", fontSize: 10, padding: "2px 7px", borderRadius: 10, background: "var(--bg-card)", color: ROLE_COLOR[m.role] ?? "var(--text-muted)", border: "1px solid var(--border)" }}>
              {m.role}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateRoomForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const r = await fetch("/api/v1/plan-rooms", { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }) });
    if (r.ok) onClose();
    setSaving(false);
  };

  return (
    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "var(--bg-hover)" }}>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Room name…"
        style={{ width: "100%", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "5px 8px", outline: "none", marginBottom: 6 }} />
      <input value={description} onChange={(e) => setDescription(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="Description (optional)"
        style={{ width: "100%", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "5px 8px", outline: "none", marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={save} disabled={saving || !name.trim()}
          style={{ flex: 1, padding: "5px 0", borderRadius: 4, background: "var(--green-primary)", color: "var(--bg-app)", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          {saving ? "Creating…" : "Create"}
        </button>
        <button onClick={onClose} style={{ padding: "5px 8px", borderRadius: 4, background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)", fontSize: 11, cursor: "pointer" }}>✕</button>
      </div>
    </div>
  );
}
