import { useState, useMemo } from "react";
import { useFeedHealth, type FeedHealthEntry } from "@/hooks/useFeedHealth";
import { useLayoutStore, type CustomFilter } from "@/stores/useLayoutStore";
import { useEventStore } from "@/stores/useEventStore";
import { ALL_LAYERS, LAYER_GROUPS, type LayerGroup, type LayerConfig } from "@/config/layers";
import { timeAgo } from "@/lib/utils";

// Known news sources from the rss_news worker for the source picker
const NEWS_SOURCES = [
  "Reuters World", "AP Top News", "BBC World", "Sky News",
  "France24 (en)", "Le Monde", "Tagesschau", "DW World", "EuroNews",
  "The Guardian World", "TASS (en)", "Al Jazeera", "Al Arabiya (en)",
  "Xinhua (en)", "CGTN", "NHK World", "Yonhap (en)",
  "Times of India", "NDTV World", "Channel News Asia", "Kyodo News",
  "allAfrica", "Telesur (en)", "EFE (en)", "Folha de S.Paulo",
  "ABC News", "CBC World", "ABC Australia",
];

const NEWS_REGIONS = [
  { id: "global", label: "Global" },
  { id: "europe", label: "Europe" },
  { id: "north_america", label: "N. America" },
  { id: "asia_pacific", label: "Asia-Pacific" },
  { id: "middle_east", label: "Middle East" },
  { id: "africa", label: "Africa" },
  { id: "latin_america", label: "Latin America" },
  { id: "russia_cis", label: "Russia/CIS" },
  { id: "oceania", label: "Oceania" },
];

// ── Color palette for feeds ─────────────────────────────────────────────────

