import { useEffect, useState } from "react";
import { usePlanStore } from "@/stores/usePlanStore";
import { timeAgo } from "@/lib/utils";

interface WatchEntity {
  id: number;
  plan_room_id: number;
  entity_type: string;
  label: string;
  identifier: string;
  radius_meters?: number;
  lat?: number;
  lng?: number;
  last_event_at?: string;
  created_at: string;
}

const TYPE_ICON: Record<string, string> = {
  vessel:         "⚓",
  aircraft:       "✈",
  location:       "◎",
  country:        "⊕",
  keyword:        "◈",
  cyber_asset:    "⚡",
  weather_system: "☁",
  satellite:      "★",
};

const ENTITY_TYPES = ["vessel", "aircraft", "location", "country", "keyword", "cyber_asset", "weather_system", "satellite"];

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}`,
});

export function WatchListPage() {
  const { rooms, activeRoomId, fetchRooms, setActiveRoom } = usePlanStore();
  const [entities, setEntities] = useState<WatchEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  useEffect(() => {
    if (!activeRoomId) return;
    setLoading(true);
    fetch(`/api/v1/plan-rooms/${activeRoomId}/watch-list`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : [])
      .then(setEntities)
      .catch(() => setEntities([]))
      .finally(() => setLoading(false));
  }, [activeRoomId]);

  const removeEntity = async (id: number) => {
    await fetch(`/api/v1/plan-rooms/${activeRoomId}/watch-list/${id}`, {
      method: "DELETE", headers: authHeaders(),
    });
    setEntities((prev) => prev.filter((e) => e.id !== id));
  };

  const filtered = filter
    ? entities.filter((e) => e.label.toLowerCase().includes(filter.toLowerCase()) || e.identifier.toLowerCase().includes(filter.toLowerCase()))
    : entities;

  const byType = ENTITY_TYPES.reduce<Record<string, WatchEntity[]>>((acc, t) => {
    acc[t] = filtered.filter((e) => e.entity_type === t);
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ width: 200, flexShrink: 0, borderRight: "1px solid var(--border)", background: "var(--bg-panel)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          Plan Rooms
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {rooms.map((room) => (
            <button key={room.id} onClick={() => setActiveRoom(room.id)}
              style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: activeRoomId === room.id ? "var(--bg-hover)" : "transparent", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", borderLeft: activeRoomId === room.id ? "2px solid var(--green-primary)" : "2px solid transparent" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{room.name}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Watch List</h1>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "4px 10px", outline: "none", width: 180 }}
          />
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{entities.length} entities</span>
          {activeRoomId && (
            <button onClick={() => setShowForm(!showForm)} style={{ marginLeft: "auto", padding: "5px 14px", borderRadius: 4, background: "var(--green-primary)", color: "var(--bg-app)", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
              + Add Entity
            </button>
          )}
        </div>

        {showForm && activeRoomId && (
          <AddEntityForm roomId={activeRoomId} onAdd={(e) => { setEntities((prev) => [e, ...prev]); setShowForm(false); }} onCancel={() => setShowForm(false)} />
        )}

        {!activeRoomId ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 28 }}>◈</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Select a plan room to view its watch list</div>
          </div>
        ) : loading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--text-muted)" }}>Loading…</div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, fontSize: 12, color: "var(--text-muted)" }}>
                {filter ? "No entities match your filter" : "No watch list entities yet. Add one to start tracking."}
              </div>
            ) : (
              ENTITY_TYPES.filter((t) => byType[t].length > 0).map((type) => (
                <div key={type} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{TYPE_ICON[type]}</span> {type.replace("_", " ")} <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({byType[type].length})</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "var(--border)", borderRadius: 5, overflow: "hidden" }}>
                    {byType[type].map((entity) => (
                      <div key={entity.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "var(--bg-panel)" }}>
                        <span style={{ fontSize: 14 }}>{TYPE_ICON[entity.entity_type]}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{entity.label}</div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2, display: "flex", gap: 10 }}>
                            <span>{entity.identifier}</span>
                            {entity.radius_meters && <span>R: {(entity.radius_meters / 1000).toFixed(0)}km</span>}
                            {entity.last_event_at && <span>Last hit: {timeAgo(entity.last_event_at)}</span>}
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{timeAgo(entity.created_at)}</div>
                        <button onClick={() => removeEntity(entity.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14 }}>✕</button>
                      </div>
                    ))}
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

function AddEntityForm({ roomId, onAdd, onCancel }: { roomId: number; onAdd: (e: WatchEntity) => void; onCancel: () => void }) {
  const [type, setType] = useState("vessel");
  const [label, setLabel] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [radius, setRadius] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!label.trim() || !identifier.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/v1/plan-rooms/${roomId}/watch-list`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          entity_type: type, label: label.trim(), identifier: identifier.trim(),
          radius_meters: radius ? parseFloat(radius) * 1000 : undefined,
        }),
      });
      if (r.ok) onAdd(await r.json());
    } finally { setSaving(false); }
  };

  return (
    <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg-hover)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Type</div>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "5px 8px", outline: "none" }}>
          {ENTITY_TYPES.map((t) => <option key={t} value={t}>{TYPE_ICON[t]} {t.replace("_", " ")}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 120 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Label</div>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Friendly name…" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "5px 8px", outline: "none" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 120 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Identifier</div>
        <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="MMSI / ICAO / keyword…" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "5px 8px", outline: "none" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 80 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Radius km</div>
        <input value={radius} onChange={(e) => setRadius(e.target.value)} placeholder="0" type="number" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "5px 8px", outline: "none" }} />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={save} disabled={saving || !label.trim() || !identifier.trim()} style={{ padding: "6px 14px", borderRadius: 4, background: "var(--green-primary)", color: "var(--bg-app)", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
          {saving ? "Adding…" : "Add"}
        </button>
        <button onClick={onCancel} style={{ padding: "6px 10px", borderRadius: 4, background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 12 }}>Cancel</button>
      </div>
    </div>
  );
}
