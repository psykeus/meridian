import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFilteredEvents } from "@/stores/useFilteredEvents";
import GridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { MeridianMap } from "@/components/Map/MeridianMap";
import { LayerPanel } from "@/components/Map/LayerPanel";
import { TimelineBar } from "@/components/Map/TimelineBar";
import { useReplayStore } from "@/stores/useReplayStore";
import { PanelHeader } from "@/components/Panel/PanelHeader";
import { PanelSummaryCard } from "@/components/Panel/PanelSummaryCard";
import { useEventStore } from "@/stores/useEventStore";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { renderPanel } from "@/components/Panels/PanelRegistry";
import { getDeck } from "@/config/decks";
import { SEVERITY_COLOR, CATEGORY_ICON, timeAgo } from "@/lib/utils";
import type { GeoEvent } from "@/types";
import type { Layout } from "react-grid-layout";

const ROW_HEIGHT = 30;

function useResponsiveGrid(panelPosition: "bottom" | "right", rightPanelPct: number) {
  const [width, setWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1440);
  const [, setHeight] = useState(typeof window !== "undefined" ? window.innerHeight : 900);
  useEffect(() => {
    const onResize = () => { setWidth(window.innerWidth); setHeight(window.innerHeight); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // 48px side nav + 12px padding on each side
  if (panelPosition === "right") {
    const panelWidth = Math.round((width - 48) * (rightPanelPct / 100));
    if (width <= 640)  return { cols: 1, gridWidth: panelWidth - 24 };
    if (width <= 1024) return { cols: 4, gridWidth: panelWidth - 24 };
    return { cols: 6, gridWidth: panelWidth - 24 };
  }
  if (width <= 640)  return { cols: 1, gridWidth: width - 24 };
  if (width <= 1024) return { cols: 6, gridWidth: width - 72 };
  return { cols: 12, gridWidth: width - 72 };
}

export function DashboardPage() {
  const activeDeckId    = useLayoutStore((s) => s.activeDeckId);
  const currentLayout   = useLayoutStore((s) => s.currentLayout);
  const updateLayout    = useLayoutStore((s) => s.updateLayout);
  const maximizedPanel  = useLayoutStore((s) => s.maximizedPanel);
  const setMaximizedPanel = useLayoutStore((s) => s.setMaximizedPanel);
  const minimizedPanels = useLayoutStore((s) => s.minimizedPanels);
  const restorePanel    = useLayoutStore((s) => s.restorePanel);
  const toggleMinimized = useLayoutStore((s) => s.toggleMinimized);
  const savedLayouts     = useLayoutStore((s) => s.savedLayouts);
  const saveCurrentLayout = useLayoutStore((s) => s.saveCurrentLayout);
  const loadSavedLayout   = useLayoutStore((s) => s.loadSavedLayout);
  const deleteSavedLayout = useLayoutStore((s) => s.deleteSavedLayout);
  const panelPosition    = useLayoutStore((s) => s.panelPosition);
  const setPanelPosition = useLayoutStore((s) => s.setPanelPosition);
  const deck = useMemo(() => getDeck(activeDeckId), [activeDeckId]);
  const replayMode  = useReplayStore((s) => s.mode);
  const isLoading   = useReplayStore((s) => s.isLoading);

  // ── Resizable map/panel split ──────────────────────────────────────────
  const [mapPct, setMapPct] = useState(55);           // vertical split (bottom)
  const [rightPanelPct, setRightPanelPct] = useState(35); // horizontal split (right)
  const { cols, gridWidth } = useResponsiveGrid(panelPosition, rightPanelPct);
  const draggingSplit = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onSplitPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    draggingSplit.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onSplitPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingSplit.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (panelPosition === "right") {
      const pct = 100 - ((e.clientX - rect.left) / rect.width) * 100;
      setRightPanelPct(Math.min(70, Math.max(15, pct)));
    } else {
      const pct = ((e.clientY - rect.top) / rect.height) * 100;
      setMapPct(Math.min(85, Math.max(20, pct)));
    }
  }, [panelPosition]);

  const onSplitPointerUp = useCallback(() => { draggingSplit.current = false; }, []);

  // Save layout only on user drag/resize — NOT on every internal recomputation.
  const handleLayoutSave = useCallback(
    (layout: Layout[]) => updateLayout(layout),
    [updateLayout]
  );

  const maximizedSlot = maximizedPanel ? deck.panels.find((s) => s.component === maximizedPanel) : null;

  // ── Preset popover state ──────────────────────────────────────────────
  const [presetOpen, setPresetOpen] = useState(false);
  const [presetName, setPresetName] = useState("");

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    saveCurrentLayout(presetName.trim());
    setPresetName("");
    setPresetOpen(false);
  };

  const isRight = panelPosition === "right";

  // ── Shared map overlay (presets, loading, replay badge) ──────────────
  const mapOverlays = (
    <>
      {/* Preset manager button */}
      <div style={{ position: "absolute", top: 8, left: 48, zIndex: 10 }}>
        <button
          onClick={() => setPresetOpen((o) => !o)}
          title="Layout presets"
          style={{
            padding: "4px 10px", borderRadius: 4, cursor: "pointer",
            background: "var(--bg-panel)", border: "1px solid var(--border)",
            color: presetOpen ? "var(--green-primary)" : "var(--text-muted)",
            fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4,
          }}
        >
          <span style={{ fontSize: 13 }}>&#9776;</span> Presets
        </button>

        {presetOpen && (
          <div style={{
            position: "absolute", top: 32, left: 0, width: 240,
            background: "var(--bg-panel)", border: "1px solid var(--border)",
            borderRadius: 6, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,.5)",
          }}>
            <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: 6 }}>SAVE CURRENT</div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
                  placeholder="Preset name..."
                  style={{
                    flex: 1, background: "var(--bg-card)", border: "1px solid var(--border)",
                    borderRadius: 3, color: "var(--text-primary)", fontSize: 11, padding: "4px 8px", outline: "none",
                  }}
                />
                <button
                  onClick={handleSavePreset}
                  disabled={!presetName.trim()}
                  style={{
                    padding: "4px 10px", borderRadius: 3, background: "var(--green-primary)",
                    color: "var(--bg-app)", border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  Save
                </button>
              </div>
            </div>

            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {savedLayouts.length === 0 ? (
                <div style={{ padding: "16px 10px", fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
                  No saved presets
                </div>
              ) : savedLayouts.map((layout) => (
                <div key={layout.id} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
                  borderBottom: "1px solid var(--border)",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {layout.label}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                      {new Date(layout.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => { loadSavedLayout(layout.id); setPresetOpen(false); }}
                    style={{ padding: "3px 8px", borderRadius: 3, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 10, cursor: "pointer" }}
                  >
                    Load
                  </button>
                  <button
                    onClick={() => deleteSavedLayout(layout.id)}
                    style={{ padding: "3px 6px", borderRadius: 3, background: "none", border: "1px solid var(--border)", color: "var(--red-critical)", fontSize: 10, cursor: "pointer" }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Panel position toggle */}
      <div style={{ position: "absolute", top: 8, left: 170, zIndex: 10 }}>
        <button
          onClick={() => setPanelPosition(isRight ? "bottom" : "right")}
          title={isRight ? "Panels: dock bottom" : "Panels: dock right"}
          style={{
            padding: "4px 10px", borderRadius: 4, cursor: "pointer",
            background: "var(--bg-panel)", border: "1px solid var(--border)",
            color: "var(--text-muted)", fontSize: 11, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 4,
          }}
        >
          <span style={{ fontSize: 12 }}>{isRight ? "⇊" : "⇉"}</span>
          {isRight ? "Bottom" : "Right"}
        </button>
      </div>

      {isLoading && (
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          background: "rgba(10,14,26,.85)", border: "1px solid var(--border)",
          borderRadius: 6, padding: "10px 20px", fontSize: 11, color: "var(--text-muted)",
          zIndex: 300, pointerEvents: "none",
        }}>
          Loading historical data…
        </div>
      )}
      {replayMode === "replay" && !isLoading && (
        <div style={{
          position: "absolute", top: 8, right: 48, zIndex: 10,
          background: "rgba(255,152,0,.15)", border: "1px solid var(--orange-warning)",
          borderRadius: 4, padding: "3px 10px", fontSize: 10, fontWeight: 700,
          color: "var(--orange-warning)", pointerEvents: "none",
        }}>
          REPLAY MODE
        </div>
      )}
    </>
  );

  // ── Shared panel grid ───────────────────────────────────────────────
  const panelGrid = (
    <GridLayout
      layout={currentLayout}
      cols={cols}
      rowHeight={ROW_HEIGHT}
      width={gridWidth}
      onDragStop={handleLayoutSave}
      onResizeStop={handleLayoutSave}
      draggableHandle=".panel-drag-handle"
      margin={[12, 12]}
      containerPadding={[12, 12]}
      useCSSTransforms
    >
      {deck.panels.map((slot) => (
        <div key={slot.i} style={{ display: minimizedPanels.has(slot.component) ? "none" : "flex", flexDirection: "column" }}>
          <PanelWrapper
            onExpand={() => setMaximizedPanel(slot.component)}
            onMinimize={() => toggleMinimized(slot.component)}
          >
            {renderPanel(slot.component)}
          </PanelWrapper>
        </div>
      ))}
    </GridLayout>
  );

  // ── Minimized panel pills ───────────────────────────────────────────
  const minimizedPills = minimizedPanels.size > 0 && (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 6, padding: "6px 12px",
      background: "var(--bg-panel)",
      ...(isRight
        ? { borderTop: "1px solid var(--border)" }
        : { borderTop: "1px solid var(--border)" }),
    }}>
      {deck.panels
        .filter((s) => minimizedPanels.has(s.component))
        .map((slot) => (
          <button
            key={slot.component}
            onClick={() => restorePanel(slot.component)}
            style={{
              padding: "3px 10px", borderRadius: 12, fontSize: 10, fontWeight: 600,
              background: "var(--bg-card)", border: "1px solid var(--border)",
              color: "var(--text-secondary)", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <span style={{ fontSize: 8, color: "var(--green-primary)" }}>●</span>
            {slot.component.replace(/([A-Z])/g, " $1").trim()}
            <span style={{ color: "var(--text-muted)", marginLeft: 2 }}>↗</span>
          </button>
        ))}
    </div>
  );

  return (
    <div
      ref={containerRef}
      style={{
        height: "100%", display: "flex",
        flexDirection: isRight ? "row" : "column",
        overflow: "hidden",
      }}
      onPointerMove={onSplitPointerMove}
      onPointerUp={onSplitPointerUp}
    >
      {/* ── Map area ─────────────────────────────────────────────────── */}
      <div style={{
        ...(isRight
          ? { flex: `1 1 ${100 - rightPanelPct}%`, minWidth: 0 }
          : { flex: `0 0 ${mapPct}%`, minHeight: 0 }),
        position: "relative",
      }}>
        <MeridianMap />
        <LayerPanel />
        <TimelineBar />
        {mapOverlays}
      </div>

      {/* ── Drag handle ──────────────────────────────────────────────── */}
      <div
        onPointerDown={onSplitPointerDown}
        style={{
          flex: "0 0 6px",
          cursor: isRight ? "col-resize" : "row-resize",
          position: "relative", zIndex: 20,
          background: "var(--bg-panel)",
          ...(isRight
            ? { borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" }
            : { borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }),
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <div style={{
          ...(isRight
            ? { width: 3, height: 40 }
            : { width: 40, height: 3 }),
          borderRadius: 2, background: "var(--text-muted)",
          opacity: 0.4, transition: "opacity 150ms",
        }} />
      </div>

      {/* ── Panel area ───────────────────────────────────────────────── */}
      <div style={{
        ...(isRight
          ? { flex: `0 0 ${rightPanelPct}%`, minWidth: 0 }
          : { flex: `1 1 ${100 - mapPct}%`, minHeight: 0 }),
        overflowY: "auto", background: "var(--bg-app)",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {panelGrid}
        </div>
        {minimizedPills}
      </div>

      {/* Maximized panel overlay */}
      {maximizedSlot && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setMaximizedPanel(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "90vw", height: "85vh", background: "var(--bg-panel)",
              border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden",
              display: "flex", flexDirection: "column", boxShadow: "0 16px 64px rgba(0,0,0,.6)",
            }}
          >
            <div style={{
              padding: "6px 12px", borderBottom: "1px solid var(--border)",
              display: "flex", justifyContent: "flex-end",
            }}>
              <button
                onClick={() => setMaximizedPanel(null)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--text-muted)", padding: "2px 6px" }}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              {renderPanel(maximizedSlot.component)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ConflictPanel() {
  const allEvents = useFilteredEvents();
  const events = allEvents.filter((e) =>
    e.category === "geopolitical" || e.category === "military"
  ).slice(0, 50);
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader title="Conflict Monitor" sourceLabel="ACLED · GDELT" eventCount={events.length} />
      <PanelSummaryCard topic="Conflict Monitor" contextHint="Active armed conflicts, airstrikes, geopolitical events, and military activity" />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {events.length === 0
          ? <EmptyState message="No conflict events in the last 24h" />
          : events.map((e) => <EventRow key={e.id} event={e} onClick={() => setSelectedEvent(e)} />)
        }
      </div>
    </div>
  );
}

export function WeatherSeismicPanel() {
  const allEvents = useFilteredEvents();
  const events = allEvents.filter((e) => e.category === "environment").slice(0, 50);
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader title="Weather & Seismic" sourceLabel="USGS · NOAA · GDACS" eventCount={events.length} />
      <PanelSummaryCard topic="Weather & Seismic" contextHint="Earthquakes, severe weather, wildfires, hurricanes, and environmental hazard events" />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {events.length === 0
          ? <EmptyState message="No environment events in the last 24h" />
          : events.map((e) => <EventRow key={e.id} event={e} onClick={() => setSelectedEvent(e)} />)
        }
      </div>
    </div>
  );
}

function EventRow({ event, onClick }: { event: GeoEvent; onClick: () => void }) {
  const color = SEVERITY_COLOR[event.severity];
  const icon = CATEGORY_ICON[event.category] ?? "●";
  return (
    <div className="data-row" onClick={onClick}>
      <span style={{ fontSize: 13, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {event.title}
        </div>
        {event.body && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {event.body}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {event.severity}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{timeAgo(event.event_time)}</span>
      </div>
    </div>
  );
}

function PanelWrapper({ children, onExpand, onMinimize }: { children: ReactNode; onExpand: () => void; onMinimize: () => void }) {
  const btnStyle: React.CSSProperties = {
    position: "absolute", top: 4, zIndex: 5,
    width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
    background: "transparent", border: "none", borderRadius: 3,
    cursor: "pointer", fontSize: 11, color: "var(--text-muted)", opacity: 0.5,
    transition: "opacity 100ms",
  };
  const hover = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = "var(--bg-hover)"; };
  const leave = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.opacity = "0.5"; e.currentTarget.style.background = "transparent"; };

  return (
    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column" }}>
      <button onClick={onMinimize} title="Minimize panel" style={{ ...btnStyle, right: 26 }} onMouseEnter={hover} onMouseLeave={leave}>
        ▁
      </button>
      <button onClick={onExpand} title="Expand panel" style={{ ...btnStyle, right: 4 }} onMouseEnter={hover} onMouseLeave={leave}>
        ⊞
      </button>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 12, color: "var(--text-muted)" }}>
      {message}
    </div>
  );
}
