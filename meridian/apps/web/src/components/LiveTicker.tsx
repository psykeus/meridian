import { useEffect, useMemo, useRef, useState } from "react";
import { useFilteredEvents } from "@/stores/useFilteredEvents";
import { useEventStore } from "@/stores/useEventStore";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { ALL_LAYERS } from "@/config/layers";
import { SEVERITY_COLOR, CATEGORY_ICON, timeAgo } from "@/lib/utils";
import type { GeoEvent, SeverityLevel, FeedCategory } from "@/types";

const NEWS_SOURCE_IDS = new Set(["rss_news", "gdelt", "osint_rss"]);

type TickerMode = "events" | "severities" | "sources" | "feeds";

export function LiveTicker() {
  const tickerPosition = useLayoutStore((s) => s.tickerPosition);
  const setTickerPosition = useLayoutStore((s) => s.setTickerPosition);

  if (tickerPosition === "hidden") return null;

  return (
    <div
      style={{
        height: 28,
        flexShrink: 0,
        background: "var(--bg-panel)",
        borderTop: tickerPosition === "bottom" ? "1px solid var(--border)" : "none",
        borderBottom: tickerPosition === "top" ? "1px solid var(--border)" : "none",
        display: "flex",
        alignItems: "center",
        overflow: "visible",
        position: "relative",
        zIndex: 45,
      }}
    >
      <TickerControls position={tickerPosition} setPosition={setTickerPosition} />
      <TickerContent />
    </div>
  );
}