const FEED_COLORS = [
  "#00e676", "#448aff", "#ff9800", "#e040fb", "#ff5252",
  "#29b6f6", "#ffeb3b", "#69f0ae", "#f48fb1", "#80cbc4",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Given layer IDs, collect all unique backend source_ids. */
function layersToSourceIds(layerIds: string[]): string[] {
  const set = new Set<string>();
  for (const lid of layerIds) {
    const layer = ALL_LAYERS.find((l) => l.id === lid);
    if (layer) for (const sid of layer.sourceIds) set.add(sid);
  }
  return [...set];
}

/** Aggregate health status across multiple source workers. */
function aggregateHealth(
  sourceIds: string[],
  health: Record<string, FeedHealthEntry>,
): { status: "healthy" | "degraded" | "error" | "unknown"; healthy: number; total: number } {
  if (sourceIds.length === 0) return { status: "unknown", healthy: 0, total: 0 };
  let healthyCount = 0;
  let errorCount = 0;
  let matched = 0;
  for (const sid of sourceIds) {
    const h = health[sid];
    if (!h) continue;
    matched++;
    if (h.status === "healthy") healthyCount++;
    else if (h.status === "error") errorCount++;
  }
  if (matched === 0) return { status: "unknown", healthy: 0, total: sourceIds.length };
  if (errorCount > 0) return { status: "error", healthy: healthyCount, total: matched };
  if (healthyCount < matched) return { status: "degraded", healthy: healthyCount, total: matched };
  return { status: "healthy", healthy: healthyCount, total: matched };
}

const STATUS_COLORS: Record<string, string> = {
  healthy: "var(--green-primary)",
  degraded: "var(--orange-warning)",
  error: "var(--red-critical)",
  unknown: "var(--text-muted)",
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

export function FeedManagementPage() {
  const { feeds: healthData, loading: healthLoading, lastRefresh, refresh } = useFeedHealth();
  const customFilters = useLayoutStore((s) => s.customFilters);
  const activeFilterId = useLayoutStore((s) => s.activeFilterId);
  const applyFilter = useLayoutStore((s) => s.applyFilter);
  const deleteFilter = useLayoutStore((s) => s.deleteFilter);
  const createFilter = useLayoutStore((s) => s.createFilter);
  const updateFilter = useLayoutStore((s) => s.updateFilter);
  const clearActiveFilter = useLayoutStore((s) => s.clearActiveFilter);

  const [showCreate, setShowCreate] = useState(false);
  const [editingFeed, setEditingFeed] = useState<CustomFilter | null>(null);
  const [tab, setTab] = useState<"feeds" | "sources">("feeds");
  const [sourceFilter, setSourceFilter] = useState<"all" | "active">("all");
  const [sourceSearch, setSourceSearch] = useState("");

  // Count events per source_id
  const events = useEventStore((s) => s.events);
  const eventCountBySource = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      counts[e.source_id] = (counts[e.source_id] ?? 0) + 1;
    }
    return counts;
  }, [events]);

  // Active feed's source IDs (for filtering sources table)
  const activeFeed = customFilters.find((f) => f.id === activeFilterId);
  const activeSourceIds = useMemo(
    () => activeFeed ? new Set(layersToSourceIds(activeFeed.layers)) : null,
    [activeFeed],
  );

  // Source table entries
  const sourceEntries = useMemo(() => {
    let entries = Object.entries(healthData);
    if (sourceFilter === "active" && activeSourceIds) {
      entries = entries.filter(([id]) => activeSourceIds.has(id));
    }
    if (sourceSearch.trim()) {
      const q = sourceSearch.toLowerCase();
      entries = entries.filter(([id, h]) =>
        id.toLowerCase().includes(q) || (h.name ?? "").toLowerCase().includes(q),
      );
    }
    return entries.sort((a, b) => {
      // errors first, then degraded, then healthy
      const order = { error: 0, degraded: 1, unknown: 2, healthy: 3 };
      return (order[a[1].status] ?? 9) - (order[b[1].status] ?? 9);
    });
  }, [healthData, sourceFilter, activeSourceIds, sourceSearch]);

  const healthyCount = sourceEntries.filter(([, v]) => v.status === "healthy").length;
  const errorCount = sourceEntries.filter(([, v]) => v.status === "error").length;
  const degradedCount = sourceEntries.filter(([, v]) => v.status === "degraded").length;

  // Which feeds use a given source_id
  const sourceToFeeds = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of customFilters) {
      for (const sid of layersToSourceIds(f.layers)) {
        (map[sid] ??= []).push(f.name);
      }
    }
    return map;
  }, [customFilters]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 24px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
              Feed Management
            </h1>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              Create custom feeds, monitor source health, manage data layers
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              Updated {timeAgo(lastRefresh.toISOString())}
            </span>
            <button onClick={refresh} style={btnSecondary}>Refresh</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)" }}>
          <TabButton active={tab === "feeds"} onClick={() => setTab("feeds")}>
            My Feeds ({customFilters.length})
          </TabButton>
          <TabButton active={tab === "sources"} onClick={() => setTab("sources")}>
            Source Health ({Object.keys(healthData).length})
          </TabButton>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px" }}>
        {tab === "feeds" ? (
          <FeedsTab
            feeds={customFilters}
            activeFilterId={activeFilterId}
            healthData={healthData}
            eventCountBySource={eventCountBySource}
            onApply={applyFilter}
            onClear={clearActiveFilter}
            onDelete={deleteFilter}
            onEdit={setEditingFeed}
            onCreate={() => setShowCreate(true)}
          />
        ) : (
          <SourcesTab
            entries={sourceEntries}
            healthyCount={healthyCount}
            degradedCount={degradedCount}
            errorCount={errorCount}
            totalCount={Object.keys(healthData).length}
            loading={healthLoading}
            eventCounts={eventCountBySource}
            sourceToFeeds={sourceToFeeds}
            sourceFilter={sourceFilter}
            onFilterChange={setSourceFilter}
            search={sourceSearch}
            onSearchChange={setSourceSearch}
            hasActiveFeed={!!activeFeed}
          />
        )}
      </div>

      {/* Create / Edit dialog */}
      {(showCreate || editingFeed) && (
        <FeedDialog
          existing={editingFeed}
          healthData={healthData}
          onCreate={(name, icon, desc, color, layers, newsSources, newsKeywords, newsRegions) => {
            const id = createFilter(name, icon, desc, color);
            updateFilter(id, { layers, newsSources, newsKeywords, newsRegions });
          }}
          onUpdate={(id, updates) => updateFilter(id, updates)}
          onClose={() => { setShowCreate(false); setEditingFeed(null); }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FEEDS TAB
// ══════════════════════════════════════════════════════════════════════════════

function FeedsTab({
  feeds, activeFilterId, healthData, eventCountBySource,
  onApply, onClear, onDelete, onEdit, onCreate,
}: {
  feeds: CustomFilter[];
  activeFilterId: string | null;
  healthData: Record<string, FeedHealthEntry>;
  eventCountBySource: Record<string, number>;
  onApply: (id: string) => void;
  onClear: () => void;
  onDelete: (id: string) => void;
  onEdit: (f: CustomFilter) => void;
  onCreate: () => void;
}) {
  return (
    <div>
      {/* Create button */}
      <button onClick={onCreate} style={{
        ...btnPrimary,
        marginBottom: 20,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        + Create Feed
      </button>

      {feeds.length === 0 && (
        <div style={{
          textAlign: "center", padding: "48px 24px",
          background: "var(--bg-panel)", border: "1px solid var(--border)",
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.5 }}>◉</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
            No custom feeds yet
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, maxWidth: 400, margin: "0 auto 16px" }}>
            Create a feed to group data layers together. Each feed gives you a curated view of specific intelligence sources.
          </div>
          <button onClick={onCreate} style={btnPrimary}>Create your first feed</button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {feeds.map((feed) => {
          const sourceIds = layersToSourceIds(feed.layers);
          const agg = aggregateHealth(sourceIds, healthData);
          const eventCount = sourceIds.reduce((sum, sid) => sum + (eventCountBySource[sid] ?? 0), 0);
          const isActive = feed.id === activeFilterId;

          return (
            <div
              key={feed.id}
              style={{
                background: "var(--bg-panel)",
                border: isActive ? `2px solid ${feed.color}` : "1px solid var(--border)",
                borderRadius: 8,
                padding: 16,
                position: "relative",
                transition: "border-color 150ms",
              }}
            >
              {/* Active badge */}
              {isActive && (
                <div style={{
                  position: "absolute", top: 8, right: 8,
                  fontSize: 9, fontWeight: 700, padding: "2px 8px",
                  background: `${feed.color}22`, color: feed.color,
                  borderRadius: 3, letterSpacing: "0.06em",
                }}>
                  ACTIVE
                </div>
              )}

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{
                  fontSize: 20, width: 36, height: 36,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: `${feed.color}15`, borderRadius: 8,
                  border: `1px solid ${feed.color}30`,
                }}>
                  {feed.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                    {feed.name}
                  </div>
                  {feed.description && (
                    <div style={{
                      fontSize: 11, color: "var(--text-muted)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {feed.description}
                    </div>
                  )}
                </div>
              </div>

              {/* Stats row */}
              <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                <MiniStat label="Layers" value={String(feed.layers.length)} />
                <MiniStat label="Sources" value={String(sourceIds.length)} />
                <MiniStat label="Events" value={eventCount.toLocaleString()} />
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: STATUS_COLORS[agg.status],
                    boxShadow: agg.status === "healthy" ? `0 0 4px ${STATUS_COLORS.healthy}` : "none",
                  }} />
                  <span style={{ fontSize: 10, color: STATUS_COLORS[agg.status], fontWeight: 600 }}>
                    {agg.healthy}/{agg.total}
                  </span>
                </div>
              </div>

              {/* Layer pills */}
              <div style={{
                display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8,
                maxHeight: 52, overflow: "hidden",
              }}>
                {feed.layers.slice(0, 8).map((lid) => {
                  const layer = ALL_LAYERS.find((l) => l.id === lid);
                  if (!layer) return null;
                  return (
                    <span key={lid} style={{
                      fontSize: 10, padding: "2px 7px", borderRadius: 3,
                      background: "var(--bg-card)", border: "1px solid var(--border)",
                      color: "var(--text-secondary)", whiteSpace: "nowrap",
                    }}>
                      {layer.icon} {layer.label}
                    </span>
                  );
                })}
                {feed.layers.length > 8 && (
                  <span style={{
                    fontSize: 10, padding: "2px 7px", borderRadius: 3,
                    background: "var(--bg-card)", color: "var(--text-muted)",
                  }}>
                    +{feed.layers.length - 8} more
                  </span>
                )}
              </div>

              {/* News keywords & sources pills */}
              {(feed.newsKeywords.length > 0 || feed.newsSources.length > 0 || feed.newsRegions.length > 0) && (
                <div style={{
                  display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 14,
                }}>
                  {feed.newsKeywords.map((kw) => (
                    <span key={`kw-${kw}`} style={{
                      fontSize: 10, padding: "2px 7px", borderRadius: 3,
                      background: "rgba(255,152,0,0.1)", border: "1px solid rgba(255,152,0,0.25)",
                      color: "#ff9800", whiteSpace: "nowrap",
                    }}>
                      {kw}
                    </span>
                  ))}
                  {feed.newsSources.slice(0, 4).map((src) => (
                    <span key={`src-${src}`} style={{
                      fontSize: 10, padding: "2px 7px", borderRadius: 3,
                      background: "rgba(66,165,245,0.1)", border: "1px solid rgba(66,165,245,0.25)",
                      color: "#42a5f5", whiteSpace: "nowrap",
                    }}>
                      {src}
                    </span>
                  ))}
                  {feed.newsSources.length > 4 && (
                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, background: "var(--bg-card)", color: "var(--text-muted)" }}>
                      +{feed.newsSources.length - 4} sources
                    </span>
                  )}
                  {feed.newsRegions.map((r) => (
                    <span key={`reg-${r}`} style={{
                      fontSize: 10, padding: "2px 7px", borderRadius: 3,
                      background: "rgba(0,230,118,0.1)", border: "1px solid rgba(0,230,118,0.2)",
                      color: "var(--green-primary)", whiteSpace: "nowrap",
                    }}>
                      {r}
                    </span>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 6 }}>
                {isActive ? (
                  <button onClick={onClear} style={{
                    ...btnSecondary, flex: 1, borderColor: feed.color, color: feed.color,
                  }}>
                    Deactivate
                  </button>
                ) : (
                  <button onClick={() => onApply(feed.id)} style={{
                    ...btnPrimary, flex: 1, background: feed.color,
                    color: "#000",
                  }}>
                    Apply
                  </button>
                )}
                <button onClick={() => onEdit(feed)} style={btnSecondary}>Edit</button>
                <button onClick={() => {
                  if (confirm(`Delete feed "${feed.name}"?`)) onDelete(feed.id);
                }} style={{ ...btnSecondary, color: "var(--red-critical)", borderColor: "rgba(255,82,82,0.3)" }}>
                  Delete
                </button>
              </div>

              {/* Timestamp */}
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>
                Updated {timeAgo(feed.updatedAt)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SOURCES TAB
// ══════════════════════════════════════════════════════════════════════════════

function SourcesTab({
  entries, healthyCount, degradedCount, errorCount, totalCount,
  loading, eventCounts, sourceToFeeds, sourceFilter, onFilterChange,
  search, onSearchChange, hasActiveFeed,
}: {
  entries: [string, FeedHealthEntry][];
  healthyCount: number;
  degradedCount: number;
  errorCount: number;
  totalCount: number;
  loading: boolean;
  eventCounts: Record<string, number>;
  sourceToFeeds: Record<string, string[]>;
  sourceFilter: "all" | "active";
  onFilterChange: (f: "all" | "active") => void;
  search: string;
  onSearchChange: (s: string) => void;
  hasActiveFeed: boolean;
}) {
  return (
    <div>
      {/* Stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <StatCard label="Healthy" value={healthyCount} color="var(--green-primary)" />
        <StatCard label="Degraded" value={degradedCount} color="var(--orange-warning)" />
        <StatCard label="Error" value={errorCount} color="var(--red-critical)" />
        <StatCard label="Total" value={totalCount} color="var(--text-secondary)" />
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search sources..."
          style={{
            flex: 1, maxWidth: 300,
            background: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: 4, color: "var(--text-primary)", fontSize: 12,
            padding: "6px 10px", outline: "none",
          }}
        />
        {hasActiveFeed && (
          <div style={{ display: "flex", gap: 0 }}>
            <button
              onClick={() => onFilterChange("all")}
              style={{
                ...btnSecondary,
                borderRadius: "4px 0 0 4px",
                background: sourceFilter === "all" ? "var(--bg-hover)" : "transparent",
                fontWeight: sourceFilter === "all" ? 700 : 400,
              }}
            >
              All
            </button>
            <button
              onClick={() => onFilterChange("active")}
              style={{
                ...btnSecondary,
                borderRadius: "0 4px 4px 0",
                borderLeft: "none",
                background: sourceFilter === "active" ? "var(--bg-hover)" : "transparent",
                fontWeight: sourceFilter === "active" ? 700 : 400,
              }}
            >
              Active Feed
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 12 }}>
          Loading source health data...
        </div>
      ) : (
        <div style={{
          background: "var(--bg-panel)", border: "1px solid var(--border)",
          borderRadius: 6, overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Source", "Status", "Last Success", "Events", "Fetches", "Errors", "Latency", "Used By"].map((h) => (
                  <th key={h} style={{
                    padding: "8px 12px", textAlign: "left", fontSize: 10,
                    fontWeight: 700, color: "var(--text-muted)",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
                    {search ? "No matching sources" : "No source data available"}
                  </td>
                </tr>
              ) : (
                entries.map(([id, h]) => (
                  <SourceRow
                    key={id}
                    id={id}
                    health={h}
                    eventCount={eventCounts[id] ?? 0}
                    usedBy={sourceToFeeds[id] ?? []}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SourceRow({ id, health, eventCount, usedBy }: {
  id: string;
  health: FeedHealthEntry;
  eventCount: number;
  usedBy: string[];
}) {
  const color = STATUS_COLORS[health.status] ?? "var(--text-muted)";
  const fetchCount = health.fetch_count ?? 0;
  const errCount = health.error_count ?? 0;
  const errorRate = fetchCount > 0 ? ((errCount / fetchCount) * 100).toFixed(1) : "0.0";

  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td style={{ padding: "10px 12px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
          {health.name || id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{id}</div>
      </td>
      <td style={{ padding: "10px 12px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
          {health.status.toUpperCase()}
        </span>
      </td>
      <td style={{ padding: "10px 12px", fontSize: 11, color: "var(--text-secondary)" }}>
        {health.last_success ? timeAgo(health.last_success) : "\u2014"}
      </td>
      <td style={{ padding: "10px 12px", fontSize: 12, fontFamily: "var(--font-mono)", color: eventCount > 0 ? "var(--text-primary)" : "var(--text-muted)" }}>
        {eventCount.toLocaleString()}
      </td>
      <td style={{ padding: "10px 12px", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
        {fetchCount.toLocaleString()}
      </td>
      <td style={{ padding: "10px 12px", fontSize: 12, fontFamily: "var(--font-mono)", color: errCount > 0 ? "var(--red-critical)" : "var(--text-muted)" }}>
        {errCount} <span style={{ fontSize: 10, color: "var(--text-muted)" }}>({errorRate}%)</span>
      </td>
      <td style={{ padding: "10px 12px", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
        {health.avg_latency_ms != null ? `${health.avg_latency_ms.toFixed(0)}ms` : "\u2014"}
      </td>
      <td style={{ padding: "10px 12px" }}>
        {usedBy.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {usedBy.slice(0, 3).map((name) => (
              <span key={name} style={{
                fontSize: 10, padding: "1px 6px", borderRadius: 3,
                background: "rgba(0,230,118,0.1)", border: "1px solid rgba(0,230,118,0.2)",
                color: "var(--green-primary)", whiteSpace: "nowrap",
              }}>
                {name}
              </span>
            ))}
            {usedBy.length > 3 && (
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>+{usedBy.length - 3}</span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>\u2014</span>
        )}
      </td>
    </tr>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FEED CREATE / EDIT DIALOG
// ══════════════════════════════════════════════════════════════════════════════

function FeedDialog({
  existing, healthData, onCreate, onUpdate, onClose,
}: {
  existing: CustomFilter | null;
  healthData: Record<string, FeedHealthEntry>;
  onCreate: (name: string, icon: string, desc: string, color: string, layers: string[], newsSources: string[], newsKeywords: string[], newsRegions: string[]) => void;
  onUpdate: (id: string, updates: Partial<Pick<CustomFilter, "name" | "icon" | "description" | "layers" | "color" | "newsSources" | "newsKeywords" | "newsRegions">>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [icon, setIcon] = useState(existing?.icon ?? "◉");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [color, setColor] = useState(existing?.color ?? FEED_COLORS[0]);
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(
    new Set(existing?.layers ?? []),
  );
  const [search, setSearch] = useState("");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  // News filters state
  const [newsSources, setNewsSources] = useState<Set<string>>(
    new Set(existing?.newsSources ?? []),
  );
  const [newsKeywords, setNewsKeywords] = useState<string[]>(
    existing?.newsKeywords ?? [],
  );
  const [newsRegions, setNewsRegions] = useState<Set<string>>(
    new Set(existing?.newsRegions ?? []),
  );
  const [keywordInput, setKeywordInput] = useState("");
  const [newsSourceSearch, setNewsSourceSearch] = useState("");
  const [showNewsSection, setShowNewsSection] = useState(
    (existing?.newsSources?.length ?? 0) > 0 ||
    (existing?.newsKeywords?.length ?? 0) > 0 ||
    (existing?.newsRegions?.length ?? 0) > 0,
  );

  const isEdit = !!existing;

  // Group layers
  const grouped = useMemo(() => {
    const map: Record<string, LayerConfig[]> = {};
    for (const layer of ALL_LAYERS) {
      (map[layer.group] ??= []).push(layer);
    }
    return map;
  }, []);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.toLowerCase();
    const result: Record<string, LayerConfig[]> = {};
    for (const [group, layers] of Object.entries(grouped)) {
      const filtered = layers.filter(
        (l) => l.label.toLowerCase().includes(q) || l.id.toLowerCase().includes(q)
          || (l.description ?? "").toLowerCase().includes(q),
      );
      if (filtered.length > 0) result[group] = filtered;
    }
    return result;
  }, [grouped, search]);

  const toggleLayer = (id: string) => {
    setSelectedLayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleGroup = (group: string) => {
    const layers = grouped[group] ?? [];
    const allSelected = layers.every((l) => selectedLayers.has(l.id));
    setSelectedLayers((prev) => {
      const next = new Set(prev);
      for (const l of layers) {
        if (allSelected) next.delete(l.id); else next.add(l.id);
      }
      return next;
    });
  };

  const sourceIds = layersToSourceIds([...selectedLayers]);
  const agg = aggregateHealth(sourceIds, healthData);

  const handleSave = () => {
    if (!name.trim()) return;
    const newsSourcesArr = [...newsSources];
    const newsRegionsArr = [...newsRegions];
    if (isEdit) {
      onUpdate(existing.id, {
        name, icon, description, color,
        layers: [...selectedLayers],
        newsSources: newsSourcesArr,
        newsKeywords,
        newsRegions: newsRegionsArr,
      });
    } else {
      onCreate(name, icon, description, color, [...selectedLayers], newsSourcesArr, newsKeywords, newsRegionsArr);
    }
    onClose();
  };

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (kw && !newsKeywords.includes(kw)) {
      setNewsKeywords([...newsKeywords, kw]);
    }
    setKeywordInput("");
  };

  const filteredNewsSources = useMemo(() => {
    if (!newsSourceSearch.trim()) return NEWS_SOURCES;
    const q = newsSourceSearch.toLowerCase();
    return NEWS_SOURCES.filter((s) => s.toLowerCase().includes(q));
  }, [newsSourceSearch]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        width: 640, maxHeight: "85vh",
        background: "var(--bg-panel)", border: "1px solid var(--border)",
        borderRadius: 10, display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Dialog header */}
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
            {isEdit ? "Edit Feed" : "Create Feed"}
          </span>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-muted)", fontSize: 16, padding: "4px 6px",
          }}>
            ✕
          </button>
        </div>

        {/* Form */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {/* Name + Icon */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. OSINT Watch"
                style={inputStyle}
              />
            </div>
            <div style={{ width: 70 }}>
              <label style={labelStyle}>Icon</label>
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                style={{ ...inputStyle, textAlign: "center", fontSize: 18 }}
                maxLength={4}
              />
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this feed..."
              style={inputStyle}
            />
          </div>

          {/* Color picker */}
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Color</label>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              {FEED_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 24, height: 24, borderRadius: 4,
                    background: c, border: color === c ? "2px solid #fff" : "2px solid transparent",
                    cursor: "pointer", transition: "border-color 100ms",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Layer selection */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label style={{ ...labelStyle, margin: 0 }}>
                Data Layers ({selectedLayers.size} selected)
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {sourceIds.length > 0 && (
                  <span style={{
                    fontSize: 10, display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: STATUS_COLORS[agg.status],
                    }} />
                    <span style={{ color: STATUS_COLORS[agg.status], fontWeight: 600 }}>
                      {agg.healthy}/{agg.total} sources healthy
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Search */}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search layers..."
              style={{ ...inputStyle, marginBottom: 8 }}
            />

            {/* Grouped checklist */}
            <div style={{
              border: "1px solid var(--border)", borderRadius: 6,
              maxHeight: 320, overflowY: "auto",
            }}>
              {Object.entries(filteredGroups).map(([group, layers]) => {
                const meta = LAYER_GROUPS[group as LayerGroup];
                if (!meta) return null;
                const isExpanded = expandedGroup === group || !!search.trim();
                const selectedInGroup = layers.filter((l) => selectedLayers.has(l.id)).length;

                return (
                  <div key={group}>
                    <div
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 12px", cursor: "pointer",
                        borderBottom: "1px solid var(--border)",
                        background: isExpanded ? "var(--bg-hover)" : "transparent",
                      }}
                      onClick={() => setExpandedGroup(isExpanded && !search ? null : group)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedInGroup === layers.length && layers.length > 0}
                        ref={(el) => { if (el) el.indeterminate = selectedInGroup > 0 && selectedInGroup < layers.length; }}
                        onChange={(e) => { e.stopPropagation(); toggleGroup(group); }}
                        style={{ accentColor: color }}
                      />
                      <span style={{ fontSize: 14 }}>{meta.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>
                        {meta.label}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        {selectedInGroup}/{layers.length}
                      </span>
                      <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
                        {isExpanded ? "▾" : "▸"}
                      </span>
                    </div>
                    {isExpanded && layers.map((layer) => (
                      <label
                        key={layer.id}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "6px 12px 6px 36px", cursor: "pointer",
                          borderBottom: "1px solid var(--border)",
                          background: selectedLayers.has(layer.id) ? `${color}08` : "transparent",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedLayers.has(layer.id)}
                          onChange={() => toggleLayer(layer.id)}
                          style={{ accentColor: color }}
                        />
                        <span style={{ fontSize: 13 }}>{layer.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: "var(--text-primary)" }}>
                            {layer.label}
                          </div>
                          {layer.description && (
                            <div style={{
                              fontSize: 10, color: "var(--text-muted)",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {layer.description}
                            </div>
                          )}
                        </div>
                        {layer.sourceIds.length > 0 && (
                          <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
                            {layer.sourceIds.length} src
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── News Filters Section ────────────────────────────────── */}
          <div style={{ marginBottom: 14 }}>
            <button
              onClick={() => setShowNewsSection(!showNewsSection)}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "10px 0", background: "none", border: "none",
                cursor: "pointer", textAlign: "left",
              }}
            >
              <span style={{ fontSize: 14 }}>📰</span>
              <span style={{ ...labelStyle, margin: 0, flex: 1 }}>
                News Filters
                {(newsKeywords.length > 0 || newsSources.size > 0 || newsRegions.size > 0) && (
                  <span style={{ fontWeight: 400, color: "var(--green-primary)", marginLeft: 6 }}>
                    ({newsKeywords.length + newsSources.size + newsRegions.size} active)
                  </span>
                )}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                {showNewsSection ? "▾" : "▸"}
              </span>
            </button>

            {showNewsSection && (
              <div style={{
                border: "1px solid var(--border)", borderRadius: 6,
                padding: 14, display: "flex", flexDirection: "column", gap: 12,
              }}>
                {/* Keywords */}
                <div>
                  <label style={labelStyle}>Keywords</label>
                  <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                    <input
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                      placeholder="Add keyword (e.g. missile, conflict)..."
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button onClick={addKeyword} style={{
                      ...btnSecondary, padding: "6px 12px",
                      color: "var(--green-primary)", borderColor: "var(--green-primary)",
                    }}>
                      Add
                    </button>
                  </div>
                  {newsKeywords.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {newsKeywords.map((kw) => (
                        <span key={kw} style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          fontSize: 11, padding: "2px 8px", borderRadius: 3,
                          background: "rgba(255,152,0,0.1)", border: "1px solid rgba(255,152,0,0.25)",
                          color: "#ff9800",
                        }}>
                          {kw}
                          <button
                            onClick={() => setNewsKeywords(newsKeywords.filter((k) => k !== kw))}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#ff9800", fontSize: 11, padding: 0 }}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Regions */}
                <div>
                  <label style={labelStyle}>Regions</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {NEWS_REGIONS.map((r) => {
                      const active = newsRegions.has(r.id);
                      return (
                        <button
                          key={r.id}
                          onClick={() => {
                            const next = new Set(newsRegions);
                            if (active) next.delete(r.id); else next.add(r.id);
                            setNewsRegions(next);
                          }}
                          style={{
                            padding: "3px 10px", fontSize: 11, borderRadius: 4, cursor: "pointer",
                            background: active ? "rgba(0,230,118,0.15)" : "var(--bg-card)",
                            border: `1px solid ${active ? "var(--green-primary)" : "var(--border)"}`,
                            color: active ? "var(--green-primary)" : "var(--text-muted)",
                            fontWeight: active ? 600 : 400,
                          }}
                        >
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* News Sources */}
                <div>
                  <label style={labelStyle}>
                    News Sources ({newsSources.size}/{NEWS_SOURCES.length} selected)
                  </label>
                  <input
                    value={newsSourceSearch}
                    onChange={(e) => setNewsSourceSearch(e.target.value)}
                    placeholder="Search news sources..."
                    style={{ ...inputStyle, marginBottom: 6 }}
                  />
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <button
                      onClick={() => setNewsSources(new Set(NEWS_SOURCES))}
                      style={{ ...btnSecondary, fontSize: 10, padding: "3px 8px" }}
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => setNewsSources(new Set())}
                      style={{ ...btnSecondary, fontSize: 10, padding: "3px 8px" }}
                    >
                      Clear
                    </button>
                  </div>
                  <div style={{
                    maxHeight: 180, overflowY: "auto",
                    border: "1px solid var(--border)", borderRadius: 4,
                  }}>
                    {filteredNewsSources.map((src) => (
                      <label
                        key={src}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "5px 10px", cursor: "pointer",
                          borderBottom: "1px solid var(--border)",
                          background: newsSources.has(src) ? `${color}08` : "transparent",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={newsSources.has(src)}
                          onChange={() => {
                            const next = new Set(newsSources);
                            if (next.has(src)) next.delete(src); else next.add(src);
                            setNewsSources(next);
                          }}
                          style={{ accentColor: color }}
                        />
                        <span style={{ fontSize: 12, color: "var(--text-primary)" }}>{src}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px", borderTop: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {selectedLayers.size} layers, {sourceIds.length} sources
            {newsKeywords.length > 0 && `, ${newsKeywords.length} keywords`}
            {newsSources.size > 0 && `, ${newsSources.size} news sources`}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={btnSecondary}>Cancel</button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || (selectedLayers.size === 0 && newsSources.size === 0 && newsKeywords.length === 0)}
              style={{
                ...btnPrimary,
                background: name.trim() && (selectedLayers.size > 0 || newsSources.size > 0 || newsKeywords.length > 0) ? color : "var(--border)",
                color: name.trim() && (selectedLayers.size > 0 || newsSources.size > 0 || newsKeywords.length > 0) ? "#000" : "var(--text-muted)",
                cursor: name.trim() && (selectedLayers.size > 0 || newsSources.size > 0 || newsKeywords.length > 0) ? "pointer" : "not-allowed",
              }}
            >
              {isEdit ? "Save Changes" : "Create Feed"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SHARED UI
// ══════════════════════════════════════════════════════════════════════════════

function TabButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 16px", fontSize: 12, fontWeight: active ? 700 : 400,
        color: active ? "var(--green-primary)" : "var(--text-muted)",
        background: "none", border: "none", cursor: "pointer",
        borderBottom: active ? "2px solid var(--green-primary)" : "2px solid transparent",
        marginBottom: -1, transition: "color 100ms",
      }}
    >
      {children}
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
        {value}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      padding: "10px 16px", background: "var(--bg-panel)",
      border: "1px solid var(--border)", borderRadius: 6, minWidth: 90,
    }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "var(--font-mono)" }}>{value}</div>
    </div>
  );
}

// ── Shared styles ────────────────────────────────────────────────────────────

const btnPrimary: React.CSSProperties = {
  padding: "7px 16px", borderRadius: 5, fontSize: 12, fontWeight: 700,
  background: "var(--green-primary)", color: "#000",
  border: "none", cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 4, fontSize: 11, fontWeight: 600,
  background: "transparent", color: "var(--text-secondary)",
  border: "1px solid var(--border)", cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600,
  color: "var(--text-muted)", marginBottom: 4,
  textTransform: "uppercase", letterSpacing: "0.05em",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px",
  background: "var(--bg-card)", border: "1px solid var(--border)",
  borderRadius: 4, color: "var(--text-primary)", fontSize: 12,
  outline: "none",
};
