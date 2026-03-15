import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import { useEventStore } from "@/stores/useEventStore";
import { useFilteredEvents } from "@/stores/useFilteredEvents";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { ALL_LAYERS } from "@/config/layers";
import type { GeoEvent } from "@/types";
import { getEntityKey, usePlanTrackingStore } from "@/stores/usePlanTrackingStore";
import { usePlanStore } from "@/stores/usePlanStore";
import { useCollabStore } from "@/hooks/useCollabSocket";
import {
  isSatelliteEvent,
  SATELLITE_COLORS,
  propagateSatellite,
  computeGroundTrack,
} from "@/lib/satellitePropagation";
import { useReplayStore } from "@/stores/useReplayStore";

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

const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#0a0e1a" } },
    { id: "osm", type: "raster", source: "osm" },
  ],
};

const ESRI_IMAGERY_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Esri, Maxar, GeoEye, Earthstar Geographics",
      maxzoom: 19,
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#0a0e1a" } },
    { id: "esri", type: "raster", source: "esri" },
  ],
};

const OCEAN_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    ocean: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Esri, GEBCO, NOAA, DeLorme",
      maxzoom: 13,
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#03111a" } },
    { id: "ocean", type: "raster", source: "ocean" },
  ],
};

const STAMEN_TONER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    toner: {
      type: "raster",
      tiles: ["https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "Stadia Maps, Stamen Design, OpenMapTiles",
      maxzoom: 18,
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#000000" } },
    { id: "toner", type: "raster", source: "toner" },
  ],
};

