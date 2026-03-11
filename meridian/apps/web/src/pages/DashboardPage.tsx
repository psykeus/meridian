import { useCallback, useMemo, type ReactNode } from "react";
import { useFilteredEvents } from "@/stores/useFilteredEvents";
import GridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { MeridianMap } from "@/components/Map/MeridianMap";
import { LayerPanel } from "@/components/Map/LayerPanel";
import { TimeScrubber } from "@/components/Map/TimeScrubber";
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

const COLS = 12;
const ROW_HEIGHT = 30;

export function DashboardPage() {
  const { activeDeckId, currentLayout, updateLayout, maximizedPanel, setMaximizedPanel } = useLayoutStore();
  const deck = useMemo(() => getDeck(activeDeckId), [activeDeckId]);
  const fetchReplay = useReplayStore((s) => s.fetchReplay);
  const setLive     = useReplayStore((s) => s.setLive);
  const replayMode  = useReplayStore((s) => s.mode);
  const isLoading   = useReplayStore((s) => s.isLoading);

  const onLayoutChange = useCallback(
    (layout: Layout[]) => updateLayout(layout),
    [updateLayout]
  );

  const maximizedSlot = maximizedPanel ? deck.panels.find((s) => s.component === maximizedPanel) : null;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flex: "0 0 55%", position: "relative", minHeight: 0 }}>
        <MeridianMap />
        <LayerPanel />
        <TimeScrubber onReplay={fetchReplay} onLive={setLive} />
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
      </div>

      <div style={{ flex: "1 1 45%", overflowY: "auto", background: "var(--bg-app)" }}>
        <GridLayout
          layout={currentLayout}
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          width={1440}
          onLayoutChange={onLayoutChange}
          draggableHandle=".panel-drag-handle"
          margin={[12, 12]}
          containerPadding={[12, 12]}
          useCSSTransforms
        >
          {deck.panels.map((slot) => (
            <div key={slot.i} style={{ display: "flex", flexDirection: "column" }}>
              <PanelWrapper panelId={slot.component} onExpand={() => setMaximizedPanel(slot.component)}>
                {renderPanel(slot.component)}
              </PanelWrapper>
            </div>
          ))}
        </GridLayout>
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

function PanelWrapper({ children, onExpand }: { children: ReactNode; panelId: string; onExpand: () => void }) {
  return (
    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column" }}>
      <button
        onClick={onExpand}
        title="Expand panel"
        style={{
          position: "absolute", top: 4, right: 4, zIndex: 5,
          width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
          background: "transparent", border: "none", borderRadius: 3,
          cursor: "pointer", fontSize: 11, color: "var(--text-muted)", opacity: 0.5,
          transition: "opacity 100ms",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = "var(--bg-hover)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; e.currentTarget.style.background = "transparent"; }}
      >
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
