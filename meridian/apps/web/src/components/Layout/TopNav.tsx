import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatUTC } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { useNewsFeedStore } from "@/stores/useNewsFeedStore";
import { DECKS } from "@/config/decks";
import { NotificationCenter } from "@/components/Panel/NotificationCenter";

export function TopNav() {
  const [utcTime, setUtcTime] = useState(() => formatUTC(new Date()));

  useEffect(() => {
    const timer = setInterval(() => setUtcTime(formatUTC(new Date())), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header
      className="flex items-center justify-between px-4 flex-shrink-0"
      style={{
        height: 44,
        background: "var(--bg-panel)",
        borderBottom: "1px solid var(--border)",
        zIndex: 50,
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="font-bold tracking-widest text-sm"
          style={{ color: "var(--green-primary)", letterSpacing: "0.15em" }}
        >
          MERIDIAN
        </span>
        <span
          className="font-mono text-xs px-2 py-0.5 rounded"
          style={{ background: "var(--bg-card)", color: "var(--text-secondary)" }}
        >
          OPEN SOURCE
        </span>
        <DeckSwitcher />
      </div>

      <div className="flex items-center gap-4">
        <LayerToggleButton />
        <NewsToggleButton />
        <FeedHealthIndicator />
        <ShareViewButton />

        <span
          className="font-mono text-xs tabular-nums"
          style={{ color: "var(--text-secondary)" }}
        >
          {utcTime} UTC
        </span>

        <NotificationCenter />

        <SettingsLink />
        <LogoutButton />
      </div>
    </header>
  );
}

function DeckSwitcher() {
  const { activeDeckId, setActiveDeck, customFilters, activeFilterId, applyFilter, deleteFilter, createFilter, clearActiveFilter } = useLayoutStore();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const updateFilter = useLayoutStore((s) => s.updateFilter);

  const activeFilter = customFilters.find((f) => f.id === activeFilterId);
  const activeDeck = DECKS.find((d) => d.id === activeDeckId) ?? DECKS[0];
  const displayLabel = activeFilter ? activeFilter.name : activeDeck.label;
  const displayIcon = activeFilter ? activeFilter.icon : activeDeck.icon;

  const handleCreate = () => {
    if (!newName.trim()) return;
    createFilter(newName.trim(), newIcon.trim() || "◈", newDesc.trim());
    setNewName(""); setNewIcon(""); setNewDesc("");
    setCreating(false);
    setOpen(false);
  };

  const handleEditSave = (id: string) => {
    if (!editName.trim()) return;
    updateFilter(id, { name: editName.trim(), icon: editIcon.trim() || "◈", description: editDesc.trim() });
    setEditingId(null);
  };

  const startEdit = (f: typeof customFilters[0], e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(f.id);
    setEditName(f.name);
    setEditIcon(f.icon);
    setEditDesc(f.description);
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "3px 10px",
          background: activeFilter ? "rgba(0,230,118,0.08)" : "var(--bg-card)",
          border: `1px solid ${activeFilter ? "var(--green-primary)" : "var(--border)"}`,
          borderRadius: 4, cursor: "pointer", color: activeFilter ? "var(--green-primary)" : "var(--text-secondary)",
          fontSize: 12, fontWeight: 500,
        }}
      >
        <span>{displayIcon}</span>
        <span>{displayLabel}</span>
        <span style={{ fontSize: 9, color: "var(--text-muted)", marginLeft: 2 }}>▾</span>
      </button>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 98 }}
            onClick={() => { setOpen(false); setCreating(false); setEditingId(null); }}
          />
          <div
            style={{
              position: "absolute", top: "100%", left: 0, marginTop: 4,
              width: 280, background: "var(--bg-panel)", border: "1px solid var(--border)",
              borderRadius: 6, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 99,
              maxHeight: "calc(100vh - 100px)", overflowY: "auto",
            }}
          >
            {/* Built-in Decks */}
            <div style={{ padding: "6px 12px 2px", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "var(--text-muted)", textTransform: "uppercase" }}>
              Presets
            </div>
            {DECKS.map((deck) => (
              <button
                key={deck.id}
                onClick={() => { setActiveDeck(deck.id); clearActiveFilter(); setOpen(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "8px 12px", background: !activeFilter && deck.id === activeDeckId ? "var(--bg-hover)" : "transparent",
                  border: "none", cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{deck.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: !activeFilter && deck.id === activeDeckId ? "var(--green-primary)" : "var(--text-primary)" }}>
                    {deck.label}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                    {deck.description}
                  </div>
                </div>
              </button>
            ))}

            {/* Custom Filters */}
            <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, padding: "6px 12px 2px", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "var(--text-muted)", textTransform: "uppercase", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>My Filters</span>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{customFilters.length}</span>
            </div>

            {customFilters.length === 0 && !creating && (
              <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
                No custom filters yet
              </div>
            )}

            {customFilters.map((f) => (
              <div key={f.id}>
                {editingId === f.id ? (
                  /* Inline edit form */
                  <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4, background: "var(--bg-hover)" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <input
                        value={editIcon}
                        onChange={(e) => setEditIcon(e.target.value)}
                        placeholder="Icon"
                        maxLength={2}
                        style={{ width: 32, padding: "3px 4px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 3, fontSize: 12, color: "var(--text-primary)", textAlign: "center", outline: "none" }}
                      />
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Filter name"
                        style={{ flex: 1, padding: "3px 6px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 3, fontSize: 11, color: "var(--text-primary)", outline: "none" }}
                        onKeyDown={(e) => e.key === "Enter" && handleEditSave(f.id)}
                      />
                    </div>
                    <input
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="Description (optional)"
                      style={{ width: "100%", padding: "3px 6px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 3, fontSize: 10, color: "var(--text-secondary)", outline: "none", boxSizing: "border-box" }}
                    />
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <button onClick={() => setEditingId(null)} style={{ padding: "2px 8px", fontSize: 10, background: "none", border: "1px solid var(--border)", borderRadius: 3, color: "var(--text-muted)", cursor: "pointer" }}>Cancel</button>
                      <button onClick={() => handleEditSave(f.id)} style={{ padding: "2px 8px", fontSize: 10, background: "var(--green-primary)", border: "none", borderRadius: 3, color: "var(--bg-app)", cursor: "pointer", fontWeight: 600 }}>Save</button>
                    </div>
                  </div>
                ) : (
                  /* Filter row */
                  <div
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "8px 12px",
                      background: f.id === activeFilterId ? "var(--bg-hover)" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{ flex: 1, display: "flex", alignItems: "flex-start", gap: 10 }}
                      onClick={() => { applyFilter(f.id); setOpen(false); }}
                    >
                      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{f.icon}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: f.id === activeFilterId ? "var(--green-primary)" : "var(--text-primary)" }}>
                          {f.name}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                          {f.description || `${f.layers.length} layers`}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => startEdit(f, e)}
                      title="Edit filter"
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--text-muted)", padding: "2px 4px" }}
                    >
                      ✎
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteFilter(f.id); }}
                      title="Delete filter"
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--text-muted)", padding: "2px 4px" }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Create new filter */}
            {creating ? (
              <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4, borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", gap: 4 }}>
                  <input
                    value={newIcon}
                    onChange={(e) => setNewIcon(e.target.value)}
                    placeholder="Icon"
                    maxLength={2}
                    style={{ width: 32, padding: "3px 4px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 3, fontSize: 12, color: "var(--text-primary)", textAlign: "center", outline: "none" }}
                    autoFocus
                  />
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Filter name"
                    style={{ flex: 1, padding: "3px 6px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 3, fontSize: 11, color: "var(--text-primary)", outline: "none" }}
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  />
                </div>
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Description (optional)"
                  style={{ width: "100%", padding: "3px 6px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 3, fontSize: 10, color: "var(--text-secondary)", outline: "none", boxSizing: "border-box" }}
                />
                <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                  <button onClick={() => setCreating(false)} style={{ padding: "2px 8px", fontSize: 10, background: "none", border: "1px solid var(--border)", borderRadius: 3, color: "var(--text-muted)", cursor: "pointer" }}>Cancel</button>
                  <button onClick={handleCreate} style={{ padding: "2px 8px", fontSize: 10, background: "var(--green-primary)", border: "none", borderRadius: 3, color: "var(--bg-app)", cursor: "pointer", fontWeight: 600 }}>Create</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 12px", background: "none", border: "none",
                  borderTop: customFilters.length > 0 ? "none" : undefined,
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{ fontSize: 14, color: "var(--green-primary)" }}>+</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: "var(--green-primary)" }}>
                  Save current layers as filter
                </span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LayerToggleButton() {
  const { toggleLayerPanel, isLayerPanelOpen, activeLayers } = useLayoutStore();
  return (
    <button
      onClick={toggleLayerPanel}
      title="Map Layers"
      style={{
        display: "flex", alignItems: "center", gap: 5, padding: "3px 10px",
        background: isLayerPanelOpen ? "rgba(0,230,118,0.1)" : "var(--bg-card)",
        border: `1px solid ${isLayerPanelOpen ? "var(--green-primary)" : "var(--border)"}`,
        borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 600,
        color: isLayerPanelOpen ? "var(--green-primary)" : "var(--text-secondary)",
      }}
    >
      <span>⬡</span>
      <span>LAYERS</span>
      <span
        style={{
          background: "var(--green-primary)", color: "var(--bg-app)",
          borderRadius: 3, padding: "0 4px", fontSize: 10, fontWeight: 700,
        }}
      >
        {activeLayers.size}
      </span>
    </button>
  );
}

function NewsToggleButton() {
  const isOpen = useNewsFeedStore((s) => s.isOpen);
  const toggle = useNewsFeedStore((s) => s.toggle);
  return (
    <button
      onClick={toggle}
      title="News Feed"
      style={{
        display: "flex", alignItems: "center", gap: 5, padding: "3px 10px",
        background: isOpen ? "rgba(0,230,118,0.1)" : "var(--bg-card)",
        border: `1px solid ${isOpen ? "var(--green-primary)" : "var(--border)"}`,
        borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 600,
        color: isOpen ? "var(--green-primary)" : "var(--text-secondary)",
      }}
    >
      <span>NEWS</span>
    </button>
  );
}

function FeedHealthIndicator() {
  const [feedCount, setFeedCount] = useState<{ healthy: number; total: number }>({ healthy: 0, total: 0 });

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const resp = await apiFetch("/api/v1/feeds/health");
        if (!resp.ok) return;
        const data = await resp.json();
        const entries = Object.values(data) as { status: string }[];
        const healthy = entries.filter((e) => e.status === "healthy").length;
        setFeedCount({ healthy, total: entries.length });
      } catch { /* ignore */ }
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const isHealthy = feedCount.healthy > 0 && feedCount.healthy >= feedCount.total * 0.7;
  const isWarning = feedCount.healthy > 0 && feedCount.healthy < feedCount.total * 0.7;

  return (
    <div className="flex items-center gap-1.5">
      <div
        style={{
          width: 7, height: 7, borderRadius: "50%",
          background: feedCount.total === 0 ? "var(--text-muted)" : isHealthy ? "var(--green-primary)" : isWarning ? "var(--orange-warning, #ff9800)" : "var(--red-critical, #ff5252)",
          boxShadow: isHealthy ? "0 0 6px var(--green-primary)" : "none",
        }}
      />
      <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
        {feedCount.total > 0 ? `${feedCount.healthy}/${feedCount.total} feeds` : "Loading..."}
      </span>
    </div>
  );
}

function ShareViewButton() {
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    const { activeDeckId, activeLayers } = useLayoutStore.getState();
    const params = new URLSearchParams();
    params.set("deck", activeDeckId);
    params.set("layers", [...activeLayers].join(","));
    const url = `${window.location.origin}${window.location.pathname}?${params}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleShare}
      title="Copy shareable link with current view"
      style={{
        display: "flex", alignItems: "center", gap: 4, padding: "3px 8px",
        background: copied ? "rgba(0,230,118,0.15)" : "var(--bg-card)",
        border: `1px solid ${copied ? "var(--green-primary)" : "var(--border)"}`,
        borderRadius: 4, cursor: "pointer", fontSize: 11,
        color: copied ? "var(--green-primary)" : "var(--text-muted)",
      }}
    >
      {copied ? "✓ Copied" : "🔗 Share"}
    </button>
  );
}

function SettingsLink() {
  return (
    <a
      href="/settings"
      title="Settings"
      style={{
        width: 28, height: 28, borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, background: "var(--green-primary)", color: "var(--bg-app)",
        textDecoration: "none", fontWeight: 700, cursor: "pointer",
      }}
    >
      M
    </a>
  );
}

function LogoutButton() {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        navigate("/login");
      }}
      title="Logout"
      style={{
        display: "flex", alignItems: "center", gap: 4, padding: "3px 8px",
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: 4, cursor: "pointer", fontSize: 11,
        color: "var(--text-muted)",
      }}
    >
      Logout
    </button>
  );
}
