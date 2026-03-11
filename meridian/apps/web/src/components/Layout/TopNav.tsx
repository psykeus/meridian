import { useEffect, useState } from "react";
import { formatUTC } from "@/lib/utils";
import { useLayoutStore } from "@/stores/useLayoutStore";
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
        <FeedHealthIndicator />

        <span
          className="font-mono text-xs tabular-nums"
          style={{ color: "var(--text-secondary)" }}
        >
          {utcTime} UTC
        </span>

        <NotificationCenter />

        <SettingsLink />
      </div>
    </header>
  );
}

function DeckSwitcher() {
  const { activeDeckId, setActiveDeck } = useLayoutStore();
  const [open, setOpen] = useState(false);
  const activeDeck = DECKS.find((d) => d.id === activeDeckId) ?? DECKS[0];

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "3px 10px",
          background: "var(--bg-card)", border: "1px solid var(--border)",
          borderRadius: 4, cursor: "pointer", color: "var(--text-secondary)",
          fontSize: 12, fontWeight: 500,
        }}
      >
        <span>{activeDeck.icon}</span>
        <span>{activeDeck.label}</span>
        <span style={{ fontSize: 9, color: "var(--text-muted)", marginLeft: 2 }}>▾</span>
      </button>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 98 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute", top: "100%", left: 0, marginTop: 4,
              width: 220, background: "var(--bg-panel)", border: "1px solid var(--border)",
              borderRadius: 6, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 99,
              overflow: "hidden",
            }}
          >
            {DECKS.map((deck) => (
              <button
                key={deck.id}
                onClick={() => { setActiveDeck(deck.id); setOpen(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "9px 12px", background: deck.id === activeDeckId ? "var(--bg-hover)" : "transparent",
                  border: "none", cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{deck.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: deck.id === activeDeckId ? "var(--green-primary)" : "var(--text-primary)" }}>
                    {deck.label}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                    {deck.description}
                  </div>
                </div>
              </button>
            ))}
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

function FeedHealthIndicator() {
  return (
    <div className="flex items-center gap-1.5">
      <div className="live-dot healthy" />
      <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>15 feeds live</span>
    </div>
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