function TickerControls({
  position,
  setPosition,
}: {
  position: "top" | "bottom";
  setPosition: (pos: "top" | "bottom" | "hidden") => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", paddingLeft: 8, gap: 4, position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 10, color: "var(--green-primary)", fontWeight: 700,
          padding: "2px 6px", letterSpacing: "0.06em",
        }}
      >
        LIVE
      </button>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green-primary)", animation: "pulse 2s infinite", flexShrink: 0 }} />
      <span style={{ width: 1, height: 16, background: "var(--border)", margin: "0 4px", flexShrink: 0 }} />

      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 98 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute",
            [position === "top" ? "top" : "bottom"]: 26,
            left: 0, width: 140,
            background: "var(--bg-panel)", border: "1px solid var(--border)",
            borderRadius: 4, boxShadow: "0 4px 16px rgba(0,0,0,.5)", zIndex: 99,
            overflow: "hidden",
          }}>
            {(["top", "bottom", "hidden"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => { setPosition(opt); setOpen(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 10px", background: position === opt ? "var(--bg-hover)" : "transparent",
                  border: "none", cursor: "pointer", fontSize: 11, textAlign: "left",
                  color: position === opt ? "var(--green-primary)" : "var(--text-secondary)",
                }}
              >
                {opt === "top" ? "Dock Top" : opt === "bottom" ? "Dock Bottom" : "Hide Ticker"}
                {position === opt && <span style={{ marginLeft: "auto", fontSize: 9 }}>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TickerContent() {
  const allEvents = useEventStore((s) => s.events);
  const events = useFilteredEvents();
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);
  const filters = useEventStore((s) => s.filters);
  const setFilter = useEventStore((s) => s.setFilter);
  const activeLayers = useLayoutStore((s) => s.activeLayers);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState<TickerMode>("events");

  // Source IDs that are actually visible on the map (layer enabled)
  const activeSourceIds = useMemo(
    () => new Set(ALL_LAYERS.filter((l) => activeLayers.has(l.id)).flatMap((l) => l.sourceIds)),
    [activeLayers],
  );

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || paused) return;
    const iv = setInterval(() => {
      el.scrollLeft += 1;
      // Loop: when we've scrolled past half (duplicated content), jump back
      if (el.scrollLeft >= el.scrollWidth / 2) {
        el.scrollLeft = 0;
      }
    }, 30);
    return () => clearInterval(iv);
  }, [paused]);

  // Sort by most recent — only events from active layers (matching the map)
  const recent = useMemo(() => {
    return [...events]
      .filter((e) => activeSourceIds.has(e.source_id))
      .sort((a, b) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime())
      .slice(0, 100);
  }, [events, activeSourceIds]);

  // Severity summary — count events that are actually visible on the map
  // (filtered by time, category, source, AND active layers — but not severity)
  const sevCounts = useMemo(() => {
    const counts: Record<SeverityLevel, number> = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
    const cutoff = new Date(Date.now() - filters.hoursBack * 3600 * 1000);
    for (const e of allEvents) {
      if (new Date(e.event_time) < cutoff) continue;
      if (!activeSourceIds.has(e.source_id)) continue;
      if (filters.categories.size > 0 && !filters.categories.has(e.category)) continue;
      if (filters.sourceIds.size > 0 && !filters.sourceIds.has(e.source_id)) continue;
      counts[e.severity]++;
    }
    return counts;
  }, [allEvents, filters.hoursBack, filters.categories, filters.sourceIds, activeSourceIds]);

  // Source summary — unique source_ids with counts (time + layer filtered)
  const sourceCounts = useMemo(() => {
    const cutoff = new Date(Date.now() - filters.hoursBack * 3600 * 1000);
    const map = new Map<string, { count: number; category: FeedCategory; latest: string }>();
    for (const e of allEvents) {
      if (new Date(e.event_time) < cutoff) continue;
      if (!activeSourceIds.has(e.source_id)) continue;
      if (filters.severities.size > 0 && !filters.severities.has(e.severity)) continue;
      if (filters.categories.size > 0 && !filters.categories.has(e.category)) continue;
      const existing = map.get(e.source_id);
      if (!existing || new Date(e.event_time) > new Date(existing.latest)) {
        map.set(e.source_id, {
          count: (existing?.count ?? 0) + 1,
          category: e.category,
          latest: e.event_time,
        });
      } else if (existing) {
        existing.count++;
      }
    }
    return [...map.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 30);
  }, [allEvents, filters.hoursBack, filters.severities, filters.categories, activeSourceIds]);

  const toggleSeverity = (sev: SeverityLevel) => {
    const next = new Set(filters.severities);
    if (next.has(sev)) { next.delete(sev); } else { next.add(sev); }
    setFilter("severities", next);
  };

  const toggleSource = (sourceId: string) => {
    const next = new Set(filters.sourceIds);
    if (next.has(sourceId)) { next.delete(sourceId); } else { next.add(sourceId); }
    setFilter("sourceIds", next);
  };

  const clearSevFilter = () => setFilter("severities", new Set());
  const clearSourceFilter = () => setFilter("sourceIds", new Set());

  return (
    <div
      style={{ flex: 1, display: "flex", alignItems: "center", overflow: "hidden", minWidth: 0 }}
    >
      {/* Mode tabs */}
      <div style={{ display: "flex", gap: 2, flexShrink: 0, marginRight: 6 }}>
        {([
          { key: "events", label: "Feed" },
          { key: "feeds", label: "My Feeds" },
          { key: "severities", label: "Status" },
          { key: "sources", label: "Sources" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            style={{
              padding: "2px 6px", borderRadius: 3, border: "none", cursor: "pointer",
              fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
              background: mode === key ? "var(--bg-hover)" : "transparent",
              color: mode === key ? "var(--green-primary)" : "var(--text-muted)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <span style={{ width: 1, height: 16, background: "var(--border)", flexShrink: 0, marginRight: 6 }} />

      {mode === "events" && (
        <div
          ref={scrollRef}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          style={{
            flex: 1, display: "flex", alignItems: "center", gap: 0,
            overflow: "hidden", whiteSpace: "nowrap",
          }}
        >
          {/* Duplicate items for seamless loop */}
          {[...recent, ...recent].map((e, i) => (
            <TickerItem
              key={`${e.id}_${i}`}
              event={e}
              onClick={() => setSelectedEvent(e)}
            />
          ))}
          {recent.length === 0 && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", padding: "0 12px" }}>
              Waiting for events...
            </span>
          )}
        </div>
      )}

      {mode === "feeds" && <FeedsTickerContent />}

      {mode === "severities" && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, paddingLeft: 4 }}>
          {(["critical", "high", "medium", "low", "info"] as const).map((sev) => {
            const active = filters.severities.size === 0 || filters.severities.has(sev);
            return (
              <button
                key={sev}
                onClick={() => toggleSeverity(sev)}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "2px 8px", borderRadius: 3, cursor: "pointer",
                  background: active ? "transparent" : "rgba(0,0,0,0.2)",
                  border: filters.severities.has(sev) ? `1px solid ${SEVERITY_COLOR[sev]}` : "1px solid transparent",
                  opacity: active ? 1 : 0.35,
                  transition: "all 150ms",
                }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: SEVERITY_COLOR[sev],
                  boxShadow: active && sevCounts[sev] > 0 ? `0 0 4px ${SEVERITY_COLOR[sev]}` : "none",
                }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: SEVERITY_COLOR[sev] }}>
                  {sevCounts[sev]}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  {sev}
                </span>
              </button>
            );
          })}
          <span style={{ width: 1, height: 14, background: "var(--border)", flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            {events.length} shown
          </span>
          {filters.severities.size > 0 && (
            <button
              onClick={clearSevFilter}
              style={{
                background: "none", border: "1px solid var(--border)", borderRadius: 3,
                color: "var(--text-muted)", fontSize: 9, padding: "1px 6px",
                cursor: "pointer", fontWeight: 700,
              }}
            >
              CLEAR
            </button>
          )}
        </div>
      )}

      {mode === "sources" && (
        <div style={{
          flex: 1, display: "flex", alignItems: "center", gap: 4,
          overflow: "hidden", paddingLeft: 4,
        }}>
          {sourceCounts.map(([sourceId, info]) => {
            const active = filters.sourceIds.size === 0 || filters.sourceIds.has(sourceId);
            return (
              <button
                key={sourceId}
                onClick={() => toggleSource(sourceId)}
                style={{
                  display: "flex", alignItems: "center", gap: 3, flexShrink: 0,
                  padding: "1px 6px", borderRadius: 3, cursor: "pointer",
                  background: filters.sourceIds.has(sourceId) ? "rgba(0,230,118,0.08)" : "var(--bg-card)",
                  border: filters.sourceIds.has(sourceId) ? "1px solid var(--green-primary)" : "1px solid var(--border)",
                  opacity: active ? 1 : 0.35,
                  transition: "all 150ms",
                }}
              >
                <span style={{ fontSize: 10 }}>{CATEGORY_ICON[info.category] ?? "●"}</span>
                <span style={{ fontSize: 10, color: active ? "var(--text-secondary)" : "var(--text-muted)", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {sourceId.replace(/_/g, " ")}
                </span>
                <span style={{ fontSize: 9, fontWeight: 700, color: active ? "var(--green-primary)" : "var(--text-muted)" }}>
                  {info.count}
                </span>
              </button>
            );
          })}
          {filters.sourceIds.size > 0 && (
            <button
              onClick={clearSourceFilter}
              style={{
                background: "none", border: "1px solid var(--border)", borderRadius: 3,
                color: "var(--text-muted)", fontSize: 9, padding: "1px 6px",
                cursor: "pointer", fontWeight: 700, flexShrink: 0,
              }}
            >
              CLEAR
            </button>
          )}
          {sourceCounts.length === 0 && (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>No active sources</span>
          )}
        </div>
      )}
    </div>
  );
}

function FeedsTickerContent() {
  const allEvents = useFilteredEvents();
  const customFilters = useLayoutStore((s) => s.customFilters);
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  // Get feeds that have news config (defensive access for pre-migration filters)
  const newsFeeds = useMemo(
    () => customFilters.filter((f) =>
      (f.newsSources?.length ?? 0) > 0 || (f.newsKeywords?.length ?? 0) > 0 || (f.newsRegions?.length ?? 0) > 0,
    ),
    [customFilters],
  );

  // Collect news events matching each feed's filters
  const feedEvents = useMemo(() => {
    const newsEvents = allEvents.filter((e) => NEWS_SOURCE_IDS.has(e.source_id));
    const result: { feed: string; color: string; event: GeoEvent }[] = [];

    for (const feed of newsFeeds) {
      let items = newsEvents;
      const sources = feed.newsSources ?? [];
      const regions = feed.newsRegions ?? [];
      const keywords = feed.newsKeywords ?? [];

      if (sources.length > 0) {
        const srcSet = new Set(sources);
        items = items.filter((e) => {
          const meta = e.metadata as Record<string, string>;
          return srcSet.has(meta?.source ?? "");
        });
      }

      if (regions.length > 0) {
        const regSet = new Set(regions);
        items = items.filter((e) => {
          const meta = e.metadata as Record<string, string>;
          return regSet.has(meta?.region ?? "");
        });
      }

      if (keywords.length > 0) {
        items = items.filter((e) => {
          const text = `${e.title} ${e.body ?? ""}`.toLowerCase();
          return keywords.some((kw) => text.includes(kw.toLowerCase()));
        });
      }

      for (const e of items.slice(0, 30)) {
        result.push({ feed: feed.name, color: feed.color, event: e });
      }
    }

    return result.sort((a, b) =>
      new Date(b.event.event_time).getTime() - new Date(a.event.event_time).getTime(),
    ).slice(0, 100);
  }, [allEvents, newsFeeds]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || paused) return;
    const iv = setInterval(() => {
      el.scrollLeft += 1;
      if (el.scrollLeft >= el.scrollWidth / 2) el.scrollLeft = 0;
    }, 30);
    return () => clearInterval(iv);
  }, [paused]);

  if (newsFeeds.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", paddingLeft: 8 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          No feeds with news filters configured. Create a feed with keywords or news sources to see headlines here.
        </span>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        flex: 1, display: "flex", alignItems: "center", gap: 0,
        overflow: "hidden", whiteSpace: "nowrap",
      }}
    >
      {[...feedEvents, ...feedEvents].map((item, i) => (
        <button
          key={`${item.event.id}_${i}`}
          onClick={() => setSelectedEvent(item.event)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "0 16px 0 12px", flexShrink: 0, height: 26,
            background: "none", border: "none", cursor: "pointer",
            borderRight: "1px solid var(--border)",
          }}
        >
          <span style={{
            fontSize: 9, padding: "0 4px", borderRadius: 2, fontWeight: 700,
            background: `${item.color}20`, color: item.color,
            letterSpacing: "0.03em",
          }}>
            {item.feed}
          </span>
          <span style={{
            width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
            background: SEVERITY_COLOR[item.event.severity],
          }} />
          <span style={{
            fontSize: 11, color: "var(--text-primary)",
            maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {item.event.title}
          </span>
          <span style={{ fontSize: 9, color: "var(--text-muted)", flexShrink: 0 }}>
            {timeAgo(item.event.event_time)}
          </span>
        </button>
      ))}
      {feedEvents.length === 0 && (
        <span style={{ fontSize: 11, color: "var(--text-muted)", padding: "0 12px" }}>
          No matching headlines for your feeds
        </span>
      )}
    </div>
  );
}

function TickerItem({ event, onClick }: { event: GeoEvent; onClick: () => void }) {
  const color = SEVERITY_COLOR[event.severity];
  const icon = CATEGORY_ICON[event.category] ?? "●";

  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "0 16px 0 12px", flexShrink: 0, height: 26,
        background: "none", border: "none", cursor: "pointer",
        borderRight: "1px solid var(--border)",
      }}
    >
      <span style={{ fontSize: 11 }}>{icon}</span>
      <span style={{
        width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
        background: color,
        boxShadow: event.severity === "critical" || event.severity === "high" ? `0 0 4px ${color}` : "none",
      }} />
      <span style={{
        fontSize: 11, color: "var(--text-primary)",
        maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {event.title}
      </span>
      <span style={{ fontSize: 9, color: "var(--text-muted)", flexShrink: 0 }}>
        {timeAgo(event.event_time)}
      </span>
    </button>
  );
}
