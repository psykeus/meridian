import { useEffect, useState } from "react";
import { usePlanStore, type PlanRoom, type Task } from "@/stores/usePlanStore";
import { timeAgo } from "@/lib/utils";

const TASK_STATUSES = ["to_monitor", "assigned", "active_watch", "escalated", "completed"];
const STATUS_LABEL: Record<string, string> = {
  to_monitor:   "To Monitor",
  assigned:     "Assigned",
  active_watch: "Active Watch",
  escalated:    "Escalated",
  completed:    "Completed",
};
const STATUS_COLOR: Record<string, string> = {
  to_monitor:   "var(--text-muted)",
  assigned:     "var(--blue-track)",
  active_watch: "var(--orange-warning)",
  escalated:    "var(--red-critical)",
  completed:    "var(--green-primary)",
};

export function PlanModePage() {
  const { rooms, activeRoomId, fetchRooms, setActiveRoom, fetchRoomData } = usePlanStore();
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  useEffect(() => {
    if (activeRoomId) fetchRoomData(activeRoomId);
  }, [activeRoomId, fetchRoomData]);

  const activeRoom = rooms.find((r) => r.id === activeRoomId);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{
        width: 260, flexShrink: 0, borderRight: "1px solid var(--border)",
        background: "var(--bg-panel)", display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>Plan Rooms</span>
          <button
            onClick={() => setShowCreate(true)}
            style={{ fontSize: 18, lineHeight: 1, background: "none", border: "none", cursor: "pointer", color: "var(--green-primary)" }}
            title="New Plan Room"
          >+</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {showCreate && <CreateRoomForm onClose={() => { setShowCreate(false); fetchRooms(); }} />}
          {rooms.length === 0 && !showCreate && (
            <div style={{ padding: "20px 14px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
              No plan rooms yet.<br />Create one to start collaborating.
            </div>
          )}
          {rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => setActiveRoom(room.id)}
              style={{
                width: "100%", textAlign: "left", padding: "10px 14px",
                background: activeRoomId === room.id ? "var(--bg-hover)" : "transparent",
                border: "none", borderBottom: "1px solid var(--border)",
                cursor: "pointer",
                borderLeft: activeRoomId === room.id ? "2px solid var(--green-primary)" : "2px solid transparent",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{room.name}</div>
              {room.description && (
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {room.description}
                </div>
              )}
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
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Choose a room from the left panel or create a new one</div>
          </div>
        ) : (
          <RoomDetail room={activeRoom} />
        )}
      </div>
    </div>
  );
}

function RoomDetail({ room }: { room?: PlanRoom }) {
  const [activeTab, setActiveTab] = useState<"tasks" | "timeline">("tasks");

  if (!room) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{room.name}</div>
          {room.description && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{room.description}</div>}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 1, background: "var(--bg-card)", borderRadius: 4, padding: 2 }}>
          {(["tasks", "timeline"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "4px 12px", borderRadius: 3, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer",
                background: activeTab === tab ? "var(--bg-panel)" : "transparent",
                color: activeTab === tab ? "var(--text-primary)" : "var(--text-muted)",
                textTransform: "capitalize",
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        {activeTab === "tasks" ? <TaskBoard roomId={room.id} /> : <TimelinePanel roomId={room.id} />}
      </div>
    </div>
  );
}

function TaskBoard({ roomId }: { roomId: number }) {
  const { tasks, addTask, updateTask, removeTask } = usePlanStore();
  const [newTitle, setNewTitle] = useState("");

  const createTask = async () => {
    if (!newTitle.trim()) return;
    const r = await fetch(`/api/v1/plan-rooms/${roomId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    if (r.ok) { addTask(await r.json()); setNewTitle(""); }
  };

  const patchTask = async (id: number, patch: Partial<Task>) => {
    const r = await fetch(`/api/v1/plan-rooms/${roomId}/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` },
      body: JSON.stringify(patch),
    });
    if (r.ok) updateTask(id, patch);
  };

  const deleteTask = async (id: number) => {
    await fetch(`/api/v1/plan-rooms/${roomId}/tasks/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` },
    });
    removeTask(id);
  };

  const grouped = TASK_STATUSES.reduce<Record<string, Task[]>>((acc, s) => {
    acc[s] = tasks.filter((t) => t.plan_room_id === roomId && t.status === s);
    return acc;
  }, {});

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "8px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: 8 }}>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createTask()}
          placeholder="Add task…"
          style={{ flex: 1, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "5px 10px", outline: "none" }}
        />
        <button onClick={createTask} style={{ padding: "5px 12px", borderRadius: 4, background: "var(--green-primary)", color: "var(--bg-app)", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          Add
        </button>
      </div>
      <div style={{ flex: 1, overflowX: "auto", display: "flex", gap: 12, padding: 16 }}>
        {TASK_STATUSES.map((status) => (
          <div key={status} style={{ minWidth: 220, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLOR[status], display: "inline-block" }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                {STATUS_LABEL[status]}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: "auto" }}>{grouped[status].length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {grouped[status].map((task) => (
                <div key={task.id} style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 5, padding: "8px 10px" }}>
                  <div style={{ fontSize: 12, color: "var(--text-primary)", marginBottom: 6 }}>{task.title}</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {TASK_STATUSES.filter((s) => s !== status).map((s) => (
                      <button
                        key={s}
                        onClick={() => patchTask(task.id, { status: s })}
                        style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "var(--bg-card)", border: "1px solid var(--border)", cursor: "pointer", color: STATUS_COLOR[s] }}
                      >
                        → {STATUS_LABEL[s]}
                      </button>
                    ))}
                    <button
                      onClick={() => deleteTask(task.id)}
                      style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", marginLeft: "auto" }}
                    >
                      ✕
                    </button>
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
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");

  const entries = timeline.filter((e) => e.plan_room_id === roomId);

  const addEntry = async () => {
    if (!newTitle.trim()) return;
    const r = await fetch(`/api/v1/plan-rooms/${roomId}/timeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` },
      body: JSON.stringify({ title: newTitle.trim(), body: newBody.trim() || undefined, entry_time: new Date().toISOString() }),
    });
    if (r.ok) { addTimelineEntry(await r.json()); setNewTitle(""); setNewBody(""); }
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "8px 20px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Event title…"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "5px 10px", outline: "none" }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addEntry()}
            placeholder="Details (optional)"
            style={{ flex: 1, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "5px 10px", outline: "none" }}
          />
          <button onClick={addEntry} style={{ padding: "5px 12px", borderRadius: 4, background: "var(--green-primary)", color: "var(--bg-app)", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Log
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
        {entries.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, fontSize: 12, color: "var(--text-muted)" }}>No timeline entries yet</div>
        ) : (
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", left: 7, top: 0, bottom: 0, width: 1, background: "var(--border)" }} />
            {entries.map((entry) => (
              <div key={entry.id} style={{ display: "flex", gap: 14, marginBottom: 16 }}>
                <div style={{ width: 15, height: 15, borderRadius: "50%", background: entry.is_auto ? "var(--border)" : "var(--green-primary)", flexShrink: 0, marginTop: 2, zIndex: 1 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{entry.title}</span>
                    {entry.source_label && (
                      <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                        {entry.source_label}
                      </span>
                    )}
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

function CreateRoomForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const r = await fetch("/api/v1/plan-rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` },
      body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
    });
    if (r.ok) onClose();
    setSaving(false);
  };

  return (
    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "var(--bg-hover)" }}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Room name…"
        style={{ width: "100%", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "5px 8px", outline: "none", marginBottom: 6 }}
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder="Description (optional)"
        style={{ width: "100%", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "5px 8px", outline: "none", marginBottom: 8 }}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={save} disabled={saving || !name.trim()}
          style={{ flex: 1, padding: "5px 0", borderRadius: 4, background: "var(--green-primary)", color: "var(--bg-app)", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          {saving ? "Creating…" : "Create"}
        </button>
        <button onClick={onClose} style={{ padding: "5px 8px", borderRadius: 4, background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)", fontSize: 11, cursor: "pointer" }}>
          ✕
        </button>
      </div>
    </div>
  );
}