const MAP_STYLES: Record<string, { label: string; icon: string; style: string | StyleSpecification }> = {
  dark:      { label: "Dark",       icon: "🌙", style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" },
  light:     { label: "Light",      icon: "☀️",  style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json" },
  streets:   { label: "Streets",    icon: "🗺️",  style: "https://tiles.openfreemap.org/styles/liberty" },
  osm:       { label: "OSM",        icon: "🏘️",  style: OSM_STYLE },
  terrain:   { label: "Terrain",    icon: "⛰️",  style: TERRAIN_STYLE },
  satellite: { label: "Satellite",  icon: "🛰️",  style: SATELLITE_STYLE },
  esri:      { label: "ESRI Imagery", icon: "📡", style: ESRI_IMAGERY_STYLE },
  ocean:     { label: "Ocean",      icon: "🌊", style: OCEAN_STYLE },
  toner:     { label: "Toner",      icon: "🖨️",  style: STAMEN_TONER_STYLE },
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

const CLUSTER_ZOOM_THRESHOLD = 2; // Show DOM markers at almost all zoom levels

// ── CSS keyframe animations — injected once into document.head ────────────────
let _cssInjected = false;
function ensureCSS() {
  if (_cssInjected || typeof document === "undefined") return;
  _cssInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    :root { --marker-scale: 1; }
    .maplibregl-marker .m-marker { transform: scale(var(--marker-scale)); transform-origin: center center; }
    @keyframes m-pulse {
      0%   { box-shadow: 0 0 0 0   var(--pc); }
      70%  { box-shadow: 0 0 0 10px transparent; }
      100% { box-shadow: 0 0 0 0   transparent; }
    }
    @keyframes m-pulse-fast {
      0%   { box-shadow: 0 0 0 0  var(--pc); scale: 1; }
      50%  { box-shadow: 0 0 0 8px transparent; scale: 1.14; }
      100% { box-shadow: 0 0 0 0  transparent; scale: 1; }
    }
  `;
  document.head.appendChild(s);
}

export function MeridianMap() {
  ensureCSS();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<maplibregl.Map | null>(null);
  const markersRef      = useRef<Map<string, maplibregl.Marker>>(new Map());
  const chunkRafRef     = useRef<number | null>(null);
  const [currentZoom, setCurrentZoom] = useState(2.2);

  const styleKey     = useLayoutStore((s) => s.styleKey);
  const setStyleKey  = useLayoutStore((s) => s.setStyleKey);
  const isGlobe      = useLayoutStore((s) => s.isGlobe);
  const setIsGlobe   = useLayoutStore((s) => s.setIsGlobe);
  const [measuring,   setMeasuring]   = useState(false);
  const [measurePts,  setMeasurePts]  = useState<[number, number][]>([]);

  const allEvents        = useFilteredEvents();
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);
  const isDrawerOpen     = useEventStore((s) => s.isDrawerOpen);
  const activeLayers     = useLayoutStore((s) => s.activeLayers);

  // ── Collab state for remote cursors / focus following / layer sync ──────
  const collabConnected    = useCollabStore((s) => s.connected);
  const remoteUsers        = useCollabStore((s) => s.remoteUsers);
  const followingUserId    = useCollabStore((s) => s.followingUserId);
  const followedViewport   = useCollabStore((s) => s._followedViewport);
  const pendingLayerSync   = useCollabStore((s) => s._pendingLayerSync);
  const remoteCursorMarkers = useRef<Map<string, maplibregl.Marker>>(new Map());

  const layerOpacity    = useLayoutStore((s) => s.layerOpacity);
  const gibsDate        = useReplayStore((s) => s.gibsDate);

  const activeSourceIds = useMemo(
    () => new Set(ALL_LAYERS.filter((l) => activeLayers.has(l.id)).flatMap((l) => l.sourceIds)),
    [activeLayers],
  );

  // Build source_id → opacity lookup for marker rendering
  const sourceOpacity = useMemo(() => {
    const map = new Map<string, number>();
    ALL_LAYERS.forEach((l) => {
      const op = layerOpacity[l.id] ?? 1;
      l.sourceIds.forEach((sid) => { if (!map.has(sid) || op < map.get(sid)!) map.set(sid, op); });
    });
    return map;
  }, [layerOpacity]);

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
      minZoom:   0.5,
      maxZoom:   18,
      attributionControl: false,
      renderWorldCopies: false,
      projection: { type: "globe" },
      ...(({ preserveDrawingBuffer: true }) as Record<string, unknown>),
    } as maplibregl.MapOptions);

    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

    map.on("zoomend", () => setCurrentZoom(map.getZoom()));

    mapRef.current = map;
    useReplayStore.getState().setMapInstance(map);
    return () => { map.remove(); mapRef.current = null; useReplayStore.getState().setMapInstance(null); };
  }, []);

  // ── Globe / flat projection toggle ─────────────────────────────────────
  const isGlobeRef = useRef(isGlobe);
  isGlobeRef.current = isGlobe;

  // Apply projection when toggled by user
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => map.setProjection({ type: isGlobe ? "globe" : "mercator" });
    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("style.load", apply);
    }
    return () => { map.off("style.load", apply); };
  }, [isGlobe]);

  // Re-apply projection after any style change (setStyle resets to mercator)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const reApplyProjection = () => {
      map.setProjection({ type: isGlobeRef.current ? "globe" : "mercator" });
    };
    map.on("style.load", reApplyProjection);
    return () => { map.off("style.load", reApplyProjection); };
  }, []);

  // ── Cluster source + layers setup (re-added on every style.load) ──────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const setupClusters = () => {
      if (map.getSource("events-cluster")) return;
      map.addSource("events-cluster", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterMaxZoom: CLUSTER_ZOOM_THRESHOLD,
        clusterRadius: 50,
      });
      map.addLayer({
        id: "cluster-circles", type: "circle", source: "events-cluster",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ["step", ["get", "point_count"], "#448aff", 10, "#ffaa00", 50, "#ff5252"],
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 50, 30],
          "circle-opacity": 0.75,
          "circle-stroke-width": 2,
          "circle-stroke-color": ["step", ["get", "point_count"], "#448aff88", 10, "#ffaa0088", 50, "#ff525288"],
        },
      });
      map.addLayer({
        id: "cluster-count", type: "symbol", source: "events-cluster",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 11,
        },
        paint: { "text-color": "#ffffff" },
      });
      // Click cluster → zoom in
      map.on("click", "cluster-circles", async (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["cluster-circles"] });
        if (!features.length) return;
        const clusterId = features[0].properties?.cluster_id;
        const src = map.getSource("events-cluster") as maplibregl.GeoJSONSource;
        try {
          const zoom = await (src as any).getClusterExpansionZoom(clusterId);
          map.easeTo({ center: (features[0].geometry as GeoJSON.Point).coordinates as [number, number], zoom });
        } catch {}
      });
      map.on("mouseenter", "cluster-circles", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "cluster-circles", () => { map.getCanvas().style.cursor = ""; });
    };

    map.on("style.load", setupClusters);
    if (map.isStyleLoaded()) setupClusters();
    return () => { map.off("style.load", setupClusters); };
  }, []);

  // ── Update cluster source data ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("events-cluster") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const features: GeoJSON.Feature[] = events
      .filter((e) => isFinite(e.lat) && isFinite(e.lng) && !isSatelliteEvent(e.source_id))
      .map((e) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [e.lng, e.lat] },
        properties: { id: e.id, severity: e.severity, source_id: e.source_id },
      }));

    src.setData({ type: "FeatureCollection", features });
  }, [events]);

  // Satellite footprints removed — orbital track lines (sat-tracks) provide
  // trajectory visualization without the large filled visibility circles.

  // ── GeoJSON & Tile layer management ─────────────────────────────────────
  const activeGeojsonLayers = useMemo(
    () => ALL_LAYERS.filter((l) => activeLayers.has(l.id) && l.renderMode === "geojson" && l.geojsonUrl),
    [activeLayers],
  );
  const activeTileLayers = useMemo(
    () => ALL_LAYERS.filter((l) => activeLayers.has(l.id) && l.renderMode === "tiles" && l.tileUrl),
    [activeLayers],
  );

  // Track which geojson/tile sources are on the map; counter forces re-run after style change
  const addedGeojsonRef = useRef<Set<string>>(new Set());
  const addedTilesRef = useRef<Set<string>>(new Set());
  const geojsonCacheRef = useRef<Map<string, GeoJSON.FeatureCollection>>(new Map());
  const [layerEpoch, setLayerEpoch] = useState(0);

  // Helper: add a single geojson source+layer to the map
  const addGeojsonToMap = useCallback((map: maplibregl.Map, layer: typeof ALL_LAYERS[0], data: GeoJSON.FeatureCollection) => {
    try {
      if (map.getSource(`geojson-src-${layer.id}`)) return;

      map.addSource(`geojson-src-${layer.id}`, { type: "geojson", data });

      const opacity = layerOpacity[layer.id] ?? 1;

      if (layer.geojsonType === "line") {
        map.addLayer({
          id: `geojson-${layer.id}`,
          type: "line",
          source: `geojson-src-${layer.id}`,
          minzoom: layer.minZoom ?? 0,
          maxzoom: layer.maxZoom ?? 24,
          paint: {
            "line-color": layer.color,
            "line-width": layer.lineWidth ?? 1.5,
            "line-opacity": opacity * 0.8,
          },
        });
      } else if (layer.geojsonType === "fill") {
        map.addLayer({
          id: `geojson-${layer.id}`,
          type: "fill",
          source: `geojson-src-${layer.id}`,
          minzoom: layer.minZoom ?? 0,
          maxzoom: layer.maxZoom ?? 24,
          paint: {
            "fill-color": layer.color,
            "fill-opacity": (layer.fillOpacity ?? 0.2) * opacity,
          },
        });
      } else {
        map.addLayer({
          id: `geojson-${layer.id}`,
          type: "circle",
          source: `geojson-src-${layer.id}`,
          minzoom: layer.minZoom ?? 0,
          maxzoom: layer.maxZoom ?? 24,
          paint: {
            "circle-color": layer.color,
            "circle-radius": layer.circleRadius ?? 4,
            "circle-opacity": opacity * 0.8,
            "circle-stroke-width": 1,
            "circle-stroke-color": layer.color,
            "circle-stroke-opacity": opacity * 0.5,
          },
        });
      }
      addedGeojsonRef.current.add(layer.id);
    } catch (err) {
      console.warn(`[map] Failed to add geojson layer ${layer.id}:`, err);
    }
  }, [layerOpacity]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const wantedGeo = new Set(activeGeojsonLayers.map((l) => l.id));
    const wantedTile = new Set(activeTileLayers.map((l) => l.id));

    // Remove deactivated GeoJSON layers
    addedGeojsonRef.current.forEach((id) => {
      if (!wantedGeo.has(id)) {
        try {
          if (map.getLayer(`geojson-${id}`)) map.removeLayer(`geojson-${id}`);
          if (map.getSource(`geojson-src-${id}`)) map.removeSource(`geojson-src-${id}`);
        } catch {}
        addedGeojsonRef.current.delete(id);
      }
    });

    // Remove deactivated tile layers
    addedTilesRef.current.forEach((id) => {
      if (!wantedTile.has(id)) {
        try {
          if (map.getLayer(`tile-${id}`)) map.removeLayer(`tile-${id}`);
          if (map.getSource(`tile-src-${id}`)) map.removeSource(`tile-src-${id}`);
        } catch {}
        addedTilesRef.current.delete(id);
      }
    });

    // Add new GeoJSON layers
    activeGeojsonLayers.forEach((layer) => {
      if (addedGeojsonRef.current.has(layer.id)) return;

      const cached = geojsonCacheRef.current.get(layer.geojsonUrl!);
      if (cached) {
        addGeojsonToMap(map, layer, cached);
      } else {
        // Fetch async — don't mark as added until data is on the map
        fetch(layer.geojsonUrl!)
          .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          })
          .then((data) => {
            geojsonCacheRef.current.set(layer.geojsonUrl!, data);
            // Re-check that map is still valid and style loaded before adding
            if (mapRef.current?.isStyleLoaded() && activeLayers.has(layer.id)) {
              addGeojsonToMap(mapRef.current, layer, data);
            }
          })
          .catch((err) => console.warn(`[map] Failed to fetch ${layer.geojsonUrl}:`, err));
      }
    });

    // Add new tile layers
    // Resolve {YYYY-MM-DD} placeholder: use gibsDate from replay store, or yesterday's date
    const fallbackDate = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    const dateStr = gibsDate ?? fallbackDate;

    activeTileLayers.forEach((layer) => {
      if (addedTilesRef.current.has(layer.id)) return;

      try {
        if (map.getSource(`tile-src-${layer.id}`)) return;

        const resolvedUrl = layer.tileUrl!.replace("{YYYY-MM-DD}", dateStr);

        map.addSource(`tile-src-${layer.id}`, {
          type: "raster",
          tiles: [resolvedUrl],
          tileSize: 256,
        });

        const opacity = layerOpacity[layer.id] ?? 0.7;
        map.addLayer({
          id: `tile-${layer.id}`,
          type: "raster",
          source: `tile-src-${layer.id}`,
          minzoom: layer.minZoom ?? 0,
          maxzoom: layer.maxZoom ?? 24,
          paint: { "raster-opacity": opacity },
        });
        addedTilesRef.current.add(layer.id);
      } catch (err) {
        console.warn(`[map] Failed to add tile layer ${layer.id}:`, err);
      }
    });
    // Update existing tile source URLs when gibsDate changes (GIBS time scrubbing)
    addedTilesRef.current.forEach((id) => {
      const layer = ALL_LAYERS.find((l) => l.id === id);
      if (!layer?.tileUrl?.includes("{YYYY-MM-DD}")) return;
      const src = map.getSource(`tile-src-${id}`) as maplibregl.RasterTileSource | undefined;
      if (!src) return;
      try {
        const newUrl = layer.tileUrl!.replace("{YYYY-MM-DD}", dateStr);
        (src as any).setTiles([newUrl]);
      } catch {}
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGeojsonLayers, activeTileLayers, layerOpacity, layerEpoch, addGeojsonToMap, gibsDate]);

  // Re-add GeoJSON/tile layers after style change — bump epoch to trigger effect re-run
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const reAddLayers = () => {
      addedGeojsonRef.current.clear();
      addedTilesRef.current.clear();
      setLayerEpoch((e) => e + 1);
    };

    map.on("style.load", reAddLayers);
    return () => { map.off("style.load", reAddLayers); };
  }, []);

  // ── Tile-style switching ─────────────────────────────────────────────────
  const appliedStyleRef = useRef("dark"); // matches constructor initial style
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (appliedStyleRef.current === styleKey) return;
    appliedStyleRef.current = styleKey;
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

  // ── Fly to event on double-click (single click only highlights + opens drawer) ──
  const selectedEvent = useEventStore((s) => s.selectedEvent);
  const flyToTarget = useEventStore((s) => s.flyToTarget);
  const consumeFlyTo = useEventStore((s) => s.consumeFlyTo);

  const flyToEvent = useCallback((event: GeoEvent) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [event.lng, event.lat],
      zoom: Math.max(map.getZoom(), 8),
      duration: 800,
    });
  }, []);

  // Consume flyToTarget from store (set by "Show on Map" button, search, etc.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToTarget) return;
    map.flyTo({
      center: [flyToTarget.lng, flyToTarget.lat],
      zoom: flyToTarget.zoom ?? Math.max(map.getZoom(), 6),
      duration: 800,
    });
    consumeFlyTo();
  }, [flyToTarget, consumeFlyTo]);

  // ── Right-click context menu ──────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; lngLat: { lng: number; lat: number } } | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleContextMenu = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      setContextMenu({ x: e.point.x, y: e.point.y, lngLat: { lng: e.lngLat.lng, lat: e.lngLat.lat } });
    };
    const handleClick = () => setContextMenu(null);

    map.on("contextmenu", handleContextMenu);
    map.on("click", handleClick);
    return () => {
      map.off("contextmenu", handleContextMenu);
      map.off("click", handleClick);
    };
  }, []);

  const handleCopyCoords = useCallback(() => {
    if (!contextMenu) return;
    navigator.clipboard.writeText(`${contextMenu.lngLat.lat.toFixed(5)}, ${contextMenu.lngLat.lng.toFixed(5)}`);
    setContextMenu(null);
  }, [contextMenu]);

  const handleNearbyEvents = useCallback(() => {
    if (!contextMenu) return;
    const { lat, lng } = contextMenu.lngLat;
    const nearby = events
      .filter((e) => Math.abs(e.lat - lat) < 2 && Math.abs(e.lng - lng) < 2)
      .sort((a, b) => {
        const distA = Math.hypot(a.lat - lat, a.lng - lng);
        const distB = Math.hypot(b.lat - lat, b.lng - lng);
        return distA - distB;
      })
      .slice(0, 5);

    if (nearby.length > 0) {
      setSelectedEvent(nearby[0]);
    }
    setContextMenu(null);
  }, [contextMenu, events, setSelectedEvent]);

  // ── Plan Mode: annotation GeoJSON layers ─────────────────────────────────
  const planAnnotations = usePlanStore((s) => s.annotations);
  const drawingMode = usePlanStore((s) => s.drawingMode);

  // Setup annotation source + layers on every style load
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const setup = () => {
      if (map.getSource("plan-annotations")) return;
      map.addSource("plan-annotations", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "ann-fill", type: "fill", source: "plan-annotations",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.15 },
      });
      map.addLayer({
        id: "ann-outline", type: "line", source: "plan-annotations",
        filter: ["any", ["==", ["geometry-type"], "LineString"], ["==", ["geometry-type"], "Polygon"]],
        paint: { "line-color": ["get", "color"], "line-width": 2, "line-dasharray": [2, 1] },
      });
      map.addLayer({
        id: "ann-point", type: "circle", source: "plan-annotations",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 8, "circle-color": ["get", "color"], "circle-opacity": 0.5,
          "circle-stroke-width": 2.5, "circle-stroke-color": ["get", "color"],
        },
      });
      map.addLayer({
        id: "ann-label", type: "symbol", source: "plan-annotations",
        layout: { "text-field": ["get", "label"], "text-size": 11, "text-offset": [0, 1.5], "text-anchor": "top" },
        paint: { "text-color": "#ffffff", "text-halo-color": "#000000", "text-halo-width": 1 },
      });
    };

    map.on("style.load", setup);
    if (map.isStyleLoaded()) setup();
    return () => { map.off("style.load", setup); };
  }, []);

  // Update annotation source data when annotations change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("plan-annotations") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const features = planAnnotations
      .filter((a) => a.geom_json && a.geom_json.type)
      .map((a) => ({
        type: "Feature" as const,
        geometry: a.geom_json as unknown as GeoJSON.Geometry,
        properties: { id: a.id, color: a.color, label: a.label || "", annType: a.annotation_type },
      }));

    src.setData({ type: "FeatureCollection", features: features as GeoJSON.Feature[] });
  }, [planAnnotations]);

  // Drawing mode: crosshair cursor + click-to-place
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !drawingMode) return;

    map.getCanvasContainer().style.cursor = "crosshair";

    const handleDrawClick = async (e: maplibregl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat;
      let geom_json: Record<string, unknown>;

      if (drawingMode.type === "range_circle") {
        const km = 50;
        const coords = Array.from({ length: 65 }, (_, i) => {
          const angle = (i % 64) * ((2 * Math.PI) / 64);
          return [
            lng + ((km / 111.32) * Math.cos(angle)) / Math.cos((lat * Math.PI) / 180),
            lat + (km / 111.32) * Math.sin(angle),
          ];
        });
        geom_json = { type: "Polygon", coordinates: [coords] };
      } else {
        geom_json = { type: "Point", coordinates: [lng, lat] };
      }

      try {
        const r = await fetch(`/api/v1/plan-rooms/${drawingMode.roomId}/annotations`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` },
          body: JSON.stringify({
            annotation_type: drawingMode.type,
            label: drawingMode.label,
            notes: drawingMode.notes,
            color: drawingMode.color,
            geom_json,
          }),
        });
        if (r.ok) usePlanStore.getState().addAnnotation(await r.json());
      } catch { /* network error */ }

      usePlanStore.getState().setDrawingMode(null);
    };

    map.on("click", handleDrawClick);
    return () => {
      map.off("click", handleDrawClick);
      map.getCanvasContainer().style.cursor = "";
    };
  }, [drawingMode]);

  // ── Measure tool ─────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !measuring) return;
    map.getCanvasContainer().style.cursor = "crosshair";
    const handleClick = (e: maplibregl.MapMouseEvent) => {
      setMeasurePts((prev) => {
        if (prev.length >= 2) return [[e.lngLat.lng, e.lngLat.lat]];
        return [...prev, [e.lngLat.lng, e.lngLat.lat]];
      });
    };
    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
      map.getCanvasContainer().style.cursor = "";
    };
  }, [measuring]);

  const measureDistance = useMemo(() => {
    if (measurePts.length !== 2) return null;
    const [lng1, lat1] = measurePts[0];
    const [lng2, lat2] = measurePts[1];
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return { km, mi: km * 0.621371 };
  }, [measurePts]);

  // ── Marker element factory ───────────────────────────────────────────────
  const createMarkerEl = useCallback((event: GeoEvent): HTMLElement => {
    const isSat = isSatelliteEvent(event.source_id);

    if (isSat) {
      // ── Satellite-specific diamond marker ──────────────────────────────
      const satColor = SATELLITE_COLORS[event.source_id] ?? "#00E5FF";
      const el = document.createElement("div");
      el.className = "m-marker";
      el.style.cssText = `width:12px;height:12px;cursor:pointer;`;
      el.title = event.title;
      el.dataset.satSourceId = event.source_id;

      const diamond = document.createElement("div");
      diamond.style.cssText = `
        width:100%;height:100%;
        transform:rotate(45deg);
        background:${satColor};
        border:1px solid ${satColor};
        box-shadow:0 0 6px ${satColor}44;
        transition:transform 120ms,box-shadow 120ms;
        box-sizing:border-box;
      `;
      el.appendChild(diamond);

      el.addEventListener("mouseenter", () => {
        diamond.style.transform = "rotate(45deg) scale(1.6)";
        diamond.style.boxShadow = `0 0 12px ${satColor}88`;
        el.style.zIndex = "10";
      });
      el.addEventListener("mouseleave", () => {
        diamond.style.transform = "rotate(45deg)";
        diamond.style.boxShadow = `0 0 6px ${satColor}44`;
        el.style.zIndex = "";
      });
      el.addEventListener("mousedown", (e) => e.stopPropagation());
      el.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const rs = useReplayStore.getState();
        if (rs.selectionMode && rs.mode === "replay") {
          rs.toggleEventSelection(event.id);
          if (rs.selectedEventIds.has(event.id)) {
            el.classList.remove("m-marker-selected");
          } else {
            el.classList.add("m-marker-selected");
          }
          return;
        }
        setSelectedEvent(event);
      });
      el.addEventListener("dblclick", (e) => { e.stopPropagation(); flyToEvent(event); });
      return el;
    }

    // ── Standard event marker ────────────────────────────────────────────
    const size       = SEVERITY_SIZE[event.severity] ?? 18;
    const color      = SOURCE_COLOR.get(event.source_id) ?? "#448aff";
    const icon       = SOURCE_ICON.get(event.source_id) ?? "";
    const isCritical = event.severity === "critical";
    const isHigh     = event.severity === "high";

    const anim = isCritical
      ? "m-pulse-fast 1.4s ease-out infinite"
      : isHigh ? "m-pulse 2.4s ease-out infinite" : "none";

    const el = document.createElement("div");
    el.className = "m-marker";
    el.style.cssText = `width:${size}px;height:${size}px;cursor:pointer;`;
    el.title = `[${event.severity.toUpperCase()}] ${event.title}`;

    const dot = document.createElement("div");
    dot.style.cssText = `
      --pc: ${color}99;
      width: 100%; height: 100%;
      border-radius: 50%;
      background: ${color}28;
      border: ${isCritical ? 2.5 : 1.5}px solid ${color};
      display: flex; align-items: center; justify-content: center;
      font-size: ${Math.round(size * 0.52)}px;
      transition: transform 120ms, box-shadow 120ms;
      animation: ${anim};
      box-sizing: border-box;
    `;
    dot.textContent = icon;
    el.appendChild(dot);

    el.addEventListener("mouseenter", () => {
      dot.style.transform = "scale(1.45)";
      dot.style.boxShadow = `0 0 0 4px ${color}55`;
      dot.style.animation = "none";
      el.style.zIndex = "10";
    });
    el.addEventListener("mouseleave", () => {
      dot.style.transform = "";
      dot.style.boxShadow = "";
      dot.style.animation = anim;
      el.style.zIndex = "";
    });
    el.addEventListener("mousedown",  (e) => e.stopPropagation());
    el.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
    el.addEventListener("click",      (e) => {
      e.stopPropagation();
      const rs = useReplayStore.getState();
      if (rs.selectionMode && rs.mode === "replay") {
        rs.toggleEventSelection(event.id);
        // Toggle selection ring
        if (rs.selectedEventIds.has(event.id)) {
          el.classList.remove("m-marker-selected");
        } else {
          el.classList.add("m-marker-selected");
        }
        return;
      }
      setSelectedEvent(event);
    });
    el.addEventListener("dblclick",   (e) => { e.stopPropagation(); flyToEvent(event); });

    return el;
  }, [setSelectedEvent, flyToEvent]);

  // ── Marker sync: add new, update live positions, remove stale ───────────────
  const updateEntityPosition = usePlanTrackingStore((s) => s.updateEntityPosition);
  const isTracked = usePlanTrackingStore((s) => s.isTracked);
  const showDomMarkers = currentZoom >= CLUSTER_ZOOM_THRESHOLD;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const existing = markersRef.current;

    // Below cluster threshold: hide all DOM markers, let cluster layers handle display
    if (!showDomMarkers) {
      existing.forEach((marker) => marker.getElement().style.display = "none");
      events.forEach((event) => {
        if (!isFinite(event.lat) || !isFinite(event.lng)) return;
        const key = getEntityKey(event);
        if (isTracked(key)) updateEntityPosition(key, event);
      });
      return;
    }

    // Above threshold: show DOM markers
    const incomingKeys = new Set<string>();
    const newEvents: Array<{ key: string; event: GeoEvent }> = [];

    // Single pass: classify events into existing (update) vs new (create)
    for (const event of events) {
      if (!isFinite(event.lat) || !isFinite(event.lng)) continue;
      const key = getEntityKey(event);
      incomingKeys.add(key);

      const marker = existing.get(key);
      if (marker) {
        marker.setLngLat([event.lng, event.lat]);
        marker.getElement().style.display = "";
        if (isTracked(key)) updateEntityPosition(key, event);
      } else {
        newEvents.push({ key, event });
      }
    }

    // Remove stale markers
    existing.forEach((marker, key) => {
      if (!incomingKeys.has(key)) { marker.remove(); existing.delete(key); }
    });

    // Cancel any pending chunked marker creation from a previous render
    if (chunkRafRef.current) {
      cancelAnimationFrame(chunkRafRef.current);
      chunkRafRef.current = null;
    }

    // Batch-create new markers — stagger across frames if many
    if (newEvents.length <= 50) {
      // Small batch: create all at once
      for (const { key, event } of newEvents) {
        const marker = new maplibregl.Marker({ element: createMarkerEl(event) })
          .setLngLat([event.lng, event.lat])
          .addTo(map);
        existing.set(key, marker);
      }
    } else {
      // Large batch: create in chunks across frames to avoid long frames
      const CHUNK = 40;
      let i = 0;
      const createChunk = () => {
        chunkRafRef.current = null;
        const end = Math.min(i + CHUNK, newEvents.length);
        for (; i < end; i++) {
          const { key, event } = newEvents[i];
          const marker = new maplibregl.Marker({ element: createMarkerEl(event) })
            .setLngLat([event.lng, event.lat])
            .addTo(map);
          existing.set(key, marker);
        }
        if (i < newEvents.length) {
          chunkRafRef.current = requestAnimationFrame(createChunk);
        }
      };
      createChunk();
    }

    // Apply per-source opacity
    existing.forEach((marker, key) => {
      const sid = key.split("::")[0];
      const op = sourceOpacity.get(sid) ?? 1;
      marker.getElement().style.opacity = String(op);
    });
  }, [events, createMarkerEl, isTracked, updateEntityPosition, showDomMarkers, sourceOpacity]);

  // ── Highlight selected marker ──────────────────────────────────────────
  const prevSelectedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const existing = markersRef.current;

    // Un-highlight previous
    if (prevSelectedKeyRef.current) {
      const prev = existing.get(prevSelectedKeyRef.current);
      if (prev) {
        const el = prev.getElement();
        el.style.zIndex = "";
        el.style.filter = "";
        const dot = el.firstElementChild as HTMLElement | null;
        if (dot) {
          dot.style.transform = "";
          dot.style.boxShadow = "";
          dot.style.outline = "";
        }
      }
    }

    // Highlight current
    if (selectedEvent) {
      const key = getEntityKey(selectedEvent);
      const marker = existing.get(key);
      if (marker) {
        const el = marker.getElement();
        const color = SOURCE_COLOR.get(selectedEvent.source_id) ?? SATELLITE_COLORS[selectedEvent.source_id] ?? "#448aff";
        el.style.zIndex = "20";
        el.style.filter = `drop-shadow(0 0 6px ${color})`;
        const dot = el.firstElementChild as HTMLElement | null;
        if (dot) {
          dot.style.transform = "scale(1.6)";
          dot.style.boxShadow = `0 0 0 4px ${color}66, 0 0 16px ${color}44`;
          dot.style.outline = `2px solid ${color}`;
          dot.style.outlineOffset = "2px";
        }
      }
      prevSelectedKeyRef.current = key;
    } else {
      prevSelectedKeyRef.current = null;
    }
  }, [selectedEvent]);

  // ── Globe backface culling: hide DOM markers on the far side of the globe ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isGlobe) {
      // Restore all markers when leaving globe mode
      markersRef.current.forEach((marker) => {
        const el = marker.getElement();
        el.style.display = "";
        el.style.pointerEvents = "";
      });
      return;
    }

    const toRad = Math.PI / 180;

    const cullBackface = () => {
      if (!showDomMarkers) return; // cluster mode — markers already hidden
      const center = map.getCenter();
      const φ1 = center.lat * toRad;
      const cosφ1 = Math.cos(φ1);
      const sinφ1 = Math.sin(φ1);
      const centerLng = center.lng;

      markersRef.current.forEach((marker) => {
        const pos = marker.getLngLat();
        const φ2 = pos.lat * toRad;
        const Δλ = (pos.lng - centerLng) * toRad;
        const cosAngle =
          sinφ1 * Math.sin(φ2) + cosφ1 * Math.cos(φ2) * Math.cos(Δλ);
        const visible = cosAngle > 0.08; // ~85 degrees from center
        const el = marker.getElement();
        el.style.display = visible ? "" : "none";
        el.style.pointerEvents = visible ? "" : "none";
      });
    };

    // Run immediately and on every camera move (fires continuously during pan/rotate)
    cullBackface();
    map.on("move", cullBackface);

    return () => {
      map.off("move", cullBackface);
      // Restore visibility on cleanup
      markersRef.current.forEach((marker) => {
        const el = marker.getElement();
        el.style.display = "";
        el.style.pointerEvents = "";
      });
    };
  }, [isGlobe, showDomMarkers]);

  // ── SGP4 satellite position updates — 1 Hz via setInterval ────
  // Build a lookup map of entity key → event for O(1) access
  const eventsByKey = useMemo(() => {
    const m = new Map<string, GeoEvent>();
    for (const e of events) m.set(getEntityKey(e), e);
    return m;
  }, [events]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateSatPositions = () => {
      const propTime = gibsDate ? new Date(`${gibsDate}T12:00:00Z`) : new Date();

      markersRef.current.forEach((marker, key) => {
        const sid = key.split("::")[0];
        if (!isSatelliteEvent(sid)) return;

        const event = eventsByKey.get(key);
        if (!event?.metadata) return;

        const tle1 = event.metadata.tle_line1 as string;
        const tle2 = event.metadata.tle_line2 as string;
        if (!tle1 || !tle2) return;

        const pos = propagateSatellite(tle1, tle2, propTime);
        if (pos) marker.setLngLat([pos.lng, pos.lat]);
      });
    };

    updateSatPositions();
    const iv = setInterval(updateSatPositions, 1000);
    return () => clearInterval(iv);
  }, [eventsByKey, gibsDate]);

  // ── Orbital track lines — faint dotted ground tracks for satellites ─────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const setupTracks = () => {
      if (map.getSource("sat-tracks")) return;
      map.addSource("sat-tracks", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      // Regular satellite tracks
      map.addLayer({
        id: "sat-track-lines",
        type: "line",
        source: "sat-tracks",
        filter: ["==", ["get", "isISS"], false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 1.5,
          "line-opacity": 0.55,
          "line-dasharray": [2, 4],
        },
      });
      // ISS track (thicker, brighter)
      map.addLayer({
        id: "sat-track-lines-iss",
        type: "line",
        source: "sat-tracks",
        filter: ["==", ["get", "isISS"], true],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2.5,
          "line-opacity": 0.75,
        },
      });
    };

    map.on("style.load", setupTracks);
    if (map.isStyleLoaded()) setupTracks();
    return () => { map.off("style.load", setupTracks); };
  }, []);

  // Update track line data — recompute every 30 seconds
  const trackUpdateRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateTracks = () => {
      const src = map.getSource("sat-tracks") as maplibregl.GeoJSONSource | undefined;
      if (!src) return;

      const features: GeoJSON.Feature[] = [];

      let trackCount = 0;
      const MAX_TRACKS = 200;

      // Map source_id → layer_id for track gating
      const sourceToLayer: Record<string, string> = {
        nasa_iss: "iss", celestrak_tle: "celestrak_sats",
        starlink_tracker: "starlink_constellation", gps_constellation: "gps_constellation",
        spacetrack_satellites: "spacetrack_catalog",
      };
      const currentShowTracks = useLayoutStore.getState().showTracks;

      // Deduplicate by NORAD catalog number to avoid computing the same orbit twice
      const seenOrbits = new Set<string>();

      for (const e of events) {
        if (!isSatelliteEvent(e.source_id)) continue;
        if (trackCount >= MAX_TRACKS) break;

        // Gate: skip tracks for layers where showTracks is false
        const layerId = sourceToLayer[e.source_id];
        if (layerId && currentShowTracks[layerId] === false) continue;

        const tle1 = e.metadata?.tle_line1 as string;
        const tle2 = e.metadata?.tle_line2 as string;
        if (!tle1 || !tle2) continue;

        // Dedup: skip if we already computed a track for this TLE
        const orbitKey = tle2.substring(0, 8).trim(); // NORAD number from TLE line 2
        if (seenOrbits.has(orbitKey)) continue;
        seenOrbits.add(orbitKey);

        const color = SATELLITE_COLORS[e.source_id] ?? "#00E5FF";
        const isISS = e.source_id === "nasa_iss";
        const refTime = gibsDate ? new Date(`${gibsDate}T12:00:00Z`) : undefined;
        const segments = computeGroundTrack(tle1, tle2, 45, 45, 60, refTime);

        for (const segment of segments) {
          if (segment.length < 2) continue;
          features.push({
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: segment.map(([lat, lng]) => [lng, lat]),
            },
            properties: {
              color,
              isISS,
              source_id: e.source_id,
            },
          });
          trackCount++;
        }
      }

      src.setData({ type: "FeatureCollection", features });
    };

    // Initial update + re-run after style changes (source recreated empty)
    const scheduleUpdate = () => requestAnimationFrame(updateTracks);
    updateTracks();
    map.on("style.load", scheduleUpdate);
    // Re-run every 30 seconds
    trackUpdateRef.current = setInterval(updateTracks, 30_000);
    return () => {
      if (trackUpdateRef.current) clearInterval(trackUpdateRef.current);
      map.off("style.load", scheduleUpdate);
    };
  }, [events, gibsDate]);

  // ── Flight track layers (aviation + maritime) ──────────────────────────
  // Fetches real route data from OpenSky/adsb.lol when an aircraft is selected,
  // and shows heading-based indicators for all visible aviation events.
  const flightTrackCacheRef = useRef<Map<string, [number, number][]>>(new Map());

  const AVIATION_SOURCES = useMemo(() => new Set([
    "opensky", "adsb_lol", "emergency_squawks", "vip_aircraft", "bomber_isr", "flightaware",
  ]), []);

  const TRACK_COLORS: Record<string, string> = useMemo(() => ({
    opensky: "#29b6f6", adsb_lol: "#ff5252", emergency_squawks: "#ff1744",
    vip_aircraft: "#ffd740", bomber_isr: "#ff6e40", flightaware: "#1a73e8",
    aishub: "#448aff", naval_mmsi: "#536dfe",
  }), []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const setup = () => {
      // Heading indicators for all visible aircraft — continuous trail lines
      if (!map.getSource("flight-heading-lines")) {
        map.addSource("flight-heading-lines", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "flight-heading-lines",
          type: "line",
          source: "flight-heading-lines",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": 2,
            "line-opacity": ["get", "opacity"],
          },
        });
      }
      // Selected aircraft's full route track
      if (!map.getSource("flight-track-highlight")) {
        map.addSource("flight-track-highlight", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "flight-track-highlight-glow",
          type: "line",
          source: "flight-track-highlight",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": 6,
            "line-opacity": 0.2,
          },
        });
        map.addLayer({
          id: "flight-track-highlight-line",
          type: "line",
          source: "flight-track-highlight",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": 2.5,
            "line-opacity": 0.85,
          },
        });
      }
      // Entity trail lines (breadcrumb trails showing past positions)
      if (!map.getSource("entity-trail-lines")) {
        map.addSource("entity-trail-lines", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "entity-trail-lines",
          type: "line",
          source: "entity-trail-lines",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": 2,
            "line-opacity": 0.4,
          },
        });
        map.addSource("entity-trail-dots", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "entity-trail-dots",
          type: "circle",
          source: "entity-trail-dots",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 2.5, 8, 4, 14, 6],
            "circle-color": ["get", "color"],
            "circle-opacity": ["get", "opacity"],
            "circle-stroke-width": 1,
            "circle-stroke-color": "rgba(255,255,255,0.3)",
            "circle-stroke-opacity": ["get", "opacity"],
          },
        });
      }
      // Destination projection line (dashed great-circle arc)
      if (!map.getSource("flight-destination-line")) {
        map.addSource("flight-destination-line", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "flight-destination-line",
          type: "line",
          source: "flight-destination-line",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": 2,
            "line-opacity": 0.5,
            "line-dasharray": [4, 4],
          },
        });
      }
    };

    map.on("style.load", setup);
    if (map.isStyleLoaded()) setup();
    return () => { map.off("style.load", setup); };
  }, []);

  // Compute a point offset from [lat, lng] along a bearing by `distKm` kilometres
  const offsetPoint = useCallback(
    (lat: number, lng: number, bearingDeg: number, distKm: number): [number, number] => {
      const R = 6371; // Earth radius km
      const d = distKm / R;
      const brng = (bearingDeg * Math.PI) / 180;
      const lat1 = (lat * Math.PI) / 180;
      const lng1 = (lng * Math.PI) / 180;
      const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
      );
      const lng2 =
        lng1 +
        Math.atan2(
          Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
          Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
        );
      return [(lat2 * 180) / Math.PI, (lng2 * 180) / Math.PI];
    },
    []
  );

  // Pre-filter aviation events to avoid iterating all events in the hot path
  const aviationEvents = useMemo(
    () => events.filter((e) => AVIATION_SOURCES.has(e.source_id) && isFinite(e.lat) && isFinite(e.lng)),
    [events, AVIATION_SOURCES],
  );

  // Update heading indicators for visible aviation events
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateHeadings = () => {
      const src = map.getSource("flight-heading-lines") as maplibregl.GeoJSONSource | undefined;
      if (!src) return;

      const features: GeoJSON.Feature[] = [];

      for (const e of aviationEvents) {
        const meta = e.metadata as Record<string, unknown>;
        const heading = Number(meta?.true_track ?? meta?.heading ?? meta?.track);
        const velocity = Number(meta?.velocity ?? meta?.speed_kt ?? 0);
        if (!isFinite(heading)) continue;

        const speedKmh = velocity > 500 ? velocity * 1.852 : velocity * 3.6;
        const trailKm = Math.max(5, Math.min(80, speedKmh * 0.05));
        const backBearing = (heading + 180) % 360;
        const color = TRACK_COLORS[e.source_id] ?? "#448aff";

        // Per-segment lines with decreasing opacity to simulate fading trail
        const steps = 6;
        let prevCoord: [number, number] = [e.lng, e.lat];
        for (let s = 1; s <= steps; s++) {
          const dist = (trailKm * s) / steps;
          const [pLat, pLng] = offsetPoint(e.lat, e.lng, backBearing, dist);
          const nextCoord: [number, number] = [pLng, pLat];
          features.push({
            type: "Feature",
            geometry: { type: "LineString", coordinates: [prevCoord, nextCoord] },
            properties: { color, opacity: 0.6 * (1 - (s - 1) / steps) },
          });
          prevCoord = nextCoord;
        }
      }

      src.setData({ type: "FeatureCollection", features });
    };

    updateHeadings();
    const iv = setInterval(updateHeadings, 5_000); // 5s instead of 3s
    const onStyle = () => setTimeout(updateHeadings, 100); // debounce style.load
    map.on("style.load", onStyle);
    return () => { clearInterval(iv); map.off("style.load", onStyle); };
  }, [aviationEvents, TRACK_COLORS, offsetPoint]);

  // Render entity breadcrumb trails from trailHistory
  // Only render trails for entities whose source_id is in active layers
  // and whose severity passes the current filter
  const trailHistory = useEventStore((s) => s.trailHistory);
  const severityFilter = useEventStore((s) => s.filters.severities);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateTrails = () => {
      const lineSrc = map.getSource("entity-trail-lines") as maplibregl.GeoJSONSource | undefined;
      const dotSrc = map.getSource("entity-trail-dots") as maplibregl.GeoJSONSource | undefined;
      if (!lineSrc || !dotSrc) return;

      const lineFeatures: GeoJSON.Feature[] = [];
      const dotFeatures: GeoJSON.Feature[] = [];
      const now = Date.now();

      trailHistory.forEach((trail, key) => {
        if (trail.length < 2) return;
        // Extract source_id from key (e.g. "adsb_lol:ae1234" -> "adsb_lol")
        const sourceId = key.split(":")[0];

        // Skip trails for sources not in active layers
        if (!activeSourceIds.has(sourceId)) return;

        // Skip trails whose latest event doesn't pass the severity filter
        const latestEvent = trail[trail.length - 1]?.event;
        if (severityFilter.size > 0 && latestEvent && !severityFilter.has(latestEvent.severity)) return;

        const color = TRACK_COLORS[sourceId] ?? "#448aff";

        const coords: [number, number][] = trail.map((p) => [p.lng, p.lat]);

        lineFeatures.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: { color },
        });

        // Dot at each historical point (not the latest — that has the marker)
        // Each dot carries its entity key + index so clicks can retrieve the snapshot
        for (let i = 0; i < trail.length - 1; i++) {
          const age = (now - trail[i].time) / 1000; // seconds
          const opacity = Math.max(0.2, 1 - age / 3600); // fade over 1 hour
          dotFeatures.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [trail[i].lng, trail[i].lat] },
            properties: { color, opacity, entityKey: key, pointIndex: i },
          });
        }
      });

      lineSrc.setData({ type: "FeatureCollection", features: lineFeatures });
      dotSrc.setData({ type: "FeatureCollection", features: dotFeatures });
    };

    updateTrails();
    const iv = setInterval(updateTrails, 10_000);
    const onStyle = () => setTimeout(updateTrails, 200);
    map.on("style.load", onStyle);
    return () => { clearInterval(iv); map.off("style.load", onStyle); };
  }, [trailHistory, TRACK_COLORS, activeSourceIds, severityFilter]);

  // Click handler for trail dots — opens ContextDrawer with that call-in's snapshot
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const feat = e.features?.[0];
      if (!feat?.properties) return;
      const { entityKey, pointIndex } = feat.properties as { entityKey: string; pointIndex: number };
      if (!entityKey) return;

      const trails = useEventStore.getState().trailHistory;
      const trail = trails.get(entityKey);
      if (!trail || pointIndex >= trail.length) return;

      const snapshot = trail[pointIndex].event;
      if (snapshot) {
        useEventStore.getState().setSelectedEvent(snapshot);
      }
    };

    const onEnter = () => { map.getCanvas().style.cursor = "pointer"; };
    const onLeave = () => { map.getCanvas().style.cursor = ""; };

    const setup = () => {
      if (map.getLayer("entity-trail-dots")) {
        map.on("click", "entity-trail-dots", onClick);
        map.on("mouseenter", "entity-trail-dots", onEnter);
        map.on("mouseleave", "entity-trail-dots", onLeave);
      }
    };

    map.on("style.load", setup);
    if (map.isStyleLoaded()) setup();

    return () => {
      map.off("click", "entity-trail-dots", onClick);
      map.off("mouseenter", "entity-trail-dots", onEnter);
      map.off("mouseleave", "entity-trail-dots", onLeave);
      map.off("style.load", setup);
    };
  }, []);

  // Fetch and display full route track when an aircraft is selected
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;

    const renderTrack = (coords: [number, number][], color: string) => {
      const src = map.getSource("flight-track-highlight") as maplibregl.GeoJSONSource | undefined;
      if (!src || cancelled) return;

      if (coords.length < 2) {
        src.setData({ type: "FeatureCollection", features: [] });
        return;
      }

      // Split at antimeridian crossings
      const segments: [number, number][][] = [];
      let seg: [number, number][] = [coords[0]];
      for (let i = 1; i < coords.length; i++) {
        if (Math.abs(coords[i][0] - coords[i - 1][0]) > 180) {
          segments.push(seg);
          seg = [];
        }
        seg.push(coords[i]);
      }
      if (seg.length > 0) segments.push(seg);

      const features: GeoJSON.Feature[] = segments
        .filter((s) => s.length >= 2)
        .map((s) => ({
          type: "Feature" as const,
          geometry: { type: "LineString" as const, coordinates: s },
          properties: { color },
        }));

      src.setData({ type: "FeatureCollection", features });
    };

    const clearTrack = () => {
      const src = map.getSource("flight-track-highlight") as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData({ type: "FeatureCollection", features: [] });
    };

    // Generate a synthetic track from heading + speed when no API data available
    const syntheticTrack = (event: GeoEvent): [number, number][] => {
      const meta = event.metadata as Record<string, unknown>;
      const heading = Number(meta?.true_track ?? meta?.heading ?? meta?.track);
      const velocity = Number(meta?.velocity ?? meta?.speed_kt ?? 0);
      if (!isFinite(heading) || !isFinite(event.lat) || !isFinite(event.lng)) return [];

      const speedKmh = velocity > 500 ? velocity * 1.852 : velocity * 3.6;
      const trailKm = Math.max(20, Math.min(200, speedKmh * 0.15)); // ~9 min of travel
      const backBearing = (heading + 180) % 360;

      const coords: [number, number][] = [[event.lng, event.lat]];
      const steps = 20;
      for (let s = 1; s <= steps; s++) {
        const dist = (trailKm * s) / steps;
        const [pLat, pLng] = offsetPoint(event.lat, event.lng, backBearing, dist);
        coords.push([pLng, pLat]);
      }
      return coords;
    };

    // Compute a great-circle arc as an array of [lng, lat] coordinates
    const greatCircleArc = (
      lng1: number, lat1: number, lng2: number, lat2: number, numPoints = 64
    ): [number, number][] => {
      const toRad = Math.PI / 180;
      const toDeg = 180 / Math.PI;
      const φ1 = lat1 * toRad, λ1 = lng1 * toRad;
      const φ2 = lat2 * toRad, λ2 = lng2 * toRad;
      const d = Math.acos(
        Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1)
      );
      if (d < 1e-10) return [[lng1, lat1], [lng2, lat2]];

      const pts: [number, number][] = [];
      for (let i = 0; i <= numPoints; i++) {
        const f = i / numPoints;
        const a = Math.sin((1 - f) * d) / Math.sin(d);
        const b = Math.sin(f * d) / Math.sin(d);
        const x = a * Math.cos(φ1) * Math.cos(λ1) + b * Math.cos(φ2) * Math.cos(λ2);
        const y = a * Math.cos(φ1) * Math.sin(λ1) + b * Math.cos(φ2) * Math.sin(λ2);
        const z = a * Math.sin(φ1) + b * Math.sin(φ2);
        pts.push([Math.atan2(y, x) * toDeg, Math.atan2(z, Math.sqrt(x * x + y * y)) * toDeg]);
      }
      return pts;
    };

    const renderDestLine = (coords: [number, number][], color: string) => {
      const src = map.getSource("flight-destination-line") as maplibregl.GeoJSONSource | undefined;
      if (!src || cancelled) return;
      if (coords.length < 2) {
        src.setData({ type: "FeatureCollection", features: [] });
        return;
      }
      src.setData({
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: { color },
        }],
      });
    };

    const clearDestLine = () => {
      const src = map.getSource("flight-destination-line") as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData({ type: "FeatureCollection", features: [] });
    };

    const fetchTrack = async (event: GeoEvent) => {
      const meta = event.metadata as Record<string, unknown>;
      const icao24 = (meta?.icao24 ?? meta?.hex ?? "") as string;
      const callsign = ((meta?.callsign ?? meta?.flight ?? "") as string).trim();
      const color = TRACK_COLORS[event.source_id] ?? "#29b6f6";

      if (!icao24) {
        renderTrack(syntheticTrack(event), color);
        return;
      }

      // Check cache
      const cacheKey = icao24.toLowerCase();
      const cached = flightTrackCacheRef.current.get(cacheKey);
      if (cached) {
        renderTrack(cached, color);
      } else {
        // Show synthetic track immediately while API loads
        renderTrack(syntheticTrack(event), color);

        try {
          const token = localStorage.getItem("access_token") ?? "";
          const r = await fetch(`/api/v1/events/aircraft/${encodeURIComponent(icao24)}/track`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (r.ok && !cancelled) {
            const data = await r.json();
            const waypoints = data.waypoints as Array<{ lat: number; lng: number }>;
            if (waypoints?.length) {
              const coords: [number, number][] = waypoints.map((wp) => [wp.lng, wp.lat]);
              flightTrackCacheRef.current.set(cacheKey, coords);
              setTimeout(() => flightTrackCacheRef.current.delete(cacheKey), 120_000);
              if (!cancelled) renderTrack(coords, color);
            }
          }
        } catch {
          // API unavailable — synthetic track already displayed
        }
      }

      // Fetch route (origin/destination) and draw destination arc
      // Skip for military sources — their callsigns aren't in OpenSky's routes DB
      const skipRoute = new Set(["adsb_lol", "vip_aircraft", "bomber_isr", "emergency_squawks"]);
      if (callsign && !skipRoute.has(event.source_id)) {
        try {
          const token = localStorage.getItem("access_token") ?? "";
          const r = await fetch(`/api/v1/events/aircraft/${encodeURIComponent(callsign)}/route`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (r.ok && !cancelled) {
            const route = await r.json();
            const dest = route.destination as { lat?: number; lng?: number } | null;
            if (dest?.lat != null && dest?.lng != null) {
              const arc = greatCircleArc(event.lng, event.lat, dest.lng, dest.lat);
              renderDestLine(arc, "#00e676"); // green dashed line to destination
            }
          }
        } catch {
          // Route lookup unavailable
        }
      }
    };

    // React to selection changes
    const update = () => {
      const sel = useEventStore.getState().selectedEvent;
      if (!sel || !AVIATION_SOURCES.has(sel.source_id)) {
        clearTrack();
        clearDestLine();
        return;
      }
      fetchTrack(sel);
    };

    update();
    let prev = useEventStore.getState().selectedEvent;
    const unsub = useEventStore.subscribe((state) => {
      if (state.selectedEvent !== prev) {
        prev = state.selectedEvent;
        update();
      }
    });

    map.on("style.load", update);
    return () => { cancelled = true; unsub(); map.off("style.load", update); };
  }, [AVIATION_SOURCES, TRACK_COLORS]);

  // ── Annotation spotlight: fly to annotation when clicked in sidebar ─────
  const spotlightId = usePlanStore((s) => s.spotlightAnnotationId);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !spotlightId) return;
    const ann = planAnnotations.find((a) => a.id === spotlightId);
    if (!ann?.geom_json) return;
    const geom = ann.geom_json as Record<string, unknown>;
    let center: [number, number] | null = null;
    if (geom.type === "Point" && Array.isArray(geom.coordinates)) {
      center = geom.coordinates as [number, number];
    } else if (geom.type === "Polygon" && Array.isArray(geom.coordinates)) {
      const ring = (geom.coordinates as number[][][])[0];
      if (ring?.length) {
        const avg = ring.reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1]], [0, 0]);
        center = [avg[0] / ring.length, avg[1] / ring.length];
      }
    } else if (geom.type === "LineString" && Array.isArray(geom.coordinates)) {
      const coords = geom.coordinates as number[][];
      const mid = coords[Math.floor(coords.length / 2)];
      if (mid) center = [mid[0], mid[1]];
    }
    if (center) {
      map.flyTo({ center, zoom: Math.max(map.getZoom(), 8), duration: 800 });
    }
    usePlanStore.getState().setSpotlightAnnotation(null);
  }, [spotlightId, planAnnotations]);

  // ── Collab: broadcast cursor + viewport on mouse/map events ─────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !collabConnected) return;

    let lastCursorSend = 0;
    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      const now = Date.now();
      if (now - lastCursorSend < 60) return; // throttle ~16fps
      lastCursorSend = now;
      useCollabStore.getState()._sendCursor?.(e.lngLat.lng, e.lngLat.lat);
    };

    const handleMoveEnd = () => {
      const center = map.getCenter();
      useCollabStore.getState()._sendViewport?.([center.lng, center.lat], map.getZoom());
    };

    map.on("mousemove", handleMouseMove);
    map.on("moveend", handleMoveEnd);
    // Send initial viewport
    handleMoveEnd();
    return () => {
      map.off("mousemove", handleMouseMove);
      map.off("moveend", handleMoveEnd);
    };
  }, [collabConnected]);

  // ── Collab: render remote user cursors as colored named markers ────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const existing = remoteCursorMarkers.current;
    const activeIds = new Set<string>();

    remoteUsers.forEach((user) => {
      if (!user.cursor) return;
      activeIds.add(user.userId);

      if (existing.has(user.userId)) {
        existing.get(user.userId)!.setLngLat([user.cursor.lng, user.cursor.lat]);
      } else {
        const el = document.createElement("div");
        el.style.cssText = "pointer-events:none;display:flex;flex-direction:column;align-items:center;";
        const dot = document.createElement("div");
        dot.style.cssText = `width:12px;height:12px;border-radius:50%;background:${user.color};border:2px solid #fff;box-shadow:0 0 6px ${user.color}88;`;
        const label = document.createElement("div");
        label.style.cssText = `margin-top:2px;padding:1px 5px;border-radius:3px;background:${user.color};color:#000;font-size:9px;font-weight:700;white-space:nowrap;`;
        label.textContent = user.name;
        el.appendChild(dot);
        el.appendChild(label);

        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([user.cursor.lng, user.cursor.lat])
          .addTo(map);
        existing.set(user.userId, marker);
      }
    });

    // Remove stale cursors
    existing.forEach((marker, id) => {
      if (!activeIds.has(id)) {
        marker.remove();
        existing.delete(id);
      }
    });
  }, [remoteUsers]);

  // ── Collab: focus following — mirror followed user's viewport ──────────
  const followedViewportRef = useRef(followedViewport);
  followedViewportRef.current = followedViewport;
  useEffect(() => {
    const map = mapRef.current;
    const vp = followedViewportRef.current;
    if (!map || !vp) return;
    map.flyTo({ center: vp.center, zoom: vp.zoom, duration: 600 });
    useCollabStore.getState()._setFollowedViewport(null);
  }, [followedViewport]);

  // ── Collab: layer sync — apply incoming presenter's layer state ────────
  const pendingLayerSyncRef = useRef(pendingLayerSync);
  pendingLayerSyncRef.current = pendingLayerSync;
  useEffect(() => {
    const sync = pendingLayerSyncRef.current;
    if (!sync) return;
    const store = useLayoutStore.getState();
    sync.forEach((l) => store.setLayerVisible(l.id, l.enabled));
    useCollabStore.getState()._setPendingLayerSync(null);
  }, [pendingLayerSync]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />

      {/* Drawing mode banner */}
      {drawingMode && (
        <div style={{
          position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 20,
          background: "rgba(255,170,0,.9)", color: "#000", padding: "6px 16px",
          borderRadius: 4, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 8,
        }}>
          <span>Click map to place {drawingMode.type.replace("_", " ")}</span>
          <button
            onClick={() => usePlanStore.getState().setDrawingMode(null)}
            style={{ background: "rgba(0,0,0,.2)", border: "none", borderRadius: 3, color: "#000", padding: "2px 8px", fontSize: 10, cursor: "pointer", fontWeight: 700 }}
          >
            ESC
          </button>
        </div>
      )}

      {/* Following banner */}
      {followingUserId && (() => {
        const target = remoteUsers.find((u) => u.userId === followingUserId);
        return target ? (
          <div style={{
            position: "absolute", top: drawingMode ? 46 : 8, left: "50%", transform: "translateX(-50%)", zIndex: 20,
            background: `${target.color}dd`, color: "#000", padding: "5px 14px",
            borderRadius: 4, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 8,
          }}>
            <span>Following {target.name}</span>
            <button
              onClick={() => useCollabStore.getState().setFollowing(null)}
              style={{ background: "rgba(0,0,0,.2)", border: "none", borderRadius: 3, color: "#000", padding: "2px 8px", fontSize: 10, cursor: "pointer", fontWeight: 700 }}
            >
              Detach
            </button>
          </div>
        ) : null;
      })()}

      {/* Search / Jump To */}
      <MapSearch onJump={(lng, lat, zoom) => {
        mapRef.current?.flyTo({ center: [lng, lat], zoom: zoom ?? 10, duration: 1000 });
      }} events={events} />

      {/* Live event count */}
      {events.length > 0 && (
        <div style={{
          position: "absolute", top: 44, left: 8, zIndex: 10,
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

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          style={{
            position: "absolute", left: contextMenu.x, top: contextMenu.y, zIndex: 50,
            background: "var(--bg-panel, #0a0e1a)", border: "1px solid var(--border, #1e2a3a)",
            borderRadius: 6, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,.65)", minWidth: 180,
          }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <div style={{ padding: "6px 12px", fontSize: 10, color: "var(--text-muted)", borderBottom: "1px solid var(--border, #1e2a3a)", fontFamily: "var(--font-mono, monospace)" }}>
            {contextMenu.lngLat.lat.toFixed(4)}°, {contextMenu.lngLat.lng.toFixed(4)}°
          </div>
          <button onClick={handleCopyCoords} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "none", cursor: "pointer", background: "transparent", color: "var(--text-secondary, #8899aa)", fontSize: 12, textAlign: "left" }}>
            📋 Copy Coordinates
          </button>
          <button onClick={handleNearbyEvents} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "none", cursor: "pointer", background: "transparent", color: "var(--text-secondary, #8899aa)", fontSize: 12, textAlign: "left" }}>
            🔍 Nearest Event
          </button>
          <button onClick={() => setContextMenu(null)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "none", cursor: "pointer", background: "transparent", color: "var(--text-secondary, #8899aa)", fontSize: 12, textAlign: "left", borderTop: "1px solid var(--border, #1e2a3a)" }}>
            ✕ Close
          </button>
        </div>
      )}

      {/* ── Left-side map controls ────────────────────────────────────── */}
      <MapControls
        mapRef={mapRef}
        isGlobe={isGlobe}
        setIsGlobe={setIsGlobe}
        styleKey={styleKey}
        setStyleKey={setStyleKey}
        measuring={measuring}
        setMeasuring={(v) => { setMeasuring(v); if (v) setMeasurePts([]); }}
        measurePts={measurePts}
        measureDistance={measureDistance}
      />
    </div>
  );
}

