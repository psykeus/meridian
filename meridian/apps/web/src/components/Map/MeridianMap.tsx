import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import { useEventStore } from "@/stores/useEventStore";
import { useFilteredEvents } from "@/stores/useFilteredEvents";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { ALL_LAYERS } from "@/config/layers";
import type { GeoEvent } from "@/types";
import { getEntityKey, usePlanTrackingStore } from "@/stores/usePlanTrackingStore";
import { usePlanStore } from "@/stores/usePlanStore";
import { useCollabStore } from "@/hooks/useCollabSocket";

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

const CLUSTER_ZOOM_THRESHOLD = 7; // Below this zoom, show clusters; above, show DOM markers

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
  const [currentZoom, setCurrentZoom] = useState(2.2);

  const [styleKey,    setStyleKey]    = useState("dark");
  const [panelOpen,   setPanelOpen]   = useState(false);

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

    map.on("zoomend", () => setCurrentZoom(map.getZoom()));

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
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
      .filter((e) => isFinite(e.lat) && isFinite(e.lng))
      .map((e) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [e.lng, e.lat] },
        properties: { id: e.id, severity: e.severity, source_id: e.source_id },
      }));

    src.setData({ type: "FeatureCollection", features });
  }, [events]);

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

  // ── Fly to event on selection ─────────────────────────────────────────
  const selectedEvent = useEventStore((s) => s.selectedEvent);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedEvent) return;
    map.flyTo({
      center: [selectedEvent.lng, selectedEvent.lat],
      zoom: Math.max(map.getZoom(), 5),
      duration: 800,
    });
  }, [selectedEvent]);

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
      transition: scale 120ms, box-shadow 120ms;
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
  const showDomMarkers = currentZoom >= CLUSTER_ZOOM_THRESHOLD;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const existing = markersRef.current;

    // Below cluster threshold: hide all DOM markers, let cluster layers handle display
    if (!showDomMarkers) {
      existing.forEach((marker) => marker.getElement().style.display = "none");
      // Still update positions for tracked entities
      events.forEach((event) => {
        if (!isFinite(event.lat) || !isFinite(event.lng)) return;
        const key = getEntityKey(event);
        if (isTracked(key)) updateEntityPosition(key, event);
      });
      return;
    }

    // Above threshold: show DOM markers
    const incomingKeys = new Set(events.map(getEntityKey));

    existing.forEach((marker, key) => {
      if (!incomingKeys.has(key)) { marker.remove(); existing.delete(key); }
      else { marker.getElement().style.display = ""; }
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
  }, [events, createMarkerEl, isTracked, updateEntityPosition, showDomMarkers]);

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
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !followedViewport) return;
    map.flyTo({ center: followedViewport.center, zoom: followedViewport.zoom, duration: 600 });
    useCollabStore.getState()._setFollowedViewport(null);
  }, [followedViewport]);

  // ── Collab: layer sync — apply incoming presenter's layer state ────────
  useEffect(() => {
    if (!pendingLayerSync) return;
    const store = useLayoutStore.getState();
    pendingLayerSync.forEach((l) => store.setLayerVisible(l.id, l.enabled));
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
