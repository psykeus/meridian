import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { useEventStore } from "@/stores/useEventStore";
import { useFilteredEvents } from "@/stores/useFilteredEvents";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { ALL_LAYERS } from "@/config/layers";
import { SEVERITY_COLOR, CATEGORY_ICON } from "@/lib/utils";
import type { GeoEvent } from "@/types";

const MAP_STYLES: Record<string, string> = {
  "carto-dark": "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  "carto-light": "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  "openfreemap": "https://tiles.openfreemap.org/styles/liberty",
};

const DEFAULT_STYLE = "carto-dark";

export function MeridianMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const allEvents = useFilteredEvents();
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);
  const activeLayers = useLayoutStore((s) => s.activeLayers);

  const activeSourceIds = new Set(
    ALL_LAYERS.filter((l) => activeLayers.has(l.id)).flatMap((l) => l.sourceIds)
  );

  const events = allEvents.filter((e) => activeSourceIds.has(e.source_id));

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLES[DEFAULT_STYLE],
      center: [0, 20],
      zoom: 2.2,
      minZoom: 1,
      maxZoom: 18,
      attributionControl: false,
    });

    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  const createMarkerEl = useCallback((event: GeoEvent): HTMLElement => {
    const el = document.createElement("div");
    const color = SEVERITY_COLOR[event.severity] ?? "#448aff";
    const icon = CATEGORY_ICON[event.category] ?? "●";

    el.style.cssText = `
      width: 24px; height: 24px;
      border-radius: 50%;
      background: ${color}22;
      border: 1.5px solid ${color};
      display: flex; align-items: center; justify-content: center;
      font-size: 11px;
      cursor: pointer;
      transition: transform 150ms;
    `;
    el.textContent = icon;
    el.title = event.title;

    el.addEventListener("mouseenter", () => { el.style.transform = "scale(1.3)"; });
    el.addEventListener("mouseleave", () => { el.style.transform = "scale(1)"; });
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      setSelectedEvent(event);
    });

    return el;
  }, [setSelectedEvent]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const existing = markersRef.current;

    const incoming = new Set(events.map((e) => e.id));

    existing.forEach((marker, id) => {
      if (!incoming.has(id)) {
        marker.remove();
        existing.delete(id);
      }
    });

    events.forEach((event) => {
      if (existing.has(event.id)) return;
      if (!isFinite(event.lat) || !isFinite(event.lng)) return;

      const marker = new maplibregl.Marker({ element: createMarkerEl(event) })
        .setLngLat([event.lng, event.lat])
        .addTo(map);

      existing.set(event.id, marker);
    });
  }, [events, createMarkerEl]);

  return (
    <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />
  );
}
