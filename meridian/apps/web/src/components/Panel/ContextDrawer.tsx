import { useEventStore } from "@/stores/useEventStore";
import { SEVERITY_COLOR, SEVERITY_BG, CATEGORY_ICON, timeAgo } from "@/lib/utils";
import type { GeoEvent } from "@/types";

export function ContextDrawer() {
  const { selectedEvent, isDrawerOpen, closeDrawer } = useEventStore((s) => ({
    selectedEvent: s.selectedEvent,
    isDrawerOpen: s.isDrawerOpen,
    closeDrawer: s.closeDrawer,
  }));

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        height: "100%",
        width: 360,
        transform: isDrawerOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        zIndex: 40,
        background: "var(--bg-panel)",
        borderLeft: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        pointerEvents: isDrawerOpen ? "all" : "none",
      }}
    >
      <DrawerHeader onClose={closeDrawer} />
      {selectedEvent && <DrawerBody event={selectedEvent} />}
    </div>
  );
}

function DrawerHeader({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="flex items-center justify-between px-4 flex-shrink-0"
      style={{ height: 44, borderBottom: "1px solid var(--border)" }}
    >
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.08em" }}>
        EVENT DETAIL
      </span>
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text-muted)",
          fontSize: 14,
          lineHeight: 1,
          padding: "4px 6px",
          borderRadius: 4,
        }}
      >
        ✕
      </button>
    </div>
  );
}

function DrawerBody({ event }: { event: GeoEvent }) {
  const color = SEVERITY_COLOR[event.severity];
  const bg = SEVERITY_BG[event.severity];
  const icon = CATEGORY_ICON[event.category] ?? "●";

  return (
    <div className="flex flex-col flex-1 overflow-y-auto" style={{ gap: 0 }}>
      <div className="px-4 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 mb-2">
          <span
            className="severity-badge"
            style={{ color, background: bg }}
          >
            {event.severity}
          </span>
          <span className="source-badge">{event.source_id.replace(/_/g, " ")}</span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>
            {timeAgo(event.event_time)}
          </span>
        </div>

        <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}>
          {icon} {event.title}
        </h2>

        {event.body && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
            {event.body}
          </p>
        )}
      </div>

      <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, letterSpacing: "0.06em" }}>
          LOCATION
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
          {event.lat.toFixed(4)}°, {event.lng.toFixed(4)}°
        </div>
      </div>

      {Object.keys(event.metadata).length > 0 && (
        <div className="px-4 py-3">
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, letterSpacing: "0.06em" }}>
            DETAILS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {Object.entries(event.metadata)
              .filter(([, v]) => v !== null && v !== undefined && v !== "")
              .map(([key, value]) => (
                <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "capitalize" }}>
                    {key.replace(/_/g, " ")}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)", textAlign: "right", maxWidth: 200, wordBreak: "break-word" }}>
                    {String(value)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {event.url && (
        <div className="px-4 py-3 mt-auto" style={{ borderTop: "1px solid var(--border)" }}>
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: "var(--green-primary)", textDecoration: "none" }}
          >
            View source ↗
          </a>
        </div>
      )}
    </div>
  );
}
