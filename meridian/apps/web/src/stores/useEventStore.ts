import { create } from "zustand";
import type { FeedCategory, GeoEvent, SeverityLevel } from "@/types";

const MAX_EVENTS = 10000;

// ── Trail tracking for aviation/maritime entities ──────────────────────────
export interface TrailPoint {
  lat: number;
  lng: number;
  time: number; // epoch ms
  /** Full event snapshot at time of call-in */
  event: GeoEvent;
}

const MAX_TRAIL_POINTS = 60;  // per entity
const MAX_TRAIL_ENTITIES = 600;

// Sources whose events represent moving entities with position updates
const TRAIL_SOURCES = new Set([
  "adsb_lol", "opensky", "emergency_squawks", "vip_aircraft", "bomber_isr",
  "flightaware", "aishub", "naval_mmsi", "aisstream",
]);

/** Extract a stable entity key from an event (hex code for aircraft, MMSI for vessels). */
function entityKeyForTrail(e: GeoEvent): string | null {
  if (!TRAIL_SOURCES.has(e.source_id)) return null;
  const m = e.metadata as Record<string, unknown>;
  // Aviation: icao24 hex code
  if (m?.icao24) return `${e.source_id}:${m.icao24}`;
  if (m?.hex) return `${e.source_id}:${m.hex}`;
  // FlightAware: fa_flight_id
  if (m?.fa_flight_id) return `${e.source_id}:${m.fa_flight_id}`;
  // Maritime: MMSI
  if (m?.mmsi) return `${e.source_id}:${m.mmsi}`;
  // Fallback: callsign
  if (m?.callsign) return `${e.source_id}:${m.callsign}`;
  return null;
}

interface EventFilters {
  categories: Set<FeedCategory>;
  severities: Set<SeverityLevel>;
  sourceIds: Set<string>;
  hoursBack: number;
}

interface EventStore {
  events: GeoEvent[];
  filters: EventFilters;
  selectedEvent: GeoEvent | null;
  isDrawerOpen: boolean;
  /** Set to trigger a map flyTo — consumed (nulled) by MeridianMap */
  flyToTarget: { lng: number; lat: number; zoom?: number } | null;

  /** Position trail history keyed by entity (e.g. "adsb_lol:ae1234") */
  trailHistory: Map<string, TrailPoint[]>;

  addEvents: (events: GeoEvent[]) => void;
  addEvent: (event: GeoEvent) => void;
  setSelectedEvent: (event: GeoEvent | null) => void;
  flyTo: (lng: number, lat: number, zoom?: number) => void;
  closeDrawer: () => void;
  setFilter: <K extends keyof EventFilters>(key: K, value: EventFilters[K]) => void;
  clearEvents: () => void;
  consumeFlyTo: () => void;

  getFilteredEvents: () => GeoEvent[];
}

/** Accumulate trail points from a batch of events (mutates trailHistory in place). */
function accumulateTrails(events: GeoEvent[], trailHistory: Map<string, TrailPoint[]>): void {
  for (const e of events) {
    const key = entityKeyForTrail(e);
    if (!key) continue;
    const pt: TrailPoint = { lat: e.lat, lng: e.lng, time: new Date(e.event_time).getTime(), event: e };
    let trail = trailHistory.get(key);
    if (!trail) {
      trail = [];
      trailHistory.set(key, trail);
    }
    // Don't add duplicate positions
    const last = trail[trail.length - 1];
    if (last && Math.abs(last.lat - pt.lat) < 0.0001 && Math.abs(last.lng - pt.lng) < 0.0001) continue;
    trail.push(pt);
    if (trail.length > MAX_TRAIL_POINTS) trail.shift();
  }
  // Evict oldest entities if over limit
  if (trailHistory.size > MAX_TRAIL_ENTITIES) {
    const entries = [...trailHistory.entries()];
    entries.sort((a, b) => {
      const aLast = a[1][a[1].length - 1]?.time ?? 0;
      const bLast = b[1][b[1].length - 1]?.time ?? 0;
      return aLast - bLast;
    });
    const toRemove = entries.slice(0, entries.length - MAX_TRAIL_ENTITIES);
    for (const [k] of toRemove) trailHistory.delete(k);
  }
}

/**
 * For trail-tracked sources, deduplicate events so only the latest position
 * per entity is kept as a marker event. Older positions are tracked in trailHistory.
 */
function deduplicateEntityEvents(events: GeoEvent[]): GeoEvent[] {
  // Track latest event per entity key for trail sources
  const latestByEntity = new Map<string, GeoEvent>();
  const result: GeoEvent[] = [];

  for (const e of events) {
    const key = entityKeyForTrail(e);
    if (!key) {
      result.push(e);
      continue;
    }
    const existing = latestByEntity.get(key);
    if (!existing || new Date(e.event_time).getTime() >= new Date(existing.event_time).getTime()) {
      latestByEntity.set(key, e);
    }
  }
  // Add only the latest event per entity
  result.push(...latestByEntity.values());
  return result;
}

export const useEventStore = create<EventStore>((set, get) => ({
  events: [],
  filters: {
    categories: new Set(),
    severities: new Set(),
    sourceIds: new Set(),
    hoursBack: 24,
  },
  selectedEvent: null,
  isDrawerOpen: false,
  flyToTarget: null,
  trailHistory: new Map(),

  addEvents: (incoming) =>
    set((state) => {
      // Accumulate trail points
      const trails = new Map(state.trailHistory);
      accumulateTrails(incoming, trails);

      const existingById = new Map(state.events.map((e) => [e.id, e]));
      for (const e of incoming) existingById.set(e.id, e);
      const allEvents = [...existingById.values()].slice(0, MAX_EVENTS);
      const deduped = deduplicateEntityEvents(allEvents);
      return { events: deduped, trailHistory: trails };
    }),

  addEvent: (event) =>
    set((state) => {
      const trails = new Map(state.trailHistory);
      accumulateTrails([event], trails);

      const idx = state.events.findIndex((e) => e.id === event.id);
      let updated: GeoEvent[];
      if (idx !== -1) {
        updated = [...state.events];
        updated[idx] = event;
      } else {
        updated = [event, ...state.events].slice(0, MAX_EVENTS);
      }
      const deduped = deduplicateEntityEvents(updated);
      return { events: deduped, trailHistory: trails };
    }),

  setSelectedEvent: (event) =>
    set({ selectedEvent: event, isDrawerOpen: event !== null }),

  flyTo: (lng, lat, zoom) =>
    set({ flyToTarget: { lng, lat, zoom } }),

  consumeFlyTo: () => set({ flyToTarget: null }),

  closeDrawer: () => set({ isDrawerOpen: false, selectedEvent: null }),

  setFilter: (key, value) =>
    set((state) => ({ filters: { ...state.filters, [key]: value } })),

  clearEvents: () => set({ events: [] }),

  getFilteredEvents: () => {
    const { events, filters } = get();
    const cutoff = new Date(Date.now() - filters.hoursBack * 3600 * 1000);

    return events.filter((e) => {
      if (new Date(e.event_time) < cutoff) return false;
      if (filters.categories.size > 0 && !filters.categories.has(e.category)) return false;
      if (filters.severities.size > 0 && !filters.severities.has(e.severity)) return false;
      if (filters.sourceIds.size > 0 && !filters.sourceIds.has(e.source_id)) return false;
      return true;
    });
  },
}));
