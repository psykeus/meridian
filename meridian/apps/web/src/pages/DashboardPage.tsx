import { useCallback, useMemo } from "react";
import GridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { MeridianMap } from "@/components/Map/MeridianMap";
import { LayerPanel } from "@/components/Map/LayerPanel";
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
  const { activeDeckId, currentLayout, updateLayout } = useLayoutStore();
  const deck = useMemo(() => getDeck(activeDeckId), [activeDeckId]);

  const onLayoutChange = useCallback(
    (layout: Layout[]) => updateLayout(layout),
    [updateLayout]
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flex: "0 0 55%", position: "relative", minHeight: 0 }}>
        <MeridianMap />
        <LayerPanel />
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
              {renderPanel(slot.component)}
            </div>
          ))}
        </GridLayout>
      </div>
    </div>
  );
}

export function ConflictPanel() {
  const events = useEventStore((s) =>
    s.getFilteredEvents().filter((e) =>
      e.category === "geopolitical" || e.category === "military"
    ).slice(0, 50)
  );
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
  const events = useEventStore((s) =>
    s.getFilteredEvents().filter((e) => e.category === "environment").slice(0, 50)
  );
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

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 12, color: "var(--text-muted)" }}>
      {message}
    </div>
  );
}
