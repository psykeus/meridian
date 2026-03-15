import { useState, useEffect, useMemo } from "react";
import { useNewsFeedStore } from "@/stores/useNewsFeedStore";
import { useFilteredEvents } from "@/stores/useFilteredEvents";
import { useEventStore } from "@/stores/useEventStore";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { timeAgo, SEVERITY_COLOR } from "@/lib/utils";
import type { GeoEvent } from "@/types";

const NEWS_SOURCE_IDS = new Set(["rss_news", "gdelt", "osint_rss"]);

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0, high: 1, medium: 2, low: 3, info: 4,
};

const REGIONS = [
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

const LIVE_STREAMS = [
  { id: "aljazeera", label: "Al Jazeera English", channelId: "UCNye-wNBqNL5ZzHSJj3l8Bg", region: "Middle East" },
  { id: "france24", label: "France24 English", channelId: "UCQfwfsi5VrQ8yKZ-UWmAEFg", region: "Europe" },
  { id: "dw", label: "DW News", channelId: "UCknLrEdhRCp1aegoMqRaCZg", region: "Europe" },
  { id: "skynews", label: "Sky News", channelId: "UCoMdktPbSTixAyNGwb-UYkQ", region: "Europe" },
  { id: "nhk", label: "NHK World", channelId: "UCf-6RTGj__t7VzOjJqEJkpQ", region: "Asia-Pacific" },
  { id: "cgtn", label: "CGTN", channelId: "UCgrNz-aDmcr2uuto8_DVYjQ", region: "Asia-Pacific" },
  { id: "indiatoday", label: "India Today", channelId: "UCYPvAwZP8pZhSMW8qs7cVCw", region: "Asia-Pacific" },
  { id: "abcnews", label: "ABC News", channelId: "UCBi2mrWuNuyYy4gbM6fU18Q", region: "N. America" },
  { id: "euronews", label: "Euronews", channelId: "UCW2QcKZRIyF1UEtBfEsKcKQ", region: "Europe" },
  { id: "wion", label: "WION", channelId: "UC_gUM8rL-Lrg6O3adPW9K1g", region: "Asia-Pacific" },
];

export function NewsFeedDrawer() {
  const isOpen = useNewsFeedStore((s) => s.isOpen);
  const close = useNewsFeedStore((s) => s.close);
  const activeTab = useNewsFeedStore((s) => s.activeTab);
  const setActiveTab = useNewsFeedStore((s) => s.setActiveTab);

  return (
    <div
      style={{
        position: "absolute", top: 0, right: 0, height: "100%", width: 400,
        transform: isOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        zIndex: 42, background: "var(--bg-panel)",
        borderLeft: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        pointerEvents: isOpen ? "all" : "none",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 flex-shrink-0"
        style={{ height: 44, borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.08em" }}>
          NEWS FEED
        </span>
        <button onClick={close} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14, padding: "4px 6px", borderRadius: 4 }}>
          ✕
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex" style={{ borderBottom: "1px solid var(--border)" }}>
        {(["headlines", "streams"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, padding: "8px 0", fontSize: 11, fontWeight: 600,
              textTransform: "uppercase", letterSpacing: "0.06em",
              background: "none", border: "none", cursor: "pointer",
              color: activeTab === tab ? "var(--green-primary)" : "var(--text-muted)",
              borderBottom: activeTab === tab ? "2px solid var(--green-primary)" : "2px solid transparent",
            }}
          >
            {tab === "headlines" ? "Headlines" : "Live Streams"}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "headlines" ? <HeadlinesTab /> : <LiveStreamsTab />}

      {/* Preset footer */}
      <PresetFooter />
    </div>
  );
}

function HeadlinesTab() {
  const keywords = useNewsFeedStore((s) => s.keywords);
  const selectedSources = useNewsFeedStore((s) => s.selectedSources);
  const selectedRegions = useNewsFeedStore((s) => s.selectedRegions);
  const sortBy = useNewsFeedStore((s) => s.sortBy);
  const setSortBy = useNewsFeedStore((s) => s.setSortBy);
  const addKeyword = useNewsFeedStore((s) => s.addKeyword);
  const removeKeyword = useNewsFeedStore((s) => s.removeKeyword);
  const setSelectedRegions = useNewsFeedStore((s) => s.setSelectedRegions);
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);
  const closeNewsFeed = useNewsFeedStore((s) => s.close);
  const allEvents = useFilteredEvents();
  const [keywordInput, setKeywordInput] = useState("");

  const filtered = useMemo(() => {
    let items = allEvents.filter((e) => NEWS_SOURCE_IDS.has(e.source_id));

    // Source filter
    if (selectedSources.length > 0) {
      items = items.filter((e) => {
        const meta = e.metadata as Record<string, string>;
        return selectedSources.includes(meta?.source ?? e.source_id);
      });
    }

    // Region filter
    if (selectedRegions.length > 0) {
      items = items.filter((e) => {
        const meta = e.metadata as Record<string, string>;
        return selectedRegions.includes(meta?.region ?? "");
      });
    }

    // Keyword filter
    if (keywords.length > 0) {
      items = items.filter((e) => {
        const text = `${e.title} ${e.body ?? ""}`.toLowerCase();
        return keywords.some((kw) => text.includes(kw.toLowerCase()));
      });
    }

    // Sort
    if (sortBy === "severity") {
      items = [...items].sort((a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4)
      );
    } else {
      items = [...items].sort((a, b) =>
        new Date(b.event_time).getTime() - new Date(a.event_time).getTime()
      );
    }

    return items.slice(0, 200);
  }, [allEvents, keywords, selectedSources, selectedRegions, sortBy]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && keywordInput.trim()) {
      addKeyword(keywordInput.trim());
      setKeywordInput("");
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Filter bar */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Keyword input */}
        <div style={{ display: "flex", gap: 4 }}>
          <input
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add keyword filter..."
            style={{
              flex: 1, padding: "4px 8px", fontSize: 11,
              background: "var(--bg-card)", border: "1px solid var(--border)",
              borderRadius: 4, color: "var(--text-primary)", outline: "none",
            }}
          />
          <button
            onClick={() => setSortBy(sortBy === "time" ? "severity" : "time")}
            title={`Sort by ${sortBy === "time" ? "severity" : "time"}`}
            style={{
              padding: "4px 8px", fontSize: 10, fontWeight: 600,
              background: "var(--bg-card)", border: "1px solid var(--border)",
              borderRadius: 4, cursor: "pointer", color: "var(--text-secondary)",
            }}
          >
            {sortBy === "time" ? "TIME" : "SEV"}
          </button>
        </div>

        {/* Active keywords */}
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {keywords.map((kw) => (
              <span
                key={kw}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  padding: "1px 6px", fontSize: 10, borderRadius: 3,
                  background: "rgba(0,230,118,0.1)", color: "var(--green-primary)",
                  border: "1px solid rgba(0,230,118,0.2)",
                }}
              >
                {kw}
                <button
                  onClick={() => removeKeyword(kw)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--green-primary)", fontSize: 10, padding: 0 }}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Region chips */}
        <div className="flex flex-wrap gap-1">
          {REGIONS.map((r) => {
            const active = selectedRegions.includes(r.id);
            return (
              <button
                key={r.id}
                onClick={() => {
                  if (active) setSelectedRegions(selectedRegions.filter((x) => x !== r.id));
                  else setSelectedRegions([...selectedRegions, r.id]);
                }}
                style={{
                  padding: "1px 6px", fontSize: 9, borderRadius: 3, cursor: "pointer",
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

      {/* Headlines list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 12, color: "var(--text-muted)" }}>
            No matching headlines
          </div>
        ) : (
          filtered.map((e) => (
            <HeadlineRow key={e.id} event={e} onClick={() => {
              closeNewsFeed();
              setSelectedEvent(e);
            }} />
          ))
        )}
      </div>
    </div>
  );
}

function HeadlineRow({ event, onClick }: { event: GeoEvent; onClick: () => void }) {
  const meta = event.metadata as Record<string, string>;
  const source = meta?.source ?? event.source_id.replace(/_/g, " ");
  const region = meta?.region;
  const sevColor = SEVERITY_COLOR[event.severity] ?? "var(--text-muted)";

  return (
    <div
      className="data-row"
      onClick={onClick}
      style={{ flexDirection: "column", alignItems: "flex-start", gap: 3, padding: "8px 12px", cursor: "pointer" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
        <span className="source-badge" style={{ flexShrink: 0, fontSize: 9 }}>{source}</span>
        {region && (
          <span style={{ fontSize: 8, padding: "0 4px", borderRadius: 2, background: "var(--bg-card)", color: "var(--text-muted)" }}>
            {region}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span
          style={{
            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: sevColor,
          }}
        />
        <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
          {timeAgo(event.event_time)}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.4 }}>
        {event.title}
      </div>
    </div>
  );
}

function LiveStreamEmbed({ stream }: { stream: typeof LIVE_STREAMS[0] }) {
  const [videoId, setVideoId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/proxy/youtube-live?channel_id=${stream.channelId}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setVideoId(data.video_id ?? null); })
      .catch(() => { if (!cancelled) setVideoId(null); });
    return () => { cancelled = true; };
  }, [stream.channelId]);

  if (videoId === undefined) {
    return (
      <div style={{ padding: "0 12px 12px" }}>
        <div style={{ width: "100%", height: 200, borderRadius: 4, background: "#111", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Checking live status...</span>
        </div>
      </div>
    );
  }

  if (!videoId) {
    return (
      <div style={{ padding: "0 12px 12px" }}>
        <div style={{ width: "100%", height: 80, borderRadius: 4, background: "#111", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>No active live stream</span>
          <a
            href={`https://www.youtube.com/channel/${stream.channelId}/live`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: "var(--green-primary)", textDecoration: "none" }}
          >
            Open channel page ↗
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 12px 12px" }}>
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`}
        style={{ width: "100%", height: 200, border: "none", borderRadius: 4, background: "#000" }}
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        loading="lazy"
        title={stream.label}
      />
    </div>
  );
}

function LiveStreamsTab() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      {LIVE_STREAMS.map((stream) => {
        const isExpanded = expandedId === stream.id;
        return (
          <div key={stream.id} style={{ borderBottom: "1px solid var(--border)" }}>
            <button
              onClick={() => setExpandedId(isExpanded ? null : stream.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "10px 12px", background: isExpanded ? "var(--bg-hover)" : "transparent",
                border: "none", cursor: "pointer", textAlign: "left",
              }}
            >
              <span style={{ fontSize: 14 }}>▶</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                  {stream.label}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  {stream.region}
                </div>
              </div>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                {isExpanded ? "▲" : "▼"}
              </span>
            </button>
            {isExpanded && <LiveStreamEmbed stream={stream} />}
          </div>
        );
      })}
    </div>
  );
}

function PresetFooter() {
  const presets = useNewsFeedStore((s) => s.presets);
  const activePresetId = useNewsFeedStore((s) => s.activePresetId);
  const savePreset = useNewsFeedStore((s) => s.savePreset);
  const loadPreset = useNewsFeedStore((s) => s.loadPreset);
  const deletePreset = useNewsFeedStore((s) => s.deletePreset);
  const activeDeckId = useLayoutStore((s) => s.activeDeckId);
  const [saving, setSaving] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [linkDeck, setLinkDeck] = useState(true);
  const [showList, setShowList] = useState(false);

  const handleSave = () => {
    if (!presetName.trim()) return;
    savePreset(presetName.trim(), linkDeck ? activeDeckId : null);
    setPresetName("");
    setSaving(false);
  };

  return (
    <div style={{ borderTop: "1px solid var(--border)", padding: "8px 12px" }}>
      {saving ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Preset name..."
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            autoFocus
            style={{
              padding: "4px 8px", fontSize: 11,
              background: "var(--bg-card)", border: "1px solid var(--border)",
              borderRadius: 4, color: "var(--text-primary)", outline: "none",
            }}
          />
          <div className="flex items-center justify-between">
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--text-muted)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={linkDeck}
                onChange={(e) => setLinkDeck(e.target.checked)}
                style={{ width: 12, height: 12 }}
              />
              Link to current deck
            </label>
            <div className="flex gap-2">
              <button onClick={() => setSaving(false)} style={{ padding: "2px 8px", fontSize: 10, background: "none", border: "1px solid var(--border)", borderRadius: 3, color: "var(--text-muted)", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleSave} style={{ padding: "2px 8px", fontSize: 10, background: "var(--green-primary)", border: "none", borderRadius: 3, color: "var(--bg-app)", cursor: "pointer", fontWeight: 600 }}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSaving(true)}
            style={{
              padding: "3px 10px", fontSize: 10, fontWeight: 600,
              background: "none", border: "1px solid var(--green-primary)",
              borderRadius: 4, color: "var(--green-primary)", cursor: "pointer",
            }}
          >
            + Save Preset
          </button>

          {presets.length > 0 && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowList(!showList)}
                style={{
                  padding: "3px 10px", fontSize: 10,
                  background: "var(--bg-card)", border: "1px solid var(--border)",
                  borderRadius: 4, color: "var(--text-secondary)", cursor: "pointer",
                }}
              >
                Presets ({presets.length}) {showList ? "▲" : "▼"}
              </button>

              {showList && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 98 }} onClick={() => setShowList(false)} />
                  <div
                    style={{
                      position: "absolute", bottom: "100%", right: 0, marginBottom: 4,
                      width: 220, background: "var(--bg-panel)", border: "1px solid var(--border)",
                      borderRadius: 6, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 99,
                      maxHeight: 300, overflowY: "auto",
                    }}
                  >
                    {presets.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
                          background: p.id === activePresetId ? "var(--bg-hover)" : "transparent",
                        }}
                      >
                        <button
                          onClick={() => { loadPreset(p.id); setShowList(false); }}
                          style={{
                            flex: 1, background: "none", border: "none", cursor: "pointer",
                            textAlign: "left", padding: 0,
                          }}
                        >
                          <div style={{ fontSize: 11, fontWeight: 500, color: p.id === activePresetId ? "var(--green-primary)" : "var(--text-primary)" }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: 9, color: "var(--text-muted)" }}>
                            {p.deckId ? `Linked: ${p.deckId}` : "All decks"}
                            {p.keywords.length > 0 && ` · ${p.keywords.length} keywords`}
                          </div>
                        </button>
                        <button
                          onClick={() => deletePreset(p.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--text-muted)", padding: "2px 4px" }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
