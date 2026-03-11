import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import { useEventStore } from "@/stores/useEventStore";
import { useFilteredEvents } from "@/stores/useFilteredEvents";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { ALL_LAYERS } from "@/config/layers";
import type { GeoEvent } from "@/types";
import { getEntityKey, usePlanTrackingStore } from "@/stores/usePlanTrackingStore";

// ── Raster-only tile styles (inline StyleSpecification) ──────────────────────
const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Esri, Maxar, GeoEye, Earthstar Geographics",
    },
  },
  layers: [
    { id: "bg",        type: "background", paint: { "background-color": "#0a0e1a" } },
    { id: "satellite", type: "raster",     source: "satellite" },
  ],
};

const TERRAIN_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    terrain: {
      type: "raster",
      tiles: [
        "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: " OpenTopoMap contributors (CC-BY-SA)",
      maxzoom: 17,
    },
  },
  layers: [{ id: "terrain", type: "raster", source: "terrain" }],
};

const MAP_STYLES: Record<string, { label: string; icon: string; style: string | StyleSpecification }> = {
  dark:      { label: "Dark",      icon: "", style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" },
  light:     { label: "Light",     icon: "", style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json" },
  streets:   { label: "Streets",   icon: "", style: "https://tiles.openfreemap.org/styles/liberty" },
  terrain:   { label: "Terrain",   icon: "", style: TERRAIN_STYLE },
  satellite: { label: "Satellite", icon: "", style: SATELLITE_STYLE },
};

// ── Derived lookups: source_id → layer color / icon ─────────────────────────
const SOURCE_COLOR = new Map<string, string>();
const SOURCE_ICON  = new Map<string, string>();
ALL_LAYERS.forEach((l) =>
  l.sourceIds.forEach((sid) => {
    if (!SOURCE_COLOR.has(sid)) SOURCE_COLOR.set(sid, l.color);
    if (!SOURCE_ICON.has(sid))  SOURCE_ICON.set(sid, l.icon);
  })
);

// ── Severity → marker diameter (px) ──────────────────────────────────────────
const SEVERITY_SIZE: Record<string, number> = {
  critical: 30, high: 24, medium: 18, low: 14, info: 10,
};

// ── CSS keyframe animations — injected once into document.head ────────────────
let _cssInjected = false;
function ensureCSS() {
  if (_cssInjected || typeof document === "undefined") return;
  _cssInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    @keyframes m-pulse {
      0%   { box-shadow: 0 0 0 0   var(--pc); }
      70%  { box-shadow: 0 0 0 10px transparent; }
      100% { box-shadow: 0 0 0 0   transparent; }
    }
    @keyframes m-pulse-fast {
      0%   { box-shadow: 0 0 0 0  var(--pc); transform: scale(1); }
      50%  { box-shadow: 0 0 0 8px transparent; transform: scale(1.14); }
      100% { box-shadow: 0 0 0 0  transparent; transform: scale(1); }
    }
  `;
  document.head.appendChild(s);
}

export function MeridianMap() {
  ensureCSS();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<maplibregl.Map | null>(null);
  const markersRef      = useRef<Map<string, maplibregl.Marker>>(new Map());

  const [styleKey,    setStyleKey]    = useState("dark");
  const [panelOpen,   setPanelOpen]   = useState(false);

  const allEvents        = useFilteredEvents();
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);
  const isDrawerOpen     = useEventStore((s) => s.isDrawerOpen);
  const activeLayers     = useLayoutStore((s) => s.activeLayers);

  const activeSourceIds = useMemo(
    () => new Set(ALL_LAYERS.filter((l) => activeLayers.has(l.id)).flatMap((l) => l.sourceIds)),
    [activeLayers],
  );

  const events = useMemo(
    () => allEvents.filter((e) => activeSourceIds.has(e.source_id)),
    [allEvents, activeSourceIds],
  );

  // ── Map initialisation ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style:     MAP_STYLES.dark.style as string,
      center:    [0, 20],
      zoom:      2.2,
      minZoom:   1,
      maxZoom:   18,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── Tile-style switching ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(MAP_STYLES[styleKey].style as string | StyleSpecification);
  }, [styleKey]);

  // ── Resize map when context drawer opens/closes ────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Flush layout then resize so MapLibre pixel→lngLat projection stays accurate
    const id = requestAnimationFrame(() => map.resize());
    return () => cancelAnimationFrame(id);
  }, [isDrawerOpen]);

  // ── Marker element factory ───────────────────────────────────────────────
  const createMarkerEl = useCallback((event: GeoEvent): HTMLElement => {
    const size       = SEVERITY_SIZE[event.severity] ?? 18;
    const color      = SOURCE_COLOR.get(event.source_id) ?? "#448aff";
    const icon       = SOURCE_ICON.get(event.source_id) ?? "";
    const isCritical = event.severity === "critical";
    const isHigh     = event.severity === "high";

    const anim = isCritical
      ? "m-pulse-fast 1.4s ease-out infinite"
      : isHigh ? "m-pulse 2.4s ease-out infinite" : "none";

    const el = document.createElement("div");
    el.style.cssText = `
      --pc: ${color}99;
      width: ${size}px; height: ${size}px;
      border-radius: 50%;
      background: ${color}28;
      border: ${isCritical ? 2.5 : 1.5}px solid ${color};
      display: flex; align-items: center; justify-content: center;
      font-size: ${Math.round(size * 0.52)}px;
      cursor: pointer;
      transition: scale 120ms;
      animation: ${anim};
    `;
    el.textContent = icon;
    el.title = `[${event.severity.toUpperCase()}] ${event.title}`;

    el.addEventListener("mouseenter", () => {
      el.style.scale = "1.45";
      el.style.boxShadow = `0 0 0 4px ${color}55`;
      el.style.animation = "none";
    });
    el.addEventListener("mouseleave", () => {
      el.style.scale = "";
      el.style.boxShadow = "";
      el.style.animation = anim;
    });
    // Stop mousedown/touchstart so MapLibre never registers a pan-drag from marker clicks
    el.addEventListener("mousedown",  (e) => e.stopPropagation());
    el.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
    el.addEventListener("click",      (e) => { e.stopPropagation(); setSelectedEvent(event); });

    return el;
  }, [setSelectedEvent]);

  // ── Marker sync: add new, update live positions, remove stale ───────────────
  const updateEntityPosition = usePlanTrackingStore((s) => s.updateEntityPosition);
  const isTracked = usePlanTrackingStore((s) => s.isTracked);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const existing = markersRef.current;
    const incomingKeys = new Set(events.map(getEntityKey));

    existing.forEach((marker, key) => {
      if (!incomingKeys.has(key)) { marker.remove(); existing.delete(key); }
    });

    events.forEach((event) => {
      if (!isFinite(event.lat) || !isFinite(event.lng)) return;
      const key = getEntityKey(event);

      if (existing.has(key)) {
        existing.get(key)!.setLngLat([event.lng, event.lat]);
        if (isTracked(key)) updateEntityPosition(key, event);
        return;
      }

      const marker = new maplibregl.Marker({ element: createMarkerEl(event) })
        .setLngLat([event.lng, event.lat])
        .addTo(map);

      existing.set(key, marker);
    });
  }, [events, createMarkerEl, isTracked, updateEntityPosition]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />

      {/* Live event count */}
      {events.length > 0 && (
        <div style={{
          position: "absolute", top: 8, left: 8, zIndex: 10,
          background: "rgba(10,14,26,.82)",
          border: "1px solid var(--border, #1e2a3a)",
          borderRadius: 4, padding: "3px 8px",
          fontSize: 10, fontFamily: "var(--font-mono, monospace)",
          color: "var(--green-primary, #00e676)",
          pointerEvents: "none",
        }}>
          {events.length} events live
        </div>
      )}

      {/* Tile-style switcher */}
      <div style={{ position: "absolute", bottom: 40, left: 8, zIndex: 10 }}>
        <button
          onClick={() => setPanelOpen((o) => !o)}
          title="Change map style"
          style={{
            width: 32, height: 32, borderRadius: 4, cursor: "pointer",
            background: "var(--bg-panel, #0a0e1a)",
            border: "1px solid var(--border, #1e2a3a)",
            color: panelOpen ? "var(--green-primary, #00e676)" : "var(--text-secondary, #8899aa)",
            fontSize: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {MAP_STYLES[styleKey].icon}
        </button>

        {panelOpen && (
          <div style={{
            position: "absolute", bottom: 36, left: 0, minWidth: 130,
            background: "var(--bg-panel, #0a0e1a)",
            border: "1px solid var(--border, #1e2a3a)",
            borderRadius: 6, overflow: "hidden",
            boxShadow: "0 4px 24px rgba(0,0,0,.65)",
          }}>
            {Object.entries(MAP_STYLES).map(([key, { label, icon }]) => {
              const active = key === styleKey;
              return (
                <button
                  key={key}
                  onClick={() => { setStyleKey(key); setPanelOpen(false); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 12px", border: "none", cursor: "pointer",
                    textAlign: "left", fontSize: 12,
                    background: active ? "var(--bg-hover, #1e2a3a)" : "transparent",
                    color: active ? "var(--green-primary, #00e676)" : "var(--text-secondary, #8899aa)",
                  }}
                >
                  <span style={{ fontSize: 14 }}>{icon}</span>
                  {label}
                  {active && <span style={{ marginLeft: "auto", fontSize: 10 }}>✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
