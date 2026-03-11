import { useState, useMemo } from "react";
import { ALL_LAYERS, LAYER_GROUPS, type LayerGroup } from "@/config/layers";
import { useLayoutStore } from "@/stores/useLayoutStore";

export function LayerPanel() {
  const { activeLayers, toggleLayer, isLayerPanelOpen, toggleLayerPanel } = useLayoutStore();
  const [expandedGroups, setExpandedGroups] = useState<Set<LayerGroup>>(
    new Set(["environment", "security", "aviation", "maritime"])
  );
  const [search, setSearch] = useState("");

  const filteredLayers = useMemo(() => {
    if (!search.trim()) return ALL_LAYERS;
    const q = search.toLowerCase();
    return ALL_LAYERS.filter(
      (l) => l.label.toLowerCase().includes(q) || (l.description ?? "").toLowerCase().includes(q)
    );
  }, [search]);

  if (!isLayerPanelOpen) return null;

  const toggleGroup = (g: LayerGroup) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  const groupedLayers = filteredLayers.reduce<Partial<Record<LayerGroup, typeof ALL_LAYERS>>>(
    (acc, layer) => {
      (acc[layer.group] ??= []).push(layer);
      return acc;
    },
    {}
  );

  return (
    <>
      <div
        style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 29,
        }}
        onClick={toggleLayerPanel}
      />
      <aside
        style={{
          position: "absolute", top: 44, left: 48, zIndex: 30,
          width: 280, maxHeight: "calc(100% - 56px)",
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-3 flex-shrink-0"
          style={{ height: 40, borderBottom: "1px solid var(--border)" }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)" }}>
            MAP LAYERS <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>({ALL_LAYERS.length})</span>
          </span>
          <button
            onClick={toggleLayerPanel}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 13 }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: "6px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search layers…"
            style={{
              width: "100%", background: "var(--bg-card)", border: "1px solid var(--border)",
              borderRadius: 4, padding: "4px 8px", fontSize: 11, color: "var(--text-primary)",
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
          {(Object.entries(LAYER_GROUPS) as [LayerGroup, { label: string; icon: string }][]).map(
            ([groupId, { label, icon }]) => {
              const layers = groupedLayers[groupId] ?? [];
              if (!layers.length) return null;
              const isExpanded = expandedGroups.has(groupId);
              const activeCount = layers.filter((l) => activeLayers.has(l.id)).length;

              return (
                <div key={groupId}>
                  <button
                    onClick={() => toggleGroup(groupId)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 12px", background: "none", border: "none",
                      cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: 12 }}>{icon}</span>
                    <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {label}
                    </span>
                    {activeCount > 0 && (
                      <span style={{ fontSize: 10, color: "var(--green-primary)", fontWeight: 700 }}>
                        {activeCount}
                      </span>
                    )}
                    <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
                      {isExpanded ? "▾" : "▸"}
                    </span>
                  </button>

                  {isExpanded && layers.map((layer) => {
                    const active = activeLayers.has(layer.id);
                    return (
                      <label
                        key={layer.id}
                        title={layer.description}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "5px 12px 5px 24px",
                          cursor: "pointer",
                          background: active ? "var(--bg-hover)" : "transparent",
                          transition: "background 100ms",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13, flexShrink: 0, lineHeight: 1,
                            opacity: active ? 1 : 0.35,
                            filter: active ? `drop-shadow(0 0 4px ${layer.color}99)` : "none",
                            transition: "opacity 150ms, filter 150ms",
                          }}
                        >
                          {layer.icon}
                        </span>
                        <span style={{ flex: 1, fontSize: 12, color: active ? "var(--text-primary)" : "var(--text-secondary)" }}>
                          {layer.label}
                        </span>
                        <div
                          style={{
                            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                            background: active ? layer.color : "transparent",
                            border: `1px solid ${active ? layer.color : "var(--border)"}`,
                            transition: "background 150ms",
                          }}
                        />
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => toggleLayer(layer.id)}
                          style={{ display: "none" }}
                        />
                      </label>
                    );
                  })}
                </div>
              );
            }
          )}
        </div>
      </aside>
    </>
  );
}