// ── Left-side map controls (globe opacity, projection, measure, basemap) ─────

const _ctrlBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 4, cursor: "pointer",
  background: "var(--bg-panel, #0a0e1a)",
  border: "1px solid var(--border, #1e2a3a)",
  fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
  transition: "all 150ms",
};

function MapControls({
  mapRef,
  isGlobe, setIsGlobe,
  styleKey, setStyleKey,
  measuring, setMeasuring,
  measurePts,
  measureDistance,
}: {
  mapRef: React.RefObject<maplibregl.Map | null>;
  isGlobe: boolean;
  setIsGlobe: (v: boolean) => void;
  styleKey: string;
  setStyleKey: (v: string) => void;
  measuring: boolean;
  setMeasuring: (v: boolean) => void;
  measurePts: [number, number][];
  measureDistance: { km: number; mi: number } | null;
}) {
  const [styleOpen, setStyleOpen] = useState(false);
  const [globeOpen, setGlobeOpen] = useState(false);
  const [basemapOpacity, setBasemapOpacity] = useState(100);
  const [autoRotate, setAutoRotate] = useState(false);
  const [rotateSpeed, setRotateSpeed] = useState(50); // 1–100 slider
  const [rotateDirection, setRotateDirection] = useState<1 | -1>(1); // 1=east, -1=west
  const [showAtmosphere, setShowAtmosphere] = useState(true);
  const [fogRange, setFogRange] = useState(50);
  const [markerScale, setMarkerScale] = useState(100);
  const autoRotateRef = useRef(false);
  const rotateSpeedRef = useRef(50);
  const rotateDirectionRef = useRef<1 | -1>(1);

  // Our custom layer IDs — excluded from basemap opacity adjustment
  const OUR_LAYERS = useRef(new Set([
    "sat-track-lines", "sat-track-lines-iss",
    "flight-heading-lines", "flight-track-highlight-glow", "flight-track-highlight-line", "flight-destination-line",
    "entity-trail-lines", "entity-trail-dots",
    "cluster-circles", "cluster-count",
  ]));

  // Apply basemap opacity — works on both raster and vector layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const op = basemapOpacity / 100;
      const style = map.getStyle();
      if (!style?.layers) return;
      for (const layer of style.layers) {
        const id = layer.id;
        // Skip our custom layers and any geojson layers we added
        if (OUR_LAYERS.current.has(id) || id.startsWith("geojson-") || id.startsWith("tile-")) continue;
        try {
          if (layer.type === "raster") {
            map.setPaintProperty(id, "raster-opacity", op);
          } else if (layer.type === "fill") {
            map.setPaintProperty(id, "fill-opacity", op);
          } else if (layer.type === "line") {
            map.setPaintProperty(id, "line-opacity", op);
          } else if (layer.type === "symbol") {
            map.setPaintProperty(id, "icon-opacity", op);
            map.setPaintProperty(id, "text-opacity", op);
          } else if (layer.type === "background") {
            map.setPaintProperty(id, "background-opacity", op);
          }
        } catch { /* some paint properties may not be settable */ }
      }
    };
    if (map.isStyleLoaded()) apply();
    map.on("style.load", apply);
    return () => { map.off("style.load", apply); };
  }, [basemapOpacity, mapRef]);

  // Auto-rotate in globe mode — use easeTo chaining for smooth rotation
  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);
  useEffect(() => {
    rotateSpeedRef.current = rotateSpeed;
  }, [rotateSpeed]);
  useEffect(() => {
    rotateDirectionRef.current = rotateDirection;
  }, [rotateDirection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isGlobe || !autoRotate) return;
    let cancelled = false;

    const spin = () => {
      if (cancelled || !autoRotateRef.current) return;
      const center = map.getCenter();
      // Speed: map 1–100 slider to 5–60 degrees per step
      const degrees = 5 + (rotateSpeedRef.current / 100) * 55;
      // Duration: faster speed = shorter duration (smoother feel)
      const duration = Math.max(1500, 6000 - (rotateSpeedRef.current / 100) * 4500);
      map.easeTo({
        center: [center.lng + degrees * rotateDirectionRef.current, center.lat],
        duration,
        easing: (t: number) => t, // linear
      });
    };

    map.on("moveend", spin);
    const timer = setTimeout(spin, 50);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      map.off("moveend", spin);
      map.stop();
    };
  }, [isGlobe, autoRotate, mapRef]);

  // Stop auto-rotate on user drag/wheel interaction
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const stop = () => { setAutoRotate(false); };
    map.on("dragstart", stop);
    map.on("wheel", stop);
    return () => { map.off("dragstart", stop); map.off("wheel", stop); };
  }, [mapRef]);

  // Sky / atmosphere control for globe mode (MapLibre uses setSky, not setFog)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (isGlobe && showAtmosphere) {
        try {
          map.setSky({
            "sky-color": "#0a1628",
            "horizon-color": `rgba(20, 40, 80, ${fogRange / 100 * 0.6 + 0.1})`,
            "fog-color": `rgba(10, 14, 26, ${fogRange / 100 * 0.7 + 0.1})`,
            "fog-ground-blend": fogRange / 100 * 0.5,
            "horizon-fog-blend": fogRange / 100 * 0.8 + 0.1,
            "sky-horizon-blend": 0.5,
            "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 12, 0],
          } as any);
        } catch { /* sky spec may vary across versions */ }
      } else {
        try { map.setSky({} as any); } catch {}
      }
    };
    if (map.isStyleLoaded()) apply();
    map.on("style.load", apply);
    return () => { map.off("style.load", apply); };
  }, [isGlobe, showAtmosphere, fogRange, mapRef]);

  // Marker scale — apply via CSS variable to all .m-marker elements
  useEffect(() => {
    document.documentElement.style.setProperty("--marker-scale", String(markerScale / 100));
  }, [markerScale]);

  const activeColor = "var(--green-primary, #00e676)";
  const mutedColor = "var(--text-secondary, #8899aa)";

  return (
    <div style={{
      position: "absolute", bottom: 8, left: 8, zIndex: 10,
      display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start",
    }}>
      {/* Expanded globe / map settings panel */}
      {globeOpen && (
        <div style={{
          width: 200, background: "var(--bg-panel, #0a0e1a)",
          border: "1px solid var(--border, #1e2a3a)",
          borderRadius: 6, overflow: "hidden",
          boxShadow: "0 4px 24px rgba(0,0,0,.65)",
          marginBottom: 4,
        }}>
          <div style={{
            padding: "6px 10px", borderBottom: "1px solid var(--border, #1e2a3a)",
            fontSize: 10, fontWeight: 700, color: mutedColor,
            letterSpacing: "0.06em", display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            MAP CONTROLS
            <button onClick={() => setGlobeOpen(false)} style={{
              background: "none", border: "none", cursor: "pointer",
              color: mutedColor, fontSize: 12, padding: "0 2px",
            }}>✕</button>
          </div>

          {/* Basemap brightness — dims the map so markers/tracks pop */}
          <ControlRow label="Map Brightness" value={`${basemapOpacity}%`}>
            <input
              type="range" min={10} max={100} value={basemapOpacity}
              onChange={(e) => setBasemapOpacity(Number(e.target.value))}
              style={{ width: "100%", accentColor: activeColor, height: 4 }}
            />
          </ControlRow>

          {/* Marker size */}
          <ControlRow label="Marker Scale" value={`${markerScale}%`}>
            <input
              type="range" min={50} max={200} step={10} value={markerScale}
              onChange={(e) => setMarkerScale(Number(e.target.value))}
              style={{ width: "100%", accentColor: activeColor, height: 4 }}
            />
          </ControlRow>

          {/* Globe-only controls */}
          {isGlobe && (
            <>
              <div style={{ borderTop: "1px solid var(--border, #1e2a3a)" }} />

              <ControlToggle
                label="Sky & Atmosphere"
                icon="🌫"
                active={showAtmosphere}
                onToggle={() => setShowAtmosphere((v) => !v)}
              />

              {showAtmosphere && (
                <ControlRow label="Atmosphere Blend" value={`${fogRange}%`}>
                  <input
                    type="range" min={10} max={100} value={fogRange}
                    onChange={(e) => setFogRange(Number(e.target.value))}
                    style={{ width: "100%", accentColor: activeColor, height: 4 }}
                  />
                </ControlRow>
              )}

              <ControlToggle
                label="Auto Rotate"
                icon="🔄"
                active={autoRotate}
                onToggle={() => setAutoRotate((v) => !v)}
              />

              {autoRotate && (
                <>
                  <ControlRow label="Rotation Speed" value={`${rotateSpeed}%`}>
                    <input
                      type="range" min={1} max={100} value={rotateSpeed}
                      onChange={(e) => setRotateSpeed(Number(e.target.value))}
                      style={{ width: "100%", accentColor: activeColor, height: 4 }}
                    />
                  </ControlRow>

                  <div style={{
                    display: "flex", gap: 4, padding: "4px 10px",
                  }}>
                    <button
                      onClick={() => setRotateDirection(-1)}
                      style={{
                        ..._ctrlBtn, flex: 1, height: 24, fontSize: 10, fontWeight: 600,
                        border: `1px solid ${rotateDirection === -1 ? activeColor : "var(--border, #1e2a3a)"}`,
                        color: rotateDirection === -1 ? activeColor : mutedColor,
                      }}
                    >← West</button>
                    <button
                      onClick={() => setRotateDirection(1)}
                      style={{
                        ..._ctrlBtn, flex: 1, height: 24, fontSize: 10, fontWeight: 600,
                        border: `1px solid ${rotateDirection === 1 ? activeColor : "var(--border, #1e2a3a)"}`,
                        color: rotateDirection === 1 ? activeColor : mutedColor,
                      }}
                    >East →</button>
                  </div>
                </>
              )}
            </>
          )}

          {/* Zoom controls */}
          <div style={{
            display: "flex", gap: 4, padding: "6px 10px",
            borderTop: "1px solid var(--border, #1e2a3a)",
          }}>
            <button onClick={() => mapRef.current?.zoomIn()} title="Zoom in" style={{
              ..._ctrlBtn, width: "100%", height: 26, fontSize: 16,
            }}>+</button>
            <button onClick={() => mapRef.current?.zoomOut()} title="Zoom out" style={{
              ..._ctrlBtn, width: "100%", height: 26, fontSize: 16,
            }}>−</button>
            <button onClick={() => mapRef.current?.flyTo({ center: [0, 20], zoom: 2.2, duration: 800 })} title="Reset view" style={{
              ..._ctrlBtn, width: "100%", height: 26, fontSize: 11,
            }}>⌂</button>
          </div>
        </div>
      )}

      {/* Measure readout */}
      {measuring && (
        <div style={{
          background: "rgba(10,14,26,.9)", border: "1px solid var(--border, #1e2a3a)",
          borderRadius: 4, padding: "6px 10px", fontSize: 11, color: mutedColor,
          marginBottom: 2,
        }}>
          {measurePts.length === 0 && "Click first point"}
          {measurePts.length === 1 && "Click second point"}
          {measureDistance && (
            <span style={{ fontFamily: "var(--font-mono, monospace)", color: activeColor }}>
              {measureDistance.km.toFixed(1)} km / {measureDistance.mi.toFixed(1)} mi
            </span>
          )}
        </div>
      )}

      {/* Button toolbar */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {/* Settings panel toggle */}
        <button
          onClick={() => setGlobeOpen((o) => !o)}
          title="Map controls"
          style={{
            ..._ctrlBtn,
            border: `1px solid ${globeOpen ? activeColor : "var(--border, #1e2a3a)"}`,
            color: globeOpen ? activeColor : mutedColor,
            fontSize: 13,
          }}
        >
          ⚙
        </button>

        {/* Globe / Flat toggle */}
        <button
          onClick={() => setIsGlobe(!isGlobe)}
          title={isGlobe ? "Switch to flat map" : "Switch to 3D globe"}
          style={{
            ..._ctrlBtn,
            background: isGlobe ? "rgba(0,230,118,0.15)" : "var(--bg-panel, #0a0e1a)",
            border: `1px solid ${isGlobe ? activeColor : "var(--border, #1e2a3a)"}`,
            color: isGlobe ? activeColor : mutedColor,
            fontSize: 15, fontWeight: 700,
          }}
        >
          {isGlobe ? "🌍" : "🗺️"}
        </button>

        {/* Measure tool */}
        <button
          onClick={() => setMeasuring(!measuring)}
          title="Measure distance"
          style={{
            ..._ctrlBtn,
            border: `1px solid ${measuring ? activeColor : "var(--border, #1e2a3a)"}`,
            color: measuring ? activeColor : mutedColor,
          }}
        >
          📏
        </button>

        {/* Basemap style switcher */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setStyleOpen((o) => !o)}
            title="Change map style"
            style={{
              ..._ctrlBtn,
              color: styleOpen ? activeColor : mutedColor,
            }}
          >
            {MAP_STYLES[styleKey]?.icon ?? "🗺️"}
          </button>

          {styleOpen && (
            <div style={{
              position: "absolute", bottom: 0, left: 38, minWidth: 130,
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
                    onClick={() => { setStyleKey(key); setStyleOpen(false); }}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 8,
                      padding: "7px 12px", border: "none", cursor: "pointer",
                      textAlign: "left", fontSize: 12,
                      background: active ? "var(--bg-hover, #1e2a3a)" : "transparent",
                      color: active ? activeColor : mutedColor,
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
    </div>
  );
}

function ControlRow({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "6px 10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: "var(--text-secondary, #8899aa)" }}>{label}</span>
        <span style={{ fontSize: 10, fontFamily: "var(--font-mono, monospace)", color: "var(--green-primary, #00e676)" }}>{value}</span>
      </div>
      {children}
    </div>
  );
}

function ControlToggle({ label, icon, active, onToggle }: { label: string; icon: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 8,
        padding: "7px 10px", border: "none", cursor: "pointer",
        background: active ? "rgba(0,230,118,0.06)" : "transparent",
        textAlign: "left", fontSize: 11,
        color: active ? "var(--green-primary, #00e676)" : "var(--text-secondary, #8899aa)",
        transition: "all 150ms",
      }}
    >
      <span style={{ fontSize: 13 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{
        width: 28, height: 14, borderRadius: 7, position: "relative",
        background: active ? "rgba(0,230,118,0.3)" : "var(--border, #1e2a3a)",
        transition: "background 200ms",
      }}>
        <span style={{
          position: "absolute", top: 2, left: active ? 14 : 2,
          width: 10, height: 10, borderRadius: "50%",
          background: active ? "var(--green-primary, #00e676)" : "var(--text-muted, #4a6a4a)",
          transition: "left 200ms",
        }} />
      </span>
    </button>
  );
}

// ── Map Search / Jump To ─────────────────────────────────────────────────────

function MapSearch({ onJump, events }: { onJump: (lng: number, lat: number, zoom?: number) => void; events: GeoEvent[] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ label: string; lng: number; lat: number; zoom?: number; type: "event" | "place" }[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }

    // 1. Match events by title
    const eventMatches = events
      .filter((e) => e.title.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 5)
      .map((e) => ({ label: e.title, lng: e.lng, lat: e.lat, zoom: 8, type: "event" as const, event: e }));

    // 2. Check for coordinate format (lat, lng)
    const coordMatch = q.match(/^\s*(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)\s*$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        setResults([{ label: `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`, lng, lat, zoom: 10, type: "place" }, ...eventMatches]);
        return;
      }
    }

    // 3. Geocode with Nominatim
    const geoResults: typeof results = [];
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=3&q=${encodeURIComponent(q)}`, {
        headers: { "Accept": "application/json" },
      });
      if (resp.ok) {
        const data = await resp.json();
        for (const r of data) {
          geoResults.push({ label: r.display_name.slice(0, 60), lng: parseFloat(r.lon), lat: parseFloat(r.lat), zoom: 10, type: "place" });
        }
      }
    } catch {}

    setResults([...eventMatches, ...geoResults]);
  }, [events]);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleInput = (val: string) => {
    setQuery(val);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  const handleSelect = (r: typeof results[0] & { event?: GeoEvent }) => {
    if (r.type === "event" && r.event) {
      setSelectedEvent(r.event);
    } else {
      onJump(r.lng, r.lat, r.zoom);
    }
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  return (
    <div style={{ position: "absolute", top: 8, left: 8, zIndex: 15, width: 280 }}>
      <input
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => { if (results.length) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="Search places, events, coordinates…"
        style={{
          width: "100%", padding: "6px 10px", borderRadius: 4, fontSize: 12,
          background: "rgba(10,14,26,.9)", border: "1px solid var(--border, #1e2a3a)",
          color: "var(--text-primary, #e0e6ed)", outline: "none",
          fontFamily: "inherit",
        }}
      />
      {open && results.length > 0 && (
        <div style={{
          marginTop: 2, background: "var(--bg-panel, #0a0e1a)", border: "1px solid var(--border, #1e2a3a)",
          borderRadius: 6, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,.5)", maxHeight: 240, overflowY: "auto",
        }}>
          {results.map((r, i) => (
            <button key={i} onMouseDown={() => handleSelect(r)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
              background: "transparent", border: "none", borderBottom: "1px solid var(--border, #1e2a3a)",
              cursor: "pointer", textAlign: "left", color: "var(--text-secondary, #8899aa)", fontSize: 11,
            }}>
              <span style={{ fontSize: 12, flexShrink: 0 }}>{r.type === "event" ? "●" : "📍"}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
